// Distance fog to hide chunk boundaries
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createFog(scene) {
  scene.fog = new THREE.Fog(CONFIG.FOG_COLOR, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);
  scene.background = new THREE.Color(CONFIG.FOG_COLOR);
}
