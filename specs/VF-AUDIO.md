# VF-AUDIO — Audio System

**Version:** 1.0  
**Date:** 20 February 2026  
**Status:** Active  
**Purpose:** Every procedural sound in the experience: footsteps (4 surfaces), crickets, birds, morepork, water lapping, rain (4 layers), thunder (5 layers + reverb), wind, ski, collectibles, and wildlife. Full oscillator/filter chain specifications.  
**Dependencies:** VF-CONFIG, VF-WEATHER, VF-MOVEMENT, VF-TERRAIN  

---

## 1. Shared Resources

All audio is procedurally synthesised using the Web Audio API except:
- **Morepork owl call**: Single audio file (`assets/audio/morepork-single.mp3`)
- **Moon photograph**: Single image file (not audio, listed for completeness)

Shared resources:
- **Noise buffer**: 2-second white noise AudioBuffer, reused by all noise-based sounds
- **Spatial bus**: GainNode (volume 1.0) routed to master, all HRTF panners connect here
- **Master gain**: Volume = `AMBIENT_VOLUME = 0.3`

### 1.1 Audio Node Lifecycle Pattern

All per-event audio nodes MUST follow this pattern to prevent memory leaks:
```
1. Create oscillator/buffer source → filter(s) → gain → output bus
2. Schedule envelope with setValueAtTime / linearRamp / exponentialRamp
3. Call source.stop(endTime) to schedule auto-cleanup
4. On source 'ended' event: disconnect all nodes in chain
```

No node pooling — Web Audio nodes are cheap to create and MUST NOT be reused after stopping.

## 2. Footsteps

Triggered on bob phase zero-crossing (negative → positive, once per walk cycle; see VF-MOVEMENT §6). Surface-specific synthesis.

All footsteps MUST have ±15% random pitch variation per step (`FOOTSTEP_PITCH_VARIATION = 0.15`).

**Footstep timing**: Triggered on walk-bob phase zero-crossing. Bob runs at `WALK_BOB_SPEED = 2.2` Hz while moving, so footsteps fire at ~2.2 per second.

**Surface detection priority**:
1. Snow: if terrain height > SNOWLINE_START (24m)
2. Water: if terrain height < WATER_LEVEL (-3.5m)
3. Rock: if standing on a rock (closest rock within collision radius with height > small threshold)
4. Grass: default

**Footstep volume scaling**: Base volume × (1 + speedFraction × 0.3) — louder when sprinting.

### 2.1 Grass Footstep

```
function playGrassFootstep(pitch):
    now = audioContext.currentTime

    // Layer 1: Heel strike (low thud)
    heelOsc = OscillatorNode(type="sine", frequency=80 * pitch)
    heelGain = GainNode()
    heelOsc → heelGain → masterGain

    heelOsc.frequency.exponentialRampToValueAtTime(30 * pitch, now + 0.07)
    heelGain.gain.setValueAtTime(0.22, now)
    heelGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)

    heelOsc.start(now)
    heelOsc.stop(now + 0.08)

    // Layer 2: Toe tap (delayed 55-75ms, higher pitch)
    toeDelay = 0.055 + random() * 0.02
    toeOsc = OscillatorNode(type="sine", frequency=140 * pitch)
    toeGain = GainNode()
    toeOsc → toeGain → masterGain

    toeOsc.frequency.exponentialRampToValueAtTime(50 * pitch, now + toeDelay + 0.05)
    toeGain.gain.setValueAtTime(0, now)
    toeGain.gain.setValueAtTime(0.11, now + toeDelay)
    toeGain.gain.exponentialRampToValueAtTime(0.001, now + toeDelay + 0.05)

    toeOsc.start(now + toeDelay)
    toeOsc.stop(now + toeDelay + 0.06)

    // Layer 3: Grass swish (broadband)
    swishSource = AudioBufferSourceNode(buffer=whiteNoiseBuffer, loop=true)
    swishFilter = BiquadFilterNode(type="bandpass", frequency=900, Q=0.4)
    swishGain = GainNode()
    swishSource → swishFilter → swishGain → masterGain

    swishGain.gain.setValueAtTime(0, now)
    swishGain.gain.linearRampToValueAtTime(0.04, now + 0.01)
    swishGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

    swishSource.start(now)
    swishSource.stop(now + 0.09)
```

