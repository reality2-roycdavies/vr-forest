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

// --- Forest ---
const treePool = new TreePool(scene);
const vegPool = new VegetationPool(scene);

// --- Wildlife ---
const wildlife = new WildlifeSystem(scene, vr.camera);
wildlife.chunkManager = chunkManager;
wildlife.audio = audio;

// When chunks change, rebuild instanced meshes
chunkManager.onChunksChanged = () => {
  treePool.rebuild(chunkManager.getActiveChunks());
  vegPool.rebuild(chunkManager.getActiveChunks());
};

// --- VR Session Events ---
vr.onSessionStart = () => {
  audio.start();
  document.getElementById('info').style.display = 'none';
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
// Place player at origin
vr.dolly.position.set(0, 0, 0);
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

// --- Render Loop ---
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

  // Update day/night cycle (sky, sun, lights, fog, clouds)
  dayNight.update(pos);

  // Fireflies (night only)
  fireflies.update(delta, pos, dayNight.sunElevation);

  // Wildlife peek events
  wildlife.update(delta, pos);

  // Audio (birds, footsteps, crickets, rustles, spatial)
  vr.camera.getWorldDirection(_cameraDir);
  const nearbyTrees = getNearbyTrees(pos, CONFIG.RUSTLE_TRIGGER_DIST);
  audio.update(
    delta,
    dayNight.sunElevation,
    pos,
    _cameraDir,
    movement.isMoving,
    movement.groundType,
    movement.bobPhase,
    nearbyTrees
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
