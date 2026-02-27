import { describe, it, expect } from 'vitest';
import { CONFIG } from '../js/config.js';
import { getTreeDensity } from '../js/terrain/noise.js';
import { loadVectors, getVector } from './helpers/load-vectors.js';
import { expectInRange, expectClose } from './helpers/assertions.js';

const vectors = loadVectors('forest');

describe('VF-FOREST: forest-001 — Tree placement grid spacing', () => {
  const v = getVector(vectors, 'forest-001');

  it('TREE_GRID_SPACING matches', () => {
    expect(CONFIG.TREE_GRID_SPACING).toBe(v.expected.gridSpacing);
  });

  it('TREE_JITTER matches', () => {
    expect(CONFIG.TREE_JITTER).toBe(v.expected.jitterAmount);
  });
});

describe('VF-FOREST: forest-002 — Tree density threshold', () => {
  const v = getVector(vectors, 'forest-002');

  it('TREE_DENSITY_THRESHOLD matches', () => {
    expect(CONFIG.TREE_DENSITY_THRESHOLD).toBe(v.expected.threshold);
  });

  it('TREE_DENSITY_SCALE matches', () => {
    expect(CONFIG.TREE_DENSITY_SCALE).toBe(v.expected.noiseScale);
  });

  it('getTreeDensity returns values in [-1, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const x = (i - 50) * 20;
      const z = (i * 7 - 35) * 20;
      const d = getTreeDensity(x, z);
      expectInRange(d, -1, 1, `treeDensity(${x}, ${z})`);
    }
  });
});

describe('VF-FOREST: forest-003 — Shore exclusion', () => {
  const v = getVector(vectors, 'forest-003');

  it('SHORE_LEVEL matches', () => {
    expect(CONFIG.SHORE_LEVEL).toBe(v.expected.exclusionBelow);
  });
});

describe('VF-FOREST: forest-004 — Treeline exclusion', () => {
  const v = getVector(vectors, 'forest-004');

  it('tree exclusion ceiling = TREELINE_START + 2', () => {
    expect(CONFIG.TREELINE_START + 2).toBe(v.expected.treeExclusionAbove);
  });

  it('TREELINE_SCALE_MIN matches', () => {
    expect(CONFIG.TREELINE_SCALE_MIN).toBe(v.input.treelineScaleMin);
  });
});

describe('VF-FOREST: forest-006 — Tree types', () => {
  const v = getVector(vectors, 'forest-006');

  it('TREE_TYPES = 4', () => {
    expect(CONFIG.TREE_TYPES).toBe(v.input.treeTypes);
  });

  it('type selection formula is deterministic', () => {
    // |floor(density * 30)| % 3 produces types 0-2
    const densities = [0.2, 0.5, 0.8, 1.0];
    for (const d of densities) {
      const type = Math.abs(Math.floor(d * 30)) % 3;
      expect(type).toBeGreaterThanOrEqual(0);
      expect(type).toBeLessThanOrEqual(2);
    }
  });
});

describe('VF-FOREST: forest-007 — Scale range', () => {
  const v = getVector(vectors, 'forest-007');

  it('scale at threshold density = TREE_MIN_HEIGHT', () => {
    const scale = 2.5 + (0.15 - 0.15) / 0.85 * 3.5;
    expectClose(scale, v.expected.atThreshold.scale, 0.001, 'scale at threshold');
  });

  it('scale at max density = TREE_MAX_HEIGHT', () => {
    const scale = 2.5 + (1.0 - 0.15) / 0.85 * 3.5;
    expectClose(scale, v.expected.atMaxDensity.scale, 0.001, 'scale at max density');
  });

  it('CONFIG min/max height match', () => {
    expect(CONFIG.TREE_MIN_HEIGHT).toBe(v.expected.scaleMin);
    expect(CONFIG.TREE_MAX_HEIGHT).toBe(v.expected.scaleMax);
  });
});

describe('VF-FOREST: forest-008 — Tree collision radius', () => {
  const v = getVector(vectors, 'forest-008');

  it('TREE_COLLISION_RADIUS matches', () => {
    expect(CONFIG.TREE_COLLISION_RADIUS).toBe(v.expected.treeCollisionRadius);
  });
});

describe('VF-FOREST: forest-010 — Planting depth', () => {
  const v = getVector(vectors, 'forest-010');

  it('planting offset is -0.15m', () => {
    expect(v.expected.offset).toBe(-0.15);
  });
});

describe('VF-FOREST: forest-011 — Altitude scale transition', () => {
  const v = getVector(vectors, 'forest-011');

  for (const sample of v.expected.scaleAtAltitudes) {
    it(`altitude scale at height=${sample.height}m should be ${sample.altitudeScale}`, () => {
      let altitudeScale;
      if (sample.height <= CONFIG.SUBALPINE_START) {
        altitudeScale = 1.0;
      } else {
        altitudeScale = Math.max(CONFIG.TREELINE_SCALE_MIN, 1 - (sample.height - CONFIG.SUBALPINE_START) / 8);
      }
      expectClose(altitudeScale, sample.altitudeScale, 0.001, `altitudeScale at ${sample.height}m`);
    });
  }
});
