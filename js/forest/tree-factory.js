// 3 procedural tree geometries built from merged primitives with vertex colors
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createBarkTexture, createBirchBarkTexture, createCanopyTexture } from './textures.js';
import { addWindToMaterial } from '../atmosphere/wind.js';

const trunkGeometries = [];
const canopyGeometries = [];
const trunkMaterials = [];
const canopyMaterials = [];

const _v = new THREE.Vector3();
const _color = new THREE.Color();

export function initTreeGeometries() {
  // Generate procedural textures
  const barkTex = createBarkTexture('#5c3a1e', 128);
  const birchTex = createBirchBarkTexture(128);
  const canopyTexes = [
    createCanopyTexture(0x18401a, 128, 'needle'),  // Pine: dark cool green needles
    createCanopyTexture(0x386020, 128, 'broad'),    // Oak: warm rich green broad leaves
    createCanopyTexture(0x5a9035, 128, 'small'),    // Birch: bright yellow-green small leaves
  ];

  const trunkMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: barkTex });
  const birchMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: birchTex });
  addWindToMaterial(trunkMat, 'tree');
  addWindToMaterial(birchMat, 'tree');

  // --- Type 0: Pine ---
  {
    const trunk = buildTrunk(0.06, 0.13, 1.1, 8, 4, [
      { height: 0.4, angle: 0.5, length: 0.25 },
      { height: 0.6, angle: -0.7, length: 0.22 },
      { height: 0.85, angle: 1.9, length: 0.18 },
    ]);
    addCylindricalUVs(trunk, 1.1);
    trunkGeometries.push(trunk);

    const parts = [];
    parts.push(makeCanopyLobe(0, 0.85, 0, 0.8, 1.1, 9));
    parts.push(makeCanopyLobe(0.1, 1.2, -0.08, 0.65, 0.9, 9));
    parts.push(makeCanopyLobe(-0.08, 1.5, 0.06, 0.5, 0.75, 8));
    parts.push(makeCanopyLobe(0.05, 1.8, -0.03, 0.38, 0.6, 7));
    parts.push(makeCanopyLobe(-0.04, 2.05, 0.02, 0.25, 0.4, 6));
    const canopy = mergeAll(parts);
    tintCanopyVertexColors(canopy, 0x18401a, 0.28);
    addSphericalUVs(canopy);
    canopyGeometries.push(canopy);

    trunkMaterials.push(trunkMat);
    const pineMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: canopyTexes[0] });
    addWindToMaterial(pineMat, 'canopy');
    canopyMaterials.push(pineMat);
  }

  // --- Type 1: Oak ---
  {
    const trunk = buildTrunk(0.09, 0.17, 0.95, 8, 4, [
      { height: 0.4, angle: 0.8, length: 0.35 },
      { height: 0.5, angle: -0.6, length: 0.3 },
      { height: 0.65, angle: 1.8, length: 0.25 },
      { height: 0.8, angle: -1.2, length: 0.18 },
    ]);
    addCylindricalUVs(trunk, 0.95);
    trunkGeometries.push(trunk);

    const parts = [];
    parts.push(makeCanopySphere(0, 1.35, 0, 0.55, 2));
    parts.push(makeCanopySphere(0.32, 1.25, 0.18, 0.45, 2));
    parts.push(makeCanopySphere(-0.28, 1.3, -0.22, 0.48, 2));
    parts.push(makeCanopySphere(0.05, 1.6, -0.12, 0.42, 2));
    parts.push(makeCanopySphere(-0.15, 1.55, 0.25, 0.38, 2));
    parts.push(makeCanopySphere(0.2, 1.5, -0.3, 0.35, 1));
    const canopy = mergeAll(parts);
    tintCanopyVertexColors(canopy, 0x386020, 0.25);
    addSphericalUVs(canopy);
    canopyGeometries.push(canopy);

    trunkMaterials.push(trunkMat);
    const oakMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: canopyTexes[1] });
    addWindToMaterial(oakMat, 'canopy');
    canopyMaterials.push(oakMat);
  }

  // --- Type 2: Birch ---
  {
    const trunk = buildTrunk(0.04, 0.07, 1.3, 6, 5, [
      { height: 0.6, angle: 0.6, length: 0.22 },
      { height: 0.85, angle: -0.9, length: 0.2 },
      { height: 1.0, angle: 1.5, length: 0.18 },
      { height: 1.15, angle: -0.3, length: 0.12 },
    ]);
    tintTrunkBirch(trunk);
    addCylindricalUVs(trunk, 1.3);
    trunkGeometries.push(trunk);

    const parts = [];
    parts.push(makeCanopyLobe(0.18, 1.2, 0.12, 0.48, 0.7, 8));
    parts.push(makeCanopyLobe(-0.22, 1.4, -0.12, 0.4, 0.6, 8));
    parts.push(makeCanopyLobe(0.0, 1.65, 0.0, 0.33, 0.5, 7));
    parts.push(makeCanopyLobe(0.1, 1.85, -0.08, 0.22, 0.35, 6));
    const canopy = mergeAll(parts);
    tintCanopyVertexColors(canopy, 0x5a9035, 0.3);
    addSphericalUVs(canopy);
    canopyGeometries.push(canopy);

    trunkMaterials.push(birchMat);
    const birchCanopyMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: canopyTexes[2] });
    addWindToMaterial(birchCanopyMat, 'canopy');
    canopyMaterials.push(birchCanopyMat);
  }
}

