import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ITEMS } from '../../day-077-hoan-swiper/lib/items.js';

const base = '/day-077-hoan-swiper/';
const itemByName = new Map(ITEMS.map((item) => [item.name, item]));

const pageErrors = new WeakMap();
const externalRequests = new WeakMap();
// CIの実行機はソフトウェア描画で、実3Dの画面は操作1回ごとに約1.3秒かかる。
// 2026-10-27の失敗の記録では、ボタンの押下に最大10.4秒、8分割の移動に14.4秒かかり、15秒の上限を超えた。
// 上限は最悪の実測の3倍に広げる。固まった操作は、引き続きこの上限で検出する。
const actionTimeout = 45_000;
// Raw keyboard/mouse APIs do not use actionTimeout, so bound those calls explicitly.
const inputStep = (title, action) => test.step(title, action, { timeout: actionTimeout });

async function readPlayableItem(page) {
  let item;
  await expect.poll(async () => {
    item = await page.evaluate(() => {
      const button = document.getElementById('btn-checked');
      return {
        name: document.getElementById('item-name')?.textContent.trim() || '',
        enabled: button instanceof HTMLButtonElement && !button.disabled,
      };
    });
    return item.enabled;
  }, { timeout: 5_000 }).toBe(true);
  return item;
}

test.use({
  reducedMotion: 'reduce',
  actionTimeout,
  // Keep DOM/API/source diagnostics without continuously reading back WebGL frames.
  trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
});

test.beforeEach(async ({ page, baseURL }) => {
  const errors = [];
  const external = [];
  pageErrors.set(page, errors);
  externalRequests.set(page, external);

  page.on('pageerror', (error) => errors.push(error.message));
  const origin = new URL(baseURL).origin;
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(`${origin}/`) && !/^(data|blob):/.test(url)) {
      external.push(url);
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
  expect(externalRequests.get(page)).toEqual([]);
});

