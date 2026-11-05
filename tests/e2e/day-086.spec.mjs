import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { createMountedServer } from '../../scripts/serve-mounted.mjs';

const DIR = 'day-086-chakuchiten';
const PATH = `/${DIR}/`;
const center = { latitude: 35.68, longitude: 139.76 };
const position = { lat: center.latitude, lng: center.longitude };
const makePlace = (name, offset, category = 'cafe') => ({ name, lat: position.lat + offset, lng: position.lng, category, address: '試験市 テスト町1-1', licenses: ['CC0-1.0'], attributions: ['自作の試験データ'] });
const places = [
  makePlace('試験カフェ ひと息', .0002), makePlace('試験喫茶 まどべ', .0006), makePlace('試験ベーカリー', .001, 'bakery'),
  makePlace('試験食堂', .0003, 'restaurant'), makePlace('試験定食', .0007, 'restaurant'),
  makePlace('試験居酒屋', .0003, 'bar_izakaya'), makePlace('試験バー', .0008, 'bar_izakaya'),
  makePlace('試験公園', .0003, 'tourism'), makePlace('試験庭園', .0007, 'public_facility'),
  makePlace('薬局は候補外', 0, 'medical'), makePlace('遠方のカフェは候補外', 1),
];
const suggestions = [{ name: '試験駅', address: '試験市 テスト町', category: 'station', ...position }];
const headers = readFileSync('dist/_headers', 'utf8');
const csp = (headers.split(`\n/${DIR}/*\n`)[1] || '').split('\n').find((line) => line.includes('Content-Security-Policy:'))?.trim().replace('Content-Security-Policy: ', '');
const runs = new WeakMap();

