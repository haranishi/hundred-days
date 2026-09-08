import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// draftはbuildの対象外。実行前にDay 033をローカルのdistへコピーする（README参照）。
const APP = '/day-033-did-it-shake/';
const LIST = JSON.parse(readFileSync(new URL('../../apps/day-033-did-it-shake/tests/fixtures/jma-list-2026-09-08.json', import.meta.url)));
const ENDPOINT = 'https://www.jma.go.jp/bosai/quake/data/list.json';
const PATTERN = '**://www.jma.go.jp/bosai/quake/data/list.json';
const NIGHT = new Date('2026-09-08T23:50:00+09:00');
const AKITA = { latitude: 39.72, longitude: 140.10 };
const consoleErrors = new WeakMap();
const tolerated = new WeakMap();
const requests = new WeakMap();

test.beforeEach(async ({ page }) => {
  const urls = [];
  requests.set(page, urls);
  page.on('request', (request) => urls.push(request.url()));
  const errors = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  const origin = new URL(page.url()).origin;
  for (const url of requests.get(page) ?? []) {
    if (new URL(url).origin !== origin) expect(url).toBe(ENDPOINT);
  }
  const skip = tolerated.get(page);
  const errors = (consoleErrors.get(page) ?? []).filter((text) => !skip?.test(text));
  expect(errors, `コンソールにエラーが出ている: ${errors.join(' / ')}`).toEqual([]);
});
async function stubList(page, { status = 200, body = LIST } = {}) {
  const calls = { count: 0, urls: [] };
  await page.route(PATTERN, async (route) => {
    calls.count++;
    calls.urls.push(route.request().url());
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}
async function openAt(page, at = NIGHT) {
  await page.clock.setFixedTime(at);
  await page.goto(APP);
}
async function pick(page, pref = '秋田県', code = '05201') {
  await page.locator('#pick-place').click();
  await expect(page.locator('#place-dialog')).toBeVisible();
  await page.locator('#pref-select').selectOption(pref);
  await page.locator('#town-select').selectOption(code);
  await page.locator('#place-confirm').click();
  await expect(page.locator('#place-dialog')).toBeHidden();
}
async function savePlace(page, code, mode = 'picked') {
  await page.addInitScript(({ code, mode }) => {
    localStorage.setItem('day-033-did-it-shake', JSON.stringify({ code, mode }));
  }, { code, mode });
}

test('起動時に1回取得し、場所なしで全国の答えと7回が出る。地点は遅延取得', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  const calls = await stubList(page);
  await openAt(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'none');
  await expect(page.locator('#answer')).toHaveText('10分前、地震がありました');
  await expect(page.locator('#answer-sub')).toContainText('熊本県天草・芦北地方 M2.6・最大震度1');
  await expect(page.locator('#today-count')).toHaveText('7');
  await expect(page.locator('#place-name')).toHaveText('場所');
  await expect(page.locator('#place-hint')).toBeVisible();
  expect(calls.count).toBe(1);
  expect(requests.some((url) => url.endsWith('/data/places.json'))).toBe(false);
  await pick(page);
  expect(requests.some((url) => url.endsWith('/data/places.json'))).toBe(true);
  const origin = new URL(page.url()).origin;
  expect(requests.filter((url) => new URL(url).origin !== origin)).toEqual([ENDPOINT]);
});
test('上天草市を選ぶと揺れましたに変わり、再取得しない', async ({ page }) => {
  const calls = await stubList(page); await openAt(page);
  await pick(page, '熊本県', '43212');
  await expect(page.locator('#answer')).toHaveText('揺れました');
  await expect(page.locator('#answer')).toHaveAttribute('data-kind', 'shook');
  await expect(page.locator('#your-intensity')).toHaveText('あなたの街は震度1');
  await expect(page.locator('#fine-print')).toBeHidden();
  await expect(page.locator('#your-town')).toContainText('その前にあなたの街で揺れたのは');
  await expect(page.locator('#place-hint')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'picked');
  expect(calls.count).toBe(1);
});
test('秋田市では観測なし、最後は8月27日04:21・震度1', async ({ page }) => {
  await stubList(page); await openAt(page); await pick(page);
  await expect(page.locator('#answer')).toHaveText('あなたの街では、観測されていません');
  await expect(page.locator('#fine-print')).toBeVisible();
  await expect(page.locator('#your-town')).toContainText('あなたの街で最後に揺れたのは 8月27日 04:21（震度1・三陸沖 M6.1）');
});
test('20時には未来の発表を見せない', async ({ page }) => {
  await stubList(page); await openAt(page, new Date('2026-09-08T20:00:00+09:00')); await pick(page);
  await expect(page.locator('#answer')).toHaveText('15分以内の発表はありません');
  await expect(page.locator('#answer-note')).toContainText('最後の地震：3時間前 宮城県沖 M3.6');
  await expect(page.locator('#answer-sub')).toContainText('発表は揺れてから1〜5分');
});
for (const [time, kind, heading, sub] of [
  ['02:05', 'shook-pref', '揺れました（第一報）', '市区町村ごとの発表を待っています'],
  ['02:07', 'shook', '揺れました', '茨城県南部 M5.9・最大震度5弱']
]) {
  test(`${time}の水戸市は${kind}`, async ({ page }) => {
    await stubList(page); await savePlace(page, '08201');
    await openAt(page, new Date(`2026-08-23T${time}:00+09:00`));
    await expect(page.locator('#answer')).toHaveAttribute('data-kind', kind);
    await expect(page.locator('#answer')).toHaveText(heading);
    await expect(page.locator('#answer-sub')).toContainText(sub);
    if (kind === 'shook') await expect(page.locator('#your-intensity')).toHaveText('あなたの街は震度4');
    else {
      await expect(page.locator('#answer-sub')).toContainText('茨城県');
      await expect(page.locator('#your-intensity')).toBeHidden();
    }
  });
}
test('02:07でも秋田市は観測なし', async ({ page }) => {
  await stubList(page); await savePlace(page, '05201');
  await openAt(page, new Date('2026-08-23T02:07:00+09:00'));
  await expect(page.locator('#answer')).toHaveAttribute('data-kind', 'elsewhere');
});
test('20秒未満の連打は取得せず、確認秒数を更新。20秒ちょうどで取得する', async ({ page }) => {
  const calls = await stubList(page); await openAt(page);
  await expect(page.locator('#ready')).toBeVisible();
  for (const seconds of [0, 5, 19]) {
    await page.clock.setFixedTime(new Date(NIGHT.getTime() + seconds * 1000));
    await page.locator('#check').click();
    await expect(page.locator('#checked-at')).toHaveText(`${seconds}秒前に確認（発表 23:43）`);
    expect(calls.count).toBe(1);
  }
  await page.clock.setFixedTime(new Date(NIGHT.getTime() + 20000));
  await page.locator('#check').click();
  await expect(page.locator('#checked-at')).toHaveText('0秒前に確認（発表 23:43）');
  expect(calls.count).toBe(2);
});
test('現在地は秋田市あたり。座標を保存せず、再読み込みでも場所が残る', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']); await context.setGeolocation(AKITA);
  const calls = await stubList(page); await openAt(page);
  await page.locator('#use-location').click();
  await expect(page.locator('#place-name')).toHaveText('現在地（秋田市あたり）');
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'current');
  expect(calls.count).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('day-033-did-it-shake')))).toEqual({ code: '05201', mode: 'current' });
  await page.reload();
  await expect(page.locator('#place-name')).toHaveText('現在地（秋田市あたり）');
});
test('選んだ場所が残り、外すと未設定になる', async ({ page }) => {
  await stubList(page); await openAt(page); await pick(page); await page.reload();
  await expect(page.locator('#place-name')).toHaveText('秋田県秋田市');
  await page.locator('#clear-place').click();
  await expect(page.locator('#place-name')).toHaveText('場所');
  await expect(page.locator('#your-town')).toBeHidden();
  await expect(page.locator('#fine-print')).toBeHidden();
  await page.reload(); await expect(page.locator('#app')).toHaveAttribute('data-place', 'none');
});
test('現在地を断っても全国の答えを保ち、市区町村から選べる', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_, fail) => fail({ code: 1 }) } });
  });
  await stubList(page); await openAt(page); await page.locator('#use-location').click();
  await expect(page.locator('#geo-note')).toContainText('現在地の利用が許可されませんでした');
  await expect(page.locator('#answer')).toHaveAttribute('data-kind', 'recent');
  await pick(page); await expect(page.locator('#place-name')).toHaveText('秋田県秋田市');
});
test('エラーからもう一度で復帰する', async ({ page }) => {
  tolerated.set(page, /Failed to load resource.*503/);
  const calls = await stubList(page, { status: 503, body: {} }); await openAt(page);
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toContainText('発表が取れません');
  await page.unroute(PATTERN); await stubList(page); await page.locator('#retry').click();
  await expect(page.locator('#ready')).toBeVisible(); expect(calls.count).toBe(1);
});
test('形が違えば専用の理由を出す', async ({ page }) => {
  await stubList(page, { body: {} }); await openAt(page);
  await expect(page.locator('#error-text')).toHaveText('発表の形が変わったようです');
});
test('空の一覧はempty。押し直しも20秒未満は再取得しない', async ({ page }) => {
  const calls = await stubList(page, { body: [] }); await openAt(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#empty')).toContainText('発表の一覧が空でした');
  await page.locator('#empty-retry').click(); expect(calls.count).toBe(1);
});
test('帯24コマと9段階の凡例、直近10件の表', async ({ page }) => {
  await stubList(page); await openAt(page);
  await expect(page.locator('#strip .strip-cell')).toHaveCount(24);
  await expect(page.locator('#strip')).toHaveAttribute('aria-label', '24時間で7回。最大は21:02の震度2');
  await expect(page.locator('#legend .legend__item')).toHaveCount(9);
  await expect(page.locator('#strip-peak')).toHaveText('この24時間の最大：震度2（21:02）');
  await expect(page.locator('#legend')).toContainText('5弱');
  await page.locator('#recent > summary').click();
  await expect(page.locator('#recent-body tr')).toHaveCount(10);
  await expect(page.locator('#recent-body tr').first()).toContainText('23:40');
});
test('押せるものは44px以上、いま揺れた？は56px以上。dialogも確認', async ({ page }) => {
  await stubList(page); await openAt(page); await pick(page);
  expect((await page.locator('#check').boundingBox()).height).toBeGreaterThanOrEqual(56);
  for (const target of await page.locator('button:visible, summary:visible').all()) {
    const box = await target.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#pick-place').click();
  for (const target of await page.locator('#place-dialog button, #place-dialog select').all()) {
    const box = await target.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#place-cancel').click();
});
for (const width of [390, 768, 1200]) {
  test(`幅${width}pxで表もdialogも横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 }); await stubList(page); await openAt(page); await pick(page);
    await page.locator('#recent > summary').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.locator('#pick-place').click();
    const box = await page.locator('#place-dialog').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
  });
}
test('動きを減らす設定では見出しを動かさない', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await stubList(page); await openAt(page);
  await page.locator('#check').click();
  expect(await page.locator('#answer').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
});
test('出典と但し書きをエラー時にも常設する', async ({ page }) => {
  await stubList(page, { body: {} }); await openAt(page);
  const foot = page.locator('.site-foot');
  await expect(foot).toContainText('気象庁の発表そのものではありません。身の安全にかかわる判断は公式の情報で');
  await expect(foot).toContainText('を加工して作成'); await expect(foot).toContainText('公共データ利用規約（第1.0版）');
  await expect(foot).toContainText('緊急地震速報・津波情報は扱いません');
});
test('遅い応答ではloadingが出て、取得中のボタンは押せない', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(PATTERN, async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST) });
  });
  await openAt(page);
  await expect(page.locator('#loading')).toBeVisible();
  await expect(page.locator('#check')).toBeDisabled();
  release();
  await expect(page.locator('#ready')).toBeVisible();
  await expect(page.locator('#check')).toBeEnabled();
});
test('結果の投稿ボタンは回数と答えをXの投稿画面へ渡す', async ({ page }) => {
  await page.addInitScript(() => {
    window.open = (url) => { document.documentElement.dataset.postUrl = url; return null; };
  });
  await stubList(page); await openAt(page); await pick(page, '熊本県', '43212');
  await page.locator('#post-result').click();
  const url = new URL(await page.locator('html').getAttribute('data-post-url'));
  expect(url.origin + url.pathname).toBe('https://x.com/intent/post');
  expect(url.searchParams.get('text')).toBe('『揺れた？』きょう日本で震度1以上の地震は7回。揺れました。あなたの街は震度1');
});
test('dialogをEscapeで閉じると場所は変わらず、開いたボタンに戻る', async ({ page }) => {
  await stubList(page); await openAt(page);
  await page.locator('#pick-place').click();
  await expect(page.locator('#place-dialog')).toBeVisible();
  // select に焦点があると Escape が select 自身に食われることがあるので、ボタンに焦点を置いてから押す
  await page.locator('#place-cancel').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#place-dialog')).toBeHidden();
  await expect(page.locator('#pick-place')).toBeFocused();
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'none');
});
