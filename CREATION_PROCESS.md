# Creation Process: VR Endless Forest

## How This Project Was Built

This project was built over three days (10–12 February 2026) through conversational iteration between a human creator and Claude Code (Anthropic's AI coding assistant). No game engine, no build system, no pre-made assets, and no code was written directly by the human. Every texture, mesh, sound, and shader was generated procedurally through conversation.

The human's role was creative director: providing high-level vision, testing in the VR headset, and giving experiential feedback. Claude's role was the entire development studio: architecture, implementation, debugging, and iteration.

---

## The Arc of Creation

The project followed a natural arc from infrastructure to world to atmosphere to life to polish:

### Phase 1: The Spark

The project began with a single statement of intent:

> "I want to create something from scratch to show it is possible. I have an Oculus Quest 3. I want to create, from scratch, a VR simulation using just Claude Code. The simulation should allow a wearer to explore an endless, randomly generated forest."

After a brief comparison of approaches (native Godot vs WebXR), the decision was made: pure WebXR with Three.js, served as a static site, no build tools. The constraint was part of the point -- demonstrating what's possible through AI-assisted development alone.

The initial architecture was laid down: chunked terrain with simplex noise, ES module structure, a dolly camera rig for VR, and the basic render loop. Within the first session, there was walkable terrain with basic trees.

### Phase 2: Building the World

Trees came first -- three types (pine, oak, birch) built from merged Three.js primitives with vertex colours. Then collision detection, so you couldn't walk through trunks. Then vegetation: grass tufts, rocks, and the beginnings of flowers and ferns.

Procedural textures were generated entirely on HTML5 Canvas elements at startup -- bark with vertical streaks and knots, birch bark with horizontal dark bands, leaf canopies with style-specific patterns (needle strokes for pine, overlapping ellipses for oak, small round dots for birch). No image files were ever loaded for textures.

The ground got a procedural grass texture (blade strokes, soil speckles, pebble details) and vertex-colour blending between grass, dirt, and eventually sand and water.

### Phase 3: The Sky and Time

The day/night cycle was tied to real-world time from the start. The sun position is calculated from the device's clock, date, and geolocation (with an Auckland latitude fallback). Four colour palettes -- night, twilight, golden hour, and day -- blend smoothly as the sun moves.

Stars appeared (300 points on a sphere), then a moon, then shooting stars streaking across the night sky. Clouds were added as billboard sprites in a ring at altitude.

Fireflies emerged at dusk -- glowing particles with individual pulse timing, drift orbits, and additive blending. Initially there were 80 and they were enormous; they were eventually refined down to 30 subtle points.

### Phase 4: Sound Design

This proved to be the most challenging domain. Every sound was synthesised procedurally using the Web Audio API -- no audio samples (until the morepork, much later).

**Footsteps** went through at least five complete rewrites. The first attempt was simple filtered noise. Then layered oscillators. Then it "sounded like a drum." The breakthrough came from separating the sound into distinct layers per surface: grass gets a low-pass thud plus a high-pass swish; rock gets a bandpass tap plus a sine ping; water gets a noise splash plus a filtered slosh.

**Leaf rustling** was attempted multiple times and ultimately abandoned entirely. The user declared: "I don't think that leaf noise is really doing it -- it just sounds completely wrong." Procedural foliage sound is genuinely hard. The feature was cut rather than shipped at low quality.

**Cricket chirps** worked well: 4-voice sine wave chorus at 4200-5400 Hz, fading in at dusk and out at dawn. Simple, effective, immediately evocative.

**Wildlife growls** had a memorable moment: the first bear growl attempt "sounded more like someone farting." The fix involved restructuring the harmonic content and envelope.

### Phase 5: Water

Water was a major feature arc spanning dozens of iterations. It began with the simple idea of filling low terrain areas with water and surrounding them with sandy shores.

The water surface started as a flat blue plane, evolved through opacity and colour adjustments, then got a full custom ShaderMaterial with 10+ sinusoidal waves at different angles, height-tinted crests, and drifting surface flecks. The mesh resolution was increased several times (eventually 360x360 segments) to support fine wave detail.

Stream channels were added using domain-warped ridge noise, carving continuous winding waterways through the terrain and connecting previously isolated ponds.

Swimming mechanics followed: the player floats with eyes above the surface, moves at reduced speed, can't jump, and bobs gently. Water footstep sounds went through their own iteration cycle, arriving at pure noise-based layers with careful frequency band selection.

### Phase 6: The Sky Crisis

What started as "the sky is still grey" turned into the most technically complex debugging arc of the project. The sky dome material had to be completely rewritten from vertex-coloured MeshBasicMaterial to a custom ShaderMaterial with a 3-stop gradient.

The "ghost tree" problem -- white tree silhouettes visible at distance against the sky -- required eight iterations touching fog colour, fog distance, sky gradient structure, and ultimately making fog distance dynamic based on time of day (nearly invisible during daytime, closing in at night).

The camera far plane, sky dome radius, and depth buffer precision all interacted in non-obvious ways. At one point, increasing the far plane to 600 caused the entire sky to go black due to depth precision issues. The solution was a careful balance: far plane at 250, sky radius at 200, and a ShaderMaterial that blends from the fog colour at the horizon through the sky bottom to the sky top overhead.

### Phase 7: Flora Refinement

Late in the day, attention turned to making the vegetation look more natural:

**Trees** were "a bit cartoony" -- the fix involved more canopy lobes, higher polygon counts, stronger vertex jitter, muted colours, open-ended cones (removing flat bases from pine canopies), and per-type procedural canvas textures.

**Ferns** went through a rapid five-message iteration: "alien life form" (too angular) to "cactuses" (spiny central stem, tiny leaflets) to natural (multi-segment curved fronds with dense leaflet pairs, drooping tips, and tip curl). Three geometry variants were created for visual diversity.

**Flowers** gained green stems via vertex colours, random tilt so they're not all perfectly upright, curved S-bend stems, basal rosette leaves, and three geometry variants per colour (small, standard, showy).

### Phase 8: Bringing It to Life

Wind animation was added via vertex shader injection (`onBeforeCompile`), giving all plants and trees gentle movement -- initially too strong ("feels like a really windy day"), then dialled back to a subtle breeze.

Bird flocks appeared: 5 groups of 8 birds orbiting at altitude with crow-like caw sounds. The birds went through their own iteration: wings pointing the wrong way, too much formation (needed to be more scattered), movement too jerky ("reminds me more of bats" -- needed smoother glide phases), and initially too large ("pterodactyls").

The final personal touch: at night, from somewhere in the distant trees, the call of the morepork -- the native New Zealand owl. "Because we are from NZ." A real audio recording, trimmed to a single call, spatialised via HRTF panning from a random distant direction every 30-90 seconds.

---

## Day 2: Astronomical Realism and Polish (11 February 2026)

Day 2 began with a comprehensive performance audit and evolved into a deep polish pass touching nearly every system.

### Phase 9: Performance Audit

The session opened with a systematic analysis of every JavaScript module — 27 specific performance issues were identified and fixed across the codebase. These ranged from replacing deprecated Web Audio API calls (`panner.setPosition()` → `positionX/Y/Z.value`) to eliminating string parsing in hot paths (chunk coordinate lookup), guarding unnecessary `needsUpdate` flags on bird instance matrices, and caching terrain height lookups to avoid redundant noise evaluations.

The terrain resolution was doubled (32×32 to 64×64 vertices per chunk) for smoother ground, and the shore colour blending was improved with smooth gradient transitions between grass, sand, and water.

### Phase 10: The Real Moon

Day 1's moon was a flat grey disc with a procedural texture placed opposite the sun. Day 2 replaced this entirely:

- **Astronomical positioning**: A simplified Meeus lunar ephemeris computes the moon's ecliptic longitude and latitude from six principal terms, converts through equatorial to horizontal coordinates using the device's latitude and longitude. The moon now rises and sets at astronomically correct times and positions (~1 degree accuracy).
- **Real photograph**: A Wikipedia full moon image replaced the procedural texture (with the procedural version kept as a fallback if the image fails to load).
- **Phase shader**: A custom ShaderMaterial reconstructs sphere normals from the disc UV, computes illumination from the actual scene sun-to-moon geometry, and renders the phase terminator with smooth blending and earthshine on the dark limb.
- **Moonlight shadows**: Rather than adding a second shadow-casting light, the existing sunlight DirectionalLight is repurposed at night — as the sun fades below the horizon, the light smoothly transitions to the moon's position with a cool blue-white tint and reduced intensity, providing subtle moonlit shadows from the same shadow map.

### Phase 11: Vegetation Lighting

Testing revealed that vegetation had a harshly contrasting light and dark side. The issue was subtle: with `DoubleSide` rendering, Three.js uses different light calculations for front-facing and back-facing fragments. When instances are randomly tilted, some faces that appear "on top" are actually backfaces receiving different (dimmer) lighting.

The fix required shader-level intervention:
- For Lambert materials (grass, ferns): patching the fragment shader to always use `vLightFront` instead of selecting between front and back lighting
- For Phong materials (flowers): patching `faceDirection` to always be `1.0`, preventing normal flipping on backfaces
- A subtle emissive baseline (8% of base colour for grass/ferns, neutral warm tone for flowers) lifts the darkest areas without washing out the lighting

### Phase 12: Flower and Leaf Geometry

The user noted flowers were "quite angular" — single triangles per petal. A complete geometry rewrite followed:
- **Petals**: Replaced with multi-segment rounded fans (4 segments per petal, 8 triangles each) using elliptical width profiles
- **Basal leaves**: Multi-segment smooth shapes (4 segments) with width tapering at base and tip
- **Stem leaves**: Multi-segment (3 segments) with natural taper
- **Centre**: Upgraded from 3 to 6 triangles for a hexagonal shape
- **Material**: Switched from MeshLambertMaterial to MeshPhongMaterial with specular highlights

### Phase 13: Water Ambient Sound

Adding ambient water sounds near lakes and streams proved deceptively difficult. The initial implementation — continuous bandpass-filtered noise — was completely inaudible, drowned out by the wind ambience. After tripling the volume and adding wind ducking (50% wind reduction near water), the sound was audible but indistinguishable from the wind: "I'm really not hearing the water... if it sounds like the wind..."

The breakthrough was abandoning continuous noise in favour of **rhythmic wave pulses**: each "lapping" wave has a fast attack, brief sustain, and slow release, followed by a random gap. This creates the recognisable temporal pattern of water meeting a shore. Combined with a slow playback rate (0.4x), narrow resonant bandpass (Q 1.2 at 350 Hz), and a lowpass at 600 Hz to kill high-frequency hiss, the result is a warm, distinctly aquatic sound.

A second higher "splash" layer (900 Hz, Q 2.0) adds occasional sparkle. Both layers modulate independently, and the wind ambience automatically ducks when the player is near water.

### Phase 14: Wildlife Fixes

The wildlife peek encounters (bear, lion, Wally) were spawning at incorrect heights due to terrain coordinate misalignment. Spawn positioning was corrected to use the terrain height at the actual spawn point, and the fade-in was adjusted to prevent pop-in artifacts.

---

## Day 3: Cloud Diversity and Terrain Shaders (12 February 2026)

Day 3 focused on atmospheric realism — making the sky feel alive — and moving terrain colouring from CPU to GPU.

### Phase 15: Terrain Shader Refactor

The terrain colouring system was completely restructured. Previously, vertex colours were computed on the CPU during chunk generation — a large block of JavaScript that blended height-based grass gradients, shore transitions, dirt patches, and per-vertex noise variation. This was moved entirely into the ground material's fragment shader, driven by a per-vertex tree density attribute from simplex noise.

The shader computes all colour blending (height gradients, shore transitions, dirt-under-trees) at fragment resolution, eliminating visible banding between vertices. Normal computation was also optimised: interior vertices now use cached heights instead of recalculating, with `getTerrainHeight()` only called for boundary vertices that need cross-chunk continuity.

### Phase 16: Wildlife Anatomy

The bear and lion peek encounters gained legs — previously they were floating torsos. Stocky cylindrical legs for the bear, slender ones for the lion, positioned at the four corners of the body. A small detail, but floating animals behind trees looked wrong.

### Phase 17: Cloud Diversity

This was the main focus of Day 3, spanning the most iterations. The original cloud system was 30 identical soft circular puffs arranged in a ring — passable from a distance but monotonous under scrutiny.

**Four texture variants** were created:
- **Soft round**: The original radial gradient for cumulus puffs
- **Wispy**: A soft diffuse elliptical wash for cirrus-type clouds
- **Flat-bottomed**: Asymmetric falloff (soft top, flatter base) for fair-weather cumulus
- **Thin haze**: Very low-contrast radial gradient for high-altitude patches

**Four cloud archetypes** with weighted random selection:
- **Cumulus** (35%): 5–8 round billboard puffs at 60–90m, medium drift
- **Wispy** (25%): 3–6 broad horizontal planes at 85–110m, fastest drift, wind-aligned
- **Flat layer** (20%): 6–10 horizontal haze patches at 70–100m, slowest drift
- **Small puffy** (20%): 2–3 tight billboard clusters at 50–75m, medium-fast drift

**Key iteration challenges:**

The flat-bottomed texture initially created a visible horizontal line through each cloud — the alpha calculation had a discontinuity where two branches met at `dy = 0.1`. The fix replaced the branching `if/else` with a single smooth asymmetric elliptical distance formula.

Wispy and flat clouds were initially billboard Sprites that rotated to face the camera. This was fine for round puffs but made elongated shapes obviously track the viewer. The fix was switching these types to horizontal `Mesh` planes using `PlaneGeometry` rotated flat, so they sit naturally in the sky.

A subtle but critical bug: the horizontal planes were scaled with `scale.set(scaleX, 1, scaleY)`, but `PlaneGeometry` lies in the XY plane — all vertices have Z=0. Scaling Z multiplied zero by scaleY, leaving the planes paper-thin regardless of settings. Multiple rounds of texture softening and size increases had no visible effect because the geometry was 1 unit deep the entire time. The fix was `scale.set(scaleX, scaleY, 1)`.

Wispy clouds were initially randomly oriented, creating chaotic streaks across the sky. In reality, cirrus clouds align with upper-level winds. A single `windAngle` is now chosen at creation time, and all wispy/flat planes align to it with ±9° of jitter.

**Billowing animation** was added: each puff gently drifts in position and breathes in scale, with horizontal clouds receiving much subtler movement (15% of billboard amplitude). Cloud groups also wobble radially and bob vertically. The initial amplitudes were far too large — "they move too much" — and were dialled back to near-imperceptible gentle shifts.

### Phase 18: Development Infrastructure

The development server (`server.py`) gained no-cache headers so the VR headset always fetches the latest code without manual cache-busting. The `index.html` script tag version was bumped for CDN cache invalidation.

---

## Thematic Analysis

### "Show It's Possible"

The project was conceived as a proof of concept: can an AI coding assistant build a complete VR experience from scratch? The answer is demonstrably yes -- but the more interesting finding is *how*. The AI handled all architecture, implementation, and debugging, but the human's experiential feedback was irreplaceable. Testing in the actual VR headset revealed problems that no amount of code review could find.

### The User as Director, the AI as Studio

The workflow was remarkably consistent throughout: the human provides creative direction or experiential feedback, the AI translates it into code. The human never wrote a line of code. They described how things *felt* and *looked*:

- "sounds like someone farting" (reworked growl synthesis)
- "look like weird tall mushrooms" (shortened flower stalks)
- "reminds me more of bats" (smoother bird wing animation)
- "feels like a really windy day" (reduced wind amplitude)
- "alien life form" (redesigned fern geometry)

This is a fundamentally different relationship from traditional software development. The human was freed to think entirely in terms of experience and aesthetics, while the AI handled the translation to implementation.

### Naturalness as the North Star

Nearly every piece of feedback pushed toward greater naturalness and away from synthetic or artificial qualities. Trees needed to be less "cartoony." Ferns needed to be less "angular." Birds needed to be less "in formation." Wind needed to be less like "a really windy day." Water sounds needed to be less like "a drum." The human had a strong intuitive sense of what felt natural and what didn't, even when they couldn't articulate exactly why.

This reveals something about VR as a medium: immersion amplifies artificiality. Things that might look fine on a flat monitor become jarring when you're standing inside them. The bar for naturalness in VR is higher than in conventional 3D rendering.

### Sound Is Harder Than Visuals

Procedural audio proved consistently more difficult than procedural visuals. The footstep system went through five complete rewrites. Leaf rustling was abandoned entirely. Water sloshing required removing all oscillators in favour of pure noise. The bear growl had an unfortunate resemblance to flatulence.

The human ear is more discriminating than the human eye when it comes to procedural generation. A slightly wrong noise frequency band or envelope shape is immediately perceived as "wrong" even if the listener can't explain why. Visual geometry can be abstract and still read as "tree" or "fern," but audio has to hit very specific spectral and temporal patterns to be convincing.

### The Tight Feedback Loop

The conversation demonstrates a remarkably rapid feedback cycle. Some features went through 5-8 iterations in quick succession, with each cycle taking only minutes. The pattern was always: implement, test, observe, describe the problem, fix, repeat.

The human was patient with iteration but had a clear quality threshold. They would keep pushing until something felt right, or cut it entirely (as with leaf rustling). This is healthy creative discipline: don't ship mediocre when you can either improve or remove.

### VR Changes Everything

Multiple features that worked perfectly on a desktop monitor broke in VR. The player was at ground level (needed `local-floor` reference space). Trees floated on slopes (Y-position calculated incorrectly). Controller input didn't work (needed session-active polling). The sky disappeared (depth buffer precision). Head bob felt different (needed dolly-based application).

VR is an unforgiving medium. It demands correctness in ways that flat-screen rendering doesn't. Height must be right. Scale must be right. Physics must be right. The headset is a truth machine.

### The "One More Thing" Pattern

Almost every time the human said "let's commit" or "looking good," they immediately followed with another request:

- "Let's commit. But first, how about some birds?"
- "Looking better, now let's commit. One thing first, could there be a way to show time?"
- "Yea, much better -- perhaps some texturing even?"

Each completed feature opened creative doors. Seeing a working forest at night suggested fireflies. Having spatial audio suggested morepork calls. Getting the ferns right suggested wind animation. The project grew organically through this pattern of completion breeding inspiration.

### Cultural Identity

The project started as a generic forest but gained specific cultural identity through two late additions: the morepork (native New Zealand owl) night call, and the "Where's Wally" wildlife encounter. These personal touches -- "because we are from NZ" -- transformed a technical demo into something with character and place.

### Plans Then Intuition

The human provided highly structured, detailed implementation plans for major features (the initial architecture, the audio system, the water ponds). But refinement was entirely intuitive and experiential. The plans got the 80% right; the remaining 20% came from testing and feeling.

This hybrid approach -- engineering discipline for architecture, artistic intuition for polish -- was remarkably effective. It suggests a model for AI-assisted creative development: let the AI handle the structural engineering, then guide the aesthetics through experiential feedback.

### The Polish Paradox (Day 2)

Day 2 was entirely about polish — and it increased the codebase by ~35%. No new major systems were added, yet the work was arguably more impactful than Day 1's feature sprint. Accurate moon positioning, uniform vegetation lighting, rhythmic water sounds, and smoother flower geometry all address things that most people wouldn't consciously notice are *wrong*, but would unconsciously feel were *off*.

This is the paradox of polish: the less visible the improvement, the more important it often is for immersion. A player won't think "the moon is at the wrong ecliptic longitude," but they will feel that the night sky looks somehow *right* — or doesn't.

### The Shader Boundary

Day 2 repeatedly crossed the boundary between JavaScript and GLSL — patching fragment shaders to fix vegetation lighting, writing a custom phase shader for the moon, coordinating between the main render loop and GPU-side uniforms. This represents a qualitative shift from Day 1, where most work stayed within Three.js's API surface.

The AI handled this transition seamlessly, but it highlights something important: as procedural generation becomes more sophisticated, the work moves deeper into the rendering pipeline. The conversation shifted from "make a tree" to "force `faceDirection = 1.0` in the Phong fragment shader to prevent normal flipping on backfaces." The human couldn't have specified this; they could only describe the symptom ("the undersides of the flowers appear brighter than the tops"), and the AI had to diagnose and fix the root cause in the shader.

### Hearing Is Believing

The water ambient sound saga reinforced Day 1's lesson about procedural audio. Three separate approaches were needed before the sound was recognisably "water":
1. Continuous bandpass noise → inaudible (drowned by wind)
2. Louder continuous noise with wind ducking → audible but indistinguishable from wind
3. Rhythmic pulse envelope with resonant filtering → finally sounds like lapping water

The key insight: what makes water sound like water isn't a frequency spectrum — it's a *temporal pattern*. The rhythmic advance-and-retreat of waves meeting a shore is what the brain recognises. No amount of spectral filtering on continuous noise will produce this. The solution required moving from the frequency domain to the time domain.

### The Invisible Bug (Day 3)

The cloud diversity work produced a masterclass in debugging invisible geometry issues. After implementing horizontal plane clouds for wispy and flat types, the user kept reporting that they were "too thin" and looked like "sharp lines" — despite multiple rounds of increasing the scale values. The texture was softened, the puff sizes were doubled, the opacity was reduced, and still: thin lines.

The root cause was that `PlaneGeometry(1, 1)` lies in the XY plane, meaning all vertices have `Z = 0`. The code was scaling the Z axis (`scale.set(scaleX, 1, scaleY)`), but `0 × scaleY = 0` — the planes were always exactly one unit deep, regardless of the scale value. Five rounds of texture and size adjustments were invisible because the geometry itself was paper-thin.

This is a category of bug that's particularly insidious in 3D development: a transform that *looks* correct and *compiles* correctly but does nothing because it operates on a zero-extent axis. The fix was trivial (`scale.set(scaleX, scaleY, 1)`), but diagnosing it required understanding the interaction between PlaneGeometry's vertex layout, Euler rotation order, and Three.js's scale-then-rotate transform composition.

### Iteration Velocity and Diminishing Feedback

Day 3 showed a pattern of diminishing but increasingly precise feedback. Early cloud iterations got broad responses ("better, though some look like half spheres"). As the system improved, feedback became more targeted: "the wispy lines could be fatter and less distinct," then "still look quite sharp," then "the object itself needs to be wider." Each round of feedback addressed a narrower problem, converging on the final result through progressive refinement.

This pattern — broad strokes first, then increasingly fine adjustments — mirrors traditional artistic processes. The human functions as a natural gradient descent over the aesthetic landscape, with the AI performing the parameter updates.

---

## By the Numbers

- **Development time**: ~20 hours over three days
- **Conversation sessions**: 8+ (3 in parent project, 5+ in VR forest project)
- **User feedback messages**: ~200+
- **Major features**: 15+ distinct systems
- **Lines of JavaScript**: ~9,500
- **JavaScript modules**: 29
- **External dependencies**: 2 (Three.js, simplex-noise, both from CDN)
- **External art assets**: 1 (moon photograph from Wikipedia, with procedural fallback)
- **External audio assets**: 1 (morepork.mp3, trimmed from a recording)
- **Performance issues fixed (Day 2)**: 27 across all modules
- **Features abandoned**: 1 (leaf rustling -- "just sounds completely wrong")
- **Most-iterated feature**: Sky/fog rendering (~8 iterations)
- **Most-rewritten feature**: Footstep audio (~5 complete rewrites)
- **Day 2 most-iterated**: Vegetation lighting (~8 iterations across shader patches, emissive tuning, and material changes)
- **Day 3 most-iterated**: Cloud diversity (~10 iterations across textures, scaling, billboard vs plane, and the Z-scale bug)
