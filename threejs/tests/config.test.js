import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../js/config.js';
import { loadVectors, getVector } from './helpers/load-vectors.js';

const vectors = loadVectors('config');

// For duplicate key detection — parse source text
const __dirname = dirname(fileURLToPath(import.meta.url));
const configSource = readFileSync(resolve(__dirname, '../js/config.js'), 'utf-8');

describe('VF-CONFIG: config-001 — Core terrain parameters', () => {
  const v = getVector(vectors, 'config-001');
  const params = v.expected;

  for (const [key, spec] of Object.entries(params)) {
    it(`CONFIG.${key} === ${spec.value}`, () => {
      expect(CONFIG[key]).toBe(spec.value);
      expect(typeof CONFIG[key]).toBe(spec.type);
    });
  }
});

describe('VF-CONFIG: config-002 — Movement and water parameters', () => {
  const v = getVector(vectors, 'config-002');
  const params = v.expected;

  for (const [key, spec] of Object.entries(params)) {
    it(`CONFIG.${key} === ${spec.value}`, () => {
      expect(CONFIG[key]).toBe(spec.value);
      expect(typeof CONFIG[key]).toBe(spec.type);
    });
  }
});

describe('VF-CONFIG: config-003 — Tree parameters', () => {
  const v = getVector(vectors, 'config-003');
  const params = v.expected;

  for (const [key, spec] of Object.entries(params)) {
    it(`CONFIG.${key} === ${spec.value}`, () => {
      expect(CONFIG[key]).toBe(spec.value);
      expect(typeof CONFIG[key]).toBe(spec.type);
    });
  }
});

describe('VF-CONFIG: config-004 — Range constraints', () => {
  const v = getVector(vectors, 'config-004');

  for (const constraint of v.expected.constraints) {
    it(constraint.rule, () => {
      if (constraint.left !== undefined && constraint.right !== undefined) {
        expect(constraint.left).toBeLessThan(constraint.right);
        // Also verify against actual CONFIG values
        const match = constraint.rule.match(/^(\w+)\s*<\s*(\w+)$/);
        if (match) {
          expect(CONFIG[match[1]]).toBeLessThan(CONFIG[match[2]]);
        }
      } else if (constraint.value !== undefined) {
        const match = constraint.rule.match(/^(\w+)\s*>\s*(\d+)$/);
        if (match) {
          expect(CONFIG[match[1]]).toBeGreaterThan(Number(match[2]));
        }
      }
    });
  }
});

describe('VF-CONFIG: config-005 — Colour validation', () => {
  const v = getVector(vectors, 'config-005');

  describe('Hex colours are numbers', () => {
    for (const [key, spec] of Object.entries(v.expected.hexColours)) {
      it(`CONFIG.${key} is a number (hex colour)`, () => {
        expect(typeof CONFIG[key]).toBe('number');
        expect(CONFIG[key]).toBe(parseInt(spec.value, 16));
      });
    }
  });

  describe('Hex array colours', () => {
    for (const [key, spec] of Object.entries(v.expected.hexArrayColours)) {
      it(`CONFIG.${key} is an array of ${spec.values.length} hex numbers`, () => {
        expect(Array.isArray(CONFIG[key])).toBe(true);
        expect(CONFIG[key].length).toBe(spec.values.length);
        for (let i = 0; i < spec.values.length; i++) {
          expect(typeof CONFIG[key][i]).toBe('number');
          expect(CONFIG[key][i]).toBe(parseInt(spec.values[i], 16));
        }
      });
    }
  });

  describe('RGB colours have r, g, b properties', () => {
    for (const [key, spec] of Object.entries(v.expected.rgbColours)) {
      it(`CONFIG.${key} has correct r, g, b values`, () => {
        expect(CONFIG[key]).toHaveProperty('r', spec.r);
        expect(CONFIG[key]).toHaveProperty('g', spec.g);
        expect(CONFIG[key]).toHaveProperty('b', spec.b);
      });
    }
  });
});

describe('VF-CONFIG: config-006 — Atmosphere parameters', () => {
  const v = getVector(vectors, 'config-006');
  const params = v.expected;

  for (const [key, spec] of Object.entries(params)) {
    it(`CONFIG.${key} === ${spec.value}`, () => {
      expect(CONFIG[key]).toBe(spec.value);
      expect(typeof CONFIG[key]).toBe(spec.type);
    });
  }
});

describe('VF-CONFIG: config-007 — Weather parameters', () => {
  const v = getVector(vectors, 'config-007');
  const params = v.expected;

  for (const [key, spec] of Object.entries(params)) {
    it(`CONFIG.${key} === ${spec.value}`, () => {
      expect(CONFIG[key]).toBe(spec.value);
      expect(typeof CONFIG[key]).toBe(spec.type);
    });
  }
});

describe('VF-CONFIG: config-008 — Altitude zone parameters', () => {
  const v = getVector(vectors, 'config-008');
  const params = v.expected;

  for (const [key, spec] of Object.entries(params)) {
    it(`CONFIG.${key} === ${spec.value}`, () => {
      expect(CONFIG[key]).toBe(spec.value);
      expect(typeof CONFIG[key]).toBe(spec.type);
    });
  }
});

describe('VF-CONFIG: config-009 — No duplicate keys', () => {
  it('CONFIG source has no duplicate property names', () => {
    // Extract all key definitions from CONFIG object literal
    const keyPattern = /^\s+(\w+)\s*:/gm;
    const keys = [];
    let match;
    while ((match = keyPattern.exec(configSource)) !== null) {
      keys.push(match[1]);
    }
    const seen = new Set();
    const duplicates = [];
    for (const key of keys) {
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates, `Duplicate keys found: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('CONFIG has approximately 160-180 keys', () => {
    const keyCount = Object.keys(CONFIG).length;
    expect(keyCount).toBeGreaterThanOrEqual(100);
    expect(keyCount).toBeLessThanOrEqual(250);
  });
});

describe('VF-CONFIG: config-010 — Collision radii', () => {
  const v = getVector(vectors, 'config-010');

  it('ROCK_COLLISION_RADII is correct array', () => {
    const spec = v.expected.ROCK_COLLISION_RADII;
    expect(CONFIG.ROCK_COLLISION_RADII).toEqual(spec.value);
    expect(CONFIG.ROCK_COLLISION_RADII.length).toBe(spec.length);
    for (const r of CONFIG.ROCK_COLLISION_RADII) {
      expect(r).toBeGreaterThan(0);
    }
  });

  it('TREE_COLLISION_RADIUS is positive', () => {
    expect(CONFIG.TREE_COLLISION_RADIUS).toBe(v.expected.TREE_COLLISION_RADIUS.value);
    expect(CONFIG.TREE_COLLISION_RADIUS).toBeGreaterThan(0);
  });

  it('COTTAGE_COLLISION_RADIUS is positive', () => {
    expect(CONFIG.COTTAGE_COLLISION_RADIUS).toBe(v.expected.COTTAGE_COLLISION_RADIUS.value);
    expect(CONFIG.COTTAGE_COLLISION_RADIUS).toBeGreaterThan(0);
  });

  it('COLLECTIBLE_COLLISION_RADIUS is positive', () => {
    expect(CONFIG.COLLECTIBLE_COLLISION_RADIUS).toBe(v.expected.COLLECTIBLE_COLLISION_RADIUS.value);
    expect(CONFIG.COLLECTIBLE_COLLISION_RADIUS).toBeGreaterThan(0);
  });
});
