import { expect } from 'vitest';

/**
 * Assert a value is within [min, max] inclusive.
 */
export function expectInRange(value, min, max, label = 'value') {
  expect(value, `${label} should be >= ${min}`).toBeGreaterThanOrEqual(min);
  expect(value, `${label} should be <= ${max}`).toBeLessThanOrEqual(max);
}

/**
 * Assert a value is approximately equal to expected within tolerance.
 */
export function expectClose(actual, expected, tolerance, label = 'value') {
  expect(
    Math.abs(actual - expected),
    `${label}: expected ~${expected}, got ${actual} (tolerance ${tolerance})`
  ).toBeLessThanOrEqual(tolerance);
}
