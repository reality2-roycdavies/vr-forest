import { describe, it, expect } from 'vitest';
import { ShadowUpdateScheduler } from '../js/shadow-scheduler.js';

describe('ShadowUpdateScheduler', () => {
  it('requests an immediate update after construction or reset', () => {
    const scheduler = new ShadowUpdateScheduler();
    expect(scheduler.update(0)).toBe(true);
    expect(scheduler.update(0)).toBe(false);

    scheduler.reset();
    expect(scheduler.update(0)).toBe(true);
  });

  it('updates stationary shadows eight times per second', () => {
    const scheduler = new ShadowUpdateScheduler();
    scheduler.update(0);

    let updates = 0;
    for (let frame = 0; frame < 72; frame++) {
      if (scheduler.update(1 / 72, false)) updates++;
    }

    expect(updates).toBe(8);
  });

  it('updates moving shadows twenty-four times per second', () => {
    const scheduler = new ShadowUpdateScheduler();
    scheduler.update(0);

    let updates = 0;
    for (let frame = 0; frame < 72; frame++) {
      if (scheduler.update(1 / 72, true)) updates++;
    }

    expect(updates).toBe(24);
  });

  it('requests an immediate redraw when scene shadows are invalidated', () => {
    const scheduler = new ShadowUpdateScheduler();
    scheduler.update(0);
    expect(scheduler.update(1 / 100, false)).toBe(false);

    scheduler.invalidate();
    expect(scheduler.update(0, false)).toBe(true);
    expect(scheduler.update(0, false)).toBe(false);
  });

  it('rejects invalid update rates', () => {
    expect(() => new ShadowUpdateScheduler({ staticHz: 0 })).toThrow(RangeError);
    expect(() => new ShadowUpdateScheduler({ movingHz: Infinity })).toThrow(RangeError);
  });
});
