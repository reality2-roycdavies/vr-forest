// Weather system — single intensity float drives sunny/cloudy/rainy states
// weatherIntensity: 0.0 (sunny) → 1.0 (cloudy) → 2.0 (rainy)
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const _stormColor = new THREE.Color(CONFIG.WEATHER_STORM_CLOUD_COLOR);

// Cache URL param once
const _weatherParam = new URLSearchParams(window.location.search).get('weather');
const _weatherLock = _weatherParam !== null ? _parseWeatherParam(_weatherParam) : null;

function _parseWeatherParam(val) {
  const named = { sunny: 0, clear: 0, cloudy: 1, overcast: 1, rainy: 2, rain: 2, storm: 2 };
  if (named[val.toLowerCase()] !== undefined) return named[val.toLowerCase()];
  const num = parseFloat(val);
  return isNaN(num) ? null : Math.max(0, Math.min(2, num));
}

// Clamp + lerp helpers
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function lerp(a, b, t) { return a + (b - a) * clamp01(t); }

export class WeatherSystem {
  constructor(scene) {
    this.scene = scene;

    // --- State machine ---
    this.weatherIntensity = _weatherLock !== null ? _weatherLock : 0;
    this.targetIntensity = _weatherLock !== null ? _weatherLock : 0;
    this.holdTimer = 0;
    this.holdDuration = CONFIG.WEATHER_HOLD_MIN + Math.random() * (CONFIG.WEATHER_HOLD_MAX - CONFIG.WEATHER_HOLD_MIN);
    this.locked = _weatherLock !== null;

    // --- Derived parameters (updated each frame) ---
    this.cloudDensity = 0;
    this.cloudDarkness = 0;
    this.windMultiplier = 1;
    this.fogMultiplier = 1;
    this.rainIntensity = 0;
    this.lightDimming = 0;
    this.skyDarkening = 0;
    this.starDimming = 0;
    this.groundWetness = 0;
    this.waveAmplitude = 1;
    this.lightningFlash = 0;
    this.stormCloudColor = _stormColor;

    // --- Rain particles ---
    this._rainMesh = null;
    this._rainPositions = null;
    this._rainOpacities = null;
    this._rainSpeeds = null;
    this._createRainParticles(scene);

    // --- Lightning ---
    this._lightningTimer = 0;
    this._lightningInterval = this._nextLightningInterval();
    this._flashValue = 0;
    this._thunderPending = [];

    // --- Rain audio state ---
    this._rainAudioActive = false;
    this._patterSource = null;
    this._patterGain = null;
    this._patterFilter = null;
    this._washSource = null;
    this._washGain = null;
    this._washFilter = null;

    // --- Spatial drip timer ---
    this._dripTimer = 0;
    this._dripInterval = 0.3;
    this._playerPos = null;
    this._spatialBus = null;

    // Initial derived params
    this._updateDerivedParams();
  }

  // ======== Rain particles ========

  _createRainParticles(scene) {
    const count = CONFIG.RAIN_PARTICLE_COUNT;
    const positions = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // sqrt distribution for uniform area density (more near center)
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * CONFIG.RAIN_RADIUS;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = Math.random() * CONFIG.RAIN_HEIGHT;
      positions[i * 3 + 2] = Math.sin(angle) * r;
      opacities[i] = 0;
      speeds[i] = CONFIG.RAIN_SPEED_MIN + Math.random() * (CONFIG.RAIN_SPEED_MAX - CONFIG.RAIN_SPEED_MIN);
    }

