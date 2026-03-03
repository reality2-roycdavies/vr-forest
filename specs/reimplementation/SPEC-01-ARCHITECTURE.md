# SPEC-01: System Architecture

This document defines the full system architecture for "VR Endless Forest", including the module map, initialization sequence, render loop, renderer configuration, camera rig, VR session handling, weather data flow, chunk lifecycle, and render order.

---

## 1. Module Map

The system consists of 30 modules organized into 4 domains plus core.

### Core Modules

| Module | Role |
|--------|------|
| `main` | Entry point, render loop, HUD, heightmap, minimap |
| `config` | All tunable constants (~250 parameters) |
| `vr-setup` | WebXR renderer, camera rig, controllers |
| `input` | Keyboard/mouse/gamepad polling |
| `movement` | Player locomotion, collision, physics |

### Terrain Domain

| Module | Role |
|--------|------|
| `noise` | 14 seeded simplex noise instances, height functions |
| `terrain-generator` | Heightmap geometry for one chunk |
| `chunk` | Single chunk: mesh + placement of all objects |
| `chunk-manager` | Chunk lifecycle: load/unload/recycle around player |
| `ground-material` | Shared terrain shader material with altitude biomes |
| `river-tracer` | Physically-traced river system (currently disabled) |

### Forest Domain

| Module | Role |
|--------|------|
| `tree-factory` | 4 tree type geometries + materials |
| `tree-pool` | Instanced mesh pool for trees |
| `vegetation` | Grass, ferns, flowers, rocks, logs, stumps, foam |
| `textures` | Procedural canvas textures (bark, canopy, rock) |
| `birds` | Bird flock system with crow caw audio |
| `wildlife` | Peek encounter system (bear, lion, Wally) |
| `collectibles` | Fairy-light orbs, scoring, collection |
| `cottage-factory` | Procedural log cabin geometry |
| `cottage-system` | Cottage placement, smoke particles, window glow |

### Atmosphere Domain

| Module | Role |
|--------|------|
| `day-night` | Solar/lunar ephemeris, sky dome, palette blending, stars, planets, Milky Way, clouds, shooting stars |
| `sky` | Vertex-colored sky sphere (legacy, superseded by day-night shader) |
| `lighting` | Hemisphere + directional light creation |
| `fog` | Scene fog setup |
| `fireflies` | Night-time firefly particles |
| `weather` | Weather state machine, rain, lightning, thunder audio, snow |
| `wind` | Shared wind uniforms + GLSL displacement chunks |
| `audio` | All procedural audio synthesis |
| `star-catalog` | 2,865-star binary catalog |
| `planet-ephemeris` | Keplerian orbital mechanics for 5 planets |

---

## 2. Initialization Sequence (Boot Order)

The application boots in this exact order:

1. **Scene**: Create `THREE.Scene`
2. **VR Setup**: Create renderer (WebGL, antialias, shadows), camera (FOV 70, near 0.1, far 600), dolly rig (Group containing camera + 2 controllers), VR button
3. **Input Manager**: Attach keyboard/mouse/gamepad listeners
4. **Movement System**: Create with references to VR and input
5. **Day/Night System**: Create sky dome, sun, moon, stars, planets, Milky Way, clouds, lights, fog
6. **Firefly System**: Create 30 point particles
7. **Ambient Audio**: Create (not started -- audio requires user gesture)
8. **Weather System**: Create state machine, rain particles, lightning bolts
9. **Ground Material**: Force singleton creation, set anisotropic filtering to GPU max
10. **Chunk Manager**: Create, wire to movement system
11. **Water Surface**: Create water plane (300x300m), inject custom wave shader
12. **Tree Pool**: Create 4 instanced mesh pairs (trunk + canopy, 2000 each)
13. **Vegetation Pool**: Create grass, fern, flower, rock, log, stump instanced meshes
14. **Wildlife System**: Create bear, lion, Wally meshes (hidden)
15. **Bird Flock System**: Create 5 flocks x 8 birds instanced mesh
16. **Cottage System**: Create (empty, populated on chunk load)
17. **Collectible System**: Create core/glow/ground-glow instanced meshes
18. **Wire callbacks**: `chunkManager.onChunksChanged` -> rebuild tree pool, vegetation, cottages, collectibles
19. **River trace**: Initialize river tracer at origin with 800m radius
20. **Position player**: Dolly at (0, 0, 0), rotation Y = pi (face south toward lake)
21. **Force-load all chunks**: Synchronous initial load of all chunks within LOAD_RADIUS
22. **Generate initial heightmap**: Fill 128x128 height samples for water shore fade
23. **Create HUD elements**: Time offset overlay, score display, weather display, minimap (desktop + VR versions)
24. **Start render loop**: `renderer.setAnimationLoop(onFrame)`

---

## 3. Render Loop (Per-Frame Update Order)

Each frame executes in this exact order:

