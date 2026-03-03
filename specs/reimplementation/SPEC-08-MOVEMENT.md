# SPEC-08: Player Movement & Controls

## 1. Input System

### 1.1 Mouse Look (Desktop)
- Sensitivity: 0.002 radians per pixel
- Pitch limit: ±81° (PI * 0.45)
- Pointer lock requested on canvas click
- Yaw applied to dolly rotation, pitch applied to camera rotation
- Mouse look disabled in VR (headset tracking replaces it)

### 1.2 Keyboard Controls (Desktop)
| Key | Action |
|-----|--------|
| W / S | Forward / Backward (leftStick.y = -1 / +1) |
| A / D | Strafe Left / Right (leftStick.x = -1 / +1) |
| Q / E | Snap turn left / right (rightStick.x = -1 / +1) |
| Space | Jump |
| Shift (L or R) | Sprint |
| [ / ] | Time scrub backward / forward |
| 1 / 2 / 3 | Weather: Sunny / Cloudy / Rainy |

Diagonal input normalized: if length > 1, divide by length (prevents 41% speed boost).

### 1.3 VR Controller Mapping
| Controller | Input | Action |
|------------|-------|--------|
| Left stick | Axes 2,3 (fallback 0,1) | Movement (forward/strafe) |
| Right stick | Axes 2,3 (fallback 0,1) | Snap turn (X axis) |
| Left trigger (button 0) | Jump |
| Right trigger (button 0) | Jump |
| Left grip (button 1) | Sprint |
| Right grip (button 1) | Time scrub mode (grip + right stick Y) |
| Right A (button 4) | Cycle weather forward |

Thumbstick deadzone: `THUMBSTICK_DEADZONE = 0.15`. Remapping: `sign(v) * min(1, (|v| - dz) / (1 - dz))`.
Smoothing: VR rate 12, desktop rate 20 via `smooth += (raw - smooth) * min(1, delta * rate)`.

## 2. Locomotion

### 2.1 Speed
| Mode | Speed (m/s) |
|------|-------------|
| Walk (desktop) | 3.0 |
| Walk (VR) | 4.05 (3.0 × 1.35) |
| Sprint | 7.0 |
| Swim | 1.8 |
| Wading | base × 0.6 |

### 2.2 Movement Direction
Camera world forward direction with Y zeroed and normalized. Right = cross(forward, UP).
Move vector: `forward * -leftStick.y + right * leftStick.x`, normalized, scaled by `moveSpeed * delta`.

### 2.3 Terrain Following
Target Y = `terrainHeight + TERRAIN_FOLLOW_OFFSET(1.6)` (or rock surface if higher).
Smooth follow: `position.y += (targetY - position.y) * min(1, delta * rate)`.
- VR rate: 18
- Desktop rate: 12

## 3. Collision

### 3.1 Steep Slope Detection
```
epsilon = 0.5
sx = (height(x+eps, z) - height(x-eps, z)) / (2*eps)
sz = (height(x, z+eps) - height(x, z-eps)) / (2*eps)
normalY = 1 / sqrt(sx*sx + 1 + sz*sz)
isTooSteep = normalY < 0.55    // ~56.6° slope
```

### 3.2 Wall Sliding
When movement is blocked (steep slope or tree collision):
1. Try full move → if blocked:
2. Try X-only move → if blocked:
3. Try Z-only move → if still blocked: no movement

### 3.3 Tree Collision
- Player radius: 0.25m
- Tree collision radius: `TREE_COLLISION_RADIUS = 0.4m`
- Combined distance: 0.65m
- Checks 3×3 chunk neighborhood around player
- Tussock trees (type 3) are excluded from collision

### 3.4 Cottage Collision
- Cottage collision radius: `COTTAGE_COLLISION_RADIUS = 2.0m`
- Combined distance: 2.25m
- Checked alongside tree collision

