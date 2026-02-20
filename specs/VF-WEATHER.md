# VF-WEATHER — Weather System

**Version:** 1.0  
**Date:** 20 February 2026  
**Status:** Active  
**Purpose:** Weather state machine, transitions, rain particles, lightning, thunder, weather-driven parameter table, and integration with all other systems.  
**Dependencies:** VF-CONFIG, VF-ARCH, VF-ATMOSPHERE, VF-WATER, VF-AUDIO  

---

## 1. Weather State Machine

The weather system drives a single `weatherIntensity` float (0–2) that all other systems pull from each frame (see VF-ARCH §3).

```mermaid
stateDiagram-v2
    [*] --> Sunny: startup
    Sunny --> Transitioning_Up: holdTimer expired
    Transitioning_Up --> Cloudy: weatherIntensity reaches 1.0
    Cloudy --> Transitioning_Up2: holdTimer expired (50% chance)
    Cloudy --> Transitioning_Down: holdTimer expired (50% chance)
    Transitioning_Up2 --> Rainy: weatherIntensity reaches 2.0
    Transitioning_Down --> Sunny: weatherIntensity reaches 0.0
    Rainy --> Transitioning_Down2: holdTimer expired
    Transitioning_Down2 --> Cloudy: weatherIntensity reaches 1.0
    
    note right of Sunny: Hold 3-8 min
    note right of Cloudy: Hold 3-8 min
    note right of Rainy: Hold 3-8 min
    note left of Transitioning_Up: Rate: 0.0083/s (~2 min)
```

### 1.1 Full Update Pseudocode

```
function updateWeather(delta):
    // === State Machine ===
    holdTimer -= delta
    if holdTimer <= 0:
        // Pick next state (different from current)
        allStates = [0, 1, 2]  // sunny, cloudy, rainy
        candidates = allStates.filter(s => s != currentTarget)
        targetIntensity = randomChoice(candidates)
        holdTimer = random(WEATHER_HOLD_MIN, WEATHER_HOLD_MAX)  // 180-480s

    // === Intensity Ramping ===
    rate = WEATHER_TRANSITION_RATE  // 0.0083 units/second
    if weatherIntensity < targetIntensity:
        weatherIntensity = min(weatherIntensity + rate * delta, targetIntensity)
    elif weatherIntensity > targetIntensity:
        weatherIntensity = max(weatherIntensity - rate * delta, targetIntensity)

    // === Derived Parameters (every frame) ===
    wi = weatherIntensity  // 0.0 to 2.0

    // Interpolated parameters (0 → 1 → 2 maps to specific values)
    cloudDensity     = lerp3(wi, 0, 0.8, 0.9)
    cloudDarkness    = lerp3(wi, 0, 0.65, 0.9)
    windMultiplier   = lerp3(wi, 1.0, 1.3, 2.5)
    fogMultiplier    = lerp3(wi, 1.0, 0.65, 0.6)
    lightDimming     = lerp3(wi, 0, 0.35, 0.5)
    skyDarkening     = lerp3(wi, 0, 0.35, 0.5)
    starDimming      = clamp(wi, 0, 1)
    waveAmplitude    = lerp3(wi, 1.0, 1.15, 1.8)

    // Rain only above intensity 1.0
    rainIntensity = max(0, wi - 1.0)

    // Ground wetness (hysteresis: wets faster than it dries)
    if rainIntensity > 0:
        groundWetness += WETNESS_WET_RATE * rainIntensity * delta
    else:
        groundWetness -= WETNESS_DRY_RATE * delta
    groundWetness = clamp(groundWetness, 0, 1)

    // === Push to shader uniforms ===
    waterMaterial.uRainIntensity = rainIntensity
    waterMaterial.uWaveAmplitude = waveAmplitude
    groundMaterial.uWetness = groundWetness

// Helper: 3-value interpolation (0→a, 1→b, 2→c)
function lerp3(t, a, b, c):
    if t <= 1: return lerp(a, b, t)
    else: return lerp(b, c, t - 1)
```

## 2. Weather-Driven Parameter Table

| Parameter | Sunny (0) | Cloudy (1) | Rainy (2) | Formula |
|-----------|-----------|------------|-----------|---------|
| cloudDensity | 0 | 0.8 | 0.9 | lerp3 interpolated |
| cloudDarkness | 0 | 0.65 | 0.9 | lerp3 interpolated |
| windMultiplier | 1.0 | 1.3 | 2.5 | lerp3 interpolated |
| fogMultiplier | 1.0 | 0.65 | 0.6 | lerp3 interpolated |
| rainIntensity | 0 | 0 | 0→1 | max(0, intensity-1) |
| lightDimming | 0 | 0.35 | 0.5 | lerp3 interpolated |
| skyDarkening | 0 | 0.35 | 0.5 | lerp3 interpolated |
| starDimming | 0 | 1.0 | 1.0 | clamp(intensity, 0, 1) |
| waveAmplitude | 1.0 | 1.15 | 1.8 | lerp3 interpolated |
| groundWetness | 0 | 0 | wetting | +0.0083/s rain, -0.0042/s dry |

