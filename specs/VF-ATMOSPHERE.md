# VF-ATMOSPHERE — Atmosphere

**Version:** 1.0  
**Date:** 20 February 2026  
**Status:** Active  
**Purpose:** Sky dome, day/night cycle (astronomical sun/moon), stars (catalog, sidereal rotation), clouds (4 archetypes), fog, fireflies, and shooting stars.  
**Dependencies:** VF-CONFIG, VF-WEATHER  

---

## 1. Sky Dome

A sphere (radius 200m, 24×16 segments) rendered with `BackSide`, `renderOrder: -2`, custom ShaderMaterial:

```glsl
// 3-stop gradient: fog colour at horizon → sky bottom → sky top
float h = normalize(vWorldPosition - cameraPosition).y;
float t = max(0.0, h);
vec3 sky = mix(bottomColor, topColor, smoothstep(0.0, 1.0, t));
float f = smoothstep(0.0, max(fogHeight, 0.2), t);
// During storms, flatten entire sky toward fog color
float flatten = smoothstep(0.25, 0.85, fogHeight);
vec3 col = mix(fogColor, sky, f * (1.0 - flatten));
```

The shader MUST perform manual linear→sRGB conversion using the piecewise transfer function (not simple pow(1/2.2) which over-brightens dark nighttime values):

```glsl
float linearToSRGB(float c) {
    return c <= 0.0031308
        ? c * 12.92
        : 1.055 * pow(c, 1.0/2.4) - 0.055;
}
```

`fogHeight` ramps from 0.2 (clear) to ~1.7 (heavy overcast), controlled by weather. The `flatten` term makes heavy overcast a uniform grey sky with no horizon gradient.

## 2. Day/Night Cycle

Sun position MUST be calculated from **real device time, date, and geolocation** (Auckland fallback: -36.85, 174.76):

```
declination = -23.44° × cos(2π × (dayOfYear + 10) / 365)
hourAngle = (hours - 12) × 15°
sinAlt = sin(lat) × sin(dec) + cos(lat) × cos(dec) × cos(hourAngle)
```

### 2.1 Colour Palettes

Palettes MUST be blended based on sun elevation (sine of angle above horizon):

| Elevation Range | Palette Blend |
|----------------|---------------|
| < -0.35 | Deep Night |
| -0.35 to -0.1 | Night → Deep Night |
| -0.1 to -0.02 | Night → Twilight |
| -0.02 to 0.02 | Twilight → Golden |
| 0.02 to 0.1 | Golden → Day |
| > 0.1 | Day |

**Complete palette values:**

| Property | Deep Night | Night | Twilight | Golden | Day |
|----------|-----------|-------|----------|--------|-----|
| skyTop | (0.03, 0.05, 0.08) | (0.05, 0.08, 0.15) | (0.15, 0.15, 0.35) | (0.35, 0.5, 0.75) | (0.4, 0.6, 0.9) |
| skyBottom | (0.02, 0.03, 0.04) | (0.08, 0.06, 0.12) | (0.6, 0.3, 0.15) | (0.7, 0.45, 0.2) | (0.55, 0.7, 0.9) |
| fog | (0.016, 0.024, 0.032) | (0.04, 0.04, 0.06) | (0.35, 0.25, 0.2) | (0.6, 0.5, 0.35) | (0.7, 0.8, 0.9) |
| sunColour | (0.05, 0.05, 0.1) | (0.1, 0.05, 0.02) | (1.0, 0.4, 0.1) | (1.0, 0.85, 0.6) | (1.0, 0.95, 0.85) |
| sunIntensity | 0.0 | 0.0 | 0.3 | 0.8 | 1.0 |
| hemiSky | (0.02, 0.03, 0.06) | (0.05, 0.05, 0.1) | (0.3, 0.2, 0.2) | (0.5, 0.45, 0.35) | (0.6, 0.65, 0.7) |
| hemiGround | (0.01, 0.015, 0.02) | (0.02, 0.015, 0.01) | (0.15, 0.1, 0.05) | (0.3, 0.25, 0.15) | (0.35, 0.3, 0.2) |
| hemiIntensity | 0.1 | 0.15 | 0.4 | 0.7 | 0.85 |
| ambientIntensity | 0.06 | 0.1 | 0.25 | 0.4 | 0.45 |

**Blending function:**

```python
def get_palette_blend(elevation):
    if elevation > 0.1:
        return DAY
    elif elevation > 0.02:
        t = (elevation - 0.02) / 0.08
        return lerp(GOLDEN, DAY, t)
    elif elevation > -0.02:
        t = (elevation + 0.02) / 0.04
        return lerp(TWILIGHT, GOLDEN, t)
    elif elevation > -0.1:
        t = (elevation + 0.1) / 0.08
        return lerp(NIGHT, TWILIGHT, t)
    elif elevation > -0.35:
        t = (elevation + 0.35) / 0.25
        return lerp(DEEP_NIGHT, NIGHT, t)
    else:
        return DEEP_NIGHT
```

