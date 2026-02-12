// Single terrain chunk: ground mesh + tree/vegetation/rock/flower placement
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { generateTerrainData } from './terrain-generator.js';
import { getTreeDensity, getTerrainHeight, getJitter, getVegDensity, getRockDensity, getCollectibleDensity } from './noise.js';
import { getGroundMaterial } from './ground-material.js';

export class Chunk {
  constructor() {
    this.mesh = null;
    this.chunkX = 0;
    this.chunkZ = 0;
    this.treePositions = [];   // { x, y, z, type, scale }
    this.vegPositions = [];    // { x, y, z, type, scale }
    this.flowerPositions = []; // { x, y, z, colorIdx, scale }
    this.rockPositions = [];   // { x, y, z, sizeIdx, rotSeed }
    this.collectiblePositions = []; // { x, y, z }
    this.foamSegments = [];         // { x1, z1, x2, z2, nx, nz }
    this.active = false;
  }

  build(chunkX, chunkZ) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.active = true;

    const data = generateTerrainData(chunkX, chunkZ);

    if (this.mesh) {
      this._updateGeometry(data);
    } else {
      this._createMesh(data);
    }

    this.mesh.position.set(
      chunkX * CONFIG.CHUNK_SIZE,
      0,
      chunkZ * CONFIG.CHUNK_SIZE
    );
    this.mesh.visible = true;

