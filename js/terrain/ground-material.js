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
    const rockTex = createRockTexture();
    groundMaterial = new THREE.MeshPhongMaterial({
      map: createGroundTexture(),
      specular: 0x000000,
      shininess: 0,
    });
    groundMaterial.userData.timeUniform = groundTimeUniform;
    groundMaterial.userData.wetnessUniform = groundWetnessUniform;
    groundMaterial.userData.waterDarkenUniform = groundWaterDarkenUniform;
    groundMaterial.userData.sandTex = sandTex;
    groundMaterial.userData.dirtTex = dirtTex;
    groundMaterial.userData.rockTex = rockTex;

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
      shader.uniforms.rockMap = { value: groundMaterial.userData.rockTex };
      shader.uniforms.steepRockColor = { value: new THREE.Color(CONFIG.STEEP_ROCK_COLOR.r, CONFIG.STEEP_ROCK_COLOR.g, CONFIG.STEEP_ROCK_COLOR.b) };
      shader.uniforms.subalpineColor = { value: new THREE.Color(CONFIG.SUBALPINE_COLOR.r, CONFIG.SUBALPINE_COLOR.g, CONFIG.SUBALPINE_COLOR.b) };
      shader.uniforms.tussockColor = { value: new THREE.Color(CONFIG.TUSSOCK_COLOR.r, CONFIG.TUSSOCK_COLOR.g, CONFIG.TUSSOCK_COLOR.b) };
      shader.uniforms.alpineRockColor = { value: new THREE.Color(CONFIG.ALPINE_ROCK_COLOR.r, CONFIG.ALPINE_ROCK_COLOR.g, CONFIG.ALPINE_ROCK_COLOR.b) };
      shader.uniforms.snowColor = { value: new THREE.Color(CONFIG.SNOW_COLOR.r, CONFIG.SNOW_COLOR.g, CONFIG.SNOW_COLOR.b) };
      shader.uniforms.subalpineStart = { value: CONFIG.SUBALPINE_START };
      shader.uniforms.treelineStart = { value: CONFIG.TREELINE_START };
      shader.uniforms.alpineStart = { value: CONFIG.ALPINE_START };
      shader.uniforms.snowlineStart = { value: CONFIG.SNOWLINE_START };
      shader.uniforms.gardenColor = { value: new THREE.Color(CONFIG.COTTAGE_GARDEN_COLOR.r, CONFIG.COTTAGE_GARDEN_COLOR.g, CONFIG.COTTAGE_GARDEN_COLOR.b) };

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\nattribute float treeDensity;\nvarying float vTreeDensity;\nattribute float cottageDensity;\nvarying float vCottageDensity;'
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTreeDensity = treeDensity;\nvCottageDensity = cottageDensity;\nvWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);'
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
         uniform sampler2D rockMap;
         uniform vec3 steepRockColor;
         uniform vec3 subalpineColor;
         uniform vec3 tussockColor;
         uniform vec3 alpineRockColor;
         uniform vec3 snowColor;
         uniform float subalpineStart;
         uniform float treelineStart;
         uniform float alpineStart;
         uniform float snowlineStart;
         uniform vec3 gardenColor;
         varying vec3 vWorldPos;
         varying vec3 vWorldNormal;
         varying float vTreeDensity;
         varying float vCottageDensity;

         // Per-pixel value noise for dirt patches (no triangle artifacts)
         // Sin-free hash: sin(large_arg) loses precision on mobile GPUs (Quest)
         // and creates grid-aligned patterns. Multiply/fract is precise at any scale.
         float _hash(vec2 p) {
           vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
           p3 += vec3(dot(p3, p3.yzx + vec3(33.33)));
           return fract((p3.x + p3.y) * p3.z);
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
         // Anti-tile sampling (Quilez technique 3): noise-driven UV offset interpolation
         vec3 _antiTileSample(sampler2D tex, vec2 uv) {
           float k = _vnoise(uv * 0.005);
           float l = k * 8.0;
           float i = floor(l);
           float f = l - i;
           f = f * f * (3.0 - 2.0 * f);
           vec2 ofA = vec2(_hash(vec2(i, 0.0)), _hash(vec2(i, 1.0)));
           vec2 ofB = vec2(_hash(vec2(i + 1.0, 0.0)), _hash(vec2(i + 1.0, 1.0)));
           vec3 colA = texture2D(tex, uv + ofA).rgb;
           vec3 colB = texture2D(tex, uv + ofB).rgb;
           return mix(colA, colB, f);
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
         // Multi-octave per-pixel noise to break triangle-edge aligned boundaries
         float dirtDetail = _vnoise(vWorldPos.xz * 0.15) * 0.12
                          + _vnoise(vWorldPos.xz * 0.6 + 20.0) * 0.08
                          + _vnoise(vWorldPos.xz * 1.7 + 55.0) * 0.05
                          + _vnoise(vWorldPos.xz * 4.5 + 90.0) * 0.10
                          + _vnoise(vWorldPos.xz * 11.0 + 140.0) * 0.06;
         // Wide smoothstep so transition doesn't follow polygon edges
         float dirtFactor = smoothstep(0.25, 0.85, treeDens + dirtDetail);
         // Suppress dirt on sand — use grassBlend (already wide smoothstep)
         dirtFactor *= grassBlend;

         // --- Mountain altitude zones with ragged boundaries ---
         // Three octaves of value noise to break up grid-aligned corners
         float zoneNoise = _vnoise(vWorldPos.xz * 0.06) * 4.0 - 2.0;
         float zn2 = _vnoise(vWorldPos.xz * 0.17 + 50.0) * 2.0 - 1.0;
         float zn3 = _vnoise(vWorldPos.xz * 0.43 + 120.0) * 1.0 - 0.5;
         float zoneOffset = zoneNoise + zn2 + zn3;

         float subalpineH = subalpineStart + zoneOffset;
         float treelineH = treelineStart + zoneOffset;
         float alpineH = alpineStart + zoneOffset;
         float snowlineH = snowlineStart + zoneOffset;

         // Tussock blend (used to suppress dirt above treeline)
         float tussockNoise = (_vnoise(vWorldPos.xz * 1.8 + 105.0) - 0.5) * 0.16
                            + (_vnoise(vWorldPos.xz * 6.0 + 145.0) - 0.5) * 0.10;
         float tussockBlend = smoothstep(treelineH - 3.0, treelineH + 4.0, h + tussockNoise * 8.0);

         // Suppress dirt above treeline
         dirtFactor *= (1.0 - tussockBlend);

         if (dirtFactor > 0.01) {
           // Smooth blend between dirt shades instead of hard threshold
           float dirtShade = smoothstep(0.2, 0.4, ht);
           vec3 dColor = mix(mix(dirtColor, dirtDarkColor, 0.4), dirtColor, dirtShade);
           terrainColor = mix(terrainColor, dColor, dirtFactor);
         }

         // Garden ground near cottages — warm earthy tones with noisy edges
         // No if-guard on vCottageDensity: hard threshold creates pixel-sharp border.
         // Instead, taper noise by attribute so it's zero away from cottages.
         float _gardenScale = smoothstep(0.0, 0.1, vCottageDensity);
         float gardenNoise = ((_vnoise(vWorldPos.xz * 0.3) - 0.5) * 0.25
                            + (_vnoise(vWorldPos.xz * 0.8 + 70.0) - 0.5) * 0.15
                            + (_vnoise(vWorldPos.xz * 2.0 + 130.0) - 0.5) * 0.08
                            + (_vnoise(vWorldPos.xz * 5.0 + 95.0) - 0.5) * 0.10
                            + (_vnoise(vWorldPos.xz * 12.0 + 160.0) - 0.5) * 0.06) * _gardenScale;
         float gardenFactor = smoothstep(0.02, 0.55, vCottageDensity + gardenNoise);
         if (gardenFactor > 0.005) {
           // Richer green near edges, warm soil near center
           vec3 gardenGreen = mix(grassColor, gardenColor, smoothstep(0.3, 0.8, vCottageDensity));
           // Per-pixel patch variation: garden beds vs paths
           float patchNoise = _vnoise(vWorldPos.xz * 1.5 + 40.0);
           vec3 gardenBlend = mix(gardenGreen, gardenColor * 1.15, patchNoise * 0.4);
           terrainColor = mix(terrainColor, gardenBlend, gardenFactor * grassBlend);
           // Suppress tree dirt inside garden (cottage clearing has no trees)
           dirtFactor *= (1.0 - gardenFactor);
         }

         // Subalpine: darker green (wide transition with noise)
         float subalpineBlend = smoothstep(subalpineH - 5.0, subalpineH + 6.0, h);
         float subNoise = (_vnoise(vWorldPos.xz * 1.2 + 80.0) - 0.5) * 0.24
                        + (_vnoise(vWorldPos.xz * 4.0 + 135.0) - 0.5) * 0.12
                        + (_vnoise(vWorldPos.xz * 10.0 + 190.0) - 0.5) * 0.08;
         subalpineBlend = clamp(subalpineBlend + subNoise * (1.0 - abs(subalpineBlend * 2.0 - 1.0)), 0.0, 1.0);
         terrainColor = mix(terrainColor, subalpineColor, subalpineBlend * grassBlend);

         // Treeline: tussock
         terrainColor = mix(terrainColor, tussockColor, tussockBlend);

         // Alpine: exposed rock (wide transition with noise)
         float alpineBlend = smoothstep(alpineH - 5.0, alpineH + 6.0, h);
         float alpNoise = (_vnoise(vWorldPos.xz * 1.0 + 160.0) - 0.5) * 0.30
                        + (_vnoise(vWorldPos.xz * 3.5 + 200.0) - 0.5) * 0.16
                        + (_vnoise(vWorldPos.xz * 9.0 + 250.0) - 0.5) * 0.10;
         alpineBlend = clamp(alpineBlend + alpNoise * (1.0 - abs(alpineBlend * 2.0 - 1.0)), 0.0, 1.0);
         terrainColor = mix(terrainColor, alpineRockColor, alpineBlend);

         // Per-pixel tangent-plane perturbation of the slope normal.
         // Adding noise to .y (scalar) still gives straight boundaries per triangle
         // because slopeNorm.y varies linearly. Tilting the normal in xz and
         // re-normalizing makes .y vary NON-linearly, so boundaries curve within triangles.
         vec3 slopeNorm = normalize(vWorldNormal);
         float _spx = (_vnoise(vWorldPos.xz * 4.0 + 50.0) - 0.5) * 0.30
                    + (_vnoise(vWorldPos.xz * 12.0 + 130.0) - 0.5) * 0.20
                    + (_vnoise(vWorldPos.xz * 32.0 + 220.0) - 0.5) * 0.10;
         float _spz = (_vnoise(vWorldPos.xz * 4.0 + vec2(70.0, 30.0)) - 0.5) * 0.30
                    + (_vnoise(vWorldPos.xz * 12.0 + vec2(160.0, 60.0)) - 0.5) * 0.20
                    + (_vnoise(vWorldPos.xz * 32.0 + vec2(250.0, 90.0)) - 0.5) * 0.10;
         slopeNorm = normalize(slopeNorm + vec3(_spx, 0.0, _spz));

         // Snow: slope-aware (flat = snow, steep = rock), wide transition
         float snowBlend = smoothstep(snowlineH - 6.0, snowlineH + 8.0, h);
         // Centered per-pixel noise in the transition zone to break up banding
         float snowNoise = (_vnoise(vWorldPos.xz * 0.6 + 40.0) - 0.5) * 0.22
                         + (_vnoise(vWorldPos.xz * 1.5) - 0.5) * 0.36
                         + (_vnoise(vWorldPos.xz * 4.0 + 180.0) - 0.5) * 0.20
                         + (_vnoise(vWorldPos.xz * 9.0 + 220.0) - 0.5) * 0.12;
         snowBlend = clamp(snowBlend + snowNoise * (1.0 - abs(snowBlend * 2.0 - 1.0)), 0.0, 1.0);
         // Light per-effect noise (different from steep rock) so snow/rock boundaries diverge
         float slopeNoise = (_vnoise(vWorldPos.xz * 2.0 + 30.0) - 0.5) * 0.10
                          + (_vnoise(vWorldPos.xz * 7.0 + 95.0) - 0.5) * 0.08;
         float slopeFlat = smoothstep(0.38, 0.95, slopeNorm.y + slopeNoise);
         terrainColor = mix(terrainColor, snowColor, snowBlend * slopeFlat);

         // Steep slopes → bare rock (grey stone on moderate-to-steep slopes)
         float steepNoise = (_vnoise(vWorldPos.xz * 2.5 + 45.0) - 0.5) * 0.10
                          + (_vnoise(vWorldPos.xz * 8.0 + 115.0) - 0.5) * 0.08;
         float steepFactor = 1.0 - smoothstep(0.45, 0.93, slopeNorm.y + steepNoise);
         // Reduce on sand/shore but don't fully suppress (stream banks show rock)
         steepFactor *= mix(0.3, 1.0, grassBlend);
         // Snow takes full precedence at high altitude
         steepFactor *= (1.0 - snowBlend);
         if (steepFactor > 0.01) {
           terrainColor = mix(terrainColor, steepRockColor, steepFactor);
         }

         // Dynamic waterline that follows waves
         float dynWater = waterLevel + _waveH(vWorldPos.xz, uTime);

         // Shore transition: water color → foam → wet sand → dry sand
         float distAbove = h - dynWater;
         vec3 waterTint = vec3(0.05, 0.15, 0.28);

         // At and below waterline: terrain matches rendered water appearance
         // Wide blending zone so terrain gradually becomes water-colored,
         // overlapping with water plane's shore alpha fade for seamless transition
         // uWaterDarken scales these toward black at night/storms
         vec3 shallowWater = vec3(0.14, 0.25, 0.36) * uWaterDarken;
         // Noisy boundary to break up geometric triangle edges
         float wlNoise = (_vnoise(vWorldPos.xz * 3.0 + vec2(uTime * 0.05, uTime * 0.03)) - 0.5) * 0.3
                       + (_vnoise(vWorldPos.xz * 8.0 + vec2(-uTime * 0.04, uTime * 0.06) + 40.0) - 0.5) * 0.15;
         float waterMatch = 1.0 - smoothstep(-0.3, 0.25 + wlNoise, distAbove);
         terrainColor = mix(terrainColor, shallowWater, waterMatch);

         // --- Wave lapping at the shoreline ---
         // Curved lapping wave fronts (domain-warped position for organic shapes)
         vec2 lapP = vWorldPos.xz + vec2(
           sin(vWorldPos.z * 0.18 + uTime * 0.07) * 3.5,
           cos(vWorldPos.x * 0.15 - uTime * 0.05) * 3.5
         );
         // Multiple overlapping lapping waves at different speeds
         float lap1 = sin(dot(lapP, vec2(0.10, 0.05)) + uTime * 0.80) * 0.5 + 0.5;
         float lap2 = sin(dot(lapP, vec2(-0.06, 0.09)) + uTime * 0.60 + 1.8) * 0.5 + 0.5;
         float lap3 = sin(dot(lapP, vec2(0.04, -0.11)) + uTime * 0.45 + 3.7) * 0.5 + 0.5;
         float lap4 = sin(dot(lapP, vec2(0.13, 0.02)) + uTime * 1.0 + 0.9) * 0.5 + 0.5;
         // Noise-modulated reach — varies along the coastline
         float lapAmpNoise = _vnoise(vWorldPos.xz * 0.4 + vec2(uTime * 0.02, 0.0));
         float lapReach = (lap1 * 0.35 + lap2 * 0.25 + lap3 * 0.25 + lap4 * 0.15)
                        * mix(0.35, 0.75, lapAmpNoise);
         float lapDist = distAbove - lapReach;

         // Water tongue — area covered by the lapping wave looks like shallow water
         float waterTongue = smoothstep(0.05, -0.05, lapDist);
         terrainColor = mix(terrainColor, shallowWater, waterTongue * 0.7);

         // Bright foam froth at the advancing wave front
         float fn1 = _vnoise(vWorldPos.xz * 8.0 + vec2(uTime * 0.2, uTime * 0.12));
         float fn2 = _vnoise(vWorldPos.xz * 16.0 + vec2(-uTime * 0.15, uTime * 0.22) + 50.0);
         float foamNoise = fn1 * 0.5 + fn2 * 0.5;
         float frothLine = smoothstep(0.08, -0.02, lapDist) * smoothstep(-0.20, -0.03, lapDist);
         frothLine *= 0.5 + 0.5 * foamNoise;
         vec3 foamColor = vec3(0.70, 0.74, 0.70) * uWaterDarken;
         terrainColor = mix(terrainColor, foamColor, frothLine);

         // Wet sand behind the receding wave — darker and shinier looking
         float wetTrail = smoothstep(0.6, 0.0, lapDist) * (1.0 - waterTongue);
         terrainColor = mix(terrainColor, terrainColor * vec3(0.65, 0.70, 0.75), wetTrail * 0.6);

         // Wider wet sand zone — darken and cool-shift (always-wet area near water)
         float wetZone = smoothstep(3.5, 0.5, distAbove);
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
           // Two UV bases with anti-tiled sampling (Quilez technique 3)
           // Noise-driven offset interpolation eliminates visible repeat grid
           vec2 wUV = vWorldPos.xz * 0.25;
           // Layer 2: rotated 30deg, scale 0.21 (period 4.76m vs 4.0m)
           vec2 wUV2 = vec2(
             vWorldPos.x * 0.866 - vWorldPos.z * 0.5,
             vWorldPos.x * 0.5   + vWorldPos.z * 0.866
           ) * 0.21 + vec2(17.3, -23.7);

           // Sample each texture with anti-tiled 2-layer blend
           vec3 grassSamp = _antiTileSample(map, wUV) * 0.55
                          + _antiTileSample(map, wUV2) * 0.45;
           vec3 sandSamp  = _antiTileSample(sandMap, wUV * 0.8);
           vec3 dirtSamp  = _antiTileSample(dirtMap, wUV * 0.9) * 0.55
                          + _antiTileSample(dirtMap, wUV2 * 0.95) * 0.45;
           vec3 rockSamp  = _antiTileSample(rockMap, wUV * 0.7);

           // Convert to detail: per-channel centering to preserve color character
           vec3 grassTexDetail = grassSamp - vec3(0.53, 0.54, 0.49);
           vec3 sandTexDetail = sandSamp - vec3(0.56, 0.55, 0.52);
           vec3 dirtTexDetail = dirtSamp - vec3(0.50, 0.46, 0.40);
           vec3 rockTexDetail = rockSamp - vec3(0.48, 0.47, 0.46);

           // Select detail based on terrain type
           vec3 detail = mix(sandTexDetail, grassTexDetail, grassBlend);
           detail = mix(detail, dirtTexDetail, dirtFactor);
           // Steep rock texture
           detail = mix(detail, rockTexDetail, steepFactor);
           // Garden area: blend toward dirt texture (cottage clearings are bare soil)
           // Use gardenFactor (already computed with soft noisy edges) instead of hard threshold
           detail = mix(detail, dirtTexDetail, gardenFactor);

           // Apply as moderate additive detail — suppress near waterline, fade at altitude
           // but keep some rock texture in snow zone for surface variation
           float detailSuppress = smoothstep(dynWater - 0.2, dynWater + 0.5, h);
           float altFade = 1.0 - smoothstep(0.0, 1.0, tussockBlend);
           // Let rock texture show through faintly in snow (breaks up flat white)
           float snowDetail = snowBlend * slopeFlat * 0.3;
           detailSuppress *= max(altFade, snowDetail);
           diffuseColor.rgb += detail * 1.5 * detailSuppress;
         #endif`
      );

      // Override normal_fragment_begin: add per-pixel noise to mask Mach band artifacts
      // Vertex-interpolated normals give C0 but not C1 continuity across triangle edges,
      // causing perceived brightness bands (Mach band illusion). Adding per-pixel noise
      // breaks up the gradient discontinuities so the eye can't track them.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `// Smooth vertex-interpolated world normal + per-pixel noise to mask Mach bands
         vec3 wN = normalize(vWorldNormal);
         // Four octaves with irrational frequencies (can't align with triangle grid)
         float nX = (_vnoise(vWorldPos.xz * 3.73) - 0.5) * 0.14
                  + (_vnoise(vWorldPos.xz * 8.41 + 40.0) - 0.5) * 0.08
                  + (_vnoise(vWorldPos.xz * 19.7 + 80.0) - 0.5) * 0.04
                  + (_vnoise(vWorldPos.xz * 43.3 + 150.0) - 0.5) * 0.02;
         float nZ = (_vnoise(vWorldPos.xz * 3.73 + vec2(100.0, 50.0)) - 0.5) * 0.14
                  + (_vnoise(vWorldPos.xz * 8.41 + vec2(60.0, 90.0)) - 0.5) * 0.08
                  + (_vnoise(vWorldPos.xz * 19.7 + vec2(140.0, 30.0)) - 0.5) * 0.04
                  + (_vnoise(vWorldPos.xz * 43.3 + vec2(200.0, 70.0)) - 0.5) * 0.02;
         wN = normalize(wN + vec3(nX, 0.0, nZ));
         vec3 normal = normalize(mat3(viewMatrix) * wN);
         #ifdef DOUBLE_SIDED
           normal *= faceDirection;
         #endif`
      );

      // Near/below water: smoothly suppress shadows
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
         float dynWL = waterLevel + _waveH(vWorldPos.xz, uTime);
         float shadowSuppress = smoothstep(dynWL - 1.5, dynWL + 2.0, vWorldPos.y);
         reflectedLight.directDiffuse = mix(reflectedLight.indirectDiffuse * 0.6, reflectedLight.directDiffuse, shadowSuppress);
         // Snow emissive: faint self-illumination so snow stays visible at night
         float snowGlow = snowBlend * slopeFlat;
         reflectedLight.indirectDiffuse += vec3(1.0, 1.0, 1.05) * snowGlow * 0.035;`
      );
    };
  }
  return groundMaterial;
}

/**
 * Set anisotropic filtering on all ground textures.
 * Call after renderer is available (needs max anisotropy from GPU caps).
 */
export function setGroundAnisotropy(maxAnisotropy) {
  if (!groundMaterial) return;
  const level = maxAnisotropy; // use full GPU capability
  const textures = [
    groundMaterial.map,
    groundMaterial.userData.sandTex,
    groundMaterial.userData.dirtTex,
    groundMaterial.userData.rockTex,
  ];
  for (const tex of textures) {
    if (tex) {
      tex.anisotropy = level;
      tex.needsUpdate = true;
    }
  }
}

/**
 * Procedural grass/dirt ground texture.
 * Short grass blades and soil detail painted onto a canvas.
 */
function createGroundTexture(size = 512) {
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
function createSandTexture(size = 512) {
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
function createDirtTexture(size = 512) {
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

/**
 * Procedural bare rock texture — grey stone with cracks, lichen patches, mineral veins.
 */
function createRockTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Cool grey base
  ctx.fillStyle = '#6a6764';
  ctx.fillRect(0, 0, size, size);

  // Broad stone grain — large gentle patches
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 2 + Math.random() * 8;
    const shade = 80 + Math.random() * 50;
    ctx.fillStyle = `rgba(${shade | 0}, ${shade * 0.97 | 0}, ${shade * 0.94 | 0}, ${0.1 + Math.random() * 0.2})`;
    drawWrappedHelper(ctx, size, (wx, wy) => {
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fill();
    }, x, y, r + 2);
  }

  // Cracks — dark thin lines
  for (let i = 0; i < 25; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 8 + Math.random() * 25;
    const angle = Math.random() * Math.PI * 2;
    const shade = 40 + Math.random() * 25;
    ctx.strokeStyle = `rgba(${shade | 0}, ${shade * 0.95 | 0}, ${shade * 0.9 | 0}, ${0.2 + Math.random() * 0.25})`;
    ctx.lineWidth = 0.3 + Math.random() * 0.8;
    drawWrappedHelper(ctx, size, (wx, wy) => {
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      let cx = wx, cy = wy;
      const steps = 3 + Math.floor(Math.random() * 3);
      for (let s = 0; s < steps; s++) {
        const t = (s + 1) / steps;
        cx = wx + len * t * Math.cos(angle) + (Math.random() - 0.5) * 4;
        cy = wy + len * t * Math.sin(angle) + (Math.random() - 0.5) * 4;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }, x, y, len + 8);
  }

  // Lichen patches — subtle green-grey spots
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1.5 + Math.random() * 4;
    const g = 85 + Math.random() * 30;
    ctx.fillStyle = `rgba(${g * 0.8 | 0}, ${g | 0}, ${g * 0.7 | 0}, ${0.08 + Math.random() * 0.12})`;
    drawWrappedHelper(ctx, size, (wx, wy) => {
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fill();
    }, x, y, r + 2);
  }

  // Mineral speckle — fine bright/dark dots
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = 60 + Math.random() * 80;
    ctx.fillStyle = `rgba(${shade | 0}, ${shade | 0}, ${shade * 0.95 | 0}, ${0.12 + Math.random() * 0.15})`;
    ctx.fillRect(x, y, 0.5 + Math.random(), 0.5 + Math.random());
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
