import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = '/day-037-baito-law/';
const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', 'apps', 'day-037-baito-law', 'tests', 'fixtures');
const fixture = (name) => readFileSync(join(fixtures, name), 'utf8');

/* 条文はe-Govから取るが、テストで本物を叩くと落ちやすいうえ相手にも迷惑なので、
   保存しておいた実データに差し替える。差し替えるのは中身だけで、URLは本物のまま通る。 */
const ARTICLES = {
  39: 'roukikou-39.json',
  34: 'roukikou-34.json',
  91: 'roukikou-91.json',
  627: 'minpou-627.json',
};

const asked = new WeakMap();

async function stubEgov(page, { fail = false } = {}) {
  asked.set(page, []);
  await page.route('https://laws.e-gov.go.jp/api/**', async (route) => {
    const url = route.request().url();
    asked.get(page).push(url);
    if (fail) return route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' });
    const num = /Article_(\d+)/.exec(url)?.[1];
    const file = ARTICLES[num];
    if (!file) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: fixture(file) });
  });
}

const errors = new WeakMap();
const tolerated = new WeakMap();

/* わざと失敗させるテストでは、ブラウザ自身が出す「Failed to load resource」だけ見逃す。
   アプリ由来の例外と console.error は見逃さない（Day 032・033 と同じ書き方）。 */
const allowFailedRequests = (page) => tolerated.set(page, /Failed to load resource/);

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on('pageerror', (e) => errors.get(page).push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.get(page).push(m.text());
  });
});

test.afterEach(async ({ page }) => {
  const skip = tolerated.get(page);
  expect(errors.get(page).filter((text) => !skip?.test(text))).toEqual([]);
});

test('空の状態では条文の枠も失敗の知らせも出ない', async ({ page }) => {
  await stubEgov(page);
  await page.goto(APP);
  await expect(page.locator('.topic')).toHaveCount(10);
  /* クラス側の display に負けていないことまで見る */
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#failure')).toBeHidden();
  await expect(page.locator('#status')).toHaveText('気になることを選んでください');
  expect(asked.get(page)).toEqual([]);
});

test('札を選ぶと、その条文が出る', async ({ page }) => {
  await stubEgov(page);
  await page.goto(APP);
  await page.click('.topic[data-topic="kyukei"]');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#article-law')).toHaveText('労働基準法 第34条');
  await expect(page.locator('#article-caption')).toHaveText('（休憩）');
  await expect(page.locator('.para')).toHaveCount(3);
  /* 呼んだ先は本物のe-Gov法令API v2 */
  expect(asked.get(page)[0]).toContain('laws.e-gov.go.jp/api/2/law_data/322AC0000000049');
  expect(asked.get(page)[0]).toContain('elm=Article_34');
});

test('条文の本文は1字も変わっていない（ルビを除くと原文どおり）', async ({ page }) => {
  await stubEgov(page);
  await page.goto(APP);
  await page.click('.topic[data-topic="kyukei"]');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  const text = await page.locator('.para__text').first().evaluate((node) => {
    const copy = node.cloneNode(true);
    for (const rt of copy.querySelectorAll('rt')) rt.remove();
    return copy.textContent;
  });
  expect(text).toBe(
    '使用者は、労働時間が六時間を超える場合においては少くとも四十五分、八時間を超える場合においては少くとも一時間の休憩時間を労働時間の途中に与えなければならない。'
  );
});

test('漢数字にルビが振られ、使用者と労働者が塗り分けられる', async ({ page }) => {
  await stubEgov(page);
  await page.goto(APP);
  await page.click('.topic[data-topic="kyukei"]');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  const first = page.locator('.article ruby').first();
  await expect(first).toContainText('六時間');
  await expect(first.locator('rt')).toHaveText('6時間');
  await expect(page.locator('.article .who--employer').first()).toHaveText('使用者');
  await expect(page.locator('.article .who--worker').first()).toHaveText('労働者');
  /* ルビの読みはコピーに混ざらない */
  await expect(page.locator('.article ruby rt').first()).toHaveCSS('user-select', 'none');
});