Summary:
1. **Heel strike**: Sine oscillator, 80 Hz → 30 Hz (exp ramp over 0.07s), volume × 1.8, duration 0.1s
2. **Toe tap** (delayed 0.055–0.075s): Sine, 140 Hz → 50 Hz over 0.05s, volume × 0.9, duration 0.07s
3. **Grass texture**: Noise through bandpass 900 Hz (Q=0.4), volume × 0.3, duration 0.08s

> ⚠️ **Gotcha: Footstep sound design.** Footsteps went through 5 complete rewrites. The breakthrough was separating heel and toe impacts with distinct frequency ranges and a slight time offset (55–75ms). Without the stagger, it sounds like a single drum hit. Without the frequency separation, it sounds like noise.

### 2.2 Rock Footstep
1. **Heel strike**: Sine, 160 Hz → 55 Hz over 0.04s, volume × 1.5, duration 0.07s
2. **Toe tap** (delayed 0.045–0.06s): Triangle wave, 280 Hz → 90 Hz over 0.03s, volume × 1.0, duration 0.05s

### 2.3 Water Footstep
1. **Primary slosh**: Noise → highpass 250 Hz → bandpass 900 Hz (Q=0.8, sweeping to 400 Hz over 0.4s), volume × 2.5, attack 0.035s, release 0.1s
2. **Return slosh** (delayed 0.08–0.1s): Similar but bandpass 700 Hz, volume × 1.8
3. **Droplet spray**: Noise → bandpass 2200 Hz (Q=0.5), volume × 0.5, short burst

### 2.4 Snow Footstep
1. **Snow crunch**: Noise at 0.35–0.5× playback → bandpass 1200 Hz (Q=1.2, sweeping to 600 Hz), volume × 1.8, attack/sustain/release
2. **Ski swoosh**: Noise at 0.8–1.2× → bandpass 3500 Hz (Q=0.5, sweeping to 1800 Hz), volume × 1.0
3. **Sub-crunch**: Sine, 100 Hz → 40 Hz over 0.06s, volume × 1.0

### 2.5 Footstep Trigger Logic

```
function checkFootstep(delta):
    if not moving or not grounded: return
    if swimming: return

    // Bob phase drives footstep timing
    prevBob = sin(prevBobPhase * 2π)
    currBob = sin(bobPhase * 2π)

    // Trigger on downward zero-crossing (foot hitting ground)
    if prevBob >= 0 and currBob < 0:
        surface = getGroundType()   // "grass", "rock", "snow", "water"
        pitch = 1.0 + (random() - 0.5) * 2 * FOOTSTEP_PITCH_VARIATION

        switch surface:
            "grass": playGrassFootstep(pitch)
            "rock":  playRockFootstep(pitch)
            "snow":  playSnowFootstep(pitch)
            "water": playWaterFootstep(pitch)
```

## 3. Crickets

4 persistent sine oscillator voices creating a realistic cricket chorus.

```
Setup (once):
    for i = 0 to CRICKET_VOICES-1:
        voice[i].osc = OscillatorNode(type="sine")
        voice[i].osc.frequency = CRICKET_FREQ_MIN +
            (CRICKET_FREQ_MAX - CRICKET_FREQ_MIN) * (i / (CRICKET_VOICES - 1))
            // Spread: 4200, 4600, 5000, 5400 Hz

        voice[i].gain = GainNode(gain=0)
        voice[i].masterGain = GainNode(gain=0)  // fade in/out control

        voice[i].osc → voice[i].gain → voice[i].masterGain → masterGain
        voice[i].osc.start()

        // Independent phase and timing per voice
        voice[i].phase = random() * 2π
        voice[i].chirpRate = random(CRICKET_CHIRP_RATE_MIN, CRICKET_CHIRP_RATE_MAX)
        voice[i].burstLength = random(2, 7)  // pulses per burst
        voice[i].gapDuration = random(0.3, 2.0)
```