> ⚠️ **Gotcha: Deep night palette.** Without the deep night palette, midnight looks the same as 9pm — both map to "Night." The deep night palette makes the hours around midnight noticeably darker than early evening. This was added specifically because "9pm and midnight looked identical."

### 2.2 Sun Visual

A Sprite with a radial gradient texture (128×128 canvas, 5-stop gradient from bright centre to transparent edge). Scale = `SUN_VISUAL_RADIUS × 3 = 42`. Positioned at distance 150m from player in the calculated sun direction. MUST be hidden when elevation < -0.05.

During weather: opacity × (1 - cloudDarkness × 0.9), scale increases by (1 + cloudDarkness × 1.5) — overcast sun becomes a diffuse bright patch.

## 3. Moon

### 3.1 Astronomical Positioning

Simplified Meeus lunar ephemeris with 6 principal terms for ecliptic longitude, 4 for latitude. Converts through:
ecliptic → equatorial (using obliquity of ecliptic) → horizontal (using local hour angle and latitude)

Phase MUST be computed from synodic period (29.53059 days) relative to new moon epoch (J2000 Jan 6 18:14 UTC).

### 3.2 Phase Shader

A `CircleGeometry` (radius 1.75, 32 segments) with custom ShaderMaterial:
1. Reconstructs sphere normals from disc UV: `normal = (centered.x, centered.y, sqrt(1 - x² - y²))`
2. Computes illumination from scene sun-to-moon geometry projected onto the moon disc's own local axes (stable regardless of camera rotation)
3. Smooth terminator: `smoothstep(-0.05, 0.10, dot(normal, sunDir))`
4. Earthshine (0.04, 0.04, 0.06) on the unlit side
5. Soft disc edge: `smoothstep(1.0, 0.9, dist²)`

Behind clouds: photo disc hidden, replaced with a soft glow Sprite (reusing sun texture, cool blue-white tint) that fades aggressively with cloud darkness.

> ⚠️ **Gotcha: Moon phase stability.** The sun direction on the moon disc MUST be projected onto the moon mesh's own local coordinate frame (extractBasis from matrixWorld), NOT the camera's right/up vectors. Using camera axes causes the phase shadow to shift when the player rotates their head.

### 3.3 Moon Ephemeris (Simplified Meeus)

**Ecliptic longitude** (6 terms from mean anomaly and elongation):
```
L0 = 218.3165 + 13.176396 × D          // mean longitude (degrees)
M  = 134.9634 + 13.064993 × D          // mean anomaly
D2 = 297.8502 + 12.190749 × D          // mean elongation
F  = 93.2720 + 13.229350 × D           // argument of latitude

longitude = L0
  + 6.289 × sin(M)
  + 1.274 × sin(2×D2 - M)
  + 0.658 × sin(2×D2)
  + 0.214 × sin(2×M)
  - 0.186 × sin(M_sun)
  - 0.114 × sin(2×F)
```
where D = Julian centuries from J2000, M_sun = sun's mean anomaly.

**Ecliptic latitude** (4 terms):
```
latitude = 5.128 × sin(F)
  + 0.281 × sin(M + F)
  + 0.278 × sin(M - F)  // note: positive in source
  + 0.173 × sin(2×D2 - F)
```

Convert ecliptic → equatorial using obliquity (23.44°), then equatorial → horizontal using local hour angle and latitude (same transform as for the sun).

## 4. Stars

**438 real stars** (magnitude ≤ 4.5) from the HYG stellar database, packed as binary.

### 4.1 Star Catalog Format

**Encoding**: 5 bytes per star:
- Bytes 0–1: Right ascension (uint16, 0–65535 maps to 0–24h → 0–2π)
- Bytes 2–3: Declination (uint16, 0–65535 maps to -90°–+90°)
- Byte 4: Visual magnitude (uint8, decoded as `value / 31.875 - 1.5`)

Total: ~2190 bytes, stored as base64 string (~3KB).

### 4.2 Equatorial Placement (one-time at startup)

```
x =  cos(dec) × cos(ra) × R
y =  sin(dec) × R
z = -cos(dec) × sin(ra) × R
```
where R = SKY_RADIUS × 0.95

### 4.3 O(1) Sidereal Rotation

The entire Points mesh MUST be rotated by a single Euler (order `'ZYX'`):
- Y rotation: `π - LST` (hour angle rotation)
- Z rotation: `-(π/2 - latitude)` (tilt celestial pole to correct elevation)

where LST = Local Sidereal Time = (GMST + longitude) in radians, and GMST = (280.46061837 + 360.98564736629 × (JD - 2451545.0)) mod 360.

