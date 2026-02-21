# VF-COLLECTIBLES — Collectibles & HUD

**Version:** 0.1 Draft  
**Date:** 2026-02-20  
**Status:** Draft  
**Purpose:** Fairy orb placement, animation, collection mechanics, sprint power system, persistence, HUD layout, and minimap rendering.  
**Dependencies:** VF-CONFIG, VF-ARCH, VF-TERRAIN, VF-MOVEMENT, VF-AUDIO  

---

## Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

---

## 1. Collectible Orbs

Fairy-like glowing orbs in 7 colours, placed on a noise-driven 12m grid. They provide a "collect to sprint" gameplay loop.

### 1.1 Colours

The 7 fairy colours are: teal, ice blue, lavender, pink, warm gold, mint green, peach. Colour assignment is deterministic from position (see §3).

### 1.2 Visual Geometry

Each orb consists of two concentric meshes rendered as `InstancedMesh`:

| Part | Geometry | Radius | Blending | Opacity |
|------|----------|--------|----------|---------|
| Core | IcosahedronGeometry, detail 2 | `COLLECTIBLE_ORB_RADIUS = 0.08` | Normal | 1.0 |
| Glow shell | IcosahedronGeometry, detail 2 | `COLLECTIBLE_GLOW_RADIUS = 0.2` | Additive | 0.25 |

Per-instance colours MUST be applied via `instanceColor`. Maximum instances: `COLLECTIBLE_MAX_INSTANCES = 500`.

---

## 2. Animation

Each orb MUST have fluttery, insect-like motion created by layered sine waves at non-harmonic frequencies. A single sine wave looks mechanical; layering 3 frequencies at different amplitudes creates organic, unpredictable motion similar to a firefly or fairy.

### 2.1 Phase Derivation from Position

Each orb has 3 independent phase values derived deterministically from its world position:

```
phase1 = (x × 7.3 + z × 13.7) mod (2π)
phase2 = (x × 17.1 + z × 5.3) mod (2π)
phase3 = (x × 11.9 + z × 23.1) mod (2π)
```

These MUST create per-orb variation so nearby orbs do not move in sync.

### 2.2 Bob (Vertical)

Three layered frequencies for organic flutter:

```
bobY = sin(time × 2.8 + phase1) × 0.04      // slow primary bob
     + sin(time × 4.3 + phase2) × 0.025     // medium flutter
     + sin(time × 7.1 + phase3) × 0.012     // fast shimmer
```

The frequency ratios (2.8, 4.3, 7.1) are chosen to be non-harmonic, preventing the motion from ever exactly repeating.

### 2.3 Lateral Drift

Insect-like darting on the XZ plane:

```
driftX = sin(time × 3.5 + phase2) × 0.03 + sin(time × 6.2 + phase3) × 0.015
driftZ = cos(time × 3.1 + phase1) × 0.03 + cos(time × 5.8 + phase2) × 0.015
```

### 2.4 Wobbling Tilt

Makes the glow shell catch light from different angles:

```
tiltX = sin(time × 2.1 + phase3) × 0.3   // radians
tiltZ = cos(time × 2.7 + phase1) × 0.3
```

### 2.5 Glow Shell Animation

The glow shell MUST have more exaggerated drift and a scale pulse:

```
glowDriftX = driftX × 1.5
glowDriftZ = driftZ × 1.5
glowPulse  = 1.0 + sin(time × 3.6 + phase2) × 0.2 + sin(time × 5.9 + phase3) × 0.1
```

---

## 3. Placement

Orbs are placed per-chunk on a 12m grid with noise-based density gating and jitter.

### 3.1 Placement Pseudocode

```
function generateCollectibles(chunk):
    orbs = []
    step = COLLECTIBLE_GRID_SPACING  // 12m

    for lz = step/2, step step, while < CHUNK_SIZE:
        for lx = step/2, step step, while < CHUNK_SIZE:
            wx = chunk.startX + lx
            wz = chunk.startZ + lz

            // Noise-based density check
            density = collectibleNoise2D(wx × 0.03, wz × 0.03)
            if density < COLLECTIBLE_DENSITY_THRESHOLD: continue  // 0.55

            // Jitter from grid
            jx = jitterNoise2D(wx × 0.3, wz × 0.3) × 2.0
            jz = jitterNoise2D(wx × 0.3 + 50, wz × 0.3 + 50) × 2.0
            finalX = wx + jx
            finalZ = wz + jz

            // Check terrain
            terrainY = getTerrainHeight(finalX, finalZ)
            if terrainY < SHORE_LEVEL: continue  // no orbs in water
            if isNearAnyCottage(finalX, finalZ): continue  // no orbs in cottage clearings

            // Check if already collected
            hash = str(round(finalX × 2)) + "," + str(round(finalZ × 2))
            if hash in collectedSet: continue

            // Determine colour (7 colours, deterministic from position)
            colourIndex = abs(floor(density × 70)) % 7

            orbs.push({
                x: finalX,
                y: terrainY + 0.8,  // float above ground
                z: finalZ,
                colour: FAIRY_COLOURS[colourIndex],
                hash: hash
            })

    return orbs
```

The `collectibleNoise2D` instance uses seed offset +8 from `TERRAIN_SEED` (see VF-TERRAIN §2). The `jitterNoise2D` instance uses seed offset +3.

### 3.2 Exclusion Rules

Orbs MUST NOT be placed:
- Below `SHORE_LEVEL` (-2.8m) — no orbs in water
- At positions whose hash is already in the collected set (see §5)

---

## 4. Collection Mechanics

### 4.1 Pickup Distance