```
Per-burst scheduling (called when previous burst finishes):
    now = audioContext.currentTime
    pulsePeriod = 1.0 / voice.chirpRate
    numPulses = random(2, 7)

    for p = 0 to numPulses-1:
        pulseStart = now + p * pulsePeriod
        pulseOn = pulsePeriod * 0.45        // 45% duty cycle
        peakGain = random(0.5, 0.7) * CRICKET_VOLUME

        // Click-free envelope using setTargetAtTime
        voice.gain.setTargetAtTime(peakGain, pulseStart, 0.005)   // 5ms attack
        voice.gain.setTargetAtTime(0, pulseStart + pulseOn, 0.008) // 8ms release

    // Schedule next burst after gap
    burstEnd = now + numPulses * pulsePeriod
    nextGap = random(0.3, 2.0)
    setTimeout(scheduleNextBurst, (burstEnd + nextGap - now) * 1000)
```

**Activation**:
- Fade `masterGain` from 0 → 1 over 3 seconds when `sunElevation < CRICKET_SUN_FADE_IN (-0.05)`
- Fade from 1 → 0 over 3 seconds when `sunElevation > CRICKET_SUN_FADE_OUT (0.05)`
- Volume MUST be reduced 100% above snowline

## 4. Bird Chirps

Random every 1.5–6s (daytime, suppressed by rain, silent above snowline). Three types:

1. **Single tweet**: Sine, 2000–3500 Hz, 0.06s sweep up 20% then down 10%
2. **Double chirp**: Two tweets 0.15s apart
3. **Warbling trill**: 3–7 rapid notes at baseFreq ± sin(i×1.5) × 400 Hz

All MUST be spatialised via HRTF at random positions 10–30m from player, 3–8m above.

## 5. Morepork (NZ Owl)

Nighttime call-and-response conversations between 2–3 owls:

1. Timer waits 20–60s between conversations
2. Two owls spawn at random positions (40–100m away, ≥60° apart, 8–20m above)
3. They exchange 2–6 calls with 1.5–3.5s gaps between each
4. 20% chance a third owl joins after 2 exchanges
5. Each owl MUST have slight pitch variation (0.95–1.05×)

Uses the single audio file asset, HRTF-spatialised.

## 6. Rain Audio (4 Layers)

| Layer | Source | Filter | Frequency | Q | Modulation |
|-------|--------|--------|-----------|---|------------|
| Wash | Noise, 0.6× playback | Bandpass | 800 Hz | 0.4 | — |
| Body | Noise, 0.9× playback | Bandpass | 1600 Hz | 0.5 | LFO at 0.15 Hz (~7s cycle) |
| Patter | Noise, 1.2× playback | Bandpass | 3200 Hz | 0.6 | — |
| Sizzle | Noise, 1.8× playback | Highpass | 6000 Hz | 0.3 | LFO at 0.22 Hz (~4.5s cycle) |

Gains: wash = ri² × 0.15, body = ri × 0.08, patter = ri × 0.12, sizzle = ri² × 0.05 (where ri = rainIntensity). All MUST scale with altitude fade (silent in snow zone) and canopy dampen (65% volume under trees).

### 6.1 Spatial Rain Drips

HRTF-spatialised drip sounds every 0.15–0.55s (faster in heavier rain), positioned 3–15m from player. Three types:

1. **Single drip** (40%): Sine, 2000–5000 Hz → 50% frequency over 0.06–0.12s
2. **Double drip** (30%): Two sine pings 40–70ms apart
3. **Splash patter** (30%): Noise → bandpass 3000–6000 Hz (Q=1.5–2.5), 40–100ms burst

