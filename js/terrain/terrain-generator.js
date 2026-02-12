// Multi-octave heightmap terrain generator with grass/dirt blending
import { getTerrainHeight, getDirtAmount } from './noise.js';
import { CONFIG } from '../config.js';

/**
 * Generate height, color, UV, and normal data for a chunk.
 */
export function generateTerrainData(chunkX, chunkZ) {
  const size = CONFIG.CHUNK_SIZE;
  const segments = CONFIG.CHUNK_SEGMENTS;
  const verticesPerSide = segments + 1;
  const vertexCount = verticesPerSide * verticesPerSide;

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  const worldOffsetX = chunkX * size;
  const worldOffsetZ = chunkZ * size;
  const step = size / segments;

  const low = CONFIG.GROUND_LOW_COLOR;
  const mid = CONFIG.GROUND_MID_COLOR;
  const high = CONFIG.GROUND_HIGH_COLOR;
  const dirt = CONFIG.GROUND_DIRT_COLOR;
  const dirtDark = CONFIG.GROUND_DIRT_DARK;
  const dirtThresh = CONFIG.GROUND_DIRT_THRESHOLD;
  const waterLevel = CONFIG.WATER_LEVEL;
  const shoreLevel = CONFIG.SHORE_LEVEL;
  const waterCol = CONFIG.WATER_COLOR;
  const shoreCol = CONFIG.SHORE_COLOR;

  // Generate vertices + UVs (natural terrain height, no clamping)
  // Cache heights to avoid double getTerrainHeight calls
  const heightCache = new Float32Array(vertexCount);
  let minH = Infinity, maxH = -Infinity;
  for (let iz = 0; iz < verticesPerSide; iz++) {
    for (let ix = 0; ix < verticesPerSide; ix++) {
      const idx = iz * verticesPerSide + ix;
      const localX = ix * step;
      const localZ = iz * step;
      const worldX = worldOffsetX + localX;
      const worldZ = worldOffsetZ + localZ;

      const height = getTerrainHeight(worldX, worldZ);
      heightCache[idx] = height;
      if (height < minH) minH = height;
      if (height > maxH) maxH = height;

      positions[idx * 3] = localX;
      positions[idx * 3 + 1] = height;
      positions[idx * 3 + 2] = localZ;

      // World-space UVs so texture tiles seamlessly across chunks
      const texRepeat = CONFIG.GROUND_TEX_REPEAT;
      uvs[idx * 2] = (worldX / size) * texRepeat;
      uvs[idx * 2 + 1] = (worldZ / size) * texRepeat;
    }
  }

  // Assign vertex colors: water / shore / grass+dirt
  // Use global fixed height range so colors match across chunk boundaries
  const globalMin = -CONFIG.TERRAIN_HEIGHT;
  const globalMax = CONFIG.TERRAIN_HEIGHT;
  const range = globalMax - globalMin;
  for (let iz = 0; iz < verticesPerSide; iz++) {
    for (let ix = 0; ix < verticesPerSide; ix++) {
      const i = iz * verticesPerSide + ix;
      const worldX = worldOffsetX + ix * step;
      const worldZ = worldOffsetZ + iz * step;
      const rawHeight = heightCache[i];

      let gr, gg, gb;

      // Wet sand base color (underwater)
      const wetR = 0.45, wetG = 0.38, wetB = 0.25;

      if (rawHeight <= shoreLevel) {
        // Smooth blend: wet sand → shore → grass low across the full range
        // Use waterLevel as midpoint but no hard break
        const range01 = Math.max(0, Math.min(1, (rawHeight - (waterLevel - 1.0)) / (shoreLevel - waterLevel + 2.0)));
        const t = range01 * range01 * (3 - 2 * range01); // smoothstep
        if (t < 0.5) {
          // wet sand → shore
          const s = t * 2;
          gr = wetR + (shoreCol.r - wetR) * s;
          gg = wetG + (shoreCol.g - wetG) * s;
          gb = wetB + (shoreCol.b - wetB) * s;
        } else {
          // shore → grass low
          const s = (t - 0.5) * 2;
          gr = shoreCol.r + (low.r - shoreCol.r) * s;
          gg = shoreCol.g + (low.g - shoreCol.g) * s;
          gb = shoreCol.b + (low.b - shoreCol.b) * s;
        }
      } else {
        // Normal grass/dirt coloring — t based on global height range
        const h = rawHeight;
        const t = (h - globalMin) / range;

        if (t < 0.5) {
          const s = t * 2;
          gr = low.r + (mid.r - low.r) * s;
          gg = low.g + (mid.g - low.g) * s;
          gb = low.b + (mid.b - low.b) * s;
        } else {
          const s = (t - 0.5) * 2;
          gr = mid.r + (high.r - mid.r) * s;
          gg = mid.g + (high.g - mid.g) * s;
          gb = mid.b + (high.b - mid.b) * s;
        }

        // Blend shore color into the grass zone just above shoreLevel
        const shoreBlendWidth = 1.5; // meters above shoreLevel to blend
        if (rawHeight < shoreLevel + shoreBlendWidth) {
          const sb = (rawHeight - shoreLevel) / shoreBlendWidth; // 0 at shore, 1 at full grass
          const sbs = sb * sb * (3 - 2 * sb); // smoothstep
          gr = low.r + (gr - low.r) * sbs;
          gg = low.g + (gg - low.g) * sbs;
          gb = low.b + (gb - low.b) * sbs;
        }

        // Dirt blending
        const dirtAmt = getDirtAmount(worldX, worldZ);
        if (dirtAmt > dirtThresh) {
          const blend = Math.min(1, (dirtAmt - dirtThresh) / (1 - dirtThresh) * 1.8);
          const dt = t < 0.3 ? 0.4 : 0;
          const dr = dirt.r + (dirtDark.r - dirt.r) * dt;
          const dg = dirt.g + (dirtDark.g - dirt.g) * dt;
          const db = dirt.b + (dirtDark.b - dirt.b) * dt;

          gr = gr + (dr - gr) * blend;
          gg = gg + (dg - gg) * blend;
          gb = gb + (db - gb) * blend;
        }
      }

      // Subtle per-vertex variation
      const variation = Math.sin(worldX * 13.37 + worldZ * 7.91) * 0.02;
      colors[i * 3] = Math.max(0, Math.min(1, gr + variation));
      colors[i * 3 + 1] = Math.max(0, Math.min(1, gg + variation));
      colors[i * 3 + 2] = Math.max(0, Math.min(1, gb + variation));
    }
  }

  // Generate indices
  const indexCount = segments * segments * 6;
  const indices = new Uint16Array(indexCount);
  let idx = 0;
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * verticesPerSide + ix;
      const b = a + 1;
      const c = a + verticesPerSide;
      const d = c + 1;

      // Alternate diagonal direction in checkerboard to prevent directional banding
      if ((ix + iz) % 2 === 0) {
        indices[idx++] = a;
        indices[idx++] = c;
        indices[idx++] = b;
        indices[idx++] = b;
        indices[idx++] = c;
        indices[idx++] = d;
      } else {
        indices[idx++] = a;
        indices[idx++] = c;
        indices[idx++] = d;
        indices[idx++] = a;
        indices[idx++] = d;
        indices[idx++] = b;
      }
    }
  }

  computeNormalsFromHeightmap(normals, verticesPerSide, step, worldOffsetX, worldOffsetZ);

  return { positions, colors, normals, uvs, indices, verticesPerSide };
}

/**
 * Compute normals from the continuous heightmap using central differences.
 * This produces seamless normals across chunk boundaries (no lighting seams)
 * because getTerrainHeight() is independent of chunk geometry.
 */
function computeNormalsFromHeightmap(normals, verticesPerSide, step, worldOffsetX, worldOffsetZ) {
  for (let iz = 0; iz < verticesPerSide; iz++) {
    for (let ix = 0; ix < verticesPerSide; ix++) {
      const idx = (iz * verticesPerSide + ix) * 3;
      const wx = worldOffsetX + ix * step;
      const wz = worldOffsetZ + iz * step;

      // Central differences — samples extend beyond chunk edges for continuity
      const hL = getTerrainHeight(wx - step, wz);
      const hR = getTerrainHeight(wx + step, wz);
      const hD = getTerrainHeight(wx, wz - step);
      const hU = getTerrainHeight(wx, wz + step);

      let nx = hL - hR;
      let ny = 2 * step;
      let nz = hD - hU;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

      normals[idx] = nx / len;
      normals[idx + 1] = ny / len;
      normals[idx + 2] = nz / len;
    }
  }
}
