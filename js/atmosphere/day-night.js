// Day/night cycle tied to real-world time with sun, clouds, and dynamic lighting
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const _color = new THREE.Color();
const _sunPos = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _moonDir = new THREE.Vector3();
const _moonToSun = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _moonPos = new THREE.Vector3();
const _cloudNightColor = new THREE.Color(0x222233);
const _cloudTwilightColor = new THREE.Color(0xe8a070);
const _cloudStormGrey = new THREE.Color(0x505058);    // dark: for cloud tinting
const _overcastHorizonGrey = new THREE.Color(0x7a7a82); // muted grey: fog/horizon target

// Pre-allocated mutable palette for transitions (avoids 7 Color clones per frame)
const _blendPalette = {
  skyTop: new THREE.Color(), skyBottom: new THREE.Color(),
  fog: new THREE.Color(), sun: new THREE.Color(),
  sunIntensity: 0,
  hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
  hemiIntensity: 0, ambient: 0,
};

// Cache ?time= param once (URL doesn't change during session)
const _fakeTimeParam = new URLSearchParams(window.location.search).get('time');
const _fakeTimeHours = _fakeTimeParam ? (() => {
  const [h, m] = _fakeTimeParam.split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
})() : null;

// Color palettes for different times of day
const PALETTES = {
  // sunElevation ranges: night < -0.1, twilight -0.1..0.05, day > 0.05
  night: {
    skyTop:    new THREE.Color(0x0a1228),
    skyBottom: new THREE.Color(0x080c14),
    fog:       new THREE.Color(0x060810),
    sun:       new THREE.Color(0x444466),
    sunIntensity: 0,
    hemiSky:   new THREE.Color(0x2a3558),
    hemiGround: new THREE.Color(0x141a24),
    hemiIntensity: 0.5,
    ambient:   0.45,
  },
  twilight: {
    skyTop:    new THREE.Color(0x1a1a50),
    skyBottom: new THREE.Color(0xd4725c),
    fog:       new THREE.Color(0x8a6050),
    sun:       new THREE.Color(0xff6830),
    sunIntensity: 0.5,
    hemiSky:   new THREE.Color(0x554466),
    hemiGround: new THREE.Color(0x1a1008),
    hemiIntensity: 0.35,
    ambient:   0.2,
  },
  golden: {
    skyTop:    new THREE.Color(0x5a80c0),
    skyBottom: new THREE.Color(0xeab070),
    fog:       new THREE.Color(0xb0a890),
    sun:       new THREE.Color(0xffcc55),
    sunIntensity: 0.9,
    hemiSky:   new THREE.Color(0x99aabb),
    hemiGround: new THREE.Color(0x3a3020),
    hemiIntensity: 0.55,
    ambient:   0.38,
  },
  day: {
    skyTop:    new THREE.Color(0x3068cc),
    skyBottom: new THREE.Color(0x7aaccc),
    fog:       new THREE.Color(0x8ab4d0),
    sun:       new THREE.Color(0xffdd66),
    sunIntensity: 1.0,
    hemiSky:   new THREE.Color(0x80c0e8),
    hemiGround: new THREE.Color(0x5a5040),
    hemiIntensity: 0.6,
    ambient:   0.4,
  },
};

export class DayNightSystem {
  constructor(scene) {
    this.scene = scene;
    this.latitude = CONFIG.DEFAULT_LATITUDE;
    this.longitude = CONFIG.DEFAULT_LONGITUDE;
    this.timeOffset = 0; // hours offset from real time
    this.moonPhase = 0;
    this.moonAltitude = 0;
    this.cloudTime = 0;

    // Try to get real location
    this._requestGeolocation();

    // --- Sky dome (ShaderMaterial for reliable gradient) ---
    this.skyGeo = new THREE.SphereGeometry(CONFIG.SKY_RADIUS, 24, 16);
    this.skyUniforms = {
      topColor:    { value: new THREE.Color(0x3068cc) },
      bottomColor: { value: new THREE.Color(0x7ab0d8) },
      fogColor:    { value: new THREE.Color(0x8ab4d0) },
    };
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 fogColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition - cameraPosition).y;
          float t = max(0.0, h);
          // Horizon (t=0) = fog color, blends to sky bottom by t=0.2, then to sky top
          vec3 col = mix(fogColor, bottomColor, smoothstep(0.0, 0.2, t));
          col = mix(col, topColor, smoothstep(0.2, 1.0, t));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.skyMesh = new THREE.Mesh(this.skyGeo, this.skyMat);
    this.skyMesh.renderOrder = -2;
    this.skyMesh.frustumCulled = false;
    scene.add(this.skyMesh);

    // --- Sun disc (soft glow sprite) ---
    this.sunTexture = this._createSunTexture();
    this.sunMat = new THREE.SpriteMaterial({
      map: this.sunTexture,
      color: 0xfff4cc,
      fog: false,
      transparent: true,
      depthWrite: false,
    });
    this.sunMesh = new THREE.Sprite(this.sunMat);
    const sunScale = CONFIG.SUN_VISUAL_RADIUS * 3;
    this.sunMesh.scale.set(sunScale, sunScale, 1);
    this.sunMesh.renderOrder = -1;
    scene.add(this.sunMesh);

