// Motion-aware WebXR viewport scaling with missed-frame hysteresis.

const MIN_SCALE = 0.50;
const WALK_SCALE = 0.65;
const SPRINT_SCALE = 0.55;
const HEAD_MOTION_SCALE = 0.78;
const HEAD_MOTION_THRESHOLD = 0.35; // radians/second
const HEAD_MOTION_HOLD = 0.35;      // seconds
const MISS_RATIO = 1.5;
const MISS_SCORE_TRIGGER = 2;
const LOAD_PENALTY_STEP = 0.05;
const MAX_LOAD_PENALTY = 0.20;
const RECOVERY_DELAY = 2.5;
const RECOVERY_RATE = 0.02;         // scale/second after the delay

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function validOrientation(q) {
  return q && Number.isFinite(q.x) && Number.isFinite(q.y) &&
    Number.isFinite(q.z) && Number.isFinite(q.w);
}

export class XRQualityController {
  constructor() {
    this.reset();
  }

  reset() {
    this.scale = 1.0;
    this.targetScale = 1.0;
    this.loadPenalty = 0;
    this.missScore = 0;
    this.stableTime = 0;
    this.headAngularSpeed = 0;
    this.headMotionHold = 0;
    this.previousOrientation = null;
    this.motionState = 'static';
  }

  _updateHeadMotion(orientation, delta) {
    if (!validOrientation(orientation)) {
      this.headAngularSpeed *= Math.max(0, 1 - delta * 8);
      this.headMotionHold = Math.max(0, this.headMotionHold - delta);
      return this.headMotionHold > 0;
    }

    if (this.previousOrientation) {
      const p = this.previousOrientation;
      const dot = Math.abs(
        p.x * orientation.x + p.y * orientation.y +
        p.z * orientation.z + p.w * orientation.w
      );
      const angle = 2 * Math.acos(clamp(dot, 0, 1));
      const instantaneousSpeed = angle / Math.max(delta, 1 / 240);
      const blend = Math.min(1, delta * 12);
      this.headAngularSpeed += (instantaneousSpeed - this.headAngularSpeed) * blend;
    }

    this.previousOrientation = {
      x: orientation.x,
      y: orientation.y,
      z: orientation.z,
      w: orientation.w,
    };

    if (this.headAngularSpeed > HEAD_MOTION_THRESHOLD) {
      this.headMotionHold = HEAD_MOTION_HOLD;
    } else {
      this.headMotionHold = Math.max(0, this.headMotionHold - delta);
    }
    return this.headMotionHold > 0;
  }

  _updateLoadPenalty(delta, refreshRate) {
    const safeRate = clamp(refreshRate || 72, 60, 144);
    const frameBudget = 1 / safeRate;
    const missedFrame = delta > frameBudget * MISS_RATIO;

    if (missedFrame) {
      this.missScore += 1;
      this.stableTime = 0;
    } else {
      // An isolated hitch decays away; repeated misses accumulate and trigger.
      this.missScore = Math.max(0, this.missScore - delta * 2);
      this.stableTime += delta;
    }

    if (this.missScore >= MISS_SCORE_TRIGGER) {
      this.loadPenalty = Math.min(MAX_LOAD_PENALTY, this.loadPenalty + LOAD_PENALTY_STEP);
      this.missScore = 0;
      this.stableTime = 0;
    } else if (this.stableTime > RECOVERY_DELAY && this.loadPenalty > 0) {
      this.loadPenalty = Math.max(0, this.loadPenalty - delta * RECOVERY_RATE);
    }

    return missedFrame;
  }

  update({
    delta,
    refreshRate = 72,
    isMoving = false,
    isSprinting = false,
    orientation = null,
    recommendedScale = null,
  }) {
    const safeDelta = clamp(delta || 0, 0, 0.1);
    const headMoving = this._updateHeadMotion(orientation, safeDelta);
    const missedFrame = this._updateLoadPenalty(safeDelta, refreshRate);

    let motionScale;
    if (isSprinting) {
      this.motionState = 'sprint';
      motionScale = SPRINT_SCALE;
    } else if (isMoving) {
      this.motionState = 'walk';
      motionScale = WALK_SCALE;
    } else if (headMoving) {
      this.motionState = 'head';
      motionScale = HEAD_MOTION_SCALE;
    } else {
      this.motionState = 'static';
      motionScale = 1.0;
    }

    const runtimeScale = Number.isFinite(recommendedScale)
      ? clamp(recommendedScale, MIN_SCALE, 1.0)
      : 1.0;
    this.targetScale = Math.max(
      MIN_SCALE,
      Math.min(motionScale, runtimeScale) - this.loadPenalty
    );

    // Resolution drops quickly to protect latency, but recovers slowly enough
    // that the transition is not distracting in the headset.
    const rate = this.targetScale < this.scale ? 8 : 1.5;
    this.scale += (this.targetScale - this.scale) * Math.min(1, safeDelta * rate);
    this.scale = clamp(this.scale, MIN_SCALE, 1.0);

    return {
      scale: this.scale,
      targetScale: this.targetScale,
      loadPenalty: this.loadPenalty,
      motionState: this.motionState,
      headAngularSpeed: this.headAngularSpeed,
      missedFrame,
    };
  }
}