    this._generateTrees(chunkX, chunkZ);
    this._generateVegetation(chunkX, chunkZ);
    this._generateFlowers(chunkX, chunkZ);
    this._generateRocks(chunkX, chunkZ);
    this._generateCollectibles(chunkX, chunkZ);
    this._generateFoam(chunkX, chunkZ);
  }

  _createMesh(data) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geometry.setAttribute('treeDensity', new THREE.BufferAttribute(data.treeDensityAttr, 1));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));

    this.mesh = new THREE.Mesh(geometry, getGroundMaterial());
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.matrixAutoUpdate = false;
  }

  _updateGeometry(data) {
    const geom = this.mesh.geometry;

    geom.getAttribute('position').set(data.positions);
    geom.getAttribute('position').needsUpdate = true;

    geom.getAttribute('treeDensity').set(data.treeDensityAttr);
    geom.getAttribute('treeDensity').needsUpdate = true;

    geom.getAttribute('normal').set(data.normals);
    geom.getAttribute('normal').needsUpdate = true;

    geom.getAttribute('uv').set(data.uvs);
    geom.getAttribute('uv').needsUpdate = true;

    geom.computeBoundingSphere();
  }

  _generateTrees(chunkX, chunkZ) {
    this.treePositions.length = 0;
    const spacing = CONFIG.TREE_GRID_SPACING;
    const size = CONFIG.CHUNK_SIZE;
    const worldOffX = chunkX * size;
    const worldOffZ = chunkZ * size;

    for (let lz = spacing / 2; lz < size; lz += spacing) {
      for (let lx = spacing / 2; lx < size; lx += spacing) {
        const wx = worldOffX + lx;
        const wz = worldOffZ + lz;
        const density = getTreeDensity(wx, wz);

        if (density > CONFIG.TREE_DENSITY_THRESHOLD) {
          const jitter = getJitter(wx, wz);
          const jx = wx + jitter.x * CONFIG.TREE_JITTER;
          const jz = wz + jitter.z * CONFIG.TREE_JITTER;
          const y = getTerrainHeight(jx, jz);
          if (y < CONFIG.SHORE_LEVEL) continue;

          const type = Math.abs(Math.floor(density * 30)) % CONFIG.TREE_TYPES;
          const scale = CONFIG.TREE_MIN_HEIGHT +
            (density - CONFIG.TREE_DENSITY_THRESHOLD) /
            (1 - CONFIG.TREE_DENSITY_THRESHOLD) *
            (CONFIG.TREE_MAX_HEIGHT - CONFIG.TREE_MIN_HEIGHT);

          this.treePositions.push({ x: jx, y: y - 0.15, z: jz, type, scale });
        }
      }
    }
  }

  _generateVegetation(chunkX, chunkZ) {
    this.vegPositions.length = 0;
    const spacing = CONFIG.VEG_GRID_SPACING;
    const size = CONFIG.CHUNK_SIZE;
    const worldOffX = chunkX * size;
    const worldOffZ = chunkZ * size;

    for (let lz = spacing / 4; lz < size; lz += spacing) {
      for (let lx = spacing / 4; lx < size; lx += spacing) {
        const wx = worldOffX + lx;
        const wz = worldOffZ + lz;
        const density = getVegDensity(wx, wz);

        if (density > CONFIG.VEG_DENSITY_THRESHOLD) {
          const jitter = getJitter(wx + 50, wz + 50);
          const jx = wx + jitter.x * 0.5;
          const jz = wz + jitter.z * 0.5;
          const y = getTerrainHeight(jx, jz);
          if (y < CONFIG.SHORE_LEVEL + 2.5) continue; // no vegetation on sand

          // Type: 0=grass, 2=fern
          // Skip grass on dirt areas (high tree density)
          const treeDens = getTreeDensity(jx, jz);
          let type;
          // Ferns mostly under trees, some in open areas at high density
          if (density > 0.35 && (treeDens > 0.1 || density > 0.6)) type = 2;
          else if (treeDens > 0.3) continue;  // no grass on dirt under trees
          else type = 0;                       // grass

          const scale = 0.5 + density * 0.8;
          this.vegPositions.push({ x: jx, y, z: jz, type, scale });

          // Grass clusters: add 2-4 more tufts nearby
          if (type === 0) {
            const clumpCount = 2 + Math.floor(Math.abs(density) * 4);
            for (let c = 0; c < clumpCount; c++) {
              const cj = getJitter(wx + c * 17, wz + c * 43);
              const cx = jx + cj.x * 0.4;
              const cz = jz + cj.z * 0.4;
              const cy = getTerrainHeight(cx, cz);
              if (cy < CONFIG.SHORE_LEVEL) continue;
              const cs = scale * (0.6 + Math.abs(cj.x) * 0.5);
              this.vegPositions.push({ x: cx, y: cy, z: cz, type: 0, scale: cs });
            }
          }

          // Fern clusters: add 2-3 more ferns nearby
          if (type === 2 && density > 0.45) {
            for (let c = 0; c < 3; c++) {
              const cj = getJitter(wx + c * 33, wz + c * 77);
              const cx = jx + cj.x * 0.6;
              const cz = jz + cj.z * 0.6;
              const cy = getTerrainHeight(cx, cz);
              if (cy < CONFIG.SHORE_LEVEL) continue;
              const cs = scale * (0.7 + Math.abs(cj.x) * 0.4);
              this.vegPositions.push({ x: cx, y: cy, z: cz, type: 2, scale: cs });
            }
          }
        }
      }
    }
  }

  _generateFlowers(chunkX, chunkZ) {
    this.flowerPositions.length = 0;
    const spacing = CONFIG.FLOWER_GRID_SPACING;
    const size = CONFIG.CHUNK_SIZE;
    const worldOffX = chunkX * size;
    const worldOffZ = chunkZ * size;
    const numColors = CONFIG.FLOWER_COLORS.length;

    for (let lz = spacing * 0.3; lz < size; lz += spacing) {
      for (let lx = spacing * 0.3; lx < size; lx += spacing) {
        const wx = worldOffX + lx;
        const wz = worldOffZ + lz;
        const density = getVegDensity(wx + 200, wz + 200);

        if (density > CONFIG.FLOWER_DENSITY_THRESHOLD) {
          const jitter = getJitter(wx + 150, wz + 150);
          const jx = wx + jitter.x * 0.8;
          const jz = wz + jitter.z * 0.8;
          const y = getTerrainHeight(jx, jz);
          if (y < CONFIG.SHORE_LEVEL) continue;

          // Same color for whole cluster
          const colorIdx = Math.abs(Math.floor((jx * 7.7 + jz * 3.3) * 100)) % numColors;
          const scale = CONFIG.FLOWER_SCALE + density * 0.3;

          this.flowerPositions.push({ x: jx, y, z: jz, colorIdx, scale });

          // Cluster: add 3-5 more flowers nearby in same color
          const clusterCount = 3 + Math.floor(density * 4);
          for (let c = 0; c < clusterCount; c++) {
            const cj = getJitter(wx + c * 41 + 200, wz + c * 67 + 200);
            const cx = jx + cj.x * 0.4;
            const cz = jz + cj.z * 0.4;
            const cy = getTerrainHeight(cx, cz);
            if (cy < CONFIG.SHORE_LEVEL) continue;
            const cs = scale * (0.6 + Math.abs(cj.x + cj.z) * 0.5);
            this.flowerPositions.push({ x: cx, y: cy, z: cz, colorIdx, scale: cs });
          }
        }
      }
    }
  }

  _generateRocks(chunkX, chunkZ) {
    this.rockPositions.length = 0;
    const spacing = CONFIG.ROCK_GRID_SPACING;
    const size = CONFIG.CHUNK_SIZE;
    const worldOffX = chunkX * size;
    const worldOffZ = chunkZ * size;

    for (let lz = spacing * 0.4; lz < size; lz += spacing) {
      for (let lx = spacing * 0.4; lx < size; lx += spacing) {
        const wx = worldOffX + lx;
        const wz = worldOffZ + lz;
        const density = getRockDensity(wx, wz);

        if (density > CONFIG.ROCK_DENSITY_THRESHOLD) {
          const jitter = getJitter(wx + 300, wz + 300);
          const jx = wx + jitter.x * 1.5;
          const jz = wz + jitter.z * 1.5;
          const y = getTerrainHeight(jx, jz);
          if (y < CONFIG.SHORE_LEVEL) continue;

          // Size varies: 0=small, 1=medium, 2=large boulder
          let sizeIdx;
          if (density > 0.75) sizeIdx = 2;
          else if (density > 0.6) sizeIdx = 1;
          else sizeIdx = 0;

          const rotSeed = jx * 17.3 + jz * 11.7;

          this.rockPositions.push({ x: jx, y, z: jz, sizeIdx, rotSeed });
        }
      }
    }
  }

  _generateCollectibles(chunkX, chunkZ) {
    this.collectiblePositions.length = 0;
    const spacing = CONFIG.COLLECTIBLE_GRID_SPACING;
    const size = CONFIG.CHUNK_SIZE;
    const worldOffX = chunkX * size;
    const worldOffZ = chunkZ * size;

    for (let lz = spacing * 0.5; lz < size; lz += spacing) {
      for (let lx = spacing * 0.5; lx < size; lx += spacing) {
        const wx = worldOffX + lx;
        const wz = worldOffZ + lz;
        const density = getCollectibleDensity(wx, wz);

        if (density > CONFIG.COLLECTIBLE_DENSITY_THRESHOLD) {
          const jitter = getJitter(wx + 500, wz + 500);
          const jx = wx + jitter.x * 2.0;
          const jz = wz + jitter.z * 2.0;
          const y = getTerrainHeight(jx, jz);
          if (y < CONFIG.SHORE_LEVEL) continue;

          this.collectiblePositions.push({ x: jx, y: y + 0.8, z: jz });
        }
      }
    }
  }

  _generateFoam(chunkX, chunkZ) {
    this.foamSegments.length = 0;
    const step = CONFIG.FOAM_GRID_SPACING;
    const size = CONFIG.CHUNK_SIZE;
    const ox = chunkX * size;
    const oz = chunkZ * size;
    const wl = CONFIG.WATER_LEVEL;

    for (let gz = 0; gz < size; gz += step) {
      for (let gx = 0; gx < size; gx += step) {
        const wx = ox + gx;
        const wz = oz + gz;
        const h00 = getTerrainHeight(wx, wz) - wl;
        const h10 = getTerrainHeight(wx + step, wz) - wl;
        const h01 = getTerrainHeight(wx, wz + step) - wl;
        const h11 = getTerrainHeight(wx + step, wz + step) - wl;

        // Find edge crossings (marching squares)
        const cx = [];
        if (h00 * h10 < 0) {
          const t = h00 / (h00 - h10);
          cx.push(wx + t * step, wz);
        }
        if (h10 * h11 < 0) {
          const t = h10 / (h10 - h11);
          cx.push(wx + step, wz + t * step);
        }
        if (h01 * h11 < 0) {
          const t = h01 / (h01 - h11);
          cx.push(wx + t * step, wz + step);
        }
        if (h00 * h01 < 0) {
          const t = h00 / (h00 - h01);
          cx.push(wx, wz + t * step);
        }

        if (cx.length >= 4) {
          const x1 = cx[0], z1 = cx[1], x2 = cx[2], z2 = cx[3];
          const dx = x2 - x1, dz = z2 - z1;
          const len = Math.sqrt(dx * dx + dz * dz);
          if (len < 0.01) continue;

          // Per-vertex normals from terrain gradient at each crossing point
          // This ensures shared crossing points get identical offsets
          const eps = 0.15;
          const g1x = getTerrainHeight(x1 + eps, z1) - getTerrainHeight(x1 - eps, z1);
          const g1z = getTerrainHeight(x1, z1 + eps) - getTerrainHeight(x1, z1 - eps);
          const l1 = Math.sqrt(g1x * g1x + g1z * g1z) || 1;
          const g2x = getTerrainHeight(x2 + eps, z2) - getTerrainHeight(x2 - eps, z2);
          const g2z = getTerrainHeight(x2, z2 + eps) - getTerrainHeight(x2, z2 - eps);
          const l2 = Math.sqrt(g2x * g2x + g2z * g2z) || 1;

          this.foamSegments.push({
            x1, z1, x2, z2,
            nx1: -g1x / l1, nz1: -g1z / l1,
            nx2: -g2x / l2, nz2: -g2z / l2,
          });
        }
      }
    }
  }

  deactivate() {
    this.active = false;
    if (this.mesh) this.mesh.visible = false;
    this.treePositions.length = 0;
    this.vegPositions.length = 0;
    this.flowerPositions.length = 0;
    this.rockPositions.length = 0;
    this.collectiblePositions.length = 0;
    this.foamSegments.length = 0;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.treePositions.length = 0;
    this.vegPositions.length = 0;
    this.flowerPositions.length = 0;
    this.rockPositions.length = 0;
    this.collectiblePositions.length = 0;
    this.foamSegments.length = 0;
    this.active = false;
  }
}
