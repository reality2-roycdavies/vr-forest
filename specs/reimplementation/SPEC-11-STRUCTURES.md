# SPEC-11: Structures — Procedural Log Cabins

## 1. Cottage Placement

- Grid spacing: `COTTAGE_GRID_SPACING = 16m`
- Density function: `getCottageDensity(x, z)` (noise instance #13, frequency 0.02)
- Threshold: `COTTAGE_DENSITY_THRESHOLD = 0.45`
- Jitter: magnitude 3.0 (noise offset +700)
- Max cottages: 50

### 1.1 Placement Constraints
- `terrainY > SHORE_LEVEL + 1`
- `terrainY < SUBALPINE_START`
- `terrainY > WATER_LEVEL + 0.5`
- No stream channels (`getStreamFactor` check)
- Slope check: 3×3 grid at 2.5m radius, max slope 0.3, max height variation 0.6m
- Uses lowest footprint Y to prevent floating
- Seed: `abs(floor(jx * 127.1 + jz * 311.7))`

### 1.2 Clearing Effect
- `COTTAGE_CLEARING_RADIUS = 10m`: No trees or vegetation within this radius
- Blend radius for ground shader: `COTTAGE_CLEARING_RADIUS × 1.5 = 15m`
- Garden ground color: `(0.38, 0.30, 0.16)` — warm earthy soil
- Smooth cubic hermite falloff: `t² × (3 - 2t)`, max across all cottages
- Flowers spawn at reduced threshold near cottages (`-0.5` vs normal `0.55`)

## 2. Procedural Log Cabin Geometry

Each cottage is unique, seeded from its position hash. All geometry is vertex-colored — no textures.

### 2.1 Dimension Variation
| Parameter | Seed | Range |
|-----------|------|-------|
| widthX | seed+1 | 2.5 – 5.0m |
| widthZ | seed+2 | 2.0 – 4.0m |
| logRadius | seed+3 | 0.10 – 0.16m |
| logCount | seed+4 | 10 – 14 |
| roofPitch | seed+5 | 0.5 – 1.1m |
| roofOverhang | seed+6 | 0.2 – 0.6m |
| leanX | seed+7 | -0.04 – 0.04 |
| leanZ | seed+8 | -0.04 – 0.04 |
| chimneyCorner | seed+9 | 0–3 (corner index) |
| chimneyLean | seed+10 | -0.05 – 0.05 |
| doorSide | seed+11 | 1 or -1 |
| logOverhang | seed+13 | 0.08 – 0.2m |

### 2.2 Colors
- Wood base: HSL H=0.06–0.10, S=0.3–0.5, L=0.2–0.3
- Roof (thatch): HSL H=0.20–0.32, S=0.25–0.45, L=0.18–0.30
- Stone (chimney): `0x666660`
- Window glass: `rgb(0.18, 0.24, 0.35)` (dusty blue-grey)
- Door: `0x2a1e10` (dark brown)
- Door frame / window frame: `0x3a2810`

### 2.3 Wall Construction
Log-cabin construction with interlocking corners:
- Front/back walls: Z-aligned cylinders (`CylinderGeometry(logR, logR2, length, 6, 3)`)
- Side walls: offset up by half a logStep for interlocking
- Each log jittered by 0.012 for organic feel
- Vertical spacing: `logStep = logDiameter × 0.76`
- Wall height: `logCount × logStep`

### 2.4 Log Splitting (for Openings)
Door and windows cut openings in walls. `splitLog()` takes a log spanning [-halfLen, +halfLen] and a list of openings. For each opening overlapping the log's Y range, splits the log at the opening boundaries. Filters out segments shorter than `logR × 3`.

### 2.5 Gable Triangles
Log ends stacked shorter toward the ridge:
- `gableRows = ceil(roofPitch / logStep)`
- Each row's length decreases linearly toward ridge

### 2.6 Roof
Two `BoxGeometry(roofLen, 0.2, slopeLen, 8, 3, 6)` panels:
- Jittered (`jitterThatch` at 0.03) for rustic look
- Sagged: `sin(t × PI) × 0.04` center droop
- Rotated to roof angle: `atan2(roofPitch, roofHalfSpan)`
- Extended past ridge by roof thickness to prevent gap
- Ridge beam: `CylinderGeometry(logRadius×0.9)` along X at ridge top

### 2.7 Chimney
`BoxGeometry(0.35, chimneyH, 0.35, 2, 3, 2)`:
- Height: `roofPitch + 0.5 + random × 0.4`
- Positioned at one of 4 corners (40% from center)
- Lean applied: `x += y × chimneyLean`
- Stone vertex colors with 0.12 variation

### 2.8 Door
- Box `(0.06, doorH=1.9, doorW=0.7)`, color `0x2a1e10`
- Frame: lintel + 2 jambs in `0x3a2810`
- Light seep strip and keyhole on latch side (emissive `(0.25, 0.18, 0.08)`)

### 2.9 Windows
2×2 pane grid per window (pane: 0.28 × 0.20, frame thickness 0.012):
- 4 glass panes (dirty glass vertex colors, emissive parts)
- Cross bars (horizontal + vertical) in `0x1a1208`
- Wooden frame surround in `0x3a2810`
- Placement: 2 on side walls, 1 on back wall, at Y = wallHeight × 0.42

### 2.10 Global Lean
After all geometry merged: `x += y × leanX`, `z += y × leanZ`

### 2.11 Log Coloring (`addLogColors`)
Per-vertex bark coloring:
- Per-log tint: `(hash - 0.5) × 0.12`
- Per-vertex noise: n1 at 0.10, n2 at 0.06
- End darkening: `(1 - sin(axialT × PI)) × 0.04`
- Knot probability: 8%, darkens by -0.08
- G gets 0.8× tint, B gets 0.5× n2

### 2.12 Thatch Coloring
6-color palette from base: green, dark green, brown, dry straw, moss. Random per-vertex from noise.

## 3. Chimney Smoke

### 3.1 Parameters
- `SMOKE_PARTICLES_PER_COTTAGE = 20`
- `SMOKE_LIFETIME = 7.0s` (long, reaches above trees)
- `SMOKE_RISE_SPEED = 2.2 m/s` (~12m rise over lifetime)
- `SMOKE_DRIFT_SPEED = 0.5 m/s`
- `SMOKE_START_SIZE = 0.4m`
- `SMOKE_END_SIZE = 3.5m` (big diffuse puff)
- `SMOKE_COLOR = (0.55, 0.55, 0.58)` (subtle grey)

### 3.2 Smoke Texture (64×64 Canvas)
6 overlapping radial gradient blobs at different offsets. Gradient: center `rgba(240, 240, 245, 0.35)`, mid `rgba(220, 220, 230, 0.18)`, edge transparent.

### 3.3 Particle Dynamics
- `stormFactor = min(1, windStrength / 1.5)`
- Rise speed: `SMOKE_RISE_SPEED × (1 - stormFactor × 0.6)`
- Drift speed: `SMOKE_DRIFT_SPEED × windStrength × (1 + stormFactor × 4)`
- Per particle:
  - Lifecycle wraps at maxLife, resets to chimney with ±0.125 XZ spread
  - Rise: `riseSpeed × (1 - t × 0.6) × speedMul × delta` (slows with age)
  - Drift: wind direction × driftSpeed × (0.3 + t × 0.7) + wobble
  - Size: `lerp(START_SIZE, END_SIZE, t)` with `sizeMul` and `aspect` variation
  - Opacity: `min(1, t×4) × (1 - t²) × 0.85`
- Night brightness: `max(0.15, min(1, (sunElevation + 0.05) / 0.25))`

## 4. Window Glow

Emissive glow at night:
```
glow = clamp((0.05 - sunElevation) / 0.15, 0, 1)
// Full glow when sunElevation < -0.10, zero when > 0.05
emissiveIntensity = glow * 0.15
emissiveColor = (0.9, 0.65, 0.2) — warm amber
```

Material: `MeshLambertMaterial({ vertexColors: true, emissive: Color(0.9, 0.65, 0.2), emissiveIntensity: 0 })`.

## 5. Cottage System

### 5.1 Geometry Cache
LRU-like cache, max 100 entries (MAX_COTTAGES × 2). Keyed by seed.

### 5.2 Rebuild
On chunk change, collects cottage positions from active chunks (cap 50), creates meshes:
- Main mesh: `MeshLambertMaterial({ vertexColors })`, shadow cast+receive, matrixAutoUpdate off
- Window mesh: same position/rotation, emissive material
- Rotation: `seed × 73.13 % (2PI)`
- Chimney world position computed for smoke origin

### 5.3 Collision
`COTTAGE_COLLISION_RADIUS = 2.0m` (checked alongside tree collision in movement system).
