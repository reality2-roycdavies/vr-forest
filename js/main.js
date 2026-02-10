// Bootstrap: scene, systems, render loop
import * as THREE from 'three';
import { VRSetup } from './vr-setup.js';
import { InputManager } from './input.js';
import { MovementSystem } from './movement.js';
import { ChunkManager } from './terrain/chunk-manager.js';
import { TreePool } from './forest/tree-pool.js';
import { VegetationPool } from './forest/vegetation.js';
import { DayNightSystem } from './atmosphere/day-night.js';
import { AmbientAudio } from './atmosphere/audio.js';
import { WildlifeSystem } from './forest/wildlife.js';
import { FireflySystem } from './atmosphere/fireflies.js';
import { CONFIG } from './config.js';
import { updateWind } from './atmosphere/wind.js';
import { BirdFlockSystem } from './forest/birds.js';

// --- Scene ---
const scene = new THREE.Scene();

// --- VR Setup ---
const vr = new VRSetup();
vr.init();
scene.add(vr.dolly);

// --- Input ---
const input = new InputManager(vr);

// --- Movement ---
const movement = new MovementSystem(vr, input);

// --- Atmosphere ---
const dayNight = new DayNightSystem(scene);
const fireflies = new FireflySystem(scene);
const audio = new AmbientAudio();

// --- Terrain ---
const chunkManager = new ChunkManager(scene);
movement.chunkManager = chunkManager;

