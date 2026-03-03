# SPEC-12: Performance & Optimization

## 1. Target
- Quest 3: 90 fps sustained
- Desktop: 60 fps minimum

## 2. Instance Caps

| Object | Max Instances | Mesh Type |
|--------|--------------|-----------|
| Trees per type (×4) | 2,000 | InstancedMesh (trunk + canopy) |
| Tussock | 800 | InstancedMesh |
| Grass tufts | 3,000 | InstancedMesh |
| Fern variants (×3) | 3,000 shared | InstancedMesh |
| Flowers | 1,500 | InstancedMesh (3 variants × 6 colors) |
| Rocks (×3 sizes) | 1,000 | InstancedMesh |
| Stream rocks (×3) | disabled | InstancedMesh |
| Fallen logs | 600 | InstancedMesh |
| Stumps | 400 | InstancedMesh |
| Collectible orbs | 500 | InstancedMesh (core + glow + ground glow) |
| Cottages | 50 | Individual meshes (unique geometry) |
| Birds | 40 | InstancedMesh |
| Rain particles | 5,000 | Points geometry |
| Fireflies | 30 | Points geometry (2 layers) |
| Clouds | 20 groups | Sprites (multi-puff) |
| Stars | 2,865 | Points geometry |
| Shooting stars | pooled | Line geometry |

## 3. Chunk Budget
- Max loaded: 121 chunks (11×11 at LOAD_RADIUS=5)
- Load per frame: 2 desktop, 1 VR
- Two-phase build: terrain+trees immediate, detail deferred
- LOD: distant VR chunks use 31 segments (vs 63 near)

## 4. Key Optimizations

### 4.1 Instanced Rendering
All trees, vegetation, flowers, rocks, collectibles use `InstancedMesh` — one draw call per type regardless of count.

### 4.2 Chunk Recycling
Deactivated chunks pooled and reused (geometry buffers updated in-place, not reallocated).

### 4.3 Fog Hides Boundaries
`FOG_NEAR=50, FOG_FAR=130` conceals chunk loading/unloading at distance.

### 4.4 Shared Materials
Ground material, tree materials, vegetation materials are singletons shared across all chunks.

### 4.5 Geometry Merging
Each cottage merges all sub-geometries (walls, roof, chimney, door, windows) into a single `BufferGeometry` — one draw call per cottage.

### 4.6 Canvas Textures
All procedural textures generated once at startup as canvas textures, avoiding runtime generation.

## 5. VR-Specific Optimizations

### 5.1 Terrain LOD
- Near chunks (Chebyshev distance ≤ 2): 63 segments (64×64 grid, ~8k triangles)
- Distant chunks: 31 segments (32×32 grid, ~2k triangles)

### 5.2 Water Geometry Swap
- Desktop: 128×128 subdivisions (300×300m plane)
- VR: 64×64 subdivisions (swapped on session start)

### 5.3 Throttled Updates
| System | Desktop | VR |
|--------|---------|-----|
| Fireflies | every frame | every 2 frames (delta ×2) |
| Birds | every frame | every 2 frames (delta ×2) |
| Wildlife | every frame | every 3 frames (delta ×3) |
| Audio | every frame | every 2 frames |
| Minimap | every 10 frames | every 10 frames |

### 5.4 Staggered Heightmap
- Desktop: 16 rows per frame
- VR: 4 rows per frame (8 rows in the spec, 4 in code)
- Total: 128 rows × 128 columns = 16,384 samples

### 5.5 LOD Detail Skipping
Distant LOD chunks skip: flowers, foam segments, stream rocks, collectibles.

### 5.6 Deferred Cottage Density
`cottageDensity` vertex attribute updated 1 chunk per frame (not all at once).

### 5.7 Dynamic Resolution Scaling (VR)
```
target = sprinting ? 0.55 : moving ? 0.65 : 1.0
dropRate = 7    // reaches target in ~0.15s
recoveryRate = 2  // reaches target in ~0.5s
scale += (target - scale) * min(1, delta * rate)
// Applied per XR view via requestViewportScale()
```

### 5.8 XR Features
- Foveation: 1.0 (maximum)
- Framebuffer scale: 1.0
- `OVR_multiview2` extension attempted (renders both eyes in single pass)

### 5.9 Shadow Map Stabilization
Snaps shadow camera to texel grid to prevent swimming:
```
texelSize = shadowFrustumSize * 2 / shadowMapSize
position = round(position / texelSize) * texelSize
```

### 5.10 Frustum Culling
- All instanced meshes have `frustumCulled = false` (instanced meshes can't be per-instance culled by Three.js)
- Chunk meshes use default frustum culling via bounding sphere
- Sky dome, stars, fireflies, birds: `frustumCulled = false`

## 6. Memory Management
- Chunk pool prevents allocation/deallocation per frame
- Cottage geometry cache (max 100 entries) prevents regenerating unique cabins
- Shared noise buffer (2s) reused by all audio noise sources
- Object pooling for shooting stars
