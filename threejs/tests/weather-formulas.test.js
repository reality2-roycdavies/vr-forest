import { describe, it, expect } from 'vitest';
import { CONFIG } from '../js/config.js';
import { loadVectors, getVector } from './helpers/load-vectors.js';
import { expectClose } from './helpers/assertions.js';

const vectors = loadVectors('weather');

/**
 * Replicate the piecewise linear interpolation from weather.js (lerp3).
 * lerp3(t, a, b, c): t in [0,1] → lerp(a,b,t); t in [1,2] → lerp(b,c,t-1)
 */
function lerp3(t, a, b, c) {
  if (t <= 1) return a + (b - a) * t;
  return b + (c - b) * (t - 1);
}

/**
 * Derive weather parameters from weatherIntensity, replicating weather.js formulas.
 */
function deriveWeatherParams(w) {
  return {
    cloudDensity:    lerp3(w, 0, 0.8, 0.9),
    cloudDarkness:   lerp3(w, 0, 0.65, 0.9),
    windMultiplier:  lerp3(w, 1.0, 1.3, 2.5),
    fogMultiplier:   lerp3(w, 1.0, 0.5, 0.2),
    lightDimming:    lerp3(w, 0, 0.35, 0.5),
    skyDarkening:    lerp3(w, 0, 0.35, 0.5),
    starDimming:     Math.min(1.0, w),
    waveAmplitude:   lerp3(w, 1.0, 1.15, 1.8),
    rainIntensity:   Math.max(0, w - 1),
  };
}

describe('VF-WEATHER: weather-002 — Transition rate', () => {
  const v = getVector(vectors, 'weather-002');

  it('CONFIG.WEATHER_TRANSITION_RATE matches', () => {
    expect(CONFIG.WEATHER_TRANSITION_RATE).toBe(v.expected.rate);
  });

  it('~120 seconds per unit', () => {
    const secPerUnit = 1.0 / CONFIG.WEATHER_TRANSITION_RATE;
    expectClose(secPerUnit, v.expected.secondsPerUnit, 1.0, 'seconds per unit');
  });
});

describe('VF-WEATHER: weather-003 — Intensity 0 (sunny)', () => {
  const v = getVector(vectors, 'weather-003');
  const derived = deriveWeatherParams(0);

  it('cloudDensity = 0', () => expectClose(derived.cloudDensity, v.expected.cloudDensity, v.tolerance));
  it('cloudDarkness = 0', () => expectClose(derived.cloudDarkness, v.expected.cloudDarkness, v.tolerance));
  it('windMultiplier = 1.0', () => expectClose(derived.windMultiplier, v.expected.windMultiplier, v.tolerance));
  it('fogMultiplier = 1.0', () => expectClose(derived.fogMultiplier, v.expected.fogMultiplier, v.tolerance));
  it('waveAmplitude = 1.0', () => expectClose(derived.waveAmplitude, v.expected.waveAmplitude, v.tolerance));
  it('rainIntensity = 0', () => expectClose(derived.rainIntensity, v.expected.rainIntensity, v.tolerance));
});

describe('VF-WEATHER: weather-004 — Intensity 1.0 (cloudy)', () => {
  const v = getVector(vectors, 'weather-004');
  const derived = deriveWeatherParams(1.0);

  it('cloudDensity = 0.8', () => expectClose(derived.cloudDensity, v.expected.cloudDensity, v.tolerance));
  it('cloudDarkness = 0.65', () => expectClose(derived.cloudDarkness, v.expected.cloudDarkness, v.tolerance));
  it('windMultiplier = 1.3', () => expectClose(derived.windMultiplier, v.expected.windMultiplier, v.tolerance));
  it('fogMultiplier = 0.5', () => expectClose(derived.fogMultiplier, v.expected.fogMultiplier, v.tolerance));
  it('waveAmplitude = 1.15', () => expectClose(derived.waveAmplitude, v.expected.waveAmplitude, v.tolerance));
  it('rainIntensity = 0', () => expectClose(derived.rainIntensity, v.expected.rainIntensity, v.tolerance));
});

describe('VF-WEATHER: weather-005 — Intensity 2.0 (rainy)', () => {
  const v = getVector(vectors, 'weather-005');
  const derived = deriveWeatherParams(2.0);

  it('cloudDensity = 0.9', () => expectClose(derived.cloudDensity, v.expected.cloudDensity, v.tolerance));
  it('cloudDarkness = 0.9', () => expectClose(derived.cloudDarkness, v.expected.cloudDarkness, v.tolerance));
  it('windMultiplier = 2.5', () => expectClose(derived.windMultiplier, v.expected.windMultiplier, v.tolerance));
  it('fogMultiplier = 0.2', () => expectClose(derived.fogMultiplier, v.expected.fogMultiplier, v.tolerance));
  it('waveAmplitude = 1.8', () => expectClose(derived.waveAmplitude, v.expected.waveAmplitude, v.tolerance));
  it('rainIntensity = 1.0', () => expectClose(derived.rainIntensity, v.expected.rainIntensity, v.tolerance));
});

