# SPEC-06: Weather System

## 1. State Machine

Weather is driven by a single continuous variable `weatherIntensity` ranging from 0.0 (sunny) through 1.0 (cloudy) to 2.0 (stormy).

### 1.1 Transition Logic
```
WEATHER_TRANSITION_RATE = 0.0083 units/second (~2 minutes per unit)
WEATHER_HOLD_MIN = 180 seconds (3 minutes)
WEATHER_HOLD_MAX = 480 seconds (8 minutes)

each frame:
    if weatherIntensity != targetIntensity:
        step = WEATHER_TRANSITION_RATE * delta * 120
        weatherIntensity moves toward target by step
    else:
        holdTimer += delta
        if holdTimer >= holdDuration:
            targetIntensity = random from {0, 1, 2} excluding current
            holdDuration = WEATHER_HOLD_MIN + random * (MAX - MIN)
            holdTimer = 0
```

### 1.2 URL Lock
`?weather=sunny|cloudy|rainy` or `?weather=0|1|2` locks weather at that intensity permanently.

### 1.3 Manual Control
- Keys 1/2/3 set target to 0/1/2
- VR A-button cycles forward: sunny → cloudy → rainy → sunny
- Manual selection holds for `WEATHER_HOLD_MAX + 60 + random * (MAX - MIN)` seconds

## 2. Derived Parameters

Given `w = weatherIntensity`:

| Parameter | w = 0 (Sunny) | w = 1 (Cloudy) | w = 2 (Stormy) | Formula |
|-----------|---------------|----------------|----------------|---------|
| cloudDensity | 0 | 0.8 | 0.9 | w≤1: w*0.8; w>1: 0.8+(w-1)*0.1 |
| cloudDarkness | 0 | 0.65 | 0.9 | w≤1: w*0.65; w>1: 0.65+(w-1)*0.25 |
| windMultiplier | 1.0 | 1.3 | 2.5 | w≤1: 1+w*0.3; w>1: 1.3+(w-1)*1.2 |
| fogMultiplier | 1.0 | 0.5 | 0.2 | w≤1: 1-w*0.5; w>1: 0.5-(w-1)*0.3 - snowReduction |
| rainIntensity | 0 | 0 | 1.0 | max(0, w-1) |
| lightDimming | 0 | 0.35 | 0.5 | w≤1: w*0.35; w>1: 0.35+(w-1)*0.15 |
| skyDarkening | 0 | 0.35 | 0.5 | same as lightDimming |
| starDimming | 0 | 1.0 | 1.0 | min(1, w) |
| waveAmplitude | 1.0 | 1.15 | 1.8 | w≤1: 1+w*0.15; w>1: 1.15+(w-1)*0.65 |

Snow fog reduction: `snowFog = snowBlend * (0.15 + clamp(w-1, 0, 1) * 0.25)`

## 3. Rain Particles

### 3.1 Particle System
- `RAIN_PARTICLE_COUNT = 5000`
- Cylindrical volume: radius `RAIN_RADIUS = 25m`, height `RAIN_HEIGHT = 20m`
- Active count: `min(count, floor(count * effectivePrecip * snowBoost))`
- Snow boost: `1 + snowBlend * (3.0 + stormFactor * 3.0)`

### 3.2 Particle Motion
- Base speed: `RAIN_SPEED_MIN(11) to RAIN_SPEED_MAX(16) m/s` downward
- Wind influence: `RAIN_WIND_INFLUENCE = 0.3`
- Snow speed multiplier: `lerp(1.0, lerp(0.12, 0.4, stormFactor), snowBlend)`
- Snow swirl: `strength = snowBlend * stormFactor * 3.5`
  - Primary: `sin/cos(t*1.7 + phase)` amplitude x strength
  - Turbulence: `sin/cos(t*3.1 + i*0.53)` x 0.4 x strength
- Canopy shelter: particles drip through at 1/13 rate

### 3.3 Snow Blending
```
snowBlend = clamp((terrainY - treelineY) / (snowStart - treelineY), 0, 1)
```
Above treeline, rain transitions to snow (larger, slower, swirling particles).

