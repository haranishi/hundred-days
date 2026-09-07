import { expect, test } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildRound, formatScore } from '../../apps/day-031-shape-where/lib/quiz.js';
import { mulberry32 } from '../../apps/day-031-shape-where/lib/rng.js';

const APP = '/day-031-shape-where/';
const STORAGE_NAME = 'day031.best.v1';
const appDir = fileURLToPath(new URL('../../apps/day-031-shape-where/', import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(`${appDir}tests/fixtures/${name}`, 'utf8'));
const PREFS = fixture('prefectures.json');
/* 全国モードは10県を重複なく引くので、固定データも10県ぶん置いてある（05・06 だけ町が12〜13件） */
const TOWNS = Object.fromEntries(
  readdirSync(`${appDir}tests/fixtures/towns`).map((name) => [name.slice(0, 2), fixture(`towns/${name}`)])
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,OPTIONS'
};

const consoleErrors = new WeakMap();
const tolerated = new WeakMap();

/* わざと 500 を返すテストでは、ブラウザ自身が出す「Failed to load resource」だけ見逃す。
   アプリが console.error を呼んでいないことは、この見逃しの外側で確かめられる。 */
const allowFailedRequests = (page) => tolerated.set(page, /Failed to load resource/);

test.beforeEach(async ({ page }) => {
  const errors = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  const skip = tolerated.get(page);
  const errors = (consoleErrors.get(page) ?? []).filter((text) => !skip?.test(text));
  expect(errors, 'コンソールエラーが発生した').toEqual([]);
});

/* 同梱データは県2つ・町各12件の固定データに差し替える。
   出題は種で決まるので、テスト側も同じ純関数を呼べば正解を知ったうえで操作できる。 */
async function installData(page) {
  const control = { prefs: 'ok', towns: 'ok', delay: 0 };
  await page.route('**/day-031-shape-where/data/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const townCode = path.match(/\/data\/towns\/(\d{2})\.json$/)?.[1];
    if (control.delay) await new Promise((resolve) => setTimeout(resolve, control.delay));
    if ((townCode ? control.towns : control.prefs) === 'fail') {
      await route.fulfill({ status: 500, contentType: 'text/plain', body: 'error' });
      return;
    }
    const body = townCode ? TOWNS[townCode] : PREFS;
    if (!body) {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
  });
  return control;
}

const summaryFor = (title) => ({
  type: 'standard',
  title,
  extract: `${title}（テスト）は、秋田県にある土地。ここは固定応答なので実際の記事ではない。`,
  thumbnail: { source: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/test.jpg' },
  content_urls: { desktop: { page: `https://ja.wikipedia.org/wiki/${encodeURIComponent(title)}` } }
});

/** 遅延は数値でも「何本目か」で決める関数でもよい（前の問の応答を追い越させたいときに使う） */
const delayOf = (control, title, order) =>
  typeof control.delay === 'function' ? control.delay(title, order) : control.delay;

async function installWiki(page) {
  const control = { mode: 'ok', delay: 0, calls: [] };
  await page.route('https://ja.wikipedia.org/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const title = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
    control.calls.push(title);
    const wait = delayOf(control, title, control.calls.length);
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    if (control.mode === 'fail') {
      await route.fulfill({ status: 500, headers: CORS, contentType: 'text/plain', body: 'error' });
      return;
    }
    // 1つ目の候補（県名の付かない記事名）だけ曖昧さ回避を返す
    const body =
      control.mode === 'disambiguation' && !title.includes('(')
        ? { ...summaryFor(title), type: 'disambiguation', extract: `${title}の曖昧さ回避` }
        : control.mode === 'nothumb'
          ? { ...summaryFor(title), thumbnail: undefined }
          : summaryFor(title);
    await route.fulfill({
      status: 200,
      headers: { ...CORS },
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body)
    });
  });
  await page.route('https://thumb.wikimedia.org/**', async (route) => {
    await route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PNG });
  });
  return control;
}

async function open(page, query = '') {
  await page.goto(`${APP}${query}`);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'start');
}

const roundFor = ({ mode, prefCode = null, seed }) =>
  buildRound({ mode, prefs: PREFS.items, townsByPref: TOWNS, prefCode, rng: mulberry32(seed) });

/** 解説の枠の顔つき（loading→ready、取れなければ none） */
const expectWiki = (page, status) => expect(page.locator('#reveal-wiki')).toHaveAttribute('data-status', status);

/** その問の正解、または「正解ではない選択肢」を押す */
async function answerQuestion(page, question, { correct = true } = {}) {
  const target = correct
    ? question.answer
    : question.choices.find((choice) => choice.code !== question.answer.code);
  await page.locator(`.choice[data-code="${target.code}"]`).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'reveal');
  return target;
}

