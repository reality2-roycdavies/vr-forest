# VF-MOVEMENT — Movement & Input

**Version:** 1.0  
**Date:** 20 February 2026  
**Status:** Active  
**Purpose:** VR locomotion, desktop controls, terrain following, collision, jump/gravity, sprint/stamina, swimming, snow/ski physics, and walk bob.  
**Dependencies:** VF-CONFIG, VF-TERRAIN, VF-WATER, VF-FOREST  

---

## 1. VR Controls

| Control | Action |
|---------|--------|
| Left stick | Move (forward/back/strafe) |
| Right stick X | Snap turn (30°, cooldown 0.3s, deadzone 0.5) |
| Right grip + right stick Y | Scrub time of day (clamped ±12 hours) |
| Right A button (buttons[4]) | Cycle weather (sunny → cloudy → rainy) |
| Either grip (buttons[1]) | Sprint (costs power) |
| Left X (buttons[4]) or thumbstick click (buttons[3]) | Jump |

> ⚠️ **Gotcha: Weather button mapping.** Weather cycling was originally on the left trigger (buttons[0]) — where the index finger naturally rests on Quest controllers. Users accidentally changed weather constantly. It was moved to the right A button (buttons[4]).

## 2. Desktop Controls

| Control | Action |
|---------|--------|
| WASD | Move |
| Mouse (click to lock) | Look around (sensitivity 0.002, pitch ±81°) |
| Q / E | Snap turn |
| Space | Jump |
| Shift | Sprint |
| [ / ] | Scrub time of day |
| 1 / 2 / 3 | Set weather |

Diagonal movement (W+A) MUST be normalised to prevent 41% speed boost.

## 3. Locomotion Parameters

| Parameter | Value |
|-----------|-------|
| Walk speed | 3.0 m/s (MOVE_SPEED) |
| Sprint speed | 7.0 m/s (SPRINT_SPEED) |
| Swim speed | 1.8 m/s (SWIM_SPEED) |
| Jump velocity | 4.0 m/s upward (JUMP_VELOCITY) |
| Gravity | 9.8 m/s² (GRAVITY) |
| Terrain follow rate | lerp × min(1, delta × 12) |
| Player collision radius | 0.25m |
| Tree collision radius | 0.4m (TREE_COLLISION_RADIUS) |

## 4. Terrain Following

The player's Y position MUST smoothly lerp toward the current ground level. Ground level = max(terrain height, rock surface height). Rocks have standing heights per size: [0.07, 0.12, 0.22]m above their Y position.

The lerp rate MUST be `min(1, delta × 12)` — fast enough to feel responsive but smooth enough to avoid jarring snaps.

## 5. Collision

Tree trunk collision MUST use slide-along: if the combined movement collides, try X-only, then Z-only. Collision check MUST search the 3×3 chunk neighbourhood around the player.

**Why slide-along**: Simply blocking movement when you hit a tree is jarring — the player stops dead. Slide-along tries movement on each axis independently, so you slide along the tree trunk. This feels natural and prevents getting stuck.

```
function checkAndApplyMovement(currentPos, desiredPos):
    // Try full movement
    if not collidesWithAnyTree(desiredPos):
        return desiredPos

    // Try X only (slide along Z axis)
    xOnly = (desiredPos.x, currentPos.y, currentPos.z)
    if not collidesWithAnyTree(xOnly):
        return xOnly

    // Try Z only (slide along X axis)
    zOnly = (currentPos.x, currentPos.y, desiredPos.z)
    if not collidesWithAnyTree(zOnly):
        return zOnly

    // Fully blocked
    return currentPos

function collidesWithAnyTree(pos):
    combinedRadius = TREE_COLLISION_RADIUS + 0.25  // player radius
    for each tree in nearby chunks (3×3 neighbourhood):
        dx = pos.x - tree.x
        dz = pos.z - tree.z
        if dx² + dz² < combinedRadius²:
            return true
    return false
```

### 5.1 Cottage Collision

Cottage collision uses the same slide-along pattern as trees. Cottages are checked as cylinders with radius `COTTAGE_COLLISION_RADIUS` (2.0m) centred on the cottage position. The collision loop searches all cottage positions in the 3×3 chunk neighbourhood.

### 5.2 Rock Collision

Rocks have per-size collision radii: `ROCK_COLLISION_RADII = [0.15, 0.35, 0.7]` for small, medium, and large respectively.

## 6. Walk Bob

Sinusoidal bob at WALK_BOB_SPEED (2.2 Hz) while walking, proportionally faster when sprinting. Amplitude = WALK_BOB_AMOUNT (0.025m).

In VR, bob MUST be applied to `camera.position.y` (child of dolly), NOT `dolly.position.y`. On desktop, bob is applied directly.

> ⚠️ **Gotcha: Walk bob in VR.** Applying bob to the dolly (camera rig) Y moves the entire world reference frame. Since the water plane sits at fixed Y, this makes the water visibly bob in sync with walking. Apply bob to the camera within the dolly instead.

## 7. Jump / Gravity

Jump MUST apply an initial upward velocity of JUMP_VELOCITY (4.0 m/s). Gravity MUST be GRAVITY (9.8 m/s²). The player rises ~0.8m per jump.

Jumping MUST be disabled while swimming (see VF-WATER §5).

## 8. Swimming

Swimming is triggered when water depth > SWIM_DEPTH_THRESHOLD (1.2m). See VF-WATER §5 for the full swimming algorithm.

Key constraints:
- Speed MUST be SWIM_SPEED (1.8 m/s)
- Jump MUST be disabled
- Tree collision MUST be disabled (can swim through underwater trunks)
- Gentle bob at SWIM_BOB_SPEED (0.6 Hz), amplitude SWIM_BOB_AMOUNT (0.025m)
- Eyes float at SWIM_EYE_ABOVE_WATER (0.45m) above water surface

## 9. Snow/Ski Physics

**Why ski physics**: Mountains without interesting movement would feel like a slog — walking uphill at 3 m/s against gravity. Skiing gives altitude a gameplay purpose: climb up slowly, ski down fast.

Above `SNOWLINE_START = 24m`:
- Input MUST drive ski velocity (×5.0 acceleration)
- Gravity MUST drive downhill slide: slope × 3.5 × delta (computed from terrain gradient via finite differences)
- Friction: 0.97 with input, 0.995 coasting
- Max speed: 10 m/s
- Off snow: ski velocity MUST bleed at 0.85× per frame

## 10. Sprint

Sprint speed = SPRINT_SPEED (7.0 m/s). Sprint MUST cost collectible points (1 point per 2 seconds). See VF-COLLECTIBLES §3 for the full sprint power system.
