// Shared textured ground material for all terrain chunks
import * as THREE from 'three';
import { CONFIG } from '../config.js';

let groundMaterial = null;
const groundTimeUniform = { value: 0 };
const groundWetnessUniform = { value: 0 };
const groundWaterDarkenUniform = { value: 1.0 }; // 1 = full brightness, 0 = black

/**
 * Update ground material time (call each frame for animated foam).
 */
export function updateGroundTime(time) {
  groundTimeUniform.value = time;
}

/**
 * Get the shared ground material (created once, reused by all chunks).
 */
export function getGroundMaterial() {
  if (!groundMaterial) {
    const sandTex = createSandTexture();
    const dirtTex = createDirtTexture();
    groundMaterial = new THREE.MeshLambertMaterial({
      map: createGroundTexture(),
    });
    groundMaterial.userData.timeUniform = groundTimeUniform;
    groundMaterial.userData.wetnessUniform = groundWetnessUniform;
    groundMaterial.userData.waterDarkenUniform = groundWaterDarkenUniform;
    groundMaterial.userData.sandTex = sandTex;
    groundMaterial.userData.dirtTex = dirtTex;

    // Per-pixel terrain coloring + texture + shadow control
    const shoreY = CONFIG.SHORE_LEVEL;
    const waterY = CONFIG.WATER_LEVEL;
    const gMin = -CONFIG.TERRAIN_HEIGHT;
    const gMax = CONFIG.TERRAIN_HEIGHT;
    const low = CONFIG.GROUND_LOW_COLOR;
    const mid = CONFIG.GROUND_MID_COLOR;
    const high = CONFIG.GROUND_HIGH_COLOR;
    const shore = CONFIG.SHORE_COLOR;
    const dirt = CONFIG.GROUND_DIRT_COLOR;
    const dirtDark = CONFIG.GROUND_DIRT_DARK;

    groundMaterial.customProgramCacheKey = () => 'ground-terrain';
    groundMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.shoreLevel = { value: shoreY };
      shader.uniforms.waterLevel = { value: waterY };
      shader.uniforms.globalMin = { value: gMin };
      shader.uniforms.globalMax = { value: gMax };
      shader.uniforms.lowColor = { value: new THREE.Color(low.r, low.g, low.b) };
      shader.uniforms.midColor = { value: new THREE.Color(mid.r, mid.g, mid.b) };
      shader.uniforms.highColor = { value: new THREE.Color(high.r, high.g, high.b) };
      shader.uniforms.shoreColor = { value: new THREE.Color(shore.r, shore.g, shore.b) };
      shader.uniforms.dirtColor = { value: new THREE.Color(dirt.r, dirt.g, dirt.b) };
      shader.uniforms.dirtDarkColor = { value: new THREE.Color(dirtDark.r, dirtDark.g, dirtDark.b) };
      shader.uniforms.dirtScale = { value: CONFIG.GROUND_DIRT_SCALE };
      shader.uniforms.dirtThreshold = { value: CONFIG.GROUND_DIRT_THRESHOLD };
      shader.uniforms.uTime = groundMaterial.userData.timeUniform;
      shader.uniforms.uWetness = groundMaterial.userData.wetnessUniform;
      shader.uniforms.uWaterDarken = groundMaterial.userData.waterDarkenUniform;
      shader.uniforms.sandMap = { value: groundMaterial.userData.sandTex };
      shader.uniforms.dirtMap = { value: groundMaterial.userData.dirtTex };
      shader.uniforms.subalpineColor = { value: new THREE.Color(CONFIG.SUBALPINE_COLOR.r, CONFIG.SUBALPINE_COLOR.g, CONFIG.SUBALPINE_COLOR.b) };
      shader.uniforms.tussockColor = { value: new THREE.Color(CONFIG.TUSSOCK_COLOR.r, CONFIG.TUSSOCK_COLOR.g, CONFIG.TUSSOCK_COLOR.b) };
      shader.uniforms.alpineRockColor = { value: new THREE.Color(CONFIG.ALPINE_ROCK_COLOR.r, CONFIG.ALPINE_ROCK_COLOR.g, CONFIG.ALPINE_ROCK_COLOR.b) };
      shader.uniforms.snowColor = { value: new THREE.Color(CONFIG.SNOW_COLOR.r, CONFIG.SNOW_COLOR.g, CONFIG.SNOW_COLOR.b) };
      shader.uniforms.subalpineStart = { value: CONFIG.SUBALPINE_START };
      shader.uniforms.treelineStart = { value: CONFIG.TREELINE_START };
      shader.uniforms.alpineStart = { value: CONFIG.ALPINE_START };
      shader.uniforms.snowlineStart = { value: CONFIG.SNOWLINE_START };

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\nattribute float treeDensity;\nvarying float vTreeDensity;'
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTreeDensity = treeDensity;\nvWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);'
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float shoreLevel;
         uniform float waterLevel;
         uniform float globalMin;
         uniform float globalMax;
         uniform vec3 lowColor;
         uniform vec3 midColor;
         uniform vec3 highColor;
         uniform vec3 shoreColor;
         uniform vec3 dirtColor;
         uniform vec3 dirtDarkColor;
         uniform float dirtScale;
         uniform float dirtThreshold;
         uniform float uTime;
         uniform float uWetness;
         uniform float uWaterDarken;
         uniform sampler2D sandMap;
         uniform sampler2D dirtMap;
         uniform vec3 subalpineColor;
         uniform vec3 tussockColor;
         uniform vec3 alpineRockColor;
         uniform vec3 snowColor;
         uniform float subalpineStart;
         uniform float treelineStart;
         uniform float alpineStart;
         uniform float snowlineStart;
         varying vec3 vWorldPos;
         varying vec3 vWorldNormal;
         varying float vTreeDensity;

         // Per-pixel value noise for dirt patches (no triangle artifacts)
         float _hash(vec2 p) {
           return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
         }
         float _vnoise(vec2 p) {
           vec2 i = floor(p);
           vec2 f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           float a = _hash(i);
           float b = _hash(i + vec2(1.0, 0.0));
           float c = _hash(i + vec2(0.0, 1.0));
           float d = _hash(i + vec2(1.0, 1.0));
           return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
         }
         // Simplified wave height (matches water vertex shader, dominant swells only)
         float _waveH(vec2 p, float t) {
           float h = 0.0;
           h += sin(dot(p, vec2( 0.38,  0.12)) + t * 0.35) * 0.045;
           h += sin(dot(p, vec2(-0.15,  0.35)) + t * 0.28) * 0.040;
           h += sin(dot(p, vec2( 0.27, -0.22)) + t * 0.42) * 0.030;
           h += sin(dot(p, vec2( 0.45, -0.55)) + t * 0.55) * 0.020;
           h += sin(dot(p, vec2(-0.50,  0.30)) + t * 0.48) * 0.018;
           return h;
         }
         `
      );

      // Per-pixel terrain color + anti-tiling texture + shore/grass blend
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `// --- Per-pixel terrain color from height (no triangle artifacts) ---
         float h = vWorldPos.y;
         float globalRange = globalMax - globalMin;
         float ht = clamp((h - globalMin) / globalRange, 0.0, 1.0);

         vec3 terrainColor;
         vec3 wetSandColor = vec3(0.45, 0.38, 0.25);

         // Noisy shore boundary using XZ (pixel-accurate, no triangle artifacts)
         float shoreNoise = sin(vWorldPos.x * 1.7 + vWorldPos.z * 0.9) * 0.5
                          + sin(vWorldPos.x * 0.5 - vWorldPos.z * 1.3) * 0.7
                          + sin(vWorldPos.x * 3.1 + vWorldPos.z * 2.3) * 0.25;
         float effectiveShore = shoreLevel + shoreNoise * 0.25;

         // Grass gradient by height (smooth blend, no conditionals)
         vec3 grassLow = mix(lowColor, midColor, smoothstep(0.0, 0.5, ht));
         vec3 grassColor = mix(grassLow, highColor, smoothstep(0.4, 1.0, ht));

         // Wet sand near water
         float wetBlend = smoothstep(waterLevel - 0.5, effectiveShore, h);
         vec3 sandColor = mix(wetSandColor, shoreColor, wetBlend);

         // Single smooth shore → grass transition (no hard if/else = no triangle edges)
         float grassBlend = smoothstep(effectiveShore - 0.5, effectiveShore + 3.0, h);
         terrainColor = mix(sandColor, grassColor, grassBlend);

         // Dirt under trees — tree density from custom attribute (exact match)
         // Trees placed where original noise > 0.15 → treeDensity > ~0.575
         float treeDens = vTreeDensity;
         // Add fine per-pixel noise for organic edges
         float dirtDetail = _vnoise(vWorldPos.xz * 0.15) * 0.15;
         float dirtFactor = smoothstep(0.5, 0.7, treeDens + dirtDetail);
         // Suppress dirt on sand — use grassBlend (already wide smoothstep)
         dirtFactor *= grassBlend;

         // --- Mountain altitude zones with ragged boundaries ---
         float zoneNoise = _vnoise(vWorldPos.xz * 0.08) * 4.0 - 2.0;
         float zn2 = _vnoise(vWorldPos.xz * 0.22 + 50.0) * 2.0 - 1.0;
         float zoneOffset = zoneNoise + zn2;

         float subalpineH = subalpineStart + zoneOffset;
         float treelineH = treelineStart + zoneOffset;
         float alpineH = alpineStart + zoneOffset;
         float snowlineH = snowlineStart + zoneOffset;

         // Tussock blend (used to suppress dirt above treeline)
         float tussockBlend = smoothstep(treelineH - 1.5, treelineH + 2.0, h);

         // Suppress dirt above treeline
         dirtFactor *= (1.0 - tussockBlend);

         if (dirtFactor > 0.01) {
           // Smooth blend between dirt shades instead of hard threshold
           float dirtShade = smoothstep(0.2, 0.4, ht);
           vec3 dColor = mix(mix(dirtColor, dirtDarkColor, 0.4), dirtColor, dirtShade);
           terrainColor = mix(terrainColor, dColor, dirtFactor);
         }

         // Subalpine: darker green
         float subalpineBlend = smoothstep(subalpineH - 1.0, subalpineH + 2.0, h);
         terrainColor = mix(terrainColor, subalpineColor, subalpineBlend * grassBlend);

         // Treeline: tussock
         terrainColor = mix(terrainColor, tussockColor, tussockBlend);

         // Alpine: exposed rock
         float alpineBlend = smoothstep(alpineH - 1.0, alpineH + 2.0, h);
         terrainColor = mix(terrainColor, alpineRockColor, alpineBlend);

         // Snow: slope-aware (flat = snow, steep = rock)
         float snowBlend = smoothstep(snowlineH - 1.0, snowlineH + 2.0, h);
         float slopeFlat = smoothstep(0.6, 0.85, vWorldNormal.y);
         terrainColor = mix(terrainColor, snowColor, snowBlend * slopeFlat);

         // Dynamic waterline that follows waves
         float dynWater = waterLevel + _waveH(vWorldPos.xz, uTime);

         // Shore transition: water color → foam → wet sand → dry sand
         float distAbove = h - dynWater;
         vec3 waterTint = vec3(0.05, 0.15, 0.28);

         // At and below waterline: terrain matches rendered water appearance
         // Use lighter tint than base water color to account for specular/ambient
         // uWaterDarken scales these toward black at night/storms
         vec3 shallowWater = vec3(0.14, 0.25, 0.36) * uWaterDarken;
         float waterMatch = 1.0 - smoothstep(-0.1, 0.35, distAbove);
         terrainColor = mix(terrainColor, shallowWater, waterMatch);

         // Foam band: fades from water edge up onto sand
         float fn1 = _vnoise(vWorldPos.xz * 4.0 + vec2(uTime * 0.12, uTime * 0.07));
         float fn2 = _vnoise(vWorldPos.xz * 7.0 + vec2(-uTime * 0.1, uTime * 0.14) + 50.0);
         float foamNoise = fn1 * 0.6 + fn2 * 0.4;
         float foamBand = smoothstep(-0.05, 0.1, distAbove) * (1.0 - smoothstep(0.1, 0.8, distAbove));
         vec3 foamColor = vec3(0.55, 0.58, 0.55) * uWaterDarken;
         terrainColor = mix(terrainColor, foamColor, foamBand * foamNoise * 0.8);

         // Wet sand above foam — darken and cool-shift
         float wetZone = smoothstep(2.5, 0.8, distAbove);
         terrainColor = mix(terrainColor, terrainColor * vec3(0.7, 0.74, 0.78), wetZone * 0.5);

         // Deep water visibility falloff
         float depthBelow = max(0.0, -distAbove);
         float visFalloff = exp(-depthBelow * 2.5);
         vec3 deepColor = vec3(0.04, 0.10, 0.20);
         terrainColor = mix(deepColor, terrainColor, visFalloff);

         // Weather wetness: darken + subtle cool blue shift
         terrainColor *= mix(1.0, 0.65, uWetness);
         terrainColor = mix(terrainColor, terrainColor * vec3(0.92, 0.95, 1.05), uWetness * 0.5);

         diffuseColor.rgb = terrainColor;

         // --- Per-surface-type textures as detail overlays ---
         #ifdef USE_MAP
           vec2 wUV = vWorldPos.xz * 0.5;
           vec2 wUV2 = wUV * 0.41 + vec2(wUV.y * 0.15, -wUV.x * 0.15);

           // Sample each texture, anti-tiled — different scales per type
           vec3 grassSamp = mix(texture2D(map, wUV).rgb, texture2D(map, wUV2).rgb, 0.35);
           vec3 sandSamp = mix(texture2D(sandMap, wUV * 0.7).rgb, texture2D(sandMap, wUV2 * 0.8).rgb, 0.35);
           vec3 dirtSamp = mix(texture2D(dirtMap, wUV * 0.85).rgb, texture2D(dirtMap, wUV2 * 0.9).rgb, 0.35);

           // Convert to detail: per-channel centering to preserve color character
           vec3 grassTexDetail = grassSamp - vec3(0.53, 0.54, 0.49);
           vec3 sandTexDetail = sandSamp - vec3(0.56, 0.55, 0.52);
           vec3 dirtTexDetail = dirtSamp - vec3(0.50, 0.46, 0.40);

           // Select detail based on terrain type
           vec3 detail = mix(sandTexDetail * 2.5, grassTexDetail, grassBlend);
           detail = mix(detail, dirtTexDetail, dirtFactor);

           // Apply as strong additive detail — suppress near waterline and at altitude
           float detailSuppress = smoothstep(dynWater - 0.2, dynWater + 0.5, h);
           detailSuppress *= (1.0 - tussockBlend);
           diffuseColor.rgb += detail * 1.2 * detailSuppress;
         #endif`
      );

      // Near/below water: smoothly suppress shadows
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
         float dynWL = waterLevel + _waveH(vWorldPos.xz, uTime);
         float shadowSuppress = smoothstep(dynWL - 1.5, dynWL + 2.0, vWorldPos.y);
         reflectedLight.directDiffuse = mix(reflectedLight.indirectDiffuse * 0.6, reflectedLight.directDiffuse, shadowSuppress);`
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

/** Helper for seamless tiling: draw at position + all wrap-around copies */
function drawWrappedHelper(ctx, size, drawFn, x, y, margin) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const wx = x + dx * size;
      const wy = y + dy * size;
      if (wx > -margin && wx < size + margin && wy > -margin && wy < size + margin) {
        drawFn(wx, wy);
      }
    }
  }
}

/**
 * Procedural sand texture — fine grain, small pebbles, shell fragments.
 */
function createSandTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Warm sandy base
  ctx.fillStyle = '#9a9080';
  ctx.fillRect(0, 0, size, size);

  // Fine sand grain — many tiny dots
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.3 + Math.random() * 0.8;
    const shade = 120 + Math.random() * 60;
    const warmth = Math.random() * 20;
    ctx.fillStyle = `rgba(${shade + warmth | 0}, ${shade + warmth * 0.5 | 0}, ${shade * 0.75 | 0}, ${0.15 + Math.random() * 0.25})`;
    drawWrappedHelper(ctx, size, (wx, wy) => {
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fill();
    }, x, y, 2);
  }

  // Scattered pebbles
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rx = 0.8 + Math.random() * 2;
    const ry = rx * (0.5 + Math.random() * 0.5);
    const rot = Math.random() * Math.PI;
    const shade = 90 + Math.random() * 50;
    ctx.fillStyle = `rgba(${shade + 10 | 0}, ${shade | 0}, ${shade * 0.85 | 0}, ${0.2 + Math.random() * 0.3})`;
    drawWrappedHelper(ctx, size, (wx, wy) => {
      ctx.beginPath();
      ctx.ellipse(wx, wy, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    }, x, y, 4);
  }

  // Small shell-like fragments
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 2;
    const shade = 160 + Math.random() * 60;
    ctx.fillStyle = `rgba(${shade | 0}, ${shade * 0.95 | 0}, ${shade * 0.85 | 0}, ${0.15 + Math.random() * 0.2})`;
    drawWrappedHelper(ctx, size, (wx, wy) => {
      ctx.beginPath();
      ctx.arc(wx, wy, r, Math.random(), Math.PI + Math.random(), false);
      ctx.fill();
    }, x, y, 4);
  }

  // Subtle ripple lines (wind-blown sand pattern)
  for (let i = 0; i < 25; i++) {
    const y = Math.random() * size;
    const x0 = Math.random() * size;
    const len = 10 + Math.random() * 30;
    const shade = 130 + Math.random() * 40;
    ctx.strokeStyle = `rgba(${shade + 10 | 0}, ${shade | 0}, ${shade * 0.8 | 0}, ${0.08 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.5 + Math.random() * 0.5;
    drawWrappedHelper(ctx, size, (wx, wy) => {
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.bezierCurveTo(wx + len * 0.3, wy - 1 + Math.random() * 2, wx + len * 0.7, wy - 1 + Math.random() * 2, wx + len, wy);
      ctx.stroke();
    }, x0, y, len + 5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/**
 * Procedural dirt texture — soil clumps, small stones, root traces.
 */
function createDirtTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Earthy brown base
  ctx.fillStyle = '#7a6a58';
  ctx.fillRect(0, 0, size, size);

  // Soil clumps — irregular blobs
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.5 + Math.random() * 2.5;
    const shade = 80 + Math.random() * 50;
    const warm = Math.random() * 15;
    ctx.fillStyle = `rgba(${shade + warm | 0}, ${shade * 0.85 + warm * 0.5 | 0}, ${shade * 0.6 | 0}, ${0.15 + Math.random() * 0.3})`;
    drawWrappedHelper(ctx, size, (wx, wy) => {
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fill();
    }, x, y, 4);
  }

  // Small stones
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rx = 0.8 + Math.random() * 2.5;
    const ry = rx * (0.4 + Math.random() * 0.4);
    const rot = Math.random() * Math.PI;
    const shade = 100 + Math.random() * 60;
    ctx.fillStyle = `rgba(${shade | 0}, ${shade * 0.95 | 0}, ${shade * 0.85 | 0}, ${0.25 + Math.random() * 0.3})`;
    drawWrappedHelper(ctx, size, (wx, wy) => {
      ctx.beginPath();
      ctx.ellipse(wx, wy, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    }, x, y, 5);
  }

  // Root/twig traces — thin dark lines
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 5 + Math.random() * 15;
    const angle = Math.random() * Math.PI * 2;
    const shade = 50 + Math.random() * 30;
    ctx.strokeStyle = `rgba(${shade + 10 | 0}, ${shade | 0}, ${shade * 0.6 | 0}, ${0.15 + Math.random() * 0.2})`;
    ctx.lineWidth = 0.5 + Math.random() * 1;
    drawWrappedHelper(ctx, size, (wx, wy) => {
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      const mx = wx + len * 0.5 * Math.cos(angle) + (Math.random() - 0.5) * 3;
      const my = wy + len * 0.5 * Math.sin(angle) + (Math.random() - 0.5) * 3;
      const ex = wx + len * Math.cos(angle);
      const ey = wy + len * Math.sin(angle);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
    }, x, y, len + 5);
  }

  // Fine soil speckle
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = 70 + Math.random() * 60;
    ctx.fillStyle = `rgba(${shade + 15 | 0}, ${shade | 0}, ${shade * 0.65 | 0}, ${0.1 + Math.random() * 0.15})`;
    ctx.fillRect(x, y, 0.5 + Math.random(), 0.5 + Math.random());
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
