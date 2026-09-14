import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = '/day-038-yen-back-then/';
const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  join(here, '..', '..', 'apps', 'day-038-yen-back-then', 'tests', 'fixtures', 'worldbank-cpi.json'),
  'utf8'
);

/* 物価指数は世界銀行から取るが、テストで本物を叩くと落ちやすいうえ相手にも迷惑なので、
   保存しておいた実応答に差し替える。差し替えるのは中身だけで、URLは本物のまま通る。 */
const asked = new WeakMap();

async function stubWorldBank(page, { fail = false } = {}) {
  asked.set(page, []);
  await page.route('https://api.worldbank.org/**', async (route) => {
    asked.get(page).push(route.request().url());
    if (fail) return route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: fixture });
  });
}

const errors = new WeakMap();
const tolerated = new WeakMap();
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

test('開くと、既定の年（最新年の30年前）の答えがもう出ている', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  // フィクスチャの最新年は2025年なので、既定は1995年
  await expect(page.locator('#answer-year')).toHaveText('1995');
  await expect(page.locator('#year-output')).toHaveText('1995');
  await expect(page.locator('#answer-then')).toHaveText('1,000');
  await expect(page.locator('#answer-now')).toHaveText('1,167');
  await expect(page.locator('#failure')).toBeHidden();
  // 呼んだ先は本物の世界銀行API。日本と米国を1リクエストで取る
  expect(asked.get(page)).toHaveLength(1);
  expect(asked.get(page)[0]).toContain('api.worldbank.org/v2/country/JPN;USA/indicator/FP.CPI.TOTL');
});

test('逆向きの換算が、同じ画面に出ている', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#back-year')).toHaveText('1995');
  await expect(page.locator('#back-value')).toHaveText('857円');
});

test('年を動かすと、答えがその場で変わる', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await page.locator('#year').fill('1960');
  await expect(page.locator('#year-output')).toHaveText('1960');
  await expect(page.locator('#answer-now')).toHaveText('6,222');
  await expect(page.locator('#answer-ratio')).toContainText('6.22倍');
});

test('飛び石ボタンで年が飛び、押した印が付く', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await page.click('.jump[data-year="1970"]');
  await expect(page.locator('#year-output')).toHaveText('1970');
  await expect(page.locator('#year')).toHaveValue('1970');
  await expect(page.locator('.jump[data-year="1970"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.jump[data-year="1980"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#answer-now')).toHaveText('3,613');
});

test('金額のボタンを押すと、答えも丸の見出しも変わる', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await page.click('.preset[data-amount="10000"]');
  await expect(page.locator('#answer-then')).toHaveText('10,000');
  await expect(page.locator('#answer-now')).toHaveText('11,672');
  await expect(page.locator('#coins-heading')).toHaveText('同じ「10,000円」の中身');
  await expect(page.locator('#amount-input')).toHaveValue('10,000');
});

test('自由入力は全角でも受け取る', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await page.locator('#amount-input').fill('５０００');
  await expect(page.locator('#answer-then')).toHaveText('5,000');
  await expect(page.locator('#answer-now')).toHaveText('5,836');
});

test('最新年を選ぶと「そのまま」になり、国際比較の行は消える', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#fact-world')).toBeVisible();
  await page.locator('#year').fill('2025');
  await expect(page.locator('#answer-ratio')).toContainText('そのまま');
  await expect(page.locator('#answer-now')).toHaveText('1,000');
  // 米国の指数は2024年までしか無い＝2025年からは比べられないので出さない
  await expect(page.locator('#fact-world')).toBeHidden();
});

test('国際比較は、そろう最新年（2024年）で倍率だけを出す', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#fact-world')).toContainText('1995年から2024年まで');
  await expect(page.locator('#fact-world')).toContainText('日本の物価は1.13倍');
  await expect(page.locator('#fact-world')).toContainText('アメリカは2.06倍');
});

test('国際比較の行には、どの年までで比べたのかが書いてある', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  // 上のカード（2025年まで）と、この行（2024年まで）で日本の倍率が違う。その理由を書いていないと食い違って見える
  await expect(page.locator('#answer-ratio')).toContainText('1.17倍');
  await expect(page.locator('#fact-world')).toContainText('日本の物価は1.13倍');
  await expect(page.locator('#fact-world .fact__note')).toContainText('上のカードは2025年までで計算しています');
  await expect(page.locator('#fact-world .fact__note')).toContainText('この行だけ2024年でそろえました');
});

