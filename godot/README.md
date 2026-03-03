# VR Forest — Godot 4.3 Port

Godot 4.3+ implementation of the VR Endless Forest, sharing the same [spec documents](../specs/) and test vectors as the Three.js version.

## Requirements

- **Godot 4.3+** (tested with 4.3 stable)
- **OpenXR plugin** (bundled with Godot 4.3)
- **Quest 3** as primary XR target (also works in desktop fallback mode)

## Setup

1. Open Godot 4.3 and import this folder (`godot/`) as a project
2. The project loads `project.godot` and registers `Config` as an autoload singleton
3. Press F5 to run — you should see a basic sky + directional light scene
4. If a Quest 3 is connected via Link or Air Link, the scene renders in VR

## Project Structure

```
godot/
├── project.godot          ← Godot project config (OpenXR enabled)
├── autoloads/
│   └── config.gd          ← Full port of all CONFIG constants
├── terrain/
│   └── noise.gd           ← Noise function skeletons (FastNoiseLite)
├── player/
│   └── xr_setup.gd        ← OpenXR init + desktop fallback
├── scenes/
│   └── main.tscn          ← Minimal scene (sky, light, XR origin)
├── tests/
│   └── helpers/
│       └── vector_loader.gd  ← Shared test vector JSON loader
└── README.md
```

## Shared Specs

Both implementations are driven by the same specification documents in `../specs/`:

| Spec ID | Document | Description |
|---------|----------|-------------|
| VF-CONFIG | vf-config.md | All tunable constants |
| VF-ARCH | vf-architecture.md | System architecture |
| VF-TERRAIN | vf-terrain.md | Procedural terrain generation |
| VF-FOREST | vf-forest.md | Tree placement and vegetation |
| VF-WATER | vf-water.md | Water plane and swimming |
| VF-ATMOSPHERE | vf-atmosphere.md | Sky, fog, day/night cycle |
| VF-WEATHER | vf-weather.md | Rain, thunder, weather state machine |
| VF-MOVEMENT | vf-movement.md | VR locomotion and physics |
| VF-COLLECTIBLES | vf-collectibles.md | Collectible orb system |
| VF-WILDLIFE | vf-wildlife.md | Birds and wildlife |
| VF-AUDIO | vf-audio.md | Spatial audio system |
| VF-PERFORMANCE | vf-performance.md | Performance budgets |
| VF-OVERVIEW | vf-overview.md | Project overview |
| VF-VERIFY | vf-verification.md | Verification procedures |

## Porting Status

| Phase | Specs | Status | Notes |
|-------|-------|--------|-------|
| 1. Foundation | VF-CONFIG, VF-ARCH, VF-TERRAIN | **Config done, terrain skeleton** | FastNoiseLite replaces simplex-noise |
| 2. Visual | VF-FOREST, VF-WATER | Not started | MultiMeshInstance3D for trees, ShaderMaterial for water |
| 3. Atmosphere | VF-ATMOSPHERE, VF-WEATHER | Not started | WorldEnvironment, sky shader, particle systems |
| 4. Interaction | VF-MOVEMENT, VF-COLLECTIBLES, VF-WILDLIFE, VF-AUDIO | Not started | OpenXR input mapping, spatial audio |
| 5. Polish | VF-PERFORMANCE, VF-OVERVIEW, VF-VERIFY | Not started | Occlusion culling, LOD tuning, Quest 3 profiling |

## Porting Roadmap

### Phase 1: Foundation
- Config singleton (done) — all 280+ constants ported
- Terrain noise — implement `fractal_noise()` and `get_terrain_height()` using FastNoiseLite
- Chunk mesh generation — ArrayMesh with same vertex grid as Three.js
- **Key challenge**: FastNoiseLite output differs from simplex-noise — validate against range-based spec tests

### Phase 2: Visual
- Tree system — MultiMeshInstance3D for instanced trees (4 types)
- Billboard LOD system for distant trees
- Water plane — ShaderMaterial with wave vertex shader
- Shore foam contour meshes

### Phase 3: Atmosphere
- Day/night cycle — WorldEnvironment + procedural sky shader
- Fog system matched to spec distances
- Weather state machine — rain GPUParticles3D, thunder/lightning
- Cloud system

### Phase 4: Interaction
- XR locomotion — smooth movement, snap turn, jump, sprint
- Swimming mode below water level
- Collectible orbs — Area3D triggers with chime audio
- Wildlife — birds, crickets via AudioStreamPlayer3D
- Footstep audio with surface detection

### Phase 5: Polish
- Occlusion culling and LOD tuning
- Quest 3 performance profiling (target: 72 fps sustained)
- Verification against all spec test vectors

## Testing

Tests use [GUT](https://github.com/bitwes/Gut) (Godot Unit Test) and share test vectors from `../specs/testing/test-vectors/`.

Run tests headless:
```bash
godot --headless --script addons/gut/gut_cmdln.gd
```

The test vector loader (`tests/helpers/vector_loader.gd`) reads the same JSON vector files used by the Three.js vitest suite.
