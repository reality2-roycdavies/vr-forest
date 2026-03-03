# SPEC-05: Atmosphere, Sky & Celestial Objects

## 1. Sky Dome

- Geometry: `SphereGeometry(SKY_RADIUS=200, 24, 16)`, `BackSide`, `depthWrite: false`
- Custom `ShaderMaterial` with `renderOrder: -2`

### 1.1 Vertex Shader
```glsl
varying vec3 vWorldPosition;
void main() {
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

### 1.2 Fragment Shader
```glsl
uniform vec3 topColor, bottomColor, fogColor;
uniform float fogHeight;
void main() {
    float h = normalize(vWorldPosition - cameraPosition).y;
    float t = max(0.0, h);
    vec3 sky = mix(bottomColor, topColor, smoothstep(0.0, 1.0, t));
    float f = smoothstep(0.0, max(fogHeight, 0.2), t);
    float flatten = smoothstep(0.25, 0.85, fogHeight);
    vec3 col = mix(fogColor, sky, f * (1.0 - flatten));
    // Linear -> sRGB conversion (piecewise)
    vec3 srgb = mix(col * 12.92, pow(col, vec3(1.0/2.4)) * 1.055 - 0.055,
                    step(vec3(0.0031308), col));
    gl_FragColor = vec4(srgb, 1.0);
}
```

## 2. Day/Night Cycle

### 2.1 Sun Position
Uses real-time clock adjusted by player's geolocation (or default Auckland -36.85 degrees, 174.76 degrees):
```
dayOfYear = ... (1-365)
declination = -23.44 * cos(2*PI * (dayOfYear + 10) / 365) * PI/180
hourAngle = (hours - 12) * 15 * PI/180

sinAlt = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(HA)
elevation = asin(sinAlt)    // "sunElevation" used everywhere

