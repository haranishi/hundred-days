import { describe, expect, it } from 'vitest';
import { ASPECT_PRESETS, DEFAULT_IMAGE_OPTIONS, computePlan, computeSize, validateOptions } from '../../src/features/images/options';
import type { ImageOptions } from '../../src/shared/contracts';

function opts(overrides: Partial<ImageOptions> = {}): ImageOptions { return { ...DEFAULT_IMAGE_OPTIONS, ...overrides }; }
describe('image geometry', () => {
  it('retains the original ratio and does not upscale', () => {
    expect(computeSize(400, 300, { mode: 'fit', maxWidth: 800, maxHeight: 800 })).toEqual({ width: 400, height: 300 });
    expect(computeSize(3, 2, { mode: 'percentage', percent: 1 })).toEqual({ width: 1, height: 1 });
    expect(computeSize(400, 300, { mode: 'fit', maxWidth: 200, maxHeight: 200 })).toEqual({ width: 200, height: 150 });
  });
  it.each(ASPECT_PRESETS)('crops to an exact $label ratio without stretching', ({ width: a, height: b }) => {
    const plan = computePlan(1200, 800, opts({ aspect: { mode: 'crop', width: a, height: b, anchor: { x: 0.5, y: 0.5 } } }));
    expect(plan.width * b).toBe(plan.height * a);
    expect(plan.destination.width / plan.source.width).toBeCloseTo(plan.destination.height / plan.source.height, 10);
    expect(plan.destination.width).toBeLessThanOrEqual(plan.source.width);
    expect(plan.source.x).toBeGreaterThanOrEqual(0);
    expect(plan.source.x + plan.source.width).toBeLessThanOrEqual(1200);
    expect(plan.source.y + plan.source.height).toBeLessThanOrEqual(800);
  });
  it('positions a crop using anchors', () => {
    const plan = computePlan(400, 300, opts({ aspect: { mode: 'crop', width: 1, height: 1, anchor: { x: 1, y: 0 } } }));
    expect(plan).toEqual({ width: 300, height: 300, source: { x: 100, y: 0, width: 300, height: 300 }, destination: { x: 0, y: 0, width: 300, height: 300 } });
  });
  it('pads without upscaling content and supports arbitrary 7:11', () => {
    const plan = computePlan(1200, 800, opts({ aspect: { mode: 'pad', width: 7, height: 11, anchor: { x: 0.5, y: 1 } } }));
    expect(plan.width * 11).toBe(plan.height * 7);
    expect(plan.source).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
    expect(plan.destination.width).toBeLessThanOrEqual(1200);
    expect(plan.destination.x).toBeCloseTo((plan.width - plan.destination.width) / 2);
    expect(plan.destination.y).toBeCloseTo(plan.height - plan.destination.height);
  });
  it('reduces custom ratios before computing integral output', () => {
    expect(computePlan(1920, 1080, opts({ aspect: { mode: 'crop', width: 160, height: 90, anchor: { x: 0.5, y: 0.5 } } })).width).toBe(1920);
  });
  it('limits a padded frame to sixteen million pixels and 8192px', () => {
    const plan = computePlan(8000, 2000, opts({ aspect: { mode: 'pad', width: 9, height: 16, anchor: { x: 0.5, y: 0.5 } } }));
    expect(plan.width * plan.height).toBeLessThanOrEqual(16_000_000);
    expect(Math.max(plan.width, plan.height)).toBeLessThanOrEqual(8192);
    expect(plan.width * 16).toBe(plan.height * 9);
  });
  it('rejects ratios that cannot produce even one integral pixel multiple', () => {
    expect(() => computePlan(1, 1, opts({ aspect: { mode: 'crop', width: 16, height: 9, anchor: { x: 0.5, y: 0.5 } } }))).toThrow(/両立/);
  });
  it.each([0, -1, 1.5, Infinity, NaN, 10001])('rejects invalid ratio %s', width => {
    expect(() => validateOptions(opts({ aspect: { mode: 'crop', width, height: 1, anchor: { x: 0.5, y: 0.5 } } }))).toThrow();
  });
  it('rejects nonfinite settings and out-of-range positions', () => {
    expect(() => computeSize(400, 300, { mode: 'fit', maxWidth: NaN, maxHeight: 200 })).toThrow();
    expect(() => validateOptions(opts({ aspect: { mode: 'crop', width: 1, height: 1, anchor: { x: 1.1, y: 0 } } }))).toThrow();
    expect(() => validateOptions(opts({ quality: 1.1 }))).toThrow();
  });
  it('ignores quality for PNG', () => { expect(validateOptions(opts({ format: 'png', quality: NaN })).format).toBe('png'); });
});
