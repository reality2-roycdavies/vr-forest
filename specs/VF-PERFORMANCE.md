# VF-PERFORMANCE — Performance Budget

**Version:** 0.2 Draft
**Date:** 2026-02-24
**Status:** Draft
**Purpose:** Target frame rate, instance caps, draw call budget, key optimisations, staggered loading rationale, chunk recycling, fog-hides-boundaries design, Quest 3 tuning history, and VR-specific invisible optimisations (foveation, LOD terrain, water grid swap, throttled updates).
**Dependencies:** VF-CONFIG, VF-ARCH, VF-TERRAIN, VF-FOREST, VF-WATER, VF-WEATHER  

---

## Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

---

## 1. Target

The experience MUST maintain **90 fps on Quest 3** (11ms per frame, stereo rendering). All instance caps, optimisations, and rendering choices are driven by this constraint.

---

## 2. Instance Caps

Every instanced object type has a maximum instance count. These caps MUST NOT be exceeded.

| Object | Max Instances | Draw Calls | Notes |
|--------|--------------|------------|-------|
| Trees (per type) | 2000 | 2 (trunk + canopy) × 3 types = 6 | See VF-FOREST |
| Grass tufts | 3000 | 1 | Single `InstancedMesh` |
| Ferns (per variant) | 3000 (shared pool) | 3 | 3 geometry variants |
| Flowers (per colour × variant) | 1500 (shared pool) | 18 | 3 variants × 6 colours |
| Rocks (per size) | 1000 | 3 | Small, medium, large |
| Fallen logs | 600 | 1 | See VF-FOREST |
| Stumps | 400 | 1 | See VF-FOREST |
| Birds | 40 (5 × 8) | 1 | See VF-WILDLIFE |
| Fireflies | 30 | 2 | Core + glow layers |
| Rain particles | 5000 | 1 | `Points` geometry (see VF-WEATHER) |
| Collectibles | 500 | 2 | Core + glow shell (see VF-COLLECTIBLES) |

**Total draw calls from instanced objects:** approximately 37.

---

## 3. Draw Call Budget

Beyond instanced objects, the scene includes:

| Item | Draw Calls | Notes |
|------|------------|-------|
| Terrain chunks | ≤ 121 | (LOAD_RADIUS × 2 + 1)² = 11² (see VF-TERRAIN) |
| Water plane | 1 | Single 300×300m mesh (see VF-WATER) |
| Sky dome | 1 | Render order -2 |
| Sun sprite | 1 | |
| Moon disc | 1 | |
| Stars | 1 | Single `Points` mesh (438 stars) |
| Cloud puffs | ~50–80 | 18 groups × 2–10 puffs each (see VF-ATMOSPHERE) |
| Foam strips | ≤ 121 | One per active chunk (see VF-WATER) |
| Lightning bolts | 0–2 | Only during storms |
| Shadows | 1 pass | Single 2048×2048 shadow map |

All counts are approximate and represent typical worst-case values.

---

## 4. Key Optimisations

| Optimisation | Impact | Rationale |
|-------------|--------|-----------|
| Shadow map 2048 (not 4096) | 75% fewer shadow texels | Acceptable quality with `PCFSoftShadowMap` soft edges |
| Terrain 32×32 vertices (not 64×64) | 75% fewer terrain triangles | ~2k triangles per chunk is sufficient for the gentle terrain |
| Water 128×128 subdivisions (not 400×400) | 90% fewer water triangles | Wave displacement still reads well at this resolution |
| Staggered chunk loading (max 2/frame) | Prevents frame spikes | See §5 |
| Staggered heightmap update (16 rows/frame) | Spreads 16k samples over 8 frames | See §6 |
| Minimap every 10 frames | Reduces terrain sampling | Minimap changes slowly; 10-frame lag is imperceptible |
| Chunk recycling pool | Zero GC from chunk lifecycle | See §7 |
| Fog hides chunk boundaries | No LOD system needed | See §8 |
| Foveated rendering (Quest) | GPU savings on peripheral vision | Level 1.0 (maximum); eye-tracked keeps gaze centre sharp |
| VR terrain LOD | 50% fewer terrain tris in VR | Distant chunks use 31 segments vs 63; see §9.2 |
| VR water grid swap | 75% fewer water vertex calcs | 64×64 grid in VR vs 128×128; see §9.3 |
| VR update throttling | ~5% CPU savings | Birds/wildlife/fireflies/audio skip frames; see §9.4 |
| VR chunk load limiting | Smoother frame times | 1 chunk/frame in VR vs 2; see §9.5 |
| All textures 64–256px | Minimal GPU memory | Procedural textures generated once at startup |

