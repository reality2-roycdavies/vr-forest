# Test Vectors for VR Forest Specifications

This directory contains deterministic test vectors for the VR Endless Forest specification suite. Each JSON file provides input/expected pairs that can be used to validate an implementation against the spec.

## File Format

Every test vector file follows this structure:

```json
{
  "spec": "VF-TERRAIN",
  "version": "1.1",
  "description": "Human-readable description of what this file tests",
  "vectors": [
    {
      "id": "terrain-001",
      "description": "What this specific test verifies",
      "input": { ... },
      "expected": { ... },
      "tolerance": 0.001
    }
  ]
}
```

### Fields

| Field | Description |
|-------|-------------|
| `spec` | The spec ID this file tests (e.g. `VF-TERRAIN`) |
| `version` | The spec version these vectors are written against |
| `description` | Overview of the test coverage |
| `vectors` | Array of individual test cases |
| `vectors[].id` | Unique identifier for the test case (spec-prefix + 3-digit number) |
| `vectors[].description` | What the test verifies and why |
| `vectors[].input` | Input parameters, coordinates, or conditions |
| `vectors[].expected` | Expected output values, ranges, or properties |
| `vectors[].tolerance` | Acceptable deviation for numeric comparisons (0 = exact match) |

## Files

| File | Spec | Vectors | Coverage |
|------|------|---------|----------|
| `vf-terrain-vectors.json` | VF-TERRAIN 1.1 | 8 | Noise outputs, fBm, valley carving, altitude zones, chunk boundaries, mountain suppression |
| `vf-config-vectors.json` | VF-CONFIG 1.0 | 10 | Parameter types, exact values, range constraints, colour validation, collision radii |
| `vf-water-vectors.json` | VF-WATER 1.1 | 8 | Water plane position, wave displacement, amplitude scaling, shore foam, shore fade, swimming |
| `vf-atmosphere-vectors.json` | VF-ATMOSPHERE 1.1 | 9 | Star count, solar altitude, fog, clouds, moon/planet radii, palette transitions, star rendering |
| `vf-weather-vectors.json` | VF-WEATHER 1.0 | 10 | State machine, transition rate, all derived parameters at 0/0.5/1/1.5/2, rain particles, wetness hysteresis |
| `vf-forest-vectors.json` | VF-FOREST 1.1 | 11 | Grid spacing, density threshold, shore/treeline exclusion, stream exclusion, types, scale, collision, tussock |

## Usage Notes

### Tolerance

- `tolerance: 0` means exact integer or string match.
- `tolerance: 0.001` means floating-point values must match within 0.001.
- `tolerance: 2.0` or `5.0` is used for astronomical calculations where small ephemeris approximation errors are expected.

### Deterministic vs Range Tests

Some vectors verify exact deterministic outputs (e.g. wave displacement at origin = 0.0). Others verify ranges or constraints (e.g. terrain height at (1000,1000) must be within [-8, 53]). The `expected` object makes this distinction clear through either exact `value` fields or `Range`/`range` fields.

### Noise Determinism

Terrain tests depend on the simplex noise implementation seeded via mulberry32 PRNG. The noise functions are deterministic given the seed, but the exact output values depend on the specific simplex noise library's permutation table construction. Tests that verify exact noise outputs require the same library version.

### Config vs Runtime

Config vectors verify the static CONFIG object. Runtime vectors (terrain, water, weather) verify the dynamic behaviour of systems that consume those config values.

## Relationship to Specs

These vectors are derived from the specification files in `/specs/`:

- VF-TERRAIN.md -- Terrain height calculation, noise system, altitude biomes
- VF-CONFIG.md -- All tunable parameters
- VF-WATER.md -- Water plane, waves, swimming, shore foam
- VF-ATMOSPHERE.md -- Sky, stars, moon, planets, fog, clouds
- VF-WEATHER.md -- Weather state machine, rain, ground wetness
- VF-FOREST.md -- Tree placement, vegetation, wind animation

When a spec is updated, the corresponding test vectors should be reviewed and updated to match.
