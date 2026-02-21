# VF-VERIFY — Verification Guide

**Version:** 0.1 Draft  
**Date:** 2026-02-20  
**Status:** Draft  
**Purpose:** Per-system verification checklists, gotcha callouts, numerical spot-checks, time-of-day verification, and audio verification. Use this to check your implementation against the reference.  
**Dependencies:** VF-TERRAIN, VF-WATER, VF-FOREST, VF-WILDLIFE, VF-ATMOSPHERE, VF-WEATHER, VF-AUDIO, VF-MOVEMENT, VF-COLLECTIBLES, VF-PERFORMANCE, VF-CONFIG  

---

## 1. Terrain

- [ ] Stand at origin — you SHOULD be in a forest clearing (mountains suppressed within 60m)
- [ ] Walk 100m in any direction — terrain continues generating seamlessly
- [ ] Look for stream channels winding through hills (water level = -3.5m)
- [ ] Walk 200+ metres out — mountain ridges should appear
- [ ] Mountains should have smooth parabolic peaks, not knife-edge ridges
- [ ] Altitude zones visible: green forest → dark subalpine → tan tussock → grey rock → white snow
- [ ] Zone boundaries should be ragged/natural, not straight horizontal lines
- [ ] Snow only on flat surfaces — steep slopes show rock
- [ ] No visible seams or lighting discontinuities at chunk boundaries

---

## 2. Water

- [ ] Water fills low terrain areas with gentle multi-directional waves
- [ ] Wave pattern shouldn't slide as you walk (water plane snaps to grid)
- [ ] Shore has sandy transition (wet sand → foam → dry sand)
- [ ] Foam strips follow the waterline contour and animate with waves
- [ ] Water edge has soft transparency fade (not a hard line)
- [ ] During storms: water darkens, waves get choppier, rain ripple rings appear
- [ ] Ripple rings should be randomly positioned per cycle, not fixed in place
- [ ] Swimming: float with eyes above surface, reduced speed, no jumping, gentle bob

---

## 3. Trees & Vegetation

- [ ] Three distinct tree types visible (pine with stacked cones, oak with sphere clusters, birch with white bark)
- [ ] Trees have organic S-curve trunk bends (not perfectly straight)
- [ ] Pine canopy cones have no visible flat bases when viewed from below
- [ ] Vegetation has uniform lighting on both sides (no harsh dark undersides)
- [ ] Flowers have coloured petals + green stems + basal leaves
- [ ] Rocks look jagged and varied, not smooth spheres
- [ ] Fallen logs and stumps present near trees, below treeline
- [ ] Wind animation: gentle sway in sunny, moderate in cloudy, strong in rainy
- [ ] Trees thin and shrink near treeline, disappear above it

### 3.1 Cottages

- [ ] Rare log cabins appear in forest clearings (roughly 1 per 3–4 chunks)
- [ ] Each cottage has unique dimensions, log size, and lean
- [ ] Walls are stacked horizontal logs with visible door and window openings
- [ ] Roof has visible sag/droop, no gaps at the ridge
- [ ] Chimney leans slightly, smoke rises and drifts with wind
- [ ] No trees or vegetation within clearing radius (~10m)
- [ ] No collectible orbs within clearing radius
- [ ] No cottages on water, steep slopes, or above treeline
- [ ] Cottage sinks into hillside (Y follows lowest footprint point)
- [ ] Windows glow amber at night, dim during day
- [ ] Warm earthy garden ground surrounds cottage (visible colour blend)
- [ ] Player collides with cottage (cannot walk through)
- [ ] Cottage appears as orange house icon on minimap

---

## 4. Birds & Wildlife

- [ ] Bird flocks orbit at 15–35m altitude, terrain-following
- [ ] Crow-like flight: slow flaps then extended glide (60% flap, 40% glide)
- [ ] Flock members scatter organically, not in rigid formation
- [ ] Caw sounds spatialised from flock direction
- [ ] Birds disappear at night (scale fades to 0)
- [ ] Birds avoid flying over mountains (reverse orbit direction)
- [ ] Wildlife peeks from behind trees (bear, lion, or Wally)
- [ ] Smooth fade in/out animation (easeOutCubic in, easeInCubic out), not pop-in
- [ ] Accompanying growl/greeting sound from creature direction
- [ ] At night: glowing eye shines visible (yellow for bear, green for lion)