test('初回のスタート画面から1問練習を開始し、練習クリア後は本編ガイドとX線OFFに進む', async ({ page }) => {
  // Multi-step WebGL scenarios need a separate total budget on software-rendered CI.
  test.setTimeout(90_000);
  await page.goto(base);

  await expect(page.locator('.brand-title')).toHaveText('保安検査スワイパー');
  await expect(page.locator('#start-overlay')).toBeVisible();
  await expect(page.locator('#btn-start-shift')).toBeVisible();
  await expect(page.locator('#btn-start-tutorial')).toBeVisible();
  await expect(page.locator('#inspection-canvas')).toHaveAttribute('data-ready', 'true');

  // 1問練習チュートリアルを起動し、X線透視とコーチバナーを確認
  await page.locator('#btn-start-tutorial').click();
  await expect(page.locator('#start-overlay')).toBeHidden();
  await expect(page.locator('#coach-banner')).toBeVisible();
  await expect(page.locator('#coach-step-badge')).toContainText('おためし練習');
  await expect(page.locator('#coach-text')).toContainText('モバイルバッテリー');
  await expect(page.locator('#item-name')).toHaveText('モバイルバッテリー');
  await expect(page.locator('#btn-xray-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#xray-telemetry')).toBeVisible();

  // 練習問題を左（機内持ち込み）へ仕分けてクリア
  await page.locator('[data-action="carry_on"]').click();
  await expect(page.locator('#feedback-banner')).toHaveClass(/is-correct/);
  await expect(page.locator('#feedback-badge')).toContainText('練習クリア');
  await expect(page.locator('#coach-step-badge')).toContainText('第1問ガイド');

  await expect(page.locator('#btn-xray-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('本編シフトでX線透視をONとOFFに切り替え、内部構造の説明を表示する', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(base);
  await expect(page.locator('#inspection-canvas')).toHaveAttribute('data-ready', 'true');
  await page.locator('#btn-start-shift').click();

  // X線透視ボタンのON/OFF切り替えを確認
  await expect(page.locator('#btn-xray-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#btn-xray-toggle').click();
  await expect(page.locator('#btn-xray-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#xray-telemetry')).toBeVisible();
  await page.locator('#btn-xray-toggle').click();
  await expect(page.locator('#btn-xray-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('本編シフトの正解でコンボが増え、続くキーボード誤答で理由とコンボ解除を示す', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(base);
  await expect(page.locator('#inspection-canvas')).toHaveAttribute('data-ready', 'true');
  await page.locator('#btn-start-shift').click();

  // 本番1問目の品名を読み取り、正解の方向へ仕分ける
  const { name: firstName } = await readPlayableItem(page);
  const firstItem = itemByName.get(firstName);
  expect(firstItem, `Unknown item: ${firstName}`).toBeTruthy();

  const correctAction = firstItem.allowed[0];
  await page.locator(`[data-action="${correctAction}"]`).click();

  await expect(page.locator('#feedback-banner')).toHaveClass(/is-correct/);
  await expect(page.locator('#feedback-badge')).toContainText('正解');
  await expect(page.locator('#hud-combo')).toHaveText('×1');

  // 2問目をキーボードでわざと誤答させる
  const { name: secondName } = await readPlayableItem(page);
  const secondItem = itemByName.get(secondName);
  expect(secondItem).toBeTruthy();

  const wrongAction = ['carry_on', 'checked', 'prohibited'].find((a) => !secondItem.allowed.includes(a));
  const keyMap = { carry_on: 'ArrowLeft', checked: 'ArrowUp', prohibited: 'ArrowRight' };
  await inputStep('キーボードで誤答を送る', () => page.keyboard.press(keyMap[wrongAction]));

  await expect(page.locator('#feedback-banner')).toHaveClass(/is-wrong/);
  await expect(page.locator('#feedback-badge')).toContainText('ミス');
  await expect(page.locator('#hud-combo')).toHaveText('×0');
});

test('厳選10問・研修シフトを完走するとリザルト・復習リスト・自己ベストが更新される', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(base);

  await page.locator('#mode-training').click();
  await page.locator('#btn-start-shift').click();
  await expect(page.locator('#hud-progress-label')).toHaveText('PROGRESS');
  await expect(page.locator('#hud-timer')).toHaveText('1 / 10');

  for (let i = 0; i < 10; i += 1) {
    const { name } = await readPlayableItem(page);
    const item = itemByName.get(name);
    expect(item).toBeTruthy();
    // 1問目だけわざと間違え、残り9問は正解させる
    const action =
      i === 0
        ? ['carry_on', 'checked', 'prohibited'].find((a) => !item.allowed.includes(a))
        : item.allowed[0];
    const keyMap = { carry_on: 'ArrowLeft', checked: 'ArrowUp', prohibited: 'ArrowRight' };
    await inputStep(`第${i + 1}問のキー入力`, () => page.keyboard.press(keyMap[action]));
  }

  await expect(page.locator('#result-panel')).toBeVisible();
  await expect(page.locator('#result-grade')).toHaveText('A');
  await expect(page.locator('#result-heading')).toBeFocused();
  await expect(page.locator('#result-accuracy')).toContainText('9 / 10 (90%)');
  await expect(page.locator('#best-training-score')).toHaveText('9');
  await expect(page.locator('#review-heading')).toContainText('今回まちがえた荷物（1件）');
  await expect(page.locator('.review-item-card.is-mistake')).toHaveCount(1);

  // リロードしても自己ベストが保持されていること
  await page.reload();
  await expect(page.locator('#best-training-score')).toHaveText('9');
});

test('手荷物ルール早見図鑑タブでカテゴリ絞り込み・検索・公式リンク集が機能する', async ({ page }) => {
  await page.goto(base);

  await page.locator('#tab-catalog').click();
  await expect(page.locator('#panel-catalog')).toBeVisible();
  await expect(page.locator('.catalog-card')).toHaveCount(36);

  // カテゴリ「電池・電子機器」で絞り込み
  await page.locator('.cat-chip', { hasText: '電池・電子機器' }).click();
  const batteryCount = await page.locator('.catalog-card').count();
  expect(batteryCount).toBeGreaterThanOrEqual(6);
  expect(batteryCount).toBeLessThan(36);

  // 「すべて」に戻してキーワード「ヘアアイロン」で検索
  await page.locator('.cat-chip', { hasText: 'すべて' }).click();
  await page.locator('#catalog-search').fill('ヘアアイロン');
  await expect(page.locator('.catalog-card')).toHaveCount(3);

  // 公式リンクが安全属性付きで配置されていること
  const officialLinks = page.locator('.official-link-card');
  await expect(officialLinks).toHaveCount(6);
  for (let i = 0; i < 6; i += 1) {
    await expect(officialLinks.nth(i)).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(officialLinks.nth(i)).toHaveAttribute('target', '_blank');
  }
});

test('3原則ガイドダイアログの開閉、効果音トグル、4画面幅での横スクロール溢れゼロを満たす', async ({ page }) => {
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `Horizontal overflow at ${width}px`).toBe(false);
  }

  // ガイドダイアログの開閉
  await page.locator('#guide-open-btn').click();
  await expect(page.locator('#guide-dialog')).toBeVisible();
  await page.locator('#guide-ok-btn').click();
  await expect(page.locator('#guide-dialog')).toBeHidden();

  // 効果音トグルの切り替え
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'true');
});


test('実3Dの視点・X線が切り替わり、キャンセルしたドラッグは回答せず、スワイプで搬送される', async ({ page }) => {
  // 遅い実行機では、ここまでの操作だけで約60秒かかる。操作の上限（45秒）より長く取る。
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  const canvas = page.locator('#inspection-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page.locator('#btn-start-shift').click();
  await expect(canvas).toHaveAttribute('data-view', 'close');
  await page.locator('#btn-camera').click();
  await expect(canvas).toHaveAttribute('data-view', 'overview');
  await page.locator('#btn-xray-toggle').click();
  await expect(canvas).toHaveAttribute('data-xray', 'true');
  const area = await canvas.boundingBox();
  const x = area.x + area.width / 2;
  const y = area.y + area.height / 2;
  await inputStep('キャンセル用ドラッグの開始位置へ移動', () => page.mouse.move(x, y));
  await inputStep('キャンセル用ドラッグを開始', () => page.mouse.down());
  await inputStep('キャンセル用ドラッグを移動', () => page.mouse.move(x + 100, y));
  await page.locator('#security-tray').dispatchEvent('pointercancel', { pointerId: 1 });
  await inputStep('キャンセル用ドラッグを離す', () => page.mouse.up());
  await expect(page.locator('#hud-timer')).toHaveText('1 / 10');
  await inputStep('スワイプの開始位置へ移動', () => page.mouse.move(x, y));
  await inputStep('スワイプを開始', () => page.mouse.down());
  // 分割1回ごとに描画を1回待つ。途中の移動を挟む判定は保ったまま、待つ描画を8回から4回に減らす。
  await inputStep('スワイプを移動', () => page.mouse.move(x - 100, y, { steps: 4 }));
  await inputStep('スワイプを離す', () => page.mouse.up());
  await expect(page.locator('#hud-timer')).toHaveText('2 / 10');
  await expect(canvas).toHaveAttribute('data-last-action', 'carry_on');
  await expect(canvas).toHaveAttribute('data-xray', 'false');
});

test('描画APIの故障時も仕分け・結果が進行し、再読み込みボタンが操作できる', async ({ page }) => {
  // Exercise the recovery boundary after a renderer is created, not only a failed import.
  await page.route('**/lib/scene.js', async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const injected = original.replace('function sort(action, correct) {', 'function sort(action, correct) { throw new Error("injected renderer fault");');
    expect(injected).not.toEqual(original);
    await route.fulfill({ response, body: injected });
  });
  await page.goto(base);
  await expect(page.locator('#inspection-canvas')).toHaveAttribute('data-ready', 'true');
  await page.locator('#btn-start-shift').click();
  await page.locator('#btn-checked').click();
  await expect(page.locator('#scene-error')).toBeVisible();
  await expect(page.locator('#hud-timer')).toHaveText('2 / 10');
  await expect(page.locator('#item-counter-badge')).toHaveText('ITEM #02');
  await page.locator('#btn-scene-retry').click();
  await expect(page.locator('#start-overlay')).toBeVisible();
  await expect(page.locator('#hud-timer')).toHaveText('開始前');
});

test('タッチスワイプも同じ判定へつながり、モバイルのガイドに名前がある', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(baseURL + base);
  await page.locator('#btn-start-tutorial').click();
  await expect(page.locator('#guide-open-btn')).toHaveAccessibleName('遊び方と手荷物の3原則ガイド');
  const tray = page.locator('#security-tray');
  await tray.dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', clientX: 200, clientY: 400, button: 0 });
  await tray.dispatchEvent('pointermove', { pointerId: 11, pointerType: 'touch', clientX: 100, clientY: 400 });
  await tray.dispatchEvent('pointerup', { pointerId: 11, pointerType: 'touch', clientX: 100, clientY: 400 });
  await expect(page.locator('#feedback-badge')).toContainText('練習クリア');
  await context.close();
});

