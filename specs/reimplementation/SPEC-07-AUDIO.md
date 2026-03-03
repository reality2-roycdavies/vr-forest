# SPEC-07: Procedural Audio

All audio is synthesized in real-time using the Web Audio API. Only one pre-recorded sample is used (morepork owl call).

## 1. Audio Architecture

- **AudioContext**: Created on first user gesture
- **Master gain**: `AMBIENT_VOLUME = 0.3`
- **Spatial bus**: Gain node (1.0) for all spatialized sounds
- **Shared noise buffer**: 2-second white noise `AudioBuffer` (`data[i] = random * 2 - 1`), reused by all noise-based sounds
- **Listener**: Updated each frame with player position and camera direction

### 1.1 Spatial Panner Defaults (HRTF)
```
panningModel: 'HRTF'
distanceModel: 'inverse'
refDistance: SPATIAL_REF_DISTANCE = 10
maxDistance: SPATIAL_MAX_DISTANCE = 60
rolloffFactor: SPATIAL_ROLLOFF = 0.8
```

## 2. Footsteps

Triggered on walk bob zero-crossing (negative-to-positive). 4 surface types:

### 2.1 Grass Footstep
Volume: `FOOTSTEP_VOLUME = 0.12` with pitch variation +/-0.15.

**Heel strike**: Sine oscillator, 80Hz -> 30Hz (70ms ramp), gain `vol*1.8` -> 0.001 (100ms).
**Toe tap**: Sine, 140Hz -> 50Hz (50ms), delayed 55-75ms, gain `vol*0.9` -> 0.001 (70ms).
**Grass swish**: Noise buffer through bandpass 900Hz (Q=0.4), playback rate 0.5-0.8, gain `vol*0.3`.

### 2.2 Rock Footstep
**Heel**: Sine, 160Hz -> 55Hz (40ms), gain `vol*1.5` -> 0.001 (70ms).
**Toe**: Triangle wave, 280Hz -> 90Hz (30ms), delayed 45-60ms, gain `vol*1.0`.

### 2.3 Snow Footstep
**Crunch**: Noise, bandpass 1200Hz -> 600Hz (Q=1.2), playback 0.35-0.5, gain `vol*1.8` -> `vol*0.8` -> 0.
**Swoosh**: Noise, bandpass 3500Hz -> 1800Hz (Q=0.5), playback 0.8-1.2, gain `vol*1.0`.
**Sub-crunch**: Sine 100Hz -> 40Hz, gain `vol*1.0`.

### 2.4 Water Footstep
**Primary slosh**: Noise, bandpass 900Hz -> 400Hz (Q=0.8) + highpass 250Hz, playback 0.6-0.9, gain `vol*2.5`.
**Return slosh**: Same but 700Hz -> 350Hz (Q=0.7), delayed 80ms, gain `vol*1.8`.
**Droplet spray**: Noise, bandpass 2200Hz (Q=0.5), playback 1.0-1.5, gain `vol*0.5`.

## 3. Crickets

Active when `sunElevation < CRICKET_SUN_FADE_IN(-0.05)` AND below snowline. Fade in/out over 3 seconds.

- `CRICKET_VOICES = 4` sine oscillators
- Frequencies: `CRICKET_FREQ_MIN(4200)` to `CRICKET_FREQ_MAX(5400)` Hz (evenly spaced)
- Volume: `CRICKET_VOLUME = 0.06`
- Burst pattern: 2-6 rapid pulses
- Pulse rate: `CRICKET_CHIRP_RATE_MIN(12)` to `CRICKET_CHIRP_RATE_MAX(20)` per second
- Attack time constant: 0.005s, release: 0.008s (click-free `setTargetAtTime`)
- Gap between bursts: 0.3-2.0 seconds

## 4. Bird Chirps

Active when `sunElevation > 0.02` AND below snowline. Suppressed by rain: `x (1 - rainIntensity * 0.8)`.
Interval: `(1.5 + random * 6) / max(0.1, birdSuppression)`

3 chirp types (equal probability):

### Type 0: Simple Tweet
Single rising sweep, freq 2000-3500Hz, volume 0.06-0.09.
Oscillator (sine): ramps `freq*0.8 -> freq*1.2 (60ms) -> freq*0.9 (120ms)`.
Envelope: `0 -> vol (15ms) -> vol*0.6 (60ms) -> 0 (140ms)`. Duration: 150ms.

### Type 1: Double Chirp
Two tweets 150ms apart, frequencies 2500-3500Hz / 2800-3600Hz.

### Type 2: Warbling Trill
3-6 rapid notes, freq 1800-3000Hz with sinusoidal variation.

All spatially positioned (HRTF): random angle, 10-30m from listener, 3-8m above.

## 5. Crow Caw (Bird Flock Audio)

Interval: 4-12 seconds.

Per caw synthesis:
- Duration: 0.15-0.25s
- **Oscillator 1**: Sawtooth, base 380-500Hz, exponential ramp to 60%
- **Oscillator 2**: Square at base*1.01, ramps to base*0.58 (creates beating)
- **Envelope**: 0 -> 0.035 (10ms attack), hold until 30% duration, exponential decay
- **Bandpass filter**: 600Hz, Q=3 (nasal quality)
- **HRTF panner**: refDistance 30, maxDistance 200, rolloff 0.5
- 1-3 caws in quick succession (spaced 0.25-0.4s)

## 6. Morepork Owl

Active when `sunElevation < -0.03`. Loads `morepork-single.mp3`.

