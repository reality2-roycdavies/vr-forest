// Single terrain chunk: ground mesh + tree/vegetation/rock/flower placement
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { generateTerrainData } from './terrain-generator.js';
import { getTreeDensity, getTerrainHeight, getJitter, getVegDensity, getRockDensity } from './noise.js';
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
  }

  _createMesh(data) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
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

    geom.getAttribute('color').set(data.colors);
    geom.getAttribute('color').needsUpdate = true;

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

          // Type: 0=grass, 2=fern (rocks handled separately now)
          let type;
          if (density > 0.5) type = 2;      // fern
          else type = 0;                      // grass

          const scale = 0.5 + density * 0.8;
          this.vegPositions.push({ x: jx, y, z: jz, type, scale });
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

          const colorIdx = Math.abs(Math.floor((jx * 7.7 + jz * 3.3) * 100)) % numColors;
          const scale = CONFIG.FLOWER_SCALE + density * 0.3;

          this.flowerPositions.push({ x: jx, y, z: jz, colorIdx, scale });
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

  deactivate() {
    this.active = false;
    if (this.mesh) this.mesh.visible = false;
    this.treePositions.length = 0;
    this.vegPositions.length = 0;
    this.flowerPositions.length = 0;
    this.rockPositions.length = 0;
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
    this.active = false;
  }
}
