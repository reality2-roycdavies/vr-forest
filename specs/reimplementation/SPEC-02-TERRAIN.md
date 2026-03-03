# SPEC-02: Terrain Generation

## 1. Chunk System

### 1.1 Parameters
- `CHUNK_SIZE`: 32 meters per side
- `CHUNK_SEGMENTS`: 63 (produces a 64x64 vertex grid = 63x63 quads ~ 7,938 triangles)
- `CHUNK_SEGMENTS_LOD`: 31 (32x32 vertex grid for distant VR chunks)
- `LOAD_RADIUS`: 5 chunks (11x11 = 121 chunks max loaded)
- `UNLOAD_RADIUS`: 7 chunks (beyond this, recycle)
- `MAX_CHUNKS_PER_FRAME`: 2 desktop, 1 VR

### 1.2 Chunk Lifecycle
- Chunks are addressed by integer coordinates: `chunkX = floor(playerX / 32)`, `chunkZ = floor(playerZ / 32)`
- New chunks queued sorted by Manhattan distance from player (closest first)
- Recycled from a pool (max pool size = (LOAD_RADIUS * 2 + 1)^2 = 121)
- Two-phase build:
  - Phase 1 (immediate frame): terrain mesh + trees + cottages
  - Phase 2 (next frame): vegetation + flowers + rocks + logs + collectibles
- LOD chunks (segment count = 31) skip Phase 2 entirely (no flowers, foam, stream rocks, collectibles)

### 1.3 LOD Decision
```
if (VR mode AND chunk Chebyshev distance from player > 2):
    segments = CHUNK_SEGMENTS_LOD (31)
else:
    segments = CHUNK_SEGMENTS (63)
```

### 1.4 Mesh Attributes
Each chunk mesh has these vertex attributes:
- `position` (vec3) -- world-local vertex position
- `normal` (vec3) -- central-difference surface normal
- `uv` (vec2) -- world-space tiling: `(worldX / CHUNK_SIZE * GROUND_TEX_REPEAT, worldZ / CHUNK_SIZE * GROUND_TEX_REPEAT)` where GROUND_TEX_REPEAT = 6
- `treeDensity` (float) -- remapped noise value for shader dirt/forest floor
- `cottageDensity` (float) -- smooth falloff for garden clearing effect
- `streamChannel` (float) -- river channel proximity 0..1
- `streamFlowDir` (vec2) -- river flow direction

### 1.5 forceLoadAll
On startup, all chunks within LOAD_RADIUS are loaded synchronously (no per-frame budget). All Phase 2 work is also drained immediately.

---

## 2. Noise System

### 2.1 PRNG: mulberry32
Deterministic 32-bit PRNG used to seed each noise instance:
```
function mulberry32(seed):
    seed = (seed + 0x6D2B79F5) | 0
    t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
```

### 2.2 Noise Instances
14 independent 2D simplex noise instances, each seeded with `TERRAIN_SEED + offset`:

| Instance | Seed Offset | Variable | Purpose |
|----------|-------------|----------|---------|
| 0 | +0 | noise2D | Main terrain fBm |
| 1 | +1 | treeNoise2D | Tree density |
| 2 | +2 | vegNoise2D | Vegetation density |
| 3 | +3 | jitterNoise2D | Position jitter + raw noise |
| 4 | +4 | dirtNoise2D | Dirt patches |
| 5 | +5 | rockNoise2D | Rock placement |
| 6 | +6 | streamNoise2D | Stream/valley ridges |
| 7 | +7 | warpNoise2D | Domain warp for valleys |
| 8 | +8 | collectibleNoise2D | Collectible placement |
| 9 | +9 | mountainNoise2D | Mountain ridge noise |
| 10 | +10 | mountainWarpNoise2D | Mountain domain warp |
| 11 | +11 | mountainDetailNoise2D | Mountain detail modulation |
| 12 | +12 | logNoise2D | Fallen log placement |
| 13 | +13 | cottageNoise2D | Cottage placement |

`TERRAIN_SEED = 42`

### 2.3 Fractal Brownian Motion (fBm)
```
function fractalNoise(x, z, scale, octaves, persistence, lacunarity):
    value = 0, amplitude = 1, frequency = scale, maxValue = 0
    for i in 0..octaves-1:
        value += noise2D(x * frequency, z * frequency) * amplitude
        maxValue += amplitude
        amplitude *= persistence
        frequency *= lacunarity
    return value / maxValue    // normalized to [-1, 1]
```

### 2.4 Density Functions
All return raw simplex noise at specified frequency:

