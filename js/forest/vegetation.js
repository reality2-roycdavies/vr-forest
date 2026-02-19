// Grass, ferns, flowers, and rocks via instanced rendering
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { getTerrainHeight } from '../terrain/noise.js';
import { createRockTexture, createBarkTexture } from './textures.js';
import { addWindToMaterial } from '../atmosphere/wind.js';

const MAX_VEG_PER_TYPE = 3000;
const MAX_FLOWERS = 1500;
const MAX_ROCKS = 1000;
const MAX_LOGS = 600;
const MAX_STUMPS = 400;
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
    this._createLogMeshes();
    this.foamTimeUniform = { value: 0 };
    this._createFoamStrip();
  }

  _createMeshes() {
    // --- Grass tuft: multi-blade cluster ---
    const grassGeom = this._createGrassGeometry();
    const grassMat = new THREE.MeshLambertMaterial({
      color: CONFIG.GRASS_COLOR,
      emissive: new THREE.Color(CONFIG.GRASS_COLOR).multiplyScalar(0.03),
      side: THREE.DoubleSide,
    });
    addWindToMaterial(grassMat, 'vegetation');
    const grassWindCompile = grassMat.onBeforeCompile;
    grassMat.onBeforeCompile = (shader) => {
      grassWindCompile(shader);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        'vec3 normal = normalize(vNormal);'
      );
    };
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
        emissive: new THREE.Color(CONFIG.FERN_COLOR).multiplyScalar(0.03),
        side: THREE.DoubleSide,
      });
      addWindToMaterial(mat, 'vegetation');
      // Chain onto wind's onBeforeCompile to force normal up (prevents DoubleSide flip)
      const windCompile = mat.onBeforeCompile;
      mat.onBeforeCompile = (shader) => {
        windCompile(shader);
        // Keep geometry normal but skip the DoubleSide backface flip
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_begin>',
          'vec3 normal = normalize(vNormal);'
        );
      };
      const mesh = new THREE.InstancedMesh(geom, mat, MAX_VEG_PER_TYPE);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.fernVariants.push(mesh);
    }
  }

  _createGrassGeometry() {
    const blades = 9;
    const verts = [];
    const norms = [];

    for (let i = 0; i < blades; i++) {
      // Full circle with golden-angle offset to avoid symmetry
      const angle = (i / blades) * Math.PI * 2 + i * 0.4;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);

      const halfW = 0.008 + (i % 3) * 0.004; // thin blades
      const height = 0.12 + (i % 4) * 0.06;  // varied heights
      // Blades lean outward from centre
      const lean = 0.06 + (i % 3) * 0.03;
      const leanX = ca * lean;
      const leanZ = sa * lean;
      // Slight radial offset from centre
      const offX = ca * 0.01;
      const offZ = sa * 0.01;

      // Base vertices (perpendicular to blade direction)
      const bx1 = offX - sa * halfW;
      const bz1 = offZ + ca * halfW;
      const bx2 = offX + sa * halfW;
      const bz2 = offZ - ca * halfW;
      // Tip leans outward
      const tx = offX + leanX;
      const tz = offZ + leanZ;

      // Two triangles for a tapered blade (base → mid → tip)
      const midH = height * 0.5;
      const midW = halfW * 0.6;
      const mx = offX + leanX * 0.4;
      const mz = offZ + leanZ * 0.4;
      const mx1 = mx - sa * midW;
      const mz1 = mz + ca * midW;
      const mx2 = mx + sa * midW;
      const mz2 = mz - ca * midW;

      verts.push(bx1, 0, bz1, bx2, 0, bz2, mx1, midH, mz1);
      verts.push(bx2, 0, bz2, mx2, midH, mz2, mx1, midH, mz1);
      verts.push(mx1, midH, mz1, mx2, midH, mz2, tx, height, tz);

      // Normals point generally up with slight outward lean
      for (let n = 0; n < 9; n++) norms.push(ca * 0.3, 0.9, sa * 0.3);
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

      // Compute per-segment normals from spine tangent (shared by left+right leaflets)
      const segNormals = [];
      for (let s = 0; s < segs; s++) {
        const p0 = spine[s], p1 = spine[s + 1];
        // Tangent along frond
        const tx = p1.x - p0.x, ty = p1.y - p0.y, tz = p1.z - p0.z;
        // Cross tangent with frond's perpendicular (-sa, 0, ca) to get "up" at this point
        // Exaggerate tangent Y to increase gradient along frond
        let nx = 0 * tz - ca * (ty * 2.0);
        let ny = ca * tx - (-sa) * tz;
        let nz = (-sa) * (ty * 2.0) - 0 * tx;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;
        // Ensure normal points generally upward
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        segNormals.push({ x: nx, y: ny, z: nz });
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
        const sn = segNormals[s];
        for (let n = 0; n < 6; n++) norms.push(sn.x, sn.y, sn.z);
      }

      // Dense leaflet pairs along the frond — interpolated between spine points
      const leafletsPerSeg = 5;
      for (let s = 0; s < segs; s++) {
        const p0 = spine[s], p1 = spine[s + 1];
        const sn = segNormals[s];
        for (let li = 0; li < leafletsPerSeg; li++) {
          const lt = (li + 0.5) / leafletsPerSeg;
          const t = (s + lt) / segs;
          if (t < 0.08 || t > 0.95) continue; // skip very base and very tip
          // Interpolate position on spine
          const px = p0.x + (p1.x - p0.x) * lt;
          const py = p0.y + (p1.y - p0.y) * lt;
          const pz = p0.z + (p1.z - p0.z) * lt;
          // Pinna size: small at base, largest at ~40%, tapers to tip
          const sizeCurve = Math.min(1, t * 5) * (1 - t * t);
          const pinnaW = 0.09 * sizeCurve;   // perpendicular extent
          const pinnaL = 0.035 * sizeCurve;  // width along rachis
          const pinnaDroop = -0.025 * t * t;
          // Perpendicular to frond (left/right) — pinna extends sideways
          const lpx = -sa * pinnaW;
          const lpz = ca * pinnaW;
          // Forward along frond — narrow attachment
          const flx = ca * pinnaL;
          const flz = sa * pinnaL;
          // Left pinna: broader tapered shape (base → mid → tip)
          const lmx = px + lpx * 0.55 + flx * 0.4;
          const lmz = pz + lpz * 0.55 + flz * 0.4;
          const lmy = py + pinnaDroop * 0.4;
          const ltx = px + lpx;
          const ltz = pz + lpz;
          const lty = py + pinnaDroop;
          verts.push(px, py, pz, lmx, lmy, lmz, px + flx, py + pinnaDroop * 0.2, pz + flz);
          verts.push(lmx, lmy, lmz, ltx, lty, ltz, px + flx, py + pinnaDroop * 0.2, pz + flz);
          // Left leaflet: slight outward tilt from spine normal
          const tilt = 0.25;
          let lnx = sn.x - sa * tilt, lny = sn.y, lnz = sn.z + ca * tilt;
          let ll = Math.sqrt(lnx*lnx + lny*lny + lnz*lnz);
          lnx /= ll; lny /= ll; lnz /= ll;
          for (let n = 0; n < 6; n++) norms.push(lnx, lny, lnz);
          // Right pinna: mirror
          const rmx = px - lpx * 0.55 + flx * 0.4;
          const rmz = pz - lpz * 0.55 + flz * 0.4;
          const rmy = py + pinnaDroop * 0.4;
          const rtx = px - lpx;
          const rtz = pz - lpz;
          const rty = py + pinnaDroop;
          verts.push(px, py, pz, rmx, rmy, rmz, px + flx, py + pinnaDroop * 0.2, pz + flz);
          verts.push(rmx, rmy, rmz, rtx, rty, rtz, px + flx, py + pinnaDroop * 0.2, pz + flz);
          let rnx = sn.x + sa * tilt, rny = sn.y, rnz = sn.z - ca * tilt;
          let rl = Math.sqrt(rnx*rnx + rny*rny + rnz*rnz);
          rnx /= rl; rny /= rl; rnz /= rl;
          for (let n = 0; n < 6; n++) norms.push(rnx, rny, rnz);
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

  _createLogMeshes() {
    const barkColors = [0x5c3a1e, 0x4a2f16, 0x6b4226];
    const barkTex = createBarkTexture('#5c3a1e', 128);

    // --- Fallen log: horizontal cylinder ---
    {
      const geom = new THREE.CylinderGeometry(1.0, 1.0, 1.0, 6, 1);
      // Rotate so cylinder is horizontal (along X axis)
      geom.rotateZ(Math.PI / 2);

      // Jag vertices for organic bark
      const pos = geom.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const hash = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
        const jag = ((hash - Math.floor(hash)) - 0.5) * 0.4;
        pos.setXYZ(i, x + jag * 0.3, y + jag * 0.2, z + jag * 0.3);
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();

      // Vertex colors: bark browns
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const hash = Math.sin(pos.getX(i) * 431.1 + pos.getZ(i) * 217.3) * 43758.5453;
        const ci = Math.abs(Math.floor(hash * 100)) % barkColors.length;
        const base = new THREE.Color(barkColors[ci]);
        const frac = ((hash - Math.floor(hash)) - 0.5) * 0.1;
        colors[i * 3] = Math.max(0, Math.min(1, base.r + frac));
        colors[i * 3 + 1] = Math.max(0, Math.min(1, base.g + frac));
        colors[i * 3 + 2] = Math.max(0, Math.min(1, base.b + frac));
      }
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: barkTex });
      this.logMesh = new THREE.InstancedMesh(geom, mat, MAX_LOGS);
      this.logMesh.count = 0;
      this.logMesh.frustumCulled = false;
      this.logMesh.castShadow = true;
      this.scene.add(this.logMesh);
    }

    // --- Stump: short upright cylinder, slightly tapered ---
    {
      const geom = new THREE.CylinderGeometry(0.85, 1.0, 1.0, 6, 1);

      // Jag vertices
      const pos = geom.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const hash = Math.sin(x * 173.1 + y * 251.7 + z * 94.7) * 43758.5453;
        const jag = ((hash - Math.floor(hash)) - 0.5) * 0.08;
        // Only jag top face more for irregular cut
        const topMult = y > 0.3 ? 2.0 : 1.0;
        pos.setXYZ(i, x + jag * 0.4, y + jag * 0.2 * topMult, z + jag * 0.4);
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();

      // Vertex colors: bark browns, top face slightly lighter (cut wood)
      const colors = new Float32Array(pos.count * 3);
      const cutWood = new THREE.Color(0x8b6b4a); // lighter heartwood
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const hash = Math.sin(pos.getX(i) * 371.1 + pos.getZ(i) * 197.3) * 43758.5453;
        const frac = ((hash - Math.floor(hash)) - 0.5) * 0.1;
        let base;
        if (y > 0.3) {
          // Top face: cut wood color
          base = cutWood;
        } else {
          const ci = Math.abs(Math.floor(hash * 100)) % barkColors.length;
          base = new THREE.Color(barkColors[ci]);
        }
        colors[i * 3] = Math.max(0, Math.min(1, base.r + frac));
        colors[i * 3 + 1] = Math.max(0, Math.min(1, base.g + frac));
        colors[i * 3 + 2] = Math.max(0, Math.min(1, base.b + frac));
      }
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: barkTex });
      this.stumpMesh = new THREE.InstancedMesh(geom, mat, MAX_STUMPS);
      this.stumpMesh.count = 0;
      this.stumpMesh.frustumCulled = false;
      this.stumpMesh.castShadow = true;
      this.scene.add(this.stumpMesh);
    }
  }

  _createFoamStrip() {
    const MAX_SEGS = 8000;
    this._maxFoamVerts = MAX_SEGS * 6;
    this._foamPosArr = new Float32Array(this._maxFoamVerts * 3);
    this._foamUvArr = new Float32Array(this._maxFoamVerts * 2);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this._foamPosArr, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('uv', new THREE.BufferAttribute(this._foamUvArr, 2).setUsage(THREE.DynamicDrawUsage));
    geom.setDrawRange(0, 0);

    const mat = this._createFoamStripMaterial();
    this.foamMesh = new THREE.Mesh(geom, mat);
    this.foamMesh.frustumCulled = false;
    this.foamMesh.renderOrder = 1;
    this.scene.add(this.foamMesh);
  }

  _createFoamStripMaterial() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9aacb8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      // Stencil removed — caused stereo rendering issues on Quest (stencil not
      // cleared between eye passes, blocking foam in second eye)
    });
    mat.defines = { 'USE_UV': '' };

    const self = this;
    mat.customProgramCacheKey = () => 'shore-foam-strip';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = self.foamTimeUniform;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying vec3 vFoamWorld;
        varying float vWaveH;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 fwp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vFoamWorld = fwp;
        // Full wave function — matches water vertex shader exactly
        float fwh = 0.0;
        fwh += sin(dot(fwp.xz, vec2( 0.38,  0.12)) + uTime * 0.35) * 0.045;
        fwh += sin(dot(fwp.xz, vec2(-0.15,  0.35)) + uTime * 0.28) * 0.040;
        fwh += sin(dot(fwp.xz, vec2( 0.27, -0.22)) + uTime * 0.42) * 0.030;
        fwh += sin(dot(fwp.xz, vec2( 0.45, -0.55)) + uTime * 0.55) * 0.020;
        fwh += sin(dot(fwp.xz, vec2(-0.50,  0.30)) + uTime * 0.48) * 0.018;
        fwh += sin(dot(fwp.xz, vec2( 0.60,  0.40)) + uTime * 0.65) * 0.015;
        fwh += sin(dot(fwp.xz, vec2(-0.35, -0.60)) + uTime * 0.58) * 0.012;
        fwh += sin(dot(fwp.xz, vec2( 1.70,  1.10)) + uTime * 1.00) * 0.007;
        fwh += sin(dot(fwp.xz, vec2(-1.30,  1.80)) + uTime * 0.90) * 0.006;
        fwh += sin(dot(fwp.xz, vec2( 2.10, -0.90)) + uTime * 1.20) * 0.005;
        fwh += sin(dot(fwp.xz, vec2(-0.80, -2.20)) + uTime * 1.10) * 0.004;
        fwh += sin(dot(fwp.xz, vec2( 2.80,  1.50)) + uTime * 1.40) * 0.003;
        fwh += sin(dot(fwp.xz, vec2(-1.70,  2.80)) + uTime * 1.30) * 0.002;
        vWaveH = fwh;
        transformed.y += fwh;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying vec3 vFoamWorld;
        varying float vWaveH;
        // Force highp for noise — mediump sin() breaks with large world coords on Quest
        highp float _fHash(highp vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float _fNoise(highp vec2 p) {
          highp vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = _fHash(i);
          float b = _fHash(i + vec2(1.0, 0.0));
          float c = _fHash(i + vec2(0.0, 1.0));
          float d = _fHash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        // Geometry edge fade — always fades at mesh boundaries regardless of wave
        float rawV = vUv.y;
        float geoFade = smoothstep(0.0, 0.06, rawV) * (1.0 - smoothstep(0.7, 1.0, rawV));
        // Wave-shifted v for shore-side lapping
        float waveShift = vWaveH * 1.5;
        float v = rawV + waveShift;
        // Ruffled shore edge — noise displaces the cutoff for organic look
        float shoreNoise = _fNoise(vFoamWorld.xz * 6.0 + vec2(uTime * 0.04, uTime * 0.03));
        float shoreNoise2 = _fNoise(vFoamWorld.xz * 15.0 + vec2(-uTime * 0.06, uTime * 0.05) + 30.0);
        float ruffleOffset = (shoreNoise * 0.6 + shoreNoise2 * 0.4) * 0.25;
        float stripFade = geoFade * smoothstep(ruffleOffset, ruffleOffset + 0.18, v) * (1.0 - smoothstep(0.5, 0.85, v));
        // Soft lapping pattern
        float fn1 = _fNoise(vFoamWorld.xz * 5.0 + vec2(uTime * 0.08, uTime * 0.05));
        float fn2 = _fNoise(vFoamWorld.xz * 10.0 + vec2(-uTime * 0.06, uTime * 0.09) + 50.0);
        float bubble = 0.6 + 0.4 * smoothstep(0.25, 0.55, fn1 * 0.6 + fn2 * 0.4);
        float shimmer = 0.9 + 0.1 * sin(uTime * 0.3 + vFoamWorld.x * 0.7 + vFoamWorld.z * 0.5);
        gl_FragColor.a *= stripFade * bubble * shimmer;
        // No discard — let alpha do the work. discard + MSAA on Quest
        // creates hard edge lines where fragments are killed at sub-pixel boundaries.`
      );
    };

    return mat;
  }

  updateFoamTime(time) {
    this.foamTimeUniform.value = time;
  }

  _rebuildFoamStrip(segments) {
    const pos = this._foamPosArr;
    const uvs = this._foamUvArr;
    const waterY = CONFIG.WATER_LEVEL + 0.07;
    const shoreW = CONFIG.FOAM_SHORE_WIDTH;
    const waterW = CONFIG.FOAM_WATER_WIDTH;
    let vi = 0;

    for (const seg of segments) {
      if (vi + 6 > this._maxFoamVerts) break;

      const { x1, z1, x2, z2, nx1, nz1, nx2, nz2 } = seg;

      // Shore-side and water-side offsets using per-vertex normals
      const s1x = x1 - nx1 * shoreW, s1z = z1 - nz1 * shoreW;
      const w1x = x1 + nx1 * waterW, w1z = z1 + nz1 * waterW;
      const s2x = x2 - nx2 * shoreW, s2z = z2 - nz2 * shoreW;
      const w2x = x2 + nx2 * waterW, w2z = z2 + nz2 * waterW;

      // Shore-side Y follows terrain so foam sits on top, not clipped by it
      const s1y = Math.max(waterY, getTerrainHeight(s1x, s1z) + 0.01);
      const s2y = Math.max(waterY, getTerrainHeight(s2x, s2z) + 0.01);

      // Triangle 1: s1, w1, s2
      pos[vi * 3] = s1x; pos[vi * 3 + 1] = s1y; pos[vi * 3 + 2] = s1z;
      uvs[vi * 2] = 0; uvs[vi * 2 + 1] = 0; vi++;
      pos[vi * 3] = w1x; pos[vi * 3 + 1] = waterY; pos[vi * 3 + 2] = w1z;
      uvs[vi * 2] = 0; uvs[vi * 2 + 1] = 1; vi++;
      pos[vi * 3] = s2x; pos[vi * 3 + 1] = s2y; pos[vi * 3 + 2] = s2z;
      uvs[vi * 2] = 1; uvs[vi * 2 + 1] = 0; vi++;

      // Triangle 2: w1, w2, s2
      pos[vi * 3] = w1x; pos[vi * 3 + 1] = waterY; pos[vi * 3 + 2] = w1z;
      uvs[vi * 2] = 0; uvs[vi * 2 + 1] = 1; vi++;
      pos[vi * 3] = w2x; pos[vi * 3 + 1] = waterY; pos[vi * 3 + 2] = w2z;
      uvs[vi * 2] = 1; uvs[vi * 2 + 1] = 1; vi++;
      pos[vi * 3] = s2x; pos[vi * 3 + 1] = s2y; pos[vi * 3 + 2] = s2z;
      uvs[vi * 2] = 1; uvs[vi * 2 + 1] = 0; vi++;
    }

    const geom = this.foamMesh.geometry;
    geom.getAttribute('position').needsUpdate = true;
    geom.getAttribute('uv').needsUpdate = true;
    geom.setDrawRange(0, vi);
    geom.computeBoundingSphere();
    this.foamMesh.visible = vi > 0;
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
        const mat = new THREE.MeshPhongMaterial({
          color,
          emissive: 0x060604,
          specular: 0x444444,
          shininess: 20,
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

    // Basal leaves — smooth multi-segment, spreading outward
    const basalCount = 3;
    const basalLen = params.basalLen || 0.09;
    const basalW = 0.04;
    const basalSegs = 4;
    for (let bi = 0; bi < basalCount; bi++) {
      const ba = (bi / basalCount) * Math.PI * 2 + 0.4;
      const bca = Math.cos(ba);
      const bsa = Math.sin(ba);
      const baseY = 0.01 + bi * 0.008;
      // Build leaf spine with width tapering at both ends
      const leafPts = [];
      for (let s = 0; s <= basalSegs; s++) {
        const t = s / basalSegs;
        const dist = basalLen * t;
        const w = basalW * Math.sin(t * Math.PI); // zero at base/tip, widest at mid
        const h = baseY + 0.02 * Math.sin(t * Math.PI * 0.7) - 0.015 * t * t; // rise then droop
        leafPts.push({ x: bca * dist, y: h, z: bsa * dist, w });
      }
      for (let s = 0; s < basalSegs; s++) {
        const p0 = leafPts[s], p1 = leafPts[s + 1];
        const l0x = p0.x - bsa * p0.w, l0z = p0.z + bca * p0.w;
        const l1x = p1.x - bsa * p1.w, l1z = p1.z + bca * p1.w;
        const r0x = p0.x + bsa * p0.w, r0z = p0.z - bca * p0.w;
        const r1x = p1.x + bsa * p1.w, r1z = p1.z - bca * p1.w;
        verts.push(l0x, p0.y, l0z, l1x, p1.y, l1z, r1x, p1.y, r1z);
        verts.push(l0x, p0.y, l0z, r1x, p1.y, r1z, r0x, p0.y, r0z);
        norms.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        norms.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        for (let j = 0; j < 6; j++) colors.push(...green);
      }
    }

    // Two small stem leaves — multi-segment smooth
    const stemLeafSegs = 3;
    const stemLeafParams = [
      { t: 0.4, dir: 1 },
      { t: 0.65, dir: -1 },
    ];
    for (const sl of stemLeafParams) {
      const slx = Math.sin(sl.t * Math.PI) * curveX;
      const slz = Math.sin(sl.t * Math.PI * 1.5) * curveZ;
      const sly = sl.t * stemH;
      const slLen = 0.04;
      const slW = 0.02;
      // Leaf direction perpendicular to stem, angled outward+up
      const ldx = sl.dir * 0.8, ldy = 0.5, ldz = sl.dir * 0.3;
      const llen = Math.sqrt(ldx * ldx + ldy * ldy + ldz * ldz);
      const ndx = ldx / llen, ndy = ldy / llen, ndz = ldz / llen;
      // Perpendicular for width
      const wpx = -ndz, wpz = ndx;
      const leafPts = [];
      for (let s = 0; s <= stemLeafSegs; s++) {
        const t = s / stemLeafSegs;
        const w = slW * Math.sin(t * Math.PI);
        leafPts.push({
          x: slx + ndx * slLen * t,
          y: sly + ndy * slLen * t,
          z: slz + ndz * slLen * t,
          w
        });
      }
      for (let s = 0; s < stemLeafSegs; s++) {
        const p0 = leafPts[s], p1 = leafPts[s + 1];
        verts.push(
          p0.x - wpx * p0.w, p0.y, p0.z - wpz * p0.w,
          p1.x - wpx * p1.w, p1.y, p1.z - wpz * p1.w,
          p1.x + wpx * p1.w, p1.y, p1.z + wpz * p1.w
        );
        verts.push(
          p0.x - wpx * p0.w, p0.y, p0.z - wpz * p0.w,
          p1.x + wpx * p1.w, p1.y, p1.z + wpz * p1.w,
          p0.x + wpx * p0.w, p0.y, p0.z + wpz * p0.w
        );
        norms.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        norms.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        for (let j = 0; j < 6; j++) colors.push(...green);
      }
    }

    // Petals at stem top — rounded multi-segment fan per petal
    const petals = params.petals || 5;
    const petalLen = params.petalLen || 0.08;
    const petalW = 0.04;
    const petalSegs = 4; // segments per petal for rounded shape
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      // Build rounded petal outline points (elliptical arc)
      const petalPts = [];
      for (let s = 0; s <= petalSegs; s++) {
        const t = s / petalSegs;
        // Radial distance: rises to petalLen then back (ellipse-like)
        const r = petalLen * Math.sin(t * Math.PI);
        // Width: widest at middle, zero at base and tip
        const w = petalW * Math.sin(t * Math.PI);
        // Height: slight dome
        const h = 0.03 * Math.sin(t * Math.PI);
        // Along petal direction
        const dist = petalLen * t;
        const px = stemTopX + ca * dist;
        const pz = stemTopZ + sa * dist;
        const py = stemH + h;
        petalPts.push({ x: px, y: py, z: pz, w });
      }
      // Fan triangles from center to petal outline edges
      for (let s = 0; s < petalSegs; s++) {
        const p0 = petalPts[s];
        const p1 = petalPts[s + 1];
        // Left edge
        const l0x = p0.x - sa * p0.w, l0z = p0.z + ca * p0.w;
        const l1x = p1.x - sa * p1.w, l1z = p1.z + ca * p1.w;
        // Right edge
        const r0x = p0.x + sa * p0.w, r0z = p0.z - ca * p0.w;
        const r1x = p1.x + sa * p1.w, r1z = p1.z - ca * p1.w;
        // Two quads (4 triangles) per segment
        verts.push(l0x, p0.y, l0z, l1x, p1.y, l1z, r1x, p1.y, r1z);
        verts.push(l0x, p0.y, l0z, r1x, p1.y, r1z, r0x, p0.y, r0z);
        norms.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        norms.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        for (let j = 0; j < 6; j++) colors.push(...white);
      }
    }

    // Center dot (hexagonal) — yellow-ish
    const centerColor = [1, 0.9, 0.4];
    const cR = 0.018;
    const cSegs = 6;
    for (let i = 0; i < cSegs; i++) {
      const a = (i / cSegs) * Math.PI * 2;
      const na = ((i + 1) / cSegs) * Math.PI * 2;
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
  rebuild(chunkIterator, playerX, playerZ) {
    // Sort chunks by distance from player (closest first) to prioritise nearby vegetation
    const chunks = [];
    for (const chunk of chunkIterator) {
      if (!chunk.active) continue;
      const dx = chunk.cx * CONFIG.CHUNK_SIZE + CONFIG.CHUNK_SIZE * 0.5 - (playerX || 0);
      const dz = chunk.cz * CONFIG.CHUNK_SIZE + CONFIG.CHUNK_SIZE * 0.5 - (playerZ || 0);
      chunk._sortDist = dx * dx + dz * dz;
      chunks.push(chunk);
    }
    chunks.sort((a, b) => a._sortDist - b._sortDist);

    const vegCounts = [0, 0, 0];
    const allVeg = [[], [], []];
    const flowerCounts = new Array(CONFIG.FLOWER_COLORS.length).fill(0);
    const allFlowers = CONFIG.FLOWER_COLORS.map(() => []);
    const rockCounts = [0, 0, 0];
    const allRocks = [[], [], []];
    const allFoamSegments = [];

    for (const chunk of chunks) {

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

      if (chunk.foamSegments) {
        for (const seg of chunk.foamSegments) {
          allFoamSegments.push(seg);
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

    // Rebuild logs & stumps
    {
      const allLogs = [];
      const allStumps = [];
      for (const chunk of chunks) {
        if (chunk.logPositions) {
          for (const lp of chunk.logPositions) {
            if (lp.type === 0 && allLogs.length < MAX_LOGS) allLogs.push(lp);
            else if (lp.type === 1 && allStumps.length < MAX_STUMPS) allStumps.push(lp);
          }
        }
      }

      // Fallen logs — horizontal cylinders
      this.logMesh.count = allLogs.length;
      for (let i = 0; i < allLogs.length; i++) {
        const l = allLogs[i];
        const seed = l.rotSeed;
        const radius = CONFIG.LOG_RADIUS_MIN + (Math.sin(seed * 5.7) * 0.5 + 0.5) * (CONFIG.LOG_RADIUS_MAX - CONFIG.LOG_RADIUS_MIN);
        // Raise so log sits on ground (center up by radius)
        _position.set(l.x, l.y + radius * 0.5, l.z);
        // Random Y rotation, slight X/Z tilt (±5°)
        _euler.set(
          Math.sin(seed * 1.3) * 0.09,
          (seed * 73.13) % (Math.PI * 2),
          Math.sin(seed * 2.9) * 0.09
        );
        _quaternion.setFromEuler(_euler);
        // scale.x = length (cylinder is along X after rotateZ), y/z = radius
        _scale.set(l.scale, radius, radius);
        _matrix.compose(_position, _quaternion, _scale);
        this.logMesh.setMatrixAt(i, _matrix);
      }
      if (allLogs.length > 0) this.logMesh.instanceMatrix.needsUpdate = true;

      // Stumps — upright cylinders
      this.stumpMesh.count = allStumps.length;
      for (let i = 0; i < allStumps.length; i++) {
        const s = allStumps[i];
        const seed = s.rotSeed;
        const height = CONFIG.STUMP_HEIGHT_MIN + (Math.sin(seed * 3.1) * 0.5 + 0.5) * (CONFIG.STUMP_HEIGHT_MAX - CONFIG.STUMP_HEIGHT_MIN);
        // Raise so stump base sits on ground (center up by half height)
        _position.set(s.x, s.y + height * 0.5, s.z);
        _euler.set(0, (seed * 73.13) % (Math.PI * 2), 0);
        _quaternion.setFromEuler(_euler);
        // scale.x/z = radius, y = height
        _scale.set(s.scale, height, s.scale);
        _matrix.compose(_position, _quaternion, _scale);
        this.stumpMesh.setMatrixAt(i, _matrix);
      }
      if (allStumps.length > 0) this.stumpMesh.instanceMatrix.needsUpdate = true;
    }

    // Rebuild foam strip along waterline contour
    this._rebuildFoamStrip(allFoamSegments);
  }
}