---

## 5. Atmosphere

- [ ] Sun position matches real time of day
- [ ] Four colour palettes blend smoothly (deep night → night → twilight → golden → day)
- [ ] Stars visible at night — look for real constellations (Southern Cross from southern hemisphere)
- [ ] Stars rotate correctly over time (sidereal rate)
- [ ] Moon at approximately correct position with phase shadow
- [ ] Phase shadow stable when you rotate your head
- [ ] Diverse clouds: round puffs, wispy streaks, flat layers, small clusters
- [ ] Clouds tint with time of day (orange at sunset, dark at night)
- [ ] Fog distance appropriate (closer in storms, consistent day/night)
- [ ] Fireflies at night in forested areas, not over water or snow
- [ ] Shooting stars visible occasionally at night in clear skies

---

## 6. Weather

- [ ] Auto-cycles between sunny → cloudy → rainy over several minutes (3–8 min hold)
- [ ] Transitions are gradual (takes ~2 minutes to go from sunny to cloudy)
- [ ] Cloudy: noticeably darker sky (35% light reduction), stars/moon hidden, fog closes in
- [ ] Rainy: thin vertical rain streaks (not round blobs!), thunder, lightning
- [ ] Thunder echoes and reverberates for 6–8 seconds (not a short burst)
- [ ] Lightning bolts visible as jagged lines with branches (30% of flashes)
- [ ] Ground gradually darkens with wetness during rain, slowly dries after (2 min wet, 4 min dry)
- [ ] Under trees during rain: mostly sheltered with occasional drips (35% pass-through)
- [ ] Above snowline: rain becomes snow (rounder, slower, whiter particles)
- [ ] Stars and moon fully hidden by any cloud coverage

> ⚠️ **Gotcha: Rain appearance.** The first rain attempt "looked like fast snow" — round white blobs. Rain particles need extreme horizontal squeeze in the fragment shader (aspect ratio ~80:0.8) to create hair-thin vertical streaks. The colour MUST be translucent blue-grey (0.7, 0.75, 0.85), not white.

---

## 7. Audio

- [ ] Footsteps change per surface (grass: soft thud + swish, rock: sharp tap, water: sloshing, snow: crunchy)
- [ ] Crickets chirp at dusk/night (high-frequency sine pulses, 4200–5400 Hz)
- [ ] Bird chirps during daytime, suppressed in rain
- [ ] Morepork owl calls at night from different directions (call-and-response)
- [ ] Water lapping near lakes/streams — rhythmic wave pulses, NOT continuous noise
- [ ] Rain audio: 4-layer depth (deep wash to high sizzle), with gusting variation
- [ ] 3D rain drip sounds scattered around the player
- [ ] Wind ambient continuous but ducked near water
- [ ] No audio clicks or pops during transitions
- [ ] Collectible chime from orb direction on pickup
- [ ] Fanfare arpeggio every 10 points

> ⚠️ **Gotcha: Bear growl sound.** The first attempt "sounded more like someone farting." The fix: bandpass the breathy noise above 250 Hz, add a square wave vocal cord tone with LFO flutter (8–14 Hz random), and bandpass the vocal tone to remove sub-bass rumble. The character comes from the LFO irregularity, not the base pitch.

---

## 8. Movement

- [ ] Smooth analogue locomotion in VR (3 m/s walk)
- [ ] Snap turn works with cooldown (30°, 0.3s cooldown)
- [ ] Diagonal movement is same speed as straight (normalised input)
- [ ] Jump with gravity (rises ~0.8m with 4 m/s initial velocity, 9.8 m/s² gravity)
- [ ] Can't walk through trees (slide-along collision)
- [ ] Can stand on rocks
- [ ] Walk bob visible but subtle (0.025m amplitude)
- [ ] Sprint faster but costs collectible points (1 per 2s)
- [ ] On snow: skiing feel with momentum and downhill acceleration (max 10 m/s)
- [ ] Swimming: float, slow (1.8 m/s), no jump, gentle bob, can swim through tree trunks

> ⚠️ **Gotcha: Walk bob in VR.** Applying bob to the dolly (camera rig) Y moves the entire world reference frame. Since the water plane sits at fixed Y, this makes the water visibly bob in sync with walking. Bob MUST be applied to the camera within the dolly, NOT to the dolly itself.

---

## 9. Performance