cosAz = (sin(dec) - sin(lat)*sinAlt) / (cos(lat)*cosAlt)
azimuth = acos(clamp(cosAz, -1, 1))
if HA > 0: azimuth = 2*PI - azimuth
```

Sun visual: Sprite with 128x128 radial gradient canvas texture, color `0xfff4cc`, scale = `SUN_VISUAL_RADIUS(14) * 3`, positioned at `SUN_DISTANCE(150)` from player.

### 2.2 Time Scrubbing
- `timeOffset` adjustable via `[`/`]` keys or VR right-grip + stick
- Rate: 3 hours per second of input
- Range: clamped to [-12, +12] hours
- URL parameter: `?time=14:30` locks to specific time

### 2.3 Color Palettes
5 palettes keyed by sun elevation (sine of altitude angle):

**Deep Night** (elevation < -0.35):
| Property | Hex | RGB |
|---|---|---|
| skyTop | 0x0a1020 | |
| skyBottom | 0x080c14 | |
| fog | 0x04070c | |
| hemiSky | 0x182030 | |
| hemiGround | 0x0e1218 | |
| hemiIntensity | 0.35 | |
| ambient | 0.30 | |

**Night** (elevation < -0.10):
| Property | Hex |
|---|---|
| skyTop | 0x0c1830 |
| skyBottom | 0x0a1018 |
| fog | 0x050810 |
| hemiSky | 0x253550 |
| hemiGround | 0x121820 |
| hemiIntensity | 0.5 |
| ambient | 0.42 |

**Twilight** (elevation -0.10 to -0.02):
| Property | Hex |
|---|---|
| skyTop | 0x1a1a50 |
| skyBottom | 0xd4725c |
| fog | 0x8a6050 |
| sun | 0xff6830 |
| sunIntensity | 0.5 |
| hemiSky | 0x554466 |
| hemiGround | 0x1a1008 |
| hemiIntensity | 0.35 |
| ambient | 0.2 |

**Golden** (elevation -0.02 to 0.02):
| Property | Hex |
|---|---|
| skyTop | 0x5a80c0 |
| skyBottom | 0xeab070 |
| fog | 0xb0a890 |
| sun | 0xffcc55 |
| sunIntensity | 0.9 |
| hemiSky | 0x99aabb |
| hemiGround | 0x3a3020 |
| hemiIntensity | 0.55 |
| ambient | 0.38 |

**Day** (elevation > 0.10):
| Property | Hex |
|---|---|
| skyTop | 0x3068cc |
| skyBottom | 0x7aaccc |
| fog | 0x84b0d8 |
| sun | 0xffdd66 |
| sunIntensity | 1.0 |
| hemiSky | 0x80c0e8 |
| hemiGround | 0x5a5040 |
| hemiIntensity | 0.6 |
| ambient | 0.4 |

### 2.4 Palette Blending
```
elev < -0.35:              deepNight
-0.35 to -0.10:            lerp(night, deepNight, (elev+0.1)/-0.25)
-0.10 to -0.02:            lerp(night, twilight, (elev+0.1)/0.08)
-0.02 to 0.02:             lerp(twilight, golden, (elev+0.02)/0.04)
0.02 to 0.10:              lerp(golden, day, (elev-0.02)/0.08)
> 0.10:                    day
```

## 3. Moon

### 3.1 Position (Simplified Meeus Ephemeris)
6 largest ecliptic longitude terms: [6.289, 1.274, 0.658, 0.214, -0.186, -0.114]
4 largest ecliptic latitude terms: [5.128, 0.281, 0.278, 0.173]
Obliquity: `23.4393 - 0.0130 * T` degrees

### 3.2 Phase
New moon epoch: JD 2451550.26 (Jan 6, 2000 18:14 UTC)
Synodic period: 29.53059 days
Phase = `(JD - epoch) % period / period`

### 3.3 Moon Shader
CircleGeometry(MOON_VISUAL_RADIUS=1.75, 32) at MOON_DISTANCE=135:
```glsl
vec3 normal = vec3(centered.x, centered.y, sqrt(1.0 - dist2));
vec3 sunDir = normalize(vec3(sunDirOnDisc, 0.5));
float illumination = smoothstep(-0.05, 0.10, dot(normal, sunDir));
vec4 texColor = texture2D(moonMap, uv);  // loaded moon.jpg texture
color = texColor.rgb * illumination;
color = mix(color, vec3(0.85, 0.87, 0.92), skyBrightness * 0.6);  // wash out during day
float pixelAlpha = smoothstep(0.0, 0.15, illumination);
float edge = smoothstep(1.0, mix(0.9, 0.7, skyBrightness), dist2);
```

### 3.4 Procedural Moon Texture (256x256 fallback)
- Highland base: grey 170-190 with noise speckle
- 8 Maria (dark seas): Imbrium, Serenitatis, Tranquillitatis, Fecunditatis, Nectaris, Procellarum, Frigoris, Vaporum
- Named craters: Tycho, Aristoteles, Kepler, Langrenus, Manilius, Bullialdus + 16 random
- Tycho ray system: 12 lines at 8% alpha
- Soft disc edge mask (93% to 100%)

## 4. Stars (2,865 Real Stars)

### 4.1 Star Catalog Encoding
~2865 stars (visual magnitude <= 5.5), packed 6 bytes per star in base64:
```
Bytes 0-1: RA (uint16 LE)   -> ra = value / 65535 * 2PI radians
Bytes 2-3: Dec (uint16 LE)  -> dec = (value / 65535 * 180 - 90) * PI/180
Byte 4:   Magnitude (uint8) -> mag = value / 31.875 - 1.5
Byte 5:   B-V index (uint8) -> bv = value / 255 * 3.0 - 0.5
```

### 4.2 Spectral Color from B-V Index (Ballesteros 2012)
```
T = 4600 * (1 / (0.92*bv + 1.7) + 1 / (0.92*bv + 0.62))
r = T >= 6600 ? 1.29293 * pow(T/100 - 60, -0.1332) : 1.0
g = T >= 6600 ? 1.12989 * pow(T/100 - 60, -0.0755) : 0.39008 * log(T/100) - 0.631
b = T >= 6600 ? 1.0 : T >= 2000 ? 0.54320 * log(T/100 - 10) - 1.19625 : 0
// Desaturate to 55%
lum = r*0.3 + g*0.6 + b*0.1
output = lum + (channel - lum) * 0.55
```

### 4.3 Star Placement
Position in J2000 equatorial:
```
R = SKY_RADIUS * 0.95
x = cos(dec) * cos(ra) * R
y = sin(dec) * R
z = -cos(dec) * sin(ra) * R
```
Rotated by Local Sidereal Time:
```
GMST = (280.46061837 + 360.98564736629 * (JD - 2451545.0)) % 360
LST = (GMST + longitude) * PI/180
starGroup.rotation.y = LST   // rotates around Y axis
```

### 4.4 Star Rendering
Size: `1.0 + pow(1.0 - normMag, 2.5) * 3.5` where `normMag = (mag + 1.5) / 7.0`
Brightness floor: `max(0.35, lumFactor * 1.3)`

Shader:
```glsl
// Fragment:
float core = smoothstep(0.25, 0.01, d);
float halo = smoothstep(0.25, 0.08, d) * 0.5;
float twinkleAmount = 0.08 + (1.0 - vBrightness) * 0.15;
float twinkle = 1.0 - twinkleAmount
              + twinkleAmount * sin(uTime*2.7 + vPhase)
                              * sin(uTime*1.3 + vPhase*0.7);