| Function | Noise Instance | Input Scaling | Output |
|----------|---------------|---------------|--------|
| getTreeDensity(x,z) | treeNoise2D | x*0.05, z*0.05 | [-1, 1] |
| getVegDensity(x,z) | vegNoise2D | x*0.08, z*0.08 | [-1, 1] |
| getRockDensity(x,z) | rockNoise2D | x*0.04, z*0.04 | [-1, 1] |
| getCollectibleDensity(x,z) | collectibleNoise2D | x*0.03, z*0.03 | [-1, 1] |
| getLogDensity(x,z) | logNoise2D | x*0.04, z*0.04 | [-1, 1] |
| getCottageDensity(x,z) | cottageNoise2D | x*0.02, z*0.02 | [-1, 1] |
| getDirtAmount(x,z) | dirtNoise2D | two octaves: x*0.03 + x*0.093 | [0, 1] |
| getJitter(x,z) | jitterNoise2D | x*0.7, z*0.7 | {x, z} pair |
| getMountainFactor(x,z) | multiple | see S3.3 | [0, 1] |
| getTerrainSlope(x,z) | via getTerrainHeight | central differences eps=0.5 | slope magnitude |

---

## 3. Height Calculation

### 3.1 Base Fractal Terrain
```
baseHeight = fractalNoise(x, z, TERRAIN_SCALE=0.008, TERRAIN_OCTAVES=4,
                          TERRAIN_PERSISTENCE=0.45, TERRAIN_LACUNARITY=2.2)
             * TERRAIN_HEIGHT(8)
```
This produces rolling hills in the range approximately [-8, +8] meters.

### 3.2 Valley Carving (Stream Channels)
Domain-warped ridge noise creates natural valley channels:
```
warpX = warpNoise2D(x * 0.006, z * 0.006) * VALLEY_WARP(22)
warpZ = warpNoise2D(x * 0.006 + 100, z * 0.006 + 100) * VALLEY_WARP(22)

raw = streamNoise2D((x + warpX) * VALLEY_SCALE(0.009),
                     (z + warpZ) * VALLEY_SCALE(0.009))
ridge = 1 - abs(raw)                     // ridge: peaks at noise zero-crossings
channel = pow(ridge, VALLEY_SHARPNESS(2)) // sharpen channel

normalizedH = (baseHeight / TERRAIN_HEIGHT + 1) * 0.5
carveMask = max(0, 1 - normalizedH * 0.8) // carve more at low elevations

valleyCarvedHeight = baseHeight - channel * VALLEY_DEPTH(6.0) * carveMask
```

### 3.3 Mountain Chains (Additive Ridge Noise)
Mountains use a separate noise pipeline with domain warp:
```
mwx = mountainWarpNoise2D(x * 0.004, z * 0.004) * MOUNTAIN_WARP(35)
mwz = mountainWarpNoise2D(x * 0.004 + 200, z * 0.004 + 200) * MOUNTAIN_WARP(35)

mRaw = mountainNoise2D((x + mwx) * MOUNTAIN_SCALE(0.003),
                        (z + mwz) * MOUNTAIN_SCALE(0.003))
mRidge = 1 - mRaw * mRaw                       // smooth parabolic peaks
mChannel = pow(mRidge, MOUNTAIN_SHARPNESS(1.0))

// Detail modulation
mDetail = mountainDetailNoise2D(
    (x + mwx) * 0.003 * 2.5, (z + mwz) * 0.003 * 2.5)
mBlended = mChannel * (0.7 + mDetail * 0.3)    // range 0.4..1.0

// Amplitude modulation (larger-scale variation)
ampMod = mountainDetailNoise2D(x * 0.0012, z * 0.0012) * 0.4 + 0.6  // 0.2..1.0

// Threshold masking
mMask = max(0, mBlended - MOUNTAIN_THRESHOLD(0.25)) / (1 - 0.25)

// Suppress mountains near spawn point
spawnDist = sqrt(x*x + z*z)
spawnFade = clamp((spawnDist - 60) / 40, 0, 1)  // fade in from 60-100m
```

### 3.4 Foothills
Gentle rolling hills near mountain bases:
```
foothillNoise = mountainDetailNoise2D(x * FOOTHILL_SCALE(0.008),
                                       z * FOOTHILL_SCALE(0.008))
foothillBase = foothillNoise * 0.5 + 0.5        // remap to 0..1
foothillProximity = min(1, mBlended * 2.5)       // proximity to mountain
foothillH = foothillBase * foothillProximity * FOOTHILL_HEIGHT(6)
```

### 3.5 Mountain Valley Depression
Depressions between mountain ridges (creates mountain lakes):
```
valleyDip = foothillProximity * (1 - mMask) * MOUNTAIN_VALLEY_DEPTH(5)
```

