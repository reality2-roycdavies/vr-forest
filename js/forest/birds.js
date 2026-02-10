// Distant bird flocks — visual chevrons + crow-like caw audio
import * as THREE from 'three';

const FLOCK_COUNT = 5;
const BIRDS_PER_FLOCK = 8;
const BIRD_ALTITUDE_MIN = 18;
const BIRD_ALTITUDE_MAX = 40;
const FLOCK_RADIUS_MIN = 25;
const FLOCK_RADIUS_MAX = 80;
const FLOCK_SPEED = 5;           // m/s orbit speed
const WING_FLAP_SPEED = 1.8;    // flap cycles per second (slow, crow-like)
const CAW_INTERVAL_MIN = 4;     // seconds between caws
const CAW_INTERVAL_MAX = 12;
const DAY_THRESHOLD = 0.02;     // sun elevation above which birds are active

const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

export class BirdFlockSystem {
  constructor(scene) {
    this.scene = scene;
    this.flocks = [];
    this.mesh = null;
    this.time = 0;
    this.audioCtx = null;
    this.spatialBus = null;
    this._nextCaw = 3 + Math.random() * 5;

    this._createMesh();
    this._initFlocks();
  }

  /** Connect to the shared audio context (call after audio.start()) */
  setAudioContext(ctx, spatialBus) {
    this.audioCtx = ctx;
    this.spatialBus = spatialBus;
  }