### 3.5 Rock Surface
Player radius: 0.2m. Can stand on rocks:
- Rock top heights by size: [0.15, 0.30, 0.55]
- Rock collision radii: [0.35, 0.7, 1.4]
- Returns highest rock top Y within stand distance, or -Infinity

## 4. Snap Turn (VR and Desktop Q/E)
- Angle: `SNAP_TURN_ANGLE = 30°`
- Trigger: `|rightStick.x| > SNAP_TURN_DEADZONE(0.5)`
- Cooldown: `SNAP_TURN_COOLDOWN = 0.3s`
- Direction: `-sign(rightStick.x)` (push right = turn right)
- Disabled when: pointer locked (mouse look active) or right grip held (time scrub mode)

## 5. Jump & Gravity
- Jump velocity: `JUMP_VELOCITY = 4.0 m/s` upward
- Gravity: `GRAVITY = 9.8 m/s²`
- Disabled while swimming
- Airborne: `velocityY -= GRAVITY * delta`, `position.y += velocityY * delta`
- Landing: when `position.y <= currentGroundY`, snap to ground, play sound
- Landing near water: splash sound. Otherwise: thud sound.

## 6. Walk Bob
| Mode | Speed (Hz) | Amplitude (m) |
|------|-----------|---------------|
| Walk | 2.2 | 0.025 |
| Sprint | 5.133 (2.2 × 7/3) | 0.025 |
| Swim | 0.6 | 0.025 |
| Ski | 1.0 | 0.012 |

Formula: `bobPhase += delta * bobSpeed`, offset = `sin(bobPhase * PI * 2) * amplitude`.
VR: bob applied to camera Y at 30% strength.
Desktop: `camera.position.y = TERRAIN_FOLLOW_OFFSET + bobOffset`.
When stopped: amplitude decays at `(1 - delta * 6)`, zeroed below 0.001.

## 7. Swimming
- Trigger: `waterDepth = WATER_LEVEL - terrainY > SWIM_DEPTH_THRESHOLD(1.2)`
- Float to surface: `lerp rate = delta * 10`
- Vertical velocity killed immediately
- Jump disabled
- Wading (in streams): `getStreamFactor > 0.5 && terrainY > WATER_LEVEL` → speed × 0.6

## 8. Snow/Ski Physics
Active when: not swimming AND `terrainY > SNOWLINE_START(20)` AND not on a rock.

### 8.1 Input to Ski Velocity
- Forward component drives ski velocity at scale 5.0
- Sideways input heavily damped at scale 0.8
- No steep/collision checks on snow input

### 8.2 Downhill Acceleration
```
gradient via finite differences (epsilon 0.5)
skiGravity = 3.5
skiVelX += slopeX * skiGravity * delta
skiVelZ += slopeZ * skiGravity * delta
```

### 8.3 Friction
- Forward friction (with input): 0.97
- Forward friction (no input): 0.995
- Lateral friction: 0.88
- Max speed: 10 m/s
- Below 0.05 m/s: simple friction 0.95
- Off snow: ski velocity bleeds at 0.85 per frame

## 9. Sprint System
- Requires: sprint key pressed AND collectible score > 0 AND not swimming
- Speed: `SPRINT_SPEED = 7.0 m/s`
- Cost: 1 collectible point per 2.0 seconds (accumulated with delta)
- At 0 points: plays `sprintEmpty` sound, sprint cancelled
- Accumulator resets when sprint key released

## 10. Ground Type Detection (for Audio)
Priority order:
1. Wading or `terrainY < WATER_LEVEL + 0.1` → `'water'`
2. On rock (`rockY > terrainY + 0.01`) → `'rock'`
3. High altitude (`terrainY > SNOWLINE_START`) → `'snow'`
4. Default → `'grass'`

## 11. Dynamic VR Resolution Scaling
- Target scale: 0.55 when sprinting, 0.65 when moving, 1.0 when still
- Drop rate: 7 (reaches target in ~0.15s)
- Recovery rate: 2 (reaches target in ~0.5s)
- Applied via `view.requestViewportScale(scale)` on each XR view per frame