test.use({ geolocation: center, permissions: ['geolocation'] });
test.beforeEach(async ({ page }) => {
  expect(csp).toContain('https://api.openpoiapi.com');
  const seen = { errors: [], violations: [], search: [] }; runs.set(page, seen);
  page.on('pageerror', (error) => seen.errors.push(error.message));
  await page.addInitScript(() => {
    window.__day086Violations = [];
    document.addEventListener('securitypolicyviolation', (event) => window.__day086Violations.push(event.violatedDirective));
  });
  await page.route(`**${PATH}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  await page.route('https://api.openpoiapi.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/v1/search') seen.search.push(url);
    await route.fulfill({ json: url.pathname === '/v1/suggest' ? { suggestions } : { results: places } });
  });
});
test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const seen = runs.get(page);
  expect(seen.errors, 'JavaScript exceptions').toEqual([]);
  expect(await page.evaluate(() => window.__day086Violations), 'CSP violations').toEqual([]);
  expect(await page.locator('body').innerText()).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
});
async function open(page, path = PATH) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}
const pick = async (page, text) => page.getByText(text, { exact: true }).click();
async function throughQuestions(page, { companion = 'パートナー', mood = '軽め・お茶したい', space = '静かにゆっくり', walk = 'すぐそこがいい', submit = true } = {}) {
  await pick(page, companion); await page.locator('#companion-next').click();
  await pick(page, mood); await page.locator('#question-next').click();
  await pick(page, space); await page.locator('#question-next').click();
  await pick(page, walk);
  if (submit) await page.locator('#question-next').click();
}
async function selectManual(page) {
  await page.locator('#place-query').fill('試験駅');
  await page.locator('#place-submit').click();
  await page.getByRole('button', { name: /^試験駅/ }).click();
  await expect(page.locator('#location-dialog')).not.toBeVisible();
}

test('開始時は通信せず、同行者を選ぶまで進めない', async ({ page }) => {
  const outside = []; page.on('request', (request) => { if (request.url().startsWith('https://')) outside.push(request.url()); });
  await open(page);
  await expect(page.locator('#companion-next')).toBeDisabled();
  await expect(page.getByRole('radio')).toHaveCount(4);
  expect(outside).toEqual([]);
  await pick(page, '友達'); await expect(page.locator('#companion-next')).toBeEnabled();
});
for (const [mood, title] of [['ガッツリ満腹', '試験食堂'], ['軽め・お茶したい', '試験カフェ ひと息'], ['ちょっと一杯', '試験居酒屋'], ['外でリフレッシュ', '試験公園']]) {
  for (const space of ['静かにゆっくり', '賑やかでもOK']) {
    for (const walk of ['すぐそこがいい', '少し散歩してもいい']) {
      test(`${mood} / ${space} / ${walk} → 現在地の結果と道案内`, async ({ page }) => {
        await open(page); await throughQuestions(page, { mood, space, walk });
        await expect(page.locator('#result-name')).toHaveText(title);
        await expect(page.locator('#result-time')).toContainText('徒歩 約1分');
        const calls = runs.get(page).search;
        expect(calls).toHaveLength(1);
        expect(calls[0].searchParams.get('center')).toBe('139.76,35.68');
        expect(calls[0].searchParams.get('radius')).toBe(walk === 'すぐそこがいい' ? '180' : '600');
        const url = new URL(await page.locator('#maps-link').getAttribute('href'));
        expect(url.origin).toBe('https://www.google.com'); expect(url.searchParams.get('travelmode')).toBe('walking');
        expect(url.searchParams.has('origin')).toBe(false);
        await page.locator('.data-note summary').click();
        await expect(page.locator('.data-note')).toContainText('静かさや営業状況は取得できない');
      });
    }
  }
}
test('候補は1軒ずつ表示し、最後で止まり、APIを呼び直さない', async ({ page }) => {
  await open(page); await throughQuestions(page);
  await expect(page.locator('#candidate-counter')).toHaveText('候補 1 / 3');
  await page.locator('#next-place').click(); await expect(page.locator('#result-name')).toHaveText('試験喫茶 まどべ');
  await page.locator('#next-place').click(); await expect(page.locator('#result-name')).toHaveText('試験ベーカリー');
  await expect(page.locator('#next-place')).toBeDisabled(); await expect(page.locator('#last-candidate')).toBeVisible();
  expect(runs.get(page).search).toHaveLength(1);
});
test('前の問へ戻っても回答を保持し、結果から気分を直せる', async ({ page }) => {
  await open(page); await pick(page, 'ひとり'); await page.locator('#companion-next').click();
  await expect(page.locator('#question-next')).toBeDisabled();
  await pick(page, '軽め・お茶したい'); await page.locator('#question-next').click();
  await page.locator('#question-back').click(); await expect(page.locator('input[value="cafe"]')).toBeChecked();
  await page.locator('#question-next').click(); await pick(page, '静かにゆっくり'); await page.locator('#question-next').click();
  await pick(page, 'すぐそこがいい'); await page.locator('#question-next').click();
  await expect(page.locator('#result-screen')).toBeVisible();
  await page.locator('#review-answers').click(); await expect(page.locator('input[value="cafe"]')).toBeChecked();
  await pick(page, 'ガッツリ満腹'); await page.locator('#question-next').click();
  await expect(page.locator('input[value="quiet"]')).toBeChecked(); await page.locator('#question-next').click();
  await expect(page.locator('input[value="near"]')).toBeChecked(); await page.locator('#question-next').click();
  await expect(page.locator('#result-name')).toHaveText('試験食堂');
});
test('位置情報の拒否から場所指定へ進み、回答を入力し直さず結果を出せる', async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: {
    getCurrentPosition: (_ok, fail) => setTimeout(() => fail({ code: 1 }), 0),
  } }));
  await open(page); await throughQuestions(page, { companion: '家族' });
  await expect(page.locator('#error-title')).toHaveText('位置情報が許可されていません');
  await page.locator('#error-manual').click(); await selectManual(page);
  await expect(page.locator('#result-name')).toHaveText('試験カフェ ひと息');
  await expect(page.locator('#location-label')).toHaveText('試験駅');
});
test('最初に場所を指定すると、位置情報を要求せずその場所で探せる', async ({ page }) => {
  await page.addInitScript(() => { window.__gpsCalls = 0; Object.defineProperty(navigator, 'geolocation', { value: {
    getCurrentPosition: () => { window.__gpsCalls++; },
  } }); });
  await open(page); await page.locator('#location-trigger').click(); await selectManual(page);
  await throughQuestions(page); await expect(page.locator('#result-screen')).toBeVisible();
  expect(await page.evaluate(() => window.__gpsCalls)).toBe(0);
});
test('0件では徒歩圏を広げられ、近場の結果を捏造しない', async ({ page }) => {
  await page.route('**/v1/search?**', (route) => route.fulfill({ json: {
    results: new URL(route.request().url()).searchParams.get('radius') === '180' ? [] : [makePlace('散歩先の試験カフェ', .004)],
  } }));
  await open(page); await throughQuestions(page);
  await expect(page.locator('#empty-screen')).toBeVisible(); await page.locator('#empty-expand').click();
  await expect(page.locator('#result-name')).toHaveText('散歩先の試験カフェ');
});
test('API失敗と0件を区別し、再試行で復帰する', async ({ page }) => {
  let count = 0;
  await page.route('**/v1/search?**', (route) => ++count === 1 ? route.fulfill({ status: 503, json: { error: 'test' } }) : route.fulfill({ json: { results: places } }));
  await open(page); await throughQuestions(page);
  await expect(page.locator('#error-title')).toHaveText('検索先につながりませんでした');
  await page.locator('#retry').click(); await expect(page.locator('#result-name')).toHaveText('試験カフェ ひと息');
});
test('APIの時間切れを表示し、待ち続けない', async ({ page }) => {
  await open(page); await page.locator('#location-trigger').click(); await selectManual(page);
  await throughQuestions(page, { submit: false });
  await page.route('**/v1/search?**', () => {});
  await page.clock.install(); await page.locator('#question-next').click();
  await expect(page.locator('#loading-screen')).toBeVisible(); await page.clock.fastForward(10001);
  await expect(page.locator('#error-title')).toHaveText('少し時間がかかっています');
});
test('検索を取り消して戻ると、遅い応答で結果に飛ばされない', async ({ page }) => {
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  await page.route('**/v1/search?**', async (route) => { await delayed; await route.fulfill({ json: { results: places } }).catch(() => {}); });
  await open(page); await throughQuestions(page); await expect(page.locator('#loading-screen')).toBeVisible();
  await page.locator('#cancel-search').click(); await expect(page.locator('#question-title')).toHaveText('どれくらい動ける？');
  release(); await page.waitForTimeout(100);
  await expect(page.locator('#question-screen')).toBeVisible(); await expect(page.locator('input[value="near"]')).toBeChecked();
});
test('位置取得の待機も取り消せ、遅い位置情報を無視する', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: {
    getCurrentPosition: (ok) => { window.__lateGps = ok; },
  } }));
  await open(page); await throughQuestions(page); await expect(page.locator('#loading-title')).toHaveText('いまいる場所を確認しています');
  await page.locator('#cancel-search').click();
  await page.evaluate(() => window.__lateGps({ coords: { latitude: 35.68, longitude: 139.76, accuracy: 10 } }));
  await expect(page.locator('#question-screen')).toBeVisible(); expect(runs.get(page).search).toHaveLength(0);
});
test('GPS精度が粗い場合は結果に場所指定の案内を出す', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: {
    getCurrentPosition: (ok) => ok({ coords: { latitude: 35.68, longitude: 139.76, accuracy: 1200 } }),
  } }));
  await open(page); await throughQuestions(page);
  await expect(page.locator('#accuracy-note')).toContainText('約1200m');
});
test('場所検索の0件、失敗、取消、Escapeから再入力できる', async ({ page }) => {
  let count = 0;
  await page.route('**/v1/suggest?**', (route) => {
    count++;
    return count === 1 ? route.fulfill({ json: { suggestions: [] } })
      : count === 2 ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: { suggestions } });
  });
  await open(page); await page.locator('#location-trigger').click();
  await page.locator('#place-query').fill('試験駅'); await page.locator('#place-submit').click();
  await expect(page.locator('#place-status')).toContainText('場所が見つかりませんでした');
  await page.locator('#place-submit').click(); await expect(page.locator('#place-status')).toContainText('検索先につながりませんでした');
  await page.keyboard.press('Escape'); await expect(page.locator('#location-dialog')).not.toBeVisible();
  await expect(page.locator('#location-trigger')).toBeFocused();
  await page.locator('#location-trigger').click(); await selectManual(page);
});
test('外部の施設名をHTMLとして解釈しない', async ({ page }) => {
  const name = '<img src=x onerror=alert(1)> 試験カフェ';
  await page.route('**/v1/search?**', (route) => route.fulfill({ json: { results: [makePlace(name, .0002)] } }));
  await open(page); await throughQuestions(page);
  await expect(page.locator('#result-name')).toHaveText(name); await expect(page.locator('#result-name img')).toHaveCount(0);
});
test('キーボードで同行者と質問を選び、見えるフォーカスで進める', async ({ page }) => {
  await open(page); await page.locator('input[name="companion"]').first().focus();
  await page.keyboard.press('ArrowRight'); await expect(page.locator('input[value="friends"]')).toBeChecked();
  await page.keyboard.press('Tab'); await expect(page.locator('#companion-next')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#question-title')).toBeFocused();
  await page.keyboard.press('Tab'); await page.keyboard.press('ArrowDown');
  await expect(page.locator('#question-next')).toBeEnabled();
});
test('位置・回答を保存せず、共有はアプリURLだけにする', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page); await throughQuestions(page); await expect(page.locator('#result-screen')).toBeVisible();
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  await page.getByRole('button', { name: 'リンクをコピー', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://rairakku.com/100days${PATH}`);
});
for (const width of [390, 768, 1440]) {
  test(`${width}pxで質問と結果がはみ出さず、44pxの操作領域と動きの軽減がある`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page); await throughQuestions(page);
    await expect(page.locator('#result-screen')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const selector of ['#maps-link', '#next-place', '#review-answers', '#location-trigger']) {
      expect((await page.locator(selector).boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.locator('.screen:visible').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    mkdirSync('.cache/day086', { recursive: true });
    await page.screenshot({ path: `.cache/day086/result-${width}.png`, fullPage: true });
  });
}
test('100days配下でも場所指定→3問→結果→道案内まで動く', async ({ page }) => {
  const server = createMountedServer({ prefix: '/100days' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await open(page, `${base}/100days${PATH}`);
    await page.locator('#location-trigger').click(); await selectManual(page);
    await throughQuestions(page); await expect(page.locator('#result-name')).toHaveText('試験カフェ ひと息');
    await expect(page.locator('#maps-link')).toHaveAttribute('href', /travelmode=walking/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('BFCacheから戻ったとき、取消済みの位置取得画面を質問へ戻す', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: () => {} } }));
  await open(page); await throughQuestions(page); await expect(page.locator('#loading-screen')).toBeVisible();
  await page.evaluate(() => {
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.locator('#question-title')).toHaveText('どれくらい動ける？');
  await expect(page.locator('input[value="near"]')).toBeChecked();
  await expect(page.locator('#question-next')).toBeEnabled();
});
test('BFCacheから場所取得dialogへ戻ったとき、取得をやり直せる', async ({ page }) => {
  await page.route('**/v1/suggest?**', () => {});
  await open(page); await page.locator('#location-trigger').click();
  await page.locator('#place-query').fill('試験駅'); await page.locator('#place-submit').click();
  await expect(page.locator('#place-submit')).toBeDisabled();
  await page.evaluate(() => {
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.locator('#place-submit')).toBeEnabled();
  await expect(page.locator('#place-status')).toContainText('もう一度指定できます');
});
