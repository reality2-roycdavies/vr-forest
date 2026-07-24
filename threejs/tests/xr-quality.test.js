import { describe, it, expect } from 'vitest';
import { XRQualityController } from '../js/xr-quality.js';

function orientation(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function tick(controller, overrides = {}) {
  return controller.update({
    delta: 1 / 72,
    refreshRate: 72,
    orientation: orientation(0),
    ...overrides,
  });
}

describe('XRQualityController', () => {
  it('keeps full resolution while stationary and within frame budget', () => {
    const controller = new XRQualityController();
    for (let i = 0; i < 120; i++) tick(controller);
    expect(controller.scale).toBeCloseTo(1, 5);
    expect(controller.motionState).toBe('static');
  });

  it('uses the existing walking and sprinting quality profiles', () => {
    const walking = new XRQualityController();
    for (let i = 0; i < 120; i++) tick(walking, { isMoving: true });
    expect(walking.targetScale).toBe(0.65);
    expect(walking.scale).toBeCloseTo(0.65, 3);

    const sprinting = new XRQualityController();
    for (let i = 0; i < 120; i++) tick(sprinting, { isMoving: true, isSprinting: true });
    expect(sprinting.targetScale).toBe(0.55);
    expect(sprinting.scale).toBeCloseTo(0.55, 3);
  });

  it('treats headset rotation as motion even without locomotion', () => {
    const controller = new XRQualityController();
    tick(controller, { orientation: orientation(0) });
    const result = tick(controller, { orientation: orientation(0.08) });
    expect(result.motionState).toBe('head');
    expect(result.targetScale).toBe(0.78);
  });

  it('ignores one isolated hitch but reacts to repeated missed frames', () => {
    const controller = new XRQualityController();
    tick(controller);
    tick(controller, { delta: 1 / 30 });
    expect(controller.loadPenalty).toBe(0);
    tick(controller, { delta: 1 / 30 });
    tick(controller, { delta: 1 / 30 });
    expect(controller.loadPenalty).toBeCloseTo(0.05, 5);
  });

  it('recovers load penalty only after a stable delay', () => {
    const controller = new XRQualityController();
    tick(controller, { delta: 1 / 30 });
    tick(controller, { delta: 1 / 30 });
    expect(controller.loadPenalty).toBeCloseTo(0.05, 5);

    for (let i = 0; i < 72 * 2; i++) tick(controller);
    expect(controller.loadPenalty).toBeCloseTo(0.05, 3);
    for (let i = 0; i < 72 * 2; i++) tick(controller);
    expect(controller.loadPenalty).toBeLessThan(0.05);
  });

  it('honours a lower runtime-recommended viewport scale', () => {
    const controller = new XRQualityController();
    const result = tick(controller, { recommendedScale: 0.7 });
    expect(result.targetScale).toBe(0.7);
  });

  it('reset clears session-specific motion and load history', () => {
    const controller = new XRQualityController();
    tick(controller, { delta: 1 / 30 });
    tick(controller, { delta: 1 / 30 });
    controller.reset();
    expect(controller.scale).toBe(1);
    expect(controller.loadPenalty).toBe(0);
    expect(controller.previousOrientation).toBeNull();
  });
});
