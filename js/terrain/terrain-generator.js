// Multi-octave heightmap terrain generator with grass/dirt blending
import { getTerrainHeight, getTreeDensity } from './noise.js';
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
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const treeDensityAttr = new Float32Array(vertexCount);

  const worldOffsetX = chunkX * size;
  const worldOffsetZ = chunkZ * size;
  const step = size / segments;

  const shoreLevel = CONFIG.SHORE_LEVEL;

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

  // Tree density attribute for dirt-under-trees in shader.
  // Low-frequency signal (~20m patches) so vertex interpolation is smooth.
  for (let iz = 0; iz < verticesPerSide; iz++) {
    for (let ix = 0; ix < verticesPerSide; ix++) {
      const i = iz * verticesPerSide + ix;
      const worldX = worldOffsetX + ix * step;
      const worldZ = worldOffsetZ + iz * step;
      const rawHeight = heightCache[i];

      // Tree density: -1..1 from simplex noise, remap to 0..1
      let treeDens = 0;
      if (rawHeight > shoreLevel) {
        treeDens = (getTreeDensity(worldX, worldZ) + 1) * 0.5;
      }
      treeDensityAttr[i] = treeDens;
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

  computeNormalsFromHeightmap(normals, heightCache, verticesPerSide, step, worldOffsetX, worldOffsetZ);

  return { positions, normals, uvs, indices, treeDensityAttr, verticesPerSide };
}

/**
 * Compute normals from the continuous heightmap using central differences.
 * Interior vertices use the cached heights (free); boundary vertices call
 * getTerrainHeight() for seamless normals across chunk edges.
 */
function computeNormalsFromHeightmap(normals, heightCache, verticesPerSide, step, worldOffsetX, worldOffsetZ) {
  const last = verticesPerSide - 1;

  for (let iz = 0; iz < verticesPerSide; iz++) {
    for (let ix = 0; ix < verticesPerSide; ix++) {
      const idx = (iz * verticesPerSide + ix) * 3;

      // Use cache for interior neighbors, getTerrainHeight for boundary
      const hL = ix > 0
        ? heightCache[iz * verticesPerSide + (ix - 1)]
        : getTerrainHeight(worldOffsetX + (ix - 1) * step, worldOffsetZ + iz * step);
      const hR = ix < last
        ? heightCache[iz * verticesPerSide + (ix + 1)]
        : getTerrainHeight(worldOffsetX + (ix + 1) * step, worldOffsetZ + iz * step);
      const hD = iz > 0
        ? heightCache[(iz - 1) * verticesPerSide + ix]
        : getTerrainHeight(worldOffsetX + ix * step, worldOffsetZ + (iz - 1) * step);
      const hU = iz < last
        ? heightCache[(iz + 1) * verticesPerSide + ix]
        : getTerrainHeight(worldOffsetX + ix * step, worldOffsetZ + (iz + 1) * step);

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
