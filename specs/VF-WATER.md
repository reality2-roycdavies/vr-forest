# VF-WATER — Water System

**Version:** 1.1
**Date:** 24 February 2026
**Status:** Active
**Purpose:** Water plane, wave displacement, fragment shader effects, swimming mechanics, shore foam, heightmap texture, rain ripples, and river system (physically-traced downhill rivers with flow animation, water mesh overlay, rock banks, and seamless lake junction).
**Dependencies:** VF-CONFIG, VF-TERRAIN, VF-WEATHER  

---

## 1. Water Plane

A single 300×300m plane (128×128 subdivisions) MUST follow the player on the XZ plane, snapped to a grid step of `300/128 ≈ 2.34m` to prevent wave pattern sliding. The plane MUST sit at `WATER_LEVEL = -3.5m`.

## 2. Wave Displacement (Vertex Shader)

The water surface MUST be displaced by **13 base sine waves** plus **6 storm-chop waves** scaled by rain intensity.

### 2.1 Base Waves (always active)

| # | Direction (x, z) | Speed | Amplitude |
|---|-------------------|-------|-----------|
| 1 | (0.38, 0.12) | 0.35 | 0.045 |
| 2 | (-0.15, 0.35) | 0.28 | 0.040 |
| 3 | (0.27, -0.22) | 0.42 | 0.030 |
| 4 | (0.45, -0.55) | 0.55 | 0.020 |
| 5 | (-0.50, 0.30) | 0.48 | 0.018 |
| 6 | (0.60, 0.40) | 0.65 | 0.015 |
| 7 | (-0.35, -0.60) | 0.58 | 0.012 |
| 8 | (1.70, 1.10) | 1.00 | 0.007 |
| 9 | (-1.30, 1.80) | 0.90 | 0.006 |
| 10 | (2.10, -0.90) | 1.20 | 0.005 |
| 11 | (-0.80, -2.20) | 1.10 | 0.004 |
| 12 | (2.80, 1.50) | 1.40 | 0.003 |
| 13 | (-1.70, 2.80) | 1.30 | 0.002 |

Each wave: `amplitude × sin(dot(worldPos.xz, direction) + time × speed)`

A `uWaveAmplitude` uniform (1.0 sunny → 1.8 rainy) MUST scale all wave amplitudes.

### 2.2 Storm-Chop Waves (× rainIntensity)

| # | Direction | Speed | Amplitude |
|---|-----------|-------|-----------|
| 1 | (1.60, -0.90) | 2.80 | 0.015 |
| 2 | (-1.25, 1.55) | 3.20 | 0.012 |
| 3 | (2.00, 1.15) | 2.50 | 0.010 |
| 4 | (-0.95, -2.20) | 3.60 | 0.008 |
| 5 | (2.40, 0.40) | 4.10 | 0.006 |
| 6 | (-1.85, 2.30) | 3.80 | 0.005 |

Storm-chop wave amplitudes MUST be multiplied by `rainIntensity` (0–1).

## 3. Wave Normals

Normals MUST be computed from finite differences with two-scale blending:

1. **Broad normals**: sample spacing 1.2m (smooth reflections)
2. **Fine normals**: sample spacing 0.4m (surface detail)
3. **Blend**: 70% broad + 30% fine
4. **Tilt scale**: 2.5× to make lighting reveal wave shapes without harsh angular reflections

## 4. Fragment Shader Effects

The water fragment shader MUST add:

- **Wave-height tinting**: crests brighter (+0.12 at max), troughs darker
- **Drifting surface flecks**: multi-layer sine patterns creating subtle bright/dark patches
- **Crest foam highlights**: appear above wave height 0.07, masked by noise pattern
- **Storm darkening**: 25% darkening × rainIntensity, plus desaturation toward (0.12, 0.14, 0.18)
- **Rain ripple rings**: 10 procedural expanding ring layers in 4m grid cells (see §4.1)
- **Shore fade**: water transparency MUST ramp from opaque to transparent between -0.2m and +0.15m above terrain (via heightmap texture lookup)
- **Edge fade**: water plane edges MUST fade between 120m and 148m from centre

### 4.1 Rain Ripple Rings

