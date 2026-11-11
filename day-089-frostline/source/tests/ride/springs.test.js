import { describe, it, expect } from 'vitest';
import { makeSpring, springTo, springAngleTo, kick, smoothTo, wrapAngle } from '../../src/render/ride/springs.js';

describe('critical springs', () => {
  it('converges monotonically without crossing a stationary target', () => {
    const s = makeSpring(-2); let prev = s.x;
    for (let i = 0; i < 240; i++) {
      expect(springTo(s, 3, 12, 1 / 60)).toBeGreaterThanOrEqual(prev);
      expect(s.x).toBeLessThanOrEqual(3); prev = s.x;
    }
    expect(s.x).toBeCloseTo(3, 8); expect(s.v).toBeCloseTo(0, 8);
  });
  it('has the same analytic result across frame rates', () => {
    const results = [30, 60, 240].map(hz => {
      const s = makeSpring(); for (let i = 0; i < hz; i++) springTo(s, 1, 8, 1 / hz); return s.x;
    });
    expect(results[0]).toBeCloseTo(results[1], 12); expect(results[0]).toBeCloseTo(results[2], 12);
    expect(results[0]).toBeCloseTo(1 - 9 * Math.exp(-8), 12);
  });
  it('stays finite with a one second or enormous step and preserves zero dt', () => {
    const s = makeSpring(); kick(s, 4); springTo(s, 1, 20, 0); expect(s.x).toBe(0); expect(s.v).toBe(4);
    springTo(s, 1, 20, 1); expect(s.x).toBeCloseTo(1, 6);
    springTo(s, 2, 20, 1e100); expect(s.x).toBe(2); expect(s.v).toBe(0);
  });
  it('takes the shortest angular path through the seam', () => {
    const s = makeSpring(179 * Math.PI / 180);
    springAngleTo(s, -179 * Math.PI / 180, 10, 0.1);
    expect(Math.abs(wrapAngle(s.x - Math.PI))).toBeLessThan(Math.PI / 180);
    expect(wrapAngle(5 * Math.PI)).toBeCloseTo(Math.PI, 10);
  });
  it('first order smoothing is frame independent and handles instant response', () => {
    let x = 0; for (let i = 0; i < 60; i++) x = smoothTo(x, 1, 0.2, 1 / 60);
    expect(x).toBeCloseTo(smoothTo(0, 1, 0.2, 1), 12);
    expect(smoothTo(0, 1, 0, 1 / 60)).toBe(1); expect(smoothTo(0, 1, 0.2, 0)).toBe(0);
  });
});
