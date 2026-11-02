// OWNER: integrate
// 統合の E2E：既定の art の表示が描き始める・?view=greybox に戻せる・最初の操作で音が始まり M で消せる・討ち取りから演出を経て結果へ。
import { createRequire } from 'node:module';
import { boot, collectErrors, expect, state, test, waitScreen, type Page } from './fixtures';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs') as { PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Buffer } } } };

/** 表示の準備（シェーダーの先作り）を待つ。機械が混んでいると十数秒かかる。 */
async function waitView(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__viewReady === true || typeof window.__appError === 'string', null, { timeout: 200_000, polling: 200 });
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
}

/** 画面の平均の明るさ（0..1、sRGB の値の平均）。真っ黒でないことを確かめる。 */
async function meanBrightness(page: Page): Promise<number> {
  const png = PNG.sync.read(await page.screenshot());
  let sum = 0;
  const n = png.width * png.height;
  for (let i = 0; i < n; i++) sum += (png.data[i * 4] + png.data[i * 4 + 1] + png.data[i * 4 + 2]) / 3;
  return sum / n / 255;
}

test.describe.configure({ timeout: 300_000 });

test('既定は art の表示：準備ができると描き始め、夜の寺が真っ黒でなく出る', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=3&god=1');
  await waitView(page);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('game')!).opacity)).toBe('1');
  expect(await meanBrightness(page)).toBeGreaterThan(0.04);
  expect((await state(page)).screen).toBe('play');
  expect(errors).toEqual([]);
});

test('?view=greybox で仮の表示に戻せる', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '?view=greybox&autostart=1&seed=3');
  await waitView(page);
  await page.waitForTimeout(500);
  // 仮の表示は暗い南の通りから始まる（平均 0.03 前後）。真っ黒（0）でなければよい
  expect(await meanBrightness(page)).toBeGreaterThan(0.015);
  expect(errors).toEqual([]);
});

test('最初の操作で音が始まり、M で消せる。歩くと足音が鳴る', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=3&god=1');
  expect(await page.evaluate(() => window.__audio!.started)).toBe(false);
  // 本物のキー操作（ブラウザが音を許す操作）
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => window.__audio!.started === true);
  // r08-world: 音の開始はキーの処理の中で立つが、消音の切り替えは次のコマ（handleFlowKeys）で起きる。読む前にその切り替えを待つ
  await page.waitForFunction(() => window.__audio!.muted === true, null, { timeout: 5_000 });
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => window.__audio!.muted === false);
  await page.evaluate(() => window.__input!.down('KeyW'));
  await page.waitForFunction(() => Object.keys(window.__audio!.counts).some((k) => k.startsWith('footstep-')), null, { timeout: 20_000 });
  await page.evaluate(() => window.__input!.up('KeyW'));
  expect(errors).toEqual([]);
});

test('討ち取ると、炎上の演出（太鼓）を経て結果画面に位が出る', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=1&god=1&speed=4');
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyM');
  await page.evaluate(() => window.__game!.win());
  await waitScreen(page, 'finale', 20_000);
  await expect(page.getByTestId('finale')).toBeVisible();
  await waitScreen(page, 'result', 60_000);
  await expect(page.getByTestId('screen-result')).toBeVisible();
  const counts = await page.evaluate(() => window.__audio!.counts);
  expect(counts.taikoBig ?? 0).toBeGreaterThanOrEqual(2);
  expect(counts.slash ?? 0).toBe(1);
  expect(errors).toEqual([]);
});