## 7. Thunder (5 Layers + Procedural Reverb)

| Layer | Source | Filter | Timing | Duration |
|-------|--------|--------|--------|----------|
| 1. Initial crack | Noise, 1.8–2.3× playback | Highpass 2000 Hz | Immediate (close strikes only) | 0.15s |
| 2. Deep boom | Noise, 0.15–0.25× playback | Lowpass 120–200 Hz (Q=1.2) | 0–0.25s delay | 3.5s |
| 3. Mid-body | Noise, 0.35–0.5× playback | Bandpass 180–280 Hz (Q=0.5) | Immediate | 2.5s |
| 4. Rolling echoes | Noise, 0.2–0.35× playback | Bandpass, descending freq per echo | 0.8s + 0.6–1.4s intervals | 1.5–2.5s each |
| 5. Sub-bass tail | Sine oscillator, 35–50 Hz → 20 Hz | — | 0.3s delay | 6–8s |

All layers MUST route through a shared `ConvolverNode` with procedural impulse response:
- 5-second duration, 2-channel
- Multi-stage decay: fast early (e^(-t×2.5)) + slow tail (e^(-t×0.5) × 0.4)
- Clustered early reflections in first 0.3s
- Dry/wet mix: 70%/50% (close) or 70%/80% (distant — more reverb)

Thunder delay = bolt distance / 343 m/s. Volume = 1.1 - distance/1000.

### 7.1 Procedural Impulse Response for Thunder Reverb

```python
sample_rate = audioContext.sampleRate
duration = 5.0  # seconds
length = int(sample_rate * duration)
buffer = create_audio_buffer(2, length, sample_rate)

for channel in [0, 1]:
    data = buffer.getChannelData(channel)
    for i in range(length):
        t = i / sample_rate
        
        # Multi-stage decay envelope
        early = exp(-t * 2.5)              # fast initial decay
        late  = exp(-t * 0.5) * 0.4        # slow reverberant tail
        envelope = early + late
        
        # Clustered early reflections (first 0.3s)
        if t < 0.3:
            # Sparse impulse clusters
            if random() < 0.008:
                data[i] = (random() * 2 - 1) * envelope * 2.0
            else:
                data[i] = (random() * 2 - 1) * envelope * 0.3
        else:
            # Diffuse late reverb
            data[i] = (random() * 2 - 1) * envelope
```

This creates a natural-sounding reverb with:
- Sharp early reflections simulating nearby surfaces (trees, hills)
- Smooth diffuse tail simulating distant terrain reflections
- 5-second total duration matching real outdoor thunder reverb

## 8. Wildlife Sounds

### 8.1 Bear Growl
```
Source 1 (Breath): White noise → Highpass 250 Hz → Bandpass 400 Hz (Q=1.0)
  Envelope: attack 0.2s, sustain 0.4s, release 0.3s
  Volume: 0.25

Source 2 (Vocal): Square wave at 85 Hz
  LFO: random 8-14 Hz, depth ±10 Hz on frequency
  → Bandpass 250 Hz (Q=2.0) → Lowpass 500 Hz
  Envelope: attack 0.15s, sustain 0.3s, release 0.2s
  Volume: 0.15

Both → HRTF Panner at creature position
  refDistance: 5, maxDistance: 40, rolloffFactor: 1.0
```

Alternative description: Noise → bandpass 350→250 Hz (Q=1.2), 1.5s envelope (peak at 0.15s) + Square oscillator 140→105 Hz → bandpass 280 Hz (Q=0.8), with LFO flutter at 8–14 Hz (depth 15). The LFO irregularity gives the vocal quality.

