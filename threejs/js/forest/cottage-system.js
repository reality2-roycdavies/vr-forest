// Cottage rendering pool + chimney smoke particles + emissive windows
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createCottageGeometry, getCottageMaterial, getWindowMaterial } from './cottage-factory.js';
import { windUniforms } from '../atmosphere/wind.js';

const MAX_COTTAGES = 50;

export class CottageSystem {
  constructor(scene) {
    this.scene = scene;
    this.cottageMeshes = [];
    this.windowMeshes = [];
    this.cottageData = [];
    this._smokeSprites = [];
    this._smokeParticles = [];
    this._smokeMaterial = null;
    this._geometryCache = new Map();
  }

  rebuild(activeChunks) {
    this.cottageData.length = 0;
    let count = 0;

    for (const chunk of activeChunks) {
      if (!chunk.active || !chunk.cottagePositions) continue;
      for (const cp of chunk.cottagePositions) {
        if (count >= MAX_COTTAGES) break;
        this.cottageData.push(cp);
        count++;
      }
      if (count >= MAX_COTTAGES) break;
    }

    // Remove old meshes
    for (const m of this.cottageMeshes) this.scene.remove(m);
    for (const m of this.windowMeshes) this.scene.remove(m);
    this.cottageMeshes.length = 0;
    this.windowMeshes.length = 0;

    const material = getCottageMaterial();
    const windowMaterial = getWindowMaterial();

    for (const cd of this.cottageData) {
      let cached = this._geometryCache.get(cd.seed);
      if (!cached) {
        cached = createCottageGeometry(cd.seed);
        this._geometryCache.set(cd.seed, cached);
        if (this._geometryCache.size > MAX_COTTAGES * 2) {
          const first = this._geometryCache.keys().next().value;
          const old = this._geometryCache.get(first);
          old.geometry.dispose();
          if (old.windowGeometry) old.windowGeometry.dispose();
          this._geometryCache.delete(first);
        }
      }

      const angle = cd.seed * 73.13 % (Math.PI * 2);

      // Main cottage mesh
      const mesh = new THREE.Mesh(cached.geometry, material);
      mesh.position.set(cd.x, cd.y, cd.z);
      mesh.rotation.y = angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      this.cottageMeshes.push(mesh);

      // Window panes mesh (same position/rotation, separate emissive material)
      if (cached.windowGeometry) {
        const winMesh = new THREE.Mesh(cached.windowGeometry, windowMaterial);
        winMesh.position.set(cd.x, cd.y, cd.z);
        winMesh.rotation.y = angle;
        winMesh.matrixAutoUpdate = false;
        winMesh.updateMatrix();
        this.scene.add(winMesh);
        this.windowMeshes.push(winMesh);
      }

      // Chimney world position for smoke
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const cl = cached.chimneyTop;
      cd.chimneyWorld = new THREE.Vector3(
        cd.x + cl.x * cos + cl.z * sin,
        cd.y + cl.y,
        cd.z - cl.x * sin + cl.z * cos
      );
    }

    this._initSmoke();
  }

  _initSmoke() {
    for (const s of this._smokeSprites) this.scene.remove(s);
    this._smokeSprites.length = 0;
    this._smokeParticles.length = 0;

    if (this.cottageData.length === 0) return;

    // Irregular wispy smoke texture (multiple offset blobs)
    if (!this._smokeMaterial) {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const cx = size / 2, cy = size / 2;

      const blobs = [
        { ox: 0, oy: 0, r: 0.42 },
        { ox: -0.12, oy: 0.08, r: 0.28 },
        { ox: 0.15, oy: -0.06, r: 0.25 },
        { ox: 0.04, oy: 0.15, r: 0.22 },
        { ox: -0.08, oy: -0.1, r: 0.2 },
        { ox: 0.1, oy: 0.12, r: 0.18 },
      ];
      for (const b of blobs) {
        const bx = cx + b.ox * size;
        const by = cy + b.oy * size;
        const br = b.r * size;
        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        grad.addColorStop(0, 'rgba(240, 240, 245, 0.35)');
        grad.addColorStop(0.4, 'rgba(220, 220, 230, 0.18)');
        grad.addColorStop(1, 'rgba(200, 200, 210, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
      }

      const tex = new THREE.CanvasTexture(canvas);
      this._smokeMaterial = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        fog: true,
        color: new THREE.Color(CONFIG.SMOKE_COLOR.r, CONFIG.SMOKE_COLOR.g, CONFIG.SMOKE_COLOR.b),
      });
    }

