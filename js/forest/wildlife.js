// Random wildlife — bear, mountain lion, or Where's Wally peek from behind trees
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { getTerrainHeight } from '../terrain/noise.js';

const _cameraDir = new THREE.Vector3();
const _toTree = new THREE.Vector3();
const _white = new THREE.Color(0xffffff);

export class WildlifeSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.chunkManager = null;

    // --- Peek system (animated pop-out from behind trees) ---
    this.timer = 0;
    this.nextSpawnTime = 5 + Math.random() * 10;
    this.activeCreature = null;
    this.activeCreatureType = null; // 'bear', 'lion', or 'wally'
    this.peekDuration = 0;
    this.peekTimer = 0;
    this.fadeState = 'none';

    this.bearMesh = this._createBear();
    this.lionMesh = this._createLion();
    this.wallyMesh = this._createWally();
    this.bearMesh.visible = false;
    this.lionMesh.visible = false;
    this.wallyMesh.visible = false;
    scene.add(this.bearMesh);
    scene.add(this.lionMesh);
    scene.add(this.wallyMesh);

    // Audio reference (set externally)
    this.audio = null;
  }

  _createBear() {
    const group = new THREE.Group();

    const bodyGeo = new THREE.SphereGeometry(0.3, 6, 5);
    bodyGeo.scale(1, 0.85, 0.7);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x7a4a28 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.35;
    group.add(body);

    const headGeo = new THREE.SphereGeometry(0.18, 6, 5);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0, 0.6, 0.15);
    group.add(head);

    const snoutGeo = new THREE.SphereGeometry(0.08, 5, 4);
    const snoutMat = new THREE.MeshLambertMaterial({ color: 0x9a7050 });
    const snout = new THREE.Mesh(snoutGeo, snoutMat);
    snout.position.set(0, 0.56, 0.3);
    group.add(snout);

    const noseGeo = new THREE.SphereGeometry(0.03, 4, 3);
    const noseMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.57, 0.37);
    group.add(nose);

    for (const side of [-1, 1]) {
      const earGeo = new THREE.SphereGeometry(0.06, 4, 4);
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(side * 0.12, 0.75, 0.08);
      group.add(ear);
    }

    this._addEyes(group, 0.08, 0.63, 0.28, 0.025, 0xffdd44);

    // Legs — stocky bear legs
    const legGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.25, 5);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, bodyMat);
        leg.position.set(sx * 0.15, 0.12, sz * 0.12);
        group.add(leg);
      }
    }

    return group;
  }

  _createLion() {
    const group = new THREE.Group();

    const bodyGeo = new THREE.SphereGeometry(0.25, 6, 5);
    bodyGeo.scale(1.1, 0.75, 0.6);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xd4b060 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.3;
    group.add(body);

    const headGeo = new THREE.SphereGeometry(0.14, 6, 5);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0, 0.52, 0.12);
    group.add(head);

    const snoutGeo = new THREE.SphereGeometry(0.06, 5, 4);
    snoutGeo.scale(1, 0.7, 1);
    const snoutMat = new THREE.MeshLambertMaterial({ color: 0xe8d0a0 });
    const snout = new THREE.Mesh(snoutGeo, snoutMat);
    snout.position.set(0, 0.48, 0.24);
    group.add(snout);

    const noseGeo = new THREE.SphereGeometry(0.02, 4, 3);
    const noseMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.49, 0.29);
    group.add(nose);

    const earMat = new THREE.MeshLambertMaterial({ color: 0xc0a040 });
    for (const side of [-1, 1]) {
      const earGeo = new THREE.ConeGeometry(0.04, 0.08, 4);
      const ear = new THREE.Mesh(earGeo, earMat);
      ear.position.set(side * 0.1, 0.65, 0.06);
      group.add(ear);
    }

    this._addEyes(group, 0.06, 0.54, 0.22, 0.02, 0x88ff44);

    const tailGeo = new THREE.CylinderGeometry(0.015, 0.01, 0.35, 4);
    tailGeo.rotateX(Math.PI * 0.35);
    const tail = new THREE.Mesh(tailGeo, bodyMat);
    tail.position.set(0, 0.28, -0.28);
    group.add(tail);

    // Legs — slender cat legs
    const legGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.25, 5);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, bodyMat);
        leg.position.set(sx * 0.12, 0.1, sz * 0.1);
        group.add(leg);
      }
    }

    return group;
  }

  _createWally() {
    const group = new THREE.Group();

    // Red-and-white striped materials
    const redMat = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xf0c8a0 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2244aa });
    const blackMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    // Blue trousers (legs)
    const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, blueMat);
      leg.position.set(side * 0.07, 0.15, 0);
      group.add(leg);
    }

    // Striped body — alternating red/white bands
    const stripeH = 0.06;
    for (let i = 0; i < 5; i++) {
      const stripeGeo = new THREE.CylinderGeometry(0.12, 0.12, stripeH, 6);
      const stripe = new THREE.Mesh(stripeGeo, i % 2 === 0 ? redMat : whiteMat);
      stripe.position.y = 0.33 + i * stripeH;
      group.add(stripe);
    }

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 4);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, redMat);
      arm.position.set(side * 0.15, 0.48, 0);
      arm.rotation.z = side * 0.15;
      group.add(arm);

      // Hands
      const handGeo = new THREE.SphereGeometry(0.035, 4, 4);
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.set(side * 0.18, 0.34, 0);
      group.add(hand);
    }

    // Head
    const headGeo = new THREE.SphereGeometry(0.11, 6, 5);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 0.73, 0);
    group.add(head);

    // Bobble hat — red with white bobble
    const hatGeo = new THREE.CylinderGeometry(0.06, 0.12, 0.1, 6);
    const hat = new THREE.Mesh(hatGeo, redMat);
    hat.position.set(0, 0.85, 0);
    group.add(hat);

    const bobbleGeo = new THREE.SphereGeometry(0.035, 4, 4);
    const bobble = new THREE.Mesh(bobbleGeo, whiteMat);
    bobble.position.set(0, 0.92, 0);
    group.add(bobble);

    // Glasses — two dark circles
    for (const side of [-1, 1]) {
      const lensGeo = new THREE.RingGeometry(0.02, 0.03, 8);
      const lens = new THREE.Mesh(lensGeo, blackMat);
      lens.position.set(side * 0.05, 0.74, 0.11);
      group.add(lens);
    }

    // Eye dots behind glasses (for nighttime glow)
    if (!group.userData.eyeShines) group.userData.eyeShines = [];
    group.userData.eyeShineBaseColor = 0xffcc88;
    group.userData.eyeShineBaseRadius = 0.012;
    for (const side of [-1, 1]) {
      const eyeGeo = new THREE.SphereGeometry(0.012, 4, 4);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffcc88 });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.05, 0.74, 0.105);
      group.add(eye);
      group.userData.eyeShines.push(eye);
    }

    // Smile
    const smileGeo = new THREE.TorusGeometry(0.03, 0.008, 4, 6, Math.PI);
    const smile = new THREE.Mesh(smileGeo, redMat);
    smile.position.set(0, 0.69, 0.1);
    smile.rotation.x = Math.PI;
    group.add(smile);

    return group;
  }

  _addEyes(group, offsetX, y, z, radius, shineColor) {
    if (!group.userData.eyeShines) group.userData.eyeShines = [];
    group.userData.eyeShineBaseColor = shineColor;
    group.userData.eyeShineBaseRadius = radius * 0.45;
    for (const side of [-1, 1]) {
      const eyeGeo = new THREE.SphereGeometry(radius, 4, 4);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * offsetX, y, z);
      group.add(eye);

      const shineGeo = new THREE.SphereGeometry(radius * 0.45, 4, 4);
      const shineMat = new THREE.MeshBasicMaterial({ color: shineColor });
      const shine = new THREE.Mesh(shineGeo, shineMat);
      shine.position.set(side * offsetX + side * radius * 0.2, y + radius * 0.2, z + radius * 0.3);
      group.add(shine);
      group.userData.eyeShines.push(shine);
    }
  }

  // ======== Peek tree finder (in front of camera) ========

  _findPeekTree(playerPos) {
    if (!this.chunkManager) return null;

    this.camera.getWorldDirection(_cameraDir);
    _cameraDir.y = 0;
    _cameraDir.normalize();

    const cx = Math.floor(playerPos.x / CONFIG.CHUNK_SIZE);
    const cz = Math.floor(playerPos.z / CONFIG.CHUNK_SIZE);
    let bestTree = null;
    let bestScore = -Infinity;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        const chunk = this.chunkManager.activeChunks.get(key);
        if (!chunk || !chunk.active) continue;

        for (const tree of chunk.treePositions) {
          // Skip tussock (type 3) — too small to hide behind
          if (tree.type === 3) continue;
          _toTree.set(tree.x - playerPos.x, 0, tree.z - playerPos.z);
          const dist = _toTree.length();
          if (dist < 5 || dist > 30) continue;

          _toTree.normalize();
          const dot = _toTree.dot(_cameraDir);
          if (dot < 0.0) continue;

          const score = dot * 0.3 + (1 - Math.abs(dot - 0.7)) * 0.7 - Math.abs(dist - 15) * 0.02;
          if (score > bestScore) {
            bestScore = score;
            bestTree = tree;
          }
        }
      }
    }
    return bestTree;
  }

  // ======== Main update ========

  update(delta, playerPos, sunElevation) {
    this.timer += delta;
    this.sunElevation = sunElevation;
    this._updatePeek(delta, playerPos);
    if (this.activeCreature) {
      this._updateEyeGlow(this.activeCreature);
    }
  }

  // ======== Peek animation (slide out, show, slide back) ========

  _updatePeek(delta, playerPos) {
    if (this.fadeState !== 'none') {
      this.peekTimer += delta;
      const mesh = this.activeCreature;

      if (this.fadeState === 'fadein') {
        const t = Math.min(1, this.peekTimer / 0.8);
        const ease = this._easeOutCubic(t);
        mesh.position.x = mesh.userData.hideX + (mesh.userData.peekX - mesh.userData.hideX) * ease;
        mesh.position.z = mesh.userData.hideZ + (mesh.userData.peekZ - mesh.userData.hideZ) * ease;
        mesh.position.y = mesh.userData.hideY + (mesh.userData.peekY - mesh.userData.hideY) * ease;
        mesh.userData.baseY = mesh.position.y;
        if (t >= 1) {
          this.fadeState = 'showing';
          this.peekTimer = 0;
        }
      } else if (this.fadeState === 'showing') {
        mesh.rotation.y = mesh.userData.baseFaceAngle + Math.sin(this.peekTimer * 2) * 0.1;
        const breathe = Math.sin(this.peekTimer * 3) * 0.015;
        const headTilt = Math.sin(this.peekTimer * 1.3) * 0.04;
        mesh.position.y = mesh.userData.baseY + breathe;
        mesh.rotation.z = headTilt;
        if (this.peekTimer > this.peekDuration) {
          this.fadeState = 'fadeout';
          this.peekTimer = 0;
        }
      } else if (this.fadeState === 'fadeout') {
        const t = Math.min(1, this.peekTimer / 0.6);
        const ease = this._easeInCubic(t);
        mesh.position.x = mesh.userData.peekX + (mesh.userData.hideX - mesh.userData.peekX) * ease;
        mesh.position.z = mesh.userData.peekZ + (mesh.userData.hideZ - mesh.userData.peekZ) * ease;
        mesh.position.y = mesh.userData.peekY + (mesh.userData.hideY - mesh.userData.peekY) * ease;
        if (t >= 1) {
          mesh.visible = false;
          this.fadeState = 'none';
          this.activeCreature = null;
          this.activeCreatureType = null;
          this.nextSpawnTime = this.timer + 12 + Math.random() * 25;
        }
      }
      return;
    }

    if (this.timer < this.nextSpawnTime) return;

    const tree = this._findPeekTree(playerPos);
    if (!tree) {
      this.nextSpawnTime = this.timer + 2;
      return;
    }

    // Pick creature: equal chance each
    const roll = Math.random();
    let mesh, creatureType;
    if (roll < 0.33) {
      mesh = this.wallyMesh;
      creatureType = 'wally';
    } else if (roll < 0.66) {
      mesh = this.bearMesh;
      creatureType = 'bear';
    } else {
      mesh = this.lionMesh;
      creatureType = 'lion';
    }
    this.activeCreature = mesh;
    this.activeCreatureType = creatureType;

    const dx = tree.x - playerPos.x;
    const dz = tree.z - playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const toPlayerX = -dx / dist;
    const toPlayerZ = -dz / dist;

    const side = Math.random() > 0.5 ? 1 : -1;
    const perpX = -toPlayerZ * side;
    const perpZ = toPlayerX * side;
    const peekOffset = 0.5;

    mesh.userData.hideX = tree.x - toPlayerX * 0.9;
    mesh.userData.hideZ = tree.z - toPlayerZ * 0.9;
    mesh.userData.peekX = tree.x + perpX * peekOffset - toPlayerX * 0.15;
    mesh.userData.peekZ = tree.z + perpZ * peekOffset - toPlayerZ * 0.15;

    // Sample terrain height at actual hide/peek positions
    mesh.userData.hideY = getTerrainHeight(mesh.userData.hideX, mesh.userData.hideZ);
    mesh.userData.peekY = getTerrainHeight(mesh.userData.peekX, mesh.userData.peekZ);

    mesh.position.set(mesh.userData.hideX, mesh.userData.hideY, mesh.userData.hideZ);
    mesh.userData.baseY = mesh.userData.hideY;

    const faceAngle = Math.atan2(toPlayerX, toPlayerZ);
    mesh.rotation.y = faceAngle;
    mesh.rotation.z = 0;
    mesh.userData.baseFaceAngle = faceAngle;

    mesh.visible = true;
    this.fadeState = 'fadein';
    this.peekTimer = 0;
    this.peekDuration = 2 + Math.random() * 4;

    // Sound when peeking out
    if (this.audio) {
      const pos = { x: tree.x, y: tree.y, z: tree.z };
      if (creatureType === 'wally') {
        this.audio.playWallyHello(pos);
      } else {
        this.audio.playGrowl(creatureType, pos);
      }
    }
  }

  _updateEyeGlow(mesh) {
    const shines = mesh.userData.eyeShines;
    if (!shines || shines.length === 0) return;

    // Glow ramps up as sun goes below horizon
    const elev = this.sunElevation !== undefined ? this.sunElevation : 1;
    const darkness = Math.max(0, Math.min(1, (-elev + 0.02) / 0.12)); // 0 at day, 1 at night

    const baseRadius = mesh.userData.eyeShineBaseRadius || 0.01;
    const baseColor = mesh.userData.eyeShineBaseColor || 0xffffff;

    for (const shine of shines) {
      // Scale up shine spheres at night (1x day → 2.5x night)
      const scale = 1 + darkness * 1.5;
      shine.scale.setScalar(scale);

      // Brighten colour toward white at night for glow effect
      shine.material.color.set(baseColor);
      shine.material.color.lerp(_white, darkness * 0.4);
    }
  }

  _easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  _easeInCubic(t) { return t * t * t; }
}
