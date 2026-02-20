# VF-FOREST — Forest System

**Version:** 1.0  
**Date:** 20 February 2026  
**Status:** Active  
**Purpose:** Three tree types with exact geometry, tree placement algorithm, vegetation (grass/ferns/flowers/rocks/logs/stumps), and wind animation.  
**Dependencies:** VF-CONFIG, VF-TERRAIN, VF-WEATHER  

---

## 1. Three Tree Types

Each tree type has a **trunk** (merged cylinder + branch stubs) and a **canopy** (merged lobes). All geometry MUST be built from primitives at startup.

### 1.1 Pine (Type 0)
- **Trunk**: Cylinder, top radius 0.06, bottom radius 0.13, height 1.1, 8 radial segments, 4 height segments
- **Branches**: 3 stubs at heights 0.4, 0.6, 0.85 (lengths 0.25, 0.22, 0.18)
- **Canopy**: 5 stacked open-ended cones (MUST have no flat base):
  - (y=0.85, r=0.8, h=1.1, 14 segs)
  - (y=1.2, r=0.65, h=0.9, 14 segs) offset x+0.1, z-0.08
  - (y=1.5, r=0.5, h=0.75, 12 segs)
  - (y=1.8, r=0.38, h=0.6, 10 segs)
  - (y=2.05, r=0.25, h=0.4, 8 segs)
- **Canopy colour**: Dark cool green (0x18401a), vertex variation ±0.28
- **Texture**: Dense short needle strokes in varied directions

> ⚠️ **Gotcha: Open-ended cones.** Pine canopy cones MUST have no flat base (`openEnded: true` in Three.js). With flat bases, you see disc silhouettes when looking up through the canopy. This was a specific fix during development.

### 1.2 Oak (Type 1)
- **Trunk**: Cylinder, top 0.09, bottom 0.17, height 0.95, 8 radial, 4 height. 4 branch stubs.
- **Canopy**: 6 clustered icosahedron spheres (detail level 2–3):
  - Radii from 0.35 to 0.55, scattered in a natural cluster
- **Canopy colour**: Warm rich green (0x386020), vertex variation ±0.25
- **Texture**: Large overlapping leaf-like ellipses

### 1.3 Birch (Type 2)
- **Trunk**: Cylinder, top 0.04, bottom 0.07, height 1.3, 6 radial, 5 height. 4 branch stubs.
- **Trunk colour**: White/grey bark (0xd4cfc0) with dark horizontal bands via `sin(y×25) + sin(y×63)`
- **Canopy**: 4 open-ended cone lobes
- **Canopy colour**: Bright yellow-green (0x5a9035), vertex variation ±0.30
- **Texture**: Small round dots with yellow-green tint

### 1.4 Shared Trunk Features
- **S-curve bend**: `x += sin(t × π) × 0.06 + sin(t × π × 2.5) × 0.02` where t = y/height
- **Vertex colour gradient**: Dark brown (0x3d2510) at base → lighter brown (0x6b4828) at top
- **Cylindrical UVs**: U = angle around trunk, V = height
- **Procedural bark textures**: 128×128 canvas with vertical wavy lines and knots

### 1.5 Shared Canopy Features
- **Vertex jitter**: Each vertex MUST be displaced by ±0.08–0.10 × normalised position hash for organic irregularity
- **Vertex colours**: Bottom/interior darker, top/exterior lighter, plus random per-vertex variation
- **Spherical UVs**: Generated from canopy geometry bounds
- **DoubleSide rendering**: Both faces MUST be lit identically (shader patches MUST force front-face normals on backfaces)

## 2. Tree Placement

Trees MUST be placed on a grid with jitter:

```
for each grid cell at spacing 3.0m within chunk:
    density = treeNoise2D(worldX × 0.05, worldZ × 0.05)
    if density > 0.15:
        jitter = getJitter(worldX, worldZ) × 1.2
        finalX = worldX + jitterX
        finalZ = worldZ + jitterZ
        height = getTerrainHeight(finalX, finalZ)
        
        skip if height < SHORE_LEVEL (-2.8m)
        skip if height > TREELINE_START + 2 (18m)
        
        type = |floor(density × 30)| mod 3
        scale = 2.5 + (density - 0.15) / 0.85 × (6.0 - 2.5)
        
        if height > SUBALPINE_START (10m):
            altitudeScale = max(0.3, 1 - (height - 10) / 8)
            type = 0  // pines only above subalpine
            scale *= altitudeScale
        
        push tree at (finalX, height - 0.15, finalZ, type, scale)
```

Trees MUST be rendered as `InstancedMesh` — 3 types × 2 parts (trunk + canopy) = 6 draw calls. Maximum 2000 instances per type (see VF-PERFORMANCE).

Trees MUST be planted 0.15m below terrain height so trunks emerge naturally with no floating.

## 3. Vegetation