```
1.  delta = min(clock.getDelta(), 0.1)          // cap to avoid physics explosion
2.  input.update()                               // poll controllers/keyboard
3.  movement.update(delta)                       // locomotion, collision, physics
4.  pos = player position
5.  riverTracer.checkRetrace(pos.x, pos.z)       // retrace rivers if moved 200m
6.  chunkManager.update(pos.x, pos.z, inVR)      // load/unload chunks
7.  water plane snap to grid + advance time       // prevent wave sliding
8.  heightmap staggered update                    // 16 rows/frame desktop, 4 VR
9.  deferred cottage density                      // 1 chunk/frame
10. ground material time update
11. wind animation update
12. weather.update(delta, sunElev, pos, windDir, terrainH)
    -> drives: wind strength, ground wetness, rain intensity,
      water wave amplitude, water color, water specular
13. time scrubbing: dayNight.timeOffset += input.timeAdjust * delta * 3
14. dayNight.update(pos, camera, delta, weather, inVR)
    -> updates: sky colors, sun/moon position, star rotation,
      planet positions, cloud tinting, shadow map, fog
15. fireflies.update(delta, pos, sunElev, weather)  // throttled: every 2 frames in VR
16. birds.update(delta, pos, sunElev)                // throttled: every 2 frames in VR
17. wildlife.update(delta, pos, sunElev)             // throttled: every 3 frames in VR
18. audio.update(delta, sunElev, pos, dir, ...)      // throttled: every 2 frames in VR
19. weather.updateAudio(...)                         // rain/thunder audio
20. cottages.update(delta, sunElev)                  // smoke + window glow
21. collectibles.update(delta, pos, audio, sunElev)  // animation + pickup
22. minimap render                                   // every 10 frames
23. VR dynamic resolution scaling                    // 0.55 sprint, 0.65 walk, 1.0 still
24. renderer.render(scene, camera)
```

---

## 4. Renderer Configuration

| Setting | Value |
|---------|-------|
| Antialias | `true` |
| Stencil | `true` |
| Pixel ratio | `min(devicePixelRatio, 2)` |
| Color space | sRGB |
| Shadow map | enabled, `PCFSoftShadowMap` |
| Shadow map size | 2048 x 2048 |
| Shadow camera | orthographic, +/-80m bounds, near 0.5, far 250 |
| Shadow bias | -0.002 |
| Shadow normal bias | 0.03 |
| XR enabled | `true` |
| XR framebuffer scale | 1.0 |
| XR reference space | `local-floor` |
| XR foveation | 1.0 (Quest 3) |
| Camera FOV | 70 degrees |
| Camera near/far | 0.1 / 600 |

---

## 5. Camera Rig (Dolly)

The camera uses a dolly-style rig:

```
Scene
 +-- Dolly (THREE.Group)
     +-- Camera (PerspectiveCamera)
     |   +-- VR HUD sprites (score, weather, minimap, time)
     +-- Controller 0 (left hand)
     +-- Controller 1 (right hand)
```

- Moving the player moves the **dolly** (Group), not the camera directly.
- The camera's local position is used for eye-height offset and walk bob.
- In VR, the headset tracking adds to the camera's local transform automatically.
- HUD sprites are children of the camera so they follow head movement.

---

## 6. VR Session Events

### On session start

- Start ambient audio (user gesture satisfied).
- Set bird audio context.
- Hide info overlay.
- Rotate dolly 180 degrees (face forward in VR).
- Swap water to low-res geometry (64x64).
- Attempt `OVR_multiview2` extension.
- Set foveation to 1.0.

### On session end

- Stop audio.
- Show info overlay.
- Restore high-res water geometry (128x128).

---

## 7. Desktop First Interaction

On first keydown, click, or pointer lock:

- Hide info overlay.
- Start audio context.
- Set bird audio context.

---

## 8. Weather Data Flow

The weather system's `weatherIntensity` (0.0 = sunny, 1.0 = cloudy, 2.0 = stormy) drives parameters that flow to multiple systems:

```
weatherIntensity
 +---> cloudDensity      -> day-night (cloud opacity)
 +---> cloudDarkness     -> day-night (cloud tinting)
 +---> windMultiplier    -> wind uniforms (tree/veg sway)
 +---> fogMultiplier     -> day-night (fog distance scaling)
 +---> rainIntensity     -> rain particles, rain audio, water ripples
 +---> lightDimming      -> day-night (sun dimming)
 +---> skyDarkening      -> day-night (sky color muting)
 +---> starDimming       -> day-night (star/MW opacity)
 +---> waveAmplitude     -> water shader (wave height scaling)
 +---> groundWetness     -> ground shader (darkening + blue shift)
 +---> lightningFlash    -> day-night (flash brightness)
```

---

## 9. Chunk Lifecycle

```
1. Player moves to new chunk coordinate
2. ChunkManager computes needed chunks (11x11 grid, LOAD_RADIUS=5)
3. Unload chunks beyond UNLOAD_RADIUS=7 -> recycle to pool
4. Queue missing chunks sorted by distance (closest first)
5. Per frame: load up to MAX_CHUNKS_PER_FRAME=2 (1 in VR)
6. Each chunk loads in 2 phases:
   Phase 1 (immediate): terrain mesh + trees + cottages
   Phase 2 (next frame): vegetation + flowers + rocks + logs + collectibles
7. On any new chunk load -> fire onChunksChanged callback
   -> rebuild all instanced mesh pools (trees, vegetation, collectibles, cottages)
```

---

## 10. Render Order

| Order | Object |
|-------|--------|
| -2 | Sky dome (rendered first, behind everything) |
| -1 | Sky sphere (legacy, behind sky dome) |
| 0 | Default (terrain, trees, water, structures, etc.) |
| 0 | Stars, Milky Way, planets (drawn inside sky dome) |
| 0 | Fireflies, collectible glow (additive blending, depth write off) |
