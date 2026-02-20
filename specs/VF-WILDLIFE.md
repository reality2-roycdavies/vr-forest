# VF-WILDLIFE — Wildlife

**Version:** 1.0  
**Date:** 20 February 2026  
**Status:** Active  
**Purpose:** Bird flocks, peek encounters (bear/lion/Wally), spawn rules, animation, and terrain-following behaviour.  
**Dependencies:** VF-CONFIG, VF-TERRAIN, VF-ATMOSPHERE, VF-AUDIO, VF-FOREST  

---

## 1. Bird Flocks

5 flocks of 8 birds each MUST orbit around the player at 15–35m altitude.

| Parameter | Value |
|-----------|-------|
| Flock count | 5 |
| Birds per flock | 8 |
| Altitude range | 15–35m |
| Minimum clearance above terrain | 12m |
| Orbit speed | ~5 m/s (0.7–1.3× variation per flock) |
| Wing flap speed | 1.8 cycles/second |
| Active when sun elevation > | 0.02 |

### 1.1 Bird Geometry

Flat body (fat diamond shape), swept-back wings (4 triangles total). Dark colour (0x1a1a1a), `fog: false` so silhouettes stay clean.

### 1.2 Flight Pattern

60% flapping phase (sinusoidal, ±0.2 rad amplitude), 40% glide phase (wings held slightly raised with gentle undulation ±0.03 rad). Each bird MUST have individual drift within the flock (sine-based wander at different frequencies, ±2–5m).

### 1.3 Mountain Avoidance

When terrain ahead exceeds `TREELINE_START`, the flock MUST smoothly reverse orbit direction (lerp toward opposite clockwise/counterclockwise at rate 1.5/sec).

### 1.4 Crow Caw Audio

1–3 caws every 4–12 seconds. Each caw = sawtooth oscillator (380–500 Hz → 60% frequency over 0.15–0.25s) + square oscillator (1.01× frequency offset for roughness), both through a bandpass at 600 Hz (Q=3), HRTF-spatialised at flock position. See VF-AUDIO §9 for full synthesis chain.

### 1.5 Night Behaviour

Birds MUST scale to 0 (fade out) when sun elevation drops below 0.02. The transition SHOULD be gradual, not instant.

## 2. Wildlife Peek Encounters

Bear, mountain lion, or Where's Wally hide behind trees and peek out.

### 2.1 Spawn Logic

Every 12–37 seconds, find a tree 5–30m from the player in the camera's forward direction (scoring: dot product × 0.3 + preference for ~0.7 dot × 0.7 + distance preference ~15m × 0.02). Equal 33% chance for each creature.

### 2.2 Animation States

`fadein` (0.8s, easeOutCubic) → `showing` (2–6s, breathing + head tilt) → `fadeout` (0.6s, easeInCubic)

The fade-in/fade-out MUST use easing curves, not linear interpolation. Linear fade looks like pop-in.

### 2.3 Creature Geometry

All creatures MUST be procedurally built from spheres, cylinders, and cones:

#### Bear
- Brown (0x7a4a28), spherical body + head, snout, nose, ears, 4 stocky legs, yellow eye shines

#### Mountain Lion
- Gold (0xd4b060), elongated body, triangular ears, tail, 4 slender legs, green eye shines

#### Where's Wally
- Red/white striped body (5 cylinder bands), blue trouser legs, skin-coloured head/hands, red bobble hat, glasses (ring geometry), smile (torus arc)

### 2.4 Night Eye Glow

Eye shine spheres MUST scale up 2.5× and brighten toward white as sun goes below horizon.

### 2.5 Terrain Following

Creatures MUST be placed at the terrain height of their host tree position. They MUST NOT float above or sink below the ground.

### 2.6 Growl/Greeting Sounds

Each creature MUST play a sound on appearance:
- **Bear**: Growl — see VF-AUDIO §8.1
- **Mountain Lion**: Snarl — see VF-AUDIO §8.2
- **Wally**: "Hello There" — see VF-AUDIO §8.3

All sounds MUST be HRTF-spatialised at the creature position.
