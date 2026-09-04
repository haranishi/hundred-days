import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const APP = '/day-028-one-drop-tree/';
const STORAGE_NAME = 'day028.tree.v1';
const FIXED = new Date('2026-09-04T09:00:00+09:00');
const consoleErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(FIXED);
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page), 'コンソールエラーが発生した').toEqual([]);
});

function savedRecord({ seed = 280904, plantedOn = '2026-08-20', wateredDays = ['2026-09-03'] } = {}) {
  return { v: 1, seed, plantedOn, wateredDays, updatedAt: '2026-09-03T00:00:00.000Z' };
}

function datesEndingOn(end, count) {
  const last = new Date(`${end}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(last);
    date.setUTCDate(last.getUTCDate() - (count - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

async function installRecord(page, record) {
  await page.addInitScript(({ name, value }) => localStorage.setItem(name, JSON.stringify(value)), { name: STORAGE_NAME, value: record });
}

async function open(page, state) {
  await page.goto(APP);
  if (state) await expect(page.locator('#app')).toHaveAttribute('data-state', state);
}

const activeId = (page) => page.evaluate(() => document.activeElement?.id ?? '');

test.describe('Day 028 ひとしずくの木', () => {
  test('最初は種で、鉢・見出し・水やり・約束が見える', async ({ page }) => {
    await open(page, 'seed');
    await expect(page.locator('#plant')).toBeVisible();
    await expect(page.locator('#plant')).toHaveAttribute('aria-label', '鉢に植えた種');
    await expect(page.getByRole('heading', { name: 'ひとしずくの木' })).toBeVisible();
    await expect(page.locator('#status')).toHaveText('まだ種です。水をあげると芽が出ます');
    await expect(page.locator('#age')).toBeHidden();
    await expect(page.locator('#water')).toHaveText('水をあげる');
    await expect(page.locator('#message')).toHaveText('');
    await expect(page.locator('#seed-note')).toHaveText('成長を見る・画像で保存は、芽が出ると使えます');
    await expect(page.locator('#seed-note')).toBeVisible();
    await expect(page.locator('.privacy')).toContainText('木は端末の中だけで育ちます');
  });

  test('種の状態ではやり直しカードが無い', async ({ page }) => {
    await open(page, 'seed');
    await expect(page.locator('#reset')).toBeHidden();
  });

  test('最初の水やりで芽が出て今日のボタンが無効になる', async ({ page }) => {
    await open(page, 'seed');
    await page.locator('#water').click();
    await expect(page.locator('#app')).toHaveAttribute('data-growing', 'false');
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#status')).toHaveText('水をあげた日 1日');
    await expect(page.locator('#age')).toHaveText('芽が出て 1日目');
    await expect(page.locator('#seed-note')).toBeHidden();
    await expect(page.locator('#water')).toBeDisabled();
    await expect(page.locator('#water')).toHaveText('今日はあげました');
    await expect(page.locator('#message')).toHaveText('芽が出ました。また明日');
    expect(await activeId(page)).toBe('plant');
  });

  test('水やり済みの主ボタンは完了状態の配色になる', async ({ page }) => {
    await installRecord(page, savedRecord({ wateredDays: ['2026-09-04'] }));
    await open(page, 'ready');
    const water = page.locator('#water');
    await expect(water).toBeDisabled();
    await expect(water).toHaveAttribute('data-done', 'true');
    // 色は 180ms の transition で変わるので、自動で待つ toHaveCSS で見る
    await expect(water).toHaveCSS('opacity', '1');
    await expect(water).toHaveCSS('color', 'rgb(35, 95, 60)');
  });

  test('同じ日に二度は押せず日付は1件だけ保存される', async ({ page }) => {
    await open(page, 'seed');
    await page.locator('#water').click();
    await expect(page.locator('#water')).toBeDisabled();
    const stored = await page.evaluate((name) => JSON.parse(localStorage.getItem(name)), STORAGE_NAME);
    expect(stored.wateredDays).toEqual(['2026-09-04']);
  });

  test('翌日は再び押せて枝が増える', async ({ page }) => {
    await installRecord(page, savedRecord({ plantedOn: '2026-09-03', wateredDays: ['2026-09-03'] }));
    await open(page, 'ready');
    const before = await page.locator('#plant').getAttribute('aria-label');
    await page.clock.setFixedTime(new Date('2026-09-05T09:00:00+09:00'));
    await page.reload();
    await expect(page.locator('#water')).toBeEnabled();
    await page.locator('#water').click();
    await expect(page.locator('#app')).toHaveAttribute('data-growing', 'false');
    await expect(page.locator('#status')).toHaveText('水をあげた日 2日');
    await expect(page.locator('#age')).toHaveText('芽が出て 3日目');
    const after = await page.locator('#plant').getAttribute('aria-label');
    expect(Number(after.match(/枝が(\d+)本/)[1])).toBeGreaterThan(Number(before.match(/枝が(\d+)本/)[1]));
  });

  test('再読込しても種と歩数が残る', async ({ page }) => {
    await installRecord(page, savedRecord({ seed: 881, wateredDays: ['2026-09-02', '2026-09-03'] }));
    await open(page, 'ready');
    const label = await page.locator('#plant').getAttribute('aria-label');
    await page.reload();
    await expect(page.locator('#plant')).toHaveAttribute('aria-label', label);
    const stored = await page.evaluate((name) => JSON.parse(localStorage.getItem(name)), STORAGE_NAME);
    expect(stored.seed).toBe(881);
    expect(stored.wateredDays).toHaveLength(2);
  });

  test('6日ぶりの木は水やりで元気になる', async ({ page }) => {
    await installRecord(page, savedRecord({ wateredDays: ['2026-08-29'] }));
    await open(page, 'ready');
    await expect(page.locator('#status')).toHaveText('水をあげた日 1日');
    await expect(page.locator('#age')).toHaveText('芽が出て 16日目');
    await expect(page.locator('#message')).toHaveText('6日ぶりですね。水をあげると元気になります');
    await page.locator('#water').click();
    await expect(page.locator('#app')).toHaveAttribute('data-growing', 'false');
    await expect(page.locator('#message')).toHaveText('新しい葉が出ました。また明日');
  });

  test('未来日に水やり済みなら時計の案内を出して押せない', async ({ page }) => {
    await installRecord(page, savedRecord({ wateredDays: ['2026-09-05'] }));
    await open(page, 'ready');
    await expect(page.locator('#water')).toBeDisabled();
    await expect(page.locator('#status')).toHaveText('水をあげた日 1日');
    await expect(page.locator('#age')).toHaveText('芽が出て 16日目');
    await expect(page.locator('#message')).toHaveText('時計が戻っているようです。また明日');
  });

  test('壊れた保存データは案内して新しい種から始める', async ({ page }) => {
    await page.addInitScript((name) => localStorage.setItem(name, '{bad'), STORAGE_NAME);
    await open(page, 'seed');
    await expect(page.locator('#data-notice')).toBeVisible();
    await expect(page.locator('#water')).toBeEnabled();
  });

  test('localStorage不可でも案内し、その場では育つ', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    });
    await open(page, 'seed');
    await expect(page.locator('#storage-error')).toBeVisible();
    await page.locator('#water').click();
    await expect(page.locator('#app')).toHaveAttribute('data-growing', 'false');
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  });

  test('やり直しは行内確認を経て新しい種にする', async ({ page }) => {
    await installRecord(page, savedRecord({ seed: 100, wateredDays: ['2026-09-03'] }));
    await open(page, 'ready');
    await page.locator('#reset').click();
    await expect(page.locator('#reset-confirm')).toBeVisible();
    expect(await activeId(page)).toBe('reset-no');
    await page.locator('#reset-yes').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'seed');
    expect(await activeId(page)).toBe('water');
    const stored = await page.evaluate((name) => JSON.parse(localStorage.getItem(name)), STORAGE_NAME);
    expect(stored.seed).not.toBe(100);
    expect(stored.wateredDays).toEqual([]);
  });

  test('やり直し確認はEscapeで閉じる', async ({ page }) => {
    await installRecord(page, savedRecord());
    await open(page, 'ready');
    await page.locator('#reset').click();
    await expect(page.locator('#reset-confirm')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#reset-confirm')).toBeHidden();
  });

  test('成長を見る再生中の表示からスキップして通常表示へ戻る', async ({ page }) => {
    await installRecord(page, savedRecord({ wateredDays: ['2026-09-01', '2026-09-02', '2026-09-03'] }));
    await open(page, 'ready');
    await page.locator('#replay').click();
    await expect(page.locator('#app')).toHaveAttribute('data-replaying', 'true');
    await expect(page.locator('#status')).toHaveText(/^再生中 ·/);
    await expect(page.locator('#replay')).toBeEnabled();
    await expect(page.locator('#replay')).toHaveText('スキップ');
    await page.locator('#replay').click();
    await expect(page.locator('#app')).toHaveAttribute('data-replaying', 'false');
    await expect(page.locator('#status')).toHaveText('水をあげた日 3日');
    await expect(page.locator('#age')).toHaveText('芽が出て 16日目');
    await expect(page.locator('#replay')).toHaveText('成長を見る');
  });

  test('390px幅の種の表示枠は幅の0.42倍の高さになる', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, 'seed');
    const box = await page.locator('.canvas-bed').boundingBox();
    expect(Math.abs(box.height - box.width * 0.42)).toBeLessThanOrEqual(2);
  });

  test('1280px幅の種の表示枠は幅の0.72倍の高さになる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, 'seed');
    const box = await page.locator('.canvas-bed').boundingBox();
    expect(Math.abs(box.height - box.width * 0.72)).toBeLessThanOrEqual(2);
  });

  test('390×844の4状態で伝言がファーストビューに入る', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, 'seed');
    const cases = [
      { wateredDays: ['2026-09-03'], message: '今日の一滴を待っています' },
      { wateredDays: ['2026-08-29'], message: '6日ぶりですね。水をあげると元気になります' },
      { wateredDays: ['2026-09-04'], message: '今日の一滴はあげました。また明日' },
      { wateredDays: ['2026-09-05'], message: '時計が戻っているようです。また明日' }
    ];
    for (const item of cases) {
      await page.evaluate(({ name, value }) => localStorage.setItem(name, JSON.stringify(value)), {
        name: STORAGE_NAME,
        value: savedRecord({ wateredDays: item.wateredDays })
      });
      await page.reload();
      const message = page.locator('#message');
      await expect(message).toHaveText(item.message);
      const box = await message.boundingBox();
      expect(box).not.toBeNull();
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
  });

  test('100日の木の表示枠は正方形になる', async ({ page }) => {
    const wateredDays = datesEndingOn('2026-09-04', 100);
    await installRecord(page, savedRecord({ plantedOn: wateredDays[0], wateredDays }));
    await open(page, 'ready');
    const box = await page.locator('.canvas-bed').boundingBox();
    expect(Math.abs(box.height - box.width)).toBeLessThanOrEqual(2);
  });

  test('画像で保存すると1080×1080 PNGになる', async ({ page }) => {
    await installRecord(page, savedRecord());
    await open(page, 'ready');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#save').click()]);
    expect(download.suggestedFilename()).toMatch(/^one-drop-tree-\d{8}\.png$/);
    const image = await readFile(await download.path());
    expect([...image.subarray(1, 4)]).toEqual([80, 78, 71]);
    expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([1080, 1080]);
  });

  test('reduced motionではgrowingにせず即座に育つ', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'seed');
    await page.locator('#water').click();
    await expect(page.locator('#app')).toHaveAttribute('data-growing', 'false');
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  });

  for (const width of [320, 390, 1280]) {
    test(`${width}px幅で横スクロールがない`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, 'seed');
      const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
    });
  }

  test('1200×750で木・状態・水やりが画面内に入る', async ({ page }) => {
    await installRecord(page, savedRecord());
    await page.setViewportSize({ width: 1200, height: 750 });
    await open(page, 'ready');
    for (const selector of ['.canvas-bed', '#status', '#message', '#water']) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(750);
    }
  });

  test('表示中の操作領域は44px以上', async ({ page }) => {
    await installRecord(page, savedRecord());
    await open(page, 'ready');
    const boxes = await page.locator('button').evaluateAll((nodes) => nodes
      .filter((node) => node.offsetParent !== null)
      .map((node) => ({ name: node.id || node.textContent.trim(), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
    for (const box of boxes) {
      expect(box.width, `${box.name} の幅`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${box.name} の高さ`).toBeGreaterThanOrEqual(44);
    }
  });

  test('読み込み後の操作で通信しない', async ({ page }) => {
    await installRecord(page, savedRecord());
    const requests = [];
    const sockets = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('websocket', (socket) => sockets.push(socket.url()));
    await open(page, 'ready');
    requests.length = 0;
    await page.locator('#water').click();
    await expect(page.locator('#app')).toHaveAttribute('data-growing', 'false');
    await page.locator('#reset').click();
    await page.locator('#reset-no').click();
    expect(requests).toEqual([]);
    expect(sockets).toEqual([]);
  });
});