test('60秒タイマーはスタートから進み、図鑑とガイドで一時停止し復帰後に完了する', async ({ page }) => {
  // Other scenarios exercise WebGL. Keep virtual-time playback independent of GPU frame speed.
  await page.route('**/lib/scene.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `export function createInspectionScene(canvas, {onReady} = {}) { canvas.dataset.ready='true'; onReady?.(); return {showItem(){},setXray(){},setView(){},setActive(){},setDrag(){},sort(){},dispose(){}}; }` }));
  await page.clock.install();
  await page.goto(base);
  await page.locator('#mode-rush').click();
  await expect(page.locator('#start-overlay')).toBeVisible();
  await page.locator('#btn-start-shift').click();
  await expect(page.locator('#hud-timer')).toHaveText('1:00');
  await page.clock.runFor(5_000);
  await expect(page.locator('#hud-timer')).toHaveText('0:55');
  await page.locator('#btn-checked').click();
  await page.clock.runFor(3_000);
  await expect(page.locator('#hud-timer')).toHaveText('0:52');
  await page.locator('#tab-catalog').click();
  await page.clock.fastForward('00:10');
  await page.locator('#tab-game').click();
  await expect(page.locator('#hud-timer')).toHaveText('0:52');
  await page.clock.runFor(2_000);
  await expect(page.locator('#hud-timer')).toHaveText('0:50');
  await page.locator('#guide-open-btn').click();
  await page.clock.fastForward('00:10');
  await page.locator('#guide-ok-btn').click();
  await expect(page.locator('#hud-timer')).toHaveText('0:50');
  // runFor invokes every timer callback; fastForward deliberately skips intermediate intervals.
  await page.clock.runFor(50_100);
  await expect(page.locator('#result-panel')).toBeVisible();
  await expect(page.locator('#hud-timer')).toHaveText('0:00');
});


test('スマホの初回画面内から研修を開始できる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  const button = page.locator('#btn-start-shift');
  await expect(button).toBeInViewport();
  await button.click();
  await expect(page.locator('#start-overlay')).toBeHidden();
  await expect(page.locator('#hud-timer')).toHaveText('1 / 10');
});


