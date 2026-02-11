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

    // Strip grass texture + shadows on shore/underwater
    const shoreY = CONFIG.SHORE_LEVEL;
    const waterY = CONFIG.WATER_LEVEL;
    groundMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.shoreLevel = { value: shoreY };
      shader.uniforms.waterLevel = { value: waterY };

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying float vWorldY;'
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;'
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nuniform float shoreLevel;\nuniform float waterLevel;\nvarying float vWorldY;'
      );
      // Shore transition: smoothly blend grass texture out over a 1.5m band
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float shoreMix = smoothstep(shoreLevel - 0.5, shoreLevel + 1.0, vWorldY);
         diffuseColor.rgb = mix(vColor, diffuseColor.rgb, shoreMix);`
      );
      // Below water level: remove shadows — use uniform ambient lighting
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <aomap_fragment>',
        '#include <aomap_fragment>\nif (vWorldY <= waterLevel) { reflectedLight.directDiffuse = reflectedLight.indirectDiffuse * 0.6; }'
      );
    };
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

  // Helper: draw at position + all wrap-around copies for seamless tiling
  function drawWrapped(drawFn, x, y, margin) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const wx = x + dx * size;
        const wy = y + dy * size;
        // Only draw if this copy is near the canvas
        if (wx > -margin && wx < size + margin && wy > -margin && wy < size + margin) {
          drawFn(wx, wy);
        }
      }
    }
  }

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
    drawWrapped((wx, wy) => {
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + lean, wy - len);
      ctx.stroke();
    }, x, y, 12);
  }

  // Soil speckles - small dots of earthy tones
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.5 + Math.random() * 2;
    const shade = 80 + Math.random() * 50;
    ctx.fillStyle = `rgba(${shade + 20 | 0}, ${shade | 0}, ${shade * 0.6 | 0}, ${0.2 + Math.random() * 0.3})`;
    drawWrapped((wx, wy) => {
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fill();
    }, x, y, 4);
  }

  // Small pebble details
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rx = 1 + Math.random() * 2.5;
    const ry = rx * (0.5 + Math.random() * 0.5);
    const rot = Math.random() * Math.PI;
    const shade = 100 + Math.random() * 55;
    ctx.fillStyle = `rgba(${shade | 0}, ${shade | 0}, ${shade * 0.9 | 0}, ${0.25 + Math.random() * 0.25})`;
    drawWrapped((wx, wy) => {
      ctx.beginPath();
      ctx.ellipse(wx, wy, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    }, x, y, 6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
