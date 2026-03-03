// Gradient sky dome that follows the player
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createSky(scene) {
  const geo = new THREE.SphereGeometry(CONFIG.SKY_RADIUS, 16, 12);

  // Create gradient vertex colors
  const count = geo.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const posAttr = geo.getAttribute('position');

  const topColor = new THREE.Color(CONFIG.SKY_TOP_COLOR);
  const bottomColor = new THREE.Color(CONFIG.SKY_BOTTOM_COLOR);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const y = posAttr.getY(i);
    // Normalize y from [-radius, +radius] to [0, 1]
    const t = Math.max(0, y / CONFIG.SKY_RADIUS);

    tmpColor.lerpColors(bottomColor, topColor, t);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });

  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  scene.add(sky);

  return sky;
}
