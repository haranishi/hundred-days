import { test, expect } from '@playwright/test';
const path = '/day-044-train-here/';
const api = '**/api/day-044/trains';
const unconfigured = route => route.fulfill({ status: 503, json: { code: 'NOT_CONFIGURED' } });
const scene = page => page.locator('#scene-canvas');
async function demo(page) { await page.locator('#mode-button').click(); await expect(scene(page)).toHaveAttribute('data-rendered-trains', '48'); }
async function select(page, id = 'demo-yamanote-0') {
  if (!await page.locator('#routes-panel').evaluate(e => e.open)) await page.locator('#routes-panel summary').click();
  await page.locator('#train-picker').selectOption(id);
  await expect(scene(page)).toHaveAttribute('data-camera-mode', 'follow');
}
test.beforeEach(async ({ page }) => {
  // 実API・認証情報は使わない。描画は実際のWebGLを使う。
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(api, unconfigured);
  await page.goto(path);
  await expect(scene(page)).toHaveAttribute('data-render-state', 'ready', { timeout: 20000 });
});
test('初期状態から48編成の架空デモと明示し、最初からやり直せる', async ({ page }) => {
  await expect(page.locator('#mode-label')).toHaveText('3Dデモ · 架空の運行');
  await expect(scene(page)).toHaveAttribute('data-rendered-trains', '48');
  expect(Number(await scene(page).getAttribute('data-draw-calls'))).toBeGreaterThan(20);
  await demo(page);
  await expect(page.locator('#demo-disclaimer')).toBeVisible();
  await expect(page.locator('#mode-label')).toHaveText('3Dデモ · 架空の運行');
  await select(page);
  await page.locator('#mode-button').click();
  await expect(scene(page)).toHaveAttribute('data-rendered-trains', '48');
  await expect(page.locator('#train-detail')).toBeHidden();
  await expect(page.locator('#playback')).toBeVisible();
});
test('列車の追跡・前方の風景・地区への移動・全景復帰が動く', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await demo(page);
  const initial = await scene(page).getAttribute('data-camera');
  await select(page);
  await expect(scene(page)).not.toHaveAttribute('data-camera', initial);
  await expect(page.locator('#detail-kind')).toContainText('架空');
  await page.locator('#ride-train').click();
  await expect(scene(page)).toHaveAttribute('data-camera-mode', 'ride');
  await page.locator('[data-view=shinjuku]').click();
  await expect(scene(page)).toHaveAttribute('data-camera-mode', 'free');
  await expect(page.locator('[data-view=shinjuku]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#reset-camera').click();
  await expect(page.locator('[data-view=city]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#clear-selection').click(); await expect(page.locator('#train-detail')).toBeHidden();
});
test('ドラッグで回転すると追跡が解除され、選択は維持する', async ({ page }) => {
  await demo(page); await select(page);
  const before = await scene(page).getAttribute('data-camera');
  await page.mouse.move(700, 400); await page.mouse.down();
  await page.mouse.move(850, 450, { steps: 8 }); await page.mouse.up();
  await expect(scene(page)).toHaveAttribute('data-camera-mode', 'free');
  await expect(scene(page)).not.toHaveAttribute('data-camera', before);
  await expect(page.locator('#train-detail')).toBeVisible();
});
test('路線の非表示は線路・編成・選択に反映し、全非表示から復帰できる', async ({ page }) => {
  await demo(page); await select(page);
  await page.locator('[data-route=yamanote]').click();
  await expect(scene(page)).toHaveAttribute('data-rendered-trains', '32');
  await expect(page.locator('#train-detail')).toBeHidden();
  for (const id of ['chuo', 'sobu', 'keihin', 'saikyo']) await page.locator('[data-route=' + id + ']').click();
  await expect(scene(page)).toHaveAttribute('data-rendered-trains', '0'); await expect(page.locator('#empty-routes')).toBeVisible();
  await page.locator('[data-route=chuo]').click();
  await expect(scene(page)).toHaveAttribute('data-rendered-trains', '8');
  await expect(page.locator('#empty-routes')).toBeHidden();
});
test('動きを減らす設定では静止し、明示再生・速度変更・一時停止できる', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await demo(page);
  await expect(page.locator('#play-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#demo-clock')).toHaveText('00:00');
  // OSのネイティブ選択メニューに依存しないキーボード選択経路。
  await page.locator('#train-picker').focus(); await page.keyboard.press('Tab');
  await expect(page.locator('#next-train')).toBeFocused(); await page.keyboard.press('Space');
  await expect(page.locator('#train-detail')).toBeVisible();
  await expect(page.locator('#train-picker')).toHaveValue('demo-yamanote-0');
  await page.keyboard.press('Enter'); await expect(page.locator('#train-picker')).toHaveValue('demo-yamanote-1');
  await page.locator('[data-speed="6"]').click(); await page.locator('#play-pause').click();
  await expect(page.locator('#demo-clock')).not.toHaveText('00:00', { timeout: 8000 });
  await page.locator('#play-pause').click();
  await page.waitForTimeout(600); const clock = await page.locator('#demo-clock').textContent();
  await page.waitForTimeout(600); await expect(page.locator('#demo-clock')).toHaveText(clock);
});
test('拡大縮小・回転・ラベルの表示切替をボタンで操作できる', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const id of ['zoom-in', 'zoom-out', 'rotate-left']) {
    const before = await scene(page).getAttribute('data-camera');
    await page.locator('#' + id).click(); await expect(scene(page)).not.toHaveAttribute('data-camera', before);
  }
  await page.locator('#toggle-labels').click();
  await expect(page.locator('#city-labels span:visible')).toHaveCount(0);
  await page.locator('#toggle-labels').click(); await expect(page.locator('#city-labels span:visible').first()).toBeVisible();
});
test('公開版はAPI・外部データを要求せず、実在ランドマークも表示しない', async ({ page }) => {
  const requests = [];
  page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType())) requests.push(request.url()); });
  await page.reload(); await expect(scene(page)).toHaveAttribute('data-rendered-trains', '48');
  await demo(page); await select(page); await page.locator('#info-button').click();
  await expect(page.locator('#info-dialog')).toContainText('実データの取得や配信はしません');
  await expect(page.locator('#info-dialog')).toContainText('Wikidata');
  await page.waitForTimeout(1500);
  expect(requests).toEqual([]);
  await expect(page.locator('#city-labels')).not.toContainText('東京タワー');
  await expect(page.locator('#city-labels')).not.toContainText('東京スカイツリー');
});
test('WebGL非対応・コンテキスト喪失を利用者へ説明する', async ({ page }) => {
  await scene(page).evaluate(el => el.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.locator('#fatal-screen')).toBeVisible();
  await expect(page.locator('#fatal-message')).toContainText('3D描画が一時的に停止');
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) { return kind.startsWith('webgl') ? null : original.call(this, kind, ...args); };
  });
  await page.reload(); await expect(page.locator('#fatal-screen')).toBeVisible();
  await expect(page.locator('#reload-page')).toBeVisible();
});
test('タッチ端末でデモ・列車選択・前方視点を使える', async ({ browser, baseURL, page: desktopPage }) => {
  await desktopPage.close();
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await context.route(api, unconfigured); const page = await context.newPage(); await page.goto(path);
  await expect(scene(page)).toHaveAttribute('data-render-state', 'ready', { timeout: 20000 });
  await page.locator('#mode-button').tap(); await select(page);
  await page.locator('#ride-train').tap(); await expect(scene(page)).toHaveAttribute('data-camera-mode', 'ride');
  await page.locator('#clear-selection').tap(); await expect(page.locator('#train-detail')).toBeHidden();
  await context.close();
});
for (const width of [390, 768, 1440]) test(width + 'pxで3D・操作・説明・共有を確認する', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await demo(page);
  await page.screenshot({ path: '.drafts/day044-release/' + width + '-overview.png' });
  await select(page); await expect(page.locator('#train-detail')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '.drafts/day044-release/' + width + '-follow.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.locator('#info-button').click(); await expect(page.locator('#info-dialog')).toBeVisible();
  await expect(page.locator('#share')).toContainText('LINE');
  await page.keyboard.press('Escape'); await expect(page.locator('#info-dialog')).toBeHidden();
  expect(errors).toEqual([]);
});
