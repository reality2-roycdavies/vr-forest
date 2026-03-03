# SPEC-00: VR Endless Forest — Overview & Conventions

## 1. Purpose

This specification suite describes **VR Endless Forest**, a procedurally-generated infinite forest WebXR experience. It is written in sufficient detail for a developer (or AI) to recreate the experience faithfully in any 3D/VR framework (Godot, Unity, Unreal, etc.) without access to the original source code.

The reference implementation uses ~14,700 lines of JavaScript across 30 modules, running on Three.js r170 with simplex-noise v4.0.3.

## 2. Document Index

| File | Theme | Summary |
|------|-------|---------|
| SPEC-00 | Overview | This document — conventions, coordinate system, build order |
| SPEC-01 | Architecture | System init, render loop, VR setup, module relationships |
| SPEC-02 | Terrain | Noise system, chunk management, height calculation, ground shader |
| SPEC-03 | Water | Water plane, wave displacement, shore foam, rivers, swimming |
| SPEC-04 | Forest | 4 tree types, vegetation, flowers, rocks, logs/stumps, placement |
| SPEC-05 | Atmosphere | Sky dome, day/night cycle, sun/moon/stars/planets, Milky Way, clouds, fog, fireflies |
| SPEC-06 | Weather | State machine, rain particles, lightning, snow, ground wetness |
| SPEC-07 | Audio | All procedural audio: footsteps, crickets, birds, morepork, rain, thunder, water, wildlife |
| SPEC-08 | Movement | Player controls, locomotion, collision, jump/gravity, skiing, swimming |
| SPEC-09 | Wildlife | Bird flocks, peek encounters (bear, lion, Wally), creature geometry |
| SPEC-10 | Collectibles | Orbs, scoring, sprint power, HUD, minimap |
| SPEC-11 | Structures | Procedural log cabins, chimney smoke, window glow, garden clearing |
| SPEC-12 | Performance | Frame budgets, instance caps, VR optimizations, LOD, throttling |
| SPEC-13 | Config | Complete parameter reference (~250 constants) |

## 3. Conventions

### 3.1 Units
- **Distance:** meters (m)
- **Angles:** radians unless noted as "degrees"
- **Time:** seconds (s)
- **Colour:** RGB in 0.0–1.0 range unless noted as hex integers (e.g., `0x3068cc`)
- **Audio frequency:** Hertz (Hz)

### 3.2 RFC 2119 Language
- **MUST** / **SHALL**: absolute requirement
- **SHOULD**: recommended but deviations acceptable with justification
- **MAY**: truly optional

### 3.3 Pseudocode
Formulas are given as pseudocode or GLSL where appropriate. `clamp(x, lo, hi)` means `max(lo, min(hi, x))`. `lerp(a, b, t)` means `a + (b - a) * t`. `smoothstep(edge0, edge1, x)` is the Hermite interpolation `t*t*(3-2*t)` where `t = clamp((x - edge0) / (edge1 - edge0), 0, 1)`.

## 4. Coordinate System

| Axis | Direction | Mnemonic |
|------|-----------|----------|
| **+X** | North | Forward at spawn |
| **+Y** | Up | Gravity is -Y |
| **+Z** | East | Right at spawn |

The player spawns at world origin `(0, 0, 0)` facing **south** (toward -X), rotated 180° from the +X axis, looking toward a lake.

## 5. External Assets

Only **2 binary assets** are required:

| Asset | Format | Purpose |
|-------|--------|---------|
| `moon.jpg` | JPEG texture | Photographic moon surface, loaded onto moon disc |
| `morepork-single.mp3` | MP3 audio | New Zealand morepork owl call, used in spatial conversations |

Everything else — terrain, trees, creatures, sky, audio — is **procedurally generated** at runtime.

## 6. Library Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| Three.js | r170 | 3D rendering, WebXR, shadow maps |
| simplex-noise | 4.0.3 | 2D simplex noise for all procedural generation |

## 7. Suggested Build Order

Build systems in this dependency order:

1. **Configuration** (SPEC-13) — define all constants first
2. **Noise system** (SPEC-02 §2) — seeded PRNG + simplex noise wrapper
3. **Terrain height** (SPEC-02 §3) — base height, valleys, mountains
4. **Terrain chunks** (SPEC-02 §1) — chunk manager, mesh generation, ground shader
5. **Water** (SPEC-03) — water plane, wave shader, shore effects
6. **Trees & vegetation** (SPEC-04) — tree factory, placement, instanced rendering
7. **Structures** (SPEC-11) — cottages, clearing effect
8. **Atmosphere** (SPEC-05) — sky dome, day/night, celestial objects
9. **Weather** (SPEC-06) — state machine, rain, lightning
10. **Player movement** (SPEC-08) — locomotion, collision, terrain following
11. **Audio** (SPEC-07) — all procedural sound synthesis
12. **Wildlife** (SPEC-09) — birds, peek encounters
13. **Collectibles** (SPEC-10) — orbs, HUD, minimap
14. **Performance tuning** (SPEC-12) — VR optimizations, LOD

## 8. The Experience in Brief

The player stands in an infinite procedurally-generated New Zealand-inspired forest. Lakes and ponds glisten with animated waves. Mountains rise in the distance with snow-capped peaks. A full day/night cycle progresses in real time (synced to the player's actual clock and geolocation for accurate sun/moon positions). At night, the real southern-hemisphere star field appears with the Milky Way arching overhead, fireflies dance among the trees, and a morepork owl calls from the darkness. Weather transitions organically between clear skies, overcast clouds, and rain storms with lightning. Collectible fairy-light orbs are scattered through the forest, powering a sprint ability. Occasionally, a bear, mountain lion, or "Where's Wally" character peeks out from behind a tree. Bird flocks orbit overhead during the day. Crow caws, cricket chirps, footsteps, and water sounds are all synthesized procedurally in real time. The experience runs in VR (Quest 3 at 90fps) or desktop (mouse+keyboard).

## 9. Key Design Principles

- **Everything is procedural**: No pre-built meshes, no pre-recorded ambient audio (except the morepork call). All geometry, textures, and sounds are generated from noise functions and synthesis.
- **Deterministic from seed**: Given the same `TERRAIN_SEED` (default: 42), the world is identical across implementations. Noise instances are numbered consistently.
- **Infinite and seamless**: The terrain is chunked and streams infinitely in all directions. Fog hides chunk loading boundaries.
- **Performance-conscious**: Instance caps, LOD, throttled updates, and dynamic resolution scaling keep VR at 90fps.
