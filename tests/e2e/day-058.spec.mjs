import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* Day 058 ミニチュア観光名所バトル。ゲームのルールと模型は day-058-meisho-battle/source の vitest が見る。
   ここでは公開ページとして、本番と同じCSPの下で ひとりで・ふたりで が遊べること、
   ネット対戦の入口が無いこと、一覧へ戻るリンクと共有の窓が使えることを確かめる。

   CI はソフトウェア描画で重いので、?gfx=test（軽い描画）で開く。8問を通す試験は ?test=1 の
   窓口（window.__MMB__）でゲームの時計を止めて進める。押す・答えるの操作そのものは本物のボタンで行う。 */

const DIR = 'day-058-meisho-battle';
const policy = readFileSync('dist/_headers', 'utf8')
  .split(`/${DIR}/*\n`)[1]
  .split('\n')[0]
  .trim()
  .replace('Content-Security-Policy: ', '');

async function open(page, query = '?gfx=test') {
  const errors = [];
  const outside = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // CSPに止められた読み込みは例外にならないことがあるので、違反の知らせそのものを集める
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1:') && !url.startsWith('data:') && !url.startsWith('blob:')) outside.push(url);
  });
  await page.route(`**/${DIR}/${query}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  await page.goto(`/${DIR}/${query}`);
  await expect(page.getByRole('heading', { name: 'ミニチュア観光名所バトル' })).toBeVisible();
  return { errors, outside };
}

const phase = (page) => page.evaluate(() => window.__MMB__?.phase() ?? 'none');
const violations = (page) => page.evaluate(() => window.__cspViolations ?? ['（違反の記録が始まっていない）']);

/* ゲームの窓口が作られた瞬間に時計を止める（端末の描画の速さと、ゲームの時間を切り離す） */
async function freezeOnCreation(page) {
  await page.evaluate(() => {
    let hook;
    Object.defineProperty(window, '__MMB__', {
      configurable: true,
      get: () => hook,
      set(value) {
        hook = value;
        value?.pause();
      },
    });
  });
}

/* 止めた時計を、組み立てが始まるところまで進める */
async function advanceToBuilding(page) {
  await page.evaluate(() => {
    const hook = window.__MMB__;
    for (let step = 0; step < 3 && hook.phase() !== 'building'; step++) {
      const state = hook.state();
      hook.advance(Math.max(1, state.phaseEndsAt - hook.now()));
    }
  });
  expect(await phase(page)).toBe('building');
}

async function startSolo(page, scope) {
  await page.locator('[data-action="solo"]').click();
  await expect(page.getByRole('heading', { name: 'ひとりで' })).toBeVisible();
  await page.getByRole('radio', { name: /見習いガイド/ }).check();
  await page.getByRole('radio', { name: scope, exact: true }).check();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.locator('.game')).toBeVisible();
}

test('本番と同じCSPで開き、エラーと外への通信が0件。ネット対戦の入口は無い', async ({ page }) => {
  const { errors, outside } = await open(page);
  await expect(page.locator('[data-action="solo"]')).toBeVisible();
  await expect(page.locator('[data-action="duo"]')).toBeVisible();
  await expect(page.locator('[data-action="online"]')).toHaveCount(0);
  await expect(page.getByText('ネット対戦')).toHaveCount(0);

  // 一覧へ戻るリンク
  const back = page.getByRole('link', { name: '100 DAYS / 058' });
  await expect(back).toHaveAttribute('href', '../');

  // 共有の窓：開くと共通の共有欄があり、閉じると消える
  await page.getByRole('button', { name: 'このアプリを共有する', exact: true }).click();
  const dialog = page.locator('#share-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.share')).toHaveCount(1);
  await expect(dialog.getByRole('link', { name: 'Xで投稿' })).toBeVisible();
  const overflow = await dialog.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow, '共有の窓の中身が横にはみ出している').toBeLessThanOrEqual(0);
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).toBeHidden();

  // 遊び方・設定・クレジット（豆知識の出典まで）を開いて戻る
  for (const [action, heading] of [['howto', '遊び方'], ['settings', '設定'], ['credits', 'クレジット']]) {
    await page.locator(`[data-action="${action}"]`).first().click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    if (action === 'credits') {
      await page.locator('[data-action="sources"]').click();
      await expect(page.getByRole('heading', { name: '豆知識の出典' })).toBeVisible();
      await page.locator('[data-action="back"]').click();
    }
    await page.locator('[data-action="back"]').click();
    await expect(page.getByRole('heading', { name: 'ミニチュア観光名所バトル' })).toBeVisible();
  }

  expect(errors).toEqual([]);
  expect(outside).toEqual([]);
  expect(await violations(page)).toEqual([]);
});

test('既定の描画（影と後処理つき）で開いても、エラー・CSP違反・外への通信が0件', async ({ page }) => {
  test.setTimeout(90_000);
  const { errors, outside } = await open(page, '');
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => document.documentElement.dataset.webgl)).toBe('yes');
  expect(errors).toEqual([]);
  expect(outside).toEqual([]);
  expect(await violations(page)).toEqual([]);
});

test('ひとりで：8問を押して正解し、結果の得点・シェアのあと「もう一回」で1問目に戻る', async ({ page }) => {
  test.setTimeout(150_000);
  const { errors, outside } = await open(page, '?test=1&seed=7&speed=8&gfx=test');
  await freezeOnCreation(page);
  await startSolo(page, '日本');

  const buzzer = page.locator('.buzzer[data-player="you"]');
  let total = 0;
  for (let question = 0; question < 8; question++) {
    await advanceToBuilding(page);
    await expect(page.locator('.q-num')).toHaveText(String(question + 1));
    await expect(buzzer).toBeEnabled();
    await buzzer.click();
    await page.waitForFunction(() => window.__MMB__?.phase() === 'answering');
    const answer = page.locator('.answer');
    await expect(answer.locator('.choice')).toHaveCount(4);
    const index = await page.evaluate(() => window.__MMB__.correctIndex());
    await answer.locator(`.choice[data-index="${index}"]`).click();
    const reveal = page.locator('.reveal');
    await expect(reveal.locator('.reveal-row.is-correct')).toBeVisible();
    const delta = (await reveal.locator('.reveal-row.is-correct .reveal-delta').textContent()) ?? '';
    expect(delta).toMatch(/^\+(?:\d{3}|1,000)$/);
    total += Number(delta.replace(/[^\d]/g, ''));
    if ((await phase(page)) === 'reveal') await page.locator('.reveal-next').click();
  }

  const result = page.locator('.result');
  await expect(result).toBeVisible();
  await expect(result.locator('.result-headline')).toHaveText('あなたの勝ち！');
  await expect(result.locator('.result-score')).toHaveText(`${total.toLocaleString('ja-JP')}点`);
  await expect(result.locator('.qr')).toHaveCount(8);
  const x = result.locator('[data-share="x"]');
  expect(decodeURIComponent((await x.getAttribute('href')) ?? '')).toContain(`https://hundred-days.pages.dev/${DIR}/`);
  // 結果のシェアは共通の共有欄と別物（名前を分けたので、ページの .share は共有の窓の1つだけ）
  await expect(page.locator('.share')).toHaveCount(1);

  await result.getByRole('button', { name: 'もう一回' }).click();
  await expect(page.locator('.game')).toBeVisible();
  await expect(page.locator('.q-num')).toHaveText('1');
  await expect(page.locator('.chip[data-player="you"] .chip-score')).toHaveText('0');
  expect(errors).toEqual([]);
  expect(outside).toEqual([]);
  expect(await violations(page)).toEqual([]);
});

