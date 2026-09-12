import { expect, test } from '@playwright/test';

const APP = '/day-036-stroke-by-stroke/';
const errors = new WeakMap();
const requests = new WeakMap();

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  requests.set(page, []);
  page.on('request', (r) => requests.get(page).push(r.url()));
  page.on('pageerror', (e) => errors.get(page).push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.get(page).push(m.text());
  });
});

test.afterEach(async ({ page }) => {
  const origin = new URL(page.url()).origin;
  for (const url of requests.get(page)) expect(new URL(url).origin).toBe(origin);
  expect(errors.get(page)).toEqual([]);
});

const write = async (page, word) => {
  await page.fill('#word', word);
  await page.click('#write');
};
const done = (page) =>
  page.waitForFunction(() => document.getElementById('app').dataset.state === 'done', null, {
    timeout: 25_000,
  });

test('空の状態では保存も進捗も出ない', async ({ page }) => {
  await page.goto(APP);
  await expect(page.locator('#board')).toBeVisible();
  /* 空のまま保存できると白紙が落ちる。クラス側の display に負けていないことまで見る */
  await expect(page.locator('#save-png')).toBeHidden();
  await expect(page.locator('#ready-actions')).toBeHidden();
  await expect(page.locator('#progress')).toBeHidden();
  await expect(page.locator('#replay')).toBeHidden();
  /* 速さは書く前から選べる */
  await expect(page.locator('.speed-btn[data-speed="slow"]')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('言葉を入れて「書く」を押してください');
});

test('空のまま押しても何も起きない', async ({ page }) => {
  await page.goto(APP);
  await page.click('#write');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#save-png')).toBeHidden();
});

test('言葉を入れると1画ずつ書かれ、書き終わると保存が出る', async ({ page }) => {
  await page.goto(APP);
  await page.click('.speed-btn[data-speed="fast"]');
  await write(page, '山川');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'writing');
  await expect(page.locator('#progress')).toBeVisible();
  await expect(page.locator('#progress-text')).toContainText('全6画');
  await done(page);
  await expect(page.locator('#progress-text')).toHaveText('6画目 / 全6画');
  await expect(page.locator('#save-png')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('書き終わりました');
});

test('筆順データが無い字は、その字だけを名指しして残りは書く', async ({ page }) => {
  await page.goto(APP);
  await page.click('.speed-btn[data-speed="fast"]');
  await write(page, '﨑山');
  await done(page);
  await expect(page.locator('#notice')).toBeVisible();
  await expect(page.locator('#notice')).toContainText('﨑');
  /* 山の3画は書けている */
  await expect(page.locator('#progress-text')).toHaveText('3画目 / 全3画');
});

test('8字を超えたら切って、切ったことを伝える', async ({ page }) => {
  await page.goto(APP);
  await page.click('.speed-btn[data-speed="fast"]');
  await write(page, 'あいうえおかきくけこ');
  await done(page);
  await expect(page.locator('#notice')).toContainText('8字まで');
});

test('速さを変えても、いま書いている画のまま続く', async ({ page }) => {
  await page.goto(APP);
  await write(page, '永');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'writing');
  const before = await page.locator('#progress-text').textContent();
  await page.click('.speed-btn[data-speed="fast"]');
  await expect(page.locator('.speed-btn[data-speed="fast"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.locator('.speed-btn[data-speed="normal"]')).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  const after = await page.locator('#progress-text').textContent();
  expect(parseInt(after, 10)).toBeGreaterThanOrEqual(parseInt(before, 10));
  await done(page);
});

test('前に書いた言葉から書き直せる', async ({ page }) => {
  await page.goto(APP);
  await page.click('.speed-btn[data-speed="fast"]');
  await write(page, '山');
  await done(page);
  await write(page, '川');
  await done(page);
  const chips = page.locator('#recent .chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.first()).toHaveText('川');
  await chips.nth(1).click();
  await expect(page.locator('#word')).toHaveValue('山');
  await done(page);
  await expect(page.locator('#progress-text')).toHaveText('3画目 / 全3画');
});

test('これから書く画と番号は切り替えられる', async ({ page }) => {
  await page.goto(APP);
  await page.click('.speed-btn[data-speed="fast"]');
  await write(page, '山');
  await done(page);
  await page.uncheck('#toggle-guide');
  await page.uncheck('#toggle-numbers');
  await expect(page.locator('#toggle-guide')).not.toBeChecked();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'done');
});

test.describe('動きを減らす設定', () => {
  test.use({ reducedMotion: 'reduce' });

  test('アニメーションを飛ばして完成形を出す', async ({ page }) => {
    await page.goto(APP);
    await write(page, '山');
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'done');
    await expect(page.locator('#progress-text')).toHaveText('3画目 / 全3画');
    await expect(page.locator('#save-png')).toBeVisible();
  });
});