test('別の法令の条文も同じ形で出る', async ({ page }) => {
  await stubEgov(page);
  await page.goto(APP);
  await page.click('.topic[data-topic="yameru"]');
  await expect(page.locator('#article-law')).toHaveText('民法 第627条');
  await expect(page.locator('#source')).toHaveAttribute(
    'href',
    'https://laws.e-gov.go.jp/law/129AC0000000089#Mp-Pa_3-Ch_2-Se_8-At_627'
  );
});

test('通信に失敗したら、理由と「もう一度」と原典リンクが出る', async ({ page }) => {
  allowFailedRequests(page);
  await stubEgov(page, { fail: true });
  await page.goto(APP);
  await page.click('.topic[data-topic="yukyu"]');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#failure-text')).toContainText('503');
  await expect(page.locator('#retry')).toBeVisible();
  /* アプリが失敗しても、原典には行ける */
  await expect(page.locator('#failure-source')).toHaveAttribute(
    'href',
    'https://laws.e-gov.go.jp/law/322AC0000000049#Mp-Ch_4-At_39'
  );
  await expect(page.locator('#result')).toBeHidden();
});

test('「もう一度」で取り直せる', async ({ page }) => {
  allowFailedRequests(page);
  let failNext = true;
  await page.route('https://laws.e-gov.go.jp/api/**', async (route) => {
    if (failNext) {
      failNext = false;
      return route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' });
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: fixture('roukikou-39.json') });
  });
  await page.goto(APP);
  await page.click('.topic[data-topic="yukyu"]');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  await page.click('#retry');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#article-caption')).toHaveText('（年次有給休暇）');
});

test('判断しない断りと、出典と、相談窓口はいつでも画面にある', async ({ page }) => {
  await stubEgov(page);
  await page.goto(APP);
  /* 選ぶ前から出ているもの */
  await expect(page.locator('.consult')).toContainText('総合労働相談コーナー');
  await expect(page.locator('.consult')).toContainText('無料・予約不要');
  await expect(page.locator('.site-foot')).toContainText('e-Gov法令検索');
  await expect(page.locator('.site-foot')).toContainText('公共データ利用規約');
  await expect(page.locator('.site-foot')).toContainText('加工したところ');
  await expect(page.locator('.site-foot')).toContainText('国や行政機関が作成・監修したものではありません');
  /* 条文が出たら、その直後に断りが出る */
  await page.click('.topic[data-topic="bakkin"]');
  await expect(page.locator('.disclaimer')).toContainText('あなたの場合にどうなるかは判断しません');
  await expect(page.locator('#enforced')).toContainText('施行時点の条文です');
});

test('同じ札を選び直しても取りに行かない', async ({ page }) => {
  await stubEgov(page);
  await page.goto(APP);
  await page.click('.topic[data-topic="kyukei"]');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await page.click('.topic[data-topic="bakkin"]');
  await expect(page.locator('#article-law')).toHaveText('労働基準法 第91条');
  await page.click('.topic[data-topic="kyukei"]');
  await expect(page.locator('#article-law')).toHaveText('労働基準法 第34条');
  expect(asked.get(page)).toHaveLength(2);
});

test('リンクで直接その条文を開ける', async ({ page }) => {
  await stubEgov(page);
  await page.goto(`${APP}?topic=yukyu`);
  await expect(page.locator('#article-caption')).toHaveText('（年次有給休暇）');
  await expect(page.locator('.topic[data-topic="yukyu"]')).toHaveAttribute('aria-pressed', 'true');
});

test('スマホ幅で横にはみ出さず、札は押せる大きさ', async ({ page }) => {
  await stubEgov(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBe(0);
  const box = await page.locator('.topic').first().boundingBox();
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
});