test.describe('Day 031 この形、どこ？', () => {
  test('最初の画面に見出しと3つのはじめ方が並ぶ', async ({ page }) => {
    await installData(page);
    await open(page);
    await expect(page.getByRole('heading', { name: 'この形、どこ？' })).toBeVisible();
    await expect(page.locator('#play-pref')).toHaveText('都道府県ではじめる');
    await expect(page.locator('#play-town')).toBeVisible();
    await expect(page.locator('#play-town-all')).toHaveText('全国の市区町村ではじめる');
    await expect(page.locator('#best-pref')).toHaveText('まだ記録なし');
    await expect(page.locator('#sources')).toContainText('国土数値情報');
    await expect(page.locator('#sources')).toContainText('CC BY-SA 4.0');
  });

  test('?p=05 で秋田県が選ばれ、ボタンに県名が出る', async ({ page }) => {
    await installData(page);
    await open(page, '?p=05');
    await expect(page.locator('#pref-select')).toHaveValue('05');
    await expect(page.locator('#play-town')).toHaveText('秋田県の市町村ではじめる');
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'town');
  });

  test('県を選び直すとボタンの文言も変わる', async ({ page }) => {
    await installData(page);
    await open(page);
    await page.locator('#pref-select').selectOption('06');
    await expect(page.locator('#play-town')).toHaveText('山形県の市町村ではじめる');
  });

  test('はじめるとシルエットと4択が出る', async ({ page }) => {
    await installData(page);
    await open(page, '?seed=1&p=05');
    await page.locator('#play-town').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('#progress')).toHaveText('1 / 10');
    const shape = await page.locator('#shape-path').getAttribute('d');
    expect(shape).toMatch(/^M .* Z$/);
    await expect(page.locator('.choice')).toHaveCount(4);
    // 出題中は名前を漏らさない
    await expect(page.locator('#shape')).toHaveAttribute('aria-label', '出題中のシルエット');
    const names = await page.locator('.choice').allTextContents();
    expect(new Set(names).size).toBe(4);
    // 答えを先に見せない
    await expect(page.locator('#reveal')).toBeHidden();
    await expect(page.locator('#reveal-name')).toHaveText('');
  });

  test('正解を押すと「正解！」と地名が出て、4択は押せなくなる', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=1&p=05');
    await page.locator('#play-town').click();
    const round = roundFor({ mode: 'town', prefCode: '05', seed: 1 });
    const question = round.questions[0];
    await answerQuestion(page, question);

    await expect(page.locator('#reveal-result')).toHaveText('正解！');
    await expect(page.locator('#reveal-name')).toHaveText(question.answer.name);
    await expect(page.locator('#reveal-sub')).toContainText('秋田県');
    await expect(page.locator(`.choice[data-code="${question.answer.code}"]`)).toHaveAttribute('data-result', 'correct');
    await expect(page.locator('.choice:disabled')).toHaveCount(4);
    await expect(page.locator('#next-button')).toBeFocused();
    await expect(page.locator('#reveal-map')).toBeVisible();
    await expect(page.locator('#reveal-note')).toBeHidden();
  });

  test('枠の外にある離島の町は、位置の地図ではなく言葉で伝える', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=31&p=05');
    await page.locator('#play-town').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    /* 1問目は「県内で大きい町」から出すので、離島の小さい町はここには来ない。
       固定データで離島が出る問まで進んでから確かめる */
    const round = roundFor({ mode: 'town', prefCode: '05', seed: 31 });
    const index = round.questions.findIndex((item) => item.answer.far);
    expect(index, '固定データのどこかに離島の町が出ること').toBeGreaterThan(0);
    for (const before of round.questions.slice(0, index)) {
      await answerQuestion(page, before);
      await page.locator('#next-button').click();
    }
    const question = round.questions[index];

    await page.locator('#hint-button').click();
    await expect(page.locator('#hint-text')).toHaveText('県の本土から離れた島です');
    await expect(page.locator('#hint-map')).toBeHidden();

    await answerQuestion(page, question);
    await expect(page.locator('#reveal-map')).toBeHidden();
    await expect(page.locator('#reveal-note')).toHaveText('県の本土から離れた島です');
  });

  test('不正解は押した札と正解の札の両方に印が付く', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=2&p=05');
    await page.locator('#play-town').click();
    const question = roundFor({ mode: 'town', prefCode: '05', seed: 2 }).questions[0];
    const wrong = await answerQuestion(page, question, { correct: false });

    await expect(page.locator('#reveal-result')).toHaveText('ざんねん');
    await expect(page.locator(`.choice[data-code="${wrong.code}"]`)).toHaveAttribute('data-result', 'wrong');
    await expect(page.locator(`.choice[data-code="${question.answer.code}"]`)).toHaveAttribute('data-result', 'correct');
  });

  test('正解のあとに Wikipedia の要約と写真とリンクが足される', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=1&p=05');
    await page.locator('#play-town').click();
    const question = roundFor({ mode: 'town', prefCode: '05', seed: 1 }).questions[0];
    await answerQuestion(page, question);

    await expectWiki(page, 'ready');
    await expect(page.locator('#wiki-extract')).toContainText(question.answer.name);
    await expect(page.locator('#reveal-wiki')).toHaveAttribute('data-thumb', 'true');
    await expect(page.locator('#wiki-link')).toHaveAttribute(
      'href',
      `https://ja.wikipedia.org/wiki/${encodeURIComponent(question.answer.name)}`
    );
    await expect(page.locator('#wiki-thumb')).toBeVisible();
    await expect(page.locator('#wiki-thumb')).toHaveAttribute('alt', question.answer.name);
    await expect(page.locator('#reveal-wiki')).toContainText('CC BY-SA 4.0');
  });

  test('曖昧さ回避に当たったら県名付きの候補で取り直す', async ({ page }) => {
    await installData(page);
    const wiki = await installWiki(page);
    wiki.mode = 'disambiguation';
    await open(page, '?seed=1&p=05');
    await page.locator('#play-town').click();
    const question = roundFor({ mode: 'town', prefCode: '05', seed: 1 }).questions[0];
    await answerQuestion(page, question);

    await expectWiki(page, 'ready');
    await expect(page.locator('#wiki-extract')).toContainText('秋田県');
    expect(wiki.calls).toEqual([question.answer.name, `${question.answer.name} (秋田県)`]);
  });

  test('Wikipedia が落ちていても、枠は同じ高さのまま1行で知らせる', async ({ page }) => {
    await installData(page);
    const wiki = await installWiki(page);
    wiki.mode = 'fail';
    allowFailedRequests(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '?seed=1&p=05');
    await page.locator('#play-town').click();
    const question = roundFor({ mode: 'town', prefCode: '05', seed: 1 }).questions[0];
    await answerQuestion(page, question);

    await expect(page.locator('#reveal-name')).toHaveText(question.answer.name);
    await expect(page.locator('#next-button')).toBeVisible();
    const before = (await page.locator('#next-button').boundingBox()).y;
    await expectWiki(page, 'none');
    await expect(page.locator('#wiki-extract')).toHaveText('Wikipedia の解説は取れませんでした');
    await expect(page.locator('#wiki-foot')).toBeHidden();
    const after = (await page.locator('#next-button').boundingBox()).y;
    expect(Math.round(after), '取れなくても「次へ」は動かない').toBe(Math.round(before));
  });

  test('ヒントは県内の位置を見せ、その問の正解を0.5点にする', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=3&p=05');
    await page.locator('#play-town').click();
    const round = roundFor({ mode: 'town', prefCode: '05', seed: 3 });

    await page.locator('#hint-button').click();
    await expect(page.locator('#hint')).toBeVisible();
    await expect(page.locator('#app')).toHaveAttribute('data-hint-used', 'true');
    await expect(page.locator('#hint-button')).toBeHidden();
    expect(await page.locator('#hint-town').getAttribute('d')).toMatch(/^M /);

    for (const [index, question] of round.questions.entries()) {
      await answerQuestion(page, question);
      if (index === 0) await expect(page.locator('#app')).toHaveAttribute('data-hint-used', 'true');
      await page.locator('#next-button').click();
    }
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');
    await expect(page.locator('#result-score')).toHaveText('9.5 / 10');
    await expect(page.locator('#result-list li').first()).toContainText('△ ヒント');
  });

  test('全国モードは毎問ちがう県から出し、ヒントはその県の中の位置を見せる', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?m=town-all&seed=4');
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'town-all');
    await page.locator('#play-town-all').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    await page.locator('#hint-button').click();
    await expect(page.locator('#hint-text')).toHaveText('県内の位置');
    expect(await page.locator('#hint-outline').getAttribute('d')).toMatch(/^M /);

    const round = roundFor({ mode: 'town-all', seed: 4 });
    const used = round.questions.map((question) => question.prefCode);
    expect(new Set(used).size, '10問とも別の県から出る').toBe(10);
    await answerQuestion(page, round.questions[0]);
    await expect(page.locator('#reveal-sub')).toHaveText(
      new RegExp(`^${round.questions[0].prefName}`)
    );
  });

  test('10問通すと結果・一覧・ベストが出る', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=5&p=05');
    await page.locator('#play-town').click();
    const round = roundFor({ mode: 'town', prefCode: '05', seed: 5 });

    let correctCount = 0;
    for (const [index, question] of round.questions.entries()) {
      await expect(page.locator('#progress')).toHaveText(`${index + 1} / 10`);
      const wantCorrect = index % 3 !== 0;
      await answerQuestion(page, question, { correct: wantCorrect });
      if (wantCorrect) correctCount += 1;
      await expect(page.locator('#next-button')).toHaveText(index === 9 ? '結果を見る' : '次へ');
      await page.locator('#next-button').click();
    }

    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');
    await expect(page.locator('#result-score')).toHaveText(`${formatScore(correctCount)} / 10`);
    await expect(page.locator('#result-score')).toBeFocused();
    await expect(page.locator('#result-list li')).toHaveCount(10);
    await expect(page.locator('#result-mode')).toHaveText('秋田県の市町村クイズ');
    await expect(page.locator('#result-best')).toHaveText('ベスト更新！');

    const stored = await page.evaluate((name) => JSON.parse(localStorage.getItem(name)), STORAGE_NAME);
    expect(stored.best['town:05'].score).toBe(correctCount);
    expect(stored.lastPref).toBe('05');

    await page.reload();
    await expect(page.locator('#best-town')).toHaveText(`ベスト ${formatScore(correctCount)} / 10`);
    await expect(page.locator('#pref-select')).toHaveValue('05');
  });

  test('結果の投稿文には点数とアプリ名と県つきURLが入る', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=6&p=05');
    await page.locator('#play-town').click();
    const round = roundFor({ mode: 'town', prefCode: '05', seed: 6 });
    for (const question of round.questions) {
      await answerQuestion(page, question);
      await page.locator('#next-button').click();
    }
    await expect(page.locator('#result-score')).toHaveText('10 / 10');
    const href = await page.locator('#post-score').getAttribute('href');
    expect(href).toContain('https://x.com/intent/post?');
    const params = new URL(href).searchParams;
    expect(params.get('text')).toBe('この形、どこ？ 秋田県の市町村クイズ 10 / 10\n#100日チャレンジ');
    expect(params.get('url')).toBe('https://hundred-days.pages.dev/day-031-shape-where/?p=05');
    await expect(page.locator('#post-score')).toHaveAttribute('target', '_blank');
  });

  test('投稿文をコピーできる', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=7&m=town-all');
    await page.locator('#play-town-all').click();
    for (const question of roundFor({ mode: 'town-all', seed: 7 }).questions) {
      await answerQuestion(page, question);
      await page.locator('#next-button').click();
    }
    await page.locator('#copy-score').click();
    await expect(page.locator('#copy-note')).toHaveText('コピーしました');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.split('\n')[0]).toBe('この形、どこ？ 全国の市区町村クイズ 10 / 10');
    expect(text).toContain('https://hundred-days.pages.dev/day-031-shape-where/');
    expect(text).toContain('#100日チャレンジ');
  });

  test('もう一度と、モードの選び直し', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=8&p=05');
    await page.locator('#play-town').click();
    for (const question of roundFor({ mode: 'town', prefCode: '05', seed: 8 }).questions) {
      await answerQuestion(page, question);
      await page.locator('#next-button').click();
    }
    await page.locator('#again-button').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('#progress')).toHaveText('1 / 10');
    await expect(page.locator('.choice')).toHaveCount(4);

    for (const _ of Array.from({ length: 10 })) {
      await page.locator('.choice').first().click();
      await page.locator('#next-button').click();
    }
    await page.locator('#home-button').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'start');
  });

  test('データを読めないときは案内を出し、やり直せば遊べる', async ({ page }) => {
    const data = await installData(page);
    data.towns = 'fail';
    allowFailedRequests(page);
    await open(page, '?seed=9&p=05');
    await page.locator('#play-town').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#load-error')).toContainText('データを読み込めませんでした');

    data.towns = 'ok';
    await page.locator('#retry-button').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('.choice')).toHaveCount(4);
  });

  test('最初のデータが読めなければ、やり直しで最初の画面に戻れる', async ({ page }) => {
    const data = await installData(page);
    data.prefs = 'fail';
    allowFailedRequests(page);
    await page.goto(APP);
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
    data.prefs = 'ok';
    await page.locator('#retry-button').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'start');
    await expect(page.locator('#play-pref')).toBeEnabled();
  });

  test('localStorage が使えなくても遊べる', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('blocked');
        }
      });
    });
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=20&p=05');
    await expect(page.locator('#storage-notice')).toBeVisible();
    await page.locator('#play-town').click();
    const question = roundFor({ mode: 'town', prefCode: '05', seed: 20 }).questions[0];
    await answerQuestion(page, question);
    await expect(page.locator('#reveal-name')).toHaveText(question.answer.name);
  });

  test('壊れた保存データは黙って捨てる', async ({ page }) => {
    await page.addInitScript((name) => localStorage.setItem(name, '{壊れている'), STORAGE_NAME);
    await installData(page);
    await open(page);
    await expect(page.locator('#storage-notice')).toBeHidden();
    await expect(page.locator('#best-pref')).toHaveText('まだ記録なし');
  });

  test('1〜4キーでも選べる', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=11&p=05');
    await page.locator('#play-town').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    const question = roundFor({ mode: 'town', prefCode: '05', seed: 11 }).questions[0];
    const order = question.choices.findIndex((choice) => choice.code === question.answer.code);
    await page.keyboard.press(String(order + 1));
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'reveal');
    await expect(page.locator('#reveal-result')).toHaveText('正解！');
  });

  test('読み込みのあと、外へ出るのは Wikipedia だけ', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    const outside = [];
    page.on('request', (request) => {
      const host = new URL(request.url()).host;
      if (host !== '127.0.0.1:4173') outside.push(host);
    });
    await open(page, '?seed=12&p=05');
    await page.locator('#play-town').click();
    const question = roundFor({ mode: 'town', prefCode: '05', seed: 12 }).questions[0];
    await answerQuestion(page, question);
    await expectWiki(page, 'ready');
    // 写真は loading="lazy" なので、読み終わるまで待ってから数える
    await expect
      .poll(() => page.locator('#wiki-thumb').evaluate((node) => node.complete && node.naturalWidth > 0))
      .toBe(true);
    expect(outside).toContain('ja.wikipedia.org');
    expect(outside.filter((host) => !/^(ja\.wikipedia|thumb\.wikimedia|upload\.wikimedia)\.org$/.test(host))).toEqual([]);
  });

  for (const width of [320, 390, 1280]) {
    test(`${width}px幅で横スクロールがない`, async ({ page }) => {
      await installData(page);
      await installWiki(page);
      await page.setViewportSize({ width, height: 800 });
      await open(page, '?seed=13&p=05');
      const start = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth
      }));
      expect(start.scroll).toBeLessThanOrEqual(start.client);

      await page.locator('#play-town').click();
      await answerQuestion(page, roundFor({ mode: 'town', prefCode: '05', seed: 13 }).questions[0]);
      await expectWiki(page, 'ready');
      const playing = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth
      }));
      expect(playing.scroll).toBeLessThanOrEqual(playing.client);
    });
  }

  for (const [width, height] of [
    [390, 780],
    [1200, 750]
  ]) {
    test(`${width}×${height}でシルエットと4択が同じ画面に入る`, async ({ page }) => {
      await installData(page);
      await page.setViewportSize({ width, height });
      await open(page, '?seed=14&p=05');
      await page.locator('#play-town').click();
      await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
      for (const selector of ['#shape', '#choices']) {
        const box = await page.locator(selector).boundingBox();
        expect(box, `${selector} が見つからない`).not.toBeNull();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(Math.round(box.y + box.height), `${selector} が画面からはみ出す`).toBeLessThanOrEqual(height);
      }
    });
  }

  test('390×780でヒントを出しても4択が画面に残る', async ({ page }) => {
    await installData(page);
    await page.setViewportSize({ width: 390, height: 780 });
    await open(page, '?seed=14&p=05');
    await page.locator('#play-town').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    const before = await page.locator('.shape-bed').boundingBox();
    await page.locator('#hint-button').click();
    await expect(page.locator('#hint')).toBeVisible();
    // ヒントの地図はシルエットのカードに重なる。カードは縮まない
    const after = await page.locator('.shape-bed').boundingBox();
    expect(Math.round(after.width), 'ヒントでシルエットが縮む').toBe(Math.round(before.width));
    const bed = await page.locator('.shape-bed').boundingBox();
    const hint = await page.locator('#hint').boundingBox();
    expect(Math.round(hint.y + hint.height), 'ヒントがカードからはみ出す').toBeLessThanOrEqual(
      Math.round(bed.y + bed.height)
    );
    for (const selector of ['#shape', '#hint', '#choices']) {
      const box = await page.locator(selector).boundingBox();
      expect(Math.round(box.y + box.height), `${selector} が画面からはみ出す`).toBeLessThanOrEqual(780);
    }
  });

  for (const [width, height] of [
    [390, 780],
    [360, 640]
  ]) {
    test(`${width}×${height}でシルエットのカードと4択の左右がそろう`, async ({ page }) => {
      await installData(page);
      await page.setViewportSize({ width, height });
      await open(page, '?seed=14&p=05');
      await page.locator('#play-town').click();
      await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
      const card = await page.locator('.shape-bed').boundingBox();
      for (const selector of ['.hint-row', '#choices', '#tracker']) {
        const box = await page.locator(selector).boundingBox();
        expect(Math.round(box.x), `${selector} の左端がカードとずれる`).toBe(Math.round(card.x));
        expect(Math.round(box.width), `${selector} の幅がカードとちがう`).toBe(Math.round(card.width));
      }
      /* 縦が足りないぶんはカードごと縮めず、図の高さだけ詰める。
         カードは横長になり、図はその中央へ置かれる（左右が余白になる） */
      const shape = await page.locator('#shape').boundingBox();
      expect(Math.round(shape.height), '図が画面の高さに対して大きい').toBeLessThan(Math.round(height / 2));
      expect(shape.width, 'カードの幅まで図を縮めている').toBeGreaterThan(shape.height);
    });
  }

  /** ページの中での位置（スクロールしても変わらない座標）を測る */
  const placeOf = (page, selector) =>
    page.locator(selector).evaluate((node) => {
      const box = node.getBoundingClientRect();
      return [Math.round(box.x + scrollX), Math.round(box.y + scrollY), Math.round(box.width), Math.round(box.height)];
    });

  for (const [width, height] of [
    [390, 780],
    [1280, 800]
  ]) {
    test(`${width}×${height}でヒントを開いても回答しても4択とシルエットが動かない`, async ({ page }) => {
      await installData(page);
      const wiki = await installWiki(page);
      wiki.delay = 900;
      // 現れるアニメーションの途中を測らないように、動きを止めてから測る
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height });
      await open(page, '?seed=14&p=05');
      await page.locator('#play-town').click();
      await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
      const watched = ['#shape', '#choices', '#tracker'];
      const before = {};
      for (const selector of watched) before[selector] = await placeOf(page, selector);

      await page.locator('#hint-button').click();
      await expect(page.locator('#hint')).toBeVisible();
      for (const selector of watched) {
        expect(await placeOf(page, selector), `ヒントで ${selector} が動く`).toEqual(before[selector]);
      }

      await answerQuestion(page, roundFor({ mode: 'town', prefCode: '05', seed: 14 }).questions[0]);
      await expectWiki(page, 'loading');
      for (const selector of watched) {
        expect(await placeOf(page, selector), `回答で ${selector} が動く`).toEqual(before[selector]);
      }

      await expectWiki(page, 'ready');
      for (const selector of watched) {
        expect(await placeOf(page, selector), `要約が届いて ${selector} が動く`).toEqual(before[selector]);
      }
    });
  }

  test('ヒントを使わなかった問は、正解表示の同じ行に「ヒントなしで回答」が出る', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await page.setViewportSize({ width: 390, height: 780 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '?seed=5&p=05');
    await page.locator('#play-town').click();
    const round = roundFor({ mode: 'town', prefCode: '05', seed: 5 });
    const row = page.locator('.hint-row');
    const before = await row.boundingBox();

    await answerQuestion(page, round.questions[0]);
    await expect(page.locator('#hint-text')).toHaveText('ヒントなしで回答');
    await expect(page.locator('#hint-text')).toHaveAttribute('data-tone', 'quiet');
    await expect(page.locator('#hint-button')).toBeHidden();
    // 行の高さは変えない。ここが伸び縮みすると4択とシルエットが動く
    expect(Math.round((await row.boundingBox()).height), 'ヒント行の高さが変わる').toBe(
      Math.round(before.height)
    );

    // ヒントを使った問は、使ったヒントの文字がそのまま残る
    await page.locator('#next-button').click();
    await page.locator('#hint-button').click();
    await expect(page.locator('#hint-text')).toHaveText('県内の位置');
    await answerQuestion(page, round.questions[1]);
    await expect(page.locator('#hint-text')).toHaveText('県内の位置');
    await expect(page.locator('#hint-text')).toHaveAttribute('data-tone', 'hint');
  });

  test('390×780で回答すると正解表示が画面に入る', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await page.setViewportSize({ width: 390, height: 780 });
    await open(page, '?seed=14&p=05');
    await page.locator('#play-town').click();
    await answerQuestion(page, roundFor({ mode: 'town', prefCode: '05', seed: 14 }).questions[0]);

    /* なめらかに動くので、止まったところを見る。動かさないと「次へ」は
       画面の 400px ほど下に居るので、この条件は自動スクロールが無いと満たせない */
    await expect
      .poll(
        async () => {
          const box = await page.locator('#next-button').boundingBox();
          return Math.round(box.y + box.height) <= 780;
        },
        { timeout: 3000 }
      )
      .toBe(true);
    const reveal = await page.locator('#reveal').boundingBox();
    expect(reveal.y, '正解表示の上端が画面の上へ出る').toBeGreaterThanOrEqual(0);
    expect(reveal.y, '正解表示が画面の下に隠れる').toBeLessThan(780);
  });

  test('1280×800では、回答してもシルエットを画面の外へ追い出さない', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '?seed=14&p=05');
    await page.locator('#play-town').click();
    await answerQuestion(page, roundFor({ mode: 'town', prefCode: '05', seed: 14 }).questions[0]);

    const reveal = await page.locator('#reveal').boundingBox();
    expect(reveal.y, '正解表示が画面に入っていない').toBeGreaterThanOrEqual(0);
    expect(Math.round(reveal.y + reveal.height), '正解表示が画面からはみ出す').toBeLessThanOrEqual(800);
    // すでに全部見えているので寄せる必要がない。シルエットを追い出さない
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => Math.round(scrollY)), '見えているのにスクロールした').toBe(0);
    const shape = await page.locator('#shape').boundingBox();
    expect(shape.y, 'シルエットが画面の外へ出る').toBeGreaterThanOrEqual(0);
  });

  test('出題中は見出しの説明文を隠す（h1は残す）', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=14&p=05');
    await expect(page.locator('.site-description')).toBeVisible();
    await page.locator('#play-town').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('.site-description')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'この形、どこ？' })).toBeVisible();
    await answerQuestion(page, roundFor({ mode: 'town', prefCode: '05', seed: 14 }).questions[0]);
    await expect(page.locator('.site-description')).toBeHidden();
    await page.locator('#quit-button').click();
    await expect(page.locator('.site-description')).toBeVisible();
  });

  test('最初の画面にシルエットの見本が3つ出て、主要ボタンは1つだけ', async ({ page }) => {
    await installData(page);
    await open(page);
    await expect(page.locator('#start-samples svg')).toHaveCount(3);
    await expect(page.locator('#start-samples')).toContainText('こんな形が出ます');
    for (const path of await page.locator('#start-samples svg path').all()) {
      expect(await path.getAttribute('d')).toMatch(/^M .* Z$/);
    }
    await expect(page.locator('#play-pref')).toHaveClass(/button--primary/);
    await expect(page.locator('#play-town')).not.toHaveClass(/button--primary/);
    await expect(page.locator('#play-town-all')).not.toHaveClass(/button--primary/);
    // 出題中は見本も引っ込む
    await page.locator('#play-pref').click();
    await expect(page.locator('#start-samples')).toBeHidden();
  });

  test('回答した札は色だけでなく記号でも正誤を伝える', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=2&p=05');
    await page.locator('#play-town').click();
    const round = roundFor({ mode: 'town', prefCode: '05', seed: 2 });
    const wrong = await answerQuestion(page, round.questions[0], { correct: false });

    const correctChoice = page.locator(`.choice[data-code="${round.questions[0].answer.code}"]`);
    const wrongChoice = page.locator(`.choice[data-code="${wrong.code}"]`);
    await expect(correctChoice).toContainText('✓');
    await expect(correctChoice).toHaveAttribute('aria-label', `正解 ${round.questions[0].answer.name}`);
    await expect(wrongChoice).toContainText('✕');
    await expect(wrongChoice).toHaveAttribute('aria-label', `不正解 ${wrong.name}`);
    // 押していない札には記号を付けない
    await expect(page.locator('.choice .mark')).toHaveCount(2);

    // 次の問には持ち越さない
    await page.locator('#next-button').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('.choice .mark')).toHaveCount(0);
    await expect(page.locator('.choice[aria-label]')).toHaveCount(0);
  });

  test('10問ぶんの丸が回答のたびに変わる', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=5&p=05');
    await page.locator('#play-town').click();
    const round = roundFor({ mode: 'town', prefCode: '05', seed: 5 });
    await expect(page.locator('#tracker li')).toHaveCount(10);
    await expect(page.locator('#tracker li[data-mark="pending"]')).toHaveCount(10);
    await expect(page.locator('#tracker')).toHaveAttribute('aria-label', '10問中0問回答、正解0');

    await answerQuestion(page, round.questions[0]);
    await expect(page.locator('#tracker li[data-mark="correct"]')).toHaveCount(1);
    await expect(page.locator('#tracker')).toHaveAttribute('aria-label', '10問中1問回答、正解1');

    await page.locator('#next-button').click();
    await answerQuestion(page, round.questions[1], { correct: false });
    await expect(page.locator('#tracker li[data-mark="wrong"]')).toHaveCount(1);
    await expect(page.locator('#tracker')).toHaveAttribute('aria-label', '10問中2問回答、正解1');

    await page.locator('#next-button').click();
    await page.locator('#hint-button').click();
    await answerQuestion(page, round.questions[2]);
    await expect(page.locator('#tracker li[data-mark="hint"]')).toHaveCount(1);
    await expect(page.locator('#tracker li[data-mark="pending"]')).toHaveCount(7);
    await expect(page.locator('#tracker')).toHaveAttribute('aria-label', '10問中3問回答、正解2');
  });

  test('表示中の操作領域は44px以上', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=15&p=05');
    const measure = () =>
      page.locator('button, select, a.button').evaluateAll((nodes) =>
        nodes
          .filter((node) => node.offsetParent !== null)
          .map((node) => ({
            name: node.id || node.textContent.trim(),
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height
          }))
      );
    const check = async () => {
      for (const box of await measure()) {
        expect(Math.round(box.width), `${box.name} の幅`).toBeGreaterThanOrEqual(44);
        expect(Math.round(box.height), `${box.name} の高さ`).toBeGreaterThanOrEqual(44);
      }
    };
    await check();
    await page.locator('#play-town').click();
    await check();
    await answerQuestion(page, roundFor({ mode: 'town', prefCode: '05', seed: 15 }).questions[0]);
    await check();
  });

  for (const [width, height] of [
    [390, 780],
    [1280, 800]
  ]) {
    test(`${width}×${height}で要約が遅れて届いても「次へ」の位置は動かない`, async ({ page }) => {
      await installData(page);
      const wiki = await installWiki(page);
      wiki.delay = 1500;
      // 正解表示のスライドが終わるのを待たずに測れるように、動きを止める
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height });
      await open(page, '?seed=1&p=05');
      await page.locator('#play-town').click();
      const question = roundFor({ mode: 'town', prefCode: '05', seed: 1 }).questions[0];
      await answerQuestion(page, question);

      await expectWiki(page, 'loading');
      await expect(page.locator('#wiki-extract')).toHaveText('解説を読み込み中…');
      await expect(page.locator('#wiki-foot')).toBeHidden();
      const before = (await page.locator('#next-button').boundingBox()).y;
      await expectWiki(page, 'ready');
      await expect(page.locator('#wiki-extract')).toContainText(question.answer.name);
      await expect(page.locator('#wiki-thumb')).toBeVisible();
      const after = (await page.locator('#next-button').boundingBox()).y;
      expect(Math.round(after), '要約が届いても「次へ」が下へ逃げない').toBe(Math.round(before));
    });
  }

  test('前の問の要約が遅れて届いても、次の問には出さない', async ({ page }) => {
    await installData(page);
    const wiki = await installWiki(page);
    // 1本目（1問目の記事）だけ遅らせる
    wiki.delay = (title, order) => (order === 1 ? 1500 : 0);
    await open(page, '?seed=5&p=05');
    await page.locator('#play-town').click();
    const round = roundFor({ mode: 'town', prefCode: '05', seed: 5 });

    await answerQuestion(page, round.questions[0]);
    await expectWiki(page, 'loading');
    await page.locator('#next-button').click();
    await answerQuestion(page, round.questions[1]);
    await expectWiki(page, 'ready');
    await expect(page.locator('#wiki-extract')).toContainText(round.questions[1].answer.name);

    // 1問目の応答が届く時刻を過ぎても、2問目の本文のまま
    await page.waitForTimeout(1800);
    await expect(page.locator('#wiki-extract')).toContainText(round.questions[1].answer.name);
    await expect(page.locator('#wiki-extract')).not.toContainText(round.questions[0].answer.name);
  });

  test('写真の無い記事では、本文とリンクが枠の中に収まる', async ({ page }) => {
    await installData(page);
    const wiki = await installWiki(page);
    wiki.mode = 'nothumb';
    await open(page, '?seed=1&p=05');
    await page.locator('#play-town').click();
    await answerQuestion(page, roundFor({ mode: 'town', prefCode: '05', seed: 1 }).questions[0]);

    await expectWiki(page, 'ready');
    await expect(page.locator('#reveal-wiki')).toHaveAttribute('data-thumb', 'false');
    await expect(page.locator('#wiki-thumb')).toBeHidden();
    const panel = await page.locator('#reveal').boundingBox();
    for (const selector of ['#wiki-link', '.wiki__license', '#wiki-extract']) {
      const box = await page.locator(selector).boundingBox();
      expect(box, `${selector} が見つからない`).not.toBeNull();
      expect(box.x, `${selector} が左へはみ出す`).toBeGreaterThanOrEqual(panel.x);
      expect(box.x + box.width, `${selector} が右へはみ出す`).toBeLessThanOrEqual(panel.x + panel.width);
    }
  });

  test('プレイ中に正答数が出て、正解表示にも進み具合と点数が出る', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=5&p=05');
    await page.locator('#play-town').click();
    const round = roundFor({ mode: 'town', prefCode: '05', seed: 5 });

    await expect(page.locator('#score-now')).toHaveText('正解 0');
    await answerQuestion(page, round.questions[0]);
    await expect(page.locator('#reveal-progress')).toHaveText('1 / 10 · 正解 1');
    await page.locator('#next-button').click();
    await expect(page.locator('#score-now')).toHaveText('正解 1');

    // ヒントを見た問の正解は 0.5 点
    await page.locator('#hint-button').click();
    await answerQuestion(page, round.questions[1]);
    await expect(page.locator('#reveal-progress')).toHaveText('2 / 10 · 正解 1.5');
    await page.locator('#next-button').click();
    await expect(page.locator('#score-now')).toHaveText('正解 1.5');

    // 外すと増えない
    await answerQuestion(page, round.questions[2], { correct: false });
    await expect(page.locator('#reveal-progress')).toHaveText('3 / 10 · 正解 1.5');
  });

  test('ベストがあれば、プレイ中の得点の隣に出る', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=6&p=05');
    await page.locator('#play-town').click();
    for (const question of roundFor({ mode: 'town', prefCode: '05', seed: 6 }).questions) {
      await answerQuestion(page, question);
      await page.locator('#next-button').click();
    }
    await expect(page.locator('#result-score')).toHaveText('10 / 10');
    await page.locator('#again-button').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('#score-now')).toHaveText('正解 0 · ベスト 10 / 10');
  });

  test('やめるとラウンドを捨てて最初の画面に戻る', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=5&p=05');
    await page.locator('#play-town').click();
    const round = roundFor({ mode: 'town', prefCode: '05', seed: 5 });

    // 出題中でも押せる
    await page.locator('#quit-button').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'start');
    await expect(page.locator('#play-pref')).toBeFocused();

    // 正解表示のときも押せる（確認ダイアログは出さない）
    await page.locator('#play-town').click();
    await answerQuestion(page, round.questions[0]);
    await page.locator('#quit-button').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'start');
    await expect(page.locator('#best-town')).toHaveText('まだ記録なし');
    const stored = await page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? '{}'), STORAGE_NAME);
    expect(stored.best ?? {}, '途中で抜けたラウンドは記録に残さない').toEqual({});
  });

  test('都道府県モードのヒントは4択を2択に絞る', async ({ page }) => {
    await installData(page);
    await installWiki(page);
    await open(page, '?seed=40&m=pref');
    await page.locator('#play-pref').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    const question = roundFor({ mode: 'pref', seed: 40 }).questions[0];

    await page.locator('#hint-button').click();
    await expect(page.locator('#hint-text')).toHaveText('2つに絞りました');
    await expect(page.locator('#hint-map')).toBeHidden();
    await expect(page.locator('.choice[data-eliminated="true"]')).toHaveCount(2);
    await expect(page.locator('.choice:disabled')).toHaveCount(2);
    // 答えは残っている
    await expect(page.locator(`.choice[data-code="${question.answer.code}"]`)).toBeEnabled();
    // 消した札は数字キーでも押せない
    const dead = question.choices.findIndex((choice) => choice.code !== question.answer.code);
    await page.keyboard.press(String(dead + 1));
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');

    await answerQuestion(page, question);
    await expect(page.locator('#reveal-result')).toHaveText('正解！');
    await expect(page.locator('#reveal-progress')).toHaveText('1 / 10 · 正解 0.5');
    await expect(page.locator('#reveal-map')).toBeHidden();
  });

  test('URLでモードを指定して開くと、そのボタンにフォーカスが載る', async ({ page }) => {
    await installData(page);
    await open(page, '?p=05');
    await expect(page.locator('#play-town')).toBeFocused();
    await open(page, '?m=town-all');
    await expect(page.locator('#play-town-all')).toBeFocused();
    await open(page, '?m=pref');
    await expect(page.locator('#play-pref')).toBeFocused();
    // 指定が無ければ勝手にフォーカスを動かさない
    await open(page);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
  });

  test('読み込みに時間がかかるときだけスケルトンを出す', async ({ page }) => {
    const data = await installData(page);
    data.delay = 1500;
    await page.goto(APP);
    /* スケルトンが出るのは 300ms 後の一瞬なので、expect のポーリングでは取りこぼす。
       ページ側で毎フレーム見張る waitForFunction で捕まえる */
    await page.waitForFunction(() => document.getElementById('app').dataset.state === 'loading');
    await expect(page.locator('#loading')).toBeVisible();
    await expect(page.locator('#loading')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'start');
  });

  test('すぐ読み終わるならスケルトンは出さない（300ms未満）', async ({ page }) => {
    // 画面の状態が変わるたびに書き留めておく（loading が一瞬でも出たら記録に残る）
    await page.addInitScript(() => {
      const seen = [];
      globalThis.seenStates = seen;
      const tick = () => {
        const node = document.getElementById('app');
        if (node && seen[seen.length - 1] !== node.dataset.state) seen.push(node.dataset.state);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const data = await installData(page);
    data.delay = 100;
    await page.goto(APP);
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'start');
    const seen = await page.evaluate(() => globalThis.seenStates);
    expect(seen, '見張り自体が動いていること').toContain('start');
    expect(seen).not.toContain('loading');
  });

  test('360×640でも4択の下段が画面に入る', async ({ page }) => {
    await installData(page);
    await page.setViewportSize({ width: 360, height: 640 });
    await open(page, '?seed=14&p=05');
    await page.locator('#play-town').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    const bottoms = () =>
      page.locator('.choice').evaluateAll((nodes) => Math.max(...nodes.map((node) => node.getBoundingClientRect().bottom)));
    await expect(page.locator('.choice')).toHaveCount(4);
    expect(Math.round(await bottoms()), '4択が画面からはみ出す').toBeLessThanOrEqual(640);

    // ヒントで1段増えても入る（シルエットをもう一段縮める）
    await page.locator('#hint-button').click();
    await expect(page.locator('#hint')).toBeVisible();
    await expect.poll(async () => Math.round(await bottoms()), { timeout: 3000 }).toBeLessThanOrEqual(640);
  });

  test('同梱データがあれば、実データでも都道府県モードが動く', async ({ page }) => {
    test.skip(!existsSync(`${appDir}data/prefectures.json`), '同梱データがまだ無い');
    await installWiki(page);
    await open(page, '?seed=16&m=pref');
    await page.locator('#play-pref').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    expect(await page.locator('#shape-path').getAttribute('d')).toMatch(/^M .* Z$/);
    await expect(page.locator('.choice')).toHaveCount(4);
    const names = await page.locator('.choice').allTextContents();
    for (const name of names) expect(name).toMatch(/[都道府県]$/);
    await page.locator('#hint-button').click();
    await expect(page.locator('#hint-text')).toHaveText('2つに絞りました');
    await expect(page.locator('.choice[data-eliminated="true"]')).toHaveCount(2);
  });

  test('同梱データがあれば、秋田県の市町村モードも動く', async ({ page }) => {
    test.skip(!existsSync(`${appDir}data/towns/05.json`), '同梱データがまだ無い');
    await installWiki(page);
    await open(page, '?seed=17&p=05');
    await expect(page.locator('#play-town')).toHaveText('秋田県の市町村ではじめる');
    await page.locator('#play-town').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    expect(await page.locator('#shape-path').getAttribute('d')).toMatch(/^M .* Z$/);
    await expect(page.locator('.choice')).toHaveCount(4);
  });
});
