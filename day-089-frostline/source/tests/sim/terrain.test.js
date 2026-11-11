import { it, expect } from 'vitest';
import { plane, circular, parabola, wave, kicker } from './terrains.js';
import * as v from '../../src/sim/vec.js';
it('plane supports arbitrary slope and downhill direction', () => {
  const t = plane(Math.PI / 6, Math.PI / 2), out = {};
  t.sampleSurface(4, 0, out);
  expect(out.h).toBeCloseTo(-4 / Math.sqrt(3), 12);
  expect(out.nx).toBeCloseTo(0.5, 12); expect(out.ny).toBeCloseTo(Math.sqrt(3) / 2, 12);
  expect(t.curvatureAlong(4, 0, 1, 0)).toBe(0);
});
it('circular hill and valley have constant section curvature', () => {
  for (const k of [-0.05, 0.05]) for (const x of [-4, 0, 5]) expect(circular(k).curvatureAlong(x, 0, 1, 0)).toBeCloseTo(k, 12);
});
it('uses normal curvature on a cross-sloping surface', () => {
  expect(parabola(0.05, 0.8).curvatureAlong(0, 0, 1, 0)).toBeCloseTo(0.05 / Math.sqrt(1.64), 12);
});
it('wave and kicker normals and curvatures agree with analytic derivatives', () => {
  for (const t of [wave(), kicker()]) {
    const h = 1e-4, x = 0.3, z = 0.1, out = {};
    t.sampleSurface(x, z, out);
    const hx = (t.heightAt(x + h, z) - t.heightAt(x - h, z)) / (2 * h);
    const hxx = (t.heightAt(x + h, z) - 2 * t.heightAt(x, z) + t.heightAt(x - h, z)) / (h * h);
    expect(-out.nx / out.ny).toBeCloseTo(hx, 7);
    expect(t.curvatureAlong(x, z, 1, 0)).toBeCloseTo(hxx * out.ny / (1 + hx * hx), 6);
  }
});
it('vector operations alias safely and transport preserves length', () => {
  const a = { x: 1, y: 0, z: 0 }, n = { x: 0, y: 1, z: 0 }, b = { x: 0, y: 0.8, z: 0.6 };
  expect(v.cross(a, n, a)).toBe(a); expect(a.z).toBe(1);
  v.transport(a, n, b, a); expect(v.length(a)).toBeCloseTo(1, 12); expect(v.dot(a, b)).toBeCloseTo(0, 12);
  v.normalize({ x: 0, y: 0, z: 0 }, a); expect(v.length(a)).toBe(0);
});
