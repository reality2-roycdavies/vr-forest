# VR Endless Forest

A WebXR immersive experience of an infinite procedurally-generated forest with real-world day/night cycles, dynamic audio, wildlife, and atmospheric effects. Built entirely with Three.js and the Web Audio API — two external assets (morepork owl call, moon photograph), everything else procedurally generated.

This project was created using AI (Claude) as an educational exercise in human-AI collaborative development over four days.

**Try it now:** [https://reality2-roycdavies.github.io/vr-forest/](https://reality2-roycdavies.github.io/vr-forest/)

Open this link in your VR headset's browser (Quest, Pico, etc.) and tap "Enter VR" — or use it on desktop with keyboard and mouse.

## Documentation

| Document | Description |
|----------|-------------|
| [Beginner's Guide](GUIDE.md) | Technical primer for novice VR/AI developers — VR fundamentals, framerate, WebXR, Three.js, procedural generation, shaders, spatial audio, performance, and the AI-assisted workflow |
| [Creation Process](CREATION_PROCESS.md) | Detailed narrative of how the project was built over four days, phase by phase, with a thematic analysis of the human-AI dialogue |

### Conversation Transcripts

Human-AI conversation logs from each development session (readable markdown, converted from raw JSONL):

| Session | Topic |
|---------|-------|
| [Day 1, Session 0 — The Seed](transcripts/day1-00-seed-prompt.md) | The original prompt — "create a VR forest from scratch" — and the plan |
| [Day 1, Session 0b — Initial Build](transcripts/day1-00-initial-build.md) | First implementation — project scaffold, terrain, trees, sky, movement |
| [Day 1, Session 1](transcripts/day1-01-initial-appraisal.md) | Initial appraisal — terrain, trees, vegetation, day/night cycle, sky |
| [Day 1, Session 2](transcripts/day1-02-footsteps-crickets-spatial-audio.md) | Footsteps, crickets, spatial audio, wildlife |
| [Day 1, Session 3](transcripts/day1-03-water-ponds-shores.md) | Water system — ponds, shores, waves, wind |
| [Day 2, Session 1](transcripts/day2-01-shadows-creatures-morepork.md) | Shadows, creatures, morepork owl |
| [Day 2, Session 2](transcripts/day2-02-shadows-creatures-continued.md) | Shadows and creatures continued |
| [Day 2, Session 3](transcripts/day2-03-moon-shadows-water-ambience.md) | Moon positioning, shadows, water ambience |
| [Day 3, Session 1](transcripts/day3-01-collectibles-minimap-terrain.md) | Collectibles, minimap, terrain banding fixes |
| [Day 3, Session 2](transcripts/day3-02-water-edge-effects.md) | Water edge effects — shore transitions, caustics, foam |
| [Day 4, Session 1](transcripts/day4-01-cloud-diversity.md) | Cloud diversity, terrain shader refactor, wildlife legs |
| [Day 4, Session 2](transcripts/day4-02-weather-system.md) | Weather system — architecture, rain particles, thunder, sky/fog tuning |
| [Day 4, Session 3](transcripts/day4-03-weather-polish-stormy-water.md) | Weather polish — stormy water, rain audio, twilight fog, sun/moon cloud fade |

## Features

### Infinite Procedural Terrain
- Seamless chunked terrain streaming around the player (32m chunks, 64x64 vertices, 5-chunk load radius)
- Multi-octave simplex noise with configurable persistence, lacunarity, and seed
- Stream channels carved by domain-warped ridge noise creating natural waterways
- Shader-based ground colouring with height gradients, shore transitions, and dirt patches under trees
- Procedural grass texture with blade strokes, soil speckles, and pebble details

### Water System
- Ponds and streams fill low terrain areas (below configurable water level)
- Real-time wave displacement shader with 10+ sinusoidal waves, plus 6 storm-chop layers driven by rain intensity
- Height-tinted crests and troughs with drifting surface flecks
- Storm response: water darkens and desaturates in rain, boosted crest foam, rain ripple rings (20-layer procedural expanding rings with per-cell randomised timing)
- Sandy shore zones with smooth colour transitions (wet sand → foam → dry sand)
- Shore foam strip with marching-squares waterline contour, wave-driven lapping animation
- Water edge transparency: surface fades at terrain boundary via heightmap texture
- Swimming physics: buoyancy, reduced speed, gentle bobbing, no jumping

### Three Procedural Tree Types
- **Pine**: Stacked cone canopy lobes, dark cool-green needle texture, tapered trunk
- **Oak**: Clustered spherical canopy lobes, warm broad-leaf texture, thick trunk with branch stubs
- **Birch**: Narrow cone lobes, bright yellow-green small-leaf texture, white bark with dark bands
- All trees have organic S-curve trunk bends, vertex colour gradients, and per-type procedural canvas textures
- Instanced rendering (up to 2000 per type)

### Vegetation
- **Grass tufts**: 5-blade clusters scattered by density noise, subtle emissive lift for uniform lighting
- **Ferns** (3 geometry variants): Multi-segment curved fronds with dense leaflet pairs, drooping tips, and tip curl. Variants: compact upright, full spreading, tall droopy
- **Flowers** (3 geometry variants, 6 colours): Multi-segment rounded petals (elliptical fan geometry), curved S-bend stems with basal rosette leaves and stem leaves. Phong shading with specular highlights. Variants: small/standard/showy
- **Rocks** (3 sizes): Jagged icosahedron geometry with vertex colour variation and procedural stone texture; cast shadows
- All vegetation placed by noise-driven density with jitter, clustering, and shore exclusion
- Shader-patched double-sided lighting (front-face normals forced on backfaces) for uniform vegetation appearance

### Real-World Day/Night Cycle
- Sun position calculated from actual device time, date, and geolocation (Auckland fallback)
- Four colour palettes smoothly interpolated: night, twilight, golden hour, day
- Sky dome with 3-stop ShaderMaterial gradient (fog colour at horizon, sky bottom, sky top)
- Sun rendered as soft-glow sprite
- Astronomically-positioned moon with simplified Meeus lunar ephemeris (~1 degree accuracy)
- Real moon photograph with phase shader: reconstructed sphere normals, smooth terminator, earthshine
- Moon illumination direction computed from actual scene sun-to-moon geometry
- Subtle moonlight shadows at night via DirectionalLight crossfade (cool blue-white tint)
- 300 stars visible at night; occasional shooting stars
- Diverse cloud system: cumulus puffs, wispy cirrus bands, flat haze layers, and small puffy clusters at stratified altitudes with gentle billowing animation and wind-aligned drift
- Time-of-day cloud colour tinting (white → sunset orange → dark night)
- Dynamic fog distance (distant during day, closes in at night for darkness effect)
- Manual time scrubbing: VR (right grip + right stick Y), desktop (bracket keys), clamped to +/- 12 hours
- Time offset HUD overlay with auto-fade

### Weather System
- Three weather states: Sunny, Cloudy, Rainy — driven by a single `weatherIntensity` float (0→1→2)
- Smooth auto-cycling transitions with configurable hold times, or manual control via keyboard (1/2/3) and VR left trigger
- URL override for testing: `?weather=rainy`, `?weather=cloudy`, `?weather=0.5`
- **Cloudy**: dark overcast sky, thick grey clouds, dimmed sunlight, faded shadows, reduced visibility
- **Rainy**: 4000-particle rain streaks (custom ShaderMaterial with hair-thin vertical streaks), thunder and lightning, ground wetness with hysteresis
- **Thunder**: 5-layer procedural audio (initial crack, deep boom, mid-body, rolling echoes, sub-bass tail) routed through a procedural ConvolverNode reverb impulse response for natural 6–8 second reverb tail
- **Rain audio**: 4-layer filtered noise (wash 800 Hz, body 1600 Hz with gusting LFO, patter 3200 Hz, sizzle 6000 Hz+ with independent LFO) plus HRTF-spatialised 3D drip sounds (single drips, double drips, leaf/puddle splashes) scattered around the player
- **Lightning**: Timer-based flash spikes with delayed thunder (0.3–2.5s for distance feel)
- Time-of-day aware: night rain is near-black, night cloudy hides stars/moon entirely, twilight storms are moody
- All systems respond to weather: fog distance, sky colours, cloud opacity/darkness, wind strength, wave amplitude, ground wetness (shader darkening + blue shift), firefly suppression, bird chirp reduction
- Weather HUD for desktop and VR

### Wind Animation
- Vertex shader displacement injected via `onBeforeCompile` on all plant materials
- Three wind profiles: tree trunks (slow sway), canopy (sway + rustle + flutter), vegetation (gentle grass sway)
- Wind direction slowly drifts over time for natural feel
- Weather-driven: gentle breeze in sunny, moderate in cloudy, strong gusts in rainy

### Bird Flocks
- 5 flocks of 8 birds orbiting at 18–40m altitude
- Swept-wing body geometry with fat diamond body
- Crow-like flight: slow flap phase then extended glide with wings held up
- Per-bird drift within flock for organic scattered movement
- Crow caw audio: layered sawtooth + square oscillators, bandpass filtered, spatialised via HRTF
- Daytime only — birds disappear at night

### Wildlife Encounters
- Bear, lion, and Wally (Where's Waldo) peek from behind trees
- Random spawn every 5–10 seconds near the player
- Smooth fade in/out with accompanying growl sounds
- Procedurally built geometry (no models)

### Collectibles
- Fairy-like glowing orbs in 7 colours with fluttery animation
- Spatial chime sounds on proximity, fanfare on collection
- Power/score HUD for desktop and VR
- Sprint mechanic (shift/grip) drains power over time

### Minimap
- Rotating overhead minimap showing terrain, water, trees, and player
- Adapts for both desktop (corner overlay) and VR (wrist-mounted)

### Fireflies
- 30 subtle glowing particles at night
- Two-layer rendering: dim glow halo + bright core point
- Individual pulse timing, drift orbits, and vertical bob
- Yellow and green colour variants with additive blending
- Fade in at sunset, disappear at sunrise

### Immersive Audio (All Procedural)
- **Spatial 3D audio** via Web Audio API PannerNodes (HRTF)
- **Footsteps**: Surface-aware (grass thud + swish, rock tap + ping, water splash + slosh)
- **Bird chirps**: Synthesised melodic tones on random schedule
- **Crow caws**: Harsh nasal oscillators from bird flock directions
- **Crickets**: 4-voice chorus, frequency 4200–5400 Hz, active at dusk/night only
- **Morepork (NZ owl)**: Single distant calls from random directions at night (30–90 second intervals)
- **Water ambient**: Rhythmic lapping waves near water bodies (bandpass-filtered noise with pulse envelope, wind ducking)
- **Wind**: Continuous filtered noise backdrop (auto-ducked near water)

### Movement & Physics
- Smooth analogue locomotion (VR left stick / WASD)
- Snap turning (30-degree increments with cooldown)
- Desktop mouse look with pointer lock
- Jumping with gravity (4.0 m/s up, 9.8 m/s² down)
- Tree trunk and rock collision with slide-along
- Rock surface standing (3 size classes with different heights)
- Terrain height following with smooth lerp
- Walk bobbing synchronised to footstep audio

### Performance
- Instanced rendering for all repeated geometry (trees, vegetation, rocks, flowers, birds, fireflies)
- Chunk recycling pool — geometry reused, not recreated
- Staggered chunk loading (max 2 per frame)
- Distance fog hides chunk pop-in
- Quest foveated rendering support
- All textures procedurally generated on canvas at startup (one external image: moon photograph)

## Controls

### VR (Quest / any WebXR headset)
| Control | Action |
|---------|--------|
| Left stick | Move (forward/back/strafe) |
| Right stick X | Snap turn (30 degrees) |
| Right grip + right stick Y | Scrub time of day |
| Left trigger | Cycle weather (sunny → cloudy → rainy) |
| Either grip button | Jump |

### Desktop
| Control | Action |
|---------|--------|
| WASD | Move |
| Mouse (click to lock) | Look around |
| Q / E | Snap turn |
| Space | Jump |
| [ / ] | Scrub time of day |
| 1 / 2 / 3 | Set weather (sunny / cloudy / rainy) |

## Running

Serve the project root with any static HTTP server:

```bash
# Python
python3 -m http.server 8000

# Node
npx http-server -p 8000

# PHP
php -S localhost:8000
```

Then open `https://localhost:8000` in a WebXR-capable browser. For VR, an HTTPS connection is required (use a tunnel or self-signed cert).

## Technical Details

- **Engine**: Three.js r170 (loaded from CDN via import map)
- **Noise**: simplex-noise 4.0.3 (CDN)
- **Audio**: Web Audio API (all procedural except morepork owl call — single external recording)
- **Rendering**: WebGL 2 with WebXR
- **Textures**: All procedurally generated on HTML5 Canvas (moon photo loaded externally with procedural fallback)
- **Geometry**: All built from Three.js primitives (no 3D models)
- **Lines of code**: ~10,850 lines of JavaScript across 30 modules

## Project Structure

```
js/
├── main.js              # Scene bootstrap, render loop, system orchestration
├── config.js            # All tunable constants (~140 parameters)
├── vr-setup.js          # WebXR renderer, camera rig, controllers
├── input.js             # VR gamepad + keyboard/mouse input
├── movement.js          # Player locomotion, physics, collision
├── terrain/
│   ├── chunk-manager.js # Dynamic chunk loading/unloading
│   ├── chunk.js         # Per-chunk mesh + object placement
│   ├── noise.js         # Seeded simplex noise (8 instances)
│   ├── terrain-generator.js  # Height, colour, normal generation
│   └── ground-material.js    # Shared ground material + texture
├── forest/
│   ├── tree-factory.js  # 3 procedural tree geometries + materials
│   ├── tree-pool.js     # InstancedMesh tree rendering
│   ├── vegetation.js    # Grass, ferns (3 variants), flowers (3×6), rocks
│   ├── textures.js      # Procedural canvas textures (bark, leaves, rock)
│   ├── birds.js         # Bird flock visual + crow audio
│   └── wildlife.js      # Bear, lion, Wally peek encounters
└── atmosphere/
    ├── day-night.js     # Sun/moon/stars, sky dome, palettes, clouds
    ├── weather.js       # Weather state machine, rain particles, thunder, lightning
    ├── audio.js         # All procedural audio (footsteps, crickets, morepork, etc.)
    ├── fireflies.js     # Night-time glowing particles
    └── wind.js          # Vertex shader wind displacement
```