  _createBirdGeometry() {
    // Bird with body + swept wings (crow-sized, ~0.5m wingspan)
    const verts = new Float32Array([
      // Body (fat diamond shape, nose to tail)
      0, 0.02, 0.08,   -0.05, 0, 0,     0.05, 0, 0,     // front body
      -0.05, 0, 0,      0.05, 0, 0,      0, 0.01, -0.12, // rear body
      // Left wing (swept back)
      -0.05, 0, 0,     -0.4, 0.025, -0.08, -0.15, 0.01, -0.1,
      -0.05, 0, 0,     -0.15, 0.01, -0.1, -0.04, 0.008, -0.08,
      // Right wing
      0.05, 0, 0,       0.4, 0.025, -0.08,  0.15, 0.01, -0.1,
      0.05, 0, 0,       0.15, 0.01, -0.1,   0.04, 0.008, -0.08,
    ]);
    const norms = new Float32Array(verts.length);
    for (let i = 0; i < norms.length; i += 3) {
      norms[i] = 0; norms[i + 1] = 1; norms[i + 2] = 0;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
    return geom;
  }

  _createMesh() {
    const geom = this._createBirdGeometry();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1a1a1a,
      side: THREE.DoubleSide,
    });
    const total = FLOCK_COUNT * BIRDS_PER_FLOCK;
    this.mesh = new THREE.InstancedMesh(geom, mat, total);
    this.mesh.count = total;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  _initFlocks() {
    for (let i = 0; i < FLOCK_COUNT; i++) {
      const angle = (i / FLOCK_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const radius = FLOCK_RADIUS_MIN + Math.random() * (FLOCK_RADIUS_MAX - FLOCK_RADIUS_MIN);
      const altitude = BIRD_ALTITUDE_MIN + Math.random() * (BIRD_ALTITUDE_MAX - BIRD_ALTITUDE_MIN);
      const speed = FLOCK_SPEED * (0.7 + Math.random() * 0.6);
      const clockwise = Math.random() > 0.5 ? 1 : -1;

      // Per-bird offsets — scattered loosely, each with own drift
      const birds = [];
      for (let b = 0; b < BIRDS_PER_FLOCK; b++) {
        birds.push({
          lateralOff: (Math.random() - 0.5) * 12,
          forwardOff: (Math.random() - 0.5) * 10,
          altOff: (Math.random() - 0.5) * 4,
          flapPhase: Math.random() * Math.PI * 2,
          wingScale: 0.8 + Math.random() * 0.4,
          // Individual drift so birds move within the flock
          driftPhaseX: Math.random() * Math.PI * 2,
          driftPhaseZ: Math.random() * Math.PI * 2,
          driftSpeedX: 0.15 + Math.random() * 0.25,
          driftSpeedZ: 0.15 + Math.random() * 0.25,
          driftAmpX: 2 + Math.random() * 3,
          driftAmpZ: 2 + Math.random() * 3,
        });
      }

      this.flocks.push({
        angle,
        radius,
        altitude,
        speed,
        clockwise,
        birds,
        radiusDrift: Math.random() * Math.PI * 2,
        altDrift: Math.random() * Math.PI * 2,
      });
    }
  }

  update(delta, playerPos, sunElevation) {
    this.time += delta;

    // Birds only active during daytime
    const isDay = sunElevation > DAY_THRESHOLD;
    // Smooth fade near threshold
    const visibility = Math.max(0, Math.min(1, (sunElevation - DAY_THRESHOLD) * 20));

    let instanceIdx = 0;
    for (const flock of this.flocks) {
      if (isDay) {
        flock.angle += flock.clockwise * flock.speed / flock.radius * delta;
      }

      // Gentle drift in orbit radius and altitude
      const driftR = Math.sin(this.time * 0.1 + flock.radiusDrift) * 15;
      const driftA = Math.sin(this.time * 0.08 + flock.altDrift) * 5;
      const r = flock.radius + driftR;
      const alt = flock.altitude + driftA;

      // Flock center in world space (orbits around player)
      const cx = playerPos.x + Math.cos(flock.angle) * r;
      const cz = playerPos.z + Math.sin(flock.angle) * r;
      const cy = alt;

      // Forward direction (tangent to circle)
      const fx = -Math.sin(flock.angle) * flock.clockwise;
      const fz = Math.cos(flock.angle) * flock.clockwise;
      // Right direction
      const rx = fz;
      const rz = -fx;

      const headingAngle = Math.atan2(fx, fz);

      for (const bird of flock.birds) {
        // Individual drift within the flock — birds wander around loosely
        const driftX = Math.sin(this.time * bird.driftSpeedX + bird.driftPhaseX) * bird.driftAmpX;
        const driftZ = Math.sin(this.time * bird.driftSpeedZ + bird.driftPhaseZ) * bird.driftAmpZ;
        const driftY = Math.sin(this.time * 0.4 + bird.flapPhase) * 1.5;

        const bx = cx + rx * (bird.lateralOff + driftX) + fx * (bird.forwardOff + driftZ);
        const bz = cz + rz * (bird.lateralOff + driftX) + fz * (bird.forwardOff + driftZ);
        const by = cy + bird.altOff + driftY;

        _pos.set(bx, by, bz);

        // Wing flap — slow flaps with glide phases
        // Cycle: flap-flap-flap then glide, using a pattern that mostly holds wings level
        const flapT = (this.time * WING_FLAP_SPEED + bird.flapPhase) % 1.0;
        let flapAngle;
        if (flapT < 0.6) {
          // Flapping phase: smooth sinusoidal, gentle amplitude
          const ft = flapT / 0.6;
          flapAngle = Math.sin(ft * Math.PI * 2 * 1.5) * 0.2;
        } else {
          // Glide phase: wings held slightly raised, very gentle undulation
          const gt = (flapT - 0.6) / 0.4;
          flapAngle = 0.05 + Math.sin(gt * Math.PI) * 0.03;
        }
        // Slight individual heading variation for flock-like feel
        const headingJitter = Math.sin(this.time * 0.5 + bird.flapPhase) * 0.1;
        _euler.set(0, headingAngle + headingJitter, flapAngle);
        _quat.setFromEuler(_euler);

        const s = bird.wingScale * visibility;
        _scale.set(s, s, s);

        _matrix.compose(_pos, _quat, _scale);
        this.mesh.setMatrixAt(instanceIdx, _matrix);
        instanceIdx++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // Crow caws — only during day
    if (isDay) {
      this._nextCaw -= delta;
      if (this._nextCaw <= 0) {
        this._playCaw(playerPos);
        this._nextCaw = CAW_INTERVAL_MIN + Math.random() * (CAW_INTERVAL_MAX - CAW_INTERVAL_MIN);
      }
    }
  }

  _playCaw(playerPos) {
    const ctx = this.audioCtx;
    if (!ctx || ctx.state !== 'running') return;

    // Pick a random flock for the caw source direction
    const flock = this.flocks[Math.floor(Math.random() * this.flocks.length)];
    const driftR = Math.sin(this.time * 0.1 + flock.radiusDrift) * 15;
    const r = flock.radius + driftR;
    const sx = playerPos.x + Math.cos(flock.angle) * r;
    const sz = playerPos.z + Math.sin(flock.angle) * r;
    const sy = flock.altitude;

    // 1-3 caws in quick succession
    const cawCount = 1 + Math.floor(Math.random() * 3);
    for (let c = 0; c < cawCount; c++) {
      this._singleCaw(ctx, sx, sy, sz, ctx.currentTime + c * (0.25 + Math.random() * 0.15));
    }
  }

  _singleCaw(ctx, sx, sy, sz, startTime) {
    const now = startTime;
    const duration = 0.15 + Math.random() * 0.1;

    // Harsh nasal oscillator — crow caw
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const baseFreq = 380 + Math.random() * 120;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, now + duration);

    // Second oscillator for roughness
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(baseFreq * 1.01, now);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.58, now + duration);

    // Amplitude envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.01);
    gain.gain.setValueAtTime(0.035, now + duration * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Bandpass for nasal quality
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 3;

    // Spatial panner
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 30;
    panner.maxDistance = 200;
    panner.rolloffFactor = 0.5;
    panner.setPosition(sx, sy, sz);

    const dest = this.spatialBus || ctx.destination;
    osc.connect(bp);
    osc2.connect(bp);
    bp.connect(gain);
    gain.connect(panner);
    panner.connect(dest);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + duration + 0.05);
    osc2.stop(now + duration + 0.05);
  }
}
