// Day/night cycle tied to real-world time with sun, clouds, and dynamic lighting
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const _color = new THREE.Color();
const _sunPos = new THREE.Vector3();

// Color palettes for different times of day
const PALETTES = {
  // sunElevation ranges: night < -0.1, twilight -0.1..0.05, day > 0.05
  night: {
    skyTop:    new THREE.Color(0x162040),
    skyBottom: new THREE.Color(0x1a2535),
    fog:       new THREE.Color(0x182030),
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
    skyTop:    new THREE.Color(0x4a6aaa),
    skyBottom: new THREE.Color(0xe8a060),
    fog:       new THREE.Color(0xc8a878),
    sun:       new THREE.Color(0xffbb44),
    sunIntensity: 0.8,
    hemiSky:   new THREE.Color(0x8899aa),
    hemiGround: new THREE.Color(0x2a2010),
    hemiIntensity: 0.45,
    ambient:   0.3,
  },
  day: {
    skyTop:    new THREE.Color(0x3068cc),
    skyBottom: new THREE.Color(0x7ab0d8),
    fog:       new THREE.Color(0x8ab4d0),
    sun:       new THREE.Color(0xfff4e0),
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

    // Try to get real location
    this._requestGeolocation();

    // --- Sky dome ---
    this.skyGeo = new THREE.SphereGeometry(CONFIG.SKY_RADIUS, 24, 16);
    this.skyColors = new Float32Array(this.skyGeo.getAttribute('position').count * 3);
    this.skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(this.skyColors, 3));
    this.skyMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    this.skyMesh = new THREE.Mesh(this.skyGeo, this.skyMat);
    this.skyMesh.renderOrder = -2;
    scene.add(this.skyMesh);

    // --- Sun disc ---
    const sunGeo = new THREE.CircleGeometry(CONFIG.SUN_VISUAL_RADIUS, 16);
    this.sunMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0, fog: false, depthTest: false });
    this.sunMesh = new THREE.Mesh(sunGeo, this.sunMat);
    this.sunMesh.renderOrder = -1;
    scene.add(this.sunMesh);

    // --- Moon disc (for night) ---
    const moonGeo = new THREE.CircleGeometry(CONFIG.SUN_VISUAL_RADIUS * 0.7, 16);
    this.moonMat = new THREE.MeshBasicMaterial({
      color: 0xd8dce8,
      fog: false,
      transparent: true,
      opacity: 1,
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
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 80;
    this.sunLight.shadow.camera.left = -40;
    this.sunLight.shadow.camera.right = 40;
    this.sunLight.shadow.camera.top = 40;
    this.sunLight.shadow.camera.bottom = -40;
    this.sunLight.shadow.bias = -0.002;
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
        (pos) => { this.latitude = pos.coords.latitude; },
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
    } else if (elevation < 0.0) {
      // Night to twilight
      const t = (elevation + 0.1) / 0.1;
      return this._lerpPalette(PALETTES.night, PALETTES.twilight, t);
    } else if (elevation < 0.05) {
      // Twilight to golden
      const t = elevation / 0.05;
      return this._lerpPalette(PALETTES.twilight, PALETTES.golden, t);
    } else if (elevation < 0.2) {
      // Golden to day
      const t = (elevation - 0.05) / 0.15;
      return this._lerpPalette(PALETTES.golden, PALETTES.day, t);
    } else {
      return PALETTES.day;
    }
  }

  /**
   * Call each frame with player position
   */
  update(playerPos) {
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

    // Sun disc follows player
    this.sunMesh.position.copy(playerPos).add(_sunPos);
    this.sunMesh.lookAt(playerPos);
    this.sunMat.color.copy(palette.sun);
    this.sunMesh.visible = elevation > -0.05;

    // Moon high in sky, opposite side from sun
    const moonDist = CONFIG.SUN_DISTANCE * 0.9;
    const moonElev = Math.max(0.3, 1.0 - Math.max(0, elevation + 0.1));
    this.moonMesh.position.set(
      playerPos.x - _sunPos.x * 0.5,
      playerPos.y + moonDist * moonElev,
      playerPos.z - _sunPos.z * 0.5
    );
    this.moonMesh.lookAt(playerPos);
    this.moonMesh.visible = elevation < 0.1;
    this.moonMat.opacity = Math.max(0, Math.min(1, (0.05 - elevation) / 0.15));

    // Stars visibility
    this.stars.position.copy(playerPos);
    this.stars.material.opacity = Math.max(0, Math.min(1, (-elevation + 0.05) / 0.15));
    this.stars.material.transparent = true;
    this.stars.visible = elevation < 0.1;

    // --- Sun light + shadow ---
    const sunDir = _sunPos.clone().normalize();
    this.sunLight.position.copy(playerPos).addScaledVector(sunDir, 50);
    this.sunLight.target.position.copy(playerPos);
    this.sunLight.color.copy(palette.sun);
    this.sunLight.intensity = palette.sunIntensity;

    // --- Hemisphere light ---
    this.hemiLight.color.copy(palette.hemiSky);
    this.hemiLight.groundColor.copy(palette.hemiGround);
    this.hemiLight.intensity = palette.hemiIntensity;

    // --- Ambient light ---
    this.ambientLight.intensity = palette.ambient;

    // --- Fog ---
    this.scene.fog.color.copy(palette.fog);
    this.scene.background = palette.fog.clone();

    // --- Sky dome vertex colors ---
    this._updateSkyColors(palette.skyTop, palette.skyBottom, playerPos);

    // --- Clouds ---
    this._updateClouds(playerPos, palette, elevation);

    // --- Shooting stars ---
    this._updateShootingStars(playerPos, elevation);
  }

  _updateSkyColors(topColor, bottomColor, playerPos) {
    const posAttr = this.skyGeo.getAttribute('position');
    const count = posAttr.count;

    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      const t = Math.max(0, y / CONFIG.SKY_RADIUS);
      _color.lerpColors(bottomColor, topColor, t);
      this.skyColors[i * 3] = _color.r;
      this.skyColors[i * 3 + 1] = _color.g;
      this.skyColors[i * 3 + 2] = _color.b;
    }

    this.skyGeo.getAttribute('color').needsUpdate = true;
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
