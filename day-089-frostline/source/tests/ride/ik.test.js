import { describe, it, expect } from 'vitest';
import { solveTwoBone } from '../../src/render/ride/ik.js';
const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('two bone IK', () => {
  it('preserves both lengths and bends towards the pole', () => {
    const root = v(), target = v(0, -0.6, 0), mid = v(), end = v();
    expect(solveTwoBone(root, target, v(1, -0.3, 0), 0.44, 0.43, mid, end)).toBeLessThanOrEqual(1);
    expect(dist(root, mid)).toBeCloseTo(0.44, 12); expect(dist(mid, end)).toBeCloseTo(0.43, 12);
    expect(dist(end, target)).toBeCloseTo(0, 12); expect(mid.x).toBeGreaterThan(0);
  });
  it('extends fully towards an unreachable target', () => {
    const mid = v(), end = v(); expect(solveTwoBone(v(), v(0, 0, -3), v(1, 0, 0), 0.4, 0.3, mid, end)).toBeGreaterThan(1);
    expect(mid.z).toBeCloseTo(-0.4, 12); expect(end.z).toBeCloseTo(-0.7, 12);
  });
  it('handles coincident targets, unequal lengths, and collinear poles', () => {
    for (const b of [0.4, 0.2]) {
      for (const target of [v(), v(0, -0.1, 0), v(0, -0.7, 0)]) {
        const mid = v(), end = v(); solveTwoBone(v(), target, v(), 0.4, b, mid, end);
        expect(dist(v(), mid)).toBeCloseTo(0.4, 10); expect(dist(mid, end)).toBeCloseTo(b, 10);
      }
    }
  });
});
