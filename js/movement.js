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

    // Smoothed thumbstick input (removes jerkiness in VR)
    this._smoothLX = 0;
    this._smoothLY = 0;
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
    const inVR = this.vr.isInVR();
    const canSprint = this.input.sprintPressed && this.collectibles && this.collectibles.score > 0 && !this.isSwimming;
    const baseSpeed = inVR ? CONFIG.MOVE_SPEED * 1.35 : CONFIG.MOVE_SPEED;
    const moveSpeed = this.isSwimming ? CONFIG.SWIM_SPEED : (canSprint ? CONFIG.SPRINT_SPEED : baseSpeed);
    let isMoving = false;

    // Remap thumbstick past deadzone to smooth 0→1 range (removes jerk at deadzone edge)
    const dz = CONFIG.THUMBSTICK_DEADZONE;
    const remapAxis = (v) => {
      const abs = Math.abs(v);
      if (abs < 0.001) return 0;
      return Math.sign(v) * Math.min(1, (abs - dz) / (1 - dz));
    };
    const rawLX = remapAxis(left.x);
    const rawLY = remapAxis(left.y);

    // Smooth thumbstick input (lerp toward target — removes frame-to-frame jitter in VR)
    const smoothRate = inVR ? 12 : 20; // VR: gentler ramp; desktop: snappier
    this._smoothLX += (rawLX - this._smoothLX) * Math.min(1, delta * smoothRate);
    this._smoothLY += (rawLY - this._smoothLY) * Math.min(1, delta * smoothRate);
    const lx = this._smoothLX;
    const ly = this._smoothLY;

    if (Math.abs(lx) > 0.01 || Math.abs(ly) > 0.01) {
      camera.getWorldDirection(_forward);
      _forward.y = 0;
      _forward.normalize();

      _right.crossVectors(_forward, THREE.Object3D.DEFAULT_UP).normalize();

      _move.set(0, 0, 0);
      _move.addScaledVector(_forward, -ly);
      _move.addScaledVector(_right, lx);

      if (_move.lengthSq() > 0) {
        _move.normalize();
        _move.multiplyScalar(moveSpeed * delta);

        if (this.isOnSnow) {
          // On snow: split input into forward/sideways relative to facing
          // Forward component drives ski velocity fully; sideways is heavily damped (like real skis)
          const fwdDot = _move.x * _forward.x + _move.z * _forward.z;
          const sideDot = _move.x * _right.x + _move.z * _right.z;
          const fwdScale = 5.0;
          const sideScale = 0.8; // skis resist sideways motion
          this.skiVelX += (_forward.x * fwdDot * fwdScale + _right.x * sideDot * sideScale);
          this.skiVelZ += (_forward.z * fwdDot * fwdScale + _right.z * sideDot * sideScale);
        } else {
          const newX = dolly.position.x + _move.x;
          const newZ = dolly.position.z + _move.z;

          const tooSteep = !this.isSwimming && this._isTooSteep(newX, newZ);
          if (this.isSwimming || (!tooSteep && !this._collidesWithTree(newX, newZ))) {
            dolly.position.x = newX;
            dolly.position.z = newZ;
            isMoving = true;
          } else {
            const steepX = !this.isSwimming && this._isTooSteep(newX, dolly.position.z);
            const steepZ = !this.isSwimming && this._isTooSteep(dolly.position.x, newZ);
            if (!steepX && !this._collidesWithTree(newX, dolly.position.z)) {
              dolly.position.x = newX;
              isMoving = true;
            } else if (!steepZ && !this._collidesWithTree(dolly.position.x, newZ)) {
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

      // Directional friction: skis slide freely along travel direction but resist sideways
      const skiSpeed0 = Math.sqrt(this.skiVelX * this.skiVelX + this.skiVelZ * this.skiVelZ);
      if (skiSpeed0 > 0.05) {
        // Decompose velocity into forward (along travel) and lateral (across travel)
        const travelDirX = this.skiVelX / skiSpeed0;
        const travelDirZ = this.skiVelZ / skiSpeed0;
        const fwdVel = this.skiVelX * travelDirX + this.skiVelZ * travelDirZ;
        const latVelX = this.skiVelX - travelDirX * fwdVel;
        const latVelZ = this.skiVelZ - travelDirZ * fwdVel;
        // Lateral bleeds ~10x faster than forward
        const hasInput = Math.abs(lx) > 0.01 || Math.abs(ly) > 0.01;
        const fwdFriction = hasInput ? 0.97 : 0.995;
        const latFriction = 0.88;
        this.skiVelX = travelDirX * fwdVel * fwdFriction + latVelX * latFriction;
        this.skiVelZ = travelDirZ * fwdVel * fwdFriction + latVelZ * latFriction;
      } else {
        this.skiVelX *= 0.95;
        this.skiVelZ *= 0.95;
      }

      // Speed cap
      const skiSpeed = Math.sqrt(this.skiVelX * this.skiVelX + this.skiVelZ * this.skiVelZ);
      const maxSkiSpeed = 10;
      if (skiSpeed > maxSkiSpeed) {
        const scale = maxSkiSpeed / skiSpeed;
        this.skiVelX *= scale;
        this.skiVelZ *= scale;
      }

      // Apply ski velocity (blocked by steep rock)
      this.skiSpeed = skiSpeed;
      if (skiSpeed > 0.01) {
        const newX = dolly.position.x + this.skiVelX * delta;
        const newZ = dolly.position.z + this.skiVelZ * delta;
        if (this._isTooSteep(newX, newZ)) {
          // Bounce off cliff — kill velocity
          this.skiVelX = 0;
          this.skiVelZ = 0;
        } else {
          dolly.position.x = newX;
          dolly.position.z = newZ;
          // Only report "moving" at meaningful speed — prevents footstep sounds when nearly stopped
          if (skiSpeed > 0.3) isMoving = true;
        }
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
      // Smoothly follow ground surface (faster lerp in VR for smoother feel)
      const followRate = inVR ? 18 : 12;
      const targetY = this.currentGroundY;
      dolly.position.y += (targetY - dolly.position.y) * Math.min(1, delta * followRate);
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

        // Cottage collision
        if (chunk.cottagePositions) {
          const cottageR = CONFIG.COTTAGE_COLLISION_RADIUS + playerR;
          const cottageSq = cottageR * cottageR;
          for (const cp of chunk.cottagePositions) {
            const ddx = px - cp.x;
            const ddz = pz - cp.z;
            if (ddx * ddx + ddz * ddz < cottageSq) {
              return true;
            }
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

  /**
   * Check if a position is too steep to walk on (bare rock cliff).
   * Matches the shader's steep rock threshold (normalY < ~0.7).
   */
  _isTooSteep(px, pz) {
    const eps = 0.5;
    const hL = getTerrainHeight(px - eps, pz);
    const hR = getTerrainHeight(px + eps, pz);
    const hD = getTerrainHeight(px, pz - eps);
    const hU = getTerrainHeight(px, pz + eps);
    const sx = (hR - hL) / (2 * eps);
    const sz = (hU - hD) / (2 * eps);
    // Normal Y = 1 / sqrt(sx² + 1 + sz²)
    const normalY = 1 / Math.sqrt(sx * sx + 1 + sz * sz);
    return normalY < 0.78;
  }

  getPlayerPosition() {
    return this.vr.dolly.position;
  }
}
