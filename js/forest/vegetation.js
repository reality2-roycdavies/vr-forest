// Grass, ferns, flowers, and rocks via instanced rendering
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createRockTexture } from './textures.js';

const MAX_VEG_PER_TYPE = 5000;
const MAX_FLOWERS = 3000;
const MAX_ROCKS = 2000;
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

export class VegetationPool {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];       // [grass, (unused slot), fern]
    this.flowerMeshes = [];
    this.rockMeshes = [];   // 3 sizes: small, medium, boulder
    this._createMeshes();
    this._createFlowerMeshes();
    this._createRockMeshes();
  }

  _createMeshes() {
    // --- Grass tuft: multi-blade cluster ---
    const grassGeom = this._createGrassGeometry();
    const grassMat = new THREE.MeshLambertMaterial({
      color: CONFIG.GRASS_COLOR,
      side: THREE.DoubleSide,
    });
    const grassMesh = new THREE.InstancedMesh(grassGeom, grassMat, MAX_VEG_PER_TYPE);
    grassMesh.count = 0;
    grassMesh.frustumCulled = false;
    this.scene.add(grassMesh);
    this.meshes.push(grassMesh);

    // Slot 1: placeholder (rocks are separate now)
    this.meshes.push(null);

    // --- Fern: fan of flat fronds ---
    const fernGeom = this._createFernGeometry();
    const fernMat = new THREE.MeshLambertMaterial({
      color: CONFIG.FERN_COLOR,
      side: THREE.DoubleSide,
    });
    const fernMesh = new THREE.InstancedMesh(fernGeom, fernMat, MAX_VEG_PER_TYPE);
    fernMesh.count = 0;
    fernMesh.frustumCulled = false;
    this.scene.add(fernMesh);
    this.meshes.push(fernMesh);
  }

  _createGrassGeometry() {
    const blades = 5;
    const verts = [];
    const norms = [];

    for (let i = 0; i < blades; i++) {
      const angle = (i / blades) * Math.PI;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);

      const halfW = 0.03 + (i % 3) * 0.01;
      const height = 0.2 + (i % 3) * 0.08;
      const leanX = ca * 0.03 * ((i % 2) ? 1 : -1);
      const leanZ = sa * 0.03 * ((i % 2) ? 1 : -1);
      const offX = ca * 0.02;
      const offZ = sa * 0.02;

      const bx1 = offX - sa * halfW;
      const bz1 = offZ + ca * halfW;
      const bx2 = offX + sa * halfW;
      const bz2 = offZ - ca * halfW;
      const tx = offX + leanX;
      const tz = offZ + leanZ;

      verts.push(bx1, 0, bz1, bx2, 0, bz2, tx, height, tz);
      norms.push(ca, 0.3, sa, ca, 0.3, sa, ca, 0.3, sa);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    return geom;
  }

  _createFernGeometry() {
    const fronds = 4;
    const verts = [];
    const norms = [];

    for (let i = 0; i < fronds; i++) {
      const angle = (i / fronds) * Math.PI * 2;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);

      const tx = ca * 0.25;
      const tz = sa * 0.25;
      const sx = ca * 0.1 - sa * 0.06;
      const sz = sa * 0.1 + ca * 0.06;

      verts.push(0, 0.02, 0, tx, 0.12, tz, sx, 0.08, sz);
      norms.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    return geom;
  }

  _createRockMeshes() {
    const rockTex = createRockTexture(64);

    // 3 rock sizes with different jagged shapes
    const sizes = [
      { radius: 0.12, detail: 0, scaleY: 0.6 },  // small pebble
      { radius: 0.25, detail: 1, scaleY: 0.5 },  // medium rock
      { radius: 0.5,  detail: 1, scaleY: 0.45 },  // large boulder
    ];

    for (let si = 0; si < sizes.length; si++) {
      const s = sizes[si];
      const geom = new THREE.IcosahedronGeometry(s.radius, s.detail);

      // Jag the vertices for a rough look
      const pos = geom.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const hash = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
        const jag = ((hash - Math.floor(hash)) - 0.5) * s.radius * 0.4;
        pos.setXYZ(i, x + x * jag * 0.3, y * s.scaleY + jag * 0.1, z + z * jag * 0.3);
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();

      // Add vertex colors for stone variation
      const colors = new Float32Array(pos.count * 3);
      const colorIdx = si % CONFIG.ROCK_COLORS.length;
      const baseColor = new THREE.Color(CONFIG.ROCK_COLORS[colorIdx]);
      for (let i = 0; i < pos.count; i++) {
        const hash = Math.sin(pos.getX(i) * 431.1 + pos.getZ(i) * 217.3) * 43758.5453;
        const frac = (hash - Math.floor(hash)) - 0.5;
        colors[i * 3] = Math.max(0, Math.min(1, baseColor.r + frac * 0.12));
        colors[i * 3 + 1] = Math.max(0, Math.min(1, baseColor.g + frac * 0.1));
        colors[i * 3 + 2] = Math.max(0, Math.min(1, baseColor.b + frac * 0.1));
      }
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const mat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        map: rockTex,
      });

      const mesh = new THREE.InstancedMesh(geom, mat, MAX_ROCKS);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.rockMeshes.push(mesh);
    }
  }

  _createFlowerMeshes() {
    const flowerGeom = this._createFlowerGeometry();
    for (const color of CONFIG.FLOWER_COLORS) {
      const mat = new THREE.MeshLambertMaterial({
        color,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.InstancedMesh(flowerGeom, mat, MAX_FLOWERS);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.flowerMeshes.push(mesh);
    }
  }

  _createFlowerGeometry() {
    const verts = [];
    const norms = [];
    const stemH = 0.18;

    verts.push(-0.005, 0, 0, 0.005, 0, 0, 0.005, stemH, 0);
    verts.push(-0.005, 0, 0, 0.005, stemH, 0, -0.005, stemH, 0);
    norms.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
    norms.push(0, 0, 1, 0, 0, 1, 0, 0, 1);

    const petals = 5;
    const petalLen = 0.045;
    const petalW = 0.025;
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const tx = ca * petalLen;
      const tz = sa * petalLen;
      const perpX = -sa * petalW;
      const perpZ = ca * petalW;
      verts.push(perpX, stemH, perpZ, -perpX, stemH, -perpZ, tx, stemH + 0.01, tz);
      norms.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    return geom;
  }

  /**
   * Rebuild all vegetation, flower, and rock instances from active chunks
   */
  rebuild(chunkIterator) {
    const vegCounts = [0, 0, 0];
    const allVeg = [[], [], []];
    const flowerCounts = new Array(CONFIG.FLOWER_COLORS.length).fill(0);
    const allFlowers = CONFIG.FLOWER_COLORS.map(() => []);
    const rockCounts = [0, 0, 0];
    const allRocks = [[], [], []];

    for (const chunk of chunkIterator) {
      if (!chunk.active) continue;

      for (const v of chunk.vegPositions) {
        if (vegCounts[v.type] < MAX_VEG_PER_TYPE) {
          allVeg[v.type].push(v);
          vegCounts[v.type]++;
        }
      }

      if (chunk.flowerPositions) {
        for (const f of chunk.flowerPositions) {
          if (flowerCounts[f.colorIdx] < MAX_FLOWERS) {
            allFlowers[f.colorIdx].push(f);
            flowerCounts[f.colorIdx]++;
          }
        }
      }

      if (chunk.rockPositions) {
        for (const r of chunk.rockPositions) {
          if (rockCounts[r.sizeIdx] < MAX_ROCKS) {
            allRocks[r.sizeIdx].push(r);
            rockCounts[r.sizeIdx]++;
          }
        }
      }
    }

    // Rebuild grass and fern (slots 0 and 2, slot 1 is null)
    for (let type = 0; type < 3; type++) {
      const mesh = this.meshes[type];
      if (!mesh) continue;

      const veg = allVeg[type];
      mesh.count = veg.length;

      for (let i = 0; i < veg.length; i++) {
        const v = veg[i];
        _position.set(v.x, v.y, v.z);

        const angle = (v.x * 13.37 + v.z * 7.13) % (Math.PI * 2);
        _euler.set(0, angle, 0);
        _quaternion.setFromEuler(_euler);

        const s = v.scale;
        if (type === 0) _scale.set(s * CONFIG.VEG_GRASS_SCALE, s * CONFIG.VEG_GRASS_SCALE, s * CONFIG.VEG_GRASS_SCALE);
        else _scale.set(s * CONFIG.VEG_FERN_SCALE, s * CONFIG.VEG_FERN_SCALE, s * CONFIG.VEG_FERN_SCALE);

        _matrix.compose(_position, _quaternion, _scale);
        mesh.setMatrixAt(i, _matrix);
      }

      if (veg.length > 0) mesh.instanceMatrix.needsUpdate = true;
    }

    // Rebuild rocks
    for (let si = 0; si < 3; si++) {
      const rocks = allRocks[si];
      const mesh = this.rockMeshes[si];
      mesh.count = rocks.length;

      for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i];
        _position.set(r.x, r.y, r.z);

        // Each rock gets a unique 3-axis rotation for variety
        const seed = r.rotSeed;
        _euler.set(
          (Math.sin(seed * 1.1) * 0.3),
          (seed * 73.13) % (Math.PI * 2),
          (Math.sin(seed * 2.7) * 0.25)
        );
        _quaternion.setFromEuler(_euler);

        // Slight per-instance scale variation
        const sv = 0.8 + (Math.sin(seed * 5.3) * 0.5 + 0.5) * 0.6;
        const svY = sv * (0.6 + Math.sin(seed * 3.1) * 0.3);
        _scale.set(sv, svY, sv);

        _matrix.compose(_position, _quaternion, _scale);
        mesh.setMatrixAt(i, _matrix);
      }

      if (rocks.length > 0) mesh.instanceMatrix.needsUpdate = true;
    }

    // Rebuild flowers
    for (let ci = 0; ci < CONFIG.FLOWER_COLORS.length; ci++) {
      const flowers = allFlowers[ci];
      const mesh = this.flowerMeshes[ci];
      mesh.count = flowers.length;

      for (let i = 0; i < flowers.length; i++) {
        const f = flowers[i];
        _position.set(f.x, f.y, f.z);

        const angle = (f.x * 17.3 + f.z * 11.7) % (Math.PI * 2);
        _euler.set(0, angle, 0);
        _quaternion.setFromEuler(_euler);

        const s = f.scale;
        _scale.set(s, s, s);
        _matrix.compose(_position, _quaternion, _scale);
        mesh.setMatrixAt(i, _matrix);
      }

      if (flowers.length > 0) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
