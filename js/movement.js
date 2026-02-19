// Locomotion + snap turn + terrain following + jump + walk bob + rock climbing + swimming
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { getTerrainHeight, getMountainFactor } from './terrain/noise.js';

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

export class MovementSystem {
  constructor(vrSetup, inputManager) {
    this.vr = vrSetup;
    this.input = inputManager;
    this.chunkManager = null;
    this.collectibles = null; // set externally for sprint cost

    // Sprint drain accumulator
    this._sprintDrainAccum = 0;

    // Landing detection
    this._wasAirborne = false;

    // Snap turn
    this.snapCooldown = 0;

    // Jump / vertical physics
    this.velocityY = 0;
    this.isGrounded = true;
    this.currentGroundY = 0; // the Y we should be at (terrain or rock top)

    // Walk bob
    this.bobPhase = 0;
    this.bobActive = false;

    // Swimming
    this.isSwimming = false;

    // Skiing momentum
    this.skiVelX = 0;
    this.skiVelZ = 0;
    this.isOnSnow = false;
  }

  update(delta) {
    const dolly = this.vr.dolly;
    const camera = this.vr.camera;
    const left = this.input.leftStick;
    const right = this.input.rightStick;

    // --- Calculate ground surface (terrain + rocks) ---
    const px = dolly.position.x;
    const pz = dolly.position.z;
    const terrainY = getTerrainHeight(px, pz);
    const rockY = this._getRockSurfaceY(px, pz);
    const solidGroundY = Math.max(terrainY, rockY);

    // --- Detect swimming: water deep enough to submerge player ---
    const waterLevel = CONFIG.WATER_LEVEL;
    const waterDepth = waterLevel - terrainY;
    this.isSwimming = waterDepth > CONFIG.SWIM_DEPTH_THRESHOLD;

    if (this.isSwimming) {
      // Float on water surface: eyes just above water
      this.currentGroundY = waterLevel + CONFIG.SWIM_EYE_ABOVE_WATER - CONFIG.TERRAIN_FOLLOW_OFFSET;
    } else {
      this.currentGroundY = solidGroundY;
    }

    // --- Detect snow surface for ski physics ---
    this.isOnSnow = !this.isSwimming && terrainY > CONFIG.SNOWLINE_START && rockY <= terrainY + 0.01;

    // --- Continuous locomotion (left stick) ---
    const canSprint = this.input.sprintPressed && this.collectibles && this.collectibles.score > 0 && !this.isSwimming;
    const moveSpeed = this.isSwimming ? CONFIG.SWIM_SPEED : (canSprint ? CONFIG.SPRINT_SPEED : CONFIG.MOVE_SPEED);
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
        _move.multiplyScalar(moveSpeed * delta);

        if (this.isOnSnow) {
          // On snow: input drives ski velocity — enough to climb
          this.skiVelX += _move.x * 5.0;
          this.skiVelZ += _move.z * 5.0;
        } else {
          const newX = dolly.position.x + _move.x;
          const newZ = dolly.position.z + _move.z;

          if (this.isSwimming || !this._collidesWithTree(newX, newZ)) {
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
    }

    // --- Ski physics: gravity-driven downhill slide + friction ---
    if (this.isOnSnow && this.isGrounded) {
      // Compute slope from terrain gradient
      const eps = 0.5;
      const hL = getTerrainHeight(px - eps, pz);
      const hR = getTerrainHeight(px + eps, pz);
      const hD = getTerrainHeight(px, pz - eps);
      const hU = getTerrainHeight(px, pz + eps);
      const slopeX = (hL - hR) / (2 * eps); // positive = downhill in +X
      const slopeZ = (hD - hU) / (2 * eps);

      // Gravity pushes downhill (slope * gravity * scale)
      const skiGravity = 3.5;
      this.skiVelX += slopeX * skiGravity * delta;
      this.skiVelZ += slopeZ * skiGravity * delta;

      // Friction — less when coasting (no input), more when actively braking
      const hasInput = Math.abs(left.x) > 0 || Math.abs(left.y) > 0;
      const friction = hasInput ? 0.97 : 0.995;
      this.skiVelX *= friction;
      this.skiVelZ *= friction;

      // Speed cap
      const skiSpeed = Math.sqrt(this.skiVelX * this.skiVelX + this.skiVelZ * this.skiVelZ);
      const maxSkiSpeed = 10;
      if (skiSpeed > maxSkiSpeed) {
        const scale = maxSkiSpeed / skiSpeed;
        this.skiVelX *= scale;
        this.skiVelZ *= scale;
      }

      // Apply ski velocity
      this.skiSpeed = skiSpeed;
      if (skiSpeed > 0.01) {
        const newX = dolly.position.x + this.skiVelX * delta;
        const newZ = dolly.position.z + this.skiVelZ * delta;
        dolly.position.x = newX;
        dolly.position.z = newZ;
        // Only report "moving" at meaningful speed — prevents footstep sounds when nearly stopped
        if (skiSpeed > 0.3) isMoving = true;
      }
    } else {
      this.skiSpeed = 0;
      // Off snow: bleed ski velocity quickly
      this.skiVelX *= 0.85;
      this.skiVelZ *= 0.85;
      if (Math.abs(this.skiVelX) < 0.01) this.skiVelX = 0;
      if (Math.abs(this.skiVelZ) < 0.01) this.skiVelZ = 0;
    }

    // --- Snap turn (right stick X) — disabled when mouse look active ---
    if (this.snapCooldown > 0) {
      this.snapCooldown -= delta;
    }
    if (!this.input.pointerLocked && !this.input.rightGrip && Math.abs(right.x) > CONFIG.SNAP_TURN_DEADZONE && this.snapCooldown <= 0) {
      const angle = -Math.sign(right.x) * THREE.MathUtils.degToRad(CONFIG.SNAP_TURN_ANGLE);
      dolly.rotateY(angle);
      this.snapCooldown = CONFIG.SNAP_TURN_COOLDOWN;
    }

    // --- Mouse look (desktop only) ---
    this.input.applyMouseLook(dolly, camera);

    // --- Jump (disabled while swimming) ---
    if (!this.isSwimming && this.input.jumpPressed && this.isGrounded) {
      this.velocityY = CONFIG.JUMP_VELOCITY;
      this.isGrounded = false;
    }

    // --- Vertical physics ---
    if (this.isSwimming) {
      // Smoothly float to water surface
      const targetY = this.currentGroundY;
      dolly.position.y += (targetY - dolly.position.y) * Math.min(1, delta * 10);
      this.velocityY = 0;
      this.isGrounded = true;
    } else if (!this.isGrounded) {
      this.velocityY -= CONFIG.GRAVITY * delta;
      dolly.position.y += this.velocityY * delta;

      // Land when we reach ground level
      if (dolly.position.y <= this.currentGroundY) {
        dolly.position.y = this.currentGroundY;
        this.velocityY = 0;
        this.isGrounded = true;
        // Play landing sound — splash if in shallow water, thud otherwise
        if (this._wasAirborne && this.audio) {
          if (terrainY < CONFIG.WATER_LEVEL + 0.1 && this.audio.playLandingSplash) {
            this.audio.playLandingSplash();
          } else if (this.audio.playLandingThud) {
            this.audio.playLandingThud();
          }
        }
      }
    } else {
      // Smoothly follow ground surface
      const targetY = this.currentGroundY;
      dolly.position.y += (targetY - dolly.position.y) * Math.min(1, delta * 12);
    }

    // --- Sprint state (set before bob so footstep rate matches) ---
    this.isSprinting = canSprint && isMoving;

    // --- Walk / swim / ski bob ---
    if (isMoving && this.isGrounded) {
      const sprintBobSpeed = CONFIG.WALK_BOB_SPEED * (CONFIG.SPRINT_SPEED / CONFIG.MOVE_SPEED);
      // Skiing: slower, gentler bob for gliding feel
      const bobSpeed = this.isSwimming ? CONFIG.SWIM_BOB_SPEED : this.isOnSnow ? 1.0 : (this.isSprinting ? sprintBobSpeed : CONFIG.WALK_BOB_SPEED);
      const bobAmount = this.isSwimming ? CONFIG.SWIM_BOB_AMOUNT : this.isOnSnow ? 0.012 : CONFIG.WALK_BOB_AMOUNT;
      this.bobPhase += delta * bobSpeed;
      this.bobAmplitude = bobAmount;
    } else {
      // Decay amplitude to zero when stopped
      this.bobAmplitude = (this.bobAmplitude || 0) * Math.max(0, 1 - delta * 6);
      if (this.bobAmplitude < 0.001) this.bobAmplitude = 0;
    }

    const bobOffset = Math.sin(this.bobPhase * Math.PI * 2) * this.bobAmplitude;

    if (this.vr.isInVR()) {
      // Bob the camera (not the dolly) so world objects like water stay stable
      camera.position.y += bobOffset * 0.3;
    } else {
      camera.position.y = CONFIG.TERRAIN_FOLLOW_OFFSET + bobOffset;
    }

    // --- Sprint point drain: 1 point per second of sprinting ---
    if (canSprint && isMoving) {
      this._sprintDrainAccum += delta;
      while (this._sprintDrainAccum >= 2.0 && this.collectibles.score > 0) {
        this._sprintDrainAccum -= 2.0;
        this.collectibles.score -= 1;
        if (this.collectibles.onScoreChange) {
          this.collectibles.onScoreChange(this.collectibles.score);
        }
        // Sad sound when points run out
        if (this.collectibles.score <= 0 && this.audio && this.audio.playSprintEmpty) {
          this.audio.playSprintEmpty();
        }
      }
    } else if (!this.input.sprintPressed) {
      // Reset accumulator when sprint key is fully released
      this._sprintDrainAccum = 0;
    }

    // Track airborne for landing detection
    this._wasAirborne = !this.isGrounded;

    // Expose state for audio system
    this.isMoving = isMoving && this.isGrounded;
    if (terrainY < CONFIG.WATER_LEVEL + 0.1) {
      this.groundType = 'water';
    } else if (rockY > terrainY + 0.01) {
      this.groundType = 'rock';
    } else if (terrainY > CONFIG.SNOWLINE_START) {
      this.groundType = 'snow';
    } else {
      this.groundType = 'grass';
    }
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
