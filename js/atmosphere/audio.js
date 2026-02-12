// Procedural ambient audio — wind, birds, animal growls, footsteps, crickets, rustling leaves
// Spatial audio via Web Audio API PannerNodes
import { CONFIG } from '../config.js';

export class AmbientAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.masterGain = null;

    // Bird scheduling
    this.birdTimer = 0;
    this.nextBirdTime = 2;

    // Wind nodes
    this.windGain = null;
    this.windFilter = null;

    // Shared noise buffer (reused by footsteps and rustles)
    this._noiseBuffer = null;

    // Spatial audio
    this.spatialBus = null;
    this.listener = null;

    // Footstep state
    this._lastBobSign = 0;

    // Cricket state
    this._cricketVoices = [];
    this._cricketActive = false;
    this._cricketGain = null;

    // Rustle state
    this._activeRustles = 0;
    this._rustleCooldown = 0;

    // Water ambient state
    this._waterActive = false;
    this._waterGain = null;
    this._waterSource = null;
    this._waterFilter = null;
    this._waterShimmerSource = null;
    this._waterShimmerGain = null;
    this._waterShimmerFilter = null;
    this._waterModTimeout = null;
    this._waterShimmerModTimeout = null;

    // Morepork (NZ owl) — nighttime call-and-response conversation
    this._moreporkBuffer = null;
    this._moreporkConvo = null;       // active conversation state
    this._moreporkPauseTimer = 0;     // timer between conversations
    this._moreporkNextPause = 20 + Math.random() * 40;
  }

  /**
   * Initialize audio context and start ambient sounds.
   * Must be called from a user gesture (click/VR session start).
   */
  start() {
    if (this.started) return;
    this.started = true;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = CONFIG.AMBIENT_VOLUME;
    this.masterGain.connect(this.ctx.destination);

    // Spatial bus for all positioned sounds
    this.spatialBus = this.ctx.createGain();
    this.spatialBus.gain.value = 1.0;
    this.spatialBus.connect(this.masterGain);

    // Listener reference
    this.listener = this.ctx.listener;

    // Create shared noise buffer (2 seconds)
    this._createNoiseBuffer();

    this._startWind();
    this._loadMorepork();
  }

  /**
   * Call each frame with extended parameters for all audio subsystems.
   */
  update(delta, sunElevation, playerPos, cameraDir, isMoving, groundType, bobPhase, nearbyTrees, waterProximity) {
    if (!this.started || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // Bird chirps — daytime only
    if (sunElevation === undefined || sunElevation > 0.02) {
      this.birdTimer += delta;
      if (this.birdTimer > this.nextBirdTime) {
        this.birdTimer = 0;
        this.nextBirdTime = 1.5 + Math.random() * 6;
        this._chirp();
      }
    }

    // Update listener position/orientation for spatial audio
    if (playerPos && cameraDir) {
      this._updateListener(playerPos, cameraDir);
    }

    // Footsteps
    if (bobPhase !== undefined) {
      this._updateFootsteps(isMoving, groundType, bobPhase);
    }

    // Crickets
    if (sunElevation !== undefined) {
      this._updateCrickets(sunElevation);
    }

    // Morepork — nighttime owl call-and-response
    if (sunElevation !== undefined && sunElevation < -0.03) {
      this._updateMoreporkConversation(delta, playerPos);
    } else {
      this._moreporkConvo = null;
      this._moreporkPauseTimer = 0;
    }

    // Water ambient
    if (waterProximity !== undefined) {
      this._updateWaterAmbient(waterProximity);
    }

    // Rustling leaves — disabled, synthetic noise doesn't convincingly replicate leaves
    // if (nearbyTrees && playerPos) {
    //   this._rustleCooldown = Math.max(0, this._rustleCooldown - delta);
    //   this._updateRustles(playerPos, nearbyTrees);
    // }
  }

  // ======== Shared noise buffer ========

  _createNoiseBuffer() {
    const ctx = this.ctx;
    const bufferSize = ctx.sampleRate * 2;
    this._noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = this._noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  // ======== Listener position/orientation ========

  _updateListener(playerPos, cameraDir) {
    const l = this.listener;
    if (l.positionX) {
      // Modern API
      l.positionX.value = playerPos.x;
      l.positionY.value = playerPos.y;
      l.positionZ.value = playerPos.z;
      l.forwardX.value = cameraDir.x;
      l.forwardY.value = cameraDir.y;
      l.forwardZ.value = cameraDir.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      // Legacy API
      l.setPosition(playerPos.x, playerPos.y, playerPos.z);
      l.setOrientation(cameraDir.x, cameraDir.y, cameraDir.z, 0, 1, 0);
    }
  }

  // ======== Spatial panner helper ========

  _createPanner(position) {
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = CONFIG.SPATIAL_REF_DISTANCE;
    panner.maxDistance = CONFIG.SPATIAL_MAX_DISTANCE;
    panner.rolloffFactor = CONFIG.SPATIAL_ROLLOFF;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    return panner;
  }

  // ======== Wind — filtered noise with slow modulation ========

  _startWind() {
    const ctx = this.ctx;

    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;
    noise.loop = true;

    // Bandpass filter for wind character
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.5;

    // Wind volume
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.07;

    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    noise.start();

    // Slow modulation of wind intensity
    this._modulateWind();
  }

  _modulateWind() {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 3 + Math.random() * 5;
    const duck = this._windDuck !== undefined ? this._windDuck : 1;
    const targetGain = (0.03 + Math.random() * 0.08) * duck;
    const targetFreq = 250 + Math.random() * 400;

    this.windGain.gain.linearRampToValueAtTime(targetGain, now + duration);
    this.windFilter.frequency.linearRampToValueAtTime(targetFreq, now + duration);

    setTimeout(() => this._modulateWind(), duration * 1000);
  }

  // ======== Bird chirps — short oscillator sweeps ========

  _chirp() {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Random bird type
    const type = Math.floor(Math.random() * 3);

    if (type === 0) {
      // Simple tweet — quick rising sweep
      this._singleTweet(now, 2000 + Math.random() * 1500, 0.06 + Math.random() * 0.03);
    } else if (type === 1) {
      // Double chirp
      this._singleTweet(now, 2500 + Math.random() * 1000, 0.05);
      this._singleTweet(now + 0.15, 2800 + Math.random() * 800, 0.05);
    } else {
      // Warbling trill — several rapid notes
      const baseFreq = 1800 + Math.random() * 1200;
      const count = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        this._singleTweet(
          now + i * 0.1,
          baseFreq + Math.sin(i * 1.5) * 400,
          0.03 + Math.random() * 0.02
        );
      }
    }
  }

  _singleTweet(startTime, freq, volume) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.8, startTime);
    osc.frequency.linearRampToValueAtTime(freq * 1.2, startTime + 0.06);
    osc.frequency.linearRampToValueAtTime(freq * 0.9, startTime + 0.12);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.015);
    gain.gain.linearRampToValueAtTime(volume * 0.6, startTime + 0.06);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(startTime);
    osc.stop(startTime + 0.15);
  }

  // ======== Footsteps — synced to walk bob zero-crossings ========

  _updateFootsteps(isMoving, groundType, bobPhase) {
    if (!isMoving) {
      this._lastBobSign = 0;
      return;
    }

    const bobValue = Math.sin(bobPhase * Math.PI * 2);
    const currentSign = bobValue >= 0 ? 1 : -1;

    // Detect negative→positive zero-crossing only (one step per bob cycle)
    if (this._lastBobSign === -1 && currentSign === 1) {
      this._playFootstep(groundType);
    }
    this._lastBobSign = currentSign;
  }

  _playFootstep(groundType) {
    if (groundType === 'water') {
      this._waterStep();
    } else if (groundType === 'rock') {
      this._rockStep();
    } else {
      this._grassStep();
    }
  }

  _grassStep() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const variation = 1 + (Math.random() - 0.5) * CONFIG.FOOTSTEP_PITCH_VARIATION * 2;
    const vol = CONFIG.FOOTSTEP_VOLUME;
    const toeDelay = 0.055 + Math.random() * 0.02;

    // Heel strike — deeper, heavier thump
    const heel = ctx.createOscillator();
    heel.type = 'sine';
    heel.frequency.setValueAtTime(80 * variation, now);
    heel.frequency.exponentialRampToValueAtTime(30, now + 0.07);

    const heelGain = ctx.createGain();
    heelGain.gain.setValueAtTime(vol * 1.8, now);
    heelGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    heel.connect(heelGain);
    heelGain.connect(this.masterGain);
    heel.start(now);
    heel.stop(now + 0.11);

    // Toe tap — lighter, higher, slightly delayed
    const toe = ctx.createOscillator();
    toe.type = 'sine';
    toe.frequency.setValueAtTime(140 * variation, now + toeDelay);
    toe.frequency.exponentialRampToValueAtTime(50, now + toeDelay + 0.05);

    const toeGain = ctx.createGain();
    toeGain.gain.setValueAtTime(0, now);
    toeGain.gain.setValueAtTime(vol * 0.9, now + toeDelay);
    toeGain.gain.exponentialRampToValueAtTime(0.001, now + toeDelay + 0.07);

    toe.connect(toeGain);
    toeGain.connect(this.masterGain);
    toe.start(now + toeDelay);
    toe.stop(now + toeDelay + 0.08);

    // Faint grass texture on the toe
    const swish = ctx.createBufferSource();
    swish.buffer = this._noiseBuffer;
    swish.playbackRate.value = 0.5 + Math.random() * 0.3;

    const swishFilter = ctx.createBiquadFilter();
    swishFilter.type = 'bandpass';
    swishFilter.frequency.value = 900 * variation;
    swishFilter.Q.value = 0.4;

    const swishGain = ctx.createGain();
    swishGain.gain.setValueAtTime(0, now + toeDelay);
    swishGain.gain.linearRampToValueAtTime(vol * 0.3, now + toeDelay + 0.01);
    swishGain.gain.exponentialRampToValueAtTime(0.001, now + toeDelay + 0.08);

    swish.connect(swishFilter);
    swishFilter.connect(swishGain);
    swishGain.connect(this.masterGain);
    swish.start(now + toeDelay);
    swish.stop(now + toeDelay + 0.09);
  }

  _rockStep() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const variation = 1 + (Math.random() - 0.5) * CONFIG.FOOTSTEP_PITCH_VARIATION * 2;
    const vol = CONFIG.FOOTSTEP_VOLUME;
    const toeDelay = 0.045 + Math.random() * 0.015;

    // Heel strike — hard, sharp impact
    const heel = ctx.createOscillator();
    heel.type = 'sine';
    heel.frequency.setValueAtTime(160 * variation, now);
    heel.frequency.exponentialRampToValueAtTime(55, now + 0.04);

    const heelGain = ctx.createGain();
    heelGain.gain.setValueAtTime(vol * 1.5, now);
    heelGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    heel.connect(heelGain);
    heelGain.connect(this.masterGain);
    heel.start(now);
    heel.stop(now + 0.08);

    // Toe tap — higher click, snappier
    const toe = ctx.createOscillator();
    toe.type = 'triangle';
    toe.frequency.setValueAtTime(280 * variation, now + toeDelay);
    toe.frequency.exponentialRampToValueAtTime(90, now + toeDelay + 0.03);

    const toeGain = ctx.createGain();
    toeGain.gain.setValueAtTime(0, now);
    toeGain.gain.setValueAtTime(vol * 1.0, now + toeDelay);
    toeGain.gain.exponentialRampToValueAtTime(0.001, now + toeDelay + 0.05);

    toe.connect(toeGain);
    toeGain.connect(this.masterGain);
    toe.start(now + toeDelay);
    toe.stop(now + toeDelay + 0.06);
  }

  _waterStep() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const variation = 1 + (Math.random() - 0.5) * CONFIG.FOOTSTEP_PITCH_VARIATION * 2;
    const vol = CONFIG.FOOTSTEP_VOLUME;

    // 1. Primary slosh — bandpass noise in the watery mid range, no low-end
    const slosh = ctx.createBufferSource();
    slosh.buffer = this._noiseBuffer;
    slosh.playbackRate.value = 0.6 + Math.random() * 0.3;

    const sloshBP = ctx.createBiquadFilter();
    sloshBP.type = 'bandpass';
    sloshBP.frequency.setValueAtTime(900 * variation, now);
    sloshBP.frequency.exponentialRampToValueAtTime(400, now + 0.4);
    sloshBP.Q.value = 0.8;

    // Cut the low end that causes drumming
    const sloshHP = ctx.createBiquadFilter();
    sloshHP.type = 'highpass';
    sloshHP.frequency.value = 250;

    const sloshGain = ctx.createGain();
    sloshGain.gain.setValueAtTime(0, now);
    sloshGain.gain.setTargetAtTime(vol * 2.5, now, 0.035);
    sloshGain.gain.setTargetAtTime(0, now + 0.12, 0.1);

    slosh.connect(sloshHP);
    sloshHP.connect(sloshBP);
    sloshBP.connect(sloshGain);
    sloshGain.connect(this.masterGain);
    slosh.start(now);
    slosh.stop(now + 0.6);

    // 2. Return slosh — delayed, slightly higher band, water settling
    const ret = ctx.createBufferSource();
    ret.buffer = this._noiseBuffer;
    ret.playbackRate.value = 0.7 + Math.random() * 0.3;

    const retBP = ctx.createBiquadFilter();
    retBP.type = 'bandpass';
    retBP.frequency.setValueAtTime(700 * variation, now + 0.1);
    retBP.frequency.exponentialRampToValueAtTime(350, now + 0.5);
    retBP.Q.value = 0.7;

    const retHP = ctx.createBiquadFilter();
    retHP.type = 'highpass';
    retHP.frequency.value = 250;

    const retGain = ctx.createGain();
    retGain.gain.setValueAtTime(0, now);
    retGain.gain.setTargetAtTime(vol * 1.8, now + 0.1, 0.04);
    retGain.gain.setTargetAtTime(0, now + 0.22, 0.09);

    ret.connect(retHP);
    retHP.connect(retBP);
    retBP.connect(retGain);
    retGain.connect(this.masterGain);
    ret.start(now + 0.08);
    ret.stop(now + 0.65);

    // 3. Droplet spray — higher frequency splash detail
    const spray = ctx.createBufferSource();
    spray.buffer = this._noiseBuffer;
    spray.playbackRate.value = 1.0 + Math.random() * 0.5;

    const sprayBP = ctx.createBiquadFilter();
    sprayBP.type = 'bandpass';
    sprayBP.frequency.value = 2200 * variation;
    sprayBP.Q.value = 0.5;

    const sprayGain = ctx.createGain();
    sprayGain.gain.setValueAtTime(0, now);
    sprayGain.gain.setTargetAtTime(vol * 0.5, now + 0.05, 0.025);
    sprayGain.gain.setTargetAtTime(0, now + 0.15, 0.06);

    spray.connect(sprayBP);
    sprayBP.connect(sprayGain);
    sprayGain.connect(this.masterGain);
    spray.start(now + 0.03);
    spray.stop(now + 0.5);
  }

  // ======== Crickets — night ambient, 4 sine voices with chirp bursts ========

  _updateCrickets(sunElevation) {
    const shouldBeActive = sunElevation < CONFIG.CRICKET_SUN_FADE_IN;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (shouldBeActive && !this._cricketActive) {
      // Start crickets
      this._cricketActive = true;
      this._cricketGain = ctx.createGain();
      this._cricketGain.gain.setValueAtTime(0, now);
      this._cricketGain.gain.linearRampToValueAtTime(CONFIG.CRICKET_VOLUME, now + 3);
      this._cricketGain.connect(this.masterGain);

      for (let i = 0; i < CONFIG.CRICKET_VOICES; i++) {
        const freq = CONFIG.CRICKET_FREQ_MIN +
          (CONFIG.CRICKET_FREQ_MAX - CONFIG.CRICKET_FREQ_MIN) * (i / (CONFIG.CRICKET_VOICES - 1));
        this._startCricketVoice(freq + (Math.random() - 0.5) * 200, i);
      }
    } else if (!shouldBeActive && this._cricketActive) {
      // Stop crickets
      this._cricketActive = false;
      if (this._cricketGain) {
        this._cricketGain.gain.linearRampToValueAtTime(0, now + 3);
      }
      // Schedule cleanup
      setTimeout(() => {
        for (const voice of this._cricketVoices) {
          try { voice.osc.stop(); } catch (e) { /* already stopped */ }
        }
        this._cricketVoices = [];
        this._cricketGain = null;
      }, 3500);
    }
  }

  _startCricketVoice(freq, index) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;

    osc.connect(voiceGain);
    voiceGain.connect(this._cricketGain);
    osc.start();

    const voice = { osc, gain: voiceGain, freq };
    this._cricketVoices.push(voice);

    // Start chirp scheduling with offset per voice
    this._scheduleCricketBurst(voice, ctx.currentTime + index * 0.4 + Math.random() * 0.5);
  }

  _scheduleCricketBurst(voice, startTime) {
    if (!this._cricketActive) return;
    const ctx = this.ctx;

    // Random number of pulses per burst
    const pulseCount = 2 + Math.floor(Math.random() * 5);
    const pulseRate = CONFIG.CRICKET_CHIRP_RATE_MIN +
      Math.random() * (CONFIG.CRICKET_CHIRP_RATE_MAX - CONFIG.CRICKET_CHIRP_RATE_MIN);
    const pulseDuration = 1 / pulseRate;

    // Schedule rapid on/off for each pulse — use setTargetAtTime for click-free curves
    for (let i = 0; i < pulseCount; i++) {
      const t = startTime + i * pulseDuration;
      const vol = 0.5 + Math.random() * 0.2;
      // Smooth exponential attack and release (time constant controls curve speed)
      voice.gain.gain.setTargetAtTime(vol, t, 0.005);
      voice.gain.gain.setTargetAtTime(0, t + pulseDuration * 0.45, 0.008);
    }

    // Random gap before next burst
    const burstEnd = startTime + pulseCount * pulseDuration;
    const gap = 0.3 + Math.random() * 1.7;
    const nextStart = burstEnd + gap;

    // Schedule next burst (use setTimeout to avoid massive scheduling queue)
    const delay = (nextStart - ctx.currentTime) * 1000;
    setTimeout(() => {
      if (this._cricketActive) {
        this._scheduleCricketBurst(voice, ctx.currentTime);
      }
    }, Math.max(0, delay));
  }

  // ======== Water ambient — gentle lapping near lakes ========

  _updateWaterAmbient(waterProximity) {
    const ctx = this.ctx;
    const shouldBeActive = waterProximity > 0.05;

    if (shouldBeActive && !this._waterActive) {
      // Start water ambient
      this._waterActive = true;

      // Main layer: low resonant wash — slow playback + lowpass to remove hiss
      this._waterSource = ctx.createBufferSource();
      this._waterSource.buffer = this._noiseBuffer;
      this._waterSource.loop = true;
      this._waterSource.playbackRate.value = 0.3; // very slow = deep, smooth character

      this._waterFilter = ctx.createBiquadFilter();
      this._waterFilter.type = 'bandpass';
      this._waterFilter.frequency.value = 280;
      this._waterFilter.Q.value = 2.0; // tight resonance, strongly tonal

      this._waterLowpass = ctx.createBiquadFilter();
      this._waterLowpass.type = 'lowpass';
      this._waterLowpass.frequency.value = 400;
      this._waterLowpass.Q.value = 0.7;

      this._waterGain = ctx.createGain();
      this._waterGain.gain.value = 0;

      this._waterSource.connect(this._waterFilter);
      this._waterFilter.connect(this._waterLowpass);
      this._waterLowpass.connect(this._waterGain);
      this._waterGain.connect(this.masterGain);
      this._waterSource.start();

      // Slow modulation for organic lapping character
      this._modulateWater();

      // Splash layer — narrow band, only audible during wave arrival
      this._waterShimmerSource = ctx.createBufferSource();
      this._waterShimmerSource.buffer = this._noiseBuffer;
      this._waterShimmerSource.loop = true;
      this._waterShimmerSource.playbackRate.value = 0.4;

      this._waterShimmerFilter = ctx.createBiquadFilter();
      this._waterShimmerFilter.type = 'bandpass';
      this._waterShimmerFilter.frequency.value = 600;
      this._waterShimmerFilter.Q.value = 3.0; // very narrow — just a hint of splash

      this._waterShimmerGain = ctx.createGain();
      this._waterShimmerGain.gain.value = 0;

      this._waterShimmerSource.connect(this._waterShimmerFilter);
      this._waterShimmerFilter.connect(this._waterShimmerGain);
      this._waterShimmerGain.connect(this.masterGain);
      this._waterShimmerSource.start();
    } else if (!shouldBeActive && this._waterActive) {
      // Stop water ambient
      this._waterActive = false;
      const now = ctx.currentTime;
      if (this._waterGain) {
        this._waterGain.gain.linearRampToValueAtTime(0, now + 1);
      }
      if (this._waterShimmerGain) {
        this._waterShimmerGain.gain.linearRampToValueAtTime(0, now + 1);
      }
      clearTimeout(this._waterModTimeout);
      clearTimeout(this._waterShimmerModTimeout);
      setTimeout(() => {
        try { this._waterSource?.stop(); } catch (e) { /* already stopped */ }
        try { this._waterShimmerSource?.stop(); } catch (e) { /* already stopped */ }
        this._waterSource = null;
        this._waterShimmerSource = null;
        this._waterGain = null;
        this._waterShimmerGain = null;
      }, 1200);
    }

    // Update base volume based on proximity (used by wave scheduling)
    if (this._waterActive) {
      this._waterBaseVol = waterProximity * 0.12;
    }

    // Duck wind near water so lapping sounds come through
    if (this.windGain) {
      const windScale = 1 - waterProximity * 0.5;
      this._windDuck = windScale;
    }
  }

  _modulateWater() {
    if (!this._waterActive || !this._waterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this._waterBaseVol || 0.1;

    // Schedule a single "wave lap" — volume swells up then fades away
    const attack = 0.2 + Math.random() * 0.25;   // wave arrives
    const sustain = 0.1 + Math.random() * 0.2;   // wash sustains
    const release = 0.3 + Math.random() * 0.5;   // wave recedes
    const gap = 0.4 + Math.random() * 1.2;        // quiet between waves
    const waveDur = attack + sustain + release;
    const peakVol = vol * (0.6 + Math.random() * 0.4);

    // Main wash — swell up, hold, fade
    this._waterGain.gain.setTargetAtTime(peakVol, now, attack * 0.4);
    this._waterGain.gain.setTargetAtTime(peakVol * 0.7, now + attack, sustain * 0.5);
    this._waterGain.gain.setTargetAtTime(vol * 0.05, now + attack + sustain, release * 0.4);

    // Filter sweeps higher during wave arrival (splashier), lower as it recedes
    this._waterFilter.frequency.setTargetAtTime(600 + Math.random() * 300, now, attack * 0.3);
    this._waterFilter.frequency.setTargetAtTime(250 + Math.random() * 100, now + attack + sustain, release * 0.5);

    // Shimmer — brief splash on wave arrival
    if (this._waterShimmerGain) {
      this._waterShimmerGain.gain.setTargetAtTime(peakVol * 0.2, now, attack * 0.2);
      this._waterShimmerGain.gain.setTargetAtTime(0, now + attack * 0.8, 0.15);
    }

    // Schedule next wave
    this._waterModTimeout = setTimeout(() => this._modulateWater(), (waveDur + gap) * 1000);
  }

  // Shimmer modulation now handled by wave pulses in _modulateWater()

  // ======== Rustling leaves — proximity-triggered, spatially positioned ========

  _updateRustles(playerPos, nearbyTrees) {
    if (this._rustleCooldown > 0 || this._activeRustles >= CONFIG.RUSTLE_MAX_CONCURRENT) return;

    const triggerDist = CONFIG.RUSTLE_TRIGGER_DIST;
    const triggerDistSq = triggerDist * triggerDist;

    for (const tree of nearbyTrees) {
      const dx = playerPos.x - tree.x;
      const dz = playerPos.z - tree.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < triggerDistSq) {
        // Low probability, scales with closeness
        const closeness = 1 - Math.sqrt(distSq) / triggerDist;
        if (Math.random() < closeness * 0.02) {
          this._playRustle({ x: tree.x, y: tree.y + 2, z: tree.z });
          this._rustleCooldown = 1.0; // longer cooldown between rustles
          break;
        }
      }
    }
  }

  _playRustle(position) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this._activeRustles++;

    // Gentle bandpass noise — soft rustling character
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;
    noise.playbackRate.value = 0.6 + Math.random() * 0.4;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 4500 + Math.random() * 1500;
    filter.Q.value = 0.3;

    const gain = ctx.createGain();
    const duration = 0.4 + Math.random() * 0.4;
    gain.gain.value = 0;
    // Smooth exponential attack and decay — no clicks possible
    gain.gain.setTargetAtTime(CONFIG.RUSTLE_VOLUME * 0.5, now, 0.05);
    gain.gain.setTargetAtTime(0, now + 0.15, duration * 0.3);

    // Spatial positioning
    const panner = this._createPanner(position);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.spatialBus);

    noise.start(now);
    noise.stop(now + duration + 0.5);

    noise.onended = () => {
      this._activeRustles--;
    };
  }

  // ======== Animal growl — optionally spatial ========

  /**
   * Play a growl sound. type: 'bear' or 'lion'
   * position: optional { x, y, z } for spatial positioning
   */
  playGrowl(type, position) {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Determine output: spatial panner or direct to master
    let outputNode;
    let panner;
    if (position) {
      panner = this._createPanner(position);
      panner.connect(this.spatialBus);
      outputNode = panner;
    } else {
      outputNode = this.masterGain;
    }

    if (type === 'bear') {
      this._bearGrowl(now, outputNode);
    } else {
      this._lionGrowl(now, outputNode);
    }
  }

  _bearGrowl(now, outputNode) {
    const ctx = this.ctx;

    // Breathy rasp — bandpass noise for "throat air" character
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(350, now);
    filter.frequency.linearRampToValueAtTime(250, now + 1.2);
    filter.Q.value = 1.2;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.25, now + 0.15);
    noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.6);
    noiseGain.gain.linearRampToValueAtTime(0.08, now + 1.2);
    noiseGain.gain.linearRampToValueAtTime(0, now + 1.5);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(outputNode);

    // Vocal cord vibration — square wave with LFO wobble for roughness
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(105, now + 1.2);

    // LFO for irregular vocal-cord flutter
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 8 + Math.random() * 6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 15;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    // Bandpass the vocal tone to remove sub-bass rumble
    const vocalFilter = ctx.createBiquadFilter();
    vocalFilter.type = 'bandpass';
    vocalFilter.frequency.value = 280;
    vocalFilter.Q.value = 0.8;

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(0.15, now + 0.1);
    oscGain.gain.linearRampToValueAtTime(0.1, now + 0.6);
    oscGain.gain.linearRampToValueAtTime(0, now + 1.4);

    osc.connect(vocalFilter);
    vocalFilter.connect(oscGain);
    oscGain.connect(outputNode);

    noise.start(now);
    noise.stop(now + 1.6);
    osc.start(now);
    osc.stop(now + 1.6);
    lfo.start(now);
    lfo.stop(now + 1.6);
  }

  _lionGrowl(now, outputNode) {
    const ctx = this.ctx;

    // Hissing rasp — higher bandpass noise for snarl
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.linearRampToValueAtTime(400, now + 0.8);
    filter.Q.value = 1.0;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.2, now + 0.06);
    noiseGain.gain.linearRampToValueAtTime(0.15, now + 0.4);
    noiseGain.gain.linearRampToValueAtTime(0, now + 1.0);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(outputNode);

    // Snarling vocal tone — higher pitch, aggressive wobble
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(160, now + 0.8);

    // Faster, more aggressive LFO for snarl texture
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 12 + Math.random() * 8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 25;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    // Shape the vocal tone
    const vocalFilter = ctx.createBiquadFilter();
    vocalFilter.type = 'bandpass';
    vocalFilter.frequency.value = 450;
    vocalFilter.Q.value = 0.7;

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(0.12, now + 0.05);
    oscGain.gain.linearRampToValueAtTime(0.08, now + 0.4);
    oscGain.gain.linearRampToValueAtTime(0, now + 0.9);

    osc.connect(vocalFilter);
    vocalFilter.connect(oscGain);
    oscGain.connect(outputNode);

    noise.start(now);
    noise.stop(now + 1.1);
    osc.start(now);
    osc.stop(now + 1.1);
    lfo.start(now);
    lfo.stop(now + 1.1);
  }

  // ======== Wally "hello there" — high-pitched vocal synthesis ========

  /**
   * Play Wally's "hello there" greeting.
   * position: optional { x, y, z } for spatial positioning
   */
  playWallyHello(position) {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    let outputNode;
    if (position) {
      const panner = this._createPanner(position);
      panner.connect(this.spatialBus);
      outputNode = panner;
    } else {
      outputNode = this.masterGain;
    }

    this._wallyHello(now, outputNode);
  }

  _wallyHello(now, outputNode) {
    const ctx = this.ctx;

    // Synthesize a cartoony high-pitched "hello there" using formant-like tones
    // Two syllables: "hel-LO" then "there"
    const syllables = [
      // "hel" — short, mid-high
      { time: 0, dur: 0.12, freq: 520, formant: 1800, vol: 0.25 },
      // "LO" — longer, rising pitch
      { time: 0.12, dur: 0.2, freq: 620, formant: 1200, vol: 0.35 },
      // tiny gap
      // "the-" — short breathy
      { time: 0.4, dur: 0.1, freq: 480, formant: 2200, vol: 0.2 },
      // "-ere" — longer, falling
      { time: 0.5, dur: 0.22, freq: 560, formant: 1600, vol: 0.3 },
    ];

    // High-pitched shift — Wally sounds squeaky/cheerful
    const pitchMul = 1.8;

    for (const s of syllables) {
      const t = now + s.time;

      // Fundamental — buzzy source (sawtooth for vocal-like harmonics)
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(s.freq * pitchMul, t);
      osc.frequency.linearRampToValueAtTime(s.freq * pitchMul * 0.95, t + s.dur);

      // Formant filter — shapes the vowel sound
      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.value = s.formant * pitchMul * 0.7;
      formant.Q.value = 4;

      // Envelope
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(s.vol, t + 0.02);
      gain.gain.setValueAtTime(s.vol * 0.8, t + s.dur * 0.7);
      gain.gain.linearRampToValueAtTime(0, t + s.dur);

      osc.connect(formant);
      formant.connect(gain);
      gain.connect(outputNode);

      osc.start(t);
      osc.stop(t + s.dur + 0.01);
    }

    // Add a breathy noise layer for consonants ("h" and "th")
    const breathTimes = [
      { time: 0, dur: 0.06 },     // "h" of hello
      { time: 0.38, dur: 0.06 },  // "th" of there
    ];
    for (const b of breathTimes) {
      const t = now + b.time;
      const noise = ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      noise.playbackRate.value = 1.5;

      const hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 3000;

      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(0, t);
      bGain.gain.linearRampToValueAtTime(0.12, t + 0.01);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + b.dur);

      noise.connect(hpf);
      hpf.connect(bGain);
      bGain.connect(outputNode);

      noise.start(t);
      noise.stop(t + b.dur + 0.01);
    }
  }

  // ======== Collectible chime — two rising sine tones + shimmer burst ========

  playCollectChime(position) {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = CONFIG.COLLECTIBLE_CHIME_VOLUME;
    const baseFreq = CONFIG.COLLECTIBLE_CHIME_FREQ;

    // Spatial panner
    const panner = this._createPanner(position);
    panner.connect(this.spatialBus);

    // Tone 1: rising sweep 880→1320 Hz
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.15);

    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc1.connect(gain1);
    gain1.connect(panner);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Tone 2: octave above, delayed 80ms
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(baseFreq * 2, now + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 3, now + 0.23);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(vol * 0.7, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc2.connect(gain2);
    gain2.connect(panner);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.4);

    // Shimmer: bandpass noise burst at 6kHz
    if (this._noiseBuffer) {
      const shimmer = ctx.createBufferSource();
      shimmer.buffer = this._noiseBuffer;
      shimmer.playbackRate.value = 1.2;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 6000;
      bp.Q.value = 2.0;

      const shimGain = ctx.createGain();
      shimGain.gain.setValueAtTime(0, now);
      shimGain.gain.linearRampToValueAtTime(vol * 0.35, now + 0.02);
      shimGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      shimmer.connect(bp);
      bp.connect(shimGain);
      shimGain.connect(panner);
      shimmer.start(now);
      shimmer.stop(now + 0.25);
    }
  }

  // ======== Milestone fanfare — celebratory arpeggio for every 10 points ========

  playCollectFanfare() {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = CONFIG.COLLECTIBLE_CHIME_VOLUME * 1.5;

    // Rising major arpeggio: root → 3rd → 5th → octave
    const notes = [660, 830, 990, 1320];
    const spacing = 0.09;

    for (let i = 0; i < notes.length; i++) {
      const t = now + i * spacing;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], t);
      osc.frequency.linearRampToValueAtTime(notes[i] * 1.02, t + 0.15);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * (0.7 + i * 0.1), t + 0.02);
      gain.gain.setValueAtTime(vol * (0.5 + i * 0.1), t + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.4);
    }

    // Sparkle shimmer across the whole arpeggio
    if (this._noiseBuffer) {
      const shimmer = ctx.createBufferSource();
      shimmer.buffer = this._noiseBuffer;
      shimmer.playbackRate.value = 1.5;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 8000;
      bp.Q.value = 1.5;

      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(0, now);
      sGain.gain.linearRampToValueAtTime(vol * 0.25, now + 0.05);
      sGain.gain.setValueAtTime(vol * 0.2, now + 0.3);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      shimmer.connect(bp);
      bp.connect(sGain);
      sGain.connect(this.masterGain);
      shimmer.start(now);
      shimmer.stop(now + 0.65);
    }
  }

  // ======== Jump landing splash — heavy water impact ========

  playLandingSplash() {
    if (!this.started || !this.ctx || !this._noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = CONFIG.FOOTSTEP_VOLUME * 3;

    // Big initial slosh — wide bandpass
    const slosh = ctx.createBufferSource();
    slosh.buffer = this._noiseBuffer;
    slosh.playbackRate.value = 0.5 + Math.random() * 0.2;

    const sloshBP = ctx.createBiquadFilter();
    sloshBP.type = 'bandpass';
    sloshBP.frequency.setValueAtTime(800, now);
    sloshBP.frequency.exponentialRampToValueAtTime(300, now + 0.5);
    sloshBP.Q.value = 0.6;

    const sloshHP = ctx.createBiquadFilter();
    sloshHP.type = 'highpass';
    sloshHP.frequency.value = 200;

    const sloshGain = ctx.createGain();
    sloshGain.gain.setValueAtTime(vol * 3, now);
    sloshGain.gain.setTargetAtTime(vol * 1.5, now + 0.06, 0.05);
    sloshGain.gain.setTargetAtTime(0, now + 0.2, 0.15);

    slosh.connect(sloshHP);
    sloshHP.connect(sloshBP);
    sloshBP.connect(sloshGain);
    sloshGain.connect(this.masterGain);
    slosh.start(now);
    slosh.stop(now + 0.8);

    // High spray detail
    const spray = ctx.createBufferSource();
    spray.buffer = this._noiseBuffer;
    spray.playbackRate.value = 1.2 + Math.random() * 0.3;

    const sprayBP = ctx.createBiquadFilter();
    sprayBP.type = 'bandpass';
    sprayBP.frequency.value = 3000;
    sprayBP.Q.value = 0.4;

    const sprayGain = ctx.createGain();
    sprayGain.gain.setValueAtTime(0, now);
    sprayGain.gain.setTargetAtTime(vol * 1.2, now + 0.02, 0.015);
    sprayGain.gain.setTargetAtTime(0, now + 0.1, 0.08);

    spray.connect(sprayBP);
    sprayBP.connect(sprayGain);
    sprayGain.connect(this.masterGain);
    spray.start(now);
    spray.stop(now + 0.5);

    // Low thump — body hitting water
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(60, now);
    thump.frequency.exponentialRampToValueAtTime(25, now + 0.08);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(vol * 2, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    thump.connect(thumpGain);
    thumpGain.connect(this.masterGain);
    thump.start(now);
    thump.stop(now + 0.13);
  }

  // ======== Sprint empty — sad descending minor tones ========

  // ======== Jump landing — double-foot impact thud ========

  playLandingThud() {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = CONFIG.FOOTSTEP_VOLUME * 2.5;

    // Heavy double-foot thud — two overlapping low tones
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.03; // slight stagger for two-foot feel
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime((90 - i * 15), t);
      osc.frequency.exponentialRampToValueAtTime(25, t + 0.1);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.16);
    }

    // Ground crunch — short noise burst
    if (this._noiseBuffer) {
      const crunch = ctx.createBufferSource();
      crunch.buffer = this._noiseBuffer;
      crunch.playbackRate.value = 0.4;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500;
      bp.Q.value = 0.6;

      const cGain = ctx.createGain();
      cGain.gain.setValueAtTime(0, now);
      cGain.gain.linearRampToValueAtTime(vol * 0.6, now + 0.01);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      crunch.connect(bp);
      bp.connect(cGain);
      cGain.connect(this.masterGain);
      crunch.start(now);
      crunch.stop(now + 0.15);
    }
  }

  playSprintEmpty() {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = 0.15;

    // Descending minor third: two falling tones
    const notes = [660, 520];
    for (let i = 0; i < notes.length; i++) {
      const t = now + i * 0.18;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], t);
      osc.frequency.exponentialRampToValueAtTime(notes[i] * 0.85, t + 0.25);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  stop() {
    // Stop crickets
    for (const voice of this._cricketVoices) {
      try { voice.osc.stop(); } catch (e) { /* already stopped */ }
    }
    this._cricketVoices = [];
    this._cricketActive = false;
    this._cricketGain = null;

    // Stop water ambient
    this._waterActive = false;
    clearTimeout(this._waterModTimeout);
    clearTimeout(this._waterShimmerModTimeout);
    try { this._waterSource?.stop(); } catch (e) { /* already stopped */ }
    try { this._waterShimmerSource?.stop(); } catch (e) { /* already stopped */ }
    this._waterSource = null;
    this._waterShimmerSource = null;
    this._waterGain = null;
    this._waterShimmerGain = null;

    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.started = false;
  }

  // ======== Morepork (NZ owl) — call-and-response conversation ========

  _loadMorepork() {
    fetch('assets/audio/morepork-single.mp3')
      .then(r => {
        if (!r.ok) throw new Error('morepork fetch failed: ' + r.status);
        return r.arrayBuffer();
      })
      .then(buf => this.ctx.decodeAudioData(buf))
      .then(decoded => {
        this._moreporkBuffer = decoded;
        console.log('Morepork audio loaded:', decoded.duration.toFixed(1) + 's');
      })
      .catch(e => { console.warn('Morepork load error:', e); });
  }

  _updateMoreporkConversation(delta, playerPos) {
    if (!this._moreporkBuffer || !playerPos) return;

    // Active conversation — advance it
    if (this._moreporkConvo) {
      const convo = this._moreporkConvo;
      convo.timer += delta;

      if (convo.timer >= convo.nextCallTime) {
        // Play this owl's call
        const owl = convo.owls[convo.currentOwl];
        this._playMoreporkAt(owl.position, owl.pitch);

        convo.exchangesDone++;
        convo.timer = 0;

        // Check if third owl joins (20% chance, once per conversation)
        if (!convo.thirdJoined && convo.owls.length === 2 &&
            convo.exchangesDone >= 2 && Math.random() < 0.2) {
          convo.thirdJoined = true;
          convo.owls.push(this._pickOwlPosition(playerPos, convo.owls));
        }

        if (convo.exchangesDone >= convo.totalExchanges) {
          // Conversation over
          this._moreporkConvo = null;
          this._moreporkPauseTimer = 0;
          this._moreporkNextPause = 20 + Math.random() * 40;
          return;
        }

        // Advance to next owl, random delay before next call
        convo.currentOwl = (convo.currentOwl + 1) % convo.owls.length;
        convo.nextCallTime = 1.5 + Math.random() * 3.5;
      }
      return;
    }

    // No active conversation — wait for pause timer
    this._moreporkPauseTimer += delta;
    if (this._moreporkPauseTimer >= this._moreporkNextPause) {
      this._startMoreporkConversation(playerPos);
    }
  }

  _startMoreporkConversation(playerPos) {
    const owls = [];
    owls.push(this._pickOwlPosition(playerPos, []));
    owls.push(this._pickOwlPosition(playerPos, owls));

    this._moreporkConvo = {
      owls,
      currentOwl: 0,
      exchangesDone: 0,
      totalExchanges: 2 + Math.floor(Math.random() * 3) * 2, // 2, 4, or 6 (always even for back-and-forth)
      timer: 0,
      nextCallTime: 0, // first call immediately
      thirdJoined: false,
    };
  }

  _pickOwlPosition(playerPos, existingOwls) {
    const minAngleSep = Math.PI / 3; // 60 degrees apart
    let angle, attempts = 0;

    do {
      angle = Math.random() * Math.PI * 2;
      attempts++;
      if (attempts > 20) break; // avoid infinite loop
    } while (existingOwls.some(owl => {
      let diff = Math.abs(owl.angle - angle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      return diff < minAngleSep;
    }));

    const dist = 40 + Math.random() * 60;
    return {
      angle,
      pitch: 0.95 + Math.random() * 0.1, // 0.95-1.05
      position: {
        x: playerPos.x + Math.cos(angle) * dist,
        y: playerPos.y + 8 + Math.random() * 12,
        z: playerPos.z + Math.sin(angle) * dist,
      },
    };
  }

  _playMoreporkAt(position, pitch) {
    if (!this._moreporkBuffer) return;
    const ctx = this.ctx;

    const source = ctx.createBufferSource();
    source.buffer = this._moreporkBuffer;
    source.playbackRate.value = pitch || 1.0;

    const gain = ctx.createGain();
    gain.gain.value = 0.15 + Math.random() * 0.1;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 20;
    panner.maxDistance = 150;
    panner.rolloffFactor = 0.6;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.spatialBus);

    source.start();
  }
}
