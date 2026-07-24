// Limits expensive shadow-map redraws in XR while keeping them responsive.

const MAX_DELTA = 0.25;

export class ShadowUpdateScheduler {
  constructor({ staticHz = 8, movingHz = 24 } = {}) {
    if (!Number.isFinite(staticHz) || staticHz <= 0 ||
        !Number.isFinite(movingHz) || movingHz <= 0) {
      throw new RangeError('Shadow update rates must be positive finite numbers');
    }

    this.staticInterval = 1 / staticHz;
    this.movingInterval = 1 / movingHz;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.invalidated = true;
  }

  invalidate() {
    this.invalidated = true;
  }

  update(delta, isMoving = false) {
    if (this.invalidated) {
      this.invalidated = false;
      this.elapsed = 0;
      return true;
    }

    const interval = isMoving ? this.movingInterval : this.staticInterval;
    const safeDelta = Number.isFinite(delta)
      ? Math.max(0, Math.min(delta, MAX_DELTA))
      : 0;
    this.elapsed += safeDelta;

    if (this.elapsed + Number.EPSILON < interval) return false;

    // Keep the remainder so non-divisible headset refresh rates still average
    // the requested update frequency rather than drifting slower over time.
    this.elapsed %= interval;
    return true;
  }
}