- [ ] Steady 90 fps on Quest-class hardware (11ms per frame)
- [ ] No visible chunk pop-in (fog masks it)
- [ ] No frame spikes during chunk loading (max 2 per frame)
- [ ] No garbage collection pauses (chunk recycling pool)

---

## 10. Numerical Spot-Checks

Use these specific checks to verify terrain generation:

### 10.1 Height at Origin

**At (0, 0):** Height SHOULD be a moderate positive value in the range 0–5m (forest clearing). Mountains are suppressed within 60m of origin.

### 10.2 Stream Detection

Walk in any direction for 50–100m. You SHOULD encounter stream channels where terrain dips below -3.5m (water level). The streams MUST meander (domain warping), not run in straight lines.

### 10.3 Mountain Distance

- Mountains MUST be absent within 60m of origin
- Mountains SHOULD be partially visible at 80m
- Mountains MUST be fully present beyond 100m
- The tallest peaks SHOULD reach 35–50m above base terrain (`MOUNTAIN_HEIGHT = 45` but modulated by detail noise and amplitude modifier)

### 10.4 Snow Altitude

Above 24m altitude, terrain MUST be white on flat surfaces. Walk/ski to a mountain peak — the transition from alpine rock to snow SHOULD be gradual and ragged, not a hard line.

### 10.5 Tree Density

In areas with tree density noise > 0.15 (most of the forest floor), trees SHOULD be spaced roughly 3m apart with 1.2m jitter. In clearings (noise < 0.15), no trees. The density field SHOULD create natural-looking clusters and clearings.

---

## 11. Time-of-Day Verification

Set your system clock (or use the time-scrub control) to verify each time:

| Time | Expected Scene |
|------|---------------|
| **06:00** | Sun near horizon (east-ish), golden/orange sky, long shadows |
| **12:00** | Sun high overhead, blue sky, short shadows |
| **18:00** | Sun near horizon (west-ish), orange/red sky |
| **00:00** | Deep darkness (near-black, not just dark blue), stars visible, crickets chirping |
| **~06:15 / ~17:45** (twilight) | Orange/purple gradient, first/last stars visible |

Transitions between all palette zones MUST be smooth with no sudden colour jumps. Fog colour MUST match sky at horizon at all times of day.

---

## 12. Audio Verification Checklist

Detailed audio spot-checks (see also VF-AUDIO for full synthesis chains):

- [ ] Walk on grass → soft thud-swish (two impacts per step, slight time offset 55–75ms)
- [ ] Walk on rock → sharp crack-tap (higher frequency, harder attack)
- [ ] Walk into water → splashy slosh (filtered noise with wave envelope)
- [ ] Walk on snow → crunchy crackle (slow-rate noise through bandpass)
- [ ] Stand still at dusk → crickets start (4200–5400 Hz sine chirps in burst-gap pattern)
- [ ] Stand still at night → morepork calls from distance, answered by second owl (≥60° apart)
- [ ] Walk near water → rhythmic lapping (wave-pulse envelope, NOT steady noise)
- [ ] Trigger rain → 4-layer rain audio builds (wash + body + patter + sizzle)
- [ ] During rain → thunder cracks with long reverberant tail (6–8 seconds)
- [ ] Collect orb → rising chime (880 → 1320 Hz sine + shimmer)
- [ ] Collect 10th orb → fanfare arpeggio (660 → 830 → 990 → 1320 Hz)
- [ ] Sprint with 0 points → sad descending tone (440 → 330 Hz)

---

## 13. Gotcha Summary

Critical implementation pitfalls collected from the development process. Each of these caused visible/audible bugs during the original build.