- Conversations: 2-6 exchanges (always even for back-and-forth)
- 2 owls minimum, 20% chance of 3rd joining after 2 exchanges
- Placement: 40-100m from player, minimum 60 degree angular separation, 8-20m above terrain
- Pitch variation: 0.95-1.05
- Call delay: 1.5-5.0 seconds between calls
- Pause between conversations: 20-60 seconds
- HRTF panner: refDistance 20, maxDistance 150, rolloff 0.6, gain 0.15-0.25

## 7. Rain Audio (4 Layers + Spatial Drips)

### Layers
| Layer | Type | Freq | Q | Playback Rate | Gain Formula | Notes |
|-------|------|------|---|---------------|-------------|-------|
| Patter | Bandpass | 3200Hz | 0.6 | 1.2 | ri x 0.12 x altFade x canopyDampen | High sparkle |
| Wash | Bandpass | 800Hz | 0.4 | 0.6 | ri^2 x 0.15 x altFade x canopyDampen | Broad wash |
| Body | Bandpass | 1600Hz | 0.5 | 0.9 | ri x 0.08 | LFO at 0.15Hz |
| Sizzle | Highpass | 6000Hz | 0.3 | 1.8 | ri^2 x 0.05 | LFO at 0.22Hz |

Where `ri = rainIntensity`, `altFade = 1 above snowline -> fade`, `canopyDampen = 1 - shelterFactor * 0.6`.

### Spatial Drips (3 types, weighted random)
- 40%: Single drip (sine 2000-5000Hz)
- 30%: Double drip (two pings 40-70ms apart)
- 30%: Splash patter (noise bandpass 3000-6000Hz)

## 8. Wind

Continuous bandpass-filtered noise loop:
- Bandpass: 400Hz, Q=0.5
- Base gain: 0.07
- Modulation every 3-8 seconds: target gain `0.03 + random * 0.08` (ducked by water proximity and rain)
- Target frequency: `250 + random * 400`

## 9. Water Ambient

Active when `waterProximity > 0.05`.

**Main layer**: Noise, playback 0.3, bandpass 280Hz (Q=2.0), lowpass 400Hz (Q=0.7).
**Shimmer layer**: Noise, playback 0.4, bandpass 600Hz (Q=3.0).

Wave modulation cycle:
- Attack: 0.2-0.45s
- Sustain: 0.1-0.3s
- Release: 0.3-0.8s
- Gap: 0.4-1.6s
- Filter sweeps: 600-900Hz on arrival, 250-350Hz on recession

Wind ducking: `windScale = 1 - waterProximity * 0.5`.

## 10. Ski Slide

Active when `skiSpeed > 0.15`.
- Noise loop, playback rate 0.25 (gritty, granular)
- Bandpass: 600Hz, Q=1.8
- Lowpass: 2000Hz, Q=0.5
- Speed modulation (t = min(1, skiSpeed / 10)):
  - Volume: `FOOTSTEP_VOLUME * (0.4 + t * 1.2)`
  - Playback: `0.2 + t * 0.25`
  - Bandpass center: `500 + t * 600`
  - Lowpass cutoff: `1500 + t * 1200`

## 11. Wildlife Sounds

### Bear Growl
- Noise: bandpass 350Hz -> 250Hz (Q=1.2), gain 0->0.25->0.18->0.08->0 over 1.5s
- Vocal: Square wave 140Hz -> 105Hz, LFO 8-14Hz (depth 15), bandpass 280Hz (Q=0.8), gain 0->0.15->0.1->0 over 1.4s

### Lion Snarl
- Noise: bandpass 600Hz -> 400Hz (Q=1.0), gain 0->0.2->0.15->0 over 1.0s
- Vocal: Square wave 220Hz -> 160Hz, LFO 12-20Hz (depth 25), bandpass 450Hz (Q=0.7), gain 0->0.12->0.08->0 over 0.9s

### Wally "Hello There"
Formant-based vocal synthesis, pitch multiplier 1.8x:
| Syllable | Freq | Formant | Volume | Duration |
|----------|------|---------|--------|----------|
| "hel" | 520Hz | 1800Hz | 0.25 | 0.12s |
| "LO" | 620Hz | 1200Hz | 0.35 | 0.20s |
| "the-" | 480Hz | 2200Hz | 0.20 | 0.10s |
| "-ere" | 560Hz | 1600Hz | 0.30 | 0.22s |

Sawtooth oscillators through bandpass formant filters (Q=4). Breathy consonants ("h", "th"): noise through highpass 3000Hz.

## 12. Collectible Sounds

### Chime
- Tone 1: Sine `baseFreq(880)` -> `baseFreq*1.5` (150ms), vol = `COLLECTIBLE_CHIME_VOLUME(0.18)`
- Tone 2: Sine `baseFreq*2` -> `baseFreq*3`, delayed 80ms, vol x 0.7
- Shimmer: Noise bandpass 6000Hz (Q=2.0), playback 1.2

### Milestone Fanfare (every 10 points)
Rising major arpeggio: [660, 830, 990, 1320] Hz, 90ms spacing.
Sparkle shimmer: 8000Hz (Q=1.5), playback 1.5.

### Sprint Empty (0 points)
Descending minor third: [660, 520] Hz, falling to 85% over 250ms, volume 0.15.

### Landing Splash
Slosh (noise bandpass 800Hz->300Hz + highpass 200Hz, gain vol*3) + Spray (3000Hz, gain vol*1.2) + Thump (sine 60Hz->25Hz, gain vol*2).

### Landing Thud
Two sine oscillators (90Hz->25Hz, 75Hz->25Hz) staggered 30ms + noise crunch (bandpass 500Hz).
