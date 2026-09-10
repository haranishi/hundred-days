import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const APP = '/day-034-tide-now/';
const PATTERN = '**://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/*/*.txt';
const FIXTURES = new Map(['TK-2025', 'TK-2026', 'TK-2027', 'S1-2026'].map((name) => [name, readFileSync(new URL(`../../apps/day-034-tide-now/tests/fixtures/${name}.txt`, import.meta.url), 'utf8')]));
const errors = new WeakMap(), requests = new WeakMap(), httpErrors = new WeakSet();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); requests.set(page, []);
  page.on('request', (r) => requests.get(page).push(r.url()));
  page.on('pageerror', (e) => errors.get(page).push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.get(page).push(m.text()); });
});
test.afterEach(async ({ page }) => {
  const origin = new URL(page.url()).origin;
  for (const url of requests.get(page)) if (new URL(url).origin !== origin) expect(url).toMatch(/^https:\/\/www\.data\.jma\.go\.jp\/kaiyou\/data\/db\/tide\/suisan\/txt\/\d{4}\/[A-Z][A-Z0-9]\.txt$/);
  // 意図的なHTTP404によるブラウザ自身の通知だけを除外。JS例外は除外しない。
  expect(errors.get(page).filter((s) => !(httpErrors.has(page) && /^Failed to load resource:.*404/.test(s)))).toEqual([]);
});
async function stub(page, transform = (_, body) => ({ status: body ? 200 : 404, body: body ?? '' })) {
  const calls = [];
  await page.route(PATTERN, async (route) => {
    const url = new URL(route.request().url()), parts = url.pathname.split('/');
    const year = parts.at(-2), code = parts.at(-1).slice(0, -4);
    calls.push(`${code}-${year}`);
    const response = transform(`${code}-${year}`, FIXTURES.get(`${code}-${year}`));
    if (response.status === 404) httpErrors.add(page);
    await route.fulfill({ contentType: 'text/plain', ...response });
  });
  return calls;
}
async function openAt(page, wall = '2026-09-10T15:00') {
  await page.clock.install({ time: new Date(Date.parse(`${wall}:00+09:00`) - 60000) });
  await page.clock.pauseAt(new Date(`${wall}:00+09:00`));
  await page.goto(APP);
}
async function saved(page, code = 'TK', mode = 'picked') {
  await page.addInitScript(({ code, mode }) => {
    if (!sessionStorage.getItem('tide-test-initialized')) {
      localStorage.setItem('day-034-tide-now', JSON.stringify({ code, mode }));
      sessionStorage.setItem('tide-test-initialized', 'yes');
    }
  }, { code, mode });
}
async function pick(page, pref = '東京都', code = 'TK') {
  await page.locator('#pick-station').click();
  await expect(page.locator('#pref-select option')).toHaveCount(39);
  await page.locator('#pref-select').selectOption(pref);
  await page.locator('#station-select').selectOption(code);
  await page.locator('#station-confirm').click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
}
test('地点なしはpick、潮位表も地点一覧も通信0、東京を選ぶと1本', async ({ page }) => {
  const calls = await stub(page); await openAt(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'pick');
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'none');
  await expect(page.locator('#pick-title')).toHaveText('どこの潮？');
  await expect(page.locator('#use-location')).toHaveText('現在地でいまの潮を見る');
  await expect(page.locator('#pick-station')).toHaveText('地点を選ぶ');
  expect(calls).toEqual([]); expect(requests.get(page).some((u) => u.endsWith('/stations.json'))).toBe(false);
  await pick(page); await expect(page.locator('#answer')).toHaveText('いま、満ち潮'); expect(calls).toEqual(['TK-2026']);
});
for (const [wall, kind, heading, sub, remaining, name, years] of [
  ['2026-09-10T15:00','rising','いま、満ち潮','次の満潮は 16:57（201cm）','あと1時間57分','大潮',['TK-2026']],
  ['2026-09-10T10:45','slack-low','干潮のころ','10:30 が干潮（30cm）','このあと満ち潮に',null,['TK-2026']],
  ['2026-09-10T23:30','rising','いま、満ち潮','次の満潮は あす 04:35（209cm）','あと5時間5分',null,['TK-2026']],
  ['2026-12-31T23:45','falling','いま、引き潮','次の干潮は あす 04:21（95cm）','あと4時間36分','小潮',['TK-2026','TK-2027']],
  ['2026-01-01T00:30','rising','いま、満ち潮','次の満潮は 04:08（169cm）','あと3時間38分','中潮',['TK-2026','TK-2025']]
]) test(`東京 ${wall} の見出しと次の干満`, async ({ page }) => {
  const calls = await stub(page); await saved(page); await openAt(page, wall);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#answer')).toHaveAttribute('data-kind', kind); await expect(page.locator('#answer')).toHaveText(heading);
  await expect(page.locator('#answer-sub')).toHaveText(sub);
  await expect(page.locator('#remaining')).toHaveText(remaining); await expect(page.locator('#remaining')).toBeVisible();
  await expect(page.locator('#remaining')).toHaveCSS('background-color', 'rgb(22, 48, 63)');
  if (name) await expect(page.locator('#tide-name')).toHaveText(name);
  expect(calls).toEqual(years);
  if (wall === '2026-09-10T15:00') {
    await expect(page.locator('#range')).toHaveText('きょうの干満差 171cm（東京では大きい方）');
    await expect(page.locator('#now-level')).toHaveText('いまの潮位 およそ165cm');
    await expect(page.locator('#now-level-note')).toHaveText('推定・潮位表基準面から');
    await expect(page.locator('#station-name')).toHaveText('東京');
    await expect(page.locator('#as-of')).toHaveText('15:00 現在');
    await expect(page.locator('#pick-station')).toHaveText('地点を変える');
    // 見出しカードの中で、地点と時刻が答えより上にある
    const [top, answer] = await Promise.all([page.locator('.headline-top').boundingBox(), page.locator('#answer').boundingBox()]);
    expect(top.y + top.height).toBeLessThanOrEqual(answer.y + 1);
    await expect(page.locator('#curve')).toHaveAttribute('aria-label', '0時から24時の潮位。満潮 03:53 200cm、16:57 201cm。干潮 10:30 30cm、22:53 81cm。いまは15:00、満ち潮');
    await expect(page.locator('#events-today caption')).toHaveText('きょう（9月10日）の満潮・干潮');
    await expect(page.locator('#events-today tbody tr')).toHaveCount(4);
    await expect(page.locator('#events-tomorrow')).toContainText('04:35');
    // 潮位は数字の列なので見出しも中身も右にそろえる
    await expect(page.locator('#events-today thead th').nth(2)).toHaveCSS('text-align', 'right');
    await expect(page.locator('#events-today tbody tr').first().locator('td').nth(2)).toHaveCSS('text-align', 'right');
  }
});
test('1月1日、前年404でも満ち潮で毎時値に切り替わる', async ({ page }) => {
  const calls = await stub(page, (name, body) => ({ status: name === 'TK-2025' ? 404 : 200, body: body ?? '' }));
  await saved(page); await openAt(page, '2026-01-01T00:30');
  await expect(page.locator('#answer')).toHaveAttribute('data-kind', 'rising');
  const line = FIXTURES.get('TK-2026').split('\n')[0], level = Math.round((Number(line.slice(0, 3)) + Number(line.slice(3, 6))) / 2);
  await expect(page.locator('#now-level')).toContainText(`およそ${level}cm`); expect(calls).toEqual(['TK-2026','TK-2025']);
});
test('現在地の秋田、4km・干満差27cm・次の干潮、保存はコードとmodeだけ', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: 39.72, longitude: 140.10 });
  const calls = await stub(page); await openAt(page); await page.locator('#use-location').click();
  await expect(page.locator('#station-name')).toHaveText('現在地 → 秋田（4km）');
  await expect(page.locator('#answer')).toHaveAttribute('data-kind', 'falling');
  await expect(page.locator('#answer-sub')).toHaveText('次の干潮は 21:20（14cm）');
  await expect(page.locator('#remaining')).toHaveText('あと6時間20分');
  await expect(page.locator('#range')).toContainText('きょうの干満差 27cm'); await expect(page.locator('#far-note')).toBeHidden();
  expect(calls).toEqual(['S1-2026']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('day-034-tide-now')))).toEqual({ code: 'S1', mode: 'current' });
  await page.reload(); await expect(page.locator('#station-name')).toContainText('現在地 → 秋田');
  await expect(page.locator('#station-name')).toContainText('距離は現在地で再確認');
});
test('現在地拒否は理由を出しpickのまま、手動で選べる', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_, fail) => fail({ code: 1 }) } }));
  const calls = await stub(page); await openAt(page); await page.locator('#use-location').click();
  await expect(page.locator('#geo-note')).toContainText('現在地の利用が許可されませんでした');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'pick'); expect(calls).toEqual([]); await pick(page);
});
test('50km以上の内陸では但し書きを表示', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: 36.39, longitude: 139.06 });
  await stub(page); await openAt(page); await page.locator('#use-location').click();
  await expect(page.locator('#far-note')).toHaveText('海から離れています。参考程度に'); await expect(page.locator('#far-note')).toBeVisible();
});
test('再読み込みで地点が残り、外すと保存と答えを消す。同じ年は再取得しない', async ({ page }) => {
  const calls = await stub(page); await openAt(page); await pick(page); await page.reload();
  await expect(page.locator('#station-name')).toHaveText('東京'); expect(calls.length).toBe(2);
  await page.locator('#clear-station').click(); await expect(page.locator('#app')).toHaveAttribute('data-state', 'pick');
  expect(await page.evaluate(() => localStorage.getItem('day-034-tide-now'))).toBe(null);
  await pick(page); expect(calls.length).toBe(2);
  await page.locator('#clear-station').click(); await page.reload(); await expect(page.locator('#app')).toHaveAttribute('data-state', 'pick');
});
test('404→error→もう一度で復帰', async ({ page }) => {
  let fail = true;
  const calls = await stub(page, (_, body) => ({ status: fail ? 404 : 200, body })); await saved(page); await openAt(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error'); await expect(page.locator('#error')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#error-text')).toHaveText('東京の潮位表が見つかりません');
  await expect(page.locator('#error-note')).toHaveText('別の地点を選んでください');
  // 回復の導線＝塗りの主ボタンと、リンク風のやり直し
  await expect(page.locator('#pick-station')).toHaveCSS('background-color', 'rgb(22, 48, 63)');
  expect((await page.locator('#pick-station').boundingBox()).height).toBeGreaterThanOrEqual(56);
  await expect(page.locator('#retry')).toHaveText('もう一度読み込む');
  await expect(page.locator('#retry')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect((await page.locator('#retry').boundingBox()).height).toBeGreaterThanOrEqual(44);
  fail = false;
  await page.locator('#retry').click(); await expect(page.locator('#ready')).toBeVisible(); expect(calls.length).toBe(2);
});
test('形が変わった場合の専用エラー', async ({ page }) => {
  await stub(page, () => ({ status: 200, body: 'not a tide table' })); await saved(page); await openAt(page);
  await expect(page.locator('#error-text')).toHaveText('潮位表の形が変わったようです');
  await expect(page.locator('#error-note')).toHaveText('気象庁の配信が変わった可能性があります');
});
test('年は読めてもきょうが無い場合はempty、もう一度はメモリを使う', async ({ page }) => {
  const calls = await stub(page, () => ({ status: 200, body: FIXTURES.get('TK-2025') })); await saved(page); await openAt(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty'); await expect(page.locator('#empty')).toHaveText('きょうの潮位表が見つかりません');
  await page.locator('#retry').click(); await expect(page.locator('#empty')).toBeVisible(); expect(calls.length).toBe(1);
});
test('1分ごとにいまを再計算し通信しない', async ({ page }) => {
  const calls = await stub(page); await saved(page); await openAt(page);
  await expect(page.locator('#as-of')).toHaveText('15:00 現在'); await page.clock.runFor(60000);
  await expect(page.locator('#as-of')).toHaveText('15:01 現在'); await expect(page.locator('#remaining')).toHaveText('あと1時間56分'); expect(calls.length).toBe(1);
});
test('全ボタンとselectは44px以上、pickの主ボタンは56px以上、Escapeとキャンセル', async ({ page }) => {
  await stub(page); await openAt(page);
  expect((await page.locator('#use-location').boundingBox()).height).toBeGreaterThanOrEqual(56);
  for (const phase of ['pick', 'ready', 'dialog']) {
    if (phase === 'ready') await pick(page);
    if (phase === 'dialog') await page.locator('#pick-station').click();
    for (const target of await page.locator('button:visible, select:visible').all()) {
      const box = await target.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
    }
    // リンク風にした「地点を外す」も指で押せる高さを保つ
    if (phase === 'ready') expect((await page.locator('#clear-station').boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#pref-select').focus(); await page.locator('#pref-select').press('Escape');
  await expect(page.locator('#station-dialog')).toBeHidden(); await expect(page.locator('#pick-station')).toBeFocused();
  await page.locator('#pick-station').click(); await page.locator('#station-cancel').click(); await expect(page.locator('#station-dialog')).toBeHidden();
});
for (const width of [390, 768, 1200]) test(`幅${width}pxでpick・答え・表・dialogに横スクロールなし`, async ({ page }) => {
  await page.setViewportSize({ width, height: 780 }); await stub(page); await openAt(page);
  const check = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await check(); await pick(page); await check(); await page.locator('#pick-station').click(); await check();
  const box = await page.locator('#station-dialog').boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
});
test('PC幅のpickは主ボタン・副ボタン・見出しの左端がそろう', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 780 }); await stub(page); await openAt(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'pick');
  const [title, primary, secondary] = await Promise.all([
    page.locator('#pick-title').boundingBox(), page.locator('#use-location').boundingBox(), page.locator('#pick-station').boundingBox()
  ]);
  expect(Math.abs(primary.x - secondary.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(primary.x - title.x)).toBeLessThanOrEqual(1);
  // 主ボタンが先（上）に立つ
  expect(primary.y).toBeLessThan(secondary.y);
});
test('動きを減らす設定では見出しを動かさない', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await stub(page); await saved(page); await openAt(page);
  await expect(page.locator('#ready')).toBeVisible(); expect(await page.locator('#answer').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
});
test('結果の投稿文はアプリ名・東京・次の満潮・大潮とURL', async ({ page }) => {
  await page.addInitScript(() => { window.open = (url) => { document.documentElement.dataset.postUrl = url; return null; }; });
  await stub(page); await saved(page); await openAt(page); await page.locator('#post-result').click();
  const url = new URL(await page.locator('html').getAttribute('data-post-url'));
  expect(url.origin + url.pathname).toBe('https://x.com/intent/post');
  expect(url.searchParams.get('text')).toBe('『潮、いまどっち？』東京：いま、満ち潮。次の満潮は 16:57・201cm（大潮）');
  expect(url.searchParams.get('url')).toContain(APP);
});
test('300ms未満はloadingを出さず、遅い応答でだけ表示', async ({ page }) => {
  let release; const gate = new Promise((resolve) => { release = resolve; });
  await page.route(PATTERN, async (route) => { await gate; await route.fulfill({ contentType: 'text/plain', body: FIXTURES.get('TK-2026') }); });
  await saved(page); await openAt(page); await expect(page.locator('#app')).toHaveAttribute('data-state', 'loading');
  await page.clock.runFor(299); await expect(page.locator('#loading')).toBeHidden();
  await page.clock.runFor(1); await expect(page.locator('#loading')).toBeVisible(); release(); await expect(page.locator('#ready')).toBeVisible();
});
test('出典・推算値・高潮津波の範囲はエラー時も常設', async ({ page }) => {
  await stub(page, () => ({ status: 200, body: 'changed' })); await saved(page); await openAt(page);
  const foot = page.locator('.site-foot');
  for (const text of ['を加工して作成','公共データ利用規約（第1.0版）','実測の潮位ではありません','海の安全にかかわる判断は公式の情報で確認してください','高潮・津波の情報は扱いません','新聞などの潮見表と1日ずれる']) await expect(foot).toContainText(text);
});

for (const side of ['highs', 'lows', 'both']) test(`満干の欠測 ${side} は表に予測なし、両方ならunknown`, async ({ page }) => {
  const lines = FIXTURES.get('TK-2026').trimEnd().split('\n');
  const body = lines.map((line) => {
    const date = line.slice(72, 78);
    if (!['26 9 9', '26 910', '26 911'].includes(date)) return line;
    return line.slice(0, 80) + (side === 'highs' || side === 'both' ? '9999999'.repeat(4) : line.slice(80, 108))
      + (side === 'lows' || side === 'both' ? '9999999'.repeat(4) : line.slice(108));
  }).join('\n');
  await stub(page, () => ({ status: 200, body })); await saved(page); await openAt(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#events-today')).toContainText('予測なし');
  if (side === 'both') {
    await expect(page.locator('#answer')).toHaveAttribute('data-kind', 'unknown');
    await expect(page.locator('#answer-sub')).toHaveText('次の満干が潮位表にありません');
    await expect(page.locator('#remaining')).toBeHidden();
    await expect(page.locator('#now-level')).toContainText('およそ166cm');
  }
});
