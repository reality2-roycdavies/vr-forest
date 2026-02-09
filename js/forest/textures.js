// Procedural canvas-based textures (generated at startup, no image files)
import * as THREE from 'three';

/**
 * Generate a bark texture. Vertical streaks with knots.
 */
export function createBarkTexture(baseColor = '#5c3a1e', size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base color fill
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Vertical bark lines
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const w = 1 + Math.random() * 2;
    const lightness = Math.random() > 0.5 ? 20 : -20;
    ctx.strokeStyle = `rgba(${128 + lightness}, ${80 + lightness}, ${40 + lightness}, ${0.3 + Math.random() * 0.3})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    // Slightly wavy line
    for (let y = 0; y < size; y += 8) {
      ctx.lineTo(x + Math.sin(y * 0.1) * 2, y);
    }
    ctx.stroke();
  }

  // Knots
  for (let i = 0; i < 3; i++) {
    const kx = Math.random() * size;
    const ky = Math.random() * size;
    const kr = 3 + Math.random() * 5;
    ctx.fillStyle = `rgba(40, 25, 10, ${0.4 + Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(kx, ky, kr, kr * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  return tex;
}

/**
 * Birch bark: white with horizontal dark bands
 */
export function createBirchBarkTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // White base
  ctx.fillStyle = '#d4cfc0';
  ctx.fillRect(0, 0, size, size);

  // Horizontal dark bands
  for (let i = 0; i < 20; i++) {
    const y = Math.random() * size;
    const h = 1 + Math.random() * 3;
    ctx.fillStyle = `rgba(60, 50, 40, ${0.2 + Math.random() * 0.4})`;
    ctx.fillRect(0, y, size, h);
  }

  // Subtle peeling marks
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `rgba(180, 170, 150, ${0.3 + Math.random() * 0.3})`;
    ctx.fillRect(x, y, 5 + Math.random() * 15, 1 + Math.random() * 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  return tex;
}

/**
 * Leafy canopy texture: dappled green with light/dark patches
 */
export function createCanopyTexture(baseHex = 0x2d5a1e, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const base = hexToRgb(baseHex);
  ctx.fillStyle = `rgb(${base.r}, ${base.g}, ${base.b})`;
  ctx.fillRect(0, 0, size, size);

  // Dappled leaf clusters
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 2 + Math.random() * 6;
    const bright = Math.random() > 0.4;
    const shift = bright ? 25 + Math.random() * 20 : -(15 + Math.random() * 20);
    ctx.fillStyle = `rgba(${clamp(base.r + shift)}, ${clamp(base.g + shift * 1.3)}, ${clamp(base.b + shift * 0.5)}, ${0.4 + Math.random() * 0.4})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Simple ground/rock texture
 */
export function createRockTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#888';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = 100 + Math.random() * 60;
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade - 10}, 0.4)`;
    ctx.fillRect(x, y, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function hexToRgb(hex) {
  return {
    r: (hex >> 16) & 255,
    g: (hex >> 8) & 255,
    b: hex & 255,
  };
}

function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}