    // --- Moon disc (phase shader with photo texture, procedural fallback) ---
    this.moonTexture = this._createMoonTexture();
    new THREE.TextureLoader().load('assets/textures/moon.jpg', (tex) => {
      this.moonTexture = tex;
      this.moonMat.uniforms.moonMap.value = tex;
    });
    const moonGeo = new THREE.CircleGeometry(CONFIG.MOON_VISUAL_RADIUS, 32);
    this.moonMat = new THREE.ShaderMaterial({
      uniforms: {
        moonMap: { value: this.moonTexture },
        phase: { value: 0.0 },
        sunDirOnDisc: { value: new THREE.Vector2(1.0, 0.0) },
        opacity: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D moonMap;
        uniform float phase;
        uniform vec2 sunDirOnDisc;
        uniform float opacity;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv;
          vec2 centered = uv * 2.0 - 1.0;
          float dist2 = dot(centered, centered);
          if (dist2 > 1.0) discard;
          // Reconstruct sphere normal from disc UV
          float z = sqrt(1.0 - dist2);
          vec3 normal = vec3(centered.x, centered.y, z);
          // Sun direction: from actual sun-moon geometry projected onto disc
          vec3 sunDir = normalize(vec3(sunDirOnDisc, 0.5));
          // Illumination with smooth terminator
          float illumination = smoothstep(-0.05, 0.10, dot(normal, sunDir));
          // Sample texture
          vec4 texColor = texture2D(moonMap, uv);
          // Mix lit surface with dark earthshine
          vec3 earthshine = vec3(0.04, 0.04, 0.06);
          vec3 color = mix(earthshine, texColor.rgb, illumination);
          // Soft disc edge
          float edge = smoothstep(1.0, 0.9, dist2);
          gl_FragColor = vec4(color, edge * opacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.moonMesh = new THREE.Mesh(moonGeo, this.moonMat);
    this.moonMesh.renderOrder = -1;
    scene.add(this.moonMesh);

    // --- Stars (for night) ---
    this.stars = this._createStars();
    this.stars.material.transparent = true;
    scene.add(this.stars);

    // --- Shooting stars ---
    this.shootingStars = [];
    this.shootingStarTimer = 0;
    this.shootingStarInterval = 4 + Math.random() * 8; // 4-12 sec between

    // --- Directional sun light ---
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 4096;
    this.sunLight.shadow.mapSize.height = 4096;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 250;
    this.sunLight.shadow.camera.left = -80;
    this.sunLight.shadow.camera.right = 80;
    this.sunLight.shadow.camera.top = 80;
    this.sunLight.shadow.camera.bottom = -80;
    this.sunLight.shadow.bias = -0.002;
    this.sunLight.shadow.normalBias = 0.03;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // --- Hemisphere light ---
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6);
    scene.add(this.hemiLight);

    // --- Ambient light (for night minimum) ---
    this.ambientLight = new THREE.AmbientLight(0x405070, 0.35);
    scene.add(this.ambientLight);

    // --- Fog ---
    this.scene.fog = new THREE.Fog(0x8ab4d0, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);

    // --- Clouds ---
    this.cloudGroup = new THREE.Group();
    this._createClouds();
    scene.add(this.cloudGroup);

    // Initial update
    this.update(new THREE.Vector3(0, 0, 0));
  }

  _requestGeolocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.latitude = pos.coords.latitude;
          this.longitude = pos.coords.longitude;
        },
        () => {},  // fail silently, use default
        { timeout: 5000 }
      );
    }
  }

  _createStars() {
    const count = 300;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Random points on a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = CONFIG.SKY_RADIUS * 0.95;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)); // only upper hemisphere
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, fog: false, sizeAttenuation: false });
    return new THREE.Points(geo, mat);
  }

  _createClouds() {
    this.cloudTextures = this._createCloudTextures();
    // [0] soft round, [1] wispy, [2] flat-bottomed, [3] thin haze
    this._cloudPlaneGeo = new THREE.PlaneGeometry(1, 1);
    // Prevailing wind direction — all wispy/flat clouds align to this
    const windAngle = Math.random() * Math.PI;

    // Cloud archetypes with weighted random selection
    const archetypes = [
      { type: 'cumulus',    weight: 0.35, puffs: [5, 8],  heightMin: 60,  heightMax: 90,
        opacityMin: 0.25, opacityMax: 0.45, textures: [0, 2], driftBase: 0.015, horizontal: false },
      { type: 'wispy',     weight: 0.25, puffs: [3, 6],  heightMin: 85,  heightMax: 110,
        opacityMin: 0.1, opacityMax: 0.2,  textures: [1],    driftBase: 0.035, horizontal: true },
      { type: 'flat',      weight: 0.20, puffs: [6, 10], heightMin: 70,  heightMax: 100,
        opacityMin: 0.12, opacityMax: 0.22, textures: [3, 0], driftBase: 0.008, horizontal: true },
      { type: 'smallPuffy', weight: 0.20, puffs: [2, 3], heightMin: 50,  heightMax: 75,
        opacityMin: 0.3,  opacityMax: 0.5,  textures: [0],    driftBase: 0.025, horizontal: false },
    ];

    const pickArchetype = () => {
      const r = Math.random();
      let cumulative = 0;
      for (const a of archetypes) {
        cumulative += a.weight;
        if (r < cumulative) return a;
      }
      return archetypes[0];
    };

    for (let i = 0; i < CONFIG.CLOUD_COUNT; i++) {
      const arch = pickArchetype();
      const angle = (i / CONFIG.CLOUD_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const radius = CONFIG.CLOUD_MIN_RADIUS + Math.random() * (CONFIG.CLOUD_MAX_RADIUS - CONFIG.CLOUD_MIN_RADIUS);
      const height = arch.heightMin + Math.random() * (arch.heightMax - arch.heightMin);

      const cloud = new THREE.Group();
      const puffCount = arch.puffs[0] + Math.floor(Math.random() * (arch.puffs[1] - arch.puffs[0] + 1));
      const cloudWidth = CONFIG.CLOUD_SCALE_MIN + Math.random() * (CONFIG.CLOUD_SCALE_MAX - CONFIG.CLOUD_SCALE_MIN);

      for (let p = 0; p < puffCount; p++) {
        const texIdx = arch.textures[Math.floor(Math.random() * arch.textures.length)];
        const opacity = arch.opacityMin + Math.random() * (arch.opacityMax - arch.opacityMin);

        let puffObj;
        if (arch.horizontal) {
          // Flat horizontal plane — no billboarding, sits naturally in sky
          const mat = new THREE.MeshBasicMaterial({
            map: this.cloudTextures[texIdx],
            color: 0xffffff,
            transparent: true,
            opacity,
            fog: false,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          puffObj = new THREE.Mesh(this._cloudPlaneGeo, mat);
          puffObj.rotation.x = -Math.PI / 2;
          puffObj.rotation.y = windAngle + (Math.random() - 0.5) * 0.3;
        } else {
          // Billboard sprite — faces camera, good for round puffs
          const mat = new THREE.SpriteMaterial({
            map: this.cloudTextures[texIdx],
            color: 0xffffff,
            transparent: true,
            opacity,
            fog: false,
            depthWrite: false,
          });
          puffObj = new THREE.Sprite(mat);
        }

        let puffSize, scaleX, scaleY, posX, posY, posZ;
        switch (arch.type) {
          case 'cumulus':
            puffSize = (0.4 + Math.random() * 0.6) * cloudWidth;
            scaleX = puffSize;
            scaleY = puffSize * (0.5 + Math.random() * 0.4);
            posX = (Math.random() - 0.5) * cloudWidth * 0.7;
            posY = (Math.random() - 0.2) * cloudWidth * 0.3;
            posZ = (Math.random() - 0.5) * cloudWidth * 0.5;
            break;
          case 'wispy':
            puffSize = (1.0 + Math.random() * 0.8) * cloudWidth;
            scaleX = puffSize * (1.5 + Math.random() * 0.5);
            scaleY = puffSize * (1.2 + Math.random() * 0.5);
            posX = (Math.random() - 0.5) * cloudWidth * 2.5;
            posY = (Math.random() - 0.5) * cloudWidth * 0.05;
            posZ = (Math.random() - 0.5) * cloudWidth * 1.0;
            break;
          case 'flat':
            puffSize = (0.5 + Math.random() * 0.5) * cloudWidth;
            scaleX = puffSize * (1.0 + Math.random() * 0.5);
            scaleY = puffSize * (0.6 + Math.random() * 0.4);
            posX = (Math.random() - 0.5) * cloudWidth * 1.2;
            posY = (Math.random() - 0.5) * cloudWidth * 0.06;
            posZ = (Math.random() - 0.5) * cloudWidth * 0.8;
            break;
          case 'smallPuffy':
            puffSize = (0.5 + Math.random() * 0.5) * cloudWidth * 0.6;
            scaleX = puffSize;
            scaleY = puffSize * (0.5 + Math.random() * 0.3);
            posX = (Math.random() - 0.5) * cloudWidth * 0.3;
            posY = (Math.random() - 0.3) * cloudWidth * 0.15;
            posZ = (Math.random() - 0.5) * cloudWidth * 0.3;
            break;
        }

        if (arch.horizontal) {
          // Horizontal plane: XY plane rotated flat, so scale Y = depth
          puffObj.scale.set(scaleX, scaleY, 1);
        } else {
          puffObj.scale.set(scaleX, scaleY, 1);
        }
        puffObj.position.set(posX, posY, posZ);
        puffObj.userData.baseX = posX;
        puffObj.userData.baseY = posY;
        puffObj.userData.baseZ = posZ;
        puffObj.userData.baseScaleX = scaleX;
        puffObj.userData.baseScaleY = scaleY;
        puffObj.userData.phase = Math.random() * Math.PI * 2;
        puffObj.userData.horizontal = arch.horizontal;
        cloud.add(puffObj);
      }

      cloud.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      );
      cloud.userData.angle = angle;
      cloud.userData.radius = radius;
      cloud.userData.baseHeight = height;
      cloud.userData.drift = arch.driftBase + Math.random() * arch.driftBase * 0.5;
      cloud.userData.type = arch.type;
      this.cloudGroup.add(cloud);
    }
  }

  _createSunTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,245,0.75)');
    gradient.addColorStop(0.15, 'rgba(255,250,225,0.55)');
    gradient.addColorStop(0.35, 'rgba(255,235,180,0.18)');
    gradient.addColorStop(0.6, 'rgba(255,225,160,0.04)');
    gradient.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  _createCloudTextures() {
    const textures = [];

    // 0: Soft round — classic cumulus puff
    {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const half = size / 2;
      const g = ctx.createRadialGradient(half, half, 0, half, half, half);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.7)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      textures.push(new THREE.CanvasTexture(canvas));
    }

    // 1: Wispy — very soft round wash, wispy shape comes from puff arrangement
    {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const half = size / 2;
      const g = ctx.createRadialGradient(half, half, 0, half, half, half);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.15)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      textures.push(new THREE.CanvasTexture(canvas));
    }

    // 2: Flat-bottomed — sharp lower edge, soft top for fair-weather cumulus
    {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(size, size);
      const data = imageData.data;
      const half = size / 2;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const dx = (x - half) / half;
          const dy = (y - half) / half;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Asymmetric falloff: soft on top, flatter on bottom
          const verticalBias = dy > 0
            ? dx * dx + dy * dy * 2.5  // steeper below center
            : dx * dx + dy * dy * 0.6; // softer above center
          let alpha = Math.max(0, 1 - Math.sqrt(verticalBias) * 1.1);
          data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
          data[i + 3] = Math.floor(Math.max(0, alpha) * 255);
        }
      }
      ctx.putImageData(imageData, 0, 0);
      textures.push(new THREE.CanvasTexture(canvas));
    }

    // 3: Thin haze — very diffuse, low contrast for high-altitude patches
    {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const half = size / 2;
      const g = ctx.createRadialGradient(half, half, 0, half, half, half);
      g.addColorStop(0, 'rgba(255,255,255,0.4)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.25)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      textures.push(new THREE.CanvasTexture(canvas));
    }

    return textures;
  }

  /**
   * Create a 256x256 procedural moon texture with maria, craters, and ray system
   */
  _createMoonTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const half = size / 2;

    // Base grey highlands with subtle noise
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const dx = x - half, dy = y - half;
        const dist = Math.sqrt(dx * dx + dy * dy) / half;
        if (dist > 1.0) {
          data[i] = data[i + 1] = data[i + 2] = 0;
          data[i + 3] = 0;
          continue;
        }
        // Highland base with noise speckle
        const noise = (Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
        const base = 180 + noise * 20 - 10;
        data[i] = base; data[i + 1] = base; data[i + 2] = base + 2;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Dark maria (approximate positions on the visible face)
    const maria = [
      { x: 0.32, y: 0.28, rx: 0.18, ry: 0.14, color: 'rgba(80,80,88,0.6)' },   // Imbrium
      { x: 0.55, y: 0.30, rx: 0.10, ry: 0.09, color: 'rgba(85,85,92,0.5)' },    // Serenitatis
      { x: 0.58, y: 0.42, rx: 0.12, ry: 0.10, color: 'rgba(82,82,90,0.5)' },    // Tranquillitatis
      { x: 0.50, y: 0.55, rx: 0.11, ry: 0.08, color: 'rgba(78,78,86,0.45)' },   // Fecunditatis
      { x: 0.38, y: 0.48, rx: 0.08, ry: 0.07, color: 'rgba(75,75,84,0.5)' },    // Nectaris
      { x: 0.25, y: 0.38, rx: 0.09, ry: 0.12, color: 'rgba(82,82,90,0.55)' },   // Procellarum (part)
      { x: 0.45, y: 0.20, rx: 0.06, ry: 0.05, color: 'rgba(88,88,95,0.4)' },    // Frigoris
      { x: 0.40, y: 0.38, rx: 0.06, ry: 0.06, color: 'rgba(80,80,88,0.45)' },   // Vaporum
    ];
    for (const m of maria) {
      const grad = ctx.createRadialGradient(
        m.x * size, m.y * size, 0,
        m.x * size, m.y * size, Math.max(m.rx, m.ry) * size
      );
      grad.addColorStop(0, m.color);
      grad.addColorStop(0.7, m.color.replace(/[\d.]+\)$/, '0.2)'));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.save();
      ctx.translate(m.x * size, m.y * size);
      ctx.scale(m.rx / Math.max(m.rx, m.ry), m.ry / Math.max(m.rx, m.ry));
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(m.rx, m.ry) * size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Named craters (dark center, bright rim)
    const craters = [
      { x: 0.35, y: 0.75, r: 0.04 },  // Tycho
      { x: 0.52, y: 0.15, r: 0.03 },   // Aristoteles
      { x: 0.22, y: 0.55, r: 0.035 },  // Kepler
      { x: 0.68, y: 0.50, r: 0.03 },   // Langrenus
      { x: 0.45, y: 0.35, r: 0.025 },  // Manilius
      { x: 0.30, y: 0.65, r: 0.03 },   // Bullialdus
    ];
    // Add random small craters
    for (let i = 0; i < 16; i++) {
      const cx = 0.15 + Math.random() * 0.7;
      const cy = 0.15 + Math.random() * 0.7;
      const dx = cx - 0.5, dy = cy - 0.5;
      if (dx * dx + dy * dy < 0.2) {
        craters.push({ x: cx, y: cy, r: 0.008 + Math.random() * 0.015 });
      }
    }
    for (const c of craters) {
      const px = c.x * size, py = c.y * size, pr = c.r * size;
      // Bright rim
      ctx.strokeStyle = 'rgba(210,210,215,0.35)';
      ctx.lineWidth = Math.max(1, pr * 0.25);
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.stroke();
      // Dark floor
      const floorGrad = ctx.createRadialGradient(px, py, 0, px, py, pr * 0.8);
      floorGrad.addColorStop(0, 'rgba(60,60,65,0.4)');
      floorGrad.addColorStop(1, 'rgba(60,60,65,0)');
      ctx.fillStyle = floorGrad;
      ctx.beginPath();
      ctx.arc(px, py, pr * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tycho ray system — subtle bright lines radiating from Tycho crater
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#dddde0';
    ctx.lineWidth = 1.5;
    const tychoX = 0.35 * size, tychoY = 0.75 * size;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
      const len = 0.15 * size + Math.random() * 0.2 * size;
      ctx.beginPath();
      ctx.moveTo(tychoX, tychoY);
      ctx.lineTo(tychoX + Math.cos(angle) * len, tychoY + Math.sin(angle) * len);
      ctx.stroke();
    }
    ctx.restore();

    // Disc mask with soft edge
    ctx.globalCompositeOperation = 'destination-in';
    const maskGrad = ctx.createRadialGradient(half, half, half * 0.93, half, half, half);
    maskGrad.addColorStop(0, 'rgba(255,255,255,1)');
    maskGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = maskGrad;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  /**
   * Simplified Meeus lunar ephemeris — ~1 degree accuracy.
   * Returns { altitude, azimuth, phase } in the observer's sky.
   */
  _getMoonPosition(now) {
    // Get the effective time (respecting ?time= override and timeOffset)
    let hours;
    if (_fakeTimeHours !== null) {
      hours = _fakeTimeHours;
    } else {
      hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    }
    hours += this.timeOffset;

    // Compute Julian date directly from UTC components + hour offset
    // Avoid creating extra Date objects
    const wholeHours = Math.floor(hours);
    const fracMinutes = (hours - wholeHours) * 60;
    // Adjust the now Date in-place temporarily for UTC extraction
    const savedH = now.getHours(), savedM = now.getMinutes(), savedS = now.getSeconds();
    now.setHours(wholeHours, Math.floor(fracMinutes), Math.floor((fracMinutes % 1) * 60));

    // Julian date from UTC
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    const d = now.getUTCDate() + (now.getUTCHours() +
              now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600) / 24;
    const a = Math.floor((14 - m) / 12);
    const y2 = y + 4800 - a;
    const m2 = m + 12 * a - 3;
    const JD = d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 +
               Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;

    // Centuries since J2000.0
    const T = (JD - 2451545.0) / 36525.0;

    // Fundamental arguments (degrees)
    const Lp = (218.3165 + 481267.8813 * T) % 360;  // Mean longitude
    const D  = (297.8502 + 445267.1115 * T) % 360;   // Mean elongation
    const M  = (357.5291 + 35999.0503 * T) % 360;    // Sun mean anomaly
    const Mp = (134.9634 + 477198.8676 * T) % 360;   // Moon mean anomaly
    const F  = (93.2720 + 483202.0175 * T) % 360;    // Argument of latitude

    const rad = Math.PI / 180;

    // Ecliptic longitude (6 largest terms)
    let lon = Lp
      + 6.289 * Math.sin(Mp * rad)
      + 1.274 * Math.sin((2 * D - Mp) * rad)
      + 0.658 * Math.sin(2 * D * rad)
      + 0.214 * Math.sin(2 * Mp * rad)
      - 0.186 * Math.sin(M * rad)
      - 0.114 * Math.sin(2 * F * rad);

    // Ecliptic latitude (4 largest terms)
    let lat = 5.128 * Math.sin(F * rad)
      + 0.281 * Math.sin((Mp + F) * rad)
      + 0.278 * Math.sin((Mp - F) * rad)
      + 0.173 * Math.sin((2 * D - F) * rad);

    // Obliquity of ecliptic
    const obliquity = (23.4393 - 0.0130 * T) * rad;
    const lonRad = lon * rad;
    const latRad = lat * rad;

    // Ecliptic → equatorial
    const sinLon = Math.sin(lonRad);
    const cosLon = Math.cos(lonRad);
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinObl = Math.sin(obliquity);
    const cosObl = Math.cos(obliquity);

    const RA = Math.atan2(sinLon * cosObl - Math.tan(latRad) * sinObl, cosLon);
    const dec = Math.asin(sinLat * cosObl + cosLat * sinObl * sinLon);

    // Local sidereal time
    const GMST = (280.46061837 + 360.98564736629 * (JD - 2451545.0)) % 360;
    const LST = (GMST + this.longitude) * rad;
    const HA = LST - RA;

    // Equatorial → horizontal
    const latRad2 = this.latitude * rad;
    const sinDec = Math.sin(dec);
    const cosDec = Math.cos(dec);
    const sinLat2 = Math.sin(latRad2);
    const cosLat2 = Math.cos(latRad2);
    const cosHA = Math.cos(HA);

    const sinAlt = sinLat2 * sinDec + cosLat2 * cosDec * cosHA;
    const altitude = Math.asin(sinAlt);

    const cosAz = (sinDec - sinLat2 * sinAlt) / (cosLat2 * Math.cos(altitude) + 0.001);
    let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    if (Math.sin(HA) > 0) azimuth = 2 * Math.PI - azimuth;

    // Moon phase from known new moon epoch (Jan 6 2000 18:14 UTC)
    const synodicPeriod = 29.53059;
    const newMoonEpochJD = 2451550.26; // Jan 6, 2000 18:14 UTC
    const daysSinceNew = JD - newMoonEpochJD;
    const phase = ((daysSinceNew % synodicPeriod) + synodicPeriod) % synodicPeriod / synodicPeriod;

    // Restore the shared Date object
    now.setHours(savedH, savedM, savedS);

    return { altitude: sinAlt, azimuth, phase };
  }

  /**
   * Calculate sun elevation and azimuth from real time + latitude.
   * Returns { elevation: -1..1 (sin of altitude angle), azimuth: radians }
   */
  _getSunPosition(now) {
    // Get effective hours (respecting cached ?time= override)
    let hours;
    if (_fakeTimeHours !== null) {
      hours = _fakeTimeHours;
    } else {
      hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    }

    // Apply manual time offset
    hours += this.timeOffset;

    // Day of year (computed from month/date to avoid extra Date allocation)
    const daysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    const mo = now.getMonth(); // 0-based
    const isLeap = (now.getFullYear() % 4 === 0) && (now.getFullYear() % 100 !== 0 || now.getFullYear() % 400 === 0);
    const dayOfYear = daysInMonth[mo] + now.getDate() + (isLeap && mo > 1 ? 1 : 0);

    // Solar declination (simplified)
    const declination = -23.44 * Math.cos(2 * Math.PI * (dayOfYear + 10) / 365) * Math.PI / 180;

    // Hour angle (solar noon = 0)
    const solarNoon = 12; // simplified, no longitude correction
    const hourAngle = (hours - solarNoon) * 15 * Math.PI / 180;

    const lat = this.latitude * Math.PI / 180;

    // Solar elevation (sin of altitude)
    const sinAlt = Math.sin(lat) * Math.sin(declination) +
                   Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);

    // Azimuth
    const cosAz = (Math.sin(declination) - Math.sin(lat) * sinAlt) /
                  (Math.cos(lat) * Math.cos(Math.asin(sinAlt)) + 0.001);
    let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;

    return { elevation: sinAlt, azimuth };
  }

  /**
   * Blend between two palettes
   */
  _lerpPalette(a, b, t) {
    _blendPalette.skyTop.copy(a.skyTop).lerp(b.skyTop, t);
    _blendPalette.skyBottom.copy(a.skyBottom).lerp(b.skyBottom, t);
    _blendPalette.fog.copy(a.fog).lerp(b.fog, t);
    _blendPalette.sun.copy(a.sun).lerp(b.sun, t);
    _blendPalette.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t;
    _blendPalette.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
    _blendPalette.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, t);
    _blendPalette.hemiIntensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t;
    _blendPalette.ambient = a.ambient + (b.ambient - a.ambient) * t;
    return _blendPalette;
  }

  /**
   * Get blended palette for current sun elevation
   */
  _getPalette(elevation) {
    if (elevation < -0.1) {
      return PALETTES.night;
    } else if (elevation < -0.02) {
      // Night to twilight
      const t = (elevation + 0.1) / 0.08;
      return this._lerpPalette(PALETTES.night, PALETTES.twilight, t);
    } else if (elevation < 0.02) {
      // Twilight to golden
      const t = (elevation + 0.02) / 0.04;
      return this._lerpPalette(PALETTES.twilight, PALETTES.golden, t);
    } else if (elevation < 0.1) {
      // Golden to day (shorter transition — stays blue longer)
      const t = (elevation - 0.02) / 0.08;
      return this._lerpPalette(PALETTES.golden, PALETTES.day, t);
    } else {
      return PALETTES.day;
    }
  }

  /**
   * Call each frame with player position
   * @param {THREE.Vector3} playerPos
   * @param {THREE.Camera} camera
   * @param {number} delta
   * @param {object} [weather] - WeatherSystem instance (optional)
   */
  update(playerPos, camera, delta, weather) {
    const now = new Date();
    const { elevation, azimuth } = this._getSunPosition(now);
    this.sunElevation = elevation;
    const palette = this._getPalette(elevation);

    // --- Sun position in 3D ---
    const altAngle = Math.asin(Math.max(-0.3, Math.min(1, elevation)));
    _sunPos.set(
      Math.cos(azimuth) * Math.cos(altAngle) * CONFIG.SUN_DISTANCE,
      Math.sin(altAngle) * CONFIG.SUN_DISTANCE,
      Math.sin(azimuth) * Math.cos(altAngle) * CONFIG.SUN_DISTANCE
    );

    // Sun disc follows player (Sprite auto-faces camera)
    this.sunMesh.position.copy(playerPos).add(_sunPos);
    this.sunMat.color.copy(palette.sun);
    this.sunMesh.visible = elevation > -0.05;
    // Weather: fade sun to a dim suggestion behind clouds
    if (weather && weather.cloudDensity > 0.01) {
      const sunFade = 1 - weather.cloudDarkness * 0.9; // cloudy: ~0.42, rainy: ~0.19
      this.sunMat.opacity = sunFade;
      // Enlarge and soften — overcast sun is a diffuse bright patch, not a disc
      const sunScale = CONFIG.SUN_VISUAL_RADIUS * 3 * (1 + weather.cloudDarkness * 1.5);
      this.sunMesh.scale.set(sunScale, sunScale, 1);
    } else {
      this.sunMat.opacity = 1;
      const sunScale = CONFIG.SUN_VISUAL_RADIUS * 3;
      this.sunMesh.scale.set(sunScale, sunScale, 1);
    }

    // Moon — astronomically positioned with phase
    const moon = this._getMoonPosition(now);
    this.moonPhase = moon.phase;
    this.moonAltitude = moon.altitude;
    const moonAltAngle = Math.asin(Math.max(-0.3, Math.min(1, moon.altitude)));
    _moonPos.set(
      Math.cos(moon.azimuth) * Math.cos(moonAltAngle) * CONFIG.MOON_DISTANCE,
      Math.sin(moonAltAngle) * CONFIG.MOON_DISTANCE,
      Math.sin(moon.azimuth) * Math.cos(moonAltAngle) * CONFIG.MOON_DISTANCE
    );
    this.moonMesh.position.copy(playerPos).add(_moonPos);
    this.moonMesh.lookAt(playerPos);
    // Visible when above horizon AND sun is low
    const moonAboveHorizon = moon.altitude > 0.05;
    const sunLowEnough = elevation < 0.15;
    this.moonMesh.visible = moonAboveHorizon && sunLowEnough;
    // Fade with horizon proximity and twilight
    const horizonFade = Math.min(1, (moon.altitude - 0.05) / 0.1);
    const twilightFade = Math.min(1, (0.15 - elevation) / 0.2);
    let moonOpacity = Math.max(0, horizonFade * twilightFade);
    if (weather && weather.cloudDensity > 0.01) {
      // Fade moon to a vague glow behind clouds
      moonOpacity *= (1 - weather.cloudDarkness * 0.9);
      // Enlarge and soften — diffuse bright patch rather than defined disc
      const moonScale = CONFIG.MOON_VISUAL_RADIUS * (1 + weather.cloudDarkness * 1.2);
      this.moonMesh.scale.set(moonScale, moonScale, 1);
    } else {
      const moonScale = CONFIG.MOON_VISUAL_RADIUS;
      this.moonMesh.scale.set(moonScale, moonScale, 1);
    }
    this.moonMat.uniforms.opacity.value = moonOpacity;
    this.moonMat.uniforms.phase.value = moon.phase;
    // Compute sun direction on the moon disc (so lit side faces scene sun)
    if (camera) {
      _moonToSun.copy(_sunPos).sub(_moonPos);
      camera.matrixWorld.extractBasis(_camRight, _camUp, _camFwd);
      const sx = _moonToSun.dot(_camRight);
      const sy = _moonToSun.dot(_camUp);
      const len = Math.sqrt(sx * sx + sy * sy) || 1;
      this.moonMat.uniforms.sunDirOnDisc.value.set(sx / len, sy / len);
    }

    // Stars visibility
    this.stars.position.copy(playerPos);
    let starOpacity = Math.max(0, Math.min(1, (-elevation + 0.05) / 0.15));
    if (weather) starOpacity *= (1 - weather.starDimming);
    this.stars.material.opacity = starOpacity;
    this.stars.visible = elevation < 0.1 && starOpacity > 0.01;

    // --- Sun/moon light + shadow (reuse single DirectionalLight) ---
    _sunDir.copy(_sunPos).normalize();
    // Crossfade: during day use sun direction/color, at night use moon
    const moonUp = moon.altitude > 0.05;
    if (elevation > 0.0) {
      // Daytime — sun drives the directional light
      this.sunLight.position.copy(playerPos).addScaledVector(_sunDir, 100);
      this.sunLight.target.position.copy(playerPos);
      this.sunLight.color.copy(palette.sun);
      this.sunLight.intensity = palette.sunIntensity;
    } else if (moonUp) {
      // Night with moon — moonlight drives the directional light
      _moonDir.copy(_moonPos).normalize();
      const moonIntensity = Math.min(0.08, 0.08 * Math.min(1, moon.altitude / 0.3));
      // Smooth crossfade during twilight
      const twilightBlend = Math.max(0, Math.min(1, -elevation / 0.1));
      _sunDir.lerp(_moonDir, twilightBlend);
      this.sunLight.position.copy(playerPos).addScaledVector(_sunDir, 100);
      this.sunLight.target.position.copy(playerPos);
      // Cool blue-white moonlight tint
      this.sunLight.color.setRGB(
        0.6 + (1 - twilightBlend) * 0.4,
        0.65 + (1 - twilightBlend) * 0.35,
        0.8 + (1 - twilightBlend) * 0.2
      );
      this.sunLight.intensity = palette.sunIntensity * (1 - twilightBlend) + moonIntensity * twilightBlend;
    } else {
      // Night, no moon
      this.sunLight.position.copy(playerPos).addScaledVector(_sunDir, 100);
      this.sunLight.target.position.copy(playerPos);
      this.sunLight.color.copy(palette.sun);
      this.sunLight.intensity = palette.sunIntensity;
    }

    // --- Stabilize shadow map to prevent texel swimming ---
    this._stabilizeShadowMap();

    // Weather: dim sunlight and fade shadows
    if (weather) {
      this.sunLight.intensity *= (1 - weather.lightDimming);
      // Shadows fade out as overcast increases (nearly invisible in rain)
      const shadowStrength = Math.max(0, 1 - weather.lightDimming * 2);
      if (this.sunLight.shadow.intensity !== undefined) {
        this.sunLight.shadow.intensity = shadowStrength;
      }
      // Soften shadow edges — overcast sky diffuses light, blurring shadows
      this.sunLight.shadow.radius = 1 + weather.cloudDarkness * 12;
      this.sunLight.castShadow = shadowStrength > 0.05;
    } else {
      this.sunLight.castShadow = true;
    }

    // --- Hemisphere light ---
    this.hemiLight.color.copy(palette.hemiSky);
    this.hemiLight.groundColor.copy(palette.hemiGround);
    this.hemiLight.intensity = palette.hemiIntensity;
    if (weather) {
      this.hemiLight.intensity *= (1 - weather.lightDimming);
    }

    // --- Ambient light ---
    this.ambientLight.intensity = palette.ambient;
    if (weather) {
      this.ambientLight.intensity *= (1 - weather.lightDimming);
      // Lightning flash: additive ambient burst
      this.ambientLight.intensity += weather.lightningFlash * 0.8;
    }

    // --- Fog (distance adapts to time of day) ---
    this.scene.fog.color.copy(palette.fog);
    if (!this.scene.background) this.scene.background = new THREE.Color();
    this.scene.background.copy(palette.fog);
    // Darken fog color through twilight — match night fog darkness
    if (elevation < 0.02) {
      const fogDimT = Math.min(1, (0.02 - elevation) / 0.10);
      this.scene.fog.color.lerp(PALETTES.night.fog, fogDimT);
      this.scene.background.lerp(PALETTES.night.fog, fogDimT);
    }
    // Weather: desaturate fog/background — target grey matches current luminance
    // so nighttime stays dark, daytime goes to overcast grey
    if (weather && weather.cloudDensity > 0.01) {
      const desatAmount = weather.cloudDarkness;
      // Compute luminance-matched grey from current palette fog
      const fogLum = palette.fog.r * 0.3 + palette.fog.g * 0.5 + palette.fog.b * 0.2;
      // Blend between palette-luminance grey and overcast grey based on brightness
      // At night (fogLum ~0.03) → use dark grey; at day (fogLum ~0.5) → use overcast grey
      const dayness = Math.min(1, fogLum * 3);
      _color.setRGB(fogLum, fogLum, fogLum).lerp(_overcastHorizonGrey, dayness);
      // At night, push rain fog toward near-black (rain blocks all ambient light)
      const nightDarken = (1 - dayness) * weather.rainIntensity * 0.7;
      _color.multiplyScalar(1 - nightDarken);
      // Storm dims fog at all times of day (especially noticeable at twilight/dawn)
      _color.multiplyScalar(1 - weather.skyDarkening * 0.6);
      this.scene.fog.color.lerp(_color, desatAmount);
      this.scene.background.lerp(_color, desatAmount);
    }
    // Fog distance: stays distant through twilight, only closes in at night.
    let fogNear, fogFar;
    if (elevation > -0.02) {
      // Day, golden, early twilight — fog stays distant
      fogNear = 120;
      fogFar = 250;
    } else {
      // Deep twilight → night: fog closes in
      const t = Math.min(1, (-0.02 - elevation) / 0.08); // 0 at -0.02, 1 at -0.10
      fogNear = 120 - t * 100;  // 120 → 20
      fogFar = 250 - t * 200;   // 250 → 50
    }
    // Weather: reduce fog distance (closer fog = lower visibility)
    if (weather) {
      fogNear *= weather.fogMultiplier;
      fogFar *= weather.fogMultiplier;
    }
    this.scene.fog.near = fogNear;
    this.scene.fog.far = fogFar;

    // --- Sky dome (sky blends to fog color at horizon) ---
    this._updateSkyColors(palette.skyTop, palette.skyBottom, palette.fog, playerPos, weather);

    // --- Clouds ---
    this._updateClouds(playerPos, palette, elevation, delta || 0.016, weather);

    // --- Shooting stars ---
    this._updateShootingStars(playerPos, elevation, delta || 0.016);
  }

  _updateSkyColors(topColor, bottomColor, fogColor, playerPos, weather) {
    this.skyUniforms.topColor.value.copy(topColor);
    this.skyUniforms.bottomColor.value.copy(bottomColor);
    this.skyUniforms.fogColor.value.copy(fogColor);
    // Weather: converge sky toward overcast grey, respecting time-of-day luminance
    if (weather && weather.cloudDensity > 0.01) {
      const desatAmount = weather.cloudDarkness;
      // Luminance-matched targets so nighttime stays dark
      const fogLum = fogColor.r * 0.3 + fogColor.g * 0.5 + fogColor.b * 0.2;
      const topLum = topColor.r * 0.3 + topColor.g * 0.5 + topColor.b * 0.2;
      const dayness = Math.min(1, fogLum * 3);
      // Night rain pushes toward near-black
      const nightDarken = (1 - dayness) * weather.rainIntensity * 0.7;
      // Fog/bottom: desaturate toward luminance-grey, blending to overcast grey in daytime
      _color.setRGB(fogLum, fogLum, fogLum).lerp(_overcastHorizonGrey, dayness);
      _color.multiplyScalar(1 - nightDarken);
      _color.multiplyScalar(1 - weather.skyDarkening * 0.6);
      this.skyUniforms.fogColor.value.lerp(_color, desatAmount);
      this.skyUniforms.bottomColor.value.lerp(_color, desatAmount);
      // Top: desaturate toward darker grey, blending to storm grey in daytime
      _color.setRGB(topLum, topLum, topLum).lerp(_cloudStormGrey, dayness);
      _color.multiplyScalar(1 - nightDarken);
      _color.multiplyScalar(1 - weather.skyDarkening * 0.6);
      this.skyUniforms.topColor.value.lerp(_color, desatAmount);
      // Lightning flash — additive white burst
      if (weather.lightningFlash > 0.01) {
        const f = weather.lightningFlash * 0.4;
        this.skyUniforms.topColor.value.r += f;
        this.skyUniforms.topColor.value.g += f;
        this.skyUniforms.topColor.value.b += f;
        this.skyUniforms.bottomColor.value.r += f;
        this.skyUniforms.bottomColor.value.g += f;
        this.skyUniforms.bottomColor.value.b += f;
      }
    }
    this.skyMesh.position.set(playerPos.x, 0, playerPos.z);
  }

  _updateClouds(playerPos, palette, elevation, delta, weather) {
    this.cloudGroup.position.set(playerPos.x, 0, playerPos.z);
    this.cloudTime += delta;
    const t = this.cloudTime;

    // Tint clouds based on time of day
    const isNight = elevation < -0.05;
    const isTwilight = elevation >= -0.05 && elevation < 0.1;

    for (const cloud of this.cloudGroup.children) {
      // Drift with slight radial wobble and vertical bob
      cloud.userData.angle += cloud.userData.drift * 0.003;
      const a = cloud.userData.angle;
      const r = cloud.userData.radius;
      const radialWobble = Math.sin(t * 0.03 + a * 3) * 3;
      const verticalBob = Math.sin(t * 0.04 + a * 2) * 0.8;
      cloud.position.x = Math.cos(a) * (r + radialWobble);
      cloud.position.z = Math.sin(a) * (r + radialWobble);
      cloud.position.y = cloud.userData.baseHeight + verticalBob;

      // Animate + tint each sprite puff
      for (const puff of cloud.children) {
        // Billowing: position drift and scale breathing (subtle for horizontal clouds)
        const ph = puff.userData.phase;
        const moveScale = puff.userData.horizontal ? 0.15 : 1.0;
        puff.position.x = puff.userData.baseX + Math.sin(t * 0.08 + ph) * 0.8 * moveScale;
        puff.position.y = puff.userData.baseY + Math.sin(t * 0.06 + ph * 1.3) * 0.4 * moveScale;
        puff.position.z = puff.userData.baseZ + Math.cos(t * 0.07 + ph * 0.7) * 0.6 * moveScale;

        const breatheX = 1 + Math.sin(t * 0.05 + ph * 2.0) * 0.06 * moveScale;
        const breatheY = 1 + Math.sin(t * 0.04 + ph * 1.5) * 0.04 * moveScale;
        puff.scale.x = puff.userData.baseScaleX * breatheX;
        puff.scale.y = puff.userData.baseScaleY * breatheY;

        // Color tinting
        const basePuffOpacity = puff.material.userData?.baseOpacity ?? puff.material.opacity;
        if (!puff.material.userData) puff.material.userData = {};
        puff.material.userData.baseOpacity = basePuffOpacity;

        if (isNight) {
          puff.material.color.setHex(0x222233);
          puff.material.opacity = basePuffOpacity * 0.5;
        } else if (isTwilight) {
          const tw = (elevation + 0.05) / 0.15;
          puff.material.color.lerpColors(
            _cloudNightColor,
            _cloudTwilightColor,
            tw
          );
          puff.material.opacity = basePuffOpacity * (0.5 + tw * 0.5);
        } else {
          puff.material.color.setHex(0xffffff);
          puff.material.opacity = basePuffOpacity;
        }

        // Weather: boost opacity + darken toward storm grey
        if (weather && weather.cloudDensity > 0.01) {
          puff.material.opacity += weather.cloudDensity * basePuffOpacity;
          puff.material.opacity = Math.min(puff.material.opacity, 0.95);
          puff.material.color.lerp(weather.stormCloudColor, weather.cloudDarkness);
        }
      }
    }
  }

  _updateShootingStars(playerPos, elevation, delta) {
    // Only at night
    if (elevation > 0.05) {
      // Clean up any active ones
      for (const s of this.shootingStars) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
      }
      this.shootingStars.length = 0;
      return;
    }

    const nightStrength = Math.max(0, Math.min(1, (0.05 - elevation) / 0.1));

    // Spawn new shooting stars
    this.shootingStarTimer += delta;
    if (this.shootingStarTimer > this.shootingStarInterval) {
      this.shootingStarTimer = 0;
      this.shootingStarInterval = 3 + Math.random() * 10;
      this._spawnShootingStar(playerPos);
    }

    // Update active shooting stars
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const s = this.shootingStars[i];
      s.life += delta;
      const t = s.life / s.duration;

      if (t >= 1) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this.shootingStars.splice(i, 1);
        continue;
      }

      // Move along direction
      s.head.addScaledVector(s.velocity, delta);

      // Update line: tail fades behind head
      const tailLen = Math.min(s.tailLength, s.life * s.speed);
      s.tail.copy(s.head).addScaledVector(s.velocity, -tailLen / s.speed);

      const pos = s.mesh.geometry.getAttribute('position');
      pos.setXYZ(0, s.tail.x, s.tail.y, s.tail.z);
      pos.setXYZ(1, s.head.x, s.head.y, s.head.z);
      pos.needsUpdate = true;

      // Fade in then out
      const fade = t < 0.1 ? t / 0.1 : t > 0.7 ? (1 - t) / 0.3 : 1;
      s.mesh.material.opacity = fade * nightStrength * 0.9;
    }
  }

  _spawnShootingStar(playerPos) {
    // Random position on the upper sky dome
    const angle = Math.random() * Math.PI * 2;
    const elevAngle = 0.3 + Math.random() * 0.8; // 20-70 degrees up
    const dist = CONFIG.SKY_RADIUS * 0.7;

    const startX = playerPos.x + Math.cos(angle) * Math.cos(elevAngle) * dist;
    const startY = playerPos.y + Math.sin(elevAngle) * dist;
    const startZ = playerPos.z + Math.sin(angle) * Math.cos(elevAngle) * dist;

    // Direction: mostly downward and sideways
    const dirAngle = angle + 0.3 + Math.random() * 0.5;
    const speed = 150 + Math.random() * 200;
    const vx = Math.cos(dirAngle) * speed;
    const vy = -speed * (0.3 + Math.random() * 0.4);
    const vz = Math.sin(dirAngle) * speed;

    const head = new THREE.Vector3(startX, startY, startZ);
    const tail = head.clone();
    const velocity = new THREE.Vector3(vx, vy, vz);

    const positions = new Float32Array(6);
    positions[0] = tail.x; positions[1] = tail.y; positions[2] = tail.z;
    positions[3] = head.x; positions[4] = head.y; positions[5] = head.z;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      fog: false,
      linewidth: 1,
    });

    const mesh = new THREE.Line(geo, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    this.shootingStars.push({
      mesh,
      head,
      tail,
      velocity,
      speed,
      tailLength: 15 + Math.random() * 25,
      duration: 0.4 + Math.random() * 0.8,
      life: 0,
    });
  }

  /**
   * Snap shadow camera position to texel grid boundaries.
   * Prevents shadow "swimming" — subtle banding that shifts as the player moves.
   */
  _stabilizeShadowMap() {
    const light = this.sunLight;
    const shadowCam = light.shadow.camera;

    // Update matrices so we can transform to light space
    light.updateMatrixWorld();
    shadowCam.updateMatrixWorld();

    const texelSize = (shadowCam.right - shadowCam.left) / light.shadow.mapSize.width;

    // Transform target to light view space
    _sunPos.copy(light.target.position).applyMatrix4(shadowCam.matrixWorldInverse);

    // Snap to texel grid
    _sunPos.x = Math.round(_sunPos.x / texelSize) * texelSize;
    _sunPos.y = Math.round(_sunPos.y / texelSize) * texelSize;

    // Transform back to world space
    _sunPos.applyMatrix4(shadowCam.matrixWorld);

    // Apply the snap offset to both target and light position
    const dx = _sunPos.x - light.target.position.x;
    const dy = _sunPos.y - light.target.position.y;
    const dz = _sunPos.z - light.target.position.z;

    light.target.position.x += dx;
    light.target.position.y += dy;
    light.target.position.z += dz;
    light.position.x += dx;
    light.position.y += dy;
    light.position.z += dz;
  }

  getSkyMesh() {
    return this.skyMesh;
  }
}
