# SPEC-04: Forest, Vegetation & Natural Objects

## 1. Tree Types

Four distinct tree types, all procedurally generated:

### 1.1 Type 0: Pine
**Trunk**: `buildTrunk(radiusTop=0.06, radiusBot=0.13, height=1.1, radialSegs=8, heightSegs=3)` with 3 branch stubs at heights 0.4, 0.6, 0.78. S-curve bend: `x += sin(t*PI)*0.06 + sin(t*PI*2.5)*0.02`.

**Canopy**: 5 stacked open-ended cones:
| Offset (x,y,z) | Radius | Height | Segments |
|------|------|------|------|
| (0, 0.85, 0) | 0.8 | 1.1 | 12 |
| (0.1, 1.2, -0.08) | 0.65 | 0.9 | 12 |
| (-0.08, 1.5, 0.06) | 0.5 | 0.75 | 10 |
| (0.05, 1.8, -0.03) | 0.38 | 0.6 | 8 |
| (-0.04, 2.05, 0.02) | 0.25 | 0.4 | 8 |

Each cone is jittered by 0.08 and positioned at `(ox, oy + height*0.35, oz)`.

**Colors**: Base `0x18401a` (very dark green), vertex color variation 0.28. Bark texture from `createBarkTexture('#5c3a1e', 128)`.

**Canopy material**: `MeshPhongMaterial({ vertexColors, map, DoubleSide, specular: 0x000000, shininess: 0 })` + wind shader ('canopy').

### 1.2 Type 1: Oak
**Trunk**: `buildTrunk(0.09, 0.17, 0.95, 8, 3)` with 3 branch stubs at 0.35, 0.55, 0.75. Longer branches (0.48, 0.42, 0.35).

**Canopy**: 6 icosahedron spheres (detail level 2):
| Offset (x,y,z) | Radius |
|------|------|
| (0, 1.35, 0) | 0.55 |
| (0.32, 1.25, 0.18) | 0.45 |
| (-0.28, 1.3, -0.22) | 0.48 |
| (0.05, 1.6, -0.12) | 0.42 |
| (-0.15, 1.55, 0.25) | 0.38 |
| (0.2, 1.5, -0.3) | 0.35 |

Each jittered by 0.1. Color base `0x386020`, variation 0.25.

### 1.3 Type 2: Birch
**Trunk**: `buildTrunk(0.04, 0.07, 1.3, 6, 3)` — thinner, taller. White birch bark colors: base `0xd4cfc0`, marks `0x555045`. Dark bands where `sin(y*25)*0.5 + sin(y*63)*0.3 > 0.4`. Uses `createBirchBarkTexture(128)`.

**Canopy**: 4 cone lobes:
| Offset (x,y,z) | Radius | Height |
|------|------|------|
| (0.18, 1.2, 0.12) | 0.48 | 0.7 |
| (-0.22, 1.4, -0.12) | 0.4 | 0.6 |
| (0, 1.65, 0) | 0.33 | 0.5 |
| (0.1, 1.85, -0.08) | 0.22 | 0.35 |

Color base `0x5a9035`, variation 0.3.

### 1.4 Type 3: Tussock (Alpine Grass)
**Trunk**: Minimal stub `buildTrunk(0.02, 0.03, 0.05, 4, 1, [])`.

**Canopy**: 56 grass blades, each a `PlaneGeometry(bladeW, bladeH, 1, 2)`:
- Angle: golden-angle spacing `(i/56)*2PI + sin(i*7.1)*0.3`
- `bladeH`: 0.20 to 0.38, `bladeW`: 0.007 to 0.012
- Tapered: width x `(1.0 - t * 0.92)` from base to tip
- Outward lean: 0.15 to 0.35, quadratic from base
- Tip droop: for t > 0.7, `y -= droopT^2 * bladeH * 0.10`

Color base `0xB08840` (golden straw), variation 0.20. Material: `MeshPhongMaterial({ vertexColors, DoubleSide, specular: 0x111111, shininess: 8 })` + wind ('vegetation').