---

## 5. Staggered Chunk Loading

Creating a chunk involves thousands of noise evaluations (terrain height for each vertex + tree/vegetation/collectible placement). The system MUST NOT process more than `MAX_CHUNKS_PER_FRAME = 2` chunks per frame.

**Why:** Doing this for multiple chunks in one frame causes visible frame hitches (>11ms). Limiting to 2 per frame keeps the per-frame cost predictable. The player rarely notices because fog hides unloaded areas (see §8).

Missing chunks are queued sorted by distance (closest first), so the player's immediate surroundings load first.

---

## 6. Staggered Heightmap Update

The water shader uses a 128×128 `DataTexture` of terrain heights for shore fade effects (see VF-WATER). When the player moves more than 5m, this texture MUST be regenerated — but sampling 128 × 128 = 16,384 terrain heights in one frame would spike the frame time.

The update MUST be staggered across 8 frames: 16 rows × 128 columns = 2,048 samples per frame. The visual artifact is minimal — a brief 8-frame wave of shore fade updating — because the player rarely moves fast enough to notice.

---

## 7. Chunk Recycling

Geometry buffers MUST be reused, not destroyed. When a chunk moves beyond `UNLOAD_RADIUS = 7`, it is returned to a pool. The pool caps at (LOAD_RADIUS × 2 + 1)² entries.

