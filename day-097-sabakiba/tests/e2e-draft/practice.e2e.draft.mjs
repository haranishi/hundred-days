import { test, expect } from '@playwright/test';

async function enterPractice(page) {
  await page.getByTestId('btn-practice').click();
  await expect(page.locator('.practice-status')).toHaveText('緑の丸から、朱色の線に沿って、一筆でなぞります。');
  // 練習に切り替わった後の盤の寸法とカメラで位置を読みます。
  const guide = await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__sabaki.practiceGuide();
  });
  expect(guide).toBeTruthy();
  expect(guide.points.length).toBeGreaterThan(1);
  return guide;
}

async function traceGuide(page, { start, points }) {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    distances.push(distances[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = distances.at(-1), duration = 1500;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // 実際に経過した時間から進む距離を決め、描画が遅いフレームでも一筆の速さを保ちます。
  const began = performance.now();
  let segment = 1;
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 20));
    const elapsed = Math.min(duration, performance.now() - began);
    const arc = total * elapsed / duration;
    while (segment < points.length - 1 && distances[segment] <= arc) segment++;
    const a = points[segment - 1], b = points[segment];
    const length = distances[segment] - distances[segment - 1];
    const u = length ? (arc - distances[segment - 1]) / length : 1;
    await page.mouse.move(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
    if (elapsed === duration) break;
  }
  await page.mouse.up();
}

test.describe('幅390pxのアジ手順4・なぞって練習', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html?debug=1&freeze=1#/fish/aji/4');
    await page.waitForSelector('body[data-ready="true"]');
    await page.evaluate(() => window.__sabaki.goto('aji', 3, 0.5));
  });

  test('朱色の線を一筆でなぞると92点以上になります', async ({ page }) => {
    await traceGuide(page, await enterPractice(page));
    const result = page.getByTestId('practice-result');
    await expect(result).toBeVisible();
    expect(Number(await result.locator('.result-score strong').textContent())).toBeGreaterThanOrEqual(92);
    await expect(result.locator('.result-grade')).toContainText('ランク S');
  });

  test('始点の60px横で押すと緑の丸を案内し、そのまま線へ動かしても採点しません', async ({ page }) => {
    const { start, end } = await enterPractice(page);
    const status = page.locator('.practice-status');
    await page.mouse.move(start.x + 60, start.y);
    await page.mouse.down();
    await expect(status).toHaveText('線の始まり（緑の丸）に触れてから、そのまま引きます。');
    await page.mouse.move(start.x, start.y);
    await page.mouse.move(end.x, end.y);
    await page.mouse.up();
    await expect(page.getByTestId('practice-result')).toHaveCount(0);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await expect(status).toContainText('なぞっています');
    await page.mouse.up();
  });

  test('手の印と札は練習中に隠れ、ガイドに戻ると再表示します', async ({ page }) => {
    const pins = page.locator('.fish-pin--hand:visible'), tags = page.locator('.fish-tag--hand:visible');
    await expect(tags.first()).toBeVisible();
    await enterPractice(page);
    await expect(pins).toHaveCount(0); await expect(tags).toHaveCount(0);
    await page.getByTestId('btn-practice-exit').click();
    await expect(pins.first()).toBeVisible(); await expect(tags.first()).toBeVisible();
    expect(await page.evaluate(() => window.__sabaki.practiceGuide())).toBeNull();
  });

  test('魚の輪郭の外にある始点の3px上からも一筆を始められます', async ({ page }) => {
    const { start, points } = await enterPractice(page);
    await page.mouse.move(start.x, start.y - 3);
    await page.mouse.down();
    await expect(page.locator('.practice-status')).toContainText('なぞっています');
    const next = points[Math.floor(points.length / 2)];
    await page.mouse.move(next.x, next.y);
    await page.mouse.up();
    await expect(page.getByTestId('practice-result')).toBeVisible();
  });
});
