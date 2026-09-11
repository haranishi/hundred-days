import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP = '/day-035-front-page/';
const PHOTO = readFileSync(new URL('../../apps/day-035-front-page/tests/fixtures/photo.png', import.meta.url));

const ARTICLES = {
  'https://example.com/tide': {
    title: '潮、いまどっち？｜一〇〇日',
    lead: 'いまの潮が満ちているか引いているかを1行で答える。地点を決めると次の満干も出る。三文目は落とす。',
    image: 'https://example.com/photo.png',
    site: '一〇〇日',
    publishedAt: '2026-09-10T09:00:00+09:00',
    canonical: 'https://example.com/tide',
    host: 'example.com'
  },
  'https://news.example.jp/quake': {
    title: '揺れた？ いまの揺れが地震だったかを確かめる',
    lead: '気象庁の発表から、直前の揺れが地震だったかを答える。',
    image: null,
    site: 'ニュース例',
    publishedAt: null,
    canonical: 'https://news.example.jp/quake',
    host: 'news.example.jp'
  },
  'https://blog.example.org/note': {
    title: '読んだ記事を紙にする',
    lead: '画面の中で流れていくものを、紙の形にして残す話。',
    image: null,
    site: '例のブログ',
    publishedAt: null,
    canonical: 'https://blog.example.org/note',
    host: 'blog.example.org'
  }
};

const errors = new WeakMap();
const requests = new WeakMap();
// わざとエラーを返すテストでは、ブラウザ自身の「読み込めなかった」通知だけを除く
const httpErrors = new WeakSet();

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  requests.set(page, []);
  page.on('request', (r) => requests.get(page).push(r.url()));
  page.on('pageerror', (e) => errors.get(page).push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.get(page).push(m.text()); });
});

test.afterEach(async ({ page }) => {
  // 外へ出ないこと。貼られたページも写真も、同一オリジンの中継しか通らない
  const origin = new URL(page.url()).origin;
  for (const url of requests.get(page)) expect(new URL(url).origin).toBe(origin);
  const ignorable = (line) => httpErrors.has(page) && /^Failed to load resource:/.test(line);
  expect(errors.get(page).filter((line) => !ignorable(line))).toEqual([]);
});

async function stub(page, { fail = null } = {}) {
  const calls = [];
  await page.route('**/api/day-035/page*', async (route) => {
    const url = new URL(route.request().url()).searchParams.get('url');
    calls.push(url);
    if (fail) {
      httpErrors.add(page);
      await route.fulfill({ status: fail.status, contentType: 'application/json', body: JSON.stringify({ error: fail.error }) });
      return;
    }
    const body = ARTICLES[url];
    if (!body) {
      await route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"upstream_unavailable"}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/day-035/image*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: PHOTO });
  });
  return calls;
}

const add = async (page, url) => {
  await page.fill('#url', url);
  await page.click('#submit');
};

test('リンクを貼ると一面になる', async ({ page }) => {
  await stub(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
  // 何も無いうちは保存も足すも出さない（白紙のPNGを落とさせない）
  await expect(page.locator('#save')).toBeHidden();
  await expect(page.locator('#ready-actions')).toBeHidden();
  await add(page, 'https://example.com/tide');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#list li')).toHaveCount(1);
  await expect(page.locator('#list li .headline')).toHaveText('潮、いまどっち？');
  await expect(page.locator('#save')).toBeVisible();
});

test('紙面の中身が読み上げにも出る', async ({ page }) => {
  await stub(page);
  await page.goto(APP);
  await add(page, 'https://example.com/tide');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  const label = await page.locator('#paper').getAttribute('aria-label');
  expect(label).toContain('潮、いまどっち？');
  expect(label).toContain('一面');
});

test('見出しから媒体名の接尾辞を落とす', async ({ page }) => {
  await stub(page);
  await page.goto(APP);
  await add(page, 'https://example.com/tide');
  await expect(page.locator('#list li .headline')).not.toContainText('一〇〇日');
});

test('写真の無いページでも組める', async ({ page }) => {
  const calls = await stub(page);
  await page.goto(APP);
  await add(page, 'https://news.example.jp/quake');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  expect(calls).toEqual(['https://news.example.jp/quake']);
  expect(requests.get(page).some((url) => url.includes('/api/day-035/image'))).toBe(false);
});

test('記事は3本まで足せる', async ({ page }) => {
  await stub(page);
  await page.goto(APP);
  for (const url of Object.keys(ARTICLES)) {
    await add(page, url);
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    if (url !== 'https://blog.example.org/note') {
      await expect(page.locator('#more')).toBeEnabled();
      await page.click('#more');
    }
  }
  await expect(page.locator('#list li')).toHaveCount(3);
  // 上限に達したら押す前に分かる
  await expect(page.locator('#more')).toBeDisabled();
  await expect(page.locator('#more')).toHaveText('3本そろいました');
});

test('同じリンクは二度載せない', async ({ page }) => {
  await stub(page);
  await page.goto(APP);
  await add(page, 'https://example.com/tide');
  await page.click('#more');
  await add(page, 'https://example.com/tide');
  await expect(page.locator('#error')).toContainText('もう載っています');
  await expect(page.locator('#list li')).toHaveCount(1);
});

test('危ないURLは中継を呼ぶ前に断る', async ({ page }) => {
  const calls = await stub(page);
  await page.goto(APP);
  await add(page, 'http://127.0.0.1/secret');
  await expect(page.locator('#error')).toContainText('読み取れませんでした');
  expect(calls).toEqual([]);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
});

test('取りに行けなかったら、理由を分けて伝える', async ({ page }) => {
  await stub(page, { fail: { status: 422, error: 'no_meta' } });
  await page.goto(APP);
  await add(page, 'https://example.com/tide');
  await expect(page.locator('#error')).toContainText('見出しが見つかりませんでした');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
});

test('作り直すと紙面が空になる', async ({ page }) => {
  await stub(page);
  await page.goto(APP);
  await add(page, 'https://example.com/tide');
  await page.click('#reset');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#list li')).toHaveCount(0);
});

test('開き直しても紙面が残っている', async ({ page }) => {
  await stub(page);
  await page.goto(APP);
  await add(page, 'https://example.com/tide');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#list li .headline')).toHaveText('潮、いまどっち？');
});

test('画像を保存できる', async ({ page }) => {
  await stub(page);
  await page.goto(APP);
  await add(page, 'https://example.com/tide');
  const download = await Promise.all([page.waitForEvent('download'), page.click('#save')]).then(([d]) => d);
  expect(download.suggestedFilename()).toMatch(/^front-page-\d{4}-\d{2}-\d{2}\.png$/);
});

test('スマホの幅で横にはみ出さない', async ({ page }) => {
  await stub(page);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(APP);
  await add(page, 'https://example.com/tide');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('シェアが据え付く', async ({ page }) => {
  await stub(page);
  await page.goto(APP);
  await expect(page.locator('#share .share')).toBeVisible();
});
