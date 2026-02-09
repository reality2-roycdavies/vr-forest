// Hemisphere + directional lights
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createLighting(scene) {
  // Hemisphere light: sky/ground ambient
  const hemi = new THREE.HemisphereLight(
    CONFIG.HEMISPHERE_SKY,
    CONFIG.HEMISPHERE_GROUND,
    CONFIG.HEMISPHERE_INTENSITY
  );
  scene.add(hemi);

  // Directional sun light (warm, no shadows for performance)
  const sun = new THREE.DirectionalLight(CONFIG.SUN_COLOR, CONFIG.SUN_INTENSITY);
  sun.position.set(50, 80, 30);
  sun.castShadow = false;
  scene.add(sun);

  return { hemi, sun };
}
