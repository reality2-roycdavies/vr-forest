// Grass, ferns, flowers, and rocks via instanced rendering
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createRockTexture } from './textures.js';
import { addWindToMaterial } from '../atmosphere/wind.js';

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
    addWindToMaterial(grassMat, 'vegetation');
    const grassMesh = new THREE.InstancedMesh(grassGeom, grassMat, MAX_VEG_PER_TYPE);
    grassMesh.count = 0;
    grassMesh.frustumCulled = false;
    this.scene.add(grassMesh);
    this.meshes.push(grassMesh);

    // Slot 1: placeholder (rocks are separate now)
    this.meshes.push(null);

    // --- Fern variants: 3 distinct shapes ---
    // Slot 2 is used by rebuild for type===2, but we now split across fernMeshes[]
    this.meshes.push(null); // slot 2 placeholder — ferns use this.fernVariants instead
    this.fernVariants = [];
    const fernParams = [
      { fronds: 5, lenBase: 0.18, droopBase: 0.08, rise: 0.15 },  // compact upright
      { fronds: 7, lenBase: 0.24, droopBase: 0.14, rise: 0.20 },  // full spreading
      { fronds: 4, lenBase: 0.28, droopBase: 0.18, rise: 0.16 },  // tall droopy
    ];
    for (const fp of fernParams) {
      const geom = this._createFernGeometry(fp);
      const mat = new THREE.MeshLambertMaterial({
        color: CONFIG.FERN_COLOR,
        side: THREE.DoubleSide,
      });
      addWindToMaterial(mat, 'vegetation');
      const mesh = new THREE.InstancedMesh(geom, mat, MAX_VEG_PER_TYPE);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.fernVariants.push(mesh);
    }
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

  _createFernGeometry(params = {}) {
    const fronds = params.fronds || 6;
    const lenBase = params.lenBase || 0.22;
    const droopBase = params.droopBase || 0.12;
    const riseAmt = params.rise || 0.18;
    const segs = 6;        // segments per frond for smooth curve
    const verts = [];
    const norms = [];

    for (let i = 0; i < fronds; i++) {
      const angle = (i / fronds) * Math.PI * 2 + (i * 0.25);
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const len = lenBase + (i % 3) * 0.06;
      const droopStr = droopBase + (i % 2) * 0.06;
      const curlBack = 0.03 + (i % 3) * 0.015; // tips curl inward

      // Build a smooth curved spine for this frond
      const spine = [];
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        // Outward distance with slight ease-out
        const outDist = len * (1 - (1 - t) * (1 - t)) * 0.95 + len * t * 0.05;
        // Parabolic droop: rises then falls
        const rise = riseAmt * Math.sin(t * Math.PI * 0.6);
        const droop = droopStr * t * t;
        // Curl: tip bends back slightly
        const curl = curlBack * t * t * t;
        const sx = ca * (outDist - curl) ;
        const sz = sa * (outDist - curl);
        const sy = rise - droop;
        spine.push({ x: sx, y: sy, z: sz });
      }

      // Central stem strip: connect spine points with width tapering to tip
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs;
        const t1 = (s + 1) / segs;
        const w0 = 0.005 * (1 - t0 * 0.7); // thin stem
        const w1 = 0.005 * (1 - t1 * 0.7);
        const p0 = spine[s], p1 = spine[s + 1];
        const px0 = -sa * w0, pz0 = ca * w0;
        const px1 = -sa * w1, pz1 = ca * w1;
        verts.push(p0.x + px0, p0.y, p0.z + pz0, p0.x - px0, p0.y, p0.z - pz0, p1.x + px1, p1.y, p1.z + pz1);
        verts.push(p0.x - px0, p0.y, p0.z - pz0, p1.x - px1, p1.y, p1.z - pz1, p1.x + px1, p1.y, p1.z + pz1);
        for (let n = 0; n < 6; n++) norms.push(0, 0.85, 0.15);
      }

      // Dense leaflet pairs along the frond — interpolated between spine points
      const leafletsPerSeg = 5;
      for (let s = 0; s < segs; s++) {
        const p0 = spine[s], p1 = spine[s + 1];
        for (let li = 0; li < leafletsPerSeg; li++) {
          const lt = (li + 0.5) / leafletsPerSeg;
          const t = (s + lt) / segs;
          if (t < 0.08 || t > 0.95) continue; // skip very base and very tip
          // Interpolate position on spine
          const px = p0.x + (p1.x - p0.x) * lt;
          const py = p0.y + (p1.y - p0.y) * lt;
          const pz = p0.z + (p1.z - p0.z) * lt;
          // Leaflet size: small at base, largest at 40%, tapers to tip
          const sizeCurve = Math.sin(t * Math.PI) * (1 - t * 0.3);
          const leafW = 0.07 * sizeCurve;
          const leafL = 0.04 * sizeCurve; // length along frond direction
          const leafDroop = -0.02 * t * t;
          // Perpendicular to frond (left/right)
          const lpx = -sa * leafW;
          const lpz = ca * leafW;
          // Forward along frond for leaf length
          const flx = ca * leafL;
          const flz = sa * leafL;
          // Left leaflet: two triangles (base-mid-tip shape)
          const lmx = px + lpx * 0.6 + flx * 0.5;
          const lmz = pz + lpz * 0.6 + flz * 0.5;
          const lmy = py + leafDroop * 0.5;
          const ltx = px + lpx + flx;
          const ltz = pz + lpz + flz;
          const lty = py + leafDroop;
          verts.push(px, py, pz, lmx, lmy, lmz, px + flx, py + leafDroop * 0.3, pz + flz);
          verts.push(lmx, lmy, lmz, ltx, lty, ltz, px + flx, py + leafDroop * 0.3, pz + flz);
          for (let n = 0; n < 6; n++) norms.push(0, 0.85, 0.15);
          // Right leaflet: mirror
          const rmx = px - lpx * 0.6 + flx * 0.5;
          const rmz = pz - lpz * 0.6 + flz * 0.5;
          const rmy = py + leafDroop * 0.5;
          const rtx = px - lpx + flx;
          const rtz = pz - lpz + flz;
          const rty = py + leafDroop;
          verts.push(px, py, pz, rmx, rmy, rmz, px + flx, py + leafDroop * 0.3, pz + flz);
          verts.push(rmx, rmy, rmz, rtx, rty, rtz, px + flx, py + leafDroop * 0.3, pz + flz);
          for (let n = 0; n < 6; n++) norms.push(0, 0.85, 0.15);
        }
      }
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
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.rockMeshes.push(mesh);
    }
  }

  _createFlowerMeshes() {
    // 3 flower geometry variants
    const flowerParams = [
      { petals: 5, stemH: 0.15, petalLen: 0.08, basalLen: 0.09 },  // standard
      { petals: 4, stemH: 0.10, petalLen: 0.06, basalLen: 0.07 },  // small & low
      { petals: 6, stemH: 0.18, petalLen: 0.10, basalLen: 0.11 },  // tall & showy
    ];
    const flowerGeoms = flowerParams.map(p => this._createFlowerGeometry(p));

    // For each color, create 3 variant meshes
    // flowerMeshes becomes [color0_v0, color0_v1, color0_v2, color1_v0, ...]
    this.flowerMeshes = [];
    this.flowerVariantCount = flowerGeoms.length;
    for (const color of CONFIG.FLOWER_COLORS) {
      for (const geom of flowerGeoms) {
        const mat = new THREE.MeshLambertMaterial({
          color,
          vertexColors: true,
          side: THREE.DoubleSide,
        });
        addWindToMaterial(mat, 'vegetation');
        const mesh = new THREE.InstancedMesh(geom, mat, MAX_FLOWERS);
        mesh.count = 0;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.flowerMeshes.push(mesh);
      }
    }
  }

  _createFlowerGeometry(params = {}) {
    const verts = [];
    const norms = [];
    const colors = []; // vertex colors: green for stem/leaves, white for petals
    const stemH = params.stemH || 0.15;
    const green = [0.2, 0.45, 0.12];
    const white = [1, 1, 1];

    // Stem — curved, multi-segment for natural look — green
    const stemSegs = 4;
    const stemW = 0.008;
    // Gentle S-curve offsets
    const curveX = 0.02;
    const curveZ = 0.015;
    for (let si = 0; si < stemSegs; si++) {
      const t0 = si / stemSegs;
      const t1 = (si + 1) / stemSegs;
      const y0 = t0 * stemH;
      const y1 = t1 * stemH;
      // S-curve bend
      const x0 = Math.sin(t0 * Math.PI) * curveX;
      const x1 = Math.sin(t1 * Math.PI) * curveX;
      const z0 = Math.sin(t0 * Math.PI * 1.5) * curveZ;
      const z1 = Math.sin(t1 * Math.PI * 1.5) * curveZ;
      // Two triangles per segment
      verts.push(x0 - stemW, y0, z0, x0 + stemW, y0, z0, x1 + stemW, y1, z1);
      verts.push(x0 - stemW, y0, z0, x1 + stemW, y1, z1, x1 - stemW, y1, z1);
      norms.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
      norms.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
      for (let i = 0; i < 6; i++) colors.push(...green);
    }
    // Adjust stemTop position to follow the curve
    const stemTopX = Math.sin(Math.PI) * curveX; // ~0
    const stemTopZ = Math.sin(Math.PI * 1.5) * curveZ;

    // Basal leaves — larger, low, spreading outward (2-3 per flower)
    const basalCount = 3;
    const basalLen = params.basalLen || 0.09;
    const basalW = 0.04;
    for (let bi = 0; bi < basalCount; bi++) {
      const ba = (bi / basalCount) * Math.PI * 2 + 0.4; // offset so not aligned with stem curve
      const bca = Math.cos(ba);
      const bsa = Math.sin(ba);
      const baseY = 0.01 + bi * 0.008; // just above ground, slightly staggered
      // Leaf shape: base at stem, widens to mid, tapers to tip; droops slightly
      const midX = bca * basalLen * 0.5;
      const midZ = bsa * basalLen * 0.5;
      const midY = baseY + 0.02;
      const tipX = bca * basalLen;
      const tipZ = bsa * basalLen;
      const tipY = baseY + 0.005; // droops at tip
      const perpX = -bsa * basalW;
      const perpZ = bca * basalW;
      // Two triangles: base→mid (wide), mid→tip (narrow)
      verts.push(0, baseY, 0, midX + perpX, midY, midZ + perpZ, midX - perpX, midY, midZ - perpZ);
      norms.push(0, 0.9, 0.1, 0, 0.9, 0.1, 0, 0.9, 0.1);
      for (let i = 0; i < 3; i++) colors.push(...green);
      verts.push(midX + perpX, midY, midZ + perpZ, midX - perpX, midY, midZ - perpZ, tipX, tipY, tipZ);
      norms.push(0, 0.9, 0.1, 0, 0.9, 0.1, 0, 0.9, 0.1);
      for (let i = 0; i < 3; i++) colors.push(...green);
    }

    // Two small stem leaves, following the curve
    const leafLen = 0.04;
    const leafW = 0.02;
    // Leaf 1 at 40% height
    const l1t = 0.4;
    const l1x = Math.sin(l1t * Math.PI) * curveX;
    const l1z = Math.sin(l1t * Math.PI * 1.5) * curveZ;
    const l1y = l1t * stemH;
    verts.push(l1x, l1y, l1z, l1x + leafLen, l1y + leafW, l1z + leafW * 0.3, l1x + leafLen * 0.4, l1y + leafLen * 0.6, l1z);
    norms.push(0, 0.6, 0.4, 0, 0.6, 0.4, 0, 0.6, 0.4);
    for (let i = 0; i < 3; i++) colors.push(...green);
    // Leaf 2 at 65% height, opposite side
    const l2t = 0.65;
    const l2x = Math.sin(l2t * Math.PI) * curveX;
    const l2z = Math.sin(l2t * Math.PI * 1.5) * curveZ;
    const l2y = l2t * stemH;
    verts.push(l2x, l2y, l2z, l2x - leafLen, l2y + leafW, l2z - leafW * 0.3, l2x - leafLen * 0.4, l2y + leafLen * 0.6, l2z);
    norms.push(0, 0.6, -0.4, 0, 0.6, -0.4, 0, 0.6, -0.4);
    for (let i = 0; i < 3; i++) colors.push(...green);

    // Petals at stem top, following curve — white vertex color (material color shows through)
    const petals = params.petals || 5;
    const petalLen = params.petalLen || 0.08;
    const petalW2 = 0.04;
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const tx = stemTopX + ca * petalLen;
      const tz = stemTopZ + sa * petalLen;
      const perpX = -sa * petalW2;
      const perpZ = ca * petalW2;
      verts.push(stemTopX + perpX, stemH, stemTopZ + perpZ, stemTopX - perpX, stemH, stemTopZ - perpZ, tx, stemH + 0.03, tz);
      norms.push(0, 0.8, 0.2, 0, 0.8, 0.2, 0, 0.8, 0.2);
      for (let j = 0; j < 3; j++) colors.push(...white);
    }

    // Center dot (small triangle cluster) — yellow-ish
    const centerColor = [1, 0.9, 0.4];
    const cR = 0.015;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const na = ((i + 1) / 3) * Math.PI * 2;
      verts.push(stemTopX, stemH + 0.02, stemTopZ, stemTopX + Math.cos(a) * cR, stemH + 0.015, stemTopZ + Math.sin(a) * cR, stemTopX + Math.cos(na) * cR, stemH + 0.015, stemTopZ + Math.sin(na) * cR);
      norms.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      for (let j = 0; j < 3; j++) colors.push(...centerColor);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
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

    // Rebuild grass (slot 0 only, slot 1 null, slot 2 null — ferns use fernVariants)
    {
      const mesh = this.meshes[0];
      const veg = allVeg[0];
      mesh.count = veg.length;
      for (let i = 0; i < veg.length; i++) {
        const v = veg[i];
        _position.set(v.x, v.y, v.z);
        const angle = (v.x * 13.37 + v.z * 7.13) % (Math.PI * 2);
        _euler.set(0, angle, 0);
        _quaternion.setFromEuler(_euler);
        const s = v.scale;
        _scale.set(s * CONFIG.VEG_GRASS_SCALE, s * CONFIG.VEG_GRASS_SCALE, s * CONFIG.VEG_GRASS_SCALE);
        _matrix.compose(_position, _quaternion, _scale);
        mesh.setMatrixAt(i, _matrix);
      }
      if (veg.length > 0) mesh.instanceMatrix.needsUpdate = true;
    }

    // Rebuild ferns — distribute across 3 variant meshes
    {
      const ferns = allVeg[2];
      const variantBuckets = [[], [], []];
      for (const v of ferns) {
        const vi = Math.abs(Math.floor((v.x * 7.3 + v.z * 13.7) * 100)) % 3;
        variantBuckets[vi].push(v);
      }
      for (let vi = 0; vi < 3; vi++) {
        const mesh = this.fernVariants[vi];
        const bucket = variantBuckets[vi];
        mesh.count = bucket.length;
        for (let i = 0; i < bucket.length; i++) {
          const v = bucket[i];
          _position.set(v.x, v.y, v.z);
          const angle = (v.x * 13.37 + v.z * 7.13) % (Math.PI * 2);
          const tiltX = Math.sin(v.x * 47.3 + v.z * 19.1) * 0.2;
          const tiltZ = Math.sin(v.x * 29.7 + v.z * 53.3) * 0.2;
          _euler.set(tiltX, angle, tiltZ);
          _quaternion.setFromEuler(_euler);
          const s = v.scale;
          const sv = s * CONFIG.VEG_FERN_SCALE;
          const stretchX = 0.75 + (Math.sin(v.x * 37.1 + v.z * 11.3) * 0.5 + 0.5) * 0.5;
          const stretchZ = 0.75 + (Math.sin(v.x * 23.7 + v.z * 43.9) * 0.5 + 0.5) * 0.5;
          _scale.set(sv * stretchX, sv * (0.8 + Math.sin(v.x * 17.9) * 0.3), sv * stretchZ);
          _matrix.compose(_position, _quaternion, _scale);
          mesh.setMatrixAt(i, _matrix);
        }
        if (bucket.length > 0) mesh.instanceMatrix.needsUpdate = true;
      }
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

    // Rebuild flowers — distribute across 3 variants per color
    const vc = this.flowerVariantCount;
    for (let ci = 0; ci < CONFIG.FLOWER_COLORS.length; ci++) {
      const flowers = allFlowers[ci];
      // Split into variant buckets
      const buckets = [];
      for (let vi = 0; vi < vc; vi++) buckets.push([]);
      for (const f of flowers) {
        const vi = Math.abs(Math.floor((f.x * 11.3 + f.z * 7.7) * 100)) % vc;
        buckets[vi].push(f);
      }
      for (let vi = 0; vi < vc; vi++) {
        const mesh = this.flowerMeshes[ci * vc + vi];
        const bucket = buckets[vi];
        mesh.count = bucket.length;
        for (let i = 0; i < bucket.length; i++) {
          const f = bucket[i];
          _position.set(f.x, f.y, f.z);
          const angle = (f.x * 17.3 + f.z * 11.7) % (Math.PI * 2);
          const tiltX = Math.sin(f.x * 31.7 + f.z * 17.3) * 0.25;
          const tiltZ = Math.sin(f.x * 23.1 + f.z * 41.9) * 0.25;
          _euler.set(tiltX, angle, tiltZ);
          _quaternion.setFromEuler(_euler);
          const s = f.scale;
          _scale.set(s, s, s);
          _matrix.compose(_position, _quaternion, _scale);
          mesh.setMatrixAt(i, _matrix);
        }
        if (bucket.length > 0) mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