### 1.5 Common Trunk Construction
`buildTrunk(radiusTop, radiusBot, height, radialSegs, heightSegs, branches)`:
- CylinderGeometry translated up by height/2
- S-curve bend: `x += sin(t * PI) * 0.06 + sin(t * PI * 2.5) * 0.02`
- Branch stubs: CylinderGeometry(radiusTop*0.4, radiusTop*0.7, length, 4, 1)
- Vertex color gradient: base `0x3d2510` to tip `0x6b4828`
- Cylindrical UVs: `u = atan2(z,x)/(2PI) + 0.5`, `v = y/height`

### 1.6 Canopy Vertex Coloring (tintCanopyVertexColors)
Complex per-vertex coloring:
- Create lighter (S-0.05, L+0.12) and darker (S+0.05, L-0.08) variants
- Blend factor: `t = heightFraction * 0.6 + distanceFromCenter * 0.4`
- Baked ambient occlusion: `aoFactor = min(1, trunkDist * 3) * (0.5 + ht * 0.5)`, multiply RGB by `0.80 + ao * 0.20`
- Warm shift: `ht * 0.03` added to R and G*0.5
- Cool shift: `(1-ht) * 0.015` added to B
- Per-vertex noise from hash

### 1.7 Vertex Jittering
Two-frequency displacement along vertex normal direction:
- Low freq: amplitude = `amount`
- High freq: amplitude = `amount * 0.35`

## 2. Tree Placement

### 2.1 Grid + Jitter Algorithm
```
spacing = TREE_GRID_SPACING (3m)
for each grid cell starting at spacing/2:
    density = getTreeDensity(worldX, worldZ)
    if density <= TREE_DENSITY_THRESHOLD (0.15): skip

    jitter = getJitter(worldX, worldZ) * TREE_JITTER (1.2)
    jitteredX = worldX + jitter.x
    jitteredZ = worldZ + jitter.z
    terrainY = getTerrainHeight(jitteredX, jitteredZ)

    // Exclusion rules:
    if terrainY < SHORE_LEVEL (-2.8): skip          // underwater
    if getStreamFactor > 0.15: skip                  // in river
    if nearAnyCottage(jitteredX, jitteredZ): skip    // in cottage clearing
    if terrainY > 18: skip                           // above treeline+2

    treeType = abs(floor(density * 30)) % 3          // 3 real tree types
    scale = lerp(TREE_MIN_HEIGHT(2.5), TREE_MAX_HEIGHT(6.0),
                 (density - 0.15) / 0.85)

    // Altitude scaling
    if terrainY > SUBALPINE_START (10):
        altFactor = clamp((terrainY - 10) / (18 - 10), 0, 1)
        scale = max(scale * (1 - altFactor * 0.5), 0.5)

    position = (jitteredX, terrainY - 0.15, jitteredZ)  // sunk 0.15m
```

### 2.2 Tussock Placement (Separate Pass)
- Spacing: 2.0m, offset at spacing*0.3
- Jitter noise offset: +900 to x/z inputs, magnitude 0.5
- Zone: SUBALPINE_START+2 (12m) to SNOWLINE_START (20m)
- Density peaks at TREELINE_START (16m), tapers at zone edges
- Clumping: `getTreeDensity(jx+400, jz+400)`, skip if < -0.3
- Slope data passed for tilt alignment
- Scale: hash-based 0.5 to 2.0

### 2.3 Instanced Rendering
- 4 tree types x 2 meshes (trunk + canopy) = 8 InstancedMesh objects
- MAX_TREES_PER_TYPE = 2000 (tussock capped at 800)
- Per-instance color variation on canopy:
  - Standard trees: hRange 0.12, sRange 0.08, lRange 0.06
  - Tussock: hRange 0.30, sRange 0.20, lRange 0.18 (wider variation)
- Chunks sorted closest-first for priority fill
- Y rotation deterministic: `(x * 73.13 + z * 37.17) % (2PI)`
- Tussock slope tilt: if slope magnitude > 0.02, tilt up to 0.35 radians perpendicular to gradient

