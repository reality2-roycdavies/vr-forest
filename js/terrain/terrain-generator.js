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
  let minH = Infinity, maxH = -Infinity;
  for (let iz = 0; iz < verticesPerSide; iz++) {
    for (let ix = 0; ix < verticesPerSide; ix++) {
      const idx = iz * verticesPerSide + ix;
      const localX = ix * step;
      const localZ = iz * step;
      const worldX = worldOffsetX + localX;
      const worldZ = worldOffsetZ + localZ;

      const height = getTerrainHeight(worldX, worldZ);
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
      const rawHeight = getTerrainHeight(worldX, worldZ);

      let gr, gg, gb;

      if (rawHeight <= waterLevel) {
        // Underwater sandy bottom — darker wet sand, seen through water plane
        gr = 0.45;
        gg = 0.38;
        gb = 0.25;
      } else if (rawHeight <= shoreLevel) {
        // Shore — lerp from shore color to grass low color
        const st = (rawHeight - waterLevel) / (shoreLevel - waterLevel);
        gr = shoreCol.r + (low.r - shoreCol.r) * st;
        gg = shoreCol.g + (low.g - shoreCol.g) * st;
        gb = shoreCol.b + (low.b - shoreCol.b) * st;
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

      indices[idx++] = a;
      indices[idx++] = c;
      indices[idx++] = b;

      indices[idx++] = b;
      indices[idx++] = c;
      indices[idx++] = d;
    }
  }

  computeNormals(positions, indices, normals, vertexCount);

  return { positions, colors, normals, uvs, indices, verticesPerSide };
}

function computeNormals(positions, indices, normals, vertexCount) {
  normals.fill(0);

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;

    const ax = positions[ib] - positions[ia];
    const ay = positions[ib + 1] - positions[ia + 1];
    const az = positions[ib + 2] - positions[ia + 2];

    const bx = positions[ic] - positions[ia];
    const by = positions[ic + 1] - positions[ia + 1];
    const bz = positions[ic + 2] - positions[ia + 2];

    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
    normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
    normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
  }

  for (let i = 0; i < vertexCount; i++) {
    const idx = i * 3;
    const len = Math.sqrt(normals[idx] ** 2 + normals[idx + 1] ** 2 + normals[idx + 2] ** 2) || 1;
    normals[idx] /= len;
    normals[idx + 1] /= len;
    normals[idx + 2] /= len;
  }
}