**Why O(1) rotation**: The naive approach — converting each star from equatorial to horizontal coordinates every frame — is O(N) work (438 trig operations per frame). Since all stars move together (they're on a rigid celestial sphere), a single rotation of the entire mesh achieves the same result in O(1).

> ⚠️ **Gotcha: Euler rotation order for stars.** The scene uses +X = North, +Z = East (see VF-OVERVIEW §6). The Euler MUST be 'ZYX' with Z carrying the latitude tilt. Using 'YXZ' tilts the celestial pole toward East instead of North. The Southern Cross will appear in the wrong part of the sky.

### 4.4 Star Shader

Per-star size (3.5 - mag × 0.5, min 0.8), brightness (1.0 - mag × 0.12, min 0.3), soft circular points, subtle twinkling via `0.85 + 0.15 × sin(time × 2.7 + phase) × sin(time × 1.3 + phase × 0.7)`.

## 5. Clouds (4 Archetypes)

18 cloud groups, each containing multiple puffs:

| Archetype | Weight | Puffs | Height (m) | Drift Speed | Horizontal? |
|-----------|--------|-------|------------|-------------|-------------|
| Cumulus | 35% | 5–8 | 60–90 | 0.015 | No (billboard) |
| Wispy | 25% | 3–6 | 85–110 | 0.035 | Yes (plane) |
| Flat layer | 20% | 6–10 | 70–100 | 0.008 | Yes (plane) |
| Small puffy | 20% | 2–3 | 50–75 | 0.025 | No (billboard) |

**4 cloud textures** (64×64 canvas each):
0. **Soft round**: radial gradient for cumulus puffs
1. **Wispy**: softer, more diffuse radial gradient
2. **Flat-bottomed**: asymmetric falloff (soft top, flatter base) using smooth elliptical distance
3. **Thin haze**: very low-contrast radial gradient

Horizontal clouds (wispy, flat) MUST use `Mesh` with `PlaneGeometry` rotated flat, NOT billboard Sprites. They MUST align to a shared `windAngle` ± 9° jitter.

> ⚠️ **Gotcha: PlaneGeometry scale axis.** `PlaneGeometry(1,1)` lies in the XY plane — all vertices have Z=0. When rotated flat (rotation.x = -π/2), the visual "depth" is the Y scale, not Z. Scaling Z has zero effect because 0 × anything = 0. Use `scale.set(scaleX, scaleY, 1)`.

**Billowing animation**: Each puff gently drifts in position (±0.8m for billboards, ±0.12m for horizontal) and breathes in scale (±6% for billboards, ±0.9% for horizontal).

> ⚠️ **Gotcha: Cloud animation amplitude.** The initial cloud animation was "they move too much." Cloud motion SHOULD be barely perceptible — you notice it over 10–20 seconds, not per-frame. Horizontal clouds need even subtler motion (15% of billboard amplitude) because their flat orientation makes any movement more visible.

**Time-of-day tinting**: Night = dark blue-grey (0x222233, 50% opacity), twilight = blend toward sunset orange (0xe8a070), day = white (full opacity). Weather pushes toward storm grey (0x303038) with increased opacity.

## 6. Fog

Scene fog (linear) with base near=120, far=250. Weather reduces via `fogMultiplier`. Snow zones further reduce via `snowFog`. Fog colour MUST track the palette with weather desaturation toward luminance-matched grey.

**Why luminance-matched grey**: During storms, the fog should desaturate toward grey. But which grey? A fixed grey (like 0x606068) looks fine during the day but *brightens* the scene at night — night fog is much darker than that grey. The solution: compute the luminance of the current palette's fog colour and use that as the grey target.

> ⚠️ **Gotcha: Weather × time-of-day fog.** This was iterated 7 times in the original build. The failure modes: too blue (preserving clear-sky blue ratio), too dark at horizon (dimming applied to fog), too bright at night (fixed grey target), not dark enough during night rain (needs additional nightDarken factor). Test fog at midnight during rain specifically — that's where most implementations break.

**Snow fog**: Above snowline during storms, fog near/far MUST collapse to 30/80m, creating blizzard whiteout. Fog colour MUST shift toward white (0.85, 0.87, 0.92).

## 7. Fireflies

30 particles, visible at night (sun elevation < -0.05), suppressed by rain (×(1 - rainIntensity × 0.8)).

**Per-firefly**: drift orbit angle, speed (0.2–0.4), radius (0.5–1.5m), vertical bob (0.1–0.3m), glow speed (0.8–2.3), phase offset, yellow or green colour.

**Two render layers**: Larger dim glow (size 0.2, opacity 0.25, additive blending) + smaller bright core (size 0.06, opacity 0.7).

**Glow pulse**: `brightness = pulse > 0.2 ? (pulse - 0.2) / 0.8 : 0` where `pulse = sin(time × glowSpeed + phase)`

Fireflies MUST be excluded from water (terrain below SHORE_LEVEL) and above treeline. They MUST be respawned if they drift out of bounds.

## 8. Shooting Stars

Visible at night (sun elevation < -0.05) with clear skies (star dimming < 0.5). Pooled for zero allocation.

**Spawn**: Every 3–13 seconds, one shooting star spawns:
- Position: random azimuth, 20–70° elevation, at 70% of sky radius
- Direction: slightly forward from position angle (+ 0.3–0.8 rad), downward (30–70% of speed)
- Speed: 150–350 m/s
- Duration: 0.4–1.2 seconds
- Tail length: 15–40m

**Visual**: `THREE.Line` (2 vertices: head + tail), white, transparent, `fog: false`, `frustumCulled: false`

**Fade**: Linear ramp: 0→10% of duration = fade in, 70→100% = fade out
