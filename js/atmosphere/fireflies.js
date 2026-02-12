// Fireflies that appear at night - glowing particles around the player
import * as THREE from 'three';

const COUNT = 30;
const SPREAD = 30;
const HEIGHT_MIN = 0.5;
const HEIGHT_MAX = 3.0;

export class FireflySystem {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.opacity = 0;

    // Per-firefly state
    this.flies = [];
    for (let i = 0; i < COUNT; i++) {
      this.flies.push({
        x: (Math.random() - 0.5) * SPREAD * 2,
        y: HEIGHT_MIN + Math.random() * (HEIGHT_MAX - HEIGHT_MIN),
        z: (Math.random() - 0.5) * SPREAD * 2,
        phase: Math.random() * Math.PI * 2,
        glowSpeed: 0.8 + Math.random() * 1.5,
        driftAngle: Math.random() * Math.PI * 2,
        driftSpeed: 0.2 + Math.random() * 0.4,
        driftRadius: 0.5 + Math.random() * 1.5,
        bobSpeed: 1 + Math.random() * 2,
        bobAmount: 0.1 + Math.random() * 0.3,
        isGreen: Math.random() > 0.5,
      });
    }

    // Two layers: a larger dim glow + a smaller bright core
    this.glowMesh = this._createLayer(0.2, 0.25);
    this.coreMesh = this._createLayer(0.06, 0.7);

    this.glowMesh.visible = false;
    this.coreMesh.visible = false;
    scene.add(this.glowMesh);
    scene.add(this.coreMesh);
  }

  _createLayer(size, baseOpacity) {
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Create a small glow texture
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,200,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,100,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    const tex = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      size: size,
      map: tex,
      vertexColors: true,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const mesh = new THREE.Points(geo, mat);
    mesh.frustumCulled = false;
    mesh.userData.baseOpacity = baseOpacity;
    return mesh;
  }

  /**
   * @param {number} delta
   * @param {THREE.Vector3} playerPos
   * @param {number} sunElevation
   * @param {object} [weather] - WeatherSystem instance (optional)
   */
  update(delta, playerPos, sunElevation, weather) {
    this.time += delta;

    // Fade based on sun, reduced by rain
    let target = sunElevation < -0.05 ? 1.0 :
                   sunElevation < 0.05 ? 1.0 - (sunElevation + 0.05) / 0.1 : 0;
    if (weather) target *= (1 - weather.rainIntensity * 0.8);
    this.opacity += (target - this.opacity) * Math.min(1, delta * 2);

    const shouldShow = this.opacity > 0.01;
    this.glowMesh.visible = shouldShow;
    this.coreMesh.visible = shouldShow;
    if (!shouldShow) return;

    this.glowMesh.material.opacity = this.glowMesh.userData.baseOpacity * this.opacity;
    this.coreMesh.material.opacity = this.coreMesh.userData.baseOpacity * this.opacity;

    const glowPos = this.glowMesh.geometry.getAttribute('position');
    const glowCol = this.glowMesh.geometry.getAttribute('color');
    const corePos = this.coreMesh.geometry.getAttribute('position');
    const coreCol = this.coreMesh.geometry.getAttribute('color');

    for (let i = 0; i < COUNT; i++) {
      const f = this.flies[i];

      // Drift
      f.driftAngle += f.driftSpeed * delta;
      const dx = Math.cos(f.driftAngle) * f.driftRadius;
      const dz = Math.sin(f.driftAngle) * f.driftRadius;
      const bob = Math.sin(this.time * f.bobSpeed + f.phase) * f.bobAmount;

      const wx = playerPos.x + f.x + dx;
      const wy = playerPos.y + f.y + bob;
      const wz = playerPos.z + f.z + dz;

      glowPos.setXYZ(i, wx, wy, wz);
      corePos.setXYZ(i, wx, wy, wz);

      // Glow pulse
      const pulse = Math.sin(this.time * f.glowSpeed + f.phase);
      const brightness = pulse > 0.2 ? (pulse - 0.2) / 0.8 : 0;

      // Color: warm yellow or cool green
      let r, g, b;
      if (f.isGreen) {
        r = 0.4 * brightness;
        g = 0.95 * brightness;
        b = 0.2 * brightness;
      } else {
        r = 0.95 * brightness;
        g = 0.85 * brightness;
        b = 0.2 * brightness;
      }

      glowCol.setXYZ(i, r, g, b);
      coreCol.setXYZ(i, r, g, b);
    }

    glowPos.needsUpdate = true;
    glowCol.needsUpdate = true;
    corePos.needsUpdate = true;
    coreCol.needsUpdate = true;

    // Respawn flies that drifted too far
    for (const f of this.flies) {
      const d2 = f.x * f.x + f.z * f.z;
      if (d2 > SPREAD * SPREAD) {
        f.x = (Math.random() - 0.5) * SPREAD;
        f.z = (Math.random() - 0.5) * SPREAD;
      }
    }
  }
}