/**
 * Build a trunk with taper, segments, and branch stubs. Includes vertex colors.
 */
function buildTrunk(radiusTop, radiusBot, height, radialSegs, heightSegs, branches) {
  const parts = [];

  // Main trunk cylinder
  const main = new THREE.CylinderGeometry(radiusTop, radiusBot, height, radialSegs, heightSegs);
  main.translate(0, height / 2, 0);

  // Warp trunk slightly for organic feel
  const posAttr = main.getAttribute('position');
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const t = y / height;
    // S-curve bend for organic feel
    const bend = Math.sin(t * Math.PI) * 0.06 + Math.sin(t * Math.PI * 2.5) * 0.02;
    posAttr.setX(i, posAttr.getX(i) + bend);
  }
  posAttr.needsUpdate = true;
  main.computeVertexNormals();
  parts.push(main);

  // Branch stubs
  for (const b of branches) {
    const stub = new THREE.CylinderGeometry(radiusTop * 0.4, radiusTop * 0.7, b.length, 4, 1);
    // Rotate to point outward
    stub.rotateZ(Math.PI / 2 - 0.3);
    stub.rotateY(b.angle);
    stub.translate(
      Math.cos(b.angle) * radiusBot * 0.5,
      b.height,
      Math.sin(b.angle) * radiusBot * 0.5
    );
    parts.push(stub);
  }

  const merged = mergeAll(parts);

  // Add vertex colors: dark at base, lighter toward top
  const baseColor = new THREE.Color(0x3d2510);
  const tipColor = new THREE.Color(0x6b4828);
  addVertexColorGradient(merged, baseColor, tipColor, height);

  return merged;
}

/**
 * Override birch trunk colors to white/grey bark with dark marks
 */
function tintTrunkBirch(geometry) {
  const posAttr = geometry.getAttribute('position');
  const colors = geometry.getAttribute('color');
  const white = new THREE.Color(0xd4cfc0);
  const mark = new THREE.Color(0x555045);

  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    // Pseudo-random dark horizontal bands
    const band = Math.sin(y * 25) * 0.5 + Math.sin(y * 63) * 0.3;
    const t = band > 0.4 ? 0.5 : 0;
    _color.copy(white).lerp(mark, t);
    colors.setXYZ(i, _color.r, _color.g, _color.b);
  }
  colors.needsUpdate = true;
}

/**
 * A cone lobe for conifer-style canopies
 */
function makeCanopyLobe(ox, oy, oz, radius, height, segments) {
  const cone = new THREE.ConeGeometry(radius, height, segments, 3, true); // openEnded: no flat base
  jitterVertices(cone, 0.08);
  cone.translate(ox, oy + height * 0.35, oz);
  return cone;
}

/**
 * A sphere lobe for deciduous canopies
 */
function makeCanopySphere(ox, oy, oz, radius, detail) {
  const sphere = new THREE.IcosahedronGeometry(radius, detail);
  jitterVertices(sphere, 0.1);
  sphere.translate(ox, oy, oz);
  return sphere;
}

/**
 * Slightly displace vertices for organic irregular shapes
 */
