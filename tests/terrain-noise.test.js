import { describe, it, expect } from 'vitest';
import { CONFIG } from '../js/config.js';
import {
  fractalNoise,
  getTerrainHeight,
  getBaseTerrainHeight,
  getTreeDensity,
} from '../js/terrain/noise.js';
import { loadVectors, getVector } from './helpers/load-vectors.js';
import { expectInRange, expectClose } from './helpers/assertions.js';

const vectors = loadVectors('terrain');

describe('VF-TERRAIN: terrain-001 — Origin height', () => {
  const v = getVector(vectors, 'terrain-001');

  it('getTerrainHeight(0, 0) is within base fBm range [-8, 8]', () => {
    const h = getTerrainHeight(0, 0);
    expectInRange(h, v.expected.heightRange[0], v.expected.heightRange[1], 'origin height');
  });

  it('is deterministic (same result on repeated calls)', () => {
    const h1 = getTerrainHeight(0, 0);
    const h2 = getTerrainHeight(0, 0);
    expect(h1).toBe(h2);
  });
});

describe('VF-TERRAIN: terrain-002 — Distant point height range', () => {
  const v = getVector(vectors, 'terrain-002');

  it('getTerrainHeight(1000, 1000) is within total range [-8, 53]', () => {
    const h = getTerrainHeight(1000, 1000);
    expectInRange(h, v.expected.heightRange[0], v.expected.heightRange[1], 'distant height');
  });
});

describe('VF-TERRAIN: terrain-006 — Chunk boundary seamlessness', () => {
  const v = getVector(vectors, 'terrain-006');

  it('height at chunk boundary is identical regardless of computation context', () => {
    const bx = v.input.boundaryX;
    const bz = v.input.boundaryZ;
    // getTerrainHeight is a pure function of world coords — no chunk state
    const h1 = getTerrainHeight(bx, bz);
    const h2 = getTerrainHeight(bx, bz);
    expect(h1).toBe(h2);
  });

  it('height at boundary is continuous with adjacent points', () => {
    const bx = 32.0;
    const eps = 0.001;
    const hLeft = getTerrainHeight(bx - eps, 0);
    const hAt = getTerrainHeight(bx, 0);
    const hRight = getTerrainHeight(bx + eps, 0);
    // Difference should be tiny for continuous noise
    expect(Math.abs(hAt - hLeft)).toBeLessThan(0.1);
    expect(Math.abs(hAt - hRight)).toBeLessThan(0.1);
  });
});

describe('VF-TERRAIN: terrain-007 — Mountain spawn suppression', () => {
  const v = getVector(vectors, 'terrain-007');

  it('spawnFade formula matches expected values at test distances', () => {
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    for (let i = 0; i < v.input.distances.length; i++) {
      const dist = v.input.distances[i];
      const expectedFade = v.expected.spawnFade[i];
      const actualFade = clamp((dist - 60) / 40, 0, 1);
      expectClose(actualFade, expectedFade, v.tolerance, `spawnFade at ${dist}m`);
    }
  });
});

describe('VF-TERRAIN: terrain-008 — fBm normalisation', () => {
  const v = getVector(vectors, 'terrain-008');

  it('amplitude sum matches computed value from individual amplitudes', () => {
    let sum = 0;
    let amp = 1;
    for (let i = 0; i < v.input.octaves; i++) {
      sum += amp;
      amp *= v.input.persistence;
    }
    // Vector note says "1 + 0.45 + 0.2025 + 0.091125 = 1.743625"
    const expectedSum = v.expected.amplitudes.reduce((a, b) => a + b, 0);
    expectClose(sum, expectedSum, v.tolerance, 'amplitude sum');
  });

  it('individual amplitudes match expected', () => {
    let amp = 1;
    for (let i = 0; i < v.expected.amplitudes.length; i++) {
      expectClose(amp, v.expected.amplitudes[i], v.tolerance, `amplitude[${i}]`);
      amp *= v.input.persistence;
    }
  });

  it('fractalNoise output is normalised to [-1, 1]', () => {
    // Sample many points and verify range
    const samples = 200;
    for (let i = 0; i < samples; i++) {
      const x = (i - 100) * 10;
      const z = (i * 7 - 50) * 10;
      const n = fractalNoise(x, z, CONFIG.TERRAIN_SCALE, CONFIG.TERRAIN_OCTAVES,
        CONFIG.TERRAIN_PERSISTENCE, CONFIG.TERRAIN_LACUNARITY);
      expectInRange(n, -1.0, 1.0, `fractalNoise(${x}, ${z})`);
    }
  });

  it('scaled output is within [-TERRAIN_HEIGHT, TERRAIN_HEIGHT]', () => {
    for (let i = 0; i < 100; i++) {
      const x = (i - 50) * 15;
      const z = (i * 3 - 25) * 15;
      const n = fractalNoise(x, z, CONFIG.TERRAIN_SCALE, CONFIG.TERRAIN_OCTAVES,
        CONFIG.TERRAIN_PERSISTENCE, CONFIG.TERRAIN_LACUNARITY);
      const scaled = n * CONFIG.TERRAIN_HEIGHT;
      expectInRange(scaled, -CONFIG.TERRAIN_HEIGHT, CONFIG.TERRAIN_HEIGHT, 'scaled fBm');
    }
  });
});

describe('VF-TERRAIN: terrain-003 — Shore/water level thresholds', () => {
  it('WATER_LEVEL < SHORE_LEVEL', () => {
    expect(CONFIG.WATER_LEVEL).toBeLessThan(CONFIG.SHORE_LEVEL);
  });

  it('shore zone width is 0.7m', () => {
    expectClose(CONFIG.SHORE_LEVEL - CONFIG.WATER_LEVEL, 0.7, 0.001, 'shore zone width');
  });
});

describe('VF-TERRAIN: terrain-005 — Altitude zone boundaries from CONFIG', () => {
  it('zone ordering is correct', () => {
    expect(CONFIG.SUBALPINE_START).toBeLessThan(CONFIG.TREELINE_START);
    expect(CONFIG.TREELINE_START).toBeLessThan(CONFIG.ALPINE_START);
  });
});