### 3.4 Rain Shader
Vertex: Rain = tall thin streaks (perspective-sized). Snow = soft round dots (bigger in storms).
```glsl
float rainSize = clamp(90.0 / max(1.0, -mvPos.z), 2.0, 45.0);
float snowBase = 40.0 + uStormIntensity * 30.0;
float snowSize = clamp(snowBase / max(1.0, -mvPos.z), 1.5, snowMax);
gl_PointSize = mix(rainSize, snowSize, uSnowBlend);
```

Fragment:
```glsl
// Rain: vertical streak shape. Snow: round dot
float xSq = c.x * c.x * mix(80.0, 6.0, vSnow);
float ySq = c.y * c.y * mix(0.8, 6.0, vSnow);
float core = exp(-dist * mix(3.0, 1.5, vSnow));
float distFade = 1.0 - smoothstep(8.0, mix(22.0, 30.0, vStorm*vSnow), vDepth);
float alpha = core * vOpacity * distFade * mix(0.7, mix(0.5, 0.85, vStorm), vSnow);
```

Color: `(0.7, 0.75, 0.85)`. Night dimming: `lerp(0.25, 1.0, clamp((sunElev + 0.05) / 0.15, 0, 1))`.

### 3.5 Canopy Sheltering
16x16 grid covering `RAIN_RADIUS x 2` area:
- Cell = 1.0 if `getTreeDensity(wx, wz) > 0.3`
- Updated when player moves >3m
- Player shelter = average of 3x3 cells at center
- Smoothed: `shelterFactor += (target - factor) * min(1, 1.5 * delta)`
- Canopy dampen for rain audio: `1 - shelterFactor * 0.6`

## 4. Lightning

### 4.1 Bolt Geometry
- Distance from player: `LIGHTNING_BOLT_MIN_DIST(60)` to `LIGHTNING_BOLT_MAX_DIST(200)m`
- Top: 60-90m above ground, Bottom: 1m above ground
- 12-16 main segments with up to 8m horizontal jitter (decreasing with height)
- 2-4 branch forks from random midpoints, 2-3 segments each

### 4.2 Flash Timing
- Lightning interval: `THUNDER_INTERVAL_MIN(6)` to `THUNDER_INTERVAL_MAX(18)` seconds
- Stretched by `(1 / rainIntensity)^2`
- Flash ramps up over ~40ms (2-3 frames) then decays
- Bolt opacity decay: `LIGHTNING_FLASH_DECAY(0.2) * 1.5`
- Flash brightness: `(0.7 + random * 0.3) * clamp(1.3 - dist/250, 0, 1)`

### 4.3 Thunder Audio
Delay = distance / 343 m/s (speed of sound).

5-layer procedural synthesis:
1. **Crack** (close < 100m only): Highpass 2000Hz noise, playback 1.8-2.3, gain 1.5, 150ms
2. **Main boom**: Lowpass 120-200Hz noise, playback 0.15-0.25, ramp up 150ms then 3.5s decay
3. **Body**: Bandpass 180-280Hz noise, playback 0.35-0.5, Q=0.5, 2.5s
4. **Rolling echoes**: 2-4 delayed repeats (0.8s + i x 0.6-1.4s), decreasing volume
5. **Sub-bass tail**: Sine 35-50Hz -> 20Hz over 6-8s

Convolver reverb: 5-second procedural impulse response with dual decay (`e^(-t*2.5) + e^(-t*0.5) * 0.4`), early reflection clusters.

## 5. Ground Wetness

```
if rainIntensity > 0.05:
    wetness += WETNESS_WET_RATE(0.0083) * delta * rainIntensity * 120
else:
    wetness -= WETNESS_DRY_RATE(0.0042) * delta * 120
wetness = clamp(wetness, 0, 1)
```
Full wet in ~2 minutes, full dry in ~4 minutes. Drives ground shader darkening and blue shift.

## 6. State Names
- `weatherIntensity < 0.5` -> "Clear"
- `0.5 <= weatherIntensity < 1.5` -> "Cloudy"
- `weatherIntensity >= 1.5` -> "Stormy"
