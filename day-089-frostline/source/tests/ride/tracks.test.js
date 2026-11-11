import { describe, it, expect } from 'vitest';
import { createTrackBuilder } from '../../src/render/ride/track-builder.js';
const point = (x, z = 0, extra = {}) => ({ x, y: 0, z, fx: 0, fz: -1, slip: 0, load: 1, softness: 1, grounded: true, heightAt: () => 0, ...extra });
function width(b, i) { const n = i * 6; return Math.hypot(b.positions[n] - b.positions[n + 3], b.positions[n + 2] - b.positions[n + 5]); }

describe('track ring buffer', () => {
  it('uses the slip width, density and snow heights at both edges', () => {
    const b = createTrackBuilder({ capacity: 8 }); const heightAt = (x, z) => x * 0.1 + z * 0.2;
    for (const slip of [0, Math.PI / 6, Math.PI / 2]) {
      const i = b.head; b.push(point(i, 0, { slip, load: 1.5, softness: 0.4, heightAt }));
      expect(width(b, i)).toBeCloseTo(0.26 + 1.3 * Math.abs(Math.sin(slip)), 6);
      const n = i * 6; expect(b.positions[n + 1]).toBeCloseTo(heightAt(b.positions[n], b.positions[n + 2]) + 0.03, 6);
      expect(b.positions[n + 4]).toBeCloseTo(heightAt(b.positions[n + 3], b.positions[n + 5]) + 0.03, 6);
      expect(b.attrs[i * 4]).toBe(0); expect(b.attrs[i * 4 + 2]).toBe(1); expect(b.attrs[i * 4 + 1]).toBeCloseTo(0.525, 6);
    }
  });
  it('does not write below minStep and uses accumulated displacement', () => {
    const b = createTrackBuilder({ capacity: 4 }); b.push(point(0)); const version = b.version;
    b.push(point(0.1)); b.push(point(0.2)); expect(b.count).toBe(1); expect(b.version).toBe(version);
    b.push(point(0.25)); expect(b.count).toBe(2); expect(b.version).toBe(version + 1);
  });
  it('breaks after air even when the first landed sample is below minStep', () => {
    const b = createTrackBuilder({ capacity: 4 }); b.push(point(0)); b.push(point(0.3));
    b.push(point(1, 0, { grounded: false })); expect(b.count).toBe(2);
    b.push(point(0.31)); b.push(point(0.6)); expect(b.breaks[2]).toBe(1);
    b.push(point(0.9)); expect(b.breaks[3]).toBe(0);
  });
  it('orients width perpendicular to displacement instead of board direction', () => {
    const b = createTrackBuilder({ capacity: 3 }); b.push(point(0)); b.push(point(1));
    expect(b.positions[6]).toBeCloseTo(b.positions[9], 6); expect(Math.abs(b.positions[8] - b.positions[11])).toBeCloseTo(0.26, 6);
  });
  it('retains typed arrays through many wraps and clear, with valid oldest breaks', () => {
    const b = createTrackBuilder({ capacity: 3 }), positions = b.positions, attrs = b.attrs;
    for (let i = 0; i < 100; i++) { b.push(point(i)); expect(b.head).toBe((i + 1) % 3); expect(b.count).toBe(Math.min(i + 1, 3)); }
    expect(b.version).toBe(100); expect(b.breaks[b.head]).toBe(1);
    for (const n of b.positions) expect(Number.isFinite(n)).toBe(true);
    b.clear(); expect(b.head).toBe(0); expect(b.count).toBe(0); expect(b.version).toBe(101);
    expect(b.positions).toBe(positions); expect(b.attrs).toBe(attrs); b.push(point(0)); expect(b.breaks[0]).toBe(1);
  });
  it('validates capacity and supports a single-section ring and stationary samples', () => {
    expect(() => createTrackBuilder({ capacity: 0 })).toThrow();
    const b = createTrackBuilder({ capacity: 1, minStep: 0 }); b.push(point(0)); b.push(point(0)); expect(width(b, 0)).toBeCloseTo(0.26, 6);
  });
});
