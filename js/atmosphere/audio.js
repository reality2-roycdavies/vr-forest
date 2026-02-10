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
  }

  /**
   * Call each frame with extended parameters for all audio subsystems.
   */
  update(delta, sunElevation, playerPos, cameraDir, isMoving, groundType, bobPhase, nearbyTrees) {
    if (!this.started || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // Bird chirps
    this.birdTimer += delta;
    if (this.birdTimer > this.nextBirdTime) {
      this.birdTimer = 0;
      this.nextBirdTime = 1.5 + Math.random() * 6;
      this._chirp();
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

    // Rustling leaves
    if (nearbyTrees && playerPos) {
      this._rustleCooldown = Math.max(0, this._rustleCooldown - delta);
      this._updateRustles(playerPos, nearbyTrees);
    }
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
    const targetGain = 0.03 + Math.random() * 0.08;
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
    if (groundType === 'rock') {
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

    // Kick drum thud — sine with fast pitch sweep (like a bass drum)
    const kick = ctx.createOscillator();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(90 * variation, now);
    kick.frequency.exponentialRampToValueAtTime(35, now + 0.06);

    const kickGain = ctx.createGain();
    kickGain.gain.setValueAtTime(vol * 1.8, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    kick.connect(kickGain);
    kickGain.connect(this.masterGain);
    kick.start(now);
    kick.stop(now + 0.13);

    // Light crunch texture — just a touch of filtered noise
    const crunch = ctx.createBufferSource();
    crunch.buffer = this._noiseBuffer;
    crunch.playbackRate.value = 0.5 + Math.random() * 0.3;

    const crunchFilter = ctx.createBiquadFilter();
    crunchFilter.type = 'bandpass';
    crunchFilter.frequency.value = 800 * variation;
    crunchFilter.Q.value = 0.5;

    const crunchGain = ctx.createGain();
    crunchGain.gain.setValueAtTime(0, now);
    crunchGain.gain.linearRampToValueAtTime(vol * 0.4, now + 0.01);
    crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    crunch.connect(crunchFilter);
    crunchFilter.connect(crunchGain);
    crunchGain.connect(this.masterGain);
    crunch.start(now);
    crunch.stop(now + 0.11);
  }

  _rockStep() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const variation = 1 + (Math.random() - 0.5) * CONFIG.FOOTSTEP_PITCH_VARIATION * 2;
    const vol = CONFIG.FOOTSTEP_VOLUME;

    // Higher-pitched kick for hard surface
    const kick = ctx.createOscillator();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(180 * variation, now);
    kick.frequency.exponentialRampToValueAtTime(60, now + 0.04);

    const kickGain = ctx.createGain();
    kickGain.gain.setValueAtTime(vol * 1.5, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    kick.connect(kickGain);
    kickGain.connect(this.masterGain);
    kick.start(now);
    kick.stop(now + 0.09);

    // Click — short sine ping
    const ping = ctx.createOscillator();
    ping.type = 'triangle';
    ping.frequency.value = CONFIG.FOOTSTEP_ROCK_PING_FREQ * variation;

    const pingGain = ctx.createGain();
    pingGain.gain.setValueAtTime(vol * 0.4, now);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    ping.connect(pingGain);
    pingGain.connect(this.masterGain);
    ping.start(now);
    ping.stop(now + 0.06);
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
        // Probability scales with closeness (closer = more likely)
        const closeness = 1 - Math.sqrt(distSq) / triggerDist;
        if (Math.random() < closeness * 0.08) {
          this._playRustle({ x: tree.x, y: tree.y + 2, z: tree.z });
          this._rustleCooldown = CONFIG.RUSTLE_COOLDOWN;
          break;
        }
      }
    }
  }

  _playRustle(position) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this._activeRustles++;

    // Bandpass noise burst
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;
    noise.playbackRate.value = 0.8 + Math.random() * 0.6;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 4000 + Math.random() * 2000;
    filter.Q.value = 0.5 + Math.random() * 0.3;

    const gain = ctx.createGain();
    const duration = 0.3 + Math.random() * 0.3;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(CONFIG.RUSTLE_VOLUME * 0.6, now + 0.06);
    gain.gain.linearRampToValueAtTime(CONFIG.RUSTLE_VOLUME * 0.4, now + duration * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Spatial positioning
    const panner = this._createPanner(position);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.spatialBus);

    noise.start(now);
    noise.stop(now + duration + 0.05);

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

  stop() {
    // Stop crickets
    for (const voice of this._cricketVoices) {
      try { voice.osc.stop(); } catch (e) { /* already stopped */ }
    }
    this._cricketVoices = [];
    this._cricketActive = false;
    this._cricketGain = null;

    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.started = false;
  }
}
