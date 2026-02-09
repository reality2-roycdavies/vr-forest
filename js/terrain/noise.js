// Seeded simplex noise wrapper
import { createNoise2D } from 'simplex-noise';
import { CONFIG } from '../config.js';

// Simple seeded PRNG (mulberry32)
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(CONFIG.TERRAIN_SEED);
const noise2D = createNoise2D(rng);

// Additional noise instances for different purposes
const rng2 = mulberry32(CONFIG.TERRAIN_SEED + 1);
const treeNoise2D = createNoise2D(rng2);

const rng3 = mulberry32(CONFIG.TERRAIN_SEED + 2);
const vegNoise2D = createNoise2D(rng3);

const rng4 = mulberry32(CONFIG.TERRAIN_SEED + 3);
const jitterNoise2D = createNoise2D(rng4);

const rng5 = mulberry32(CONFIG.TERRAIN_SEED + 4);
const dirtNoise2D = createNoise2D(rng5);

const rng6 = mulberry32(CONFIG.TERRAIN_SEED + 5);
const rockNoise2D = createNoise2D(rng6);

/**
 * Multi-octave fractal noise
 */
export function fractalNoise(x, z, scale, octaves, persistence, lacunarity) {
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue; // Normalized to [-1, 1]
}

/**
 * Get terrain height at world coordinates
 */
export function getTerrainHeight(worldX, worldZ) {
  return fractalNoise(
    worldX,
    worldZ,
    CONFIG.TERRAIN_SCALE,
    CONFIG.TERRAIN_OCTAVES,
    CONFIG.TERRAIN_PERSISTENCE,
    CONFIG.TERRAIN_LACUNARITY
  ) * CONFIG.TERRAIN_HEIGHT;
}

/**
 * Tree density noise at world coordinates
 */
export function getTreeDensity(worldX, worldZ) {
  return treeNoise2D(worldX * CONFIG.TREE_DENSITY_SCALE, worldZ * CONFIG.TREE_DENSITY_SCALE);
}

/**
 * Vegetation density noise
 */
export function getVegDensity(worldX, worldZ) {
  return vegNoise2D(worldX * 0.08, worldZ * 0.08);
}

/**
 * Jitter noise for natural placement offsets
 */
export function getJitter(worldX, worldZ) {
  return {
    x: jitterNoise2D(worldX * 0.7, worldZ * 0.7),
    z: jitterNoise2D(worldX * 0.7 + 100, worldZ * 0.7 + 100),
  };
}

/**
 * Dirt patch noise - returns 0..1, higher = more dirt
 */
export function getDirtAmount(worldX, worldZ) {
  const n1 = dirtNoise2D(worldX * CONFIG.GROUND_DIRT_SCALE, worldZ * CONFIG.GROUND_DIRT_SCALE);
  const n2 = dirtNoise2D(worldX * CONFIG.GROUND_DIRT_SCALE * 3.1, worldZ * CONFIG.GROUND_DIRT_SCALE * 3.1) * 0.3;
  return (n1 + n2) * 0.5 + 0.5; // normalize to 0..1
}

/**
 * Rock placement noise
 */
export function getRockDensity(worldX, worldZ) {
  return rockNoise2D(worldX * 0.04, worldZ * 0.04);
}
