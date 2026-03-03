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
export function createCanopyTexture(baseHex = 0x2d5a1e, size = 128, style = 'broad') {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const base = hexToRgb(baseHex);
  ctx.fillStyle = `rgb(${base.r}, ${base.g}, ${base.b})`;
  ctx.fillRect(0, 0, size, size);

  if (style === 'needle') {
    // Pine: dense short needle strokes in varied directions
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = 3 + Math.random() * 8;
      const angle = Math.random() * Math.PI;
      const bright = Math.random() > 0.4;
      const shift = bright ? 15 + Math.random() * 25 : -(15 + Math.random() * 25);
      ctx.strokeStyle = `rgba(${clamp(base.r + shift - 5)}, ${clamp(base.g + shift * 1.2)}, ${clamp(base.b + shift * 0.8)}, ${0.4 + Math.random() * 0.4})`;
      ctx.lineWidth = 0.5 + Math.random() * 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
    // Dark depth gaps
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = `rgba(${clamp(base.r - 35)}, ${clamp(base.g - 30)}, ${clamp(base.b - 15)}, ${0.3 + Math.random() * 0.3})`;
      ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  } else if (style === 'broad') {
    // Oak: larger overlapping leaf-like ellipses
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const rx = 3 + Math.random() * 7;
      const ry = rx * (0.5 + Math.random() * 0.5);
      const rot = Math.random() * Math.PI;
      const bright = Math.random() > 0.35;
      const shift = bright ? 20 + Math.random() * 30 : -(20 + Math.random() * 25);
      const hueShift = (Math.random() - 0.5) * 12;
      ctx.fillStyle = `rgba(${clamp(base.r + shift + hueShift)}, ${clamp(base.g + shift * 1.3)}, ${clamp(base.b + shift * 0.4)}, ${0.35 + Math.random() * 0.45})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    }
    // Leaf veins / dark gaps
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 1 + Math.random() * 3;
      ctx.fillStyle = `rgba(${clamp(base.r - 40)}, ${clamp(base.g - 35)}, ${clamp(base.b - 15)}, ${0.25 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'scale') {
    // Alpine: dense overlapping scale-like marks for tough compact foliage
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const rx = 2 + Math.random() * 4;
      const ry = rx * (0.4 + Math.random() * 0.3);
      const rot = Math.random() * Math.PI * 0.5 - Math.PI * 0.25;
      const bright = Math.random() > 0.5;
      const shift = bright ? 10 + Math.random() * 20 : -(10 + Math.random() * 20);
      ctx.fillStyle = `rgba(${clamp(base.r + shift)}, ${clamp(base.g + shift * 1.1)}, ${clamp(base.b + shift * 0.6)}, ${0.4 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    }
    // Dark gaps between scales
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = `rgba(${clamp(base.r - 40)}, ${clamp(base.g - 35)}, ${clamp(base.b - 20)}, ${0.3 + Math.random() * 0.3})`;
      ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  } else {
    // Birch: small round leaves, lighter, with yellow-green tint
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 1.5 + Math.random() * 4;
      const bright = Math.random() > 0.3;
      const shift = bright ? 20 + Math.random() * 40 : -(15 + Math.random() * 20);
      // Birch leaves tend yellow-green
      const yellowShift = Math.random() * 20;
      ctx.fillStyle = `rgba(${clamp(base.r + shift + yellowShift)}, ${clamp(base.g + shift * 1.2 + yellowShift * 0.5)}, ${clamp(base.b + shift * 0.3)}, ${0.35 + Math.random() * 0.45})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bright highlight spots (light filtering through)
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 2 + Math.random() * 4;
      ctx.fillStyle = `rgba(${clamp(base.r + 50)}, ${clamp(base.g + 45)}, ${clamp(base.b + 10)}, ${0.15 + Math.random() * 0.2})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
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