10 procedural expanding ring layers in 4m grid cells, each with:
- Per-cell random position (re-randomised each cycle)
- Per-cell phase offset for desynchronisation
- Per-layer speed variation (0.7–1.2×)
- Fades with remaining life

> ⚠️ **Gotcha: `highp` for ripple coordinates.** The ripple ring calculation uses sin-hash functions with large world coordinates. On Quest hardware (mediump default), this breaks — the hash function produces identical values across cells. Implementations MUST force `highp` on the world position coordinates in the ripple loop.

## 5. Swimming

When the player enters water deeper than `SWIM_DEPTH_THRESHOLD` (1.2m below water surface):

```
function updateSwimming(delta):
    // Calculate water depth at player position
    terrainY = getTerrainHeight(player.x, player.z)
    waveH = sampleWaveHeight(player.x, player.z, time)  // simplified wave function
    waterSurface = WATER_LEVEL + waveH
    waterDepth = waterSurface - terrainY

    if waterDepth > SWIM_DEPTH_THRESHOLD:
        isSwimming = true

        // Target Y: eyes at SWIM_EYE_ABOVE_WATER above surface
        targetY = waterSurface + SWIM_EYE_ABOVE_WATER

        // Gentle bob
        targetY += sin(time * SWIM_BOB_SPEED * 2π) * SWIM_BOB_AMOUNT

        // Smooth lerp to target (faster than terrain follow — feels responsive)
        player.y += (targetY - player.y) * min(1, delta * 10)

        // Movement restrictions
        moveSpeed = SWIM_SPEED          // slower
        canJump = false                 // no jumping in water
        treeCollision = false           // can swim through tree trunks
        footstepSurface = "water"       // sloshing sounds

    else:
        isSwimming = false
        // Normal terrain following resumes
```

**Why disable tree collision in water**: Tree trunks extend below water level. Without disabling collision, the player gets stuck on underwater trunks they can't see, which is frustrating and breaks immersion.

Swimming parameters (see VF-CONFIG):
| Parameter | Value |
|-----------|-------|
| SWIM_DEPTH_THRESHOLD | 1.2m |
| SWIM_SPEED | 1.8 m/s |
| SWIM_BOB_SPEED | 0.6 Hz |
| SWIM_BOB_AMOUNT | 0.025m |
| SWIM_EYE_ABOVE_WATER | 0.45m |

## 6. Shore Foam

Foam strips MUST be generated per-chunk using **marching squares** on the terrain height relative to water level:

1. Sample terrain height at corners of a 0.6m grid (FOAM_GRID_SPACING)
2. Find edge crossings where terrain height crosses water level
3. Generate foam strip geometry: two triangles per segment, with:
   - **Water side**: extends 0.8m (FOAM_WATER_WIDTH) toward water at water level + 0.07m
   - **Shore side**: extends 0.6m (FOAM_SHORE_WIDTH) toward shore, following terrain height
   - Per-vertex normals from terrain gradient (ensures shared crossing points get identical offsets)

Foam MUST use a `MeshBasicMaterial` with `onBeforeCompile` injecting:
- The full wave displacement function (matching the water vertex shader exactly)
- Bubbly noise patterns using value noise
- Ruffled shore edge with noise-displaced cutoff
- Wave-driven lapping animation via `vWaveH` varying

Foam colour MUST blend toward scene fog at night/storms (since `MeshBasicMaterial` ignores scene lighting).

