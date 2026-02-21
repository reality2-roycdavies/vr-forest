// Collectible orb system — fairy-like glowing sprites with fluttery animation
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const _dummy = new THREE.Object3D();
const _glowDummy = new THREE.Object3D();
const _color = new THREE.Color();

// Fairy color palette — soft magical hues
const FAIRY_COLORS = [
  new THREE.Color(0xaaffee), // teal (original)
  new THREE.Color(0xaaeeff), // ice blue
  new THREE.Color(0xccaaff), // lavender
  new THREE.Color(0xffaadd), // pink
  new THREE.Color(0xffffaa), // warm gold
  new THREE.Color(0xaaffbb), // mint green
  new THREE.Color(0xffccaa), // peach
];

export class CollectibleSystem {
  constructor(scene) {
    this.scene = scene;
    this.score = 0;
    this.onScoreChange = null; // callback(score)

    // Set of position hashes for collected orbs (persist across chunk loads)
    this.collected = new Set();

    // Active instance data
    this._positions = [];  // { x, y, z, hash, colorIdx }
    this._count = 0;

    const MAX = CONFIG.COLLECTIBLE_MAX_INSTANCES;

    // Core orb — per-instance color via instanceColor
    const coreGeom = new THREE.IcosahedronGeometry(CONFIG.COLLECTIBLE_ORB_RADIUS, 2);
    const coreMat = new THREE.MeshBasicMaterial();
    this.coreMesh = new THREE.InstancedMesh(coreGeom, coreMat, MAX);
    this.coreMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.coreMesh.frustumCulled = false;
    this.coreMesh.count = 0;
    scene.add(this.coreMesh);

    // Glow shell — per-instance color, additive, transparent
    const glowGeom = new THREE.IcosahedronGeometry(CONFIG.COLLECTIBLE_GLOW_RADIUS, 2);
    const glowMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glowMesh = new THREE.InstancedMesh(glowGeom, glowMat, MAX);
    this.glowMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.glowMesh.frustumCulled = false;
    this.glowMesh.count = 0;
    scene.add(this.glowMesh);

    // Ground glow — shader-based radial gradient beneath each orb, visible at night
    // Tight center gradient so clipping on slope edges is invisible
    const groundGlowGeom = new THREE.PlaneGeometry(3.0, 3.0);
    groundGlowGeom.rotateX(-Math.PI / 2); // lay flat on ground
    const groundGlowMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -8,
      uniforms: {
        uOpacity: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          #ifdef USE_INSTANCING_COLOR
            vColor = instanceColor;
          #else
            vColor = vec3(1.0);
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          // Radial distance from center (0 at center, 1 at edge)
          vec2 centered = vUv - 0.5;
          float dist = length(centered) * 2.0;
          // Tight falloff — most brightness in center 40%, near-zero at edges
          float alpha = 1.0 - smoothstep(0.0, 0.55, dist);
          alpha *= alpha * alpha; // cubic for very soft edge
          // Discard fully transparent pixels (avoids depth issues at edges)
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(vColor, alpha * uOpacity);
        }
      `,
    });
    this.groundGlowMesh = new THREE.InstancedMesh(groundGlowGeom, groundGlowMat, MAX);
    this.groundGlowMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.groundGlowMesh.frustumCulled = false;
    this.groundGlowMesh.count = 0;
    scene.add(this.groundGlowMesh);

    this._time = 0;
    this._groundGlowOpacity = 0;
  }

  /**
   * Hash a world position for stable deduplication
   */
  _hash(x, z) {
    return `${Math.round(x * 2)},${Math.round(z * 2)}`;
  }

  /**
   * Deterministic color index from position
   */
  _colorIdx(x, z) {
    return Math.abs(Math.floor(x * 7.3 + z * 13.7)) % FAIRY_COLORS.length;
  }

  /**
   * Rebuild instances from active chunks
   */
  rebuild(chunkIterator) {
    this._positions.length = 0;
    const MAX = CONFIG.COLLECTIBLE_MAX_INSTANCES;

    for (const chunk of chunkIterator) {
      if (!chunk.active) continue;
      for (const pos of chunk.collectiblePositions) {
        if (this._positions.length >= MAX) break;
        const hash = this._hash(pos.x, pos.z);
        if (this.collected.has(hash)) continue;
        const colorIdx = this._colorIdx(pos.x, pos.z);
        this._positions.push({ x: pos.x, y: pos.y, z: pos.z, hash, colorIdx });
      }
      if (this._positions.length >= MAX) break;
    }

    this._count = this._positions.length;
    this._applyColors();
    this._updateMatrices();
  }

  /**
   * Set per-instance colors from position data
   */
  _applyColors() {
    for (let i = 0; i < this._count; i++) {
      const p = this._positions[i];
      const coreColor = FAIRY_COLORS[p.colorIdx];
      this.coreMesh.setColorAt(i, coreColor);
      // Glow is a slightly darker/saturated version
      _color.copy(coreColor).multiplyScalar(0.7);
      this.glowMesh.setColorAt(i, _color);
      // Ground glow — dimmer version of orb color
      _color.copy(coreColor).multiplyScalar(0.4);
      this.groundGlowMesh.setColorAt(i, _color);
    }
    if (this._count > 0) {
      this.coreMesh.instanceColor.needsUpdate = true;
      this.glowMesh.instanceColor.needsUpdate = true;
      this.groundGlowMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Update instance matrices — fluttery fairy animation
   */
  _updateMatrices() {
    const t = this._time;

    for (let i = 0; i < this._count; i++) {
      const p = this._positions[i];
      // Unique phase offsets per sprite based on position
      const p1 = p.x * 0.37 + p.z * 0.71;
      const p2 = p.x * 0.53 + p.z * 0.29;
      const p3 = p.x * 0.19 + p.z * 0.83;

      // Fluttery vertical bob — layered sine waves at different speeds
      const bob = Math.sin(t * 2.8 + p1) * 0.04
                + Math.sin(t * 4.3 + p2) * 0.025
                + Math.sin(t * 7.1 + p3) * 0.012;

      // Lateral flutter — tiny XZ drift like a hovering insect
      const driftX = Math.sin(t * 3.5 + p2) * 0.03
                   + Math.sin(t * 6.2 + p3) * 0.015;
      const driftZ = Math.cos(t * 3.1 + p1) * 0.03
                   + Math.cos(t * 5.8 + p2) * 0.015;

      // Wobbling tilt — fairy doesn't sit perfectly level
      const tiltX = Math.sin(t * 2.1 + p3) * 0.3;
      const tiltZ = Math.cos(t * 2.7 + p1) * 0.3;
      const spin = t * 1.2 + p1;

      // Core orb — tighter to center
      _dummy.position.set(p.x + driftX, p.y + bob, p.z + driftZ);
      _dummy.rotation.set(tiltX, spin, tiltZ);
      _dummy.updateMatrix();
      this.coreMesh.setMatrixAt(i, _dummy.matrix);

      // Glow shell — slightly exaggerated drift + pulsing scale
      const pulse = 1.0 + Math.sin(t * 3.6 + p2) * 0.2
                        + Math.sin(t * 5.9 + p3) * 0.1;
      _glowDummy.position.set(p.x + driftX * 1.3, p.y + bob * 1.2, p.z + driftZ * 1.3);
      _glowDummy.rotation.set(tiltX * 0.5, spin * 0.7, tiltZ * 0.5);
      _glowDummy.scale.setScalar(pulse);
      _glowDummy.updateMatrix();
      this.glowMesh.setMatrixAt(i, _glowDummy.matrix);
    }

    // Ground glow — soft pool of light on terrain beneath each orb
    if (this.groundGlowMesh.visible) {
      for (let i = 0; i < this._count; i++) {
        const p = this._positions[i];
        // Orb base Y is terrainY + 0.8; position glow at terrain + 0.2 (above ground)
        _dummy.position.set(p.x, p.y - 0.6, p.z);
        _dummy.rotation.set(0, 0, 0);
        // Gentle scale pulse synced to orb bob
        const p2 = p.x * 0.53 + p.z * 0.29;
        const pulse = 0.9 + Math.sin(t * 2.0 + p2) * 0.1;
        _dummy.scale.setScalar(pulse);
        _dummy.updateMatrix();
        this.groundGlowMesh.setMatrixAt(i, _dummy.matrix);
      }
    }

    this.coreMesh.count = this._count;
    this.glowMesh.count = this._count;
    this.groundGlowMesh.count = this._count;
    if (this._count > 0) {
      this.coreMesh.instanceMatrix.needsUpdate = true;
      this.glowMesh.instanceMatrix.needsUpdate = true;
      this.groundGlowMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Per-frame update: animate, check collection
   */
  update(delta, playerPos, audio, sunElevation = 0.5) {
    if (this._count === 0) return;

    this._time += delta;

    // Ground glow fades in at dusk, full at night
    // sunElevation: ~0.05 = near horizon, negative = below horizon
    const targetOpacity = sunElevation < -0.05 ? 0.22
                        : sunElevation < 0.08 ? 0.22 * (1 - (sunElevation + 0.05) / 0.13)
                        : 0;
    this._groundGlowOpacity += (targetOpacity - this._groundGlowOpacity) * Math.min(1, delta * 2);
    this.groundGlowMesh.material.uniforms.uOpacity.value = this._groundGlowOpacity;
    this.groundGlowMesh.visible = this._groundGlowOpacity > 0.005;

    // Check collection (XZ distance only)
    const collectRadSq = CONFIG.COLLECTIBLE_COLLISION_RADIUS * CONFIG.COLLECTIBLE_COLLISION_RADIUS;
    let changed = false;

    for (let i = this._count - 1; i >= 0; i--) {
      const p = this._positions[i];
      const dx = playerPos.x - p.x;
      const dz = playerPos.z - p.z;
      if (dx * dx + dz * dz < collectRadSq) {
        // Collect this orb
        this.collected.add(p.hash);
        const prevScore = this.score;
        this.score += CONFIG.COLLECTIBLE_SCORE_VALUE;

        // Play chime — fanfare on multiples of 10
        if (audio) {
          if (audio.playCollectChime) {
            audio.playCollectChime({ x: p.x, y: p.y, z: p.z });
          }
          if (audio.playCollectFanfare &&
              Math.floor(this.score / 10) > Math.floor(prevScore / 10)) {
            audio.playCollectFanfare();
          }
        }

        // Swap-remove: replace with last element
        this._positions[i] = this._positions[this._count - 1];
        this._count--;
        this._positions.length = this._count;
        changed = true;
      }
    }

    if (changed) {
      this._applyColors(); // reapply after swap-remove
      if (this.onScoreChange) {
        this.onScoreChange(this.score);
      }
    }

    // Animate all remaining orbs
    this._updateMatrices();
  }
}