### 3.6 Final Height
```
getBaseTerrainHeight(x, z) = valleyCarvedHeight +
    (mMask * ampMod * MOUNTAIN_HEIGHT(45) + foothillH - valleyDip) * spawnFade
```

**getTerrainHeight(x, z)** currently returns `getBaseTerrainHeight(x, z)` directly. River carving (`- getRiverCarving(x, z)`) is defined but disabled.

**getTerrainHeightApprox(x, z)** is a fast version that only computes base fBm + valley carving (no mountains). Used for the water heightmap and minimap. ~46% fewer noise evaluations (7 vs 13).

---

## 4. Normal Computation
Normals are computed via central finite differences:
```
for each vertex (ix, iz):
    hL = height at (ix-1, iz)    // left
    hR = height at (ix+1, iz)    // right
    hU = height at (ix, iz-1)    // up
    hD = height at (ix, iz+1)    // down

    // For boundary vertices, use getTerrainHeight() to sample across chunk borders
    // This ensures seamless normals at chunk boundaries

    nx = hL - hR
    ny = 2 * step             // where step = CHUNK_SIZE / segments
    nz = hD - hU
    normalize(nx, ny, nz)
```

---

## 5. Altitude Biomes

| Zone | Y Threshold | Ground Color (RGB) |
|------|-------------|-------------------|
| Lake/Water | <= -3.5 | Water shader |
| Shore | -3.5 to -2.8 | (0.85, 0.75, 0.55) sandy beige |
| Lowland Forest | -2.8 to 10 | Gradient: (0.13,0.24,0.06) to (0.28,0.45,0.12) to (0.35,0.50,0.18) |
| Subalpine | 10 | (0.15, 0.28, 0.08) dark forest green |
| Treeline/Tussock | 16 | (0.55, 0.50, 0.30) tan/olive |
| Alpine Rock | 20 | (0.45, 0.42, 0.38) grey-brown |
| Snow | 20+ | (1.4, 1.42, 1.5) bright (>1.0 for emissive glow) |
| Steep Slopes | slope-based | (0.28, 0.27, 0.26) dark grey rock |

Zone boundaries are perturbed by 3 octaves of noise (+/-2-4 meters) to create natural transitions. Transitions use wide smoothstep blending (typically +/-3-8m).

---

## 6. Ground Material Shader

The ground uses a `MeshPhongMaterial` (specular 0, shininess 0) with extensive `onBeforeCompile` injection. The shader handles:

### 6.1 Shore Boundary
```glsl
shoreNoise = sin(x*1.7+z*0.9)*0.5 + sin(x*0.5-z*1.3)*0.7 + sin(x*3.1+z*2.3)*0.25;
effectiveShore = SHORE_LEVEL + shoreNoise * 0.25;
```
This creates an irregular, organic coastline instead of a straight waterline.

### 6.2 Dirt Under Trees
Uses the `treeDensity` vertex attribute:
```glsl
dirtDetail = vnoise(xz*0.15)*0.14 + vnoise(xz*0.6+20)*0.10 + vnoise(xz*1.7+55)*0.08;
dirtFactor = smoothstep(0.25, 0.85, treeDens + dirtDetail);
```

### 6.3 Garden Clearing
Uses the `cottageDensity` vertex attribute for smooth earth near cottages:
```glsl
gardenFactor = smoothstep(0.02, 0.55, cottageDensity + gardenNoise);
```

### 6.4 Snow (Slope-Aware)
Snow only accumulates on shallow slopes:
```glsl
snowBlend = smoothstep(snowlineH - 6.0, snowlineH + 8.0, height) + noise;
slopeFlat = smoothstep(0.38, 0.95, slopeNormal.y + slopeNoise);
color = mix(color, SNOW_COLOR, snowBlend * slopeFlat);
```

### 6.5 River Rendering in Shader
Stream channels are rendered directly in the ground shader using the `streamChannel` and `streamFlowDir` attributes:
- Bank zone: wet dark rock texture
- Water core: animated flowing water with 3 sine waves along flow direction
- River color: `vec3(0.14, 0.24, 0.32)`

### 6.6 Dynamic Shore Effects
The shore has animated wave lapping:
- 4 overlapping waves with domain-warped curved fronts
- Foam froth at advancing wave front
- Wet sand trail behind receding wave
- Deep water visibility falloff: `exp(-depthBelow * 2.5)`

### 6.7 Weather Wetness
When raining, ground darkens and shifts cool:
```glsl
color *= mix(1.0, 0.65, uWetness);
color += vec3(-0.01, -0.005, 0.015) * uWetness;  // blue shift
```