// --- Water surface with wave displacement ---
const waterGeom = new THREE.PlaneGeometry(180, 180, 720, 720);
waterGeom.rotateX(-Math.PI / 2);
const waterMat = new THREE.MeshPhongMaterial({
  color: new THREE.Color(CONFIG.WATER_COLOR.r, CONFIG.WATER_COLOR.g, CONFIG.WATER_COLOR.b),
  specular: new THREE.Color(0.6, 0.6, 0.6),
  shininess: 120,
  transparent: true,
  opacity: 0.82,
  depthWrite: false,
});
const waterTimeUniform = { value: 0 };
waterMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = waterTimeUniform;

  // --- Shared GLSL noise functions ---
  const noiseGLSL = `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying float vWaveH;
    // Wave displacement — many cross-directional waves to avoid bands
    float waveHeight(vec2 p, float t) {
      float h = 0.0;
      // Each wave uses a unique angle to avoid aligned bands
      // Gentle swells at varied angles
      h += sin(dot(p, vec2( 0.38,  0.12)) + t * 0.35) * 0.045;
      h += sin(dot(p, vec2(-0.15,  0.35)) + t * 0.28) * 0.040;
      h += sin(dot(p, vec2( 0.27, -0.22)) + t * 0.42) * 0.030;
      // Medium chop — more angled directions
      h += sin(dot(p, vec2( 0.45, -0.55)) + t * 0.55) * 0.020;
      h += sin(dot(p, vec2(-0.50,  0.30)) + t * 0.48) * 0.018;
      h += sin(dot(p, vec2( 0.60,  0.40)) + t * 0.65) * 0.015;
      h += sin(dot(p, vec2(-0.35, -0.60)) + t * 0.58) * 0.012;
      // Fine ripples — scattered directions
      h += sin(dot(p, vec2( 1.70,  1.10)) + t * 1.00) * 0.007;
      h += sin(dot(p, vec2(-1.30,  1.80)) + t * 0.90) * 0.006;
      h += sin(dot(p, vec2( 2.10, -0.90)) + t * 1.20) * 0.005;
      h += sin(dot(p, vec2(-0.80, -2.20)) + t * 1.10) * 0.004;
      h += sin(dot(p, vec2( 2.80,  1.50)) + t * 1.40) * 0.003;
      h += sin(dot(p, vec2(-1.70,  2.80)) + t * 1.30) * 0.002;
      return h;
    }
    // Surface pattern for flecks — multiple sine layers, no grid
    float wSurface(vec2 p) {
      float v = 0.0;
      v += sin(p.x * 1.1 + p.y * 0.9) * 0.22;
      v += sin(p.x * 0.7 - p.y * 1.3) * 0.22;
      v += sin(p.x * 1.8 + p.y * 0.4) * 0.18;
      v += sin(p.x * 0.3 + p.y * 2.1) * 0.15;
      v += sin(p.x * 2.4 - p.y * 1.7) * 0.13;
      v += sin(p.x * 0.5 + p.y * 0.5) * 0.10;
      return v * 0.5 + 0.5;
    }
  `;

  // --- Vertex shader: wave normals + displacement ---
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    '#include <common>\n' + noiseGLSL
  );
  // Compute wave normal BEFORE defaultnormal_vertex runs
  shader.vertexShader = shader.vertexShader.replace(
    '#include <beginnormal_vertex>',
    `// Wave normal from finite differences (runs before defaultnormal_vertex)
    vec3 wpN = (modelMatrix * vec4(position, 1.0)).xyz;
    float epsN = 0.5;
    float hL = waveHeight(wpN.xz - vec2(epsN, 0.0), uTime);
    float hR = waveHeight(wpN.xz + vec2(epsN, 0.0), uTime);
    float hD = waveHeight(wpN.xz - vec2(0.0, epsN), uTime);
    float hU = waveHeight(wpN.xz + vec2(0.0, epsN), uTime);
    // Exaggerate normal tilt (small Y divisor) so lighting reveals wave shape
    vec3 objectNormal = normalize(vec3((hL - hR) * 4.0, epsN * 0.5, (hD - hU) * 4.0));
    #ifdef USE_TANGENT
      vec3 objectTangent = vec3(1.0, 0.0, 0.0);
    #endif`
  );
  // Displace vertex Y for waves (runs after normals are set)
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vWorldPos = wp;
    float wH = waveHeight(wp.xz, uTime);
    vWaveH = wH;
    transformed.y += wH;`
  );

  // --- Fragment shader: surface flecks ---
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    '#include <common>\n' + noiseGLSL
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    `#include <dithering_fragment>
    vec2 wPos = vWorldPos.xz;
    // Wave height tinting — crests lighter, troughs darker
    float wNorm = clamp(vWaveH * 5.0 + 0.5, 0.0, 1.0);
    gl_FragColor.rgb += (wNorm - 0.5) * 0.12;
    // Subtle drifting surface pattern — low contrast
    float n1 = wSurface(wPos * 0.5 + vec2(uTime * 0.04, uTime * 0.025));
    float n2 = wSurface(wPos * 0.7 + vec2(-uTime * 0.03, uTime * 0.045) + 50.0);
    float combined = n1 * 0.5 + n2 * 0.5;
    float fleck = smoothstep(0.50, 0.70, combined);
    gl_FragColor.rgb += fleck * 0.08;
    float dark = (1.0 - smoothstep(0.30, 0.50, combined)) * 0.03;
    gl_FragColor.rgb -= dark;`
  );
};
const waterPlane = new THREE.Mesh(waterGeom, waterMat);
waterPlane.position.y = CONFIG.WATER_LEVEL;
waterPlane.receiveShadow = false;
waterPlane.renderOrder = -1; // after sky (-2) but before opaque objects
scene.add(waterPlane);

// --- Forest ---
const treePool = new TreePool(scene);
const vegPool = new VegetationPool(scene);

// --- Wildlife ---
const wildlife = new WildlifeSystem(scene, vr.camera);
wildlife.chunkManager = chunkManager;
wildlife.audio = audio;

// --- Birds ---
const birds = new BirdFlockSystem(scene);

// When chunks change, rebuild instanced meshes
chunkManager.onChunksChanged = () => {
  treePool.rebuild(chunkManager.getActiveChunks());
  vegPool.rebuild(chunkManager.getActiveChunks());
};

// --- VR Session Events ---
vr.onSessionStart = () => {
  audio.start();
  if (audio.ctx) birds.setAudioContext(audio.ctx, audio.spatialBus);
  document.getElementById('info').style.display = 'none';
  // Re-apply 180° rotation so player faces the lake in VR
  vr.dolly.rotation.y = Math.PI;
};

vr.onSessionEnd = () => {
  audio.stop();
  document.getElementById('info').style.display = '';
};

// --- Hide info overlay + start audio on first desktop interaction ---
{
  const infoEl = document.getElementById('info');
  const onFirstInteraction = () => {
    infoEl.style.display = 'none';
    audio.start();
    if (audio.ctx) birds.setAudioContext(audio.ctx, audio.spatialBus);
    window.removeEventListener('keydown', onFirstInteraction);
    document.removeEventListener('pointerlockchange', onLockInteraction);
    window.removeEventListener('click', onFirstInteraction);
  };
  const onLockInteraction = () => {
    if (document.pointerLockElement) onFirstInteraction();
  };
  window.addEventListener('keydown', onFirstInteraction);
  window.addEventListener('click', onFirstInteraction);
  document.addEventListener('pointerlockchange', onLockInteraction);
}

// --- Initial Load ---
// Place player at origin, facing the lake
vr.dolly.position.set(0, 0, 0);
vr.dolly.rotation.y = Math.PI; // face 180° toward the lake
chunkManager.forceLoadAll(0, 0);

// --- Nearby tree helper for audio rustling ---
const _cameraDir = new THREE.Vector3();

function getNearbyTrees(playerPos, radius) {
  const trees = [];
  const cx = Math.floor(playerPos.x / CONFIG.CHUNK_SIZE);
  const cz = Math.floor(playerPos.z / CONFIG.CHUNK_SIZE);
  const radiusSq = radius * radius;

  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = `${cx + dx},${cz + dz}`;
      const chunk = chunkManager.activeChunks.get(key);
      if (!chunk || !chunk.active) continue;

      for (const tree of chunk.treePositions) {
        const ddx = playerPos.x - tree.x;
        const ddz = playerPos.z - tree.z;
        if (ddx * ddx + ddz * ddz < radiusSq) {
          trees.push(tree);
        }
      }
    }
  }
  return trees;
}

// --- Time offset overlay (desktop) ---
const timeEl = document.createElement('div');
timeEl.style.cssText = 'position:fixed;top:10px;right:10px;color:#fff;font:14px monospace;z-index:999;background:rgba(0,0,0,0.4);padding:6px 10px;border-radius:4px;display:none;';
document.body.appendChild(timeEl);

// --- Time offset overlay (VR HUD) ---
const vrTimeCanvas = document.createElement('canvas');
vrTimeCanvas.width = 256;
vrTimeCanvas.height = 64;
const vrTimeCtx = vrTimeCanvas.getContext('2d');
const vrTimeTex = new THREE.CanvasTexture(vrTimeCanvas);
const vrTimeMat = new THREE.SpriteMaterial({
  map: vrTimeTex,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  fog: false,
});
const vrTimeSprite = new THREE.Sprite(vrTimeMat);
vrTimeSprite.scale.set(0.12, 0.03, 1);
vrTimeSprite.position.set(0, -0.08, -0.3); // below center of view, close
vrTimeSprite.visible = false;
vr.camera.add(vrTimeSprite);

function updateVrTimeHud(text) {
  vrTimeCtx.clearRect(0, 0, 256, 64);
  if (text) {
    vrTimeCtx.fillStyle = 'rgba(0,0,0,0.5)';
    vrTimeCtx.roundRect(0, 0, 256, 64, 8);
    vrTimeCtx.fill();
    vrTimeCtx.fillStyle = '#ffffff';
    vrTimeCtx.font = 'bold 36px monospace';
    vrTimeCtx.textAlign = 'center';
    vrTimeCtx.textBaseline = 'middle';
    vrTimeCtx.fillText(text, 128, 32);
  }
  vrTimeTex.needsUpdate = true;
}

// --- Render Loop ---
let timeHudFade = 0;
const clock = new THREE.Clock();

function onFrame() {
  const delta = Math.min(clock.getDelta(), 0.1); // Cap delta to avoid jumps

  // Poll input
  input.update();

  // Movement
  movement.update(delta);

  // Update chunks around player
  const pos = movement.getPlayerPosition();
  chunkManager.update(pos.x, pos.z);

  // Water plane follows player XZ + animate flecks
  waterPlane.position.x = pos.x;
  waterPlane.position.z = pos.z;
  waterTimeUniform.value += delta;

  // Wind animation
  updateWind(delta);

  // Time scrubbing (right grip + stick Y in VR, [ ] on desktop)
  if (input.timeAdjust !== 0) {
    dayNight.timeOffset += input.timeAdjust * delta * 3; // 3 hours per second
  }

  // Update day/night cycle (sky, sun, lights, fog, clouds, moon)
  dayNight.update(pos, vr.camera);

  // Show time offset indicator (visible while adjusting, fades out after)
  const isAdjusting = input.timeAdjust !== 0;
  const hasOffset = Math.abs(dayNight.timeOffset) > 0.01;
  if (isAdjusting && hasOffset) {
    timeHudFade = 1.0;
  } else {
    timeHudFade = Math.max(0, timeHudFade - delta * 1.5); // fade over ~0.7s
  }
  if (timeHudFade > 0.01 && hasOffset) {
    const sign = dayNight.timeOffset > 0 ? '+' : '-';
    const abs = Math.abs(dayNight.timeOffset);
    const h = Math.floor(abs);
    const m = Math.floor((abs % 1) * 60);
    const offsetStr = `${sign}${h}:${String(m).padStart(2, '0')}`;
    timeEl.textContent = offsetStr;
    timeEl.style.display = '';
    timeEl.style.opacity = timeHudFade;
    vrTimeSprite.visible = true;
    vrTimeMat.opacity = timeHudFade;
    updateVrTimeHud(offsetStr);
  } else {
    timeEl.style.display = 'none';
    vrTimeSprite.visible = false;
  }

  // Fireflies (night only)
  fireflies.update(delta, pos, dayNight.sunElevation);
  birds.update(delta, pos, dayNight.sunElevation);

  // Wildlife peek events
  wildlife.update(delta, pos, dayNight.sunElevation);

  // Audio (birds, footsteps, crickets, rustles, water ambient, spatial)
  vr.camera.getWorldDirection(_cameraDir);
  const nearbyTrees = getNearbyTrees(pos, CONFIG.RUSTLE_TRIGGER_DIST);
  const waterProximity = Math.max(0, 1 - Math.abs(pos.y - CONFIG.WATER_LEVEL) / 8);
  audio.update(
    delta,
    dayNight.sunElevation,
    pos,
    _cameraDir,
    movement.isMoving,
    movement.groundType,
    movement.bobPhase,
    nearbyTrees,
    waterProximity
  );

  // Render
  vr.renderer.render(scene, vr.camera);
}

vr.renderer.setAnimationLoop(onFrame);

// --- Debug info (desktop only) ---
if (window.location.search.includes('debug')) {
  const debugEl = document.createElement('div');
  debugEl.style.cssText = 'position:fixed;bottom:10px;left:10px;color:#0f0;font:12px monospace;z-index:999;background:rgba(0,0,0,0.5);padding:8px;';
  document.body.appendChild(debugEl);

  setInterval(() => {
    const info = vr.renderer.info;
    const pos = movement.getPlayerPosition();
    debugEl.innerHTML = [
      `pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`,
      `draw calls: ${info.render.calls}`,
      `triangles: ${info.render.triangles}`,
      `geometries: ${info.memory.geometries}`,
      `textures: ${info.memory.textures}`,
    ].join('<br>');
  }, 500);
}
