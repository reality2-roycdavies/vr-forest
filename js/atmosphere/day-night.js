// Day/night cycle tied to real-world time with sun, clouds, and dynamic lighting
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const _color = new THREE.Color();
const _sunPos = new THREE.Vector3();
const _moonToSun = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _moonPos = new THREE.Vector3();

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
      color: 0xffee88,
      fog: false,
      transparent: true,
      depthWrite: false,
    });
    this.sunMesh = new THREE.Sprite(this.sunMat);
    const sunScale = CONFIG.SUN_VISUAL_RADIUS * 3;
    this.sunMesh.scale.set(sunScale, sunScale, 1);
    this.sunMesh.renderOrder = -1;
    scene.add(this.sunMesh);

    // --- Moon disc (phase shader with cratered texture) ---
    this.moonTexture = this._createMoonTexture();
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
    scene.add(this.stars);

    // --- Shooting stars ---
    this.shootingStars = [];
    this.shootingStarTimer = 0;
    this.shootingStarInterval = 4 + Math.random() * 8; // 4-12 sec between

    // --- Directional sun light ---
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 150;
    this.sunLight.shadow.camera.left = -60;
    this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60;
    this.sunLight.shadow.camera.bottom = -60;
    this.sunLight.shadow.bias = -0.001;
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
    // Generate a soft circular texture for cloud puffs
    this.cloudTexture = this._createCloudTexture();

    for (let i = 0; i < CONFIG.CLOUD_COUNT; i++) {
      const angle = (i / CONFIG.CLOUD_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const radius = CONFIG.CLOUD_MIN_RADIUS + Math.random() * (CONFIG.CLOUD_MAX_RADIUS - CONFIG.CLOUD_MIN_RADIUS);
      const height = CONFIG.CLOUD_HEIGHT_MIN + Math.random() * (CONFIG.CLOUD_HEIGHT_MAX - CONFIG.CLOUD_HEIGHT_MIN);

      // Each cloud is a group of 4-8 billboard sprites for a fluffy look
      const cloud = new THREE.Group();
      const puffCount = 4 + Math.floor(Math.random() * 5);
      const cloudWidth = CONFIG.CLOUD_SCALE_MIN + Math.random() * (CONFIG.CLOUD_SCALE_MAX - CONFIG.CLOUD_SCALE_MIN);

      for (let p = 0; p < puffCount; p++) {
        const puffSize = (0.4 + Math.random() * 0.6) * cloudWidth;
        const mat = new THREE.SpriteMaterial({
          map: this.cloudTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 0.25 + Math.random() * 0.2,
          fog: false,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(puffSize, puffSize * (0.4 + Math.random() * 0.3), 1);
        sprite.position.set(
          (Math.random() - 0.5) * cloudWidth * 0.8,
          (Math.random() - 0.3) * cloudWidth * 0.15,
          (Math.random() - 0.5) * cloudWidth * 0.4
        );
        cloud.add(sprite);
      }

      cloud.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      );
      cloud.userData.angle = angle;
      cloud.userData.radius = radius;
      cloud.userData.baseHeight = height;
      cloud.userData.drift = 0.01 + Math.random() * 0.02;
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
    gradient.addColorStop(0, 'rgba(255,255,240,1)');
    gradient.addColorStop(0.15, 'rgba(255,245,200,0.9)');
    gradient.addColorStop(0.35, 'rgba(255,220,120,0.4)');
    gradient.addColorStop(0.6, 'rgba(255,200,80,0.1)');
    gradient.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  _createCloudTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.7)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
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
  _getMoonPosition() {
    const now = new Date();

    // Get the effective time (respecting ?time= override and timeOffset)
    const params = new URLSearchParams(window.location.search);
    const fakeTime = params.get('time');
    let hours;
    if (fakeTime) {
      const [h, m] = fakeTime.split(':').map(Number);
      hours = (h || 0) + (m || 0) / 60;
    } else {
      hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    }
    hours += this.timeOffset;

    // Build a Date-like timestamp for Julian date
    // Use the current date but with the effective hours (in local time)
    const effectiveDate = new Date(now);
    const wholeHours = Math.floor(hours);
    const fracMinutes = (hours - wholeHours) * 60;
    effectiveDate.setHours(wholeHours, Math.floor(fracMinutes), Math.floor((fracMinutes % 1) * 60));

    // Julian date from UTC
    const y = effectiveDate.getUTCFullYear();
    const m = effectiveDate.getUTCMonth() + 1;
    const d = effectiveDate.getUTCDate() + (effectiveDate.getUTCHours() +
              effectiveDate.getUTCMinutes() / 60 + effectiveDate.getUTCSeconds() / 3600) / 24;
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

    return { altitude: sinAlt, azimuth, phase };
  }

  /**
   * Calculate sun elevation and azimuth from real time + latitude.
   * Returns { elevation: -1..1 (sin of altitude angle), azimuth: radians }
   */
  _getSunPosition() {
    const now = new Date();

    // Allow ?time=HH:MM override (e.g. ?time=22:30 for night)
    const params = new URLSearchParams(window.location.search);
    const fakeTime = params.get('time');
    let hours;
    if (fakeTime) {
      const [h, m] = fakeTime.split(':').map(Number);
      hours = (h || 0) + (m || 0) / 60;
    } else {
      hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    }

    // Apply manual time offset
    hours += this.timeOffset;

    // Day of year
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / 86400000);

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
    return {
      skyTop: _color.copy(a.skyTop).lerp(b.skyTop, t).clone(),
      skyBottom: _color.copy(a.skyBottom).lerp(b.skyBottom, t).clone(),
      fog: _color.copy(a.fog).lerp(b.fog, t).clone(),
      sun: _color.copy(a.sun).lerp(b.sun, t).clone(),
      sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t,
      hemiSky: _color.copy(a.hemiSky).lerp(b.hemiSky, t).clone(),
      hemiGround: _color.copy(a.hemiGround).lerp(b.hemiGround, t).clone(),
      hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t,
      ambient: a.ambient + (b.ambient - a.ambient) * t,
    };
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
   */
  update(playerPos, camera) {
    const { elevation, azimuth } = this._getSunPosition();
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

    // Moon — astronomically positioned with phase
    const moon = this._getMoonPosition();
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
    this.moonMat.uniforms.opacity.value = Math.max(0, horizonFade * twilightFade);
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
    this.stars.material.opacity = Math.max(0, Math.min(1, (-elevation + 0.05) / 0.15));
    this.stars.material.transparent = true;
    this.stars.visible = elevation < 0.1;

    // --- Sun/moon light + shadow (reuse single DirectionalLight) ---
    const sunDir = _sunPos.clone().normalize();
    // Crossfade: during day use sun direction/color, at night use moon
    const moonUp = moon.altitude > 0.05;
    if (elevation > 0.0) {
      // Daytime — sun drives the directional light
      this.sunLight.position.copy(playerPos).addScaledVector(sunDir, 70);
      this.sunLight.target.position.copy(playerPos);
      this.sunLight.color.copy(palette.sun);
      this.sunLight.intensity = palette.sunIntensity;
    } else if (moonUp) {
      // Night with moon — moonlight drives the directional light
      const moonDir = _moonPos.clone().normalize();
      const moonIntensity = Math.min(0.22, 0.22 * Math.min(1, moon.altitude / 0.3));
      // Smooth crossfade during twilight
      const twilightBlend = Math.max(0, Math.min(1, -elevation / 0.1));
      this.sunLight.position.copy(playerPos).addScaledVector(
        sunDir.lerp(moonDir, twilightBlend), 70
      );
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
      this.sunLight.position.copy(playerPos).addScaledVector(sunDir, 70);
      this.sunLight.target.position.copy(playerPos);
      this.sunLight.color.copy(palette.sun);
      this.sunLight.intensity = palette.sunIntensity;
    }

    // --- Hemisphere light ---
    this.hemiLight.color.copy(palette.hemiSky);
    this.hemiLight.groundColor.copy(palette.hemiGround);
    this.hemiLight.intensity = palette.hemiIntensity;

    // --- Ambient light ---
    this.ambientLight.intensity = palette.ambient;

    // --- Fog (distance adapts to time of day) ---
    this.scene.fog.color.copy(palette.fog);
    this.scene.background = palette.fog.clone();
    // Fog stays distant until deep night, then closes in for darkness.
    let fogNear, fogFar;
    if (elevation > -0.08) {
      // Day, golden, twilight — clear, no visible fog
      fogNear = 120;
      fogFar = 250;
    } else {
      // Night — lerp fog closer as it gets darker
      const t = Math.min(1, (-0.08 - elevation) / 0.05); // 0 at -0.08, 1 at -0.13
      fogNear = 120 - t * 100;  // 120 → 20
      fogFar = 250 - t * 200;   // 250 → 50
    }
    this.scene.fog.near = fogNear;
    this.scene.fog.far = fogFar;

    // --- Sky dome (sky blends to fog color at horizon) ---
    this._updateSkyColors(palette.skyTop, palette.skyBottom, palette.fog, playerPos);

    // --- Clouds ---
    this._updateClouds(playerPos, palette, elevation);

    // --- Shooting stars ---
    this._updateShootingStars(playerPos, elevation);
  }

  _updateSkyColors(topColor, bottomColor, fogColor, playerPos) {
    this.skyUniforms.topColor.value.copy(topColor);
    this.skyUniforms.bottomColor.value.copy(bottomColor);
    this.skyUniforms.fogColor.value.copy(fogColor);
    this.skyMesh.position.set(playerPos.x, 0, playerPos.z);
  }

  _updateClouds(playerPos, palette, elevation) {
    this.cloudGroup.position.set(playerPos.x, 0, playerPos.z);

    // Tint clouds based on time of day
    const isNight = elevation < -0.05;
    const isTwilight = elevation >= -0.05 && elevation < 0.1;

    for (const cloud of this.cloudGroup.children) {
      // Very slow drift
      cloud.userData.angle += cloud.userData.drift * 0.003;
      const a = cloud.userData.angle;
      const r = cloud.userData.radius;
      cloud.position.x = Math.cos(a) * r;
      cloud.position.z = Math.sin(a) * r;

      // Color tinting — apply to each sprite puff in the group
      for (const puff of cloud.children) {
        const basePuffOpacity = puff.material.userData?.baseOpacity ?? puff.material.opacity;
        if (!puff.material.userData) puff.material.userData = {};
        puff.material.userData.baseOpacity = basePuffOpacity;

        if (isNight) {
          puff.material.color.setHex(0x222233);
          puff.material.opacity = basePuffOpacity * 0.5;
        } else if (isTwilight) {
          const t = (elevation + 0.05) / 0.15;
          puff.material.color.lerpColors(
            new THREE.Color(0x222233),
            new THREE.Color(0xe8a070),
            t
          );
          puff.material.opacity = basePuffOpacity * (0.5 + t * 0.5);
        } else {
          puff.material.color.setHex(0xffffff);
          puff.material.opacity = basePuffOpacity;
        }
      }
    }
  }

  _updateShootingStars(playerPos, elevation) {
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
    this.shootingStarTimer += 0.016; // ~per frame
    if (this.shootingStarTimer > this.shootingStarInterval) {
      this.shootingStarTimer = 0;
      this.shootingStarInterval = 3 + Math.random() * 10;
      this._spawnShootingStar(playerPos);
    }

    // Update active shooting stars
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const s = this.shootingStars[i];
      s.life += 0.016;
      const t = s.life / s.duration;

      if (t >= 1) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this.shootingStars.splice(i, 1);
        continue;
      }

      // Move along direction
      s.head.addScaledVector(s.velocity, 0.016);

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

  getSkyMesh() {
    return this.skyMesh;
  }
}