## 3. Vegetation

### 3.1 Grass Tufts
- 9 blades per tuft, golden-angle spacing
- Blade width: 0.008 + (i%3) * 0.004
- Blade height: 0.12 + (i%4) * 0.06
- Outward lean: 0.06 + (i%3) * 0.03
- 3 triangles per blade (base-mid-tip, tapered)
- Material: `MeshLambertMaterial` with `GRASS_COLOR (0x4a7a2e)`, emissive 3%, DoubleSide, wind
- Max 3000 instances. Cluster: 2-4 nearby tufts if density > threshold
- Scale: `VEG_GRASS_SCALE (0.55)` x (0.5 + density * 0.8)

### 3.2 Ferns
3 geometry variants:
| Variant | Fronds | Length | Droop | Rise |
|---------|--------|--------|-------|------|
| Compact upright | 5 | 0.18 | 0.08 | 0.15 |
| Full spreading | 7 | 0.24 | 0.14 | 0.20 |
| Tall droopy | 4 | 0.28 | 0.18 | 0.16 |

Each frond: curved spine with dense leaflet pairs (5 per segment). Pinna size follows bell curve: `min(1, t*5) * (1 - t^2)`. Material: `FERN_COLOR (0x4a8040)`.

### 3.3 Flowers
3 geometry variants: (5 petals, stem 0.15), (4 petals, stem 0.10), (6 petals, stem 0.18).
6 colors: `[0xff4da6, 0xffe040, 0x8b6cf7, 0xff80b0, 0xffee55, 0xff6060]`
Scale: `FLOWER_SCALE (0.55)`. Max 1500 instances.

Each flower includes: curved stem (4 segments), 3 basal leaves, 2 stem leaves, N petals (elliptical fan), hexagonal center dot (yellow).

### 3.4 Rocks
3 sizes:
| Size | Radius | Icosahedron Detail | Y Scale |
|------|--------|-------------------|---------|
| Small | 0.3 | 0 | 0.55 |
| Medium | 0.6 | 1 | 0.50 |
| Boulder | 1.2 | 1 | 0.45 |

Jagged displacement: 40% of radius along radial direction. Colors from `ROCK_COLORS [0x504d4a, 0x5a5652, 0x464442, 0x625e5a, 0x3e3c3a]`.
Collision radii: `ROCK_COLLISION_RADII [0.35, 0.7, 1.4]`
Max 1000 instances. Embedded into terrain based on slope.

### 3.5 Stream Rocks (Separate Mesh Set)
3 smooth rounded sizes:
| Size | Radius | Y Scale |
|------|--------|---------|
| Cobble | 0.18 | 0.6 |
| Stone | 0.35 | 0.55 |
| Boulder | 0.65 | 0.45 |

Higher detail (icosahedron detail 2), gentle warping (15% vs 40%). Wet colors: `[0x3a3836, 0x44413e, 0x4a4744]`. `MeshPhongMaterial` with specular 0x222222, shininess 20 (wet sheen).

### 3.6 Fallen Logs
- Spacing: `LOG_GRID_SPACING (8m)`, threshold: `LOG_DENSITY_THRESHOLD (0.55)`
- Only placed near trees (`getTreeDensity > 0`)
- 60% fallen logs (type 0), 40% stumps (type 1)
- Log: CylinderGeometry rotated horizontal, bark colors `[0x5c3a1e, 0x4a2f16, 0x6b4226]`
- Log length: 1.5 to 4.0m, radius: 0.1 to 0.18m
- Stump: CylinderGeometry (slightly tapered), top face colored as cut wood `0x8b6b4a`
- Stump height: 0.15 to 0.40m, radius: 0.15 to 0.25m
- Max 600 logs, 400 stumps

## 4. Vegetation Placement Rules