### 6.8 Normal Perturbation
Per-pixel noise added to normals to mask Mach band artifacts:
```glsl
nX = noise(x * 3.73) * 0.16 + noise(x * 8.41) * 0.10;
nZ = noise(z * 3.73) * 0.16 + noise(z * 8.41) * 0.10;
worldNormal = normalize(vWorldNormal + vec3(nX, 0.0, nZ));
```

### 6.9 Shadow Suppression Near Water
Prevents terrain below dynamic waterline from receiving incorrect shadows:
```glsl
dynamicWaterLevel = WATER_LEVEL + waveHeight(xz, time);
shadowSuppress = smoothstep(dynamicWaterLevel - 1.5, dynamicWaterLevel + 2.0, y);
directDiffuse = mix(indirectDiffuse * 0.6, directDiffuse, shadowSuppress);
```

### 6.10 Anti-Tiling (Quilez Technique 3)
All procedural textures use noise-driven UV offset interpolation to break up visible tiling:
```glsl
k = vnoise(uv * 0.005);
l = k * 8.0;
i = floor(l);
f = smoothstep(fract(l));
return mix(texture(tex, uv + offsetA), texture(tex, uv + offsetB), f);
```

### 6.11 Detail Texture Overlay
Four procedural canvas textures (grass 512x512, sand 512x512, dirt 512x512, rock 512x512) are blended based on terrain type. Each is sampled at two rotated UV bases (0 degrees and 30 degrees) to further reduce repetition. Applied as additive detail x 1.5.

---

## 7. Procedural Ground Textures

Four 512x512 canvas textures generated at startup:

### 7.1 Grass Texture
Base `#8a8a7a` (neutral mid-tone) with:
- 600 grass blade strokes (vertical lines, 3-11px, varied greens)
- 200 soil speckles (earthy tones, 0.5-2.5px)
- 30 pebble details (ellipses, 1-3.5px)

### 7.2 Sand Texture
Base `#9a9080` (warm sandy) with:
- 1500 fine sand grains (0.3-1.1px)
- 40 scattered pebbles (ellipses)
- 15 shell fragments (arcs)
- 25 ripple lines (bezier curves)

### 7.3 Dirt Texture
Base `#7a6a58` (earthy brown) with:
- 300 soil clumps (0.5-3px)
- 50 small stones (ellipses)
- 20 root/twig traces (thin dark curves)
- 800 fine soil speckles (0.5-1.5px)

### 7.4 Rock Texture
Base `#6a6764` (cool grey) with:
- 200 broad stone grain patches (2-10px)
- 25 cracks (multi-step dark lines, 8-33px)
- 20 lichen patches (green-grey)
- 600 mineral speckles (fine dots)

All textures use `drawWrapped()` for seamless tiling at edges. All use `RepeatWrapping`, `LinearMipmapLinearFilter`, and maximum anisotropic filtering.

---

## 8. River System (Currently Disabled but Fully Specified)

### 8.1 Source Discovery
- Grid spacing: 64m
- Minimum source altitude: 12m (subalpine zone)
- Valley check: sample 8 points in ring at 24m radius; source must be at or below surrounding average

### 8.2 River Tracing (Gradient Descent)
```
step_size = 4.0m
gradient_epsilon = 2.0m (central differences)
max_steps = 500
momentum = 0.3

for each step:
    gx = (height(x-eps) - height(x+eps)) / (2*eps)
    gz = (height(z-eps) - height(z+eps)) / (2*eps)
    direction = normalize(gx, gz)
    direction = direction * (1 - momentum) + prevDirection * momentum
    x += direction.x * step_size
    z += direction.z * step_size
    flow += 1

    terminate if: reached WATER_LEVEL + 0.5, merged with other river,
                  stuck (no descent over 20 steps), zero gradient
```

### 8.3 River Width from Flow
```
halfWidth = min(RIVER_MAX_HALFWIDTH(2.8),
                RIVER_MIN_HALFWIDTH(0.02) + RIVER_WIDTH_SCALE(0.2) * sqrt(flow))
carveDepth = min(RIVER_MAX_CARVE(5.0), RIVER_CARVE_SCALE(0.4) * sqrt(flow))
```

### 8.4 Spatial Hash
Segments stored in a grid-based spatial hash (cell size 8m) for fast nearest-segment queries. Searches 3x3 cell neighborhood. Returns distance, segment reference, and interpolation parameter t.

### 8.5 Confluence
When a traced river comes within 6m of an existing river segment, it merges. The tributary's accumulated flow is added to the target river from the merge point onward.

### 8.6 Pit Escape
If a river gets stuck in a local minimum, a spiral search (max 120m radius, 8m step) finds the nearest lower terrain point. Intermediate "breach" segments are created with extra carving depth to cut through the barrier.
