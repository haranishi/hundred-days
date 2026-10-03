// OWNER: tests
// 遊びの E2E：自動プレイが3分を完走すること（エラー0・建物が1棟以上崩れる）と、
// 始まる前の重ね・一時停止・撮影モード・やり直し（R の長押しで2秒以内）の画面の流れ。
import { collectErrors, expect, test, type Page } from './fixtures';

async function waitState(page: Page, fn: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction(`(window.__state !== undefined && (${fn})) || typeof window.__appError === 'string'`, null, { timeout, polling: 100 });
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
}

test('自動プレイ（8倍速）が3分を完走し、エラー0で、建物が1棟以上崩れる', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await page.goto('/?playtest=basic&speed=8&q=low');
  await waitState(page, "window.__state.phase === 'result'", 280_000);
  const s = await page.evaluate(() => window.__state!);
  expect(s.timeLeft).toBe(0);
  expect(s.firstCollapseAt).not.toBeNull();
  expect(s.buildings.collapsed + s.buildings.collapsing).toBeGreaterThanOrEqual(1);
  expect(s.events['session.end']).toBe(1);
  await expect(page.getByTestId('result-overlay')).toBeVisible();
  expect(errors).toEqual([]);
});

test('クリックで始まり、Esc で一時停止（時間が止まる）、P で撮影モード（PNG を保存）、R で2秒以内にやり直せる', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?playtest=script&q=low&speed=4');
  await waitState(page, "window.__state.phase === 'playing' && window.__state.t > 0.5");
  // 自動の台本は空（遊びは自動で始まる）。手で急降下と爪を出して街を壊す
  await page.evaluate(() => window.__input!.hold('Shift', 4000));
  await waitState(page, "window.__state.dragon.mode === 'ground'", 30_000);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__input!.tap('right'));
    await page.waitForTimeout(250);
  }
  await waitState(page, 'window.__state.score.yen > 0', 20_000);

  await page.keyboard.press('Escape');
  await waitState(page, "window.__state.phase === 'paused'");
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  const pausedAt = await page.evaluate(() => window.__state!.t);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__state!.t)).toBe(pausedAt);
  await page.evaluate(() => window.__input!.click());
  await waitState(page, "window.__state.phase === 'playing'");

  await page.keyboard.press('KeyP');
  await waitState(page, "window.__state.phase === 'photo'");
  await expect(page.getByTestId('hud')).toBeHidden();
  const photoAt = await page.evaluate(() => window.__state!.t);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window.__lastPhoto?.bytes ?? 0) > 10_000, null, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__state!.t)).toBe(photoAt);
  await page.keyboard.press('KeyP');
  await waitState(page, "window.__state.phase === 'playing'");

  // r02-controls：遊んでいる途中の R は0.8秒の長押し（結果の画面では1回。e2e/controls.spec.ts）
  const started = Date.now();
  await page.keyboard.down('KeyR');
  await waitState(page, "window.__state.phase === 'playing' && window.__state.t < 1 && window.__state.score.yen === 0 && window.__state.buildings.intact === window.__state.buildings.total", 2_000);
  await page.keyboard.up('KeyR');
  expect(Date.now() - started).toBeLessThan(2_000);
  expect(errors).toEqual([]);
});

test('始まる前は街の上空に「クリックで始める」を重ね、クリックで遊びが始まる', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?q=low');
  await waitState(page, "window.__state.phase === 'ready'");
  await expect(page.getByTestId('start-overlay')).toBeVisible();
  await page.getByTestId('start-overlay').click();
  await waitState(page, "window.__state.phase === 'playing'");
  await expect(page.getByTestId('start-overlay')).toBeHidden();
  expect(errors).toEqual([]);
});
