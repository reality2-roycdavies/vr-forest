# Building Immersive VR Worlds with AI: A Beginner's Guide

This guide provides the background knowledge you need to build a project like VR Endless Forest — a fully procedural WebXR experience created through human-AI collaboration. It assumes no prior VR or AI development experience, but some familiarity with JavaScript and basic 3D concepts (coordinates, vectors) will help.

For the story of *how* this specific project was built through iterative conversation, see [CREATION_PROCESS.md](CREATION_PROCESS.md). This guide covers the *what* — the technical foundations you need to understand before starting.

---

## Table of Contents

1. [What Makes VR Different](#1-what-makes-vr-different)
2. [The Framerate Imperative](#2-the-framerate-imperative)
3. [WebXR: VR in the Browser](#3-webxr-vr-in-the-browser)
4. [Three.js: Your 3D Engine](#4-threejs-your-3d-engine)
5. [Procedural Generation](#5-procedural-generation)
6. [Shaders: Programming the GPU](#6-shaders-programming-the-gpu)
7. [Spatial Audio](#7-spatial-audio)
8. [Performance: Staying in Budget](#8-performance-staying-in-budget)
9. [Working with AI](#9-working-with-ai)
10. [Getting Started](#10-getting-started)
11. [Glossary](#11-glossary)

---

## 1. What Makes VR Different

### Stereoscopic Rendering

A regular screen shows one image. A VR headset shows two — one per eye, each from a slightly different viewpoint (about 63mm apart, matching the average distance between human eyes). Your brain fuses these into a single image with depth, just like real vision. This means **every frame must be rendered twice**: once for the left eye, once for the right. Your GPU workload effectively doubles compared to a flat-screen game.

### Presence and Scale

VR creates a sense of *presence* — the feeling that you are physically inside the virtual world. This is fundamentally different from looking at a 3D scene on a monitor. Objects feel life-sized. A tree that looks fine on screen may feel enormous or tiny in VR. A forest clearing that seems atmospheric on a monitor may feel claustrophobic when you're standing in it.

This means you cannot fully evaluate a VR experience on a flat screen. You must test in the headset. Many design decisions in this project were made by putting the headset on and *feeling* whether something was right — the height of trees, the density of fog, the speed of movement.

### Motion Sickness

The single most important constraint in VR design is **avoiding motion sickness**. Sickness occurs when what your eyes see disagrees with what your inner ear feels. The main causes:

- **Low or unstable framerate**: If the world stutters or lags behind your head movement, your brain interprets this as a neurological problem and triggers nausea. This is why framerate is non-negotiable in VR (see next section).
- **Artificial locomotion**: Moving the player through the world while their real body is stationary creates a visual-vestibular conflict. Teleportation avoids this entirely. Smooth locomotion (as used in this project) is more immersive but more likely to cause discomfort.
- **Camera shake or bob**: Walk-bobbing, screen shake, or any camera movement not initiated by the player's real head movement can cause discomfort. This project uses very subtle walk bob, and it is synchronised to the footstep audio rhythm so the brain has an auditory cue to match the visual motion.
- **Acceleration and deceleration**: Sudden starts and stops are worse than constant-speed movement. Smooth acceleration curves help.

### Degrees of Freedom

VR headsets track the player's head in space. *Six degrees of freedom* (6DoF) means the headset tracks both rotation (looking around) and position (leaning, crouching, walking). All modern standalone headsets (Quest, Pico) are 6DoF. Controllers are also 6DoF-tracked, giving you hand presence.

*Three degrees of freedom* (3DoF) tracks rotation only — you can look around but not lean. Older headsets and phone-based VR used 3DoF. This project targets 6DoF headsets.

---

## 2. The Framerate Imperative

### Why 90fps Is Non-Negotiable

Most VR headsets run at 72Hz, 90Hz, or 120Hz. The Quest 3 defaults to 90Hz. This means you must render a complete stereo frame (both eyes) **every 11 milliseconds**. Miss this deadline and the headset either:

- **Reprojects**: Warps the previous frame to approximate the new head position. This creates visible artefacts (wobbling edges, smearing) and feels subtly wrong.
- **Drops the frame**: The world visibly judders. Even occasional frame drops are perceptible and uncomfortable.

On a desktop game, dropping from 60fps to 45fps is annoying but playable. In VR, dropping from 90fps to 45fps can make people nauseous within minutes. **Consistent framerate matters more than visual quality.**

### The 11ms Budget

Every frame must complete all of this in 11ms:

| Phase | Typical Budget |
|-------|---------------|
| JavaScript game logic | 2–4ms |
| Scene graph traversal | 1–2ms |
| GPU draw calls (x2 eyes) | 4–6ms |
| WebXR overhead | 0.5–1ms |

This is tight. A desktop game might have 16ms (60fps) or even 33ms (30fps). VR gives you one-third the time of a 30fps game, while rendering twice as much. Every millisecond matters.

### What This Means in Practice

- You cannot brute-force quality. A million-polygon tree that looks stunning on desktop will kill your framerate in VR.
- **Instanced rendering** is essential. Instead of drawing 2000 individual tree meshes (2000 draw calls), you draw one mesh instanced 2000 times (1 draw call). This project uses instancing for trees, vegetation, rocks, flowers, birds, fireflies, and rain particles.
- **Shader complexity** must be controlled. A fragment shader runs for every pixel of every object for every eye. A beautiful water shader that costs 2ms on desktop costs 4ms in VR.
- **Level of detail** (LOD) helps — show simpler geometry for distant objects. This project uses fog to hide distant terrain instead of LOD, which is simpler to implement and equally effective.
- **Texture resolution** should be kept modest. Procedurally generated 64x64 textures (as used here) are far cheaper than 2048x2048 photo textures.

---

## 3. WebXR: VR in the Browser

### Why Web-Based VR?

Most VR applications are native apps distributed through app stores. WebXR is an alternative: VR experiences that run in a web browser. The advantages:

- **No installation**: Users open a URL and tap "Enter VR." No app store, no download, no sideloading.
- **Cross-platform**: The same code runs on Quest, Pico, desktop browsers, and potentially future headsets.
- **Rapid iteration**: Change the code, refresh the page. No build step, no deployment pipeline.
- **Easy sharing**: Send someone a link. They click it and they're in your world.

The disadvantages:

- **Performance ceiling**: Browser JavaScript is slower than native C++. You have less headroom.
- **API limitations**: Not all headset features (hand tracking, passthrough, eye tracking) are available through WebXR yet.
- **HTTPS required**: VR sessions require a secure context. During development you need either localhost or a self-signed certificate.

### The WebXR API

WebXR is a browser API that provides:

- **Session management**: Requesting an "immersive-vr" session, entering/exiting VR.
- **Reference spaces**: Coordinate systems for tracking (local, local-floor, bounded-floor).
- **Input sources**: Controller tracking, button states, hand tracking.
- **Frame loop**: A `requestAnimationFrame`-equivalent that synchronises with the headset's display refresh.

Three.js wraps most of this through its `WebXRManager`. You rarely need to call the raw WebXR API directly. The basic pattern:

```javascript
renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));
renderer.setAnimationLoop(onFrame); // called at headset refresh rate
```

### The Camera Rig Pattern

In WebXR, the headset controls the camera position and rotation directly — you cannot set `camera.position` to move the player, because the headset overrides it every frame. Instead, you parent the camera to a "dolly" group and move the dolly:

```javascript
const dolly = new THREE.Group();
dolly.add(camera);
scene.add(dolly);

// To move the player:
dolly.position.x += velocity.x;
dolly.position.z += velocity.z;
// The camera tracks the player's head within the dolly
```

This is one of the first "gotchas" in WebXR development. Moving the camera directly works on desktop but does nothing in VR.

---

## 4. Three.js: Your 3D Engine

### What It Does

Three.js is a JavaScript library that wraps WebGL (the browser's low-level 3D graphics API). It provides:

- A **scene graph**: A tree of objects (meshes, lights, groups) that defines your 3D world.
- **Materials**: How surfaces look — colour, shininess, transparency, textures.
- **Geometry**: The shape of objects — vertices, faces, normals, UVs.
- **Lights**: Directional (sun), hemisphere (sky/ground ambient), point, spot.
- **Cameras**: Perspective (normal 3D), orthographic (flat).
- **Loaders**: For 3D models (GLTF), textures (images), and other assets.
- **Post-processing**: Effects like bloom, depth of field, tone mapping.
- **WebXR integration**: Built-in VR support.

### The Render Loop

Every frame, Three.js traverses the scene graph, determines which objects are visible, sends geometry and material data to the GPU, and produces an image. The basic pattern:

```javascript
function onFrame() {
  updateGameLogic(delta);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(onFrame);
```

In VR, `setAnimationLoop` synchronises with the headset's refresh rate. The renderer automatically handles stereo rendering (both eyes).

### Materials That Matter for VR

- **MeshStandardMaterial**: Physically-based rendering (PBR). Realistic but expensive. Use sparingly in VR.
- **MeshPhongMaterial**: Specular highlights without full PBR. Good balance of quality and performance. Used for water in this project.
- **MeshLambertMaterial**: Diffuse-only lighting. Cheap. Good for terrain and vegetation.
- **MeshBasicMaterial**: No lighting calculations at all. Cheapest. Used for clouds, sky dome.
- **ShaderMaterial**: Write your own vertex and fragment shaders. Maximum control, maximum complexity. Used for the sky dome and moon in this project.
- **SpriteMaterial**: Always faces the camera (billboarding). Used for the sun disc and cloud puffs.

### Key Concept: Draw Calls

A *draw call* is a command sent from the CPU to the GPU saying "render this object." Each draw call has overhead — setting up state, binding textures, transferring uniforms. In VR, every draw call happens twice (once per eye).

**The single biggest performance lever in VR is reducing draw calls.**

If you have 2000 trees as separate meshes, that's 2000 draw calls per eye = 4000 total. With `InstancedMesh`, it's 1 draw call per eye = 2. The geometry is the same; the only difference is *how you tell the GPU about it.*

```javascript
// Bad: 2000 individual meshes = 2000 draw calls
for (let i = 0; i < 2000; i++) {
  const mesh = new THREE.Mesh(treeGeometry, treeMaterial);
  mesh.position.set(x, y, z);
  scene.add(mesh);
}

// Good: 1 instanced mesh = 1 draw call
const instancedMesh = new THREE.InstancedMesh(treeGeometry, treeMaterial, 2000);
for (let i = 0; i < 2000; i++) {
  matrix.makeTranslation(x, y, z);
  instancedMesh.setMatrixAt(i, matrix);
}
scene.add(instancedMesh);
```

This project uses instancing for everything that appears in quantity: three tree species, grass tufts, ferns, flowers, rocks, birds, fireflies, rain particles, and collectible orbs.

---

## 5. Procedural Generation

### Why Procedural?

This project has no 3D models, no pre-made textures (except one moon photograph), and no pre-recorded sounds (except one owl call). Everything is generated by code. Why?

- **No asset pipeline**: No modelling tools, no texture editing, no sound recording. Just code.
- **Infinite variety**: Procedural content can vary endlessly. Every tree is slightly different. The terrain extends forever.
- **Small download**: The entire project is ~200KB of JavaScript. A single 3D tree model might be 500KB.
- **AI-friendly**: An AI assistant can write code to generate a tree, but it cannot create a 3D model file.

### Noise Functions

The foundation of procedural generation is **noise** — controlled randomness that looks natural. Pure random values (`Math.random()`) create static (TV noise). Noise functions create smooth, continuous randomness that resembles natural patterns.

**Simplex noise** is the standard choice. It takes a coordinate (x, y) and returns a value between -1 and 1. Nearby coordinates return similar values, creating smooth hills and valleys. Key properties:

- **Deterministic**: The same input always produces the same output. This means terrain generated at position (100, 200) is always the same, even if you walk away and come back.
- **Continuous**: No sharp jumps between adjacent values. Natural-looking gradients.
- **Seedable**: Different seeds produce completely different landscapes from the same algorithm.

### Multi-Octave Noise (Fractal Brownian Motion)

Real terrain has detail at every scale — mountains at the large scale, hills at the medium scale, bumps at the small scale. You achieve this by layering multiple noise samples at different frequencies and amplitudes:

```javascript
function terrainHeight(x, z) {
  let height = 0;
  let frequency = 0.01;   // large features
  let amplitude = 10;      // tall

  for (let i = 0; i < 6; i++) {
    height += noise(x * frequency, z * frequency) * amplitude;
    frequency *= 2;    // each octave is twice as detailed
    amplitude *= 0.5;  // but half as tall
  }
  return height;
}
```

This is called *fractal Brownian motion* (fBm). The `persistence` (amplitude decay) and `lacunarity` (frequency growth) parameters control how rough vs smooth the terrain looks.

### Procedural Textures

Instead of loading image files, you can generate textures on an HTML5 Canvas at startup:

```javascript
const canvas = document.createElement('canvas');
canvas.width = 64;
canvas.height = 64;
const ctx = canvas.getContext('2d');
// Draw grass blades, bark patterns, rock speckles...
const texture = new THREE.CanvasTexture(canvas);
```

This project generates all its textures this way — grass blades with soil speckles, bark with vertical grain, leaves with vein patterns, rock surfaces with colour variation. At 64x64 resolution they're tiny but look fine with the stylised aesthetic, and they cost almost nothing in GPU memory.

### Procedural Geometry

Three.js provides primitive shapes (boxes, spheres, cylinders, cones, planes). You build complex objects by combining and deforming these:

- **Trees**: A tapered cylinder for the trunk (with S-curve deformation for organic bend), stacked cones for pine canopy, clustered spheres for oak canopy.
- **Flowers**: Elliptical fan geometries for petals, thin cylinders for stems, small planes for leaves.
- **Ferns**: Multi-segment curves for fronds, with small angled planes for leaflet pairs.
- **Rocks**: Icosahedron geometry with vertex positions randomly perturbed for a jagged look.

The key insight: you do not need high geometric fidelity. A tree made from 6 cones and a cylinder reads as a convincing pine tree when it has the right proportions, colour, and texture. VR's sense of scale and presence compensates for geometric simplicity.

### Chunked Terrain

An infinite world cannot be loaded all at once. Instead, the world is divided into *chunks* — square tiles of terrain (32m x 32m in this project). As the player moves, new chunks are loaded ahead and old chunks behind are recycled:

```
[loaded] [loaded] [loaded]
[loaded] [PLAYER] [loaded]
[loaded] [loaded] [loaded]
```

Only the chunks within a load radius are active. When the player moves to a new chunk, one row is unloaded and a new row is generated. The mesh and object data from unloaded chunks are recycled (not destroyed), avoiding garbage collection pauses.

Fog is your friend here — it hides the edge where chunks pop in and out of existence.

---

## 6. Shaders: Programming the GPU

### What Shaders Are

Shaders are small programs that run on the GPU (graphics card) instead of the CPU. They process every vertex and every pixel of every object in the scene, in parallel. There are two types:

- **Vertex shader**: Runs once per vertex. Determines where each vertex appears on screen. Can deform geometry (wave displacement, wind sway).
- **Fragment shader** (pixel shader): Runs once per pixel. Determines the colour of each pixel. Can add patterns, lighting effects, transparency.

Shaders are written in GLSL (OpenGL Shading Language), which looks like C:

```glsl
// Fragment shader: tint everything red
void main() {
  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // RGBA
}
```

### Why Shaders Matter for VR

Shaders are the difference between "runs at 90fps" and "runs at 15fps." Because they execute per-vertex or per-pixel, a small change can have massive performance impact:

- Adding one `texture2D()` call to a fragment shader might cost 0.5ms per frame across all objects.
- A complex noise function in a vertex shader costs almost nothing if the mesh has 100 vertices, but kills performance if it has 100,000.

In this project, shaders are used for:

- **Water waves**: Vertex shader displaces the water plane (128x128 grid) with 13+ sine waves (plus 6 storm-chop layers).
- **Water surface**: Fragment shader adds flecks, crest highlights, shore fade, and rain ripple rings (10 layers).
- **Wind animation**: Vertex shader sways all vegetation and tree canopies.
- **Ground wetness**: Fragment shader darkens and blue-shifts terrain during rain.
- **Sky dome**: Fragment shader creates a smooth 3-stop gradient (fog → sky bottom → sky top).
- **Moon phase**: Fragment shader reconstructs sphere normals on a flat disc to simulate illumination.

### `onBeforeCompile`: Extending Three.js Materials

You often want to use a standard Three.js material (for its lighting, shadows, fog support) but add custom behaviour. The `onBeforeCompile` hook lets you inject GLSL code into the material's generated shader:

```javascript
material.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = { value: 0 };

  // Inject a uniform declaration
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    '#include <common>\nuniform float uTime;\n'
  );

  // Add wind displacement after vertex position is computed
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    transformed.x += sin(uTime + position.y * 2.0) * 0.1;`
  );
};
```

This is how wind animation, water waves, ground wetness, and shore foam are implemented in this project — standard `MeshLambertMaterial` or `MeshPhongMaterial` with GLSL injected via `onBeforeCompile`.

### Uniforms: CPU-to-GPU Communication

A *uniform* is a value you set in JavaScript that the shader can read. Uniforms are constant across all vertices/pixels in a single draw call but can change between frames:

```javascript
// JavaScript (runs on CPU)
shader.uniforms.uTime.value = elapsedTime;
shader.uniforms.uWindStrength.value = weather.windMultiplier;

// GLSL (runs on GPU)
uniform float uTime;
uniform float uWindStrength;
```

This is how the render loop communicates with shaders: time, weather state, wave amplitude, rain intensity, ground wetness, and other dynamic values are passed as uniforms every frame.

---

## 7. Spatial Audio

### Why Audio Matters in VR

Sound is half of presence. A silent forest feels lifeless regardless of how it looks. In VR, audio is even more important than on a screen because:

- **Spatial cues**: Sounds come from specific directions. You can hear a bird behind you before you see it.
- **Environmental cues**: Reverb, distance attenuation, and frequency filtering tell your brain about the space you're in.
- **Immersion reinforcement**: Footstep sounds synchronised to your movement reinforce the illusion that you're walking. Cricket sounds at dusk reinforce the time of day.

### The Web Audio API

Browsers provide a powerful audio API that handles:

- **Oscillators**: Generate pure tones (sine, square, sawtooth, triangle waves).
- **Noise**: `AudioBufferSourceNode` playing a buffer of random samples.
- **Filters**: `BiquadFilterNode` — lowpass, highpass, bandpass, notch. Shape the frequency content of sounds.
- **Gain nodes**: Volume control and mixing.
- **Spatial positioning**: `PannerNode` with HRTF (Head-Related Transfer Function) processing. This simulates how sounds change as they reach each ear, creating convincing 3D positioning.
- **Convolution reverb**: `ConvolverNode` applies a reverb impulse response to create room/outdoor acoustics.

### HRTF: How 3D Sound Works

Humans localise sound using differences between the two ears:

- **Timing**: Sound from the left reaches the left ear a fraction of a millisecond before the right.
- **Level**: The head shadows the far ear, making the sound quieter.
- **Frequency**: The shape of the outer ear (pinna) filters frequencies differently depending on the sound's direction. This is how we distinguish "in front" from "behind" and "above" from "below."

HRTF processing simulates all of this digitally. The Web Audio API's `PannerNode` with `panningModel: 'HRTF'` does this automatically — you just set the sound's 3D position and the browser handles the spatial processing.

```javascript
const panner = audioContext.createPanner();
panner.panningModel = 'HRTF';
panner.positionX.value = worldX;
panner.positionY.value = worldY;
panner.positionZ.value = worldZ;
```

### Procedural Sound Synthesis

Instead of loading audio files, you can build sounds from oscillators, noise, and filters:

- **Bird chirps**: A sine oscillator with a rapid frequency sweep (high → low over 0.1s), gated by a gain envelope.
- **Footsteps**: A short noise burst through a lowpass filter (thud), combined with a highpass-filtered noise burst (crunch/swish). Different filter settings for grass, rock, and water surfaces.
- **Cricket chirps**: A high-frequency oscillator (4500Hz) with rapid on-off amplitude modulation, creating the characteristic "chirp-chirp" pattern.
- **Thunder**: Multiple noise layers at different playback rates and filter frequencies, routed through a procedural convolution reverb for natural decay.
- **Rain**: Continuous noise through bandpass filters at multiple frequencies, with slow LFO (low-frequency oscillator) modulation for gusting variation.

The advantage: infinite variety (every bird chirp is slightly different), zero download size, and perfect integration with the game state (rain audio scales with `rainIntensity`, crickets activate at dusk).

---

## 8. Performance: Staying in Budget

### The VR Performance Mindset

On desktop, you optimise when things get slow. In VR, you must **design for performance from the start.** Dropping below 90fps is not a minor annoyance — it makes people physically ill. Here are the key strategies:

### Draw Call Reduction

| Technique | Draw Calls | Used For |
|-----------|-----------|----------|
| Individual meshes | N per type | Nothing (too expensive) |
| Merged geometry | 1 total | Static decoration (if geometry never changes) |
| InstancedMesh | 1 per type | Trees, vegetation, rocks, flowers, birds, fireflies, rain |

**InstancedMesh** is the single most important performance technique in this project. Each tree species is one `InstancedMesh` with up to 1200 instances — one draw call renders an entire forest.

### Shader Complexity

Every instruction in a fragment shader runs millions of times per frame (once per pixel per object per eye). Guidelines:

- **Avoid branching** (`if/else`): GPUs process pixels in parallel; a branch forces all pixels in a group to execute both paths.
- **Minimise texture samples**: Each `texture2D()` call is relatively expensive. One sample is fine; ten per pixel add up.
- **Use `smoothstep` over `if`**: `smoothstep(edge0, edge1, x)` does a smooth interpolation that the GPU handles efficiently.
- **Pre-compute in vertex shader**: Anything that can be computed per-vertex instead of per-pixel saves enormous work (vertices are thousands; pixels are millions).

### Geometry Budget

A rough guide for Quest-class hardware:

| Element | Triangle Budget |
|---------|----------------|
| Terrain chunk (32x32 grid) | ~2,000 |
| Tree (trunk + canopy) | 200–500 |
| Fern/flower | 50–150 |
| Rock | 80–160 |
| Total visible scene | 200,000–400,000 |

This project stays well within these limits. Procedural geometry is inherently low-poly — a pine tree is about 300 triangles.

### Texture Memory

Quest headsets have limited GPU memory (typically 6GB shared with the system). Guidelines:

- Procedural textures at 64x64 or 128x128 are essentially free.
- Photo textures should be power-of-two dimensions (256, 512, 1024). Avoid 2048+ in VR unless necessary.
- Use texture atlasing (multiple images packed into one texture) to reduce texture-bind state changes.

### CPU Budget

JavaScript runs on a single thread. At 90fps you have ~11ms total per frame, and the GPU needs most of that. Your JavaScript budget is typically 2–4ms. Strategies:

- **Stagger expensive work**: Don't update everything every frame. This project loads at most 2 terrain chunks per frame, updates the minimap every 10 frames, and staggers spatial audio drip sounds over time.
- **Pool and reuse objects**: Creating and destroying JavaScript objects triggers garbage collection pauses. This project recycles chunk data, reuses typed arrays for rain particles, and pre-allocates vectors.
- **Avoid per-frame allocation**: Don't create `new THREE.Vector3()` inside the render loop. Declare them once at module scope and reuse them.

### Fog as a Performance Tool

Fog is not just atmospheric — it is a performance feature. If objects beyond 150m are invisible in fog, you don't need to load or render them. This project uses fog to:

- Hide terrain chunk pop-in at the load boundary.
- Justify a modest draw distance (no LOD system needed).
- Create natural atmospheric depth, especially at night and during storms.

---

## 9. Working with AI

### The Human-AI Workflow

This project was built entirely through conversation with an AI coding assistant (Claude). The human never wrote a line of code. The workflow:

1. **Human describes intent**: "Add a water system with waves."
2. **AI writes code**: Implements the feature across relevant files.
3. **Human tests**: Opens the headset, walks around, observes.
4. **Human gives feedback**: "The waves look like they're on a grid. They need more variety."
5. **AI iterates**: Adjusts parameters, adds cross-directional wave layers, tests edge cases.
6. **Repeat** until it feels right.

This loop — describe, implement, test, feel, feedback — is the core of the development process. It typically takes 3–8 iterations per feature to go from "first attempt" to "feels right."

### What AI Does Well

- **Architecture**: Designing module boundaries, data flow, and system coupling.
- **Implementation**: Writing hundreds of lines of working code from a description.
- **Breadth**: Touching many files in one change (weather affects 7 systems simultaneously).
- **Maths**: Astronomical calculations, noise functions, shader maths, audio synthesis.
- **Debugging**: Tracing issues across modules, finding subtle bugs (like `Float32BufferAttribute` copying data instead of wrapping it).
- **Refactoring**: Restructuring code while preserving behaviour.

### What AI Needs From You

- **Experiential feedback**: "This feels wrong" is more useful than "change line 47." Describe what you *see* and *feel*, not what code to write.
- **Direction, not micromanagement**: "Make the thunder more dramatic" works better than specifying exact filter frequencies.
- **Testing in context**: The AI cannot put on a VR headset. Your eyes, ears, and vestibular system are the final judge.
- **Taste**: The AI generates plausible solutions. You decide which one *feels* right for your creative vision.

### Effective Feedback Patterns

**Good feedback** (descriptive, experiential):
- "The rain looks like snow — fat round blobs instead of thin streaks."
- "The fog is too bright at dawn, trees stand out against it."
- "Thunder is too short and synthetic. It should reverberate and echo."
- "Cloudy and sunny look almost the same. Cloudy should be much darker."

**Less useful feedback** (prescriptive, vague):
- "Fix the rain." (What's wrong with it?)
- "Change the fog colour to #3a3a45." (Why? What problem does this solve?)
- "Make it better." (In what way?)

The AI can translate "it looks like snow" into "increase the aspect ratio in the fragment shader, use a muted blue-grey colour, and add distance-based opacity falloff." You provide the what; the AI figures out the how.

### Iteration Is Normal

Almost nothing works perfectly on the first attempt. In this project:

- Rain particles went through 4 iterations (invisible → snow-like → sparse drips → proper streaks).
- Sky/fog colours during weather went through 7 iterations to handle the time-of-day × weather matrix correctly.
- Thunder went through 2 complete rewrites (noise burst → filtered layers → 5-layer reverb).
- Ferns went through 3 geometry redesigns before looking natural.

This is not a failure of the AI — it's the nature of creative work. The AI gets you 80% of the way instantly; the remaining 20% is iterative refinement guided by your perception.

### Planning Complex Features

For non-trivial features, ask the AI to create a plan before writing code. The weather system in this project was planned as a detailed design document covering:

- Architecture (single intensity float driving all parameters)
- Derived parameter tables (what each system reads from weather)
- Integration points (which files change and how)
- Performance budget (how much headroom the feature uses)
- Time-of-day interaction matrix (how weather × time combinations should look)

The human reviewed and approved the plan before implementation began. This avoided expensive mid-implementation direction changes.

---

## 10. Getting Started

### Prerequisites

- A modern web browser (Chrome or Edge recommended for WebXR)
- A VR headset for testing (Quest 2/3/Pro, Pico 4)
- A text editor
- A local HTTPS server (required for WebXR)

### Minimal Setup

Create three files:

**`index.html`**:
```html
<!DOCTYPE html>
<html>
<head>
  <script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js" } }
  </script>
</head>
<body>
  <script type="module" src="main.js"></script>
</body>
</html>
```

**`main.js`**:
```javascript
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// VR button
const button = document.createElement('button');
button.textContent = 'Enter VR';
button.onclick = () => navigator.xr.requestSession('immersive-vr').then(s => renderer.xr.setSession(s));
document.body.appendChild(button);

// A simple scene
scene.background = new THREE.Color(0x87ceeb);
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.MeshLambertMaterial({ color: 0x228b22 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const dolly = new THREE.Group();
dolly.add(camera);
dolly.position.y = 1.6;
scene.add(dolly);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

Serve this over HTTPS and open it in your headset's browser. You should see a green ground plane and a blue sky in VR.

### Building From There

From this minimal base, add systems one at a time:

1. **Terrain**: Replace the flat plane with noise-based height displacement.
2. **Trees**: Add simple cone-and-cylinder trees using InstancedMesh.
3. **Day/night**: Calculate sun position from real time, adjust lighting.
4. **Audio**: Add footstep sounds synchronised to movement.
5. **Weather**: Add cloud darkening and rain particles.

Each system should be a separate module. Test in the headset frequently. Watch your framerate (most headsets have a performance overlay — on Quest, enable it in developer settings).

### Development Tips

- **Start ugly, iterate to beauty**: Get something visible in VR immediately, then refine.
- **Test in the headset often**: Desktop preview is misleading. Scale, presence, and performance all change in VR.
- **Monitor framerate constantly**: Quest's performance overlay shows FPS, CPU/GPU time, and dropped frames. If you see drops, stop and optimise before adding more.
- **Use `?parameter=value` URL overrides**: Add `?time=22:00` or `?weather=rainy` to quickly test specific conditions without waiting for them to occur naturally.
- **Commit often**: After each working feature, commit. You will break things; being able to revert is invaluable.

---

## 11. Glossary

**6DoF (Six Degrees of Freedom)**: Tracking both position (x, y, z) and rotation (pitch, yaw, roll). All modern VR headsets.

**Billboarding**: A technique where a flat sprite always faces the camera, creating the illusion of a 3D object from any angle.

**Chunk**: A square tile of terrain that can be independently loaded, rendered, and recycled.

**Draw call**: A single command from CPU to GPU to render an object. Minimising draw calls is the primary VR optimisation.

**fBm (Fractal Brownian Motion)**: Layered noise at increasing frequencies and decreasing amplitudes. Creates natural-looking terrain and patterns.

**Fragment shader**: A GPU program that determines the colour of each pixel.

**GLSL (OpenGL Shading Language)**: The C-like language used to write shaders for WebGL/Three.js.

**HRTF (Head-Related Transfer Function)**: Audio processing that simulates how sound reaches each ear from a specific direction, creating 3D spatial audio.

**InstancedMesh**: A Three.js optimisation that renders many copies of the same geometry in a single draw call, each with its own position/rotation/scale.

**LOD (Level of Detail)**: Showing simpler geometry for distant objects to save GPU work.

**Noise function**: A deterministic function that returns smooth, continuous pseudo-random values. Simplex noise and Perlin noise are the most common.

**`onBeforeCompile`**: A Three.js hook that lets you modify a material's generated shader code before it's compiled, allowing custom behaviour while keeping standard lighting/shadow support.

**Reprojection (ASW/ATW)**: A headset technique that warps the previous frame to approximate a new one when the application misses its framerate target. A safety net, not a solution.

**Stereoscopic rendering**: Rendering two slightly offset views (one per eye) to create depth perception.

**Uniform**: A value passed from JavaScript (CPU) to a shader (GPU) that stays constant across all vertices/pixels in a draw call.

**Vertex shader**: A GPU program that determines the position of each vertex.

**WebXR**: The browser API for VR and AR experiences, successor to the older WebVR API.
