# SPEC-09: Wildlife — Birds & Peek Encounters

## 1. Bird Flocks

### 1.1 Parameters
- `FLOCK_COUNT = 5` flocks
- `BIRDS_PER_FLOCK = 8` birds each (40 total)
- `BIRD_ALTITUDE_MIN = 15m`, `BIRD_ALTITUDE_MAX = 35m`
- `BIRD_CLEARANCE = 12m` above terrain surface
- `FLOCK_RADIUS_MIN = 25m`, `FLOCK_RADIUS_MAX = 80m` orbit from player
- `FLOCK_SPEED = 5 m/s` base orbit speed
- `WING_FLAP_SPEED = 1.8` cycles per second (slow, crow-like)
- Day threshold: `sunElevation > 0.02`

### 1.2 Bird Geometry (Procedural Crow Shape)
~0.5m wingspan, 6 triangles (18 vertices):
- **Body**: Fat diamond — 2 triangles. Nose at (0, 0.02, 0.08), tail at (0, 0.01, -0.12), width ±0.05.
- **Left wing** (swept back): 2 triangles. Body edge (-0.05, 0, 0) to wingtip (-0.4, 0.025, -0.08).
- **Right wing**: Mirror of left.
- All normals (0, 1, 0). Material: `MeshBasicMaterial({ color: 0x1a1a1a, DoubleSide, fog: false })`.
- Rendered as InstancedMesh (40 instances), frustumCulled = false.

### 1.3 Flock Behavior
Each flock orbits the player in a circle:
- Speed: `FLOCK_SPEED × (0.7 + random × 0.6)` = 3.5–6.5 m/s
- Clockwise or counter-clockwise (random)
- Radius drifts: `sin(time * 0.1 + seed) * 15m`
- Altitude drifts: `sin(time * 0.08 + seed) * 5m`
- Terrain following: `cy = max(baseAltitude, terrainY + BIRD_CLEARANCE)`

**Mountain avoidance**: Peeks ahead 0.15 radians. If terrain exceeds TREELINE_START, smoothly reverses direction at rate `delta * 1.5`.

### 1.4 Per-Bird Animation
- Individual drift: sinusoidal XZ offset (amplitude 2-5m, speed 0.15-0.4)
- Vertical drift: `sin(time * 0.4 + phase) * 1.5m`
- **Wing flap cycle** (flapT modulo 1.0):
  - 0–60%: Flapping — `sin(ft * 2PI * 1.5) * 0.2`
  - 60–100%: Glide — `0.05 + sin(gt * PI) * 0.03`
- Heading jitter: `sin(time * 0.5 + phase) * 0.1`
- Scale fades to 0 at night (visibility factor)

### 1.5 Crow Caw Audio
- Interval: `CAW_INTERVAL_MIN(4)` to `CAW_INTERVAL_MAX(12)` seconds
- 1-3 caws in quick succession (0.25-0.4s apart)
- Each caw: sawtooth 380-500Hz + square ×1.01 for beating, through bandpass 600Hz (Q=3)
- Envelope: 10ms attack, hold 30%, exponential decay
- HRTF: refDistance 30, maxDistance 200, rolloff 0.5

## 2. Peek Encounters

### 2.1 Spawn Logic
- Timer: `12 + random × 25` seconds between encounters
- Initial delay: `5 + random × 10` seconds
- Equal 33% chance: bear, lion, Wally
- Finds suitable tree via scoring function

### 2.2 Tree Selection
Searches 3×3 chunk grid around player:
- Distance: 5–30m from player
- Must be in front of camera (dot product > 0)
- Skips tussock (type 3)
- Scoring: `dot * 0.3 + (1 - |dot - 0.7|) * 0.7 - |dist - 15| * 0.02`
- Prefers trees slightly off to side (dot ~0.7) at ~15m

### 2.3 Animation State Machine
Three phases:

**Fade In (0.8s)**: Ease-out cubic `1 - (1-t)^3`. Moves from hide position (behind tree, 0.9× away from player) to peek position (perpendicular offset 0.5, slight toward-player offset 0.15).

**Showing (2–6s random)**: Gentle animations:
- Y rotation wobble: `sin(t * 2) * 0.1`
- Breathing: `sin(t * 3) * 0.015` vertical
- Head tilt: `sin(t * 1.3) * 0.04` Z rotation

**Fade Out (0.6s)**: Ease-in cubic `t^3`. Back to hide position. After: invisible, timer reset.

### 2.4 Night Eye Glow
- Darkness: `clamp((-sunElevation + 0.02) / 0.12, 0, 1)`
- Eye shine scale: `1 + darkness * 1.5` (up to 2.5×)
- Color lerps toward white by `darkness * 0.4`

## 3. Creature Geometry

### 3.1 Bear
Brown fur color: `0x7a4a28`. All `SphereGeometry` parts:
- Body: radius 0.3, scale (1, 0.85, 0.7), y=0.35
- Head: radius 0.18, at (0, 0.6, 0.15)
- Snout: radius 0.08, color `0x9a7050`, at (0, 0.56, 0.3)
- Nose: radius 0.03, color `0x111111`, at (0, 0.57, 0.37)
- Ears: 2× radius 0.06, at (±0.12, 0.75, 0.08)
- Eyes: radius 0.025, color `0x111111`, shine `0xffdd44`
- Legs: 4× cylinder (0.07, 0.06, h=0.25), at (±0.15, 0.12, ±0.12)

### 3.2 Mountain Lion
Gold color: `0xd4b060`. Sleeker proportions:
- Body: radius 0.25, scale (1.1, 0.75, 0.6), y=0.3
- Head: radius 0.14, at (0, 0.52, 0.12)
- Snout: radius 0.06, scale (1, 0.7, 1), color `0xe8d0a0`
- Nose: radius 0.02, color `0x3a2a1a`
- Ears: 2× cone (0.04, h=0.08), color `0xc0a040`
- Eyes: radius 0.02, shine `0x88ff44`
- Tail: cylinder (0.015, 0.01, h=0.35), rotated X by PI*0.35
- Legs: 4× cylinder (0.04, 0.035, h=0.25)

### 3.3 Where's Wally
- Blue trousers: 2× cylinder (0.06, 0.06, h=0.3) at (±0.07, 0.15, 0)
- Red/white striped body: 5 bands of cylinder (0.12, 0.12, h=0.06), alternating red `0xcc2222` / white `0xf0f0f0`, stacked from y=0.33
- Arms: 2× cylinder (0.03, 0.03, h=0.25), hands as sphere (0.035) in skin `0xf0c8a0`
- Head: sphere (0.11) at (0, 0.73, 0)
- Bobble hat: cylinder (0.06, 0.12, h=0.1) red, bobble sphere (0.035) white at (0, 0.92, 0)
- Glasses: 2× ring (inner 0.02, outer 0.03, 8 segments) black at (±0.05, 0.74, 0.11)
- Eye dots: 2× sphere (0.012) with `MeshBasicMaterial({ color: 0xffcc88 })` for night glow
- Smile: torus (0.03, 0.008, 4, 6, PI) red at (0, 0.69, 0.1)

### 3.4 Sound Triggers
- Bear: `playGrowl('bear', position)` — see SPEC-07 §11
- Lion: `playGrowl('lion', position)` — see SPEC-07 §11
- Wally: `playWallyHello(position)` — see SPEC-07 §11