vec3 col = mix(vec3(0.92, 0.92, 1.0), vColor, smoothstep(0.20, 0.04, d));
gl_FragColor = vec4(col * vBrightness * twinkle * uBrightMul, alpha * uOpacity);
```
Desktop brightness multiplier: 1.8, VR: 1.5.

## 5. Naked-Eye Planets (Keplerian Ephemeris)

### 5.1 Orbital Elements (Standish 1992 / JPL)
5 planets: Mercury, Venus, Mars, Jupiter, Saturn.
Keplerian elements at J2000.0 with century rates for: semi-major axis (a), eccentricity (e), inclination (I), mean longitude (L), longitude of perihelion (omegabar), longitude of ascending node (Omega).

### 5.2 Kepler's Equation (Newton's Method, 3 iterations)
```
E = M + e * sin(M)
for 3 iterations:
    dE = (M - E + e*sin(E)) / (1 - e*cos(E))
    E += dE
```

### 5.3 Heliocentric to Horizontal
1. Compute heliocentric ecliptic position for Earth and planet
2. Geocentric ecliptic: planet - Earth
3. Rotate by obliquity to equatorial
4. RA and Dec from equatorial
5. Hour angle: HA = LST - RA
6. Horizontal: altitude and azimuth

### 5.4 Visual Magnitude
```
mag = H + 5 * log10(r_helio * r_geo) + phaseFactor * (phaseAngle in degrees)
```
Where H and phaseFactor per planet:
| Planet | H | Phase Factor | Color |
|---|---|---|---|
| Mercury | -0.36 | 0.038 | #d4c5b9 |
| Venus | -4.40 | 0.009 | #fff8e0 |
| Mars | -1.52 | 0.016 | #ff8844 |
| Jupiter | -9.40 | 0.005 | #fff0d0 |
| Saturn | -8.88 | 0.004 | #ffe8a0 |

### 5.5 Visibility
Sky brightness threshold varies by planet brightness:
- Venus (mag < -3): visible at elevation < 0.20
- Jupiter (mag < -1): visible at elevation < 0.12
- Faint (mag < 1): visible at elevation < 0.05
- Others: visible at elevation < 0.02

Scale: `max(0.3, 1.0 + (0 - magnitude) * 0.25)` x PLANET_VISUAL_RADIUS(0.6)

## 6. Milky Way

### 6.1 Galactic Coordinate System
- Galactic north pole: RA 192.86 degrees, Dec +27.13 degrees
- Galactic centre: RA 266.4 degrees, Dec -29.0 degrees
- Band width: +/-15 degrees galactic latitude

### 6.2 Density Texture (1024x256 canvas)
- Core profile: `exp(-bNorm^2 * 6.0)`
- Halo profile: `exp(-bNorm^2 * 1.5)`
- Band shape: `coreProfile * 0.7 + haloProfile * 0.3`
- Galactic center (l=0) brightest, Carina/Crux (l=290) secondary
- Dark dust lanes (Great Rift): Cygnus to Sagittarius
- Coalsack near Southern Cross (l~303)
- Star clouds: Scutum (l~28), Sagittarius (l~355)
- 3-octave fBm cloud structure, Gaussian blurred (4px)

### 6.3 Geometry
Strip mesh: 64 longitude segments x 8 latitude segments, R = SKY_RADIUS * 0.94

### 6.4 Procedural Star Layers (GLSL)
3 layers of grid-based procedural stars overlaid:
- Dense dim: grid 4096x1024, density x 0.55, radius 0.45
- Medium: grid 2048x512, density x 0.30, radius 0.35
- Bright sparse: grid 1024x256, density x 0.12, radius 0.3
- Combined: layer1 x 0.6 + layer2 x 1.0 + layer3 x 1.4

## 7. Clouds

### 7.1 Cloud Archetypes (Weighted Random Selection)
| Type | Weight | Puffs | Height Range | Opacity | Drift Speed | Horizontal |
|------|--------|-------|-------------|---------|-------------|-----------|
| cumulus | 0.35 | 5-8 | 60-90m | 0.25-0.45 | 0.015 | no |
| wispy | 0.25 | 3-6 | 85-110m | 0.10-0.20 | 0.035 | yes |
| flat | 0.20 | 6-10 | 70-100m | 0.12-0.22 | 0.008 | yes |
| smallPuffy | 0.20 | 2-3 | 50-75m | 0.30-0.50 | 0.025 | no |

CLOUD_COUNT = 20 groups, distributed in ring from CLOUD_MIN_RADIUS(35) to CLOUD_MAX_RADIUS(200).

### 7.2 Cloud Textures (128x128 canvas, 8 textures)
- [0-1] Cumulus: radial + noise-perturbed edges
- [2-3] Flat-bottomed: asymmetric vertical falloff
- [4-5] Wispy: x-stretched noise, 45% opacity
- [6-7] Thin haze: soft radial, 35% opacity

### 7.3 Cloud Tinting
- **Night**: color `0x222233`, opacity x 0.5
- **Twilight**: lerp to golden `0xe8a070`, sun-facing glow `rgb(1.0, 0.65, 0.35)`, underlighting `rgb(1.0, 0.55, 0.30)`
- **Day**: Vertical shading (lit tops, shadowed bottoms), silver lining `pow(sunDot, 4) * 0.12`
- **Storm**: opacity boost + lerp toward `WEATHER_STORM_CLOUD_COLOR(0x303038)`, max opacity 0.95

## 8. Fog
`THREE.Fog(fogColor, FOG_NEAR=50, FOG_FAR=130)`. Fog color matched to sky bottom color and adjusted by weather (luminance-matched grey in overcast, reduced range in snow).

## 9. Fireflies (30 Particles)
- Active when `sunElevation < -0.05`, fade in/out over 0.1 elevation range
- Suppressed by rain: `x (1 - rainIntensity * 0.8)`
- Spread: 30m around player, height 0.5-3.0m above terrain
- Excluded over water (`terrainY < SHORE_LEVEL`) and above treeline
- Glow pulse: `brightness = (sin(time * speed + phase) - 0.2) / 0.8` (off when < 0)
- 50% green `(0.4b, 0.95b, 0.2b)`, 50% yellow `(0.95b, 0.85b, 0.2b)`
- Two layers: glow (size 0.2, opacity 0.25) + core (size 0.06, opacity 0.7)
- Drift: circular path, radius 0.5-2.0m, speed 0.2-0.6, plus vertical bob

## 10. Shooting Stars
- Spawn interval: 3-13 seconds
- Start: SKY_RADIUS x 0.7, elevation 0.3-1.1 radians
- Speed: 150-350 units/s
- Tail length: 15-40 units
- Duration: 0.4-1.2 seconds
- Fade: in over first 10%, out over last 30%
- Object pooled

## 11. Shadow Stabilization
Prevents shadow map swimming by snapping to texel grid:
```
1. Transform shadow target to light view space
2. Round to nearest texel size
3. Apply offset to light position and target
```
