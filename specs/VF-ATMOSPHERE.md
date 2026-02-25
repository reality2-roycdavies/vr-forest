# VF-ATMOSPHERE — Atmosphere

**Version:** 1.1
**Date:** 25 February 2026
**Status:** Active
**Purpose:** Sky dome, day/night cycle (astronomical sun/moon), stars (2865-star catalog with spectral colours, sidereal rotation), naked-eye planets (Keplerian ephemeris), Milky Way band, clouds (4 archetypes), fog, fireflies, and shooting stars. Desktop/VR adaptive brightness.
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
4. Shadow side fully transparent: `pixelAlpha = smoothstep(0.0, 0.15, illumination)` — sharp alpha cutoff so the lit crescent is fully opaque and the dark side is invisible
5. Daytime sky wash: `mix(color, vec3(0.85, 0.87, 0.92), skyBrightness × 0.6)` — lit side pales to match bright sky
6. Soft disc edge: `smoothstep(1.0, edgeSoftness, dist²)` where edgeSoftness = 0.9 at night, 0.7 during day (softer edge avoids harsh rim against bright sky)

Behind clouds: photo disc hidden, replaced with a soft glow Sprite (reusing sun texture, cool blue-white tint) that fades aggressively with cloud darkness.

> ⚠️ **Gotcha: Moon shadow at twilight.** The shadow side of the moon MUST always be transparent, not dark. An earlier approach used `shadowAlpha = 1.0 - skyBrightness` which left the shadow at 60% opacity during dawn/dusk, creating a very obvious dark patch. Using raw `illumination` as alpha also fails — the smoothstep terminator produces very low values near the edge, making the moon nearly invisible. The fix is `smoothstep(0.0, 0.15, illumination)` which creates a sharp cutoff: lit pixels are fully opaque, shadow pixels are fully transparent, with only a narrow transition band at the terminator.

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

**2,865 real stars** (magnitude ≤ 5.5) from the Yale Bright Star Catalog / HYG database, with spectral colours from B-V color index.

### 4.1 Star Catalog Format

**Encoding**: 6 bytes per star:
- Bytes 0–1: Right ascension (uint16, 0–65535 maps to 0–2π radians)
- Bytes 2–3: Declination (uint16, 0–65535 maps to -90°–+90°)
- Byte 4: Visual magnitude (uint8, decoded as `value / 31.875 - 1.5`)
- Byte 5: B-V color index (uint8, decoded as `value / 255 × 3.0 - 0.5`, range -0.5 to 2.5)

Total: ~17,190 bytes, stored as base64 string (~23KB).

### 4.2 Spectral Colours

B-V color index is converted to RGB using the Ballesteros (2012) blackbody approximation:

```
T_color = 4600 × (1 / (0.92 × BV + 1.7) + 1 / (0.92 × BV + 0.62))
```

This maps spectral types: blue O/B stars → white A → yellow G → orange K → red M. The resulting colour MUST be desaturated to 55% (`sat = 0.55`) — pure spectral colours look garish against a dark sky.

### 4.3 Equatorial Placement (one-time at startup)

```
x =  cos(dec) × cos(ra) × R
y =  sin(dec) × R
z = -cos(dec) × sin(ra) × R
```
where R = SKY_RADIUS × 0.95

### 4.4 O(1) Sidereal Rotation

The entire Points mesh MUST be rotated by a single Euler (order `'ZYX'`):
- Y rotation: `π - LST` (hour angle rotation)
- Z rotation: `-(π/2 - latitude)` (tilt celestial pole to correct elevation)

where LST = Local Sidereal Time = (GMST + longitude) in radians, and GMST = (280.46061837 + 360.98564736629 × (JD - 2451545.0)) mod 360.

