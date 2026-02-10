// Wind animation via vertex shader injection
// Patches MeshLambertMaterial (or any standard material) with gentle sway

import * as THREE from 'three';

// Shared uniforms — update uWindTime each frame
export const windUniforms = {
  uWindTime: { value: 0 },
  uWindStrength: { value: 1.0 },
  uWindDirection: { value: new THREE.Vector2(0.8, 0.6) }, // normalized XZ wind dir
};

// GLSL snippet injected into vertex shaders
const windParsChunk = /* glsl */ `
  uniform float uWindTime;
  uniform float uWindStrength;
  uniform vec2 uWindDirection;
`;

// Wind displacement for trees: sway based on world position + height
const treeWindChunk = /* glsl */ `
  {
    // Get world position of this vertex
    vec4 wpos = instanceMatrix * vec4(transformed, 1.0);
    float h = transformed.y; // local height in tree geometry

    // Slow primary sway (whole tree)
    float phase = dot(wpos.xz, vec2(0.07, 0.09));
    float sway = sin(uWindTime * 1.2 + phase) * 0.015 * uWindStrength;
    // Faster secondary rustle
    float rustle = sin(uWindTime * 3.5 + phase * 3.0) * 0.005 * uWindStrength;

    // Height factor: base doesn't move, top sways most
    float hFactor = smoothstep(0.0, 1.0, h * 0.8);
    float disp = (sway + rustle) * hFactor;

    transformed.x += disp * uWindDirection.x;
    transformed.z += disp * uWindDirection.y;
  }
`;

// Wind for canopy: more movement than trunk
const canopyWindChunk = /* glsl */ `
  {
    vec4 wpos = instanceMatrix * vec4(transformed, 1.0);
    float phase = dot(wpos.xz, vec2(0.07, 0.09));

    // Gentle primary sway
    float sway = sin(uWindTime * 1.2 + phase) * 0.025 * uWindStrength;
    // Leaf rustle — higher frequency
    float rustle = sin(uWindTime * 4.0 + phase * 4.0 + transformed.x * 10.0) * 0.01 * uWindStrength;
    float flutter = sin(uWindTime * 7.0 + transformed.z * 15.0 + phase * 2.0) * 0.004 * uWindStrength;

    float hFactor = smoothstep(0.0, 0.5, transformed.y * 0.5);
    float disp = (sway + rustle + flutter) * hFactor;

    transformed.x += disp * uWindDirection.x;
    transformed.z += disp * uWindDirection.y;
    // Slight Y wobble
    transformed.y += sin(uWindTime * 2.5 + phase * 2.0) * 0.004 * uWindStrength * hFactor;
  }
`;

// Wind for vegetation (grass, ferns, flowers): base stays put, tips sway
const vegWindChunk = /* glsl */ `
  {
    vec4 wpos = instanceMatrix * vec4(transformed, 1.0);
    float phase = dot(wpos.xz, vec2(0.13, 0.17));

    // Gentle grass sway
    float sway = sin(uWindTime * 2.5 + phase) * 0.025 * uWindStrength;
    float gust = sin(uWindTime * 5.0 + phase * 3.0) * 0.008 * uWindStrength;

    // Height factor: base is anchored
    float hFactor = smoothstep(0.0, 0.15, transformed.y);
    float disp = (sway + gust) * hFactor;

    transformed.x += disp * uWindDirection.x;
    transformed.z += disp * uWindDirection.y;
  }
`;

/**
 * Patch a material to add wind vertex displacement.
 * @param {THREE.Material} material
 * @param {'tree'|'canopy'|'vegetation'} type
 */
export function addWindToMaterial(material, type) {
  const windChunk =
    type === 'tree' ? treeWindChunk :
    type === 'canopy' ? canopyWindChunk :
    vegWindChunk;

  material.onBeforeCompile = (shader) => {
    // Add uniforms
    shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.uniforms.uWindDirection = windUniforms.uWindDirection;

    // Inject uniform declarations
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\n' + windParsChunk
    );

    // Inject displacement after all transforms are computed but before projection
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' + windChunk
    );
  };

  // Force recompilation
  material.needsUpdate = true;
}

/**
 * Call each frame to advance wind time
 */
export function updateWind(delta) {
  windUniforms.uWindTime.value += delta;

  // Slowly vary wind direction for natural feel
  const t = windUniforms.uWindTime.value * 0.05;
  const angle = Math.sin(t) * 0.4 + Math.cos(t * 0.7) * 0.3;
  windUniforms.uWindDirection.value.set(
    Math.cos(angle) * 0.8 + 0.2,
    Math.sin(angle) * 0.6 + 0.3
  ).normalize();
}