**Why:** In garbage-collected languages (JavaScript), destroying objects creates work for the garbage collector, which can cause unpredictable frame-time spikes. Pooling avoids this entirely. The same principle applies to any GC-managed runtime (C#/Unity, GDScript/Godot).

---

## 8. Fog Hides Boundaries

Scene fog (linear, base near=120, far=250; see VF-ATMOSPHERE) serves triple duty:

1. **Hides chunk load/unload boundaries** — no pop-in visible
2. **Matches sky at the horizon** — no hard edge between ground and sky
3. **Reduces effective render distance** — fewer distant objects visible, saving GPU

This eliminates the need for a level-of-detail (LOD) system for trees and vegetation. Trees and vegetation beyond the fog distance are invisible, so they don't need low-detail stand-ins.

> **Note**: A terrain LOD system was later added for VR only (see §9.2). Fog still hides chunk boundaries on desktop, but in VR the stereo rendering cost makes distance-based terrain LOD worthwhile even though the fog already obscures detail.

Weather reduces fog distance via `fogMultiplier` (1.0 sunny → 0.6 rainy; see VF-WEATHER), which further reduces the visible object count during storms — conveniently offsetting the cost of rain particles.

---

## 9. What Was Tuned and Why

The reference implementation was developed on desktop and then tested on Quest 3, where significant frame drops occurred. The systematic performance pass reduced:

| Item | Before | After | Impact |
|------|--------|-------|--------|
| Rain particles | 4000 | 2000 | Biggest GPU win — particles are expensive in stereo VR |
| Rain ripple layers (water shader) | 20 | 10 | Reduced fragment shader cost on water surface |
| Cloud count | 30 | 18 | Fewer blended transparent sprites |
| Tree instances (per type) | 2000 | 1200 → 2000 | Initially reduced; raised back when other savings freed headroom |

> **Note:** Rain particles were later raised back to 5000 in `RAIN_PARTICLE_COUNT` after additional shader optimisations. The table above reflects the tuning journey, not necessarily the final values. Always refer to VF-CONFIG for authoritative parameter values.

### 9.1 Renderer Configuration

These renderer settings are performance-critical (see also VF-ARCH):

| Setting | Value | Why |
|---------|-------|-----|
| Shadow map size | 2048×2048 | Halved from 4096 for Quest performance |
| Shadow map type | PCFSoftShadowMap | Soft edges hide the low resolution |
| Pixel ratio | min(devicePixelRatio, 2) | Beyond 2× is wasted on VR headsets |
| Camera far plane | 250m | Matches fog far; don't increase without testing depth buffer precision |
| Foveated rendering | Level 1.0 (maximum) | Eye-tracked on Quest 3; see §9.2 |
| XR framebuffer scale | 1.0 (native) | No supersampling; see §9.2 |
| XR reference space | `local-floor` | No additional processing |

> ⚠️ **Gotcha: Camera far plane.** Increasing the far plane to 600m (to see distant mountains) caused the entire sky to go black on one platform due to depth buffer precision loss. The sky dome (radius 200m) needs sufficient Z precision. Keep the far plane at 250m and use fog to hide the boundary.

### 9.2 VR-Specific Invisible Optimisations

All optimisations in this section gate on `vr.isInVR()` and are **only active during immersive XR sessions**. Desktop rendering is unchanged. The goal is maximum VR performance with zero visible quality reduction.

#### Foveation and Framebuffer Scale (vr-setup.js)

| Setting | Desktop | VR | Savings |
|---------|---------|-----|---------|
| `setFoveation()` | n/a | 1.0 (maximum) | 25–40% fill rate |
| `setFramebufferScaleFactor()` | n/a | 1.0 (native) | ~20% fill rate |

**Foveation 1.0**: Quest 3 uses eye-tracked foveation. At level 1.0, the gaze centre stays at full resolution while the periphery — already blurred by the headset's optics — renders at reduced resolution. This is the single biggest performance win.

**Framebuffer 1.0**: The earlier setting of 1.1× (supersampling at 110% native resolution) cost 21% more pixels. With foveation at 1.0 keeping the gaze centre sharp, supersampling is redundant.

> **History**: Foveation was initially set to 0.5 and framebuffer scale to 1.1 during early Quest 3 testing. Raising foveation to 1.0 and dropping the scale factor to 1.0 produced no visible quality difference but a significant frame-rate improvement.

### 9.3 Terrain LOD for Distant Chunks (chunk-manager.js, chunk.js)

| Distance from player | Segments | Vertices | Triangles |
|---------------------|----------|----------|-----------|
| ≤ 2 chunks (≤64m) | 63 (CHUNK_SEGMENTS) | 4,096 | ~8k |
| > 2 chunks (>64m) | 31 (CHUNK_SEGMENTS_LOD) | 1,024 | ~2k |

In VR, chunks beyond 2 chunk-widths from the player use `CHUNK_SEGMENTS_LOD = 31` segments instead of `CHUNK_SEGMENTS = 63`. This reduces distant terrain triangles by 75%.

**Why invisible**: The terrain shader does all visual detail per-pixel (grass/rock/snow blending, river textures, altitude zone transitions). At 64m+ with fog starting at 50m, the vertex grid resolution has no visible effect on appearance.

**Implementation**:
- `ChunkManager._getSegments(chunkDist)` returns LOD segment count when `isInVR && dist > 2`
- When the player crosses a chunk boundary, existing chunks are queued for LOD rebuild if their segment count doesn't match the target
- `Chunk.build(cx, cz, segments)` accepts a segment count parameter
- LOD rebuilds share the per-frame budget with new chunk loads (1/frame in VR)

> ⚠️ **Gotcha: Scene graph cleanup during LOD rebuild.** When rebuilding a chunk with a different segment count, the old mesh MUST be removed from the scene before its geometry is disposed. Failing to do this leaves an orphaned mesh with null geometry in the scene graph, which crashes the WebXR renderer. The fix: `if (parent) parent.remove(this.mesh);` before `this.mesh.geometry.dispose();`. This was a specific VR crash discovered during testing.

### 9.4 Water Grid Swap (main.js)

| Mode | Subdivisions | Vertices | Wave calls/frame |
|------|-------------|----------|-----------------|
| Desktop | 128×128 | 16,384 | ~81,920 (per eye) |
| VR | 64×64 | 4,096 | ~20,480 (per eye) |

Two `PlaneGeometry` instances are created at startup: `waterGeomHi` (128×128) and `waterGeomLo` (64×64). On XR `sessionstart`, the water plane swaps to the low-resolution geometry; on `sessionend`, it swaps back.

The grid step constant (`WATER_GRID_STEP`) MUST be updated to match the active geometry (`300/128` for desktop, `300/64` for VR) since the wave displacement snap-to-grid logic depends on it.

**Why invisible**: At 64×64 (4.7m grid spacing), the vertex displacement still captures the gentle swells (wavelengths 10–30m). All fine visual detail — ripples, flecks, shore fade, rain rings — comes from the fragment shader, which is unchanged.

### 9.5 Throttled Non-Visual Updates (main.js)

In VR, several systems skip frames to reduce CPU load. Delta is multiplied to compensate, so movement speed stays correct:

| System | Desktop | VR | Delta compensation |
|--------|---------|-----|-------------------|
| Birds | Every frame | Every 2 frames | delta × 2 |
| Wildlife | Every frame | Every 3 frames | delta × 3 |
| Fireflies | Every frame | Every 2 frames | delta × 2 |
| Audio spatial | Every frame | Every 2 frames | delta × 2 |

```javascript
const frame = _frameCount++;
if (!inVR || frame % 2 === 0) birds.update(delta * (inVR ? 2 : 1), ...);
if (!inVR || frame % 3 === 0) wildlife.update(delta * (inVR ? 3 : 1), ...);
```

**Why invisible**: At 72fps VR, a 36fps update rate for birds and fireflies is still smooth — the human eye cannot detect the difference in animation quality for distant, small-scale movement.

### 9.6 Chunk Load Limiting in VR (chunk-manager.js)

| Mode | Max chunks/frame |
|------|-----------------|
| Desktop | 2 (MAX_CHUNKS_PER_FRAME) |
| VR | 1 |

Each chunk build involves thousands of noise evaluations for terrain height + tree/vegetation placement. In VR, limiting to 1 chunk per frame prevents frame spikes during loading. The player rarely notices because fog hides unloaded areas and chunks are loaded closest-first.

---

## 10. Verification

### Performance Checks

- [ ] Steady 90 fps on Quest-class hardware
- [ ] No visible chunk pop-in (fog masks it)
- [ ] No frame spikes during chunk loading (staggered to max 2/frame desktop, 1/frame VR)
- [ ] No garbage collection pauses (chunk recycling pool)
- [ ] Rain particles don't cause frame drops in VR (check stereo rendering cost)
- [ ] VR scene looks identical to desktop (no visible quality reduction)
- [ ] Entering/exiting VR correctly swaps water geometry and restores full quality
- [ ] Distant terrain in VR shows no visible LOD transitions (fog + per-pixel shading masks it)
- [ ] Birds/fireflies/wildlife still animate smoothly in VR at reduced update rate
- [ ] No VR crash when walking across chunk boundaries (LOD mesh cleanup)

### What WRONG Looks Like

| Symptom | Likely Cause |
|---------|--------------|
| Periodic frame drops every few seconds | Chunk loading not staggered; processing too many chunks per frame |
| Stutters when walking steadily | GC pauses from chunk destruction instead of recycling |
| Terrain pops in visually | Fog distance too far or fog not matching sky colour |
| Frame rate drops during rain | Too many rain particles or ripple layers for the GPU |
| Sky goes black at distance | Camera far plane too large, causing depth buffer precision loss |
| VR crashes when walking around | Orphaned mesh from LOD rebuild; old mesh not removed from scene before geometry dispose |
| Water looks blocky in VR | Water grid swap not working; check geometry swap on sessionstart |
| Terrain has visible facets at distance in VR | LOD chunk segments too low or fog not hiding the boundary |