**Why O(1) rotation**: The naive approach — converting each star from equatorial to horizontal coordinates every frame — is O(N) work (2865 trig operations per frame). Since all stars move together (they're on a rigid celestial sphere), a single rotation of the entire mesh achieves the same result in O(1).

> ⚠️ **Gotcha: Euler rotation order for stars.** The scene uses +X = North, +Z = East (see VF-OVERVIEW §6). The Euler MUST be 'ZYX' with Z carrying the latitude tilt. Using 'YXZ' tilts the celestial pole toward East instead of North. The Southern Cross will appear in the wrong part of the sky.

### 4.5 Star Shader

Per-star attributes are computed from magnitude at startup:

```
normMag = (mag + 1.5) / 7.0          // normalise to 0..1
lumFactor = pow(1.0 - normMag, 2.5)   // logarithmic — magnitude is log scale

size = 1.0 + lumFactor × 3.5          // range ~1.1 (mag 5.5) to ~4.5 (Sirius)
brightness = max(0.35, lumFactor × 1.3)  // raised floor so faint stars are visible
```

Fragment shader features:
- **Core + halo**: `core = smoothstep(0.25, 0.01, d)`, `halo = smoothstep(0.25, 0.08, d) × 0.5`
- **Twinkling**: Brighter stars twinkle less (atmospheric scintillation is more noticeable for fainter stars). Amount = `0.08 + (1 - brightness) × 0.15`
- **Per-star colour**: Spectral colour applied to core; halo blends toward neutral white `(0.92, 0.92, 1.0)` via `smoothstep(0.20, 0.04, d)`
- **Brightness multiplier**: `uBrightMul` uniform — **1.8× on desktop, 1.5× in VR** (stars are naturally brighter in VR due to lens magnification; desktop needs a boost to compensate for ambient room light)

> ⚠️ **Gotcha: Star size vs brightness.** Stars that are too large (gl_PointSize > 5) look like disks rather than points, especially in VR where lens magnification enlarges them further. Keep the size range tight (1.0–4.5) and boost shader brightness instead. Several iterations were needed: starting at max size 12 (obvious disks), then 5.5 (still too large), before settling on 4.5 with a brightness multiplier to compensate.

### 4.6 Desktop/VR Adaptive Brightness

The star shader includes a `uBrightMul` uniform that is set per frame based on `vr.isInVR()`:

| Mode | uBrightMul | Rationale |
|------|-----------|-----------|
| Desktop | 1.8 | Compensates for ambient room light; stars on a monitor need to be brighter |
| VR | 1.5 | VR headset blocks ambient light; too bright causes bloom artifacts |

## 5. Naked-Eye Planets

Mercury, Venus, Mars, Jupiter, and Saturn are rendered as coloured Sprites positioned using Keplerian orbital mechanics.

### 5.1 Keplerian Ephemeris

Planet positions are computed from J2000.0 orbital elements (Standish 1992 / JPL), valid ±few centuries. Each planet has 6 elements and their century rates:

| Element | Symbol | Description |
|---------|--------|-------------|
| a | Semi-major axis | AU |
| e | Eccentricity | dimensionless |
| I | Inclination | degrees |
| L | Mean longitude | degrees |
| wBar | Longitude of perihelion | degrees |
| Omega | Longitude of ascending node | degrees |

Each element is computed as `value = value₀ + rate × T` where T = Julian centuries since J2000.0.

**Kepler's equation** `M = E - e·sin(E)` MUST be solved via Newton's method (3 iterations sufficient for e ≤ 0.21, which covers all naked-eye planets):

```
E₀ = M + e × sin(M)
Eₙ₊₁ = Eₙ + (M - Eₙ + e × sin(Eₙ)) / (1 - e × cos(Eₙ))
```

**Coordinate transform pipeline:**
1. Orbital elements → heliocentric ecliptic (x, y, z) via true anomaly
2. Subtract Earth's heliocentric position → geocentric ecliptic
3. Ecliptic → equatorial (rotate by obliquity 23.44° - 0.013°×T)
4. Equatorial → horizontal (using hour angle = LST - RA, observer latitude)

**Visual magnitude** approximation:
```
magnitude = H + 5 × log₁₀(r_helio × r_geo) + phaseFactor × phaseAngle°
```

| Planet | H (abs mag) | Phase factor | Characteristic colour |
|--------|------------|-------------|----------------------|
| Mercury | -0.36 | 0.038 | Grey-pink (#d4c5b9) |
| Venus | -4.40 | 0.009 | White-yellow (#fff8e0) |
| Mars | -1.52 | 0.016 | Orange-red (#ff8844) |
| Jupiter | -9.40 | 0.005 | Cream (#fff0d0) |
| Saturn | -8.88 | 0.004 | Pale gold (#ffe8a0) |

### 5.2 Planet Rendering

Each planet is a `THREE.Sprite` with a shared 64×64 radial gradient texture (bright white core fading to transparent). Per-planet `SpriteMaterial.color` applies the characteristic tint.

**Positioning**: Same altitude/azimuth → 3D conversion as the moon, at `PLANET_DISTANCE = 140m`.

**Magnitude-based scaling**: `magScale = max(0.3, 1.0 + (0 - magnitude) × 0.25)`, applied to `PLANET_VISUAL_RADIUS = 0.6`. Venus (mag -4.4) appears ~2.4× base size; Saturn (mag +0.5) appears ~0.7× base size.

### 5.3 Visibility Rules

Planets MUST respect sky brightness — brighter planets (lower magnitude) remain visible deeper into twilight:

| Magnitude | Max sun elevation | Example |
|-----------|------------------|---------|
| < -3 | 0.20 | Venus |
| < -1 | 0.12 | Jupiter |
| < 1 | 0.05 | Mars, Saturn |
| ≥ 1 | 0.02 | Mercury (when faint) |

**Opacity combines**: horizon fade × twilight fade × weather dimming. Below altitude 0.02 (near horizon) the planet is hidden; between 0.02 and 0.10 it fades in.

### 5.4 Zero-Allocation Design

The ephemeris module MUST pre-allocate all output arrays and intermediate vectors. The `getPlanetPositions()` function returns the same array reference each call with updated values, avoiding GC pressure in the render loop.

## 6. Milky Way Band

A procedural galactic-plane strip rendered as a mesh with a shader that generates individual star points from the density texture.

### 6.1 Galactic Coordinate System

The Milky Way mesh is built in J2000 equatorial coordinates (matching the star field) using the galactic coordinate axes:

| Reference Point | RA | Dec |
|----------------|-----|-----|
| Galactic North Pole | 192.86° | +27.13° |
| Galactic Centre (Sagittarius) | 266.4° | -29.0° |

The third axis (galactic Y) is computed as the cross product NGP × GC.

### 6.2 Geometry

A strip mesh spanning ±15° galactic latitude, 64 longitude segments × 8 latitude segments, at radius `SKY_RADIUS × 0.94` (slightly inside the star sphere). The mesh rotates with the star field via the same O(1) sidereal rotation.

### 6.3 Density Texture (1024×256)

A procedural texture encoding brightness and colour:

- **Longitude brightness**: Galactic centre (l=0°, Sagittarius) brightest; Carina/Crux (l≈290°) secondary bright region; anticenter (l=180°, Auriga) dimmest
- **Latitude profile**: Tight bright core (`exp(-b² × 6)`) plus wider dim halo (`exp(-b² × 1.5)`)
- **Multi-scale cloud structure**: 3 layers of fractal noise at different scales for irregular nebular structure
- **Dark dust lanes (Great Rift)**: Runs from Cygnus (l≈75°) through Aquila/Scutum to Sagittarius (l≈0°); tight to the galactic plane
- **Coalsack**: Dark patch near Southern Cross (l≈303°)
- **Bright star clouds**: Scutum Star Cloud (l≈28°), Sagittarius Star Cloud (l≈355°)

The texture is blurred (4px Gaussian) to create a smooth density/colour envelope.

### 6.4 Milky Way Shader

The fragment shader generates individual star points from the density texture using a multi-layer hash-grid technique:

| Layer | Grid size | Density scale | Radius | Brightness weight |
|-------|-----------|--------------|--------|------------------|
| Dense dim | 4096×1024 | density × 0.55 | 0.45 | 0.6 |
| Medium | 2048×512 | density × 0.30 | 0.35 | 1.0 |
| Bright highlights | 1024×256 | density × 0.12 | 0.3 | 1.4 |

Each layer uses a hash function per grid cell to place a single star at a random position within the cell. Stars above the density threshold appear; below it, the cell is empty. This creates thousands of individual points that resolve at close inspection but blend into a diffuse glow at a glance.

A diffuse glow underneath (`density × 0.25`) represents the unresolved stellar background.

**Additive blending** (`THREE.AdditiveBlending`), `DoubleSide`, horizon fade via `smoothstep(-0.02, 0.12, elevation)`. Opacity controlled by the same `uOpacity` uniform as stars (fades with sky brightness and weather).

## 7. Clouds (4 Archetypes)

`CLOUD_COUNT` (20) cloud groups, each containing multiple puffs:

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

## 8. Fog

Scene fog (linear) with base near=50, far=130 (see VF-CONFIG). Weather reduces via `fogMultiplier`. Snow zones further reduce via `snowFog`. Fog colour MUST track the palette with weather desaturation toward luminance-matched grey.

**Why luminance-matched grey**: During storms, the fog should desaturate toward grey. But which grey? A fixed grey (like 0x606068) looks fine during the day but *brightens* the scene at night — night fog is much darker than that grey. The solution: compute the luminance of the current palette's fog colour and use that as the grey target.

> ⚠️ **Gotcha: Weather × time-of-day fog.** This was iterated 7 times in the original build. The failure modes: too blue (preserving clear-sky blue ratio), too dark at horizon (dimming applied to fog), too bright at night (fixed grey target), not dark enough during night rain (needs additional nightDarken factor). Test fog at midnight during rain specifically — that's where most implementations break.

**Snow fog**: Above snowline during storms, fog near/far MUST collapse to 30/80m, creating blizzard whiteout. Fog colour MUST shift toward white (0.85, 0.87, 0.92).

## 9. Fireflies

30 particles, visible at night (sun elevation < -0.05), suppressed by rain (×(1 - rainIntensity × 0.8)).

**Per-firefly**: drift orbit angle, speed (0.2–0.4), radius (0.5–1.5m), vertical bob (0.1–0.3m), glow speed (0.8–2.3), phase offset, yellow or green colour.

**Two render layers**: Larger dim glow (size 0.2, opacity 0.25, additive blending) + smaller bright core (size 0.06, opacity 0.7).

**Glow pulse**: `brightness = pulse > 0.2 ? (pulse - 0.2) / 0.8 : 0` where `pulse = sin(time × glowSpeed + phase)`

Fireflies MUST be excluded from water (terrain below SHORE_LEVEL) and above treeline. They MUST be respawned if they drift out of bounds.

## 10. Shooting Stars

Visible at night (sun elevation < -0.05) with clear skies (star dimming < 0.5). Pooled for zero allocation.

**Spawn**: Every 3–13 seconds, one shooting star spawns:
- Position: random azimuth, 20–70° elevation, at 70% of sky radius
- Direction: slightly forward from position angle (+ 0.3–0.8 rad), downward (30–70% of speed)
- Speed: 150–350 m/s
- Duration: 0.4–1.2 seconds
- Tail length: 15–40m

**Visual**: `THREE.Line` (2 vertices: head + tail), white, transparent, `fog: false`, `frustumCulled: false`

**Fade**: Linear ramp: 0→10% of duration = fade in, 70→100% = fade out