    for (const cd of this.cottageData) {
      if (!cd.chimneyWorld) continue;

      for (let i = 0; i < CONFIG.SMOKE_PARTICLES_PER_COTTAGE; i++) {
        const mat = this._smokeMaterial.clone();
        const sprite = new THREE.Sprite(mat);
        sprite.renderOrder = 1;
        this.scene.add(sprite);
        this._smokeSprites.push(sprite);

        const lifetime = CONFIG.SMOKE_LIFETIME;
        const timeOffset = (i / CONFIG.SMOKE_PARTICLES_PER_COTTAGE + Math.random() * 0.1) % 1;
        this._smokeParticles.push({
          sprite,
          mat,
          x: cd.chimneyWorld.x + (Math.random() - 0.5) * 0.2,
          y: cd.chimneyWorld.y,
          z: cd.chimneyWorld.z + (Math.random() - 0.5) * 0.2,
          originX: cd.chimneyWorld.x,
          originY: cd.chimneyWorld.y,
          originZ: cd.chimneyWorld.z,
          life: timeOffset * lifetime,
          maxLife: lifetime,
          speedMul: 0.7 + Math.random() * 0.6,
          sizeMul: 0.7 + Math.random() * 0.6,
          aspect: 0.75 + Math.random() * 0.5,
          wobblePhase: Math.random() * Math.PI * 2,
          wobbleAmp: 0.3 + Math.random() * 0.5,
        });
      }
    }
  }

  update(delta, sunElevation) {
    this._updateSmoke(delta, sunElevation);
    this._updateWindows(sunElevation);
  }

  _updateSmoke(delta, sunElevation) {
    if (this._smokeParticles.length === 0) return;

    const windDir = windUniforms.uWindDirection.value;
    const windStr = windUniforms.uWindStrength.value;

    // Wind affects smoke behaviour: strong wind flattens and shears smoke
    const stormFactor = Math.min(1, windStr / 1.5); // 0 = calm, 1 = full storm
    const riseSpeed = CONFIG.SMOKE_RISE_SPEED * (1 - stormFactor * 0.6); // storm suppresses rise
    const driftSpeed = CONFIG.SMOKE_DRIFT_SPEED * windStr * (1 + stormFactor * 4); // storm massively increases drift
    const startSize = CONFIG.SMOKE_START_SIZE;
    const endSize = CONFIG.SMOKE_END_SIZE;

    // Night: darken smoke to match dark sky
    const brightness = Math.max(0.15, Math.min(1, (sunElevation + 0.05) / 0.25));
    const baseR = CONFIG.SMOKE_COLOR.r * brightness;
    const baseG = CONFIG.SMOKE_COLOR.g * brightness;
    const baseB = CONFIG.SMOKE_COLOR.b * brightness;

    for (const p of this._smokeParticles) {
      p.life += delta;

      if (p.life >= p.maxLife) {
        p.life = p.life % p.maxLife;
        p.x = p.originX + (Math.random() - 0.5) * 0.25;
        p.y = p.originY;
        p.z = p.originZ + (Math.random() - 0.5) * 0.25;
      }

      const t = p.life / p.maxLife;

      const riseFactor = 1 - t * 0.6;
      p.y += riseSpeed * riseFactor * p.speedMul * delta;

      const driftFactor = 0.3 + t * 0.7;
      const wobbleStr = p.wobbleAmp * (1 + stormFactor * 2); // more turbulent in wind
      const wobble = Math.sin(p.life * 1.5 + p.wobblePhase) * wobbleStr * t;
      const wobbleZ = Math.cos(p.life * 1.2 + p.wobblePhase * 1.7) * wobbleStr * t * 0.7;
      p.x += (windDir.x * driftSpeed * driftFactor + wobble * 0.2) * delta;
      p.z += (windDir.y * driftSpeed * driftFactor + wobbleZ * 0.2) * delta;

      p.sprite.position.set(p.x, p.y, p.z);

      const size = (startSize + t * (endSize - startSize)) * p.sizeMul;
      p.sprite.scale.set(size * p.aspect, size, 1);

      const fadeIn = Math.min(1, t * 4);
      const fadeOut = 1 - t * t;
      p.mat.opacity = fadeIn * fadeOut * 0.85;

      p.mat.color.setRGB(baseR, baseG, baseB);
    }
  }

  _updateWindows(sunElevation) {
    // Emissive glow at dusk/night, off during day
    // sunElevation: >0.05 full day, <-0.05 full night
    const glow = Math.max(0, Math.min(1, (0.05 - sunElevation) / 0.15));
    const winMat = getWindowMaterial();
    winMat.emissiveIntensity = glow * 0.15;
  }
}