test('ふたりで：Fで押してはずれると−200で締め出され、Jで押した2Pが正解できる', async ({ page }) => {
  const { errors, outside } = await open(page, '?test=1&seed=3&speed=8&gfx=test');
  await freezeOnCreation(page);
  await page.locator('[data-action="duo"]').click();
  await expect(page.getByRole('heading', { name: 'ふたりで' })).toBeVisible();
  await page.getByRole('radio', { name: '日本', exact: true }).check();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.locator('.game')).toBeVisible();
  await advanceToBuilding(page);

  const p1 = page.locator('.buzzer[data-player="p1"]');
  const p2 = page.locator('.buzzer[data-player="p2"]');
  await expect(p1).toBeEnabled();
  await expect(p2).toBeEnabled();
  const buzzerId = () => page.evaluate(() => window.__MMB__.state().question?.buzzerId ?? null);

  // 1P が F で押して、はずれを選ぶ（4択は数字キーでも選べる）
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__MMB__?.phase() === 'answering');
  expect(await buzzerId()).toBe('p1');
  const correct = await page.evaluate(() => window.__MMB__.correctIndex());
  await page.keyboard.press(String(((correct + 1) % 4) + 1));
  const chip1 = page.locator('.chip[data-player="p1"]');
  await expect(chip1.locator('.chip-score')).toHaveText('−200');
  await expect(p1).toBeDisabled();

  // 締め出された1Pは押せず、2P が J で押して正解する
  await page.waitForFunction(() => ['building', 'lastcall'].includes(window.__MMB__?.phase()));
  await page.keyboard.press('f');
  expect(await buzzerId()).toBe(null);
  await page.keyboard.press('j');
  await page.waitForFunction(() => window.__MMB__?.phase() === 'answering');
  expect(await buzzerId()).toBe('p2');
  await page.keyboard.press(String(correct + 1));
  await expect(page.locator('.reveal-row.is-correct')).toBeVisible();
  await expect(page.locator('.chip[data-player="p2"] .chip-score')).not.toHaveText('0');

  expect(errors).toEqual([]);
  expect(outside).toEqual([]);
  expect(await violations(page)).toEqual([]);
});

for (const [width, height] of [[390, 844], [320, 568], [844, 390], [1440, 900]]) {
  test(`タイトルが ${width}x${height} に収まり、押す場所が44px以上`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflowX).toBeLessThanOrEqual(0);
    for (const selector of ['[data-action="solo"]', '[data-action="duo"]', '[data-action="day-index"]', '[data-action="share-app"]']) {
      const target = page.locator(selector);
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeInViewport();
      const box = await target.boundingBox();
      expect(box.height, selector).toBeGreaterThanOrEqual(44);
      expect(box.width, selector).toBeGreaterThanOrEqual(44);
    }
  });
}