**Why MeshBasicMaterial for foam**: Foam should glow slightly (it's white froth catching light). Using a lit material (Lambert/Phong) would make foam dark on the shadow side, which looks wrong — real foam scatters light omnidirectionally. Basic material is always full-brightness, and atmospheric blending is handled manually.

### 6.1 Foam Generation — Full Pseudocode

```
function generateFoamContour(chunk):
    segments = []
    step = FOAM_GRID_SPACING  // 0.6m

    for gz = 0 to CHUNK_SIZE, step step:
        for gx = 0 to CHUNK_SIZE, step step:
            // Sample terrain height at 4 corners of this cell
            wx = chunk.startX + gx
            wz = chunk.startZ + gz
            h00 = getTerrainHeight(wx, wz)
            h10 = getTerrainHeight(wx + step, wz)
            h01 = getTerrainHeight(wx, wz + step)
            h11 = getTerrainHeight(wx + step, wz + step)

            // Determine which corners are above/below water
            above00 = h00 > WATER_LEVEL
            above10 = h10 > WATER_LEVEL
            above01 = h01 > WATER_LEVEL
            above11 = h11 > WATER_LEVEL

            // Find edge crossings (linear interpolation)
            crossings = []
            if above00 != above10:
                t = (WATER_LEVEL - h00) / (h10 - h00)
                crossings.push({ x: wx + t * step, z: wz })
            if above10 != above11:
                t = (WATER_LEVEL - h10) / (h11 - h10)
                crossings.push({ x: wx + step, z: wz + t * step })
            if above01 != above11:
                t = (WATER_LEVEL - h01) / (h11 - h01)
                crossings.push({ x: wx + t * step, z: wz + step })
            if above00 != above01:
                t = (WATER_LEVEL - h00) / (h01 - h00)
                crossings.push({ x: wx, z: wz + t * step })

            if crossings.length >= 2:
                // Compute terrain gradient at each crossing for offset direction
                for each crossing point p:
                    gradient = computeTerrainGradient(p.x, p.z)
                    p.shoreDir = normalize(-gradient)  // toward higher terrain
                    p.waterDir = normalize(gradient)    // toward lower terrain (water)

                segments.push({ start: crossings[0], end: crossings[1] })

    // Build foam strip mesh from segments
    for each segment:
        // Shore side: offset toward higher terrain by FOAM_SHORE_WIDTH
        // Y follows terrain surface
        shoreVert = segment.point + segment.shoreDir * FOAM_SHORE_WIDTH
        shoreVert.y = getTerrainHeight(shoreVert.x, shoreVert.z)

        // Water side: offset toward water by FOAM_WATER_WIDTH
        // Y at water level + small offset to avoid z-fighting
        waterVert = segment.point + segment.waterDir * FOAM_WATER_WIDTH
        waterVert.y = WATER_LEVEL + 0.07

        // Generate quad (2 triangles) connecting shore and water vertices
```

## 7. Heightmap Texture

A 128×128 `DataTexture` (RED channel, Float32) MUST store terrain heights across the water plane extent. Used by the water shader for shore fade. The texture MUST be updated when the player moves more than 5m, staggered across 8 frames (16 rows × 128 columns = 2048 samples per frame).

**Why staggered**: Sampling 128×128 = 16,384 terrain heights in one frame would spike the frame time. Spreading it across 8 frames (2,048 per frame) keeps the cost manageable. The visual artifact is minimal — a brief 8-frame wave of shore fade updating — because the player rarely moves fast enough to notice.

## 8. River System

Rivers are **physically-traced downhill channels** that flow from mountain sources to lakes. Unlike the valley/stream noise carving (§3.2 in VF-TERRAIN), rivers follow actual gradient descent through the terrain, accumulate flow at confluences, and produce visible animated water.

The system spans four files:
- `river-tracer.js` — source discovery, gradient descent, confluence detection, validation
- `terrain-generator.js` — per-vertex river attributes (`streamChannel`, `streamFlowDir`)
- `ground-material.js` — terrain shader river rendering + river water overlay material
- `chunk.js` — river water mesh generation + stream rock placement

### 8.1 River Tracing Algorithm (river-tracer.js)

#### Source Discovery

River sources are discovered on a deterministic grid:

```
for each cell at RIVER_SOURCE_SPACING (64m):
    apply deterministic jitter (35% of spacing, from noise)
    height = getBaseTerrainHeight(x, z)    // pre-river-carving height

    skip if height < RIVER_SOURCE_MIN_ALT (12m)

    // Valley check: sample 8 cardinal directions at RIVER_SOURCE_VALLEY_RADIUS (24m)
    avgSurrounding = average of 8 samples
    skip if height > avgSurrounding + RIVER_SOURCE_VALLEY_DROP (0.0)

    add as candidate source
```

Sources are sorted by elevation (highest first) so tributaries trace before main rivers.

#### Gradient Descent Tracing

Each river traces downhill using gradient descent with momentum:

```
function traceOneRiver(startX, startZ):
    pos = (startX, startZ)
    dir = (0, 0)     // previous direction (momentum)
    flow = 1.0        // accumulates at confluences

    for step = 0 to RIVER_MAX_STEPS (500):
        // Central-difference gradient
        eps = RIVER_GRAD_EPS (2.0m)
        gx = (height(x-eps, z) - height(x+eps, z)) / (2*eps)
        gz = (height(x, z-eps) - height(x, z+eps)) / (2*eps)
        gradDir = normalize(gx, gz)

        // Momentum blend
        dir = gradDir * (1 - RIVER_MOMENTUM) + dir * RIVER_MOMENTUM
        dir = normalize(dir)

        // Step
        pos += dir * RIVER_STEP_SIZE (4.0m)
        store point (x, z, flow)

        // Termination checks
        if height <= WATER_LEVEL + 0.5: mark reachedWater; stop
        if nearest existing river within RIVER_MERGE_DIST (6.0m): merge; stop
```

**Why momentum**: Pure gradient descent gets trapped in shallow terrain pits. Blending 30% of the previous direction carries the river through minor depressions, like real water flowing over small bumps.

#### Pit Escape Mechanism

Every `RIVER_PIT_STUCK_INTERVAL` (20) steps, the tracer checks if the river has descended at least `RIVER_PIT_MIN_DESCENT` (0.3m). If stuck:

1. **Search**: Expanding rings from 0 to `RIVER_PIT_SEARCH_RADIUS` (120m), step `RIVER_PIT_SEARCH_STEP` (8m), 8+ samples per ring
2. **Find**: Lowest terrain point in the search area
3. **Breach**: Linear interpolation from pit to escape point, with extra carving depth stored per segment
4. **Limit**: Maximum `RIVER_PIT_MAX_BREAKS` (8) per river

#### Confluence Detection

A `RiverSpatialHash` (cell size `RIVER_HASH_CELL` = 8m) indexes all traced segments. When a new river traces within `RIVER_MERGE_DIST` (6.0m) of an existing segment:

- The tributary merges into the existing river
- Flow propagates: all downstream segments of the target river gain the tributary's flow
- The tributary is marked as `mergedInto` the target

#### Validation

After all rivers trace, each is validated:
- A river is **valid** if it reached water level OR merged into a valid river (recursive, cycle-guarded)
- Invalid rivers (dead ends) are pruned from the spatial hash

#### Dynamic Retracing

`checkRetrace(playerX, playerZ)` triggers when the player moves more than `RIVER_RETRACE_DIST` (200m). New sources are discovered in the expanded region and traced, integrating into the existing river network.

### 8.2 River Geometry (Width & Carving)

River width follows real hydrology — proportional to √flow:

```
halfWidth = min(RIVER_MAX_HALFWIDTH, RIVER_MIN_HALFWIDTH + RIVER_WIDTH_SCALE × √flow)
         = min(2.8, 0.02 + 0.2 × √flow)
```

River depth follows the same pattern:

```
maxDepth = min(RIVER_MAX_CARVE, RIVER_CARVE_SCALE × √flow)
         = min(5.0, 0.4 × √flow)
```

The cross-section profile is **flat-bottomed with cosine banks**:
- Flat zone width: `max(halfWidth, depth × 1.0)`
- Bank transition width: `max(RIVER_BANK_WIDTH, depth × 1.5)` (1.5m default)
- Within flat zone: full carving depth
- Bank zone: `depth × 0.5 × (1 + cos(π × bankPosition))` — smooth cosine falloff

This profile is subtracted from terrain height via `getRiverCarving(x, z)`, called from `getTerrainHeight()`.

### 8.3 Terrain Shader River Rendering (ground-material.js)

The terrain shader renders river channels using per-vertex attributes:

- `vStreamChannel` — 0 (no river) to 1.0 (river centre), computed by `getRiverFactor()`
- `vStreamFlowDir` — vec2 flow direction from traced segment

#### Bank Rendering

```glsl
float bankFactor = smoothstep(0.0, 0.3, vStreamChannel);
// Uses rock texture × dark wet tint (0.08, 0.11, 0.16)
terrainColor = mix(terrainColor, bankRockColor, bankFactor);
```

Banks fade near water level (`smoothstep(waterLevel - 0.1, waterLevel + 1.0, h)`) so lake shore takes over at the junction.

#### Water Core Rendering (Animated Flow)

```glsl
float waterCore = smoothstep(0.35, 0.7, vStreamChannel);

// Flow-aligned coordinates
float along = dot(worldPos.xz, flowDir);
float across = dot(worldPos.xz, perpDir);

// Three overlapping sine waves at different frequencies
float bedW1 = sin(along * 12.0 - uTime * 6.0 + across * 2.0) * 0.5 + 0.5;
float bedW2 = sin(along * 20.0 - uTime * 10.0 - across * 3.0 + 7.0) * 0.5 + 0.5;
float bedW3 = sin(along * 35.0 - uTime * 16.0 + across * 5.0 + 13.0) * 0.5 + 0.5;

float flowPattern = bedW1 * 0.4 + bedW2 * 0.35 + bedW3 * 0.25;
```

Base river colour is dark blue-grey `(0.06, 0.12, 0.18)` with ±0.18 modulation from the flow pattern. The animation scrolls along the flow direction, creating visible downstream movement.

Weather effects:
- `uRainIntensity` expands channel rendering by 15% during storms
- `uWaterDarken` scales river colours for night/storm darkening
- Rivers fade above snowline altitude

### 8.4 River Water Mesh Overlay (chunk.js)

A semi-transparent water mesh sits above the terrain-rendered channel, adding depth and surface detail.

#### Geometry Generation (`_generateRiverWater`)

1. Query `getSegmentsInArea()` for river segments overlapping the chunk
2. Group segments by `riverId`, sort by `segIdx` to reconstruct chains
3. For each chain, build a triangle strip:
   - Compute perpendicular at each junction (averaged from adjacent segments for smooth bends)
   - Create vertex pairs: `centre ± perpendicular × halfWidth` at `terrainHeight + 0.05m`
   - Per-vertex attributes: `streamFlowDir` (vec2), `flowAmount` (scalar)

#### Material (`getRiverWaterMaterial`)

**Vertex shader**: Applies 3-wave broad undulation aligned to flow direction. Turbulence varies with flow — steep mountain streams are choppier (1.5× amplitude), flat lowland rivers are calmer (0.7×).

**Fragment shader**: Six overlapping sine waves at increasing frequencies (18, 14, 35, 45, 70, 90 cycles/unit) create fine animated ripples. Colour blends between:
- Mountain stream: Cyan-tinted `(0.08, 0.18, 0.24)` → `(0.18, 0.32, 0.38)`
- Lowland river: Blue-grey `(0.08, 0.12, 0.18)` → `(0.16, 0.22, 0.30)`

Alpha is very low (`0.06 + combined × 0.06 + foam × 0.04`) so the terrain channel shows through, with the overlay adding shimmer and depth. No depth write; double-sided rendering.

### 8.5 Stream Rocks (chunk.js)

Rocks are placed along river banks with density inversely proportional to flow:

```
rockChance = 0.4 × (1.0 - min(1.0, flow / 40.0))
```

- **Narrow mountain streams (flow < 40)**: Many rocks (boulders in rapids)
- **Wide lowland rivers (flow > 40)**: Few rocks

Rocks are positioned within `flatWidth + bankWidth × 0.3` of the channel centre, using deterministic hash-based placement (spacing 2.5m along the stream). Size distribution varies with channel width:

| Channel Width | Small | Medium | Large |
|--------------|-------|--------|-------|
| < 0.8m | 85% | 15% | 0% |
| 0.8–2.0m | 50% | 40% | 10% |
| > 2.0m | 30% | 40% | 30% |

### 8.6 Seamless River-to-Lake Junction

Three mechanisms ensure rivers blend seamlessly into lakes with no hard edges:

1. **Channel extension**: The `streamChannel` attribute extends 1m below water level, so the terrain shader renders the river channel right into the lake shallows
2. **Bank suppression**: `bankFactor` fades via `smoothstep(waterLevel - 0.1, waterLevel + 1.0, h)`, so rocky banks give way to normal lake shore near the water edge
3. **Colour matching**: River water core colour `(0.06, 0.12, 0.18)` matches the lake water colour, preventing visible colour discontinuity

> **Why seamless junction matters**: Rivers that abruptly stop at the lake edge look artificial. By extending the channel rendering below water level and matching colours, the river appears to flow naturally into the lake body.
