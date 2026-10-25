import { expect, test } from '@playwright/test';
import type {} from './harness';

test.beforeEach(async ({ page }) => { await page.goto('/tests/images/harness.html'); await page.waitForFunction(() => !!window.imageHarness); });
test('all nine genuine image format conversions', async ({ page }) => {
  const requests: string[] = []; page.on('request', request => { if (request.method() !== 'GET') requests.push(request.url()); });
  const results = await page.evaluate(() => window.imageHarness.matrix());
  expect(results).toHaveLength(9);
  for (const result of results) { expect(result.actual).toBe(result.format); expect([result.width, result.height]).toEqual([120, 80]); expect(result.size).toBeGreaterThan(0); }
  expect(requests).toEqual([]);
});
test('preset/custom ratios crop or pad with exact dimensions and proper backgrounds', async ({ page }) => {
  const { results, transparent, color } = await page.evaluate(() => window.imageHarness.ratios());
  for (const result of results) expect(result.width! * result.ratio[1]!).toBe(result.height! * result.ratio[0]!);
  expect(transparent[3]).toBe(0);
  expect(Math.abs(color[0]! - 0x12)).toBeLessThan(8); expect(Math.abs(color[1]! - 0x34)).toBeLessThan(8); expect(Math.abs(color[2]! - 0x56)).toBeLessThan(8);
});
test('all eight EXIF orientations are applied once with mirrors preserved', async ({ page }) => {
  const result = await page.evaluate(() => window.imageHarness.orientations());
  const palette = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
  const expected = [[0, 1, 2, 3], [1, 0, 3, 2], [3, 2, 1, 0], [2, 3, 0, 1], [0, 2, 1, 3], [2, 0, 3, 1], [3, 1, 2, 0], [1, 3, 0, 2]];
  for (const item of result) {
    expect([item.width, item.height]).toEqual(item.orientation < 5 ? [120, 80] : [80, 120]);
    expect(item.outputOrientation).toBe(1);
    item.corners.forEach((corner, index) => { const wanted = palette[expected[item.orientation - 1]![index]!]!; for (let c = 0; c < 3; c++) expect(Math.abs(corner[c]! - wanted[c]!)).toBeLessThan(15); });
  }
});
test('PNG fallback becomes genuine WebP through local WASM, retaining alpha', async ({ page }) => {
  const result = await page.evaluate(() => window.imageHarness.nativeFallback());
  expect(result.actual).toBe('webp'); expect(result.mime).toBe('image/webp'); expect(result.alpha).toBe(0);
});
test('real Worker performs validated crop and emits ordered success', async ({ page }) => {
  const result = await page.evaluate(() => window.imageHarness.realWorker());
  expect(result.filter(event => event.type === 'result')).toEqual([expect.objectContaining({ width: 64, height: 80, mime: 'image/png' })]);
  expect(result[result.length - 1]).toMatchObject({ type: 'state', state: 'succeeded' });
});

test('WASM encoder assets load inside the actual dedicated Worker', async ({ page }) => {
  const result = await page.evaluate(() => window.imageHarness.workerWasm());
  expect(result.actual).toBe('webp'); expect(result.mime).toBe('image/webp'); expect([result.width, result.height]).toEqual([120, 80]);
});