test('取りに行けなかったときは、失敗が見えてもう一度ためせる', async ({ page }) => {
  allowFailedRequests(page);
  await stubWorldBank(page, { fail: true });
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#failure')).toBeVisible();
  // 読む人は開発者ではないので、状態コードは画面に出さない
  await expect(page.locator('#failure-text')).toContainText('もう一度おためしください');
  await expect(page.locator('#failure-text')).not.toContainText('503');
  // 空のまま答えのカードが出ていないこと（[hidden] がクラスの display に負けていないこと）
  await expect(page.locator('#answer')).toBeHidden();
  await expect(page.locator('#coins')).toBeHidden();
  await expect(page.locator('#chart-section')).toBeHidden();

  await stubWorldBank(page);
  await page.click('#retry');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#answer-now')).toHaveText('1,167');
});

test('失敗しているときは、押しても何も起きない操作は出さない', async ({ page }) => {
  allowFailedRequests(page);
  await stubWorldBank(page, { fail: true });
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  // 年のスライダーだけ残ると「年は選べるのに金額の候補は無い」という食い違った画面になる
  await expect(page.locator('#picker')).toBeHidden();
  await expect(page.locator('#amount')).toBeHidden();
  // 失敗の知らせは、結果が出るはずだった位置（いちばん上）に出す
  const failureTop = await page.locator('#failure').evaluate((el) => el.getBoundingClientRect().top);
  expect(failureTop).toBeLessThan(300);
});

test('出典は、失敗しているときでも読める', async ({ page }) => {
  allowFailedRequests(page);
  await stubWorldBank(page, { fail: true });
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('.source')).toContainText('World Development Indicators');
  await expect(page.locator('.source')).toContainText('CC BY 4.0');
  // 数字が1つも出ていない画面に「この数字が言っていないこと」だけ残るのは据わりが悪い
  await expect(page.locator('.limits')).toBeHidden();
});

test('最新年が画面に書いてある（この先の予想はしないことも）', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#limit-latest')).toHaveText('2025年');
  await expect(page.locator('.limits')).toBeVisible();
  await expect(page.locator('.limits')).toContainText('この先の予想はしません');
});

test('「給料は含みません」の倍率は、いま出している答えと同じ数字になる', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  // ここを固定文にすると、年を変えたとたんに画面の中で数字が食い違う
  await expect(page.locator('#limit-wage')).toContainText('物価が1.17倍でも');
  await page.locator('#year').fill('1960');
  await expect(page.locator('#answer-ratio')).toContainText('6.22倍');
  await expect(page.locator('#limit-wage')).toContainText('物価が6.22倍でも');
  await page.locator('#year').fill('2025');
  await expect(page.locator('#limit-wage')).toContainText('物価が上がっても');
});

test('丸の中の数字は丸の外に出ている（小さいほうでも読める）', async ({ page }) => {
  await stubWorldBank(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await page.locator('#year').fill('1960');
  await expect(page.locator('#coin-then-label')).toHaveText('6,222円ぶん');
  await expect(page.locator('#coin-now-label')).toHaveText('1,000円ぶん');
  await expect(page.locator('#coin-now-label')).toBeVisible();
  // 小さいほうの丸も、下限より小さくならない
  const size = await page.locator('#coin-now').evaluate((el) => el.getBoundingClientRect().width);
  expect(size).toBeGreaterThanOrEqual(26);
});

test('読み込み中は骨組みが出て、出そろったら消える', async ({ page }) => {
  await page.route('https://api.worldbank.org/**', async (route) => {
    await new Promise((ok) => setTimeout(ok, 600));
    await route.fulfill({ status: 200, contentType: 'application/json', body: fixture });
  });
  await page.goto(APP, { waitUntil: 'commit' });
  await expect(page.locator('#skeleton')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#skeleton')).toBeHidden();
});

test('スマホでは、操作が1か所にまとまっている（年を選ぶ → 金額を変える → 図の順）', async ({ page }) => {
  await stubWorldBank(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  // 図のカードが2つの操作を分断すると、金額を変えられること自体に気づけない
  const top = (id) => page.locator(id).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  expect(await top('#picker')).toBeLessThan(await top('#amount'));
  expect(await top('#amount')).toBeLessThan(await top('#coins'));
});

test('390pxで横にはみ出さない', async ({ page }) => {
  await stubWorldBank(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await page.locator('#year').fill('1960');
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBe(0);
});
