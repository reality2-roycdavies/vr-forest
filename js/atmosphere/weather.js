// Weather system — single intensity float drives sunny/cloudy/rainy states
// weatherIntensity: 0.0 (sunny) → 1.0 (cloudy) → 2.0 (rainy)
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { getTreeDensity } from '../terrain/noise.js';

const _stormColor = new THREE.Color(CONFIG.WEATHER_STORM_CLOUD_COLOR);

// Cache URL param once
const _weatherParam = new URLSearchParams(window.location.search).get('weather');
const _weatherLock = _weatherParam !== null ? _parseWeatherParam(_weatherParam) : null;

// Shelter grid — tracks canopy coverage over rain cylinder
const SHELTER_RES = 16;
const SHELTER_SIZE = CONFIG.RAIN_RADIUS * 2;
const _shelterGrid = new Float32Array(SHELTER_RES * SHELTER_RES);
let _shelterCX = Infinity, _shelterCZ = Infinity;

function _parseWeatherParam(val) {
  const named = { sunny: 0, clear: 0, cloudy: 1, overcast: 1, rainy: 2, rain: 2, storm: 2, stormy: 2 };
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

    // --- Canopy shelter ---
    this._shelterFactor = 0; // 0 = open sky, 1 = fully sheltered

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
        uSnowBlend: { value: 0.0 },
        uStormIntensity: { value: 0.0 },
      },
      vertexShader: `
        attribute float aOpacity;
        uniform float uSnowBlend;
        uniform float uStormIntensity;
        varying float vOpacity;
        varying float vDepth;
        varying float vSnow;
        varying float vStorm;
        void main() {
          vOpacity = aOpacity;
          vSnow = uSnowBlend;
          vStorm = uStormIntensity;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mvPos.z;
          // Rain: tall thin streaks; Snow: soft dots, bigger in storms
          float rainSize = clamp(90.0 / max(1.0, -mvPos.z), 2.0, 45.0);
          float snowBase = 40.0 + uStormIntensity * 30.0;
          float snowMax = 18.0 + uStormIntensity * 14.0;
          float snowSize = clamp(snowBase / max(1.0, -mvPos.z), 1.5, snowMax);
          gl_PointSize = mix(rainSize, snowSize, uSnowBlend);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vOpacity;
        varying float vDepth;
        varying float vSnow;
        varying float vStorm;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          // Rain: thin vertical streak (x*80, y*0.8)
          // Snow: round soft dot (x*6, y*6)
          float xSq = c.x * c.x * mix(80.0, 6.0, vSnow);
          float ySq = c.y * c.y * mix(0.8, 6.0, vSnow);
          float dist = xSq + ySq;
          if (dist > 1.0) discard;
          // Snow: softer falloff for fluffy look
          float core = exp(-dist * mix(3.0, 1.5, vSnow));
          // Distance fade — see further in blizzard
          float farPlane = mix(22.0, 30.0, vStorm * vSnow);
          float distFade = 1.0 - smoothstep(8.0, farPlane, vDepth);
          // Snow more opaque in storms
          float snowAlpha = mix(0.5, 0.85, vStorm);
          float alpha = core * vOpacity * distFade * mix(0.7, snowAlpha, vSnow);
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

  _updateShelterGrid(playerX, playerZ) {
    const dx = playerX - _shelterCX;
    const dz = playerZ - _shelterCZ;
    if (dx * dx + dz * dz < 9) return; // <3m movement
    _shelterCX = playerX;
    _shelterCZ = playerZ;

    const terrainY = this._playerTerrainY || 0;
    if (terrainY > CONFIG.TREELINE_START) {
      _shelterGrid.fill(0);
      this._shelterFactor = 0;
      return;
    }

    const cellSize = SHELTER_SIZE / SHELTER_RES;
    for (let gz = 0; gz < SHELTER_RES; gz++) {
      for (let gx = 0; gx < SHELTER_RES; gx++) {
        const wx = playerX + (gx + 0.5 - SHELTER_RES * 0.5) * cellSize;
        const wz = playerZ + (gz + 0.5 - SHELTER_RES * 0.5) * cellSize;
        _shelterGrid[gz * SHELTER_RES + gx] =
          getTreeDensity(wx, wz) > 0.3 ? 1.0 : 0.0;
      }
    }

    // Player shelter factor: sample center cell
    const mid = SHELTER_RES >> 1;
    this._shelterFactor = _shelterGrid[mid * SHELTER_RES + mid];
  }

  _updateRainParticles(delta, playerPos, windDir) {
    // Snow zone: blend rain→snow based on altitude
    const snowStart = CONFIG.SNOWLINE_START;
    const treelineY = CONFIG.TREELINE_START;
    const terrainY = this._playerTerrainY || 0;
    // snowBlend: 0 at treeline, 1 at snowline (fully snow)
    const snowBlend = clamp01((terrainY - treelineY) / (snowStart - treelineY));

    // Light gentle snow at altitude during cloudy weather (even without rain)
    const altitudeSnow = snowBlend * clamp01(this.cloudDensity) * 0.15;
    const effectivePrecip = Math.max(this.rainIntensity, altitudeSnow);

    const shouldShow = effectivePrecip > 0.01;
    this._rainMesh.visible = shouldShow;
    if (!shouldShow) return;

    this._updateShelterGrid(playerPos.x, playerPos.z);

    const count = CONFIG.RAIN_PARTICLE_COUNT;
    // More particles in snow zone — blizzard at altitude during storms
    const stormFactor = clamp01(this.rainIntensity);
    const snowBoost = 1 + snowBlend * (3.0 + stormFactor * 3.0);
    const activeCount = Math.min(count, Math.floor(count * effectivePrecip * snowBoost));
    const radius = CONFIG.RAIN_RADIUS;
    const height = CONFIG.RAIN_HEIGHT;
    const positions = this._rainPositions;
    const opacities = this._rainOpacities;
    const speeds = this._rainSpeeds;

    // Wind sideways push — much stronger in snow storms (blizzard gusts)
    const windScale = lerp(1.0, 4.0 + stormFactor * 6.0, snowBlend);
    const windX = windDir ? windDir.x * CONFIG.RAIN_WIND_INFLUENCE * this.windMultiplier * windScale : 0;
    const windZ = windDir ? windDir.y * CONFIG.RAIN_WIND_INFLUENCE * this.windMultiplier * windScale : 0;

    // Snow falls slower — gentle in cloudy, driven harder and more horizontal in storms
    const stormSpeed = lerp(0.12, 0.4, stormFactor);
    const speedScale = lerp(1.0, stormSpeed, snowBlend);

    // Time-based swirl — turbulent vortex motion in blizzards
    if (!this._swirlTime) this._swirlTime = 0;
    this._swirlTime += delta;
    const swirlT = this._swirlTime;
    const swirlStrength = snowBlend * stormFactor * 3.5;

    for (let i = 0; i < count; i++) {
      if (i >= activeCount) {
        opacities[i] = 0;
        continue;
      }

      // First activation: set opacity for particles transitioning from inactive
      if (opacities[i] === 0) {
        opacities[i] = 0.5 + Math.random() * 0.5;
      }

      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      // Swirling vortex: each particle gets unique phase from index + position
      const phase = i * 1.37 + py * 0.3;
      const swirlX = Math.sin(swirlT * 1.7 + phase) * swirlStrength;
      const swirlZ = Math.cos(swirlT * 1.3 + phase * 0.8) * swirlStrength;
      // Secondary smaller swirl for turbulence
      const turbX = Math.sin(swirlT * 3.1 + i * 0.53) * swirlStrength * 0.4;
      const turbZ = Math.cos(swirlT * 2.7 + i * 0.71) * swirlStrength * 0.4;

      // Canopy shelter check
      const gx = Math.floor((px / SHELTER_SIZE + 0.5) * SHELTER_RES);
      const gz = Math.floor((pz / SHELTER_SIZE + 0.5) * SHELTER_RES);
      const sheltered = (gx >= 0 && gx < SHELTER_RES && gz >= 0 && gz < SHELTER_RES)
        ? _shelterGrid[gz * SHELTER_RES + gx] > 0 : false;

      if (sheltered && snowBlend < 0.1) {
        const dripCycle = Math.floor(swirlT * 0.5);
        const isDrip = ((i * 7 + dripCycle) % 13) === 0;
        if (isDrip) {
          // Drip: fall straight down, slower
          positions[i * 3 + 1] -= speeds[i] * speedScale * 0.3 * delta;
        } else {
          // Hidden under canopy: fall invisibly to recycle to clearings
          opacities[i] = 0;
          positions[i * 3 + 1] -= speeds[i] * speedScale * delta;
        }
      } else {
        // Normal movement — wind + swirl
        positions[i * 3] += (windX + swirlX + turbX + snowBlend * Math.sin(py * 0.4 + i * 0.7) * 0.5) * delta;
        positions[i * 3 + 1] -= speeds[i] * speedScale * delta;
        positions[i * 3 + 2] += (windZ + swirlZ + turbZ + snowBlend * Math.cos(py * 0.5 + i * 1.1) * 0.5) * delta;
      }

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
        opacities[i] = 0.5 + Math.random() * 0.5;
      }
    }

    // Particle color: rain blue-grey → snow white; shape: streaks → soft dots
    const mat = this._rainMesh.material;
    const rc = mat.uniforms.uColor.value;
    rc.r = lerp(0.7, 1.0, snowBlend);
    rc.g = lerp(0.75, 1.0, snowBlend);
    rc.b = lerp(0.85, 1.0, snowBlend);
    mat.uniforms.uSnowBlend.value = snowBlend;
    mat.uniforms.uStormIntensity.value = stormFactor;

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

    if (this.rainIntensity < 0.1 || (this._playerTerrainY || 0) >= CONFIG.SNOWLINE_START) {
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

    // Mid-frequency body layer — fills gap between wash and patter
    this._bodySource = ctx.createBufferSource();
    this._bodySource.buffer = noiseBuffer;
    this._bodySource.loop = true;
    this._bodySource.playbackRate.value = 0.9;

    this._bodyFilter = ctx.createBiquadFilter();
    this._bodyFilter.type = 'bandpass';
    this._bodyFilter.frequency.value = 1600;
    this._bodyFilter.Q.value = 0.5;

    this._bodyGain = ctx.createGain();
    this._bodyGain.gain.value = 0;

    // Slow amplitude modulation — gusting rain variation
    this._bodyLFO = ctx.createOscillator();
    this._bodyLFO.type = 'sine';
    this._bodyLFO.frequency.value = 0.15; // ~7 second cycle
    this._bodyLFOGain = ctx.createGain();
    this._bodyLFOGain.gain.value = 0; // modulation depth set in update

    this._bodySource.connect(this._bodyFilter);
    this._bodyFilter.connect(this._bodyGain);
    this._bodyLFO.connect(this._bodyLFOGain);
    this._bodyLFOGain.connect(this._bodyGain.gain);
    this._bodyGain.connect(masterGain);
    this._bodySource.start();
    this._bodyLFO.start();

    // High sizzle layer — rain hitting surfaces, leaves
    this._sizzleSource = ctx.createBufferSource();
    this._sizzleSource.buffer = noiseBuffer;
    this._sizzleSource.loop = true;
    this._sizzleSource.playbackRate.value = 1.8;

    this._sizzleFilter = ctx.createBiquadFilter();
    this._sizzleFilter.type = 'highpass';
    this._sizzleFilter.frequency.value = 6000;
    this._sizzleFilter.Q.value = 0.3;

    this._sizzleGain = ctx.createGain();
    this._sizzleGain.gain.value = 0;

    // Second LFO for sizzle — different rate for independent variation
    this._sizzleLFO = ctx.createOscillator();
    this._sizzleLFO.type = 'sine';
    this._sizzleLFO.frequency.value = 0.22; // ~4.5 second cycle
    this._sizzleLFOGain = ctx.createGain();
    this._sizzleLFOGain.gain.value = 0;

    this._sizzleSource.connect(this._sizzleFilter);
    this._sizzleFilter.connect(this._sizzleGain);
    this._sizzleLFO.connect(this._sizzleLFOGain);
    this._sizzleLFOGain.connect(this._sizzleGain.gain);
    this._sizzleGain.connect(masterGain);
    this._sizzleSource.start();
    this._sizzleLFO.start();
  }

  _stopRainAudio() {
    if (!this._rainAudioActive) return;
    this._rainAudioActive = false;
    try { this._patterSource?.stop(); } catch (e) { /* */ }
    try { this._washSource?.stop(); } catch (e) { /* */ }
    try { this._bodySource?.stop(); } catch (e) { /* */ }
    try { this._bodyLFO?.stop(); } catch (e) { /* */ }
    try { this._sizzleSource?.stop(); } catch (e) { /* */ }
    try { this._sizzleLFO?.stop(); } catch (e) { /* */ }
    this._patterSource = null;
    this._patterGain = null;
    this._patterFilter = null;
    this._washSource = null;
    this._washGain = null;
    this._washFilter = null;
    this._bodySource = null;
    this._bodyGain = null;
    this._bodyFilter = null;
    this._bodyLFO = null;
    this._bodyLFOGain = null;
    this._sizzleSource = null;
    this._sizzleGain = null;
    this._sizzleFilter = null;
    this._sizzleLFO = null;
    this._sizzleLFOGain = null;
  }

  _updateRainAudioGains() {
    if (!this._rainAudioActive) return;
    const ri = this.rainIntensity;

    // Fade rain audio to silence at altitude (snow zone = quiet)
    const terrainY = this._playerTerrainY || 0;
    const treelineY = CONFIG.TREELINE_START;
    const snowStart = CONFIG.SNOWLINE_START;
    const altFade = 1 - clamp01((terrainY - treelineY) / (snowStart - treelineY));

    // Slight dampen under canopy (shelter 1.0 → 0.65 volume)
    const canopyDampen = 1 - this._shelterFactor * 0.35;

    // Patter: linear scale
    if (this._patterGain) {
      this._patterGain.gain.value = ri * 0.12 * altFade * canopyDampen;
    }
    // Wash: quadratic scale — louder in heavy rain
    if (this._washGain) {
      this._washGain.gain.value = ri * ri * 0.15 * altFade * canopyDampen;
    }
    // Body: fills the midrange, with slow gusting modulation
    if (this._bodyGain) {
      this._bodyGain.gain.value = ri * 0.08 * altFade * canopyDampen;
      this._bodyLFOGain.gain.value = ri * 0.03 * altFade * canopyDampen;
    }
    // Sizzle: high-freq surface detail, grows with intensity
    if (this._sizzleGain) {
      this._sizzleGain.gain.value = ri * ri * 0.05 * altFade * canopyDampen;
      this._sizzleLFOGain.gain.value = ri * 0.02 * altFade * canopyDampen;
    }
  }

  _updateSpatialDrips(delta) {
    if (!this._audioCtx || !this._noiseBuffer || !this._playerPos || !this._spatialBus) return;
    if (this.rainIntensity < 0.1) return;

    // Suppress drips at altitude (snow zone — no rain hitting surfaces)
    const terrainY = this._playerTerrainY || 0;
    const altFade = 1 - clamp01((terrainY - CONFIG.TREELINE_START) / (CONFIG.SNOWLINE_START - CONFIG.TREELINE_START));
    if (altFade < 0.05) return;

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
    // Reuse convolver node when possible (disconnect previous routing)
    if (!this._convolver || this._convolver.context !== ctx) {
      this._convolver = ctx.createConvolver();
      this._convolver.buffer = this._reverbIR;
    }
    const convolver = this._convolver;

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
    let fogMul = w <= 1 ? 1 - w * 0.35 : 0.65 - (w - 1) * 0.05;
    // Reduce visibility further in snow zone — whiteout in blizzards
    const terrainY = this._playerTerrainY || 0;
    const snowBlend = clamp01((terrainY - CONFIG.TREELINE_START) / (CONFIG.SNOWLINE_START - CONFIG.TREELINE_START));
    if (snowBlend > 0) {
      const snowFog = snowBlend * (0.15 + clamp01(w - 1) * 0.25); // cloudy: mild, stormy: heavy
      fogMul *= (1 - snowFog);
    }
    this.fogMultiplier = fogMul;

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
  update(delta, sunElevation, playerPos, windDir, terrainHeight) {
    this._playerTerrainY = terrainHeight || 0;
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
   * Uses a longer hold duration so manual selection persists before auto-cycling resumes.
   * @param {number} intensity - 0 (sunny), 1 (cloudy), 2 (rainy)
   */
  setTarget(intensity) {
    this.targetIntensity = Math.max(0, Math.min(2, intensity));
    this.holdTimer = 0;
    // Hold longer after manual selection (5-8 min) so it feels intentional
    this.holdDuration = CONFIG.WEATHER_HOLD_MAX + 60 +
      Math.random() * (CONFIG.WEATHER_HOLD_MAX - CONFIG.WEATHER_HOLD_MIN);
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
    if (t < 0.5) return 'Clear';
    if (t < 1.5) return 'Cloudy';
    return 'Stormy';
  }

  /**
   * Get current weather state name (actual, not target).
   */
  getCurrentStateName() {
    if (this.weatherIntensity < 0.3) return 'Clear';
    if (this.weatherIntensity < 1.3) return 'Cloudy';
    return 'Stormy';
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