## 3. Rain Particles

Rain MUST use `Points` geometry with 5000 particles (RAIN_PARTICLE_COUNT) in a cylinder (radius 25m, height 20m) around the player.

**Per-particle**: random position within cylinder, fall speed 11–16 m/s (RAIN_SPEED_MIN/MAX), slight wind offset (RAIN_WIND_INFLUENCE = 0.3).

**Fragment shader**: Each point MUST be rendered as a hair-thin vertical streak:
```glsl
vec2 uv = gl_PointCoord - 0.5;
float xFade = exp(-uv.x * uv.x * 80.0);   // very tight horizontal (σ ≈ 0.08)
float yFade = exp(-uv.y * uv.y * 0.8);      // wide vertical (σ ≈ 0.79)
float alpha = xFade * yFade * 0.6;
gl_FragColor = vec4(0.7, 0.75, 0.85, alpha); // translucent blue-grey
```

Point size = 4–8px. The extreme X/Y ratio creates the thin-streak look.

> ⚠️ **Gotcha: Rain appearance.** Rain particles MUST NOT look like round dots or snowflakes. The fragment shader aspect ratio (~80:0.8) creates hair-thin vertical streaks. The colour MUST be translucent blue-grey, not white.

**Canopy sheltering**: Each raindrop MUST check if it's under a nearby tree canopy (simple distance check to tree positions in view). If under canopy, the drop MUST be respawned below the canopy at reduced density (35% pass-through).

**Snow transition**: Above `SNOWLINE_START` (24m), rain particles MUST slow (×0.3–0.5), turn white, get rounder (less X squeeze), and drift laterally more. In heavy storms above snowline, particle count SHOULD increase and visibility MUST drop dramatically.

## 4. Lightning

Lightning MUST occur during rain (intensity > 0.5). Flash cycle:

1. **Timer**: Random interval 6–18 seconds at full rain, stretched by `(1/rainIntensity)²`
2. **Flash**: Hemisphere light white burst at intensity 3.0, decaying exponentially over 0.2s
3. **Bolt visual**: 30% probability of visible bolt geometry

### 4.1 Lightning Bolt Geometry (when visible)

- Start: random position 200–900m away at altitude 80–120m
- 8–15 primary segments using random walk: each segment steps down 5–15m, laterally ±0.3 of step length
- 2–4 branch points: branch from primary at 50–80% of remaining length, with 4–8 segments each
- **Line material**: White (0xffffff), linewidth 2, opacity 1.0 → 0 over 0.25s
- Bolt geometry MUST be removed after fade-out

### 4.2 Thunder Delay

Thunder delay MUST equal `distance / 343` seconds (speed of sound). Volume MUST decrease with distance: `1.1 - distance/1000`. See VF-AUDIO §7 for the full 5-layer thunder synthesis chain.

## 5. Ground Wetness

Ground wetness MUST use hysteresis:
- **Wetting rate**: WETNESS_WET_RATE = 0.0083/s (~2 min to full wet)
- **Drying rate**: WETNESS_DRY_RATE = 0.0042/s (~4 min to full dry)
- Wetting is scaled by `rainIntensity`
- Wetness MUST be clamped to [0, 1]
- Wetness is passed to the ground shader as `uWetness` (see VF-TERRAIN §5.1)

## 6. Integration with Other Systems

Weather drives the following systems (all via pull, not push):

| System | Parameters Affected | Reference |
|--------|-------------------|-----------|
| Water | waveAmplitude, rainIntensity (ripples, storm-chop) | VF-WATER §2, §4.1 |
| Terrain | groundWetness (shader darkening) | VF-TERRAIN §5.1 |
| Atmosphere | cloudDensity, cloudDarkness, fogMultiplier, skyDarkening, starDimming, lightDimming | VF-ATMOSPHERE §1, §5, §6 |
| Wind | windMultiplier | VF-FOREST §4 |
| Audio | rainIntensity (rain layers, drips), thunder triggering | VF-AUDIO §6, §7 |
| Fireflies | suppressed by rain | VF-ATMOSPHERE §7 |
| Birds | suppressed by rain | VF-WILDLIFE §1 |
