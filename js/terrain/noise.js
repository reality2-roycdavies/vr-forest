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

const rng7 = mulberry32(CONFIG.TERRAIN_SEED + 6);
const streamNoise2D = createNoise2D(rng7);

const rng8 = mulberry32(CONFIG.TERRAIN_SEED + 7);
const warpNoise2D = createNoise2D(rng8);

const rng9 = mulberry32(CONFIG.TERRAIN_SEED + 8);
const collectibleNoise2D = createNoise2D(rng9);

const rng10 = mulberry32(CONFIG.TERRAIN_SEED + 9);
const mountainNoise2D = createNoise2D(rng10);
const rng11 = mulberry32(CONFIG.TERRAIN_SEED + 10);
const mountainWarpNoise2D = createNoise2D(rng11);
const rng12 = mulberry32(CONFIG.TERRAIN_SEED + 11);
const mountainDetailNoise2D = createNoise2D(rng12);

const rng13 = mulberry32(CONFIG.TERRAIN_SEED + 12);
const logNoise2D = createNoise2D(rng13);

const rng14 = mulberry32(CONFIG.TERRAIN_SEED + 13);
const cottageNoise2D = createNoise2D(rng14);

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
 * Get terrain height at world coordinates.
 * Includes stream channel carving via domain-warped ridge noise.
 */
export function getTerrainHeight(worldX, worldZ) {
  const baseHeight = fractalNoise(
    worldX,
    worldZ,
    CONFIG.TERRAIN_SCALE,
    CONFIG.TERRAIN_OCTAVES,
    CONFIG.TERRAIN_PERSISTENCE,
    CONFIG.TERRAIN_LACUNARITY
  ) * CONFIG.TERRAIN_HEIGHT;

  // Stream channels — ridge noise creates continuous valley lines
  const warp = CONFIG.STREAM_WARP;
  const warpX = warpNoise2D(worldX * 0.006, worldZ * 0.006) * warp;
  const warpZ = warpNoise2D(worldX * 0.006 + 100, worldZ * 0.006 + 100) * warp;

  const scale = CONFIG.STREAM_SCALE;
  const raw = streamNoise2D((worldX + warpX) * scale, (worldZ + warpZ) * scale);
  const ridge = 1 - Math.abs(raw);                         // peaks along zero-crossings
  const channel = Math.pow(ridge, CONFIG.STREAM_SHARPNESS); // sharpen to narrow channels

  // Carve through most terrain, only fade out on the highest peaks
  const normalizedH = (baseHeight / CONFIG.TERRAIN_HEIGHT + 1) * 0.5; // 0..1
  const carveMask = Math.max(0, 1 - normalizedH * 0.8);               // carves across most terrain

  const streamH = baseHeight - channel * CONFIG.STREAM_DEPTH * carveMask;

  // Mountain chains — additive ridge noise (inverse of stream carving)
  const mWarp = CONFIG.MOUNTAIN_WARP;
  const mwx = mountainWarpNoise2D(worldX * 0.004, worldZ * 0.004) * mWarp;
  const mwz = mountainWarpNoise2D(worldX * 0.004 + 200, worldZ * 0.004 + 200) * mWarp;

  const mScale = CONFIG.MOUNTAIN_SCALE;
  const mRaw = mountainNoise2D((worldX + mwx) * mScale, (worldZ + mwz) * mScale);
  const mRidge = 1 - mRaw * mRaw; // smooth parabolic peak (no knife edge)
  const mChannel = Math.pow(mRidge, CONFIG.MOUNTAIN_SHARPNESS);

  // Detail noise — smooth (non-ridge) noise modulates ridge height for organic variation
  const mDetail = mountainDetailNoise2D((worldX + mwx) * mScale * 2.5, (worldZ + mwz) * mScale * 2.5);
  const mBlended = mChannel * (0.7 + mDetail * 0.3); // modulates 0.4..1.0 of main ridge

  // Amplitude modulation — large-scale variation so peaks differ in height
  const ampMod = mountainDetailNoise2D(worldX * 0.0012, worldZ * 0.0012) * 0.4 + 0.6; // 0.2..1.0

  // Only build mountains where ridge is strong enough
  const mMask = Math.max(0, mBlended - CONFIG.MOUNTAIN_THRESHOLD) / (1 - CONFIG.MOUNTAIN_THRESHOLD);

  // Suppress mountains near spawn (0,0) so player starts in forest clearing
  const spawnDist = Math.sqrt(worldX * worldX + worldZ * worldZ);
  const spawnFade = Math.min(1, Math.max(0, (spawnDist - 60) / 40)); // fade in 60-100m from origin

  // Foothills — rolling hills that appear near mountains, using unthresholded ridge as proximity
  const foothillNoise = mountainDetailNoise2D(worldX * CONFIG.FOOTHILL_SCALE, worldZ * CONFIG.FOOTHILL_SCALE);
  const foothillBase = (foothillNoise * 0.5 + 0.5); // 0..1
  // Foothills scale with proximity to mountain ridges (mBlended before threshold)
  const foothillProximity = Math.min(1, mBlended * 2.5); // ramp up near ridges
  const foothillH = foothillBase * foothillProximity * CONFIG.FOOTHILL_HEIGHT;

  // Valley depression — deepen terrain between mountain ridges to create mountain lakes
  // Active near mountains (foothillProximity > 0) but not on the ridges (mMask low)
  const valleyDip = foothillProximity * (1 - mMask) * CONFIG.MOUNTAIN_VALLEY_DEPTH;

  return streamH + (mMask * ampMod * CONFIG.MOUNTAIN_HEIGHT + foothillH - valleyDip) * spawnFade;
}

