# SPEC-03: Water System

## 1. Water Plane

- **Geometry**: `PlaneGeometry(300, 300)` rotated -π/2 on X to lie flat
- **Desktop resolution**: 128×128 subdivisions
- **VR resolution**: 64×64 subdivisions (swapped on session start/end)
- **Y position**: `WATER_LEVEL = -3.5`
- **Snap grid**: Water plane position snaps to grid step (`300 / subdivisions`) to prevent wave pattern sliding as the plane follows the player

### 1.1 Material
`MeshPhongMaterial`:
- Color: `WATER_COLOR = { r: 0.05, g: 0.15, b: 0.28 }` (dark opaque water)
- Specular: `(0.18, 0.18, 0.18)`
- Shininess: `35`
- Transparent: `true`, Opacity: `0.92`
- DepthWrite: `false`

Custom GLSL is injected via `onBeforeCompile`.

## 2. Wave Displacement (Vertex Shader)

### 2.1 Hash Functions (Shared, Mobile-Safe)
```glsl
float _mhash(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

vec2 _mhash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
```

### 2.2 waveHeight Function
Multi-layer wave displacement combining gentle swells, medium chop, and storm chop:

**3 gentle swell layers** (with curved domain warping):
```
Layer 1: direction (0.38, 0.12), period ~0.08, speed 0.35, amplitude 0.045
Layer 2: direction (-0.15, 0.35), period ~0.13, speed 0.28, amplitude 0.040
Layer 3: direction (0.27, -0.22), period ~0.10, speed 0.42, amplitude 0.030
```
Each layer applies a curved warp: `p.x + sin(p.y * 0.12) * 1.5`

**4 medium chop layers** (tighter warp):
```
Layer 4: direction (0.45, -0.55), speed 0.55, amplitude 0.020
Layer 5: direction (-0.50, 0.30), speed 0.48, amplitude 0.018
Layer 6: direction (0.25, 0.60), speed 0.62, amplitude 0.015
Layer 7: direction (-0.60, -0.20), speed 0.72, amplitude 0.012
```

**3 storm chop layers** (scaled by `uRainIntensity`):
```
Layer 8:  direction (0.70, 0.30), speed 0.85, amplitude 0.015 * uRainIntensity
Layer 9:  direction (-0.40, 0.65), speed 0.95, amplitude 0.012 * uRainIntensity
Layer 10: direction (0.55, -0.60), speed 1.10, amplitude 0.010 * uRainIntensity
```

### 2.3 Wave Normal Calculation
Finite difference normals computed in vertex shader:
```glsl
float eps = 1.2;
float hL = waveHeight(worldPos.xz + vec2(-eps, 0), time);
float hR = waveHeight(worldPos.xz + vec2( eps, 0), time);
float hD = waveHeight(worldPos.xz + vec2(0, -eps), time);
float hU = waveHeight(worldPos.xz + vec2(0,  eps), time);
objectNormal = normalize(vec3((hL - hR) * 2.5, 2.0 * eps, (hD - hU) * 2.5));
```
The X/Z components are scaled by 2.5 to accentuate wave normals.

### 2.4 Surface Pattern
`wSurface(vec2 p)`: 6 sine layers creating drifting surface pattern:
```
s  = sin(p.x * 0.18 + p.y * 0.12) * 0.5 + 0.5
s += sin(p.x * 0.25 - p.y * 0.18) * 0.5 + 0.5
s += sin(p.x * 0.08 + p.y * 0.22) * 0.5 + 0.5
s += sin(p.x * 0.35 + p.y * 0.05) * 0.5 + 0.5
s += sin(p.x * 0.15 - p.y * 0.28) * 0.5 + 0.5
s += sin(p.x * 0.42 + p.y * 0.32) * 0.5 + 0.5
return s / 6.0    // normalized to 0..1
```

## 3. Fragment Shader Effects

### 3.1 Effect Scaling by Brightness
```glsl
baseLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
effectScale = smoothstep(0.0, 0.20, baseLum);  // vanishes at night
```

### 3.2 Wave Height Tinting
- Crests lighter by +0.12
- Troughs darker by -0.12

### 3.3 Drifting Surface Pattern
Two overlapping `wSurface` calls at different drift speeds:
- Flecks (bright spots): add 0.08 where pattern > threshold
- Dark patches: subtract 0.03