    const geo = new THREE.BufferGeometry();
    // Use BufferAttribute (not Float32BufferAttribute) to avoid array copy —
    // we need direct writes to positions/opacities each frame
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0.7, 0.75, 0.85) },
      },
      vertexShader: `
        attribute float aOpacity;
        varying float vOpacity;
        varying float vDepth;
        void main() {
          vOpacity = aOpacity;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mvPos.z;
          // Tall thin streaks — height gives the rain-line look
          gl_PointSize = clamp(90.0 / max(1.0, -mvPos.z), 2.0, 45.0);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vOpacity;
        varying float vDepth;
        void main() {
          // Hair-thin vertical streak: extreme horizontal squeeze, soft vertical taper
          vec2 c = gl_PointCoord - vec2(0.5);
          // Very narrow (x * 80) = only center ~12% of width survives
          // Tall (y * 0.8) = nearly full height used
          float dist = c.x * c.x * 80.0 + c.y * c.y * 0.8;
          if (dist > 1.0) discard;
          // Soft core — brighter at center, fades toward edges
          float core = exp(-dist * 3.0);
          // Distance fade
          float distFade = 1.0 - smoothstep(8.0, 22.0, vDepth);
          float alpha = core * vOpacity * distFade * 0.7;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: false,
    });

    this._rainMesh = new THREE.Points(geo, mat);
    this._rainMesh.frustumCulled = false;
    this._rainMesh.visible = false;
    scene.add(this._rainMesh);

    this._rainPositions = positions;
    this._rainOpacities = opacities;
    this._rainSpeeds = speeds;
  }

  _updateRainParticles(delta, playerPos, windDir) {
    const shouldShow = this.rainIntensity > 0.01;
    this._rainMesh.visible = shouldShow;
    if (!shouldShow) return;

    const count = CONFIG.RAIN_PARTICLE_COUNT;
    const activeCount = Math.floor(count * this.rainIntensity);
    const radius = CONFIG.RAIN_RADIUS;
    const height = CONFIG.RAIN_HEIGHT;
    const positions = this._rainPositions;
    const opacities = this._rainOpacities;
    const speeds = this._rainSpeeds;

    // Wind sideways push
    const windX = windDir ? windDir.x * CONFIG.RAIN_WIND_INFLUENCE * this.windMultiplier : 0;
    const windZ = windDir ? windDir.y * CONFIG.RAIN_WIND_INFLUENCE * this.windMultiplier : 0;

    for (let i = 0; i < count; i++) {
      if (i >= activeCount) {
        opacities[i] = 0;
        continue;
      }

      // Move down + wind push
      positions[i * 3] += windX * delta;
      positions[i * 3 + 1] -= speeds[i] * delta;
      positions[i * 3 + 2] += windZ * delta;

      // Respawn at top if below ground or too far from center
      const dx = positions[i * 3];
      const dz = positions[i * 3 + 2];
      if (positions[i * 3 + 1] < 0 || dx * dx + dz * dz > radius * radius * 1.44) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * radius;
        positions[i * 3] = Math.cos(angle) * r;
        positions[i * 3 + 1] = height + Math.random() * 2;
        positions[i * 3 + 2] = Math.sin(angle) * r;
        speeds[i] = CONFIG.RAIN_SPEED_MIN + Math.random() * (CONFIG.RAIN_SPEED_MAX - CONFIG.RAIN_SPEED_MIN);
      }

      opacities[i] = 0.5 + Math.random() * 0.5;
    }

    // Position rain cylinder at player
    this._rainMesh.position.set(playerPos.x, playerPos.y, playerPos.z);

    const geo = this._rainMesh.geometry;
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('aOpacity').needsUpdate = true;
  }

  // ======== Lightning ========

  _nextLightningInterval() {
    return CONFIG.THUNDER_INTERVAL_MIN +
      Math.random() * (CONFIG.THUNDER_INTERVAL_MAX - CONFIG.THUNDER_INTERVAL_MIN);
  }

  _updateLightning(delta) {
    // Decay flash
    if (this._flashValue > 0) {
      this._flashValue = Math.max(0, this._flashValue - delta / CONFIG.LIGHTNING_FLASH_DECAY);
    }

    if (this.rainIntensity < 0.1) {
      this._lightningTimer = 0;
      return;
    }

    this._lightningTimer += delta * this.rainIntensity;
    if (this._lightningTimer >= this._lightningInterval) {
      this._lightningTimer = 0;
      this._lightningInterval = this._nextLightningInterval();

      // Flash
      this._flashValue = 0.8 + Math.random() * 0.2;

      // Schedule thunder sound
      const thunderDelay = CONFIG.THUNDER_DELAY_MIN +
        Math.random() * (CONFIG.THUNDER_DELAY_MAX - CONFIG.THUNDER_DELAY_MIN);
      this._thunderPending.push({
        delay: thunderDelay,
        volume: 0.6 + Math.random() * 0.4,
        isClose: thunderDelay < 0.8,
      });
    }

    // Tick thunder delays
    for (let i = this._thunderPending.length - 1; i >= 0; i--) {
      this._thunderPending[i].delay -= delta;
      if (this._thunderPending[i].delay <= 0) {
        const t = this._thunderPending.splice(i, 1)[0];
        this._playThunder(t.volume, t.isClose);
      }
    }

    this.lightningFlash = this._flashValue;
  }

  // ======== Rain audio ========

  _startRainAudio(ctx, masterGain, noiseBuffer) {
    if (this._rainAudioActive || !ctx || !noiseBuffer) return;
    this._rainAudioActive = true;

    // Light patter layer
    this._patterSource = ctx.createBufferSource();
    this._patterSource.buffer = noiseBuffer;
    this._patterSource.loop = true;
    this._patterSource.playbackRate.value = 1.2;

    this._patterFilter = ctx.createBiquadFilter();
    this._patterFilter.type = 'bandpass';
    this._patterFilter.frequency.value = CONFIG.RAIN_PATTER_FREQ;
    this._patterFilter.Q.value = CONFIG.RAIN_PATTER_Q;

    this._patterGain = ctx.createGain();
    this._patterGain.gain.value = 0;

    this._patterSource.connect(this._patterFilter);
    this._patterFilter.connect(this._patterGain);
    this._patterGain.connect(masterGain);
    this._patterSource.start();

    // Heavy wash layer
    this._washSource = ctx.createBufferSource();
    this._washSource.buffer = noiseBuffer;
    this._washSource.loop = true;
    this._washSource.playbackRate.value = 0.6;

    this._washFilter = ctx.createBiquadFilter();
    this._washFilter.type = 'bandpass';
    this._washFilter.frequency.value = CONFIG.RAIN_WASH_FREQ;
    this._washFilter.Q.value = CONFIG.RAIN_WASH_Q;

    this._washGain = ctx.createGain();
    this._washGain.gain.value = 0;

    this._washSource.connect(this._washFilter);
    this._washFilter.connect(this._washGain);
    this._washGain.connect(masterGain);
    this._washSource.start();
  }

  _stopRainAudio() {
    if (!this._rainAudioActive) return;
    this._rainAudioActive = false;
    try { this._patterSource?.stop(); } catch (e) { /* */ }
    try { this._washSource?.stop(); } catch (e) { /* */ }
    this._patterSource = null;
    this._patterGain = null;
    this._patterFilter = null;
    this._washSource = null;
    this._washGain = null;
    this._washFilter = null;
  }

  _updateRainAudioGains() {
    if (!this._rainAudioActive) return;
    const ri = this.rainIntensity;
    // Patter: linear scale
    if (this._patterGain) {
      this._patterGain.gain.value = ri * 0.12;
    }
    // Wash: quadratic scale — louder in heavy rain
    if (this._washGain) {
      this._washGain.gain.value = ri * ri * 0.15;
    }
  }

  _updateSpatialDrips(delta) {
    if (!this._audioCtx || !this._noiseBuffer || !this._playerPos || !this._spatialBus) return;
    if (this.rainIntensity < 0.1) return;

    this._dripTimer += delta;
    // More drips in heavier rain
    const interval = 0.15 + (1 - this.rainIntensity) * 0.4;
    if (this._dripTimer < interval) return;
    this._dripTimer = 0;

    const ctx = this._audioCtx;
    const now = ctx.currentTime;
    const pp = this._playerPos;

    // Random position in a 15m sphere around player
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * 12;
    const height = -1 + Math.random() * 6;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 3;
    panner.maxDistance = 25;
    panner.rolloffFactor = 1.0;
    panner.positionX.value = pp.x + Math.cos(angle) * dist;
    panner.positionY.value = pp.y + height;
    panner.positionZ.value = pp.z + Math.sin(angle) * dist;

    // Choose between drip types
    const type = Math.random();
    if (type < 0.4) {
      // Single drip — short high-freq ping
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const freq = 2000 + Math.random() * 3000;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.08);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06 + Math.random() * 0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06 + Math.random() * 0.06);

      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this._spatialBus);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type < 0.7) {
      // Double drip — two pings in quick succession
      for (let i = 0; i < 2; i++) {
        const t = now + i * (0.04 + Math.random() * 0.03);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const freq = 2500 + Math.random() * 2500;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.4, t + 0.06);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime((0.04 + Math.random() * 0.04) * (1 - i * 0.3), t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.04);

        osc.connect(gain);
        gain.connect(panner);
        osc.start(t);
        osc.stop(t + 0.12);
      }
      panner.connect(this._spatialBus);
    } else {
      // Splash patter — noise burst, like rain hitting a leaf or puddle
      const noise = ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      noise.playbackRate.value = 0.8 + Math.random() * 0.6;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3000 + Math.random() * 3000;
      bp.Q.value = 1.5 + Math.random();

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04 + Math.random() * 0.06);

      noise.connect(bp);
      bp.connect(gain);
      gain.connect(panner);
      panner.connect(this._spatialBus);
      noise.start(now);
      noise.stop(now + 0.15);
    }
  }

  /**
   * Create a procedural reverb impulse response — simulates outdoor thunder reverb.
   * Returns an AudioBuffer with exponentially decaying noise, shaped for low frequencies.
   */
  _createReverbIR(ctx, duration) {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(2, length, sampleRate);
    const chL = buffer.getChannelData(0);
    const chR = buffer.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Multi-stage decay: fast early, slow tail
      const earlyDecay = Math.exp(-t * 2.5);        // first 0.5s
      const lateDecay = Math.exp(-t * 0.5) * 0.4;   // long tail
      const envelope = earlyDecay + lateDecay;
      // Scattered early reflections (clusters of energy)
      const clusters = (t < 0.3) ? (1 + Math.sin(t * 80) * 0.5) : 1;
      const amp = envelope * clusters;
      chL[i] = (Math.random() * 2 - 1) * amp;
      chR[i] = (Math.random() * 2 - 1) * amp;
    }
    return buffer;
  }

  _playThunder(volume, isClose) {
    if (!this._audioCtx || !this._noiseBuffer) return;
    const ctx = this._audioCtx;
    const now = ctx.currentTime;
    const totalDuration = isClose ? 6 : 8;

    // --- Reverb convolver (shared IR, created once) ---
    if (!this._reverbIR) {
      this._reverbIR = this._createReverbIR(ctx, 5);
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = this._reverbIR;

    // --- Master thunder bus (everything routes here → reverb → output) ---
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.7;
    const wetGain = ctx.createGain();
    wetGain.gain.value = isClose ? 0.5 : 0.8; // distant = more reverb

    const thunderBus = ctx.createGain();
    thunderBus.gain.value = volume;

    // Dry path
    thunderBus.connect(dryGain);
    dryGain.connect(this._masterGain);
    // Wet path (through reverb)
    thunderBus.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(this._masterGain);

    // --- Layer 1: Initial crack / snap ---
    if (isClose) {
      const crack = ctx.createBufferSource();
      crack.buffer = this._noiseBuffer;
      crack.playbackRate.value = 1.8 + Math.random() * 0.5;

      const crackHP = ctx.createBiquadFilter();
      crackHP.type = 'highpass';
      crackHP.frequency.value = 2000;

      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(1.5, now);
      crackGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      crack.connect(crackHP);
      crackHP.connect(crackGain);
      crackGain.connect(thunderBus);
      crack.start(now);
      crack.stop(now + 0.2);
    }

    // --- Layer 2: Main boom (deep sub-bass rumble) ---
    const boom = ctx.createBufferSource();
    boom.buffer = this._noiseBuffer;
    boom.playbackRate.value = 0.15 + Math.random() * 0.1;

    const boomLP = ctx.createBiquadFilter();
    boomLP.type = 'lowpass';
    boomLP.frequency.value = 120 + Math.random() * 80;
    boomLP.Q.value = 1.2;

    const boomGain = ctx.createGain();
    const boomDelay = isClose ? 0 : 0.1 + Math.random() * 0.15;
    boomGain.gain.setValueAtTime(0, now + boomDelay);
    boomGain.gain.linearRampToValueAtTime(1.0, now + boomDelay + 0.15);
    boomGain.gain.setValueAtTime(0.8, now + boomDelay + 0.4);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 3.5);

    boom.connect(boomLP);
    boomLP.connect(boomGain);
    boomGain.connect(thunderBus);
    boom.start(now + boomDelay);
    boom.stop(now + 4);

    // --- Layer 3: Mid-frequency body (gives presence and character) ---
    const body = ctx.createBufferSource();
    body.buffer = this._noiseBuffer;
    body.playbackRate.value = 0.35 + Math.random() * 0.15;

    const bodyBP = ctx.createBiquadFilter();
    bodyBP.type = 'bandpass';
    bodyBP.frequency.value = 180 + Math.random() * 100;
    bodyBP.Q.value = 0.5;

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0, now);
    bodyGain.gain.linearRampToValueAtTime(0.7, now + 0.08);
    bodyGain.gain.setValueAtTime(0.5, now + 0.5);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    body.connect(bodyBP);
    bodyBP.connect(bodyGain);
    bodyGain.connect(thunderBus);
    body.start(now);
    body.stop(now + 3);

    // --- Layer 4: Rolling echoes (2-4 delayed repeats, simulating reflections) ---
    const echoCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < echoCount; i++) {
      const echoDelay = 0.8 + i * (0.6 + Math.random() * 0.8);
      const echoVol = 0.4 / (i + 1); // decreasing volume

      const echo = ctx.createBufferSource();
      echo.buffer = this._noiseBuffer;
      echo.playbackRate.value = 0.2 + Math.random() * 0.15;

      const echoBP = ctx.createBiquadFilter();
      echoBP.type = 'bandpass';
      // Each echo progressively lower in frequency (distant = bassier)
      echoBP.frequency.value = 150 - i * 20 + Math.random() * 60;
      echoBP.Q.value = 0.4;

      const echoGain = ctx.createGain();
      const et = now + echoDelay;
      echoGain.gain.setValueAtTime(0, et);
      echoGain.gain.linearRampToValueAtTime(echoVol, et + 0.1);
      echoGain.gain.exponentialRampToValueAtTime(0.001, et + 1.5 + Math.random() * 1.0);

      echo.connect(echoBP);
      echoBP.connect(echoGain);
      echoGain.connect(thunderBus);
      echo.start(et);
      echo.stop(et + 3);
    }

    // --- Layer 5: Long sub-bass tail (very low sine that fades slowly) ---
    const subBass = ctx.createOscillator();
    subBass.type = 'sine';
    subBass.frequency.setValueAtTime(35 + Math.random() * 15, now);
    subBass.frequency.exponentialRampToValueAtTime(20, now + totalDuration);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0, now + 0.3);
    subGain.gain.linearRampToValueAtTime(0.25, now + 0.8);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + totalDuration);

    subBass.connect(subGain);
    subGain.connect(thunderBus);
    subBass.start(now + 0.3);
    subBass.stop(now + totalDuration + 0.1);
  }

  // ======== Derived parameters ========

  _updateDerivedParams() {
    const w = this.weatherIntensity;

    // cloudDensity: 0 → 0.8 → 0.9
    this.cloudDensity = w <= 1 ? w * 0.8 : 0.8 + (w - 1) * 0.1;

    // cloudDarkness: 0 → 0.65 → 0.9 (cloudy dark, rainy darker)
    this.cloudDarkness = w <= 1 ? w * 0.65 : 0.65 + (w - 1) * 0.25;

    // windMultiplier: 1.0 → 1.3 → 2.5 (cloudy = mild breeze, rainy = strong)
    this.windMultiplier = w <= 1 ? 1 + w * 0.3 : 1.3 + (w - 1) * 1.2;

    // fogMultiplier: 1.0 → 0.65 → 0.6 (cloudy close to rainy)
    this.fogMultiplier = w <= 1 ? 1 - w * 0.35 : 0.65 - (w - 1) * 0.05;

    // rainIntensity: 0 until w > 1, then 0→1
    this.rainIntensity = w <= 1 ? 0 : clamp01(w - 1);

    // lightDimming: 0 → 0.35 → 0.5 (cloudy noticeably dim, rainy darker)
    this.lightDimming = w <= 1 ? w * 0.35 : 0.35 + (w - 1) * 0.15;

    // skyDarkening: 0 → 0.35 → 0.5 (cloudy dark sky, rainy darker)
    this.skyDarkening = w <= 1 ? w * 0.35 : 0.35 + (w - 1) * 0.15;

    // starDimming: 0 → 1.0 → 1.0 (clouds fully hide stars/moon even at cloudy)
    this.starDimming = Math.min(1, w);

    // waveAmplitude: 1.0 → 1.15 → 1.8 (cloudy = gentle chop, rainy = rough)
    this.waveAmplitude = w <= 1 ? 1 + w * 0.15 : 1.15 + (w - 1) * 0.65;
  }

  _updateGroundWetness(delta) {
    // Wets during rain, dries after
    if (this.rainIntensity > 0.05) {
      this.groundWetness = Math.min(1, this.groundWetness + CONFIG.WETNESS_WET_RATE * delta * this.rainIntensity * 120);
    } else {
      this.groundWetness = Math.max(0, this.groundWetness - CONFIG.WETNESS_DRY_RATE * delta * 120);
    }
  }

  // ======== State machine ========

  _updateStateMachine(delta) {
    if (this.locked) return;

    // Ramp toward target
    if (Math.abs(this.weatherIntensity - this.targetIntensity) > 0.001) {
      const dir = this.targetIntensity > this.weatherIntensity ? 1 : -1;
      this.weatherIntensity += dir * CONFIG.WEATHER_TRANSITION_RATE * delta * 120;
      // Clamp to not overshoot
      if (dir > 0 && this.weatherIntensity > this.targetIntensity) {
        this.weatherIntensity = this.targetIntensity;
      } else if (dir < 0 && this.weatherIntensity < this.targetIntensity) {
        this.weatherIntensity = this.targetIntensity;
      }
    } else {
      // Holding at target — count down
      this.holdTimer += delta;
      if (this.holdTimer >= this.holdDuration) {
        this.holdTimer = 0;
        this.holdDuration = CONFIG.WEATHER_HOLD_MIN +
          Math.random() * (CONFIG.WEATHER_HOLD_MAX - CONFIG.WEATHER_HOLD_MIN);
        // Pick new random target: 0, 1, or 2
        const targets = [0, 1, 2];
        // Don't pick the same target
        const current = Math.round(this.targetIntensity);
        const filtered = targets.filter(t => t !== current);
        this.targetIntensity = filtered[Math.floor(Math.random() * filtered.length)];
      }
    }
  }

  // ======== Main update ========

  /**
   * Call each frame.
   * @param {number} delta - frame delta time
   * @param {number} sunElevation - from day-night system
   * @param {THREE.Vector3} playerPos - player world position
   * @param {THREE.Vector2|null} windDir - wind XZ direction
   */
  update(delta, sunElevation, playerPos, windDir) {
    this._updateStateMachine(delta);
    this._updateDerivedParams();
    this._updateGroundWetness(delta);
    this._updateRainParticles(delta, playerPos, windDir);
    this._updateLightning(delta);
  }

  /**
   * Update rain audio. Call each frame after audio context is available.
   * @param {AudioContext} ctx
   * @param {GainNode} masterGain
   * @param {AudioBuffer} noiseBuffer
   * @param {GainNode} [spatialBus] - spatial audio bus for 3D drips
   * @param {THREE.Vector3} [playerPos] - for drip positioning
   * @param {number} [delta] - frame delta for drip scheduling
   */
  updateAudio(ctx, masterGain, noiseBuffer, spatialBus, playerPos, delta) {
    if (!ctx) return;

    // Store refs for thunder + drips
    this._audioCtx = ctx;
    this._masterGain = masterGain;
    this._noiseBuffer = noiseBuffer;
    this._spatialBus = spatialBus || null;
    this._playerPos = playerPos || null;

    if (this.rainIntensity > 0.01) {
      if (!this._rainAudioActive) {
        this._startRainAudio(ctx, masterGain, noiseBuffer);
      }
      this._updateRainAudioGains();
      // Spatial drips
      if (delta) this._updateSpatialDrips(delta);
    } else if (this._rainAudioActive) {
      this._stopRainAudio();
    }
  }

  /**
   * Set weather to a specific target intensity. Overrides auto-cycling.
   * @param {number} intensity - 0 (sunny), 1 (cloudy), 2 (rainy)
   */
  setTarget(intensity) {
    this.targetIntensity = Math.max(0, Math.min(2, intensity));
    this.holdTimer = 0;
    this.locked = false; // allow it to arrive then hold
  }

  /**
   * Cycle weather: sunny → cloudy → rainy → sunny
   */
  cycleForward() {
    const current = Math.round(this.targetIntensity);
    this.setTarget((current + 1) % 3);
  }

  /**
   * Cycle weather backward: rainy → cloudy → sunny → rainy
   */
  cycleBackward() {
    const current = Math.round(this.targetIntensity);
    this.setTarget((current + 2) % 3);
  }

  /**
   * Get weather state name for display.
   */
  getStateName() {
    const t = this.targetIntensity;
    if (t < 0.5) return 'Sunny';
    if (t < 1.5) return 'Cloudy';
    return 'Rainy';
  }

  /**
   * Get current weather state name (actual, not target).
   */
  getCurrentStateName() {
    if (this.weatherIntensity < 0.3) return 'Sunny';
    if (this.weatherIntensity < 1.3) return 'Cloudy';
    return 'Rainy';
  }

  dispose() {
    this._stopRainAudio();
    if (this._rainMesh) {
      this.scene.remove(this._rainMesh);
      this._rainMesh.geometry.dispose();
      this._rainMesh.material.dispose();
    }
  }
}