> ⚠️ **Gotcha: Bear growl sound.** The first attempt "sounded more like someone farting." The fix: bandpass the breathy noise above 250 Hz, add a square wave vocal cord tone with LFO flutter, and bandpass the vocal tone to remove sub-bass rumble. The character comes from the LFO irregularity (8–14 Hz random), not the base pitch.

### 8.2 Mountain Lion Snarl
```
Source 1 (Hiss): White noise → Bandpass 1800 Hz (Q=0.8) → Highpass 800 Hz
  Envelope: sharp attack 0.05s, sustain 0.15s, release 0.2s
  Volume: 0.20

Source 2 (Growl): Sawtooth at 120 Hz
  Vibrato: 6 Hz, depth ±15 Hz
  → Bandpass 300 Hz (Q=1.5)
  Envelope: attack 0.1s, sustain 0.2s, release 0.15s
  Volume: 0.12

Both → HRTF Panner at creature position
```

Alternative description: Noise → bandpass 600→400 Hz (Q=1.0), 1.0s envelope (fast attack 0.06s) + Square osc 220→160 Hz → bandpass 450 Hz (Q=0.7), with faster LFO at 12–20 Hz (depth 25).

### 8.3 Wally "Hello There"
```
Source: Sawtooth oscillators through formant bandpass filters:
  - "hel": 0.12s, 520 Hz, formant 1800 Hz
  - "LO": 0.20s, 620 Hz, formant 1200 Hz
  - "the": 0.10s, 480 Hz, formant 2200 Hz
  - "ere": 0.22s, 560 Hz, formant 1600 Hz
  - All pitched up 1.8×
  - Plus consonant breath: noise → highpass 3000 Hz at "h" and "th" positions

Volume: 0.10
→ HRTF Panner at creature position
```

Simple alternative: Sine wave "hello" approximation — two notes: 440 Hz (0.15s) → 350 Hz (0.2s), 0.05s gap, smooth ramp up/down.

## 9. Water Ambient

Active when player is near water (terrain height below water level). Two layers with rhythmic wave pulses:

**Main wash layer**: Noise at 0.3× playback → bandpass 280 Hz (Q=2.0) → lowpass 400 Hz
- Pulsing envelope: attack 0.2–0.45s → sustain 0.1–0.3s → release 0.3–0.8s → gap 0.4–1.6s
- Filter sweeps from 600 Hz on wave arrival to 250 Hz on recession
- Volume scales with water proximity

**Splash layer**: Noise at 0.4× → bandpass 600 Hz (Q=3.0), brief spike during wave arrival

Wind MUST be ducked 50% near water so lapping sounds come through.

> ⚠️ **Gotcha: Water ambient sound.** Continuous bandpass noise sounds identical to wind. What makes water recognisable is the **temporal pattern** — rhythmic wave pulses with advance and retreat. The solution requires moving from frequency-domain filtering to time-domain envelope shaping.

## 10. Wind

Continuous noise through bandpass (250–650 Hz, Q=0.5). Slow random modulation of gain (0.03–0.11) and frequency over 3–8s intervals. MUST be ducked by water proximity (×0.5) and rain (×0.7).

## 11. Ski Slide

Continuous when ski speed > 0.15 m/s. Noise at 0.2–0.45× playback → tight bandpass 500–1100 Hz (Q=1.8) → lowpass 1500–2700 Hz. Volume, playback rate, and filter all MUST scale with speed.

## 12. Collectible Sounds

### 12.1 Chime (on collection)
Two rising sine tones (880 Hz → 1320 Hz, then 1760 Hz → 2640 Hz at +80ms) plus bandpass noise shimmer at 6000 Hz. MUST be HRTF-spatialised at orb position.

### 12.2 Fanfare (every 10 points)
Rising major arpeggio (660, 830, 990, 1320 Hz) at 90ms spacing plus 8000 Hz sparkle shimmer.

### 12.3 Sad Tone (sprint with 0 points)
Sine 440 Hz → 330 Hz (minor third descent) over 0.3s, volume 0.15.