### 3.4 Wave-Crest Foam
```glsl
foam = smoothstep(0.07, 0.12, vWaveH) * noiseModulation
color += foam * (0.04 + rain * 0.08)
```

### 3.5 Storm Effects
```glsl
rgb *= 1.0 - rain * 0.25                           // darken
rgb = mix(rgb, vec3(0.12, 0.14, 0.18), rain * 0.3) // grey shift
```

### 3.6 Rain Ripple Rings
10 procedural ripple rings per fragment:
```glsl
for i in 0..9:
    center = floor(worldPos.xz / 4.0) * 4.0 + hash2(seed) * 4.0
    phase = hash(seed) * 6.28 + time * (2.0 + hash(seed+1) * 3.0)
    radius = fract(phase / 6.28) * 1.5
    ring = smoothstep(radius - 0.08, radius, dist) * smoothstep(radius + 0.08, radius, dist)
    ring *= (1.0 - fract(phase / 6.28))  // fade with age
    ripples += ring
ripples = min(ripples, 1.0)
color += rain * 0.15 * ripples
```

### 3.7 Heightmap-Based Depth
A 128×128 `Float32Array` heightmap covers 300×300m, staggered across frames:
- Desktop: 16 rows per frame
- VR: 4 rows per frame
- Rebuilt when player moves >5m from last center
- Used in fragment shader for depth-based effects:
```glsl
waterDepth = max(0.0, WATER_LEVEL - terrainH)
depthFactor = 1.0 - exp(-waterDepth * 0.8)
shallowTint = vec3(0.08, 0.22, 0.25)
// Blend alpha: 0.6 (shallow) to 1.0 (deep)
```

### 3.8 Subsurface Scattering
```glsl
sssTint = vec3(0.05, 0.18, 0.15)
sss = smoothstep(0.02, 0.10, vWaveH)  // at wave crests
color += sssTint * sss
```

### 3.9 Fresnel Reflection
Schlick approximation:
```glsl
F0 = 0.02
fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0)
color = mix(color, fogColor * 1.15, fresnel)
```

### 3.10 Shore Fade
```glsl
shoreFade = 1.0 - smoothstep(-2.0, -0.1, terrainH - WATER_LEVEL)
```
Makes water transparent near shore where terrain is close to water level.

### 3.11 Edge Fade
```glsl
edgeFade = 1.0 - smoothstep(120.0, 148.0, max(abs(localX), abs(localZ)))
```
Hides the square boundary of the 300×300m water plane.

## 4. Weather Integration

The render loop dynamically adjusts water based on weather:
- `waveAmplitude` uniform: scales all wave displacement (1.0 calm -> 1.8 storm)
- `rainIntensity` uniform: drives storm chop waves + rain ripples
- Water color blends toward fog color based on scene brightness and weather darkness
- Specular reduces based on cloud coverage and low scene brightness

## 5. Shore Foam (Marching Squares)

Each chunk generates foam segments using marching-squares waterline detection:
- Grid step: `FOAM_GRID_SPACING = 1.5m`
- Evaluates `height - WATER_LEVEL` at 4 corners of each cell
- Finds zero crossings via linear interpolation on cell edges
- If >= 2 crossings found, creates a line segment with per-vertex normals
- `FOAM_SHORE_WIDTH = 0.6` (strip offset toward shore)
- `FOAM_WATER_WIDTH = 0.8` (strip offset toward water)
- Shore foam rendering is currently handled in the ground shader rather than as separate geometry

## 6. Swimming

When water depth exceeds threshold, player enters swimming mode:
- `SWIM_DEPTH_THRESHOLD = 1.2m` (water must be deeper than this)
- `SWIM_SPEED = 1.8 m/s` (slower than walking)
- `SWIM_BOB_SPEED = 0.6 Hz` (slow undulating bob)
- `SWIM_BOB_AMOUNT = 0.025m` (gentle sway)
- `SWIM_EYE_ABOVE_WATER = 0.45m` (how far eyes peek above surface)
- Target Y: `WATER_LEVEL + SWIM_EYE_ABOVE_WATER - TERRAIN_FOLLOW_OFFSET = -3.5 + 0.45 - 1.6 = -4.65`
- Smooth float to surface: `lerp rate = delta * 10`
- Vertical velocity killed on entering water
- Jump disabled while swimming
- Landing splash sound plays when entering water from height
