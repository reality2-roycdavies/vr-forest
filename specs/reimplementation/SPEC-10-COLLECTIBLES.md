# SPEC-10: Collectibles, HUD & Minimap

## 1. Collectible Orbs

### 1.1 Visual Structure
Each collectible consists of 3 overlapping instanced meshes:

**Core orb**: `IcosahedronGeometry(COLLECTIBLE_ORB_RADIUS=0.08, detail=2)`, `MeshBasicMaterial` with per-instance vertex colors.

**Glow shell**: `IcosahedronGeometry(COLLECTIBLE_GLOW_RADIUS=0.2, detail=2)`, `MeshBasicMaterial({ transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false })` with per-instance colors at 70% of core color.

**Ground glow**: `PlaneGeometry(3.0, 3.0)` lying flat, custom `ShaderMaterial`:
- Transparent, AdditiveBlending, depthWrite: false
- Polygon offset: factor -2, units -8
- Radial falloff: `alpha = (1 - smoothstep(0, 0.55, dist * 2))^3`
- Color: core color × 0.4
- Opacity uniform: 0.22 at night, fades to 0 when `sunElevation > 0.08`

### 1.2 Color Palette (7 Fairy Colors)
```
[0] 0xaaffee — teal
[1] 0xaaeeff — ice blue
[2] 0xccaaff — lavender
[3] 0xffaadd — pink
[4] 0xffffaa — warm gold
[5] 0xaaffbb — mint green
[6] 0xffccaa — peach
```
Color index per orb: `abs(floor(x * 7.3 + z * 13.7)) % 7` (deterministic from position).

### 1.3 Max Instances
`COLLECTIBLE_MAX_INSTANCES = 500`

## 2. Animation (Fluttery Fairy)

Per-orb phase offsets derived deterministically from position:
- `p1 = x * 0.37 + z * 0.71`
- `p2 = x * 0.53 + z * 0.29`
- `p3 = x * 0.19 + z * 0.83`

### 2.1 Vertical Bob
```
bob = sin(t*2.8 + p1) * 0.04 + sin(t*4.3 + p2) * 0.025 + sin(t*7.1 + p3) * 0.012
```

### 2.2 Lateral Flutter
```
driftX = sin(t*3.5 + p2) * 0.03 + sin(t*6.2 + p3) * 0.015
driftZ = cos(t*3.5 + p1) * 0.03 + cos(t*6.2 + p2) * 0.015
```

### 2.3 Wobbling Tilt
```
tiltX = sin(t*2.1 + p3) * 0.3
tiltZ = cos(t*2.7 + p1) * 0.3
spin = t * 1.2 + p1
```

### 2.4 Glow Shell
Exaggerated drift (1.3x core drift). Pulsing scale:
```
scale = 1.0 + sin(t*3.6 + p2) * 0.2 + sin(t*5.9 + p3) * 0.1
```

### 2.5 Ground Glow
Position: `y = orb.y - 0.6` (terrain level). Gentle scale pulse:
```
scale = 0.9 + sin(t*2.0 + p2) * 0.1
```

## 3. Placement

- Grid spacing: `COLLECTIBLE_GRID_SPACING = 12m`
- Density function: `getCollectibleDensity(x, z)` (noise instance #8)
- Threshold: `COLLECTIBLE_DENSITY_THRESHOLD = 0.55`
- Jitter: magnitude 2.0
- Position Y: `terrainHeight + 0.8` (floating above ground)
- Exclusion: `terrainY < SHORE_LEVEL`, stream channels, near cottages

## 4. Collection Mechanics

- Pickup distance: `COLLECTIBLE_COLLISION_RADIUS = 1.2m` (XZ distance only, ignores Y)
- Score increment: `COLLECTIBLE_SCORE_VALUE = 1` per orb
- On collect: plays chime sound, swap-removes collected entry from array
- Every 10 points: plays milestone fanfare
- Persistence: collected orbs tracked by hash `"${round(x*2)},${round(z*2)}"`, survives chunk reload

## 5. Sprint Power System

Collecting orbs fuels sprint:
- Sprint requires `score > 0`
- Cost: 1 point per 2.0 seconds of sprinting
- At 0 points: sprint cancelled, `sprintEmpty` sound plays
- Accumulator resets when sprint key released

## 6. HUD

### 6.1 Desktop HUD Elements

**Score display** (top-left): `<div>` with color `#66ffcc`, text `"Power: N"`. Scale pulse animation on score change.

**Time offset** (top-right): Shows `"+H:MM"` or `"-H:MM"` when time is being scrubbed. Fades out over ~0.7s after adjustment stops. Initially hidden.

**Weather display** (bottom-right): Shows weather icon + state name + `[1/2/3]` key hints. Icons: `{ Sunny: '☀', Cloudy: '☁', Rainy: '☂' }`. Fades in for 3 seconds on state change, then fades out.

### 6.2 VR HUD Elements
All rendered as `THREE.Sprite` children of the camera:

**Time HUD**: 256x64 canvas, sprite at (0, -0.08, -0.3), scale (0.12, 0.03, 1). Black rounded-rect background, white bold 36px monospace text.

**Score HUD**: 256x64 canvas, sprite at (-0.10, 0.06, -0.3), scale (0.10, 0.025, 1). Color `#66ffcc`, bold 32px monospace.

**Weather HUD**: 256x64 canvas, sprite at (0, 0.06, -0.3), scale (0.10, 0.025, 1). Icon + state name, `"..."` appended if transitioning.

**Minimap**: 128x128 canvas, sprite at (0.10, 0.06, -0.3), scale (0.06, 0.06, 1).

## 7. Minimap

### 7.1 Desktop Minimap
- Canvas: 180x180 pixels, positioned bottom-left
- Circular clipping with radial fade (55% to 100% radius via `destination-out` compositing)
- Background: `#0a1a2e` (dark blue)
- World radius: 80m, sample step: 3m
- Updated every 10 frames

### 7.2 Orientation
Camera forward = screen up. Screen projection rotates world offsets:
```
sx = -dx * forwardZ + dz * forwardX
sy = -(dx * forwardX + dz * forwardZ)
```
(Normalizes camera direction in XZ plane to prevent shrinking when looking up/down.)

### 7.3 Terrain Coloring by Altitude
| Condition | Color |
|-----------|-------|
| `h <= WATER_LEVEL` | `#0a2844` |
| `h <= SHORE_LEVEL` | `#8b6e3c` |
| `h > 24` | `rgb(240, 243, 248)` — snow |
| `h > 20` | `rgb(115, 107, 97)` — alpine rock |
| `h > 16` | `rgb(140, 128, 77)` — tussock |
| `h > 10` | `rgb(38, 72, 20)` — subalpine |
| else | Interpolated green based on `(h - SHORE_LEVEL) / 8` |

### 7.4 Overlay Elements
- **River streams**: Blue overlay where `getStreamFactor > 0.3` and `h > WATER_LEVEL` and `h < 18`
- **Uncollected orbs**: Teal dots, radius 2.5px
- **Cottages**: Orange square + triangle roof with outline (tiny house icon)
- **Player**: White dot (radius 3px) with directional triangle
- **North indicator**: Red "N" letter orbiting the circle edge

## 8. Debug Mode
URL parameter `?debug` creates fixed overlay showing: position, draw calls, triangles, geometries, textures. Updated every 500ms.