describe('VF-WEATHER: weather-006 — Rain particle CONFIG', () => {
  const v = getVector(vectors, 'weather-006');

  it('RAIN_PARTICLE_COUNT matches', () => expect(CONFIG.RAIN_PARTICLE_COUNT).toBe(v.expected.particleCount));
  it('RAIN_RADIUS matches', () => expect(CONFIG.RAIN_RADIUS).toBe(v.expected.cylinderRadius));
  it('RAIN_HEIGHT matches', () => expect(CONFIG.RAIN_HEIGHT).toBe(v.expected.cylinderHeight));
  it('RAIN_SPEED_MIN matches', () => expect(CONFIG.RAIN_SPEED_MIN).toBe(v.expected.fallSpeedMin));
  it('RAIN_SPEED_MAX matches', () => expect(CONFIG.RAIN_SPEED_MAX).toBe(v.expected.fallSpeedMax));
  it('RAIN_WIND_INFLUENCE matches', () => expect(CONFIG.RAIN_WIND_INFLUENCE).toBe(v.expected.windInfluence));
});

describe('VF-WEATHER: weather-007 — Hold time range', () => {
  const v = getVector(vectors, 'weather-007');

  it('WEATHER_HOLD_MIN matches', () => expect(CONFIG.WEATHER_HOLD_MIN).toBe(v.expected.holdMinSeconds));
  it('WEATHER_HOLD_MAX matches', () => expect(CONFIG.WEATHER_HOLD_MAX).toBe(v.expected.holdMaxSeconds));
});

describe('VF-WEATHER: weather-008 — Ground wetness hysteresis', () => {
  const v = getVector(vectors, 'weather-008');

  it('WETNESS_WET_RATE matches', () => expect(CONFIG.WETNESS_WET_RATE).toBe(v.expected.wettingRate));
  it('WETNESS_DRY_RATE matches', () => expect(CONFIG.WETNESS_DRY_RATE).toBe(v.expected.dryingRate));
  it('wetting rate > drying rate (hysteresis)', () => {
    expect(CONFIG.WETNESS_WET_RATE).toBeGreaterThan(CONFIG.WETNESS_DRY_RATE);
  });
  it('hysteresis ratio ~2:1', () => {
    expectClose(CONFIG.WETNESS_WET_RATE / CONFIG.WETNESS_DRY_RATE, v.expected.hysteresisRatio, 0.01);
  });
});

describe('VF-WEATHER: weather-009 — Intensity 0.5 (midpoint sunny→cloudy)', () => {
  const v = getVector(vectors, 'weather-009');
  const derived = deriveWeatherParams(0.5);

  it('cloudDensity = 0.4', () => expectClose(derived.cloudDensity, v.expected.cloudDensity, v.tolerance));
  it('cloudDarkness = 0.325', () => expectClose(derived.cloudDarkness, v.expected.cloudDarkness, v.tolerance));
  it('windMultiplier = 1.15', () => expectClose(derived.windMultiplier, v.expected.windMultiplier, v.tolerance));
  it('fogMultiplier = 0.75', () => expectClose(derived.fogMultiplier, v.expected.fogMultiplier, v.tolerance));
  it('waveAmplitude = 1.075', () => expectClose(derived.waveAmplitude, v.expected.waveAmplitude, v.tolerance));
  it('rainIntensity = 0', () => expectClose(derived.rainIntensity, v.expected.rainIntensity, v.tolerance));
});

describe('VF-WEATHER: weather-010 — Intensity 1.5 (midpoint cloudy→rainy)', () => {
  const v = getVector(vectors, 'weather-010');
  const derived = deriveWeatherParams(1.5);

  it('cloudDensity = 0.85', () => expectClose(derived.cloudDensity, v.expected.cloudDensity, v.tolerance));
  it('cloudDarkness = 0.775', () => expectClose(derived.cloudDarkness, v.expected.cloudDarkness, v.tolerance));
  it('windMultiplier = 1.9', () => expectClose(derived.windMultiplier, v.expected.windMultiplier, v.tolerance));
  it('fogMultiplier = 0.35', () => expectClose(derived.fogMultiplier, v.expected.fogMultiplier, v.tolerance));
  it('waveAmplitude = 1.475', () => expectClose(derived.waveAmplitude, v.expected.waveAmplitude, v.tolerance));
  it('rainIntensity = 0.5', () => expectClose(derived.rainIntensity, v.expected.rainIntensity, v.tolerance));
});
