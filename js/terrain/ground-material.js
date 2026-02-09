// Shared textured ground material for all terrain chunks
import * as THREE from 'three';
import { CONFIG } from '../config.js';

let groundMaterial = null;

/**
 * Get the shared ground material (created once, reused by all chunks).
 */
export function getGroundMaterial() {
  if (!groundMaterial) {
    groundMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: createGroundTexture(),
    });
  }
  return groundMaterial;
}

/**
 * Procedural grass/dirt ground texture.
 * Short grass blades and soil detail painted onto a canvas.
 */
function createGroundTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Neutral mid-tone base (vertex colors provide the green/brown tint)
  ctx.fillStyle = '#8a8a7a';
  ctx.fillRect(0, 0, size, size);

  // Grass blade strokes - many small vertical lines
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 3 + Math.random() * 8;
    const lean = (Math.random() - 0.5) * 4;
    const bright = Math.random() > 0.5;
    const shade = bright ? 110 + Math.random() * 40 : 70 + Math.random() * 30;
    const green = shade + 10 + Math.random() * 20;

    ctx.strokeStyle = `rgba(${shade * 0.7 | 0}, ${green | 0}, ${shade * 0.4 | 0}, ${0.3 + Math.random() * 0.4})`;
    ctx.lineWidth = 0.5 + Math.random() * 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + lean, y - len);
    ctx.stroke();
  }

  // Soil speckles - small dots of earthy tones
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.5 + Math.random() * 2;
    const shade = 80 + Math.random() * 50;
    ctx.fillStyle = `rgba(${shade + 20 | 0}, ${shade | 0}, ${shade * 0.6 | 0}, ${0.2 + Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Small pebble details
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rx = 1 + Math.random() * 2.5;
    const ry = rx * (0.5 + Math.random() * 0.5);
    const shade = 100 + Math.random() * 55;
    ctx.fillStyle = `rgba(${shade | 0}, ${shade | 0}, ${shade * 0.9 | 0}, ${0.25 + Math.random() * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
