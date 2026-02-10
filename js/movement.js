// Locomotion + snap turn + terrain following + jump + walk bob + rock climbing
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { getTerrainHeight } from './terrain/noise.js';

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

export class MovementSystem {
  constructor(vrSetup, inputManager) {
    this.vr = vrSetup;
    this.input = inputManager;
    this.chunkManager = null;

    // Snap turn
    this.snapCooldown = 0;

    // Jump / vertical physics
    this.velocityY = 0;
    this.isGrounded = true;
    this.currentGroundY = 0; // the Y we should be at (terrain or rock top)

    // Walk bob
    this.bobPhase = 0;
    this.bobActive = false;
  }

  update(delta) {
    const dolly = this.vr.dolly;
    const camera = this.vr.camera;
    const left = this.input.leftStick;
    const right = this.input.rightStick;

    // --- Continuous locomotion (left stick) ---
    let isMoving = false;
    if (Math.abs(left.x) > 0 || Math.abs(left.y) > 0) {
      camera.getWorldDirection(_forward);
      _forward.y = 0;
      _forward.normalize();

      _right.crossVectors(_forward, THREE.Object3D.DEFAULT_UP).normalize();

      _move.set(0, 0, 0);
      _move.addScaledVector(_forward, -left.y);
      _move.addScaledVector(_right, left.x);

      if (_move.lengthSq() > 0) {
        _move.normalize();
        _move.multiplyScalar(CONFIG.MOVE_SPEED * delta);

        const newX = dolly.position.x + _move.x;
        const newZ = dolly.position.z + _move.z;

        if (!this._collidesWithTree(newX, newZ)) {
          dolly.position.x = newX;
          dolly.position.z = newZ;
          isMoving = true;
        } else {
          if (!this._collidesWithTree(newX, dolly.position.z)) {
            dolly.position.x = newX;
            isMoving = true;
          } else if (!this._collidesWithTree(dolly.position.x, newZ)) {
            dolly.position.z = newZ;
            isMoving = true;
          }
        }
      }
    }

    // --- Snap turn (right stick X) — disabled when mouse look active ---
    if (this.snapCooldown > 0) {
      this.snapCooldown -= delta;
    }
    if (!this.input.pointerLocked && Math.abs(right.x) > CONFIG.SNAP_TURN_DEADZONE && this.snapCooldown <= 0) {
      const angle = -Math.sign(right.x) * THREE.MathUtils.degToRad(CONFIG.SNAP_TURN_ANGLE);
      dolly.rotateY(angle);
      this.snapCooldown = CONFIG.SNAP_TURN_COOLDOWN;
    }

    // --- Mouse look (desktop only) ---
    this.input.applyMouseLook(dolly, camera);

    // --- Calculate ground surface (terrain + rocks) ---
    const px = dolly.position.x;
    const pz = dolly.position.z;
    const terrainY = getTerrainHeight(px, pz);
    const rockY = this._getRockSurfaceY(px, pz);
    this.currentGroundY = Math.max(terrainY, rockY);

    // --- Jump ---
    if (this.input.jumpPressed && this.isGrounded) {
      this.velocityY = CONFIG.JUMP_VELOCITY;
      this.isGrounded = false;
    }

    // --- Vertical physics ---
    if (!this.isGrounded) {
      this.velocityY -= CONFIG.GRAVITY * delta;
      dolly.position.y += this.velocityY * delta;

      // Land when we reach ground level
      if (dolly.position.y <= this.currentGroundY) {
        dolly.position.y = this.currentGroundY;
        this.velocityY = 0;
        this.isGrounded = true;
      }
    } else {
      // Smoothly follow ground surface
      const targetY = this.currentGroundY;
      dolly.position.y += (targetY - dolly.position.y) * Math.min(1, delta * 12);
    }

    // --- Walk bob ---
    if (isMoving && this.isGrounded) {
      this.bobPhase += delta * CONFIG.WALK_BOB_SPEED;
      this.bobAmplitude = CONFIG.WALK_BOB_AMOUNT;
    } else {
      // Decay amplitude to zero when stopped
      this.bobAmplitude = (this.bobAmplitude || 0) * Math.max(0, 1 - delta * 6);
      if (this.bobAmplitude < 0.001) this.bobAmplitude = 0;
    }

    const bobOffset = Math.sin(this.bobPhase * Math.PI * 2) * this.bobAmplitude;

    if (this.vr.isInVR()) {
      // In VR, very subtle bob on dolly — reduced to avoid discomfort
      dolly.position.y += bobOffset * 0.3;
    } else {
      camera.position.y = CONFIG.TERRAIN_FOLLOW_OFFSET + bobOffset;
    }

    // Expose state for audio system
    this.isMoving = isMoving && this.isGrounded;
    this.groundType = (rockY > terrainY + 0.01) ? 'rock' : 'grass';
  }

  /**
   * Check if position collides with any nearby tree trunk.
   */
  _collidesWithTree(px, pz) {
    if (!this.chunkManager) return false;

    const r = CONFIG.TREE_COLLISION_RADIUS;
    const playerR = 0.25;
    const collisionDist = r + playerR;
    const collisionDistSq = collisionDist * collisionDist;

    const cx = Math.floor(px / CONFIG.CHUNK_SIZE);
    const cz = Math.floor(pz / CONFIG.CHUNK_SIZE);

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        const chunk = this.chunkManager.activeChunks.get(key);
        if (!chunk || !chunk.active) continue;

        for (const tree of chunk.treePositions) {
          const ddx = px - tree.x;
          const ddz = pz - tree.z;
          const distSq = ddx * ddx + ddz * ddz;
          if (distSq < collisionDistSq) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Get the highest rock surface Y at player position.
   * Returns -Infinity if not standing on any rock.
   */
  _getRockSurfaceY(px, pz) {
    if (!this.chunkManager) return -Infinity;

    let maxY = -Infinity;
    const playerR = 0.2;
    const cx = Math.floor(px / CONFIG.CHUNK_SIZE);
    const cz = Math.floor(pz / CONFIG.CHUNK_SIZE);
    const radii = CONFIG.ROCK_COLLISION_RADII;

    // Rock heights by size index (matches vegetation.js rock creation)
    const rockHeights = [0.07, 0.12, 0.22]; // approximate top surface offset

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        const chunk = this.chunkManager.activeChunks.get(key);
        if (!chunk || !chunk.active || !chunk.rockPositions) continue;

        for (const rock of chunk.rockPositions) {
          const r = radii[rock.sizeIdx] || 0.15;
          const standDist = r + playerR;
          const ddx = px - rock.x;
          const ddz = pz - rock.z;
          const distSq = ddx * ddx + ddz * ddz;

          if (distSq < standDist * standDist) {
            const rockTopY = rock.y + rockHeights[rock.sizeIdx];
            if (rockTopY > maxY) {
              maxY = rockTopY;
            }
          }
        }
      }
    }
    return maxY;
  }

  getPlayerPosition() {
    return this.vr.dolly.position;
  }
}