Collection MUST trigger when the XZ distance (ignoring Y) between the player and an orb is less than `COLLECTIBLE_COLLISION_RADIUS = 1.2m`:

```
dx = player.x - orb.x
dz = player.z - orb.z
if sqrt(dx² + dz²) < 1.2:
    collect(orb)
```

### 4.2 Score

Each collected orb adds `COLLECTIBLE_SCORE_VALUE = 1` point to the player's score.

### 4.3 Collection Audio

On collection, a chime sound MUST play (see VF-AUDIO). Two rising sine tones:
- 880 Hz → 1320 Hz, then 1760 Hz → 2640 Hz at +80ms
- Plus bandpass noise shimmer at 6000 Hz
- HRTF-spatialised at the orb's position

### 4.4 Fanfare

Every 10 points, a fanfare MUST play: rising major arpeggio (660, 830, 990, 1320 Hz) at 90ms spacing plus 8000 Hz sparkle shimmer.

---

## 5. Persistence

Collected orb positions MUST be stored as hashes in a Set, surviving chunk reload.

### 5.1 Hash Computation

```
hash = str(round(x × 2)) + "," + str(round(z × 2))
```

The rounding (`×2` then `round`) creates a coarse grid that handles floating-point imprecision in position regeneration.

### 5.2 Why Hash-Based Tracking

Orbs are generated procedurally from deterministic noise. When a chunk unloads and reloads, the same orbs regenerate at the same positions. The hash set tracks which positions have been collected, preventing re-collection. During chunk placement (§3.1), already-collected hashes MUST be filtered out.

---

## 6. Sprint Power System

Sprinting consumes collected points, creating a "spend power to sprint, collect orbs to refuel" gameplay loop.

### 6.1 Sprint Cost

Sprinting costs 1 point per 2 seconds. The cost timer counts up; when ≥ 2.0s and score > 0, deduct 1 point and reset the timer.

### 6.2 Sprint Exhaustion

When the score reaches 0 during a sprint, sprinting MUST stop and a sad descending tone MUST play:

```
Sad tone: Sine 440 Hz → 330 Hz (minor third descent) over 0.3s, volume 0.15
```

### 6.3 Full Pseudocode

```
function updateSprint(delta):
    if sprintButtonHeld and score > 0:
        isSprinting = true
        moveSpeed = SPRINT_SPEED  // 7.0 m/s

        // Drain power
        sprintTimer += delta
        if sprintTimer >= 2.0:  // 1 point per 2 seconds
            score -= COLLECTIBLE_SCORE_VALUE
            sprintTimer -= 2.0
            updateScoreDisplay()

            if score <= 0:
                // Play sad descending minor third
                playSadTone()  // 440 Hz → 330 Hz over 0.3s
                isSprinting = false
    else:
        isSprinting = false
        moveSpeed = MOVE_SPEED  // 3.0 m/s
```

---

## 7. HUD

### 7.1 Desktop HUD

| Element | Position |
|---------|----------|
| Score | Top-left |
| Weather indicator | Bottom-right |
| Time offset | Top-right |
| Minimap | Bottom-left |

### 7.2 VR HUD

In VR, HUD elements are camera-attached Sprites at `z = -0.3m`:

| Element | Position (x, y) | Notes |
|---------|-----------------|-------|
| Score | (-0.10, 0.06) | Always visible |
| Weather | (0, 0.06) | Auto-fades after a few seconds |
| Minimap | (0.10, 0.06) | 128px canvas, 0.06 scale |
| Time offset | (0, -0.08) | Auto-fades |

---

## 8. Minimap

Circular minimap, radius 80m world space. Terrain MUST be sampled every 3m. The minimap MUST rotate with camera direction (forward = up).

### 8.1 Rendered Elements

| Element | Visual |
|---------|--------|
| Terrain height | Coloured pixels: water = dark blue, sand = brown, forest = green gradient, altitude zones |
| Uncollected orbs | Teal dots |
| Player position | White dot with forward triangle |
| Compass North | Indicator orbiting edge, aligned with +X = astronomical north (see VF-ARCH) |

### 8.2 Performance

The minimap SHOULD be rendered every 10th frame to limit terrain sampling cost.

### 8.3 Direction Normalisation

The XZ direction MUST be normalised from camera direction to prevent the minimap shrinking when the player looks up/down.

---

## 9. Verification

### Orb Checks

- [ ] Orbs visible in forested areas as softly glowing coloured lights
- [ ] 7 distinct colours visible across the landscape
- [ ] Each orb has fluttery, insect-like motion (not simple up-down bob)
- [ ] Glow shell pulses independently from core
- [ ] Walking near an orb (< 1.2m) collects it with a chime
- [ ] Collected orbs don't reappear when you leave and return to the area
- [ ] Orbs do not appear in water (shore exclusion)
- [ ] Orbs do not appear within cottage clearing radius

### Score/Sprint Checks

- [ ] Score increases on collection
- [ ] Fanfare plays every 10 points
- [ ] Holding sprint moves faster but drains score (1 point per 2s)
- [ ] When score reaches 0 during sprint: sad tone and sprint stops

### HUD Checks (VR)

- [ ] Score/weather visible as small overlays below-centre of vision
- [ ] Overlays are readable but not distracting
- [ ] Weather indicator auto-fades after a few seconds

### What WRONG Looks Like

| Symptom | Likely Cause |
|---------|--------------|
| All orbs bob in perfect sync | Missing per-orb phase offsets from position |
| Orbs float in water | Shore exclusion not applied |
| Collected orbs reappear on chunk reload | Hash tracking not implemented |
| Sprint doesn't cost anything | Power drain not connected to score |