```
spacing = VEG_GRID_SPACING (1.3m)
threshold = VEG_DENSITY_THRESHOLD (-0.15)

// Skip conditions:
if terrainY < SHORE_LEVEL + 2.5 = -0.3: skip    // no veg on sand
if terrainY > TREELINE_START + 2 = 18: skip      // above treeline
if streamFactor > 0.15: skip                       // in river
if nearCottage: skip                               // in clearing

// Type selection:
if terrainY > SUBALPINE_START:
    type = grass (ferns suppressed at altitude)
else if density > 0.35 && (treeDensity > 0.1 || density > 0.6):
    type = fern
else:
    type = grass (skip if under dense canopy: treeDensity > 0.3)
```

## 5. Procedural Textures

### 5.1 Bark Texture (128x128)
- 40 vertical bark lines with wavy path: `x + sin(y * 0.1) * 2`
- 3 knots: elliptical, dark fill `rgba(40, 25, 10, 0.4-0.7)`
- RepeatWrapping, repeat (1, 2)

### 5.2 Birch Bark Texture (128x128)
- Base: `#d4cfc0` (off-white)
- 20 horizontal dark bands, 8 peeling marks
- RepeatWrapping, repeat (1, 2)

### 5.3 Canopy Textures (128x128, 4 styles)
| Style | Elements | Purpose |
|-------|----------|---------|
| 'needle' | 300 short strokes at random angles | Pine |
| 'broad' | 80 overlapping leaf ellipses | Oak |
| 'small' | 120 small round leaves + highlights | Birch |
| 'scale' | 200 dense overlapping scale ellipses | Alpine |

### 5.4 Rock Texture (64x64)
- Base `#888`, 40 random squares (shade 100-160)

## 6. Wind Animation

Three GLSL displacement profiles injected into tree/vegetation materials:

### 6.1 Tree Trunk Wind
```glsl
float h = transformed.y;
float phase = dot(worldPos.xz, vec2(0.07, 0.09));
float sway = sin(uWindTime * 1.2 + phase) * 0.015 * uWindStrength;
float rustle = sin(uWindTime * 3.5 + phase * 3.0) * 0.005 * uWindStrength;
float hFactor = smoothstep(0.0, 1.0, h * 0.8);
transformed.x += (sway + rustle) * hFactor * uWindDirection.x;
transformed.z += (sway + rustle) * hFactor * uWindDirection.y;
```

### 6.2 Canopy Wind
```glsl
float sway = sin(uWindTime * 1.2 + phase) * 0.025 * uWindStrength;
float rustle = sin(uWindTime * 4.0 + phase * 4.0 + transformed.x * 10.0) * 0.01 * uWindStrength;
float flutter = sin(uWindTime * 7.0 + transformed.z * 15.0 + phase * 2.0) * 0.004 * uWindStrength;
// Plus vertical bob:
transformed.y += sin(uWindTime * 2.5 + phase * 2.0) * 0.004 * uWindStrength * hFactor;
// Hemisphere normal override for lighting:
vNormal = normalize(normalMatrix * normalize(transformed - vec3(0.0, 1.4, 0.0)));
```

### 6.3 Canopy Subsurface Scattering (SSS)
```glsl
float sssVdotL = max(0.0, dot(-viewDir, lightDir));
float sssFactor = pow(sssVdotL, 4.0) * 0.5;
float sssThickness = 1.0 - dot(vColor, vec3(0.3, 0.5, 0.2));
gl_FragColor.rgb += vec3(0.35, 0.55, 0.08) * sssFactor * lightColor;
```

### 6.4 Vegetation Wind
```glsl
float sway = sin(uWindTime * 2.5 + phase) * 0.025 * uWindStrength;
float gust = sin(uWindTime * 5.0 + phase * 3.0) * 0.008 * uWindStrength;
float hFactor = smoothstep(0.0, 0.15, transformed.y);
```

### 6.5 Wind Direction Update
```javascript
time += delta;
t = time * 0.05;
angle = sin(t) * 0.4 + cos(t * 0.7) * 0.3;
direction = normalize(cos(angle) * 0.8 + 0.2, sin(angle) * 0.6 + 0.3);
```
