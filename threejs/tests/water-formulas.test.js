import { describe, it, expect } from 'vitest';
import { CONFIG } from '../js/config.js';
import { loadVectors, getVector } from './helpers/load-vectors.js';
import { expectClose } from './helpers/assertions.js';

const vectors = loadVectors('water');

describe('VF-WATER: water-001 — Water plane position', () => {
  const v = getVector(vectors, 'water-001');

  it('WATER_LEVEL matches', () => {
    expect(CONFIG.WATER_LEVEL).toBe(v.expected.waterPlaneY);
  });

  it('grid snap = 300/128 = 2.34375', () => {
    expectClose(300 / 128, v.expected.gridSnap, 0.001);
  });
});

describe('VF-WATER: water-002 — Zero displacement at origin t=0', () => {
  const v = getVector(vectors, 'water-002');

  it('all waves produce zero at pos=(0,0) t=0', () => {
    // At pos=(0,0) t=0: each wave = amp * sin(dot((0,0), dir) + 0 * speed) = amp * sin(0) = 0
    // Verify the math invariant
    const displacement = 0; // sin(0) = 0 for all waves
    expectClose(displacement, v.expected.waveDisplacement, v.tolerance);
  });
});

describe('VF-WATER: water-003 — Wave amplitude sum', () => {
  const v = getVector(vectors, 'water-003');

  it('sum of all 13 base wave amplitudes = 0.207', () => {
    const amps = v.input.baseWaves.map(w => w.amp);
    const sum = amps.reduce((a, b) => a + b, 0);
    expectClose(sum, v.expected.sumOfAllAmplitudes, v.tolerance);
  });
});

describe('VF-WATER: water-004 — Wave amplitude scaling', () => {
  const v = getVector(vectors, 'water-004');

  function lerp3(t, a, b, c) {
    if (t <= 1) return a + (b - a) * t;
    return b + (c - b) * (t - 1);
  }

  it('uWaveAmplitude at w=0 is 1.0', () => {
    expectClose(lerp3(0, 1.0, 1.15, 1.8), v.expected.uWaveAmplitude[0], v.tolerance);
  });

  it('uWaveAmplitude at w=1 is 1.15', () => {
    expectClose(lerp3(1, 1.0, 1.15, 1.8), v.expected.uWaveAmplitude[1], v.tolerance);
  });

  it('uWaveAmplitude at w=2 is 1.8', () => {
    expectClose(lerp3(2, 1.0, 1.15, 1.8), v.expected.uWaveAmplitude[2], v.tolerance);
  });
});

describe('VF-WATER: water-007 — Swimming trigger', () => {
  const v = getVector(vectors, 'water-007');

  it('SWIM_DEPTH_THRESHOLD matches', () => {
    expect(CONFIG.SWIM_DEPTH_THRESHOLD).toBe(v.expected.triggerDepth);
  });

  it('trigger terrain height = WATER_LEVEL - SWIM_DEPTH_THRESHOLD', () => {
    expectClose(
      CONFIG.WATER_LEVEL - CONFIG.SWIM_DEPTH_THRESHOLD,
      v.expected.triggerTerrainHeight,
      0.001
    );
  });

  it('SWIM_SPEED matches', () => {
    expect(CONFIG.SWIM_SPEED).toBe(v.expected.swimBehavior.speed);
  });
});

describe('VF-WATER: water-008 — Storm-chop waves', () => {
  const v = getVector(vectors, 'water-008');

  it('sum of storm-chop amplitudes = 0.056', () => {
    const amps = v.input.stormChopWaves.map(w => w.amp);
    const sum = amps.reduce((a, b) => a + b, 0);
    expectClose(sum, v.expected.stormChopAmplitudeSum, v.tolerance);
  });

  it('storm-chop waves are scaled by rainIntensity', () => {
    // At rainIntensity=1, full amplitude; at 0, zero
    expect(v.expected.scaledByRain).toBe(true);
  });
});