/**
 * Mountain factor at world coordinates (0 = no mountain, 1 = peak)
 */
export function getMountainFactor(worldX, worldZ) {
  const mWarp = CONFIG.MOUNTAIN_WARP;
  const mwx = mountainWarpNoise2D(worldX * 0.004, worldZ * 0.004) * mWarp;
  const mwz = mountainWarpNoise2D(worldX * 0.004 + 200, worldZ * 0.004 + 200) * mWarp;
  const mScale = CONFIG.MOUNTAIN_SCALE;
  const mRaw = mountainNoise2D((worldX + mwx) * mScale, (worldZ + mwz) * mScale);
  const mRidge = 1 - mRaw * mRaw; // smooth parabolic peak (no knife edge)
  const mChannel = Math.pow(mRidge, CONFIG.MOUNTAIN_SHARPNESS);
  const mDetail = mountainDetailNoise2D((worldX + mwx) * mScale * 2.5, (worldZ + mwz) * mScale * 2.5);
  const mBlended = mChannel * (0.7 + mDetail * 0.3);
  const ampMod = mountainDetailNoise2D(worldX * 0.0012, worldZ * 0.0012) * 0.4 + 0.6;
  const mMask = Math.max(0, mBlended - CONFIG.MOUNTAIN_THRESHOLD) / (1 - CONFIG.MOUNTAIN_THRESHOLD);
  const spawnDist = Math.sqrt(worldX * worldX + worldZ * worldZ);
  const spawnFade = Math.min(1, Math.max(0, (spawnDist - 60) / 40));
  return mMask * ampMod * spawnFade;
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
const _jitterResult = { x: 0, z: 0 };
export function getJitter(worldX, worldZ) {
  _jitterResult.x = jitterNoise2D(worldX * 0.7, worldZ * 0.7);
  _jitterResult.z = jitterNoise2D(worldX * 0.7 + 100, worldZ * 0.7 + 100);
  return _jitterResult;
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

/**
 * Collectible placement noise — scale 0.03 for ~30-50m clusters
 */
export function getCollectibleDensity(worldX, worldZ) {
  return collectibleNoise2D(worldX * 0.03, worldZ * 0.03);
}

/**
 * Fallen log / stump placement noise
 */
export function getLogDensity(worldX, worldZ) {
  return logNoise2D(worldX * 0.04, worldZ * 0.04);
}

/**
 * Cottage placement noise — low frequency for sparse placement
 */
export function getCottageDensity(worldX, worldZ) {
  return cottageNoise2D(worldX * 0.02, worldZ * 0.02);
}

/**
 * Terrain slope at world coordinates (rise/run from finite differences)
 */
export function getTerrainSlope(worldX, worldZ) {
  const eps = 0.5;
  const hL = getTerrainHeight(worldX - eps, worldZ);
  const hR = getTerrainHeight(worldX + eps, worldZ);
  const hD = getTerrainHeight(worldX, worldZ - eps);
  const hU = getTerrainHeight(worldX, worldZ + eps);
  const dx = (hR - hL) / (2 * eps);
  const dz = (hU - hD) / (2 * eps);
  return Math.sqrt(dx * dx + dz * dz);
}