function jitterVertices(geometry, amount) {
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    _v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    // Use vertex position itself as a deterministic seed
    const hash = Math.sin(_v.x * 127.1 + _v.y * 311.7 + _v.z * 74.7) * 43758.5453;
    const frac = hash - Math.floor(hash);
    const displacement = (frac - 0.5) * 2 * amount;
    _v.normalize().multiplyScalar(displacement);
    pos.setXYZ(i, pos.getX(i) + _v.x, pos.getY(i) + _v.y, pos.getZ(i) + _v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/**
 * Add vertex color gradient based on Y position (dark bottom, light top)
 */
function addVertexColorGradient(geometry, baseColor, tipColor, maxHeight) {
  const posAttr = geometry.getAttribute('position');
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const y = posAttr.getY(i);
    const t = Math.max(0, Math.min(1, y / maxHeight));
    _color.copy(baseColor).lerp(tipColor, t);
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

/**
 * Add vertex colors to canopy: darker at bottom/interior, lighter at top/outside.
 * Adds natural variation so the canopy doesn't look flat.
 */
function tintCanopyVertexColors(geometry, baseColorHex, variationAmount) {
  const posAttr = geometry.getAttribute('position');
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(baseColorHex);
  const lighter = base.clone().offsetHSL(0, -0.05, 0.12);
  const darker = base.clone().offsetHSL(0, 0.05, -0.08);

  // Find Y bounds
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = posAttr.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const range = maxY - minY || 1;

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    // Height factor: top is lighter
    const ht = (y - minY) / range;

    // Distance from center in XZ: outer is lighter
    const dist = Math.sqrt(x * x + z * z);
    const dt = Math.min(1, dist * 2);

    const t = ht * 0.6 + dt * 0.4;
    _color.copy(darker).lerp(lighter, t);

    // Add pseudo-random per-vertex variation
    const hash = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    const noise = ((hash - Math.floor(hash)) - 0.5) * variationAmount;
    _color.r = Math.max(0, Math.min(1, _color.r + noise));
    _color.g = Math.max(0, Math.min(1, _color.g + noise * 1.2));
    _color.b = Math.max(0, Math.min(1, _color.b + noise * 0.5));

    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

/**
 * Merge multiple BufferGeometries into one, preserving vertex colors if present.
 */
function mergeAll(geometries) {
  let totalVerts = 0;
  let totalIdx = 0;
  let hasColors = false;

  for (const g of geometries) {
    totalVerts += g.getAttribute('position').count;
    totalIdx += g.getIndex() ? g.getIndex().count : 0;
    if (g.getAttribute('color')) hasColors = true;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = hasColors ? new Float32Array(totalVerts * 3) : null;
  const indices = totalIdx > 0 ? new Uint16Array(totalIdx) : null;

  let vOffset = 0;
  let iOffset = 0;

  for (const g of geometries) {
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    const col = g.getAttribute('color');
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      positions[(vOffset + i) * 3] = pos.getX(i);
      positions[(vOffset + i) * 3 + 1] = pos.getY(i);
      positions[(vOffset + i) * 3 + 2] = pos.getZ(i);

      normals[(vOffset + i) * 3] = norm.getX(i);
      normals[(vOffset + i) * 3 + 1] = norm.getY(i);
      normals[(vOffset + i) * 3 + 2] = norm.getZ(i);

      if (colors) {
        if (col) {
          colors[(vOffset + i) * 3] = col.getX(i);
          colors[(vOffset + i) * 3 + 1] = col.getY(i);
          colors[(vOffset + i) * 3 + 2] = col.getZ(i);
        } else {
          colors[(vOffset + i) * 3] = 0.5;
          colors[(vOffset + i) * 3 + 1] = 0.5;
          colors[(vOffset + i) * 3 + 2] = 0.5;
        }
      }
    }

    const idx = g.getIndex();
    if (idx && indices) {
      for (let i = 0; i < idx.count; i++) {
        indices[iOffset + i] = idx.getY !== undefined
          ? idx.array[i] + vOffset
          : idx.array[i] + vOffset;
      }
      iOffset += idx.count;
    }

    vOffset += count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (colors) merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (indices) merged.setIndex(new THREE.BufferAttribute(indices, 1));

  return merged;
}

/**
 * Generate cylindrical UVs for trunk geometry.
 * U = angle around trunk, V = height along trunk.
 */
function addCylindricalUVs(geometry, height) {
  const pos = geometry.getAttribute('position');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = (Math.atan2(z, x) / (Math.PI * 2)) + 0.5;
    const v = y / (height || 1);
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
}

/**
 * Generate spherical UVs for canopy geometry.
 */
function addSphericalUVs(geometry) {
  const pos = geometry.getAttribute('position');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  // Find center Y of canopy for normalization
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const rangeY = maxY - minY || 1;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = (Math.atan2(z, x) / (Math.PI * 2)) + 0.5;
    const v = (y - minY) / rangeY;
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
}

export function getTrunkGeometry(type) { return trunkGeometries[type]; }
export function getCanopyGeometry(type) { return canopyGeometries[type]; }
export function getTrunkMaterial(type) { return trunkMaterials[type]; }
export function getCanopyMaterial(type) { return canopyMaterials[type]; }