test('本番のCSPを適用しても3DとX線を表示できる', async ({ page }) => {
  const headers = readFileSync(new URL('../../dist/_headers', import.meta.url), 'utf8');
  const block = headers.split('/day-077-hoan-swiper/*')[1].split('\n\n')[0];
  const policy = block.split('\n').find(line => line.includes('Content-Security-Policy:')).trim().replace('Content-Security-Policy: ', '');
  await page.route('**/day-077-hoan-swiper/', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  await page.goto(base);
  await expect(page.locator('#inspection-canvas')).toHaveAttribute('data-ready', 'true');
  await page.locator('#btn-start-shift').click();
  await page.locator('#btn-xray-toggle').click();
  await expect(page.locator('#inspection-canvas')).toHaveAttribute('data-xray', 'true');
  await expect(page.locator('#scene-error')).toBeHidden();
});


test('低いPC画面とスマホで中央のゲームスタートから明示的に開始する', async ({ page }) => {
  // Isolate the start-screen interaction from GPU availability and frame speed.
  await page.route('**/lib/scene.js', route => route.fulfill({ contentType: 'text/javascript', body: `export function createInspectionScene(canvas, {onReady} = {}) { canvas.dataset.ready='true'; onReady?.(); return {showItem(){},setXray(){},setView(){},setActive(){},setDrag(){},sort(){},dispose(){}}; }` }));
  for (const viewport of [{width:1440,height:700},{width:1280,height:720},{width:768,height:800},{width:390,height:844},{width:360,height:640}]) {
    await page.setViewportSize(viewport);
    await page.goto(base);
    await expect(page.locator('#btn-start-shift')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#btn-start-shift')).toContainText('ゲームスタート');
    await expect(page.locator('#hud-timer')).toHaveText('開始前');
    await inputStep('開始前のキー入力', () => page.keyboard.press('ArrowLeft'));
    await expect(page.locator('#hud-timer')).toHaveText('開始前');
    await page.locator('#btn-start-shift').click();
    await expect(page.locator('#start-overlay')).toBeHidden();
    await expect(page.locator('#hud-timer')).toHaveText('1 / 10');
    await expect(page.locator('#btn-carry-on')).toBeEnabled();
    await page.locator('#btn-carry-on').click();
    await expect(page.locator('#hud-timer')).toHaveText('2 / 10');
  }
});

test('低減モーションと待機中は実WebGLを描き続けず、複数の更新を1フレームにまとめる', async ({ page }) => {
  await page.goto(base);
  await expect(page.locator('#inspection-canvas')).toHaveAttribute('data-ready', 'true');
  const stats = await page.evaluate(async () => {
    const { createInspectionScene } = await import('/day-077-hoan-swiper/lib/scene.js');
    const { ITEMS } = await import('/day-077-hoan-swiper/lib/items.js');
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:-1000px;top:0;width:240px;height:180px';
    document.body.append(canvas);
    let scene;
    const ready = new Promise(resolve => { scene = createInspectionScene(canvas, { reducedMotion: true, onReady: resolve }); });
    const frame = () => new Promise(requestAnimationFrame);
    const settle = async () => { await frame(); await frame(); };
    try {
      scene.showItem(ITEMS[0]);
      await ready;
      await settle();
      const before = scene.getStats().frames;
      await new Promise(resolve => setTimeout(resolve, 150));
      const after = scene.getStats().frames;
      scene.setXray(true);
      scene.setView('close');
      scene.showItem(ITEMS[1]);
      await settle();
      const batched = scene.getStats().frames;
      scene.setActive(false);
      await settle();
      const standby = scene.getStats().frames;
      await new Promise(resolve => setTimeout(resolve, 150));
      return { idle: after - before, batched: batched - after, standby: scene.getStats().frames - standby };
    } finally {
      scene?.dispose();
      canvas.remove();
    }
  });
  expect(stats).toEqual({ idle: 0, batched: 1, standby: 0 });
});