### 3.1 Grass Tufts
- **Geometry**: 9 blade cluster. Each blade = 3 triangles (base → mid → tip) with lean and varied height (0.12–0.36m)
- **Placement**: 1.3m grid, threshold > -0.15, with 2–4 additional clumps nearby per seed point
- **Scale**: `VEG_GRASS_SCALE = 0.55`
- **Material**: MeshLambertMaterial, DoubleSide, subtle emissive (3% of base colour), wind displacement

### 3.2 Ferns (3 Geometry Variants)
- **Variant parameters**: `{ fronds: [5,7,4], lenBase: [0.18,0.24,0.28], droopBase: [0.08,0.14,0.18] }`
- **Geometry**: Multi-segment curved fronds with:
  - 6-segment smooth spines with outward reach, parabolic rise, droop, and tip curl
  - Central stem strip tapering to tip
  - Dense leaflet pairs along frond (5 per segment), sized by bell curve (small at base/tip, large at 40%)
  - Each leaflet = 2 triangles left + 2 triangles right
- **Placement**: From vegetation grid where density > 0.35 AND (tree density > 0.1 OR density > 0.6)
- **Variant selection**: Hash-based from position, distributes across 3 meshes
- **Per-instance**: Random rotation, tilt (±0.2 rad), and XZ stretch (0.75–1.25)

> ⚠️ **Gotcha: Fern appearance.** The first fern attempt looked like "alien life forms" (too angular), the second like "cactuses" (spiny central stem, tiny leaflets). Natural ferns need multi-segment curved fronds with dense leaflet pairs, drooping tips, and tip curl. The key is the parabolic rise-then-droop of each frond and the density of leaflets.

### 3.3 Flowers (3 Variants × 6 Colours)
- **18 total InstancedMesh** instances (3 geometry variants × 6 colours)
- **Geometry variants**: `{ petals: [5,4,6], stemH: [0.15,0.10,0.18], petalLen: [0.08,0.06,0.10] }`
- **Features**: Multi-segment curved stem (S-curve), 3 basal rosette leaves (multi-segment smooth), 2 stem leaves, multi-segment rounded petal fans (4 segments per petal, elliptical width profile), hexagonal centre (6 triangles, yellow)
- **Vertex colours**: Green for stem/leaves, white for petals (material colour provides flower hue)
- **Colours**: 0xff4da6, 0xffe040, 0x8b6cf7, 0xff80b0, 0xffee55, 0xff6060
- **Material**: MeshPhongMaterial with specular (0x444444, shininess 20)
- **Clustering**: Same colour for whole cluster, 3–5 additional flowers nearby

### 3.4 Rocks (3 Sizes)
- **Geometry**: Icosahedron with vertex jag displacement (±40% of radius)
- **Sizes**: Small (r=0.12, detail 0), Medium (r=0.25, detail 1), Large (r=0.5, detail 1)
- **All squashed**: scaleY = 0.45–0.6
- **Colours**: 4 stone colours with per-vertex variation (±0.12)
- **Altitude scaling**: Threshold lowered by 0.1 (treeline) or 0.2 (alpine) for denser rocks at elevation
- **No rocks in snow zone** (above 24m)

### 3.5 Fallen Logs & Stumps
- **Logs**: Horizontal cylinder (6 radial segments), bark-textured, 60% of log/stump placements
  - Length: 1.5–4.0m, radius: 0.1–0.18m
  - Placed with slight tilt (±5°) and random Y rotation
- **Stumps**: Upright cylinder (slightly tapered: 0.85 → 1.0 radius ratio), 40% of placements
  - Height: 0.15–0.4m, radius: 0.15–0.25m
  - Top face has lighter "cut wood" colour (0x8b6b4a)
- **Placement**: 8m grid, density threshold 0.55, only near trees (tree density > 0), below treeline

## 4. Wind Animation

All plant materials MUST have vertex shader wind displacement injected via `onBeforeCompile`. Three profiles:

| Profile | Primary Sway | Secondary | Tertiary | Height Factor |
|---------|-------------|-----------|----------|---------------|
| Tree trunk | sin(t×1.2 + phase) × 0.015 | sin(t×3.5 + phase×3) × 0.005 | — | smoothstep(0, 1, y×0.8) |
| Canopy | sin(t×1.2 + phase) × 0.025 | sin(t×4.0 + phase×4 + x×10) × 0.01 | sin(t×7.0 + z×15 + phase×2) × 0.004 | smoothstep(0, 0.5, y×0.5) |
| Vegetation | sin(t×2.5 + phase) × 0.025 | sin(t×5.0 + phase×3) × 0.008 | — | smoothstep(0, 0.15, y) |

All amplitudes MUST multiply by `uWindStrength` (weather-driven: 1.0 sunny → 2.5 rainy; see VF-WEATHER). Wind direction MUST slowly drift via sinusoidal angle modulation.

For canopy and vegetation materials, the fragment shader MUST also be patched to force front-face normals on backfaces, preventing harsh lighting differences when instances are randomly tilted.
