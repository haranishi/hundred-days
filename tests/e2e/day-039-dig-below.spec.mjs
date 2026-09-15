import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const APP = '/day-039-dig-below/';
const fixture = (name) => JSON.parse(readFileSync(new URL(`../../apps/day-039-dig-below/tests/fixtures/${name}.json`, import.meta.url)));
const tokyo = fixture('colls-tokyo'), occs = fixture('occs-tokyo');
const failures = new WeakMap();
test.beforeEach(async ({ page, context }) => {
  failures.set(page, []);
  page.on('pageerror', (e) => failures.get(page).push(e.message));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 35.6812, longitude: 139.7671 });
  // 外部通信はすべて止める。地図は同梱MapLibreで空のスタイルを描く。
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    // 本物のタイルと同じく、提供元の帰属を持つソースを1つ置く（帰属が出ることを検証するため）
    // 本物のタイルと同じく、提供元の帰属を持つソースを1つ置き、それを使う層も置く
    // （MapLibre は層から参照されているソースの帰属しか出さない）
    if (url.hostname === 'tiles.openfreemap.org') return route.fulfill({ json: { version: 8, sources: { openmaptiles: { type: 'raster', tiles: [`${url.origin.replace(url.host, '127.0.0.1:4173')}/tile/{z}/{x}/{y}.png`], tileSize: 256, attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } }, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e2e5dc' } }, { id: 'tiles', type: 'raster', source: 'openmaptiles', paint: { 'raster-opacity': 0 } }] } });
    return route.abort();
  });
});
test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });
async function stub(page, handler) {
  await page.route('**paleobiodb.org/data1.2/**', async (route) => {
    if (handler) return handler(route);
    return route.fulfill({ json: route.request().url().includes('/colls/') ? tokyo : occs });
  });
}
async function credits(page) {
  for (const text of ['PBDB（CC0）', '国際層序委員会（ICS）', 'OpenFreeMap']) await expect(page.locator('.sources')).toContainText(text);
  // 帰属は地図の上（MapLibreの常設表示）と出典欄の2か所。言い換えずそのまま出す
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
  await expect(page.locator('.sources')).toContainText('OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
}
async function start(page) { await page.goto(APP); await page.getByRole('button', { name: '現在地から探す', exact: true }).click(); }
test('空状態は地図で開始でき、出典と地図帰属が常設', async ({ page }) => {
  await stub(page); await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#map canvas')).toBeVisible();
  await credits(page);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenFreeMap');
});
test('読み込み中は柱の骨組みを表示し、地図は使える', async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await stub(page, async (route) => { await pending; return route.fulfill({ json: tokyo }); });
  await start(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'loading');
  await expect(page.locator('#skeleton')).toBeVisible();
  await expect(page.locator('#map canvas')).toBeVisible();
  await credits(page); release();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
});
test('東京の答えは操作より上、4層を同じ画面で展開し距離・出典を表示', async ({ page }) => {
  await stub(page); await start(page);
  await expect(page.locator('#answer')).toBeVisible();
  const a = await page.locator('#answer').boundingBox(), b = await page.locator('#picker').boundingBox();
  expect(a.y + a.height).toBeLessThan(b.y);
  await expect(page.locator('#answer-text')).toContainText('km先で見つかった');
  await expect(page.locator('#answer-text')).not.toContainText('真下');
  await expect(page.locator('.layer')).toHaveCount(4);
  const url = page.url();
  await page.locator('.layer summary').first().click();
  await expect(page.locator('.layer').first()).toHaveAttribute('open', '');
  await expect(page.locator('.layer-details').first()).toContainText('出典論文');
  await expect(page.locator('.layer-details').first()).toContainText('km先で見つかった記録');
  expect(page.url()).toBe(url);
  await credits(page);
});
test('PBDB失敗は最上部、再試行で復帰する', async ({ page }) => {
  let broken = true;
  await stub(page, (r) => broken ? r.abort() : r.fulfill({ json: r.request().url().includes('/colls/') ? tokyo : occs }));
  await start(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  const a = await page.locator('#failure').boundingBox(), b = await page.locator('#picker').boundingBox();
  expect(a.y + a.height).toBeLessThan(b.y);
  await expect(page.locator('#results')).toBeHidden();
  await credits(page);
  broken = false; await page.locator('#retry').click();
  await expect(page.locator('#answer')).toBeVisible();
});
test('記録なしは3段で停止し推測の距離を出さない', async ({ page }) => {
  const urls = [];
  await stub(page, (r) => { urls.push(r.request().url()); return r.fulfill({ json: fixture('colls-empty') }); });
  await start(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'none');
  await expect(page.locator('#no-records')).toContainText('およそ700km四方に記録がありませんでした');
  expect(urls.length).toBe(3);
  expect(urls.every((u) => u.includes('/colls/'))).toBe(true);
  await credits(page);
});
test('地図タップから検索でき、高知は9層・等間隔', async ({ page, context }) => {
  await context.setGeolocation({ latitude: 33.5597, longitude: 133.5311 });
  await stub(page, (r) => r.fulfill({ json: fixture(r.request().url().includes('/colls/') ? 'colls-kochi' : 'occs-kochi') }));
  await start(page);
  await expect(page.locator('.layer')).toHaveCount(9);
  const heights = await page.locator('.layer summary').evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);
  await page.locator('#map canvas').click({ position: { x: 400, y: 150 } });
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
});
test('375pxでも横にはみ出さず、キーボードで層を開ける', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await stub(page); await start(page);
  await expect(page.locator('.layer')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.layer summary').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.layer').first()).toHaveAttribute('open', '');
});
test('現在地拒否でも地図の中心から検索できる', async ({ page }) => {
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_, fail) => fail({ code: 1 }); });
  await stub(page); await start(page);
  await expect(page.locator('#failure')).toContainText('現在地の利用が許可されていません');
  await page.locator('#pick-center').click();
  await expect(page.locator('#answer')).toBeVisible();
});
test('選び直し後に古い応答が返っても結果を上書きしない', async ({ page }) => {
  let first = true;
  await stub(page, async (r) => {
    if (first) { first = false; await new Promise((resolve) => setTimeout(resolve, 400)); }
    await r.fulfill({ json: r.request().url().includes('/colls/') ? tokyo : occs });
  });
  await start(page);
  await page.locator('#pick-center').click();
  await expect(page.locator('#answer')).toBeVisible();
  await expect(page.locator('.layer')).toHaveCount(4);
});