| Area | Gotcha | Details |
|------|--------|---------|
| **Rain appearance** | Rain looked like "fast snow" | Fragment shader needs extreme horizontal squeeze (~80:0.8 aspect ratio). Colour must be translucent blue-grey, not white. |
| **Bear growl** | Sounded "like someone farting" | Bandpass noise above 250 Hz, add square wave vocal cord with LFO flutter at 8–14 Hz random. Character comes from LFO irregularity. |
| **Moon phase stability** | Phase shadow shifted when rotating head | Sun direction on the moon disc MUST be projected onto the moon mesh's own local coordinate frame (`extractBasis` from `matrixWorld`), NOT the camera's right/up vectors. |
| **Walk bob in VR** | Water surface bobbed when walking | Bob MUST be applied to the camera within the dolly, NOT to the dolly itself. The dolly is the world reference frame. |
| **Chunk boundary normals** | Visible lighting seams at chunk edges | Boundary vertex normals MUST sample the continuous height function for neighbours outside the chunk. |
| **Pine canopy bases** | Disc silhouettes visible from below | Pine canopy cones MUST be open-ended (`openEnded: true`). |
| **Fern geometry** | "Alien life forms" or "cactuses" | Need multi-segment curved fronds with dense leaflet pairs, drooping tips, and tip curl. |
| **Cloud animation** | "They move too much" | Cloud motion should be barely perceptible (noticed over 10–20s, not per-frame). Horizontal clouds need 15% of billboard amplitude. |
| **PlaneGeometry scale** | Wispy clouds paper-thin from side | `PlaneGeometry(1,1)` lies in XY plane. When rotated flat (rotation.x = -π/2), visual depth is Y scale, not Z. Scaling Z does nothing. |
| **Star Euler order** | Southern Cross in wrong part of sky | Must use `'ZYX'` order with Z carrying latitude tilt. `'YXZ'` tilts toward East instead of North. |
| **Deep night palette** | 9pm and midnight looked identical | Without a separate deep night palette, nighttime lacks progressive darkening toward true midnight. |
| **Weather fog** | Too blue / too dark / too bright at night | Fog MUST desaturate toward luminance-matched grey (not fixed grey). Test specifically at midnight during rain. Iterated 7 times in original build. |
| **Water ripple precision** | All ripples in same position on Quest | Ripple ring sin-hash functions need `highp` float precision. `mediump` produces identical values across cells. |
| **Camera far plane** | Sky went black at distance | Keep far plane at 250m. Increasing to 600m caused depth buffer precision loss on some platforms. |
| **Footstep design** | Sounded like "a drum" | Separate heel and toe impacts with 55–75ms time offset and distinct frequency ranges. Without stagger = single drum hit. |
| **Water ambient** | Indistinguishable from wind | Temporal pattern (rhythmic wave pulses with gaps) is what makes water recognisable, not frequency content. |
| **Weather button** | Users accidentally changed weather | Weather cycling was moved from left trigger (natural resting position) to right A button. |
| **Vegetation lighting** | Harsh dark undersides on canopy/grass | Shader MUST force front-face normals on backfaces for DoubleSide materials. |
| **Leaf rustling** | "Completely wrong" | Feature was CUT from the reference. Do NOT attempt procedural foliage rustle sound. |

---

## 14. What WRONG Looks Like — Quick Reference

Consolidated table from all system specs (see also Appendix E of the monolithic spec):

| System | What WRONG Looks Like | What RIGHT Looks Like |
|--------|----------------------|----------------------|
| Pine canopy | Disc silhouettes from below | Open-ended cones, no flat bases |
| Fern geometry | "Alien life forms" (angular) or "cactuses" (spiny) | Multi-segment curved fronds, dense leaflet pairs, drooping tips |
| Wind strength | "Feels like a really windy day" | Subtle breeze, barely perceptible in sunny weather |
| Bird flight | "Reminds me more of bats" or rigid formation | Slow flap-then-glide, scattered loose formation |
| Bird scale | "Pterodactyls" | Crow-sized (~0.5m wingspan) |
| Bear growl | "Sounds like someone farting" | Breathy rasp + bandpassed vocal cord flutter |
| Footsteps | "Sounds like a drum" | Distinct heel thud + toe tap with time stagger |
| Leaf rustling | "Completely wrong" | Feature was CUT — don't attempt |
| Water ambient | Indistinguishable from wind | Rhythmic wave-pulse temporal pattern |
| Rain particles | "Looks like fast snow" (round white blobs) | Hair-thin translucent blue-grey vertical streaks |
| Thunder | Short synthetic burst | 5-layer reverberant 6–8 second decay |
| Sky at night | Too bright or too uniform | Progressive darkening toward deep night |
| Cloud diversity | All identical puffs | Four distinct archetypes at different altitudes |
| Moon phase | Shifts when camera rotates | Stable shadow using moon's own local frame |
| Vegetation lighting | Harsh dark undersides | Shader forces front-face normals on backfaces |
| Collectible motion | All orbs bob in sync | Per-orb phase offsets derived from position |
