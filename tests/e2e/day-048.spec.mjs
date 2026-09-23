import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const DIR = 'day-048-dish-oracle';
const SEED = 20260923;
const PATH = `/${DIR}/?seed=${SEED}`;
const SLOT = 'day048.oracle.memory.v1';
const OPENERS = 'day048.oracle.openers.v1';
const HINT = 'day048.oracle.ringhint.v1';
const SESSION = 'day048.oracle.session.v1';
const LABELS = ['はい', 'たぶんそう', 'わからない', 'たぶん違う', 'いいえ'];
const IDS = ['yes', 'probably', 'unknown', 'probablyNot', 'no'];
const HINT_TEXT = '水晶玉のまわりの輪が、いまの読みです。100%で答えが見えます';

const errors = new WeakMap();
const external = new WeakMap();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  external.set(page, []);
  page.on('console', message => { if (message.type() === 'error') errors.get(page).push(message.text()); });
  page.on('pageerror', error => errors.get(page).push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) external.get(page).push(url.href);
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'アプリのコンソールエラー').toEqual([]);
  expect(external.get(page), '外部リクエスト').toEqual([]);
});

async function open(page, path = PATH) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}
const snapshot = page => page.evaluate(() => window.__day048.snapshot());
const stored = page => page.evaluate(slot => JSON.parse(localStorage.getItem(slot)), SLOT);
const pct = value => Math.round(value * 100);
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 新しい質問・推測が出た直後の操作は受け流す作り（二度押し対策）なので、受け付けるようになるまで待つ
const ready = page => page.waitForFunction(() => window.__day048.snapshot().accepting);

// 押した操作の結果が出そろうまで待つ（「ちがう」のあとの霧の知らせが明けるまでを含む）
async function settle(page, before) {
  await page.waitForFunction(prev => {
    const now = window.__day048.snapshot();
    return !now.busy && (now.state !== prev.state || now.count !== prev.count || now.guesses !== prev.guesses || now.top?.id !== prev.top?.id);
  }, before);
}

async function start(page) {
  await page.getByRole('button', { name: '占ってもらう' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'asking');
  await ready(page);
}

async function reply(page, label) {
  await ready(page);
  const before = await snapshot(page);
  await page.locator('#answers').getByRole('button', { name: label, exact: true }).click();
  await settle(page, before);
}

// 正直に答える人。その料理の人が「はい」と答える見込み p から選ぶ（単体テストの players.mjs と同じ区切り）
function honestLabel(page, dishId) {
  return page.evaluate(async ([id, labels]) => {
    const { probabilityOf } = await import('./lib/oracle.js');
    const p = probabilityOf(window.__day048.model(), id, window.__day048.snapshot().q);
    if (p >= 0.8) return labels[0];
    if (p >= 0.6) return labels[1];
    if (p > 0.4) return labels[2];
    if (p > 0.2) return labels[3];
    return labels[4];
  }, [dishId, LABELS]);
}

async function pressGuess(page, hit) {
  await ready(page);
  await page.getByRole('button', { name: hit ? '当たり！' : 'ちがう', exact: true }).click();
}

// 当たりか参りましたまで進める。rejectAll のときは推測をすべて「ちがう」にする
async function play(page, dishId, { rejectAll = false } = {}) {
  for (let turn = 0; turn < 80; turn++) {
    const now = await snapshot(page);
    if (now.state === 'asking') await reply(page, await honestLabel(page, dishId));
    else if (now.state === 'guessing') {
      const hit = !rejectAll && now.guess === dishId;
      await pressGuess(page, hit);
      if (hit) return;
      await settle(page, now);
    } else return;
  }
  throw new Error('占いが終わらない');
}

async function askUntilGuess(page, dishId) {
  for (let turn = 0; turn < 40 && (await snapshot(page)).state === 'asking'; turn++) await reply(page, await honestLabel(page, dishId));
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'guessing');
}

test('はじめの画面から「占ってもらう」で、質問と答え5つ・問数・推測の残りが出る', async ({ page }) => {
  await open(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'intro');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('いま食べたいもの、当てます');
  await expect(page.locator('.lead')).toHaveText('料理をひとつ、思い浮かべてください。まだ決まっていなければ、いまの気分のままで。水晶玉が、あなたの心にある一皿を読みます。');
  await start(page);
  const { q } = await snapshot(page);
  const text = await page.evaluate(async id => (await import('./lib/questions.js')).QUESTION_BY_ID.get(id).text, q);
  await expect(page.locator('#counter')).toHaveText('1問目／25');
  await expect(page.locator('#guesses-left')).toHaveText('推測 あと3回');
  // 見出しの中で「それは、」を別の行に組んでいるので、読み上げ名には区切りの空白が入る。文字列そのもので照合する
  await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveText(`それは、${text}`);
  const answers = page.getByRole('group', { name: text }).getByRole('button');
  await expect(answers).toHaveCount(5);
  for (const [index, label] of LABELS.entries()) await expect(answers.nth(index)).toHaveAccessibleName(label);
  await expect(page.getByRole('button', { name: 'ひとつ戻る' })).toBeDisabled();
  // 舞台は飾りとして読み上げから外す（まぼろしで答えが漏れないように）。浮かび上がる絵も推測の前は外す
  await expect(page.locator('.stage')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#reveal')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#reading')).toHaveAttribute('aria-hidden', 'true');
});

test('カレーライスを正直に答えると当たり、料理の絵と決め手と結果の共有が出て、答え方を覚える', async ({ page }) => {
  await open(page);
  await start(page);
  await play(page, 'curry');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'won');
  const result = await snapshot(page);
  // 1回目の推測で当たったときだけ「やはり」
  await expect(page.locator('#won-title')).toHaveText(result.guesses
    ? '見えました。カレーライスですね。'
    : 'やはり、カレーライスでしたか。');
  await expect(page.locator('#won-title')).toBeVisible();
  await expect(page.locator('#won-count')).toHaveText(result.guesses
    ? `${result.count}問と、推測${result.guesses + 1}回で見えました。`
    : `${result.count}問で見えました。`);
  // 料理名の上に3Dの絵。結果の画面では料理名を代替テキストにする
  const picture = page.locator('#reveal img');
  await expect(page.locator('#reveal')).toHaveAttribute('aria-hidden', 'false');
  await expect(picture).toHaveAttribute('src', 'assets/dishes/curry.webp');
  await expect(picture).toHaveAttribute('alt', 'カレーライス');
  await expect.poll(() => picture.evaluate(img => img.complete && img.naturalWidth)).toBe(320);
  const reasons = page.locator('#decider-list li');
  expect(await reasons.count()).toBeGreaterThanOrEqual(1);
  expect(await reasons.count()).toBeLessThanOrEqual(3);
  await expect(reasons.first()).toHaveText(/？ → (はい|たぶんそう|たぶん違う|いいえ)$/);
  await expect(page.locator('#won-memory')).toHaveText('この答え方を覚えました。次はもっと早く読めます。');
  // 料理を決めて答えた人には、提案の一行を出さない
  await expect(page.locator('#won-suggest')).toBeHidden();
  // 前の質問の読み上げを残さない
  await expect(page.locator('#live')).toHaveText('');

  const x = page.locator('.result-share').getByRole('link', { name: 'Xで結果を投稿' });
  await expect(x).toHaveAttribute('rel', 'noopener noreferrer');
  const href = new URL(await x.getAttribute('href'));
  expect(`${href.origin}${href.pathname}`).toBe('https://x.com/intent/post');
  expect(href.searchParams.get('text')).toBe(`いま食べたいもの、当てます — 水晶玉に「カレーライス」を${result.count}問で見抜かれた。`);
  expect(href.searchParams.get('url')).toBe(`https://hundred-days.pages.dev/${DIR}/`);

  const memory = await stored(page);
  expect(memory).toMatchObject({ v: 1, plays: 1, wins: 1, custom: [] });
  expect(Object.keys(memory.dishes)).toEqual(['curry']);
  expect(Object.keys(memory.dishes.curry).length).toBeGreaterThan(0);
  expect((await snapshot(page)).learned).toBe(1);
});

test('まぼろしは読みの料理の絵で、読みが上がるほど濃くなる', async ({ page }) => {
  await open(page);
  await start(page);
  const look = () => page.evaluate(() => {
    const now = window.__day048.snapshot();
    const img = document.querySelector('.vision__layer.is-on img');
    return {
      mode: document.querySelector('.vision').dataset.mode,
      src: img?.getAttribute('src'),
      alt: img?.getAttribute('alt'),
      expected: `assets/dishes/${now.reading.id}.webp`,
      clarity: Number(document.getElementById('stage').style.getPropertyValue('--clarity')),
      target: Math.sqrt(now.reading.value),
    };
  });
  const first = await look();
  let last = first;
  for (let turn = 0; turn < 40 && (await snapshot(page)).state === 'asking'; turn++) {
    last = await look();
    expect(last.mode).toBe('haze');
    expect(last.src).toBe(last.expected);
    // まぼろしは先にネタバレしないよう、代替テキストを空にする
    expect(last.alt).toBe('');
    expect(last.clarity).toBeCloseTo(last.target, 2);
    await reply(page, await honestLabel(page, 'takoyaki'));
  }
  expect(last.clarity).toBeGreaterThan(first.clarity + 0.3);
});

test('読みの輪：答えるほど満ち、推測の画面でだけ100%になって光る。読み上げは値と上下を伝える', async ({ page }) => {
  await open(page);
  await start(page);
  const ring = () => page.evaluate(() => ({
    label: document.getElementById('reading-value').textContent,
    offset: Number(document.getElementById('ring-fill').style.strokeDashoffset),
    full: document.getElementById('ring').classList.contains('is-full'),
  }));
  let values = [];
  for (let turn = 0; turn < 40 && (await snapshot(page)).state === 'asking'; turn++) {
    const now = await snapshot(page);
    const shown = await ring();
    expect(shown.label).toBe(`${pct(now.reading.value)}%`);
    expect(shown.offset).toBe(100 - pct(now.reading.value));
    expect(pct(now.reading.value)).toBeLessThan(100);
    expect(shown.full).toBe(false);
    values.push(now.reading.value);
    await reply(page, await honestLabel(page, 'curry'));
    if ((await snapshot(page)).state === 'asking') {
      await expect(page.locator('#live')).toHaveText(/^読み \d+%、(\d+ポイント(上がりました|下がりました)|変わりません)。\d+問目。それは、.+？$/);
    }
  }
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'guessing');
  expect((await snapshot(page)).reading.value).toBe(1);
  await expect(page.locator('#guess-lead')).toHaveText('あなたの心にあるのは……');
  await expect(page.locator('#reading-value')).toHaveText('100%');
  const shown = await ring();
  expect(shown.offset).toBe(0);
  expect(shown.full).toBe(true);
  expect(values.at(-1)).toBeGreaterThan(values[0]);
});

test('答えで読みが上がれば金の「↑ +N%」、下がれば赤の「↓ −N%」。下がると失った分の輪が赤く光り、占い師が驚く', async ({ page }) => {
  await open(page);
  await start(page);
  let sawUp = false;
  for (let turn = 0; turn < 12 && !sawUp; turn++) {
    const before = await snapshot(page);
    await reply(page, await honestLabel(page, 'curry'));
    const after = await snapshot(page);
    if (after.state !== 'asking') break;
    const change = pct(after.reading.value) - pct(before.reading.value);
    if (change > 0) {
      await expect(page.locator('#delta')).toHaveText(`↑ +${change}%`);
      await expect(page.locator('#delta')).toHaveAttribute('data-dir', 'up');
      await expect(page.locator('.stage')).toHaveAttribute('data-mood', 'thinking');
      sawUp = true;
    }
  }
  expect(sawUp, '上がる札を一度も見なかった').toBe(true);
  // カレーを思い浮かべたまま、途中で1問だけ逆の答えを入れる。読みが下がる問を、画面と同じ推理で先に確かめてから押す
  let sawDown = false;
  for (let turn = 0; turn < 15 && !sawDown && (await snapshot(page)).state === 'asking'; turn++) {
    const honest = await honestLabel(page, 'curry');
    const flipped = LABELS[4 - LABELS.indexOf(honest)];
    const drop = flipped === 'わからない' ? null : await page.evaluate(async id => {
      const oracle = await import('./lib/oracle.js');
      const now = window.__day048.snapshot();
      const model = window.__day048.model();
      const next = oracle.answer(window.__day048.game(), now.q, id);
      // 推測や参りましたに変わる答えは除く（質問が続く場面で、下がる札を確かめる）
      const step = oracle.nextStep(model, next);
      if (step.type !== 'ask') return null;
      return Math.round(oracle.reading(model, next, step).value * 100) - Math.round(now.reading.value * 100);
    }, IDS[LABELS.indexOf(flipped)]);
    if (drop === null || drop >= 0 || drop <= -100) {
      await reply(page, honest);
      continue;
    }
    await reply(page, flipped);
    const after = await snapshot(page);
    expect(after.state).toBe('asking');
    await expect(page.locator('#delta')).toHaveText(`↓ −${-drop}%`);
    await expect(page.locator('#delta')).toHaveAttribute('data-dir', 'down');
    await expect(page.locator('#delta')).toHaveClass(/is-shown/);
    await expect(page.locator('#ring-loss')).toHaveClass(/is-losing/);
    await expect(page.locator('.stage')).toHaveAttribute('data-mood', 'surprised');
    await expect(page.locator('#live')).toHaveText(new RegExp(`^読み ${pct(after.reading.value)}%、${-drop}ポイント下がりました。`));
    // 軌跡の最後の点は「下がった点」
    await expect(page.locator('#trail .trail__point').last()).toHaveClass(/is-down/);
    sawDown = true;
  }
  expect(sawDown, '読みが下がる逆の答えが見つからなかった').toBe(true);
  // 札は1秒ほどで消える
  await expect(page.locator('#delta')).not.toHaveClass(/is-shown/, { timeout: 3000 });
});

test('読みの軌跡の点の数は答えた問数と一致し、ひとつ戻ると減る', async ({ page }) => {
  await open(page);
  await start(page);
  const points = page.locator('#trail .trail__point');
  await expect(points).toHaveCount(0);
  for (let count = 1; count <= 4; count++) {
    await reply(page, await honestLabel(page, 'ramen'));
    await expect(points).toHaveCount(count);
    expect((await snapshot(page)).points).toBe(count);
  }
  expect((await page.locator('#trail-line').getAttribute('points')).split(' ')).toHaveLength(4);
  // 序盤の点は左端に固まらず、16px ほどの間隔で並ぶ（25問ぶんの目盛りだと4.75px間隔の数珠になっていた）
  const xs = await points.evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('cx'))));
  for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(15);
  await page.getByRole('button', { name: 'ひとつ戻る' }).click();
  await expect(points).toHaveCount(3);
});

test('2問答えて「ひとつ戻る」と、問数が戻り、1つ前と同じ質問が出る', async ({ page }) => {
  await open(page);
  await start(page);
  const back = page.getByRole('button', { name: 'ひとつ戻る' });
  const first = await page.locator('#question').textContent();
  await reply(page, 'はい');
  await expect(page.locator('#counter')).toHaveText('2問目／25');
  const second = await page.locator('#question').textContent();
  const secondId = (await snapshot(page)).q;
  await expect(page.locator('#live')).toHaveText(new RegExp(`^読み \\d+%、.+。2問目。${escape(second)}$`));
  await reply(page, 'いいえ');
  await expect(page.locator('#counter')).toHaveText('3問目／25');
  await back.click();
  await expect(page.locator('#counter')).toHaveText('2問目／25');
  await expect(page.locator('#question')).toHaveText(second);
  // 戻したときは上下を言わず、値だけ伝える
  await expect(page.locator('#live')).toHaveText(new RegExp(`^読み \\d+%。2問目。${escape(second)}$`));
  expect(await snapshot(page)).toMatchObject({ count: 1, q: secondId, answers: ['yes'] });
  await back.click();
  await expect(page.locator('#counter')).toHaveText('1問目／25');
  await expect(page.locator('#question')).toHaveText(first);
  await expect(back).toBeDisabled();
});

test('キーボードの1〜5で答え、BackspaceとZで戻る。修飾キー付きは無視する', async ({ page }) => {
  await open(page);
  await start(page);
  const first = await page.locator('#question').textContent();
  await page.keyboard.press('1');
  await expect(page.locator('#counter')).toHaveText('2問目／25');
  const second = await page.locator('#question').textContent();
  await ready(page);
  await page.keyboard.press('5');
  await expect(page.locator('#counter')).toHaveText('3問目／25');
  expect((await snapshot(page)).answers).toEqual(['yes', 'no']);
  await page.keyboard.press('Backspace');
  await expect(page.locator('#counter')).toHaveText('2問目／25');
  await expect(page.locator('#question')).toHaveText(second);
  await page.keyboard.press('z');
  await expect(page.locator('#counter')).toHaveText('1問目／25');
  await expect(page.locator('#question')).toHaveText(first);
  await ready(page);
  await page.keyboard.press('Control+2');
  await page.keyboard.press('Meta+3');
  expect((await snapshot(page)).count).toBe(0);
  for (const [index, key] of ['2', '3', '4'].entries()) {
    await ready(page);
    await page.keyboard.press(key);
    await expect(page.locator('#counter')).toHaveText(`${index + 2}問目／25`);
  }
  await expect(page.locator('#counter')).toHaveText('4問目／25');
  expect((await snapshot(page)).answers).toEqual(['probably', 'unknown', 'probablyNot']);
});

test('二度押しで2問進まない：新しい質問から350ms、開始直後の1問目は400msのあいだ答えを受け流す', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  // 開始の2連続タップ（260ms）。「占ってもらう」のあった位置には、1問目の答えのボタンが来る
  const startBox = await page.getByRole('button', { name: '占ってもらう' }).boundingBox();
  const sx = startBox.x + startBox.width / 2;
  const sy = startBox.y + startBox.height / 2;
  await page.mouse.click(sx, sy);
  await page.waitForTimeout(260);
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('#answers button') !== null, [sx, sy]), '開始ボタンの位置に答えのボタンが来ていない').toBe(true);
  await page.mouse.click(sx, sy);
  await page.waitForTimeout(250);
  expect((await snapshot(page)).count).toBe(0);
  await ready(page);
  const box = await page.locator('#answers').getByRole('button', { name: 'わからない', exact: true }).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // 90ms・300ms の2連続タップ（体験評価で2問進んだ押し方）
  for (const [index, gap] of [90, 300].entries()) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(gap);
    await page.mouse.click(x, y);
    await expect(page.locator('#counter')).toHaveText(`${index + 2}問目／25`);
    await page.waitForTimeout(400);
    expect((await snapshot(page)).count, `${gap}ms の二度押しで2問進んだ`).toBe(index + 1);
  }
  // キーの二度押しも同じ
  await ready(page);
  await page.keyboard.press('3');
  await page.keyboard.press('3');
  await expect(page.locator('#counter')).toHaveText('4問目／25');
  await page.waitForTimeout(400);
  expect((await snapshot(page)).count).toBe(3);
  // 待てば、次の答えは受け付ける
  await page.mouse.click(x, y);
  await expect(page.locator('#counter')).toHaveText('5問目／25');
});

test('推測にはキーボードでも答えられる（Nでちがう→霧の知らせのあと質問へ、Yで当たり）', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await start(page);
  // 肉じゃがは、1回目の推測（肉じゃが）を外しても推測できる見込みの料理が残り、霧の知らせのあと質問に戻る
  // （たこ焼きなどは、外すと食い違わない料理が尽きて、すぐ参りましたになる）
  let sawMist = false;
  for (let turn = 0; turn < 80 && !sawMist; turn++) {
    const now = await snapshot(page);
    if (now.state === 'asking') {
      await reply(page, await honestLabel(page, 'nikujaga'));
      continue;
    }
    expect(now.state).toBe('guessing');
    // まぼろしは推測した料理の絵で、はっきり映す。浮かび上がる絵の代替テキストは料理名
    const item = await page.evaluate(async id => (await import('./lib/oracle.js')).itemOf(window.__day048.model(), id), now.guess);
    await expect(page.locator('.vision')).toHaveAttribute('data-mode', 'clear');
    await expect(page.locator('.vision__layer.is-on img')).toHaveAttribute('src', `assets/dishes/${now.guess}.webp`);
    await expect(page.locator('#reveal img')).toHaveAttribute('alt', item.name);
    await expect(page.locator('.key-hint--guessing')).toBeVisible();
    await ready(page); // 推測が出た直後のキーは受け流す作り
    await page.keyboard.press('n');
    const after = await snapshot(page);
    expect(after.guesses).toBe(now.guesses + 1);
    if (!after.busy) {
      // 外した直後に次の料理の確信が基準を超えていれば、質問を挟まずに次の推測になる
      await settle(page, now);
      continue;
    }
    sawMist = true;
    await expect(page.locator('#guess-mist')).toBeVisible();
    await expect(page.locator('#guess-mist')).toHaveText('……まだ霧が晴れません。もう少し聞かせてください。');
    await expect(page.locator('.stage')).toHaveAttribute('data-mood', 'surprised');
    // 外れで読みが100%から下がったことを、札と読み上げで伝える。霧の間はキーのヒントを隠す
    await expect(page.locator('#delta')).toHaveText(`↓ −${100 - pct(after.reading.value)}%`);
    await expect(page.locator('#live')).toHaveText(`読み ${pct(after.reading.value)}%、${100 - pct(after.reading.value)}ポイント下がりました。まだ霧が晴れません。もう少し聞かせてください。`);
    await expect(page.locator('.key-hint--guessing')).toBeHidden();
    await expect(page.locator('#reveal')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'asking');
    await expect(page.locator('#counter')).toHaveText(`${after.count + 1}問目／25`);
    await expect(page.locator('#guesses-left')).toHaveText(`推測 あと${2 - now.guesses}回`);
    await expect(page.locator('#live')).toHaveText('');
  }
  expect(sawMist, '霧の知らせを一度も見なかった').toBe(true);
  await askUntilGuess(page, 'nikujaga');
  await ready(page);
  await page.keyboard.press('y');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'won');
  await expect(page.locator('.stage')).toHaveAttribute('data-mood', 'confident');
});

test('2回目以降の推測で当たったときは「見えました。◯◯ですね。」', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await start(page);
  // 肉じゃがを思い浮かべ、1回目の推測を外す。答え続けると別の料理を推測するので、それを当たりにする
  await askUntilGuess(page, 'nikujaga');
  let now = await snapshot(page);
  await pressGuess(page, false);
  await settle(page, now);
  for (let turn = 0; turn < 40 && (await snapshot(page)).state === 'asking'; turn++) await reply(page, await honestLabel(page, 'nikujaga'));
  now = await snapshot(page);
  expect(now.state).toBe('guessing');
  const name = await page.locator('#guess-name').textContent();
  await pressGuess(page, true);
  await expect(page.locator('#won-title')).toHaveText(`見えました。${name}ですね。`);
});

test('気分で答えた人への推測は提案として出し、当たったら「迷っていたなら、今夜はこれで。」を添える', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await start(page);
  // 「はい」「いいえ」と言い切らず「たぶん」で答える人（まだ料理を決めていない人に多い答え方）
  const soft = label => (label === 'はい' ? 'たぶんそう' : label === 'いいえ' ? 'たぶん違う' : label);
  for (let turn = 0; turn < 40 && (await snapshot(page)).state === 'asking'; turn++) await reply(page, soft(await honestLabel(page, 'curry')));
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'guessing');
  expect((await snapshot(page)).suggest).toBe(true);
  await expect(page.locator('#guess-lead')).toHaveText('迷っているなら……');
  await expect(page.locator('#guess-name')).not.toHaveText('');
  await pressGuess(page, true);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'won');
  await expect(page.locator('#won-suggest')).toBeVisible();
  await expect(page.locator('#won-suggest')).toHaveText('迷っていたなら、今夜はこれで。');
});

for (const width of [768, 1440]) test(`${width}pxの推測の画面では、「ひとつ戻る」を当たり／ちがうの行の左端にそろえる`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await start(page);
  await askUntilGuess(page, 'takoyaki');
  const boxes = await page.evaluate(() => ({
    back: document.getElementById('back').getBoundingClientRect().toJSON(),
    row: document.querySelector('.guess__buttons').getBoundingClientRect().toJSON(),
  }));
  expect(Math.abs(boxes.back.left - boxes.row.left)).toBeLessThanOrEqual(1);
  expect(boxes.back.top).toBeGreaterThanOrEqual(boxes.row.bottom);
});

test('推測を外して推測できる料理が尽きると（25問・3回を待たずに）教える画面になり、一覧に無い料理を教えると次から覚えている', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await start(page);
  // からあげを外すと、答えと食い違わない料理が残らないので、25問を待たずに参りましたになる（途中で教える画面に入る筋）
  await play(page, 'karaage', { rejectAll: true });
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'teaching');
  const { guesses, count: asked } = await snapshot(page);
  expect(guesses).toBeGreaterThanOrEqual(1);
  expect(guesses).toBeLessThanOrEqual(3);
  expect(asked).toBeLessThanOrEqual(25);
  await expect(page.locator('#teach-title')).toHaveText('参りました。あなたの心にあったのは、何ですか？');
  await expect(page.locator('#teach-title')).toBeVisible();
  await expect(page.locator('.stage')).toHaveAttribute('data-mood', 'defeated');
  await expect(page.locator('#live')).toHaveText('');

  const input = page.getByLabel('料理の名前');
  const submit = page.locator('#teach-new');
  // 入力欄には一覧に無い料理の例。空のうちの「この名前で教える」は、金の半透明ではなく枠線だけの押せない見た目
  await expect(input).toHaveAttribute('placeholder', '例：ナシゴレン');
  await expect(submit).toBeDisabled();
  const look = await submit.evaluate(node => { const style = getComputedStyle(node); return { image: style.backgroundImage, color: style.backgroundColor, border: style.borderTopWidth, opacity: style.opacity }; });
  expect(look).toEqual({ image: 'none', color: 'rgba(0, 0, 0, 0)', border: '1px', opacity: '1' });
  await input.fill('から');
  const candidate = page.locator('#candidates').getByRole('button', { name: 'からあげ' });
  await expect(candidate).toBeVisible();
  // 候補には小さな料理の絵（飾りなので代替テキストは空）
  await expect(candidate.locator('img')).toHaveAttribute('src', 'assets/dishes/karaage.webp');
  await expect(candidate.locator('img')).toHaveAttribute('alt', '');
  await input.fill('');
  await expect(submit).toBeDisabled();
  await expect(page.locator('#teach-error')).toHaveText('料理の名前を入れてください。');
  await input.fill('あ'.repeat(21));
  await expect(submit).toBeDisabled();
  await expect(page.locator('#teach-error')).toHaveText('20文字以内で入れてください。');
  await input.fill('ばあちゃんの煮しめ');
  await expect(page.locator('#teach-error')).toHaveText('');
  await page.getByRole('button', { name: '「ばあちゃんの煮しめ」として教える' }).click();

  await expect(page.locator('#app')).toHaveAttribute('data-state', 'taught');
  await expect(page.locator('#taught-title')).toHaveText('覚えました。次は「ばあちゃんの煮しめ」も読めます。');
  await expect(page.locator('#taught-title')).toBeVisible();
  // 広い画面でも「覚えました。」のあとで改行し、2行に収める（「…」も／読めます。」と最後だけ落とさない）
  const lines = await page.locator('#taught-title').evaluate(node => {
    const first = node.querySelector('.phrase--line').getBoundingClientRect();
    const rest = [...node.querySelectorAll('.chunk')].map(chunk => Math.round(chunk.getBoundingClientRect().top));
    return { height: node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight), firstBottom: first.bottom, restTops: [...new Set(rest)] };
  });
  expect(Math.round(lines.height)).toBe(2);
  expect(lines.restTops).toHaveLength(1);
  expect(lines.restTops[0]).toBeGreaterThanOrEqual(Math.floor(lines.firstBottom) - 1);
  // 一覧に無い料理は、覆いをかけた皿の絵
  await expect(page.locator('#reveal img')).toHaveAttribute('src', 'assets/dishes/mystery.webp');
  await expect(page.locator('#reveal img')).toHaveAttribute('alt', 'ばあちゃんの煮しめ');
  const { count } = await snapshot(page);
  const href = new URL(await page.locator('.result-share').getByRole('link', { name: 'Xで結果を投稿' }).getAttribute('href'));
  expect(href.searchParams.get('text')).toBe(`いま食べたいもの、当てます — 水晶玉を${count}問で降参させた。`);
  const memory = await stored(page);
  expect(memory).toMatchObject({ plays: 1, wins: 0, dishes: {} });
  expect(memory.custom).toEqual([expect.objectContaining({ id: 'u1', name: 'ばあちゃんの煮しめ' })]);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#memory')).toContainText('この水晶玉は、この端末で1品の答え方を覚えています');
  expect(await page.evaluate(() => window.__day048.model().items.some(item => item.custom && item.name === 'ばあちゃんの煮しめ'))).toBe(true);
});

test('一覧にある料理は候補を押すだけで教えられ、「教えずに終える」は終わりの画面を出す', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await start(page);
  await play(page, 'karaage', { rejectAll: true });
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'teaching');
  await page.getByLabel('料理の名前').fill('からあ');
  await page.locator('#candidates').getByRole('button', { name: 'からあげ' }).click();
  await expect(page.locator('#taught-title')).toHaveText('覚えました。次は「からあげ」も読めます。');
  await expect(page.locator('#reveal img')).toHaveAttribute('src', 'assets/dishes/karaage.webp');
  expect(Object.keys((await stored(page)).dishes)).toEqual(['karaage']);
  await page.getByRole('button', { name: 'もう一度占う' }).click();
  await expect(page.locator('#counter')).toHaveText('1問目／25');
  await ready(page);
  await play(page, 'sushi', { rejectAll: true });
  const { count, guesses } = await snapshot(page);
  // 「教えずに終える」は、いきなり始めの画面に戻さず、終わりの画面（結果の共有・もう一度）を出す。何も覚えない
  await page.getByRole('button', { name: '教えずに終える' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ended');
  await expect(page.locator('#ended-title')).toHaveText('また占わせてください');
  await expect(page.locator('#ended-title')).toBeFocused();
  await expect(page.locator('#ended-count')).toHaveText(guesses ? `${count}問と、推測${guesses}回では見えませんでした。` : `${count}問では見えませんでした。`);
  const href = new URL(await page.locator('.result-share').getByRole('link', { name: 'Xで結果を投稿' }).getAttribute('href'));
  expect(href.searchParams.get('text')).toBe(`いま食べたいもの、当てます — 水晶玉を${count}問で降参させた。`);
  await expect(page.locator('.stage')).toHaveAttribute('data-mood', 'defeated');
  expect(await stored(page)).toMatchObject({ plays: 1 });
  await page.getByRole('button', { name: 'もう一度占う' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'asking');
});

test('料理の絵が読めないときは、まぼろし・浮かび上がる絵・候補とも絵文字に戻る', async ({ page }) => {
  await page.route(url => url.pathname.startsWith(`/${DIR}/assets/dishes/`), route => route.fulfill({ status: 404, body: 'not found' }));
  await open(page);
  await start(page);
  await askUntilGuess(page, 'takoyaki');
  const { guess } = await snapshot(page);
  const item = await page.evaluate(async id => (await import('./lib/oracle.js')).itemOf(window.__day048.model(), id), guess);
  await expect(page.locator('.vision__layer.is-on img')).toHaveCount(0);
  await expect(page.locator('.vision__layer.is-on .art__emoji')).toBeVisible();
  await expect(page.locator('.vision__layer.is-on .art__emoji')).toHaveText(item.emoji);
  const reveal = page.locator('#reveal .art__emoji');
  await expect(page.locator('#reveal img')).toHaveCount(0);
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveText(item.emoji);
  // 絵の代わりの絵文字にも料理名を持たせる
  await expect(reveal).toHaveAttribute('role', 'img');
  await expect(reveal).toHaveAttribute('aria-label', item.name);
  // 読めなかった絵の 404 はブラウザがコンソールに出す。アプリのエラーではないので除く
  errors.set(page, errors.get(page).filter(message => !/Failed to load resource/.test(message)));
});

test('保存が使えない端末では、その旨を出して、そのまま遊べる', async ({ page }) => {
  await page.addInitScript(() => {
    const deny = () => { throw new DOMException('denied', 'SecurityError'); };
    Storage.prototype.getItem = deny;
    Storage.prototype.setItem = deny;
    Storage.prototype.removeItem = deny;
  });
  await open(page);
  await expect(page.locator('#storage-off')).toHaveText('この端末では覚えられない設定になっています。占いはそのまま遊べます。');
  await expect(page.locator('#storage-off')).toBeVisible();
  await expect(page.locator('#memory')).toBeHidden();
  expect((await snapshot(page)).storage).toEqual({ available: false, repaired: false });
  await start(page);
  // 輪の説明は、覚えられない端末でもこのタブで1回だけ
  await expect(page.locator('#ring-hint')).toBeVisible();
  await play(page, 'takoyaki');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'won');
  await expect(page.locator('#won-memory')).toHaveText('この端末では覚えられませんでした。');
  await page.getByRole('button', { name: 'もう一度占う' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'asking');
  await expect(page.locator('#ring-hint')).toBeHidden();
});

test('壊れた記録は捨ててまっさらから。一部だけ読めないときは、その分だけ忘れる', async ({ page }) => {
  await open(page);
  await page.evaluate(slot => localStorage.setItem(slot, '{"v":1,"dishes":{'), SLOT);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const notice = page.locator('#storage-repaired');
  await expect(notice).toHaveText('覚えていた記録が読めなかったので、まっさらからにしました。');
  await expect(notice).toHaveAttribute('role', 'status');
  expect((await snapshot(page)).storage).toEqual({ available: true, repaired: true });
  // 読めた分で書き戻したので、次に開いたときは知らせない
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(notice).toBeHidden();

  await page.evaluate(slot => localStorage.setItem(slot, JSON.stringify({ v: 1, dishes: { curry: { hot: [1, 1] }, nosuch: { hot: [1, 1] } }, custom: [], plays: 1, wins: 1 })), SLOT);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(notice).toHaveText('覚えていた記録の一部が読めなかったので、その分は忘れました。');
  await expect(page.locator('#memory')).toContainText('1品');
  await start(page);
  await expect(notice).toBeHidden();
});

test('覚えたことは、確認してから忘れさせる', async ({ page }) => {
  await open(page);
  const memory = { v: 1, dishes: { curry: { hot: [1, 1] } }, custom: [{ id: 'u1', name: 'ばあちゃんの煮しめ', answers: {} }], plays: 2, wins: 1 };
  await page.evaluate(([slot, value]) => localStorage.setItem(slot, JSON.stringify(value)), [SLOT, memory]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#memory')).toContainText('この端末で2品の答え方を覚えています');

  const dialog = page.getByRole('dialog', { name: '覚えたことを忘れさせますか？' });
  await page.getByRole('button', { name: '覚えたことを忘れさせる' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('教えた料理と答え方をこの端末から消します。元に戻せません。');
  await expect(dialog.getByRole('button', { name: '消さずに戻る' })).toBeFocused();
  await dialog.getByRole('button', { name: '消さずに戻る' }).click();
  await expect(dialog).toBeHidden();
  expect(await stored(page)).toEqual(memory);

  await page.getByRole('button', { name: '覚えたことを忘れさせる' }).click();
  await dialog.getByRole('button', { name: '忘れさせる', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#memory')).toBeHidden();
  await expect(page.locator('#memory-said')).toHaveText('覚えたことを忘れさせました。');
  expect(await page.evaluate(slot => localStorage.getItem(slot), SLOT)).toBeNull();
  expect((await snapshot(page)).learned).toBe(0);
});

test('390×664では、どの質問でも質問文・答え5つ・ひとつ戻るがスクロールせずに見え、質問が替わっても答えのボタンが動かない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await start(page);
  // いまの質問に加えて、全部の質問文を札に入れて測る（2行になる長い質問でも収まり、札の高さが変わらないこと）
  const result = await page.evaluate(async () => {
    const { QUESTIONS } = await import('./lib/questions.js');
    const nodes = () => [document.getElementById('question'), ...document.querySelectorAll('#answers button'), document.getElementById('back')];
    const fits = () => nodes().every(node => { const box = node.getBoundingClientRect(); return box.height > 0 && box.top >= 0 && box.bottom <= innerHeight; });
    const misses = fits() ? [] : ['（最初の質問）'];
    const holder = document.getElementById('question-text');
    const lineHeight = parseFloat(getComputedStyle(holder).lineHeight);
    const original = holder.textContent;
    const tops = new Set();
    const cards = new Set();
    const tooLong = [];
    for (const question of QUESTIONS) {
      holder.textContent = question.text;
      if (!fits()) misses.push(question.text);
      if (holder.getBoundingClientRect().height > lineHeight * 2 + 1) tooLong.push(question.text);
      tops.add(Math.round(document.querySelector('#answers button').getBoundingClientRect().top));
      cards.add(Math.round(document.querySelector('.card').getBoundingClientRect().height));
    }
    holder.textContent = 'タイ・ベトナム・インドなど、アジアのエスニック料理ですか？';
    const longest = holder.getBoundingClientRect().height / lineHeight;
    holder.textContent = original;
    return { misses, tooLong, tops: [...tops], cards: [...cards], longest, scrollY, heights: [...document.querySelectorAll('#answers button')].map(node => node.getBoundingClientRect().height) };
  });
  expect(result.scrollY).toBe(0);
  expect(result.misses).toEqual([]);
  expect(result.tooLong).toEqual([]);
  expect(result.longest).toBeLessThanOrEqual(2.05);
  expect(result.tops, '答えのボタンの位置が質問で変わる').toHaveLength(1);
  expect(result.cards, '質問の札の高さが質問で変わる').toHaveLength(1);
  for (const height of result.heights) expect(height).toBeGreaterThanOrEqual(44);
  // 縦に並ぶ答えの間は8px以上（6pxでは押し間違えた）
  expect(await page.locator('#answers').evaluate(node => parseFloat(getComputedStyle(node).rowGap))).toBeGreaterThanOrEqual(8);
  // 「読み 63%」は舞台の中（水晶玉の下）にあり、舞台の下の問数の行に掛からない
  const boxes = await page.evaluate(() => Object.fromEntries(['.stage', '#reading', '.progress'].map(selector => [selector, document.querySelector(selector).getBoundingClientRect().toJSON()])));
  expect(boxes['#reading'].bottom).toBeLessThanOrEqual(boxes['.stage'].bottom + 1);
  expect(boxes['#reading'].bottom).toBeLessThanOrEqual(boxes['.progress'].top + 1);
});

test('指で押す端末では、押したボタンのホバーの見た目が次の質問に残らない', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(PATH);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false);
  await page.getByRole('button', { name: '占ってもらう' }).tap();
  await page.waitForFunction(() => window.__day048.snapshot().accepting);
  const no = page.locator('#answers').getByRole('button', { name: 'いいえ', exact: true });
  const yes = page.locator('#answers').getByRole('button', { name: 'はい', exact: true });
  await no.tap();
  await expect(page.locator('#counter')).toHaveText('2問目／25');
  await page.waitForTimeout(450); // 押した答えを光らせる 300ms が明けてから比べる
  const paint = locator => locator.evaluate(node => { const style = getComputedStyle(node); return `${style.backgroundColor} ${style.borderColor}`; });
  expect(await paint(no)).toBe(await paint(yes));
  await context.close();
});

for (const width of [390, 768, 1440]) test(`${width}pxでは、どの画面でも横にはみ出さない`, async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const states = [];
  const check = async () => {
    const now = await page.evaluate(() => ({ state: window.__day048.snapshot().state, fits: document.documentElement.scrollWidth <= innerWidth }));
    states.push(now.state);
    expect(now.fits, `${now.state} で横スクロール`).toBe(true);
  };
  await check();
  await start(page);
  await check();
  await play(page, 'omurice', { rejectAll: true });
  await check();
  await page.getByLabel('料理の名前').fill('オム');
  await check();
  await page.getByLabel('料理の名前').fill('とても長い名前の、おばあちゃんの手作り煮物');
  await check();
  await page.getByLabel('料理の名前').fill('オムライス');
  await page.locator('#teach-new').click();
  await check();
  await page.getByRole('button', { name: 'もう一度占う' }).click();
  await askUntilGuess(page, 'omurice');
  await check();
  await play(page, 'omurice');
  await check();
  await page.getByRole('button', { name: 'もう一度占う' }).click();
  await play(page, 'sushi', { rejectAll: true });
  await page.getByRole('button', { name: '教えずに終える' }).click();
  await check();
  expect(new Set(states)).toEqual(new Set(['intro', 'asking', 'teaching', 'taught', 'guessing', 'won', 'ended']));
});

test('共通の共有欄は1つだけで、結果の共有行はその外に置く', async ({ page, context, browserName }) => {
  await open(page);
  await expect(page.locator('#share .share')).toHaveCount(1);
  await expect(page.locator('.share')).toHaveCount(1);
  await start(page);
  await play(page, 'takoyaki');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'won');
  await expect(page.locator('.share')).toHaveCount(1);
  await expect(page.locator('.result-share')).toHaveCount(1);
  await expect(page.locator('#share .result-share')).toHaveCount(0);
  await expect(page.locator('.result-share').getByRole('button', { name: '結果をコピー' })).toBeVisible();
  test.skip(browserName !== 'chromium', 'クリップボードの許可はChromiumでだけ与えられる');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { count } = await snapshot(page);
  await page.getByRole('button', { name: '結果をコピー' }).click();
  await expect(page.locator('#result-said')).toHaveText('結果をコピーしました');
  expect(await page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`いま食べたいもの、当てます — 水晶玉に「たこ焼き」を${count}問で見抜かれた。\nhttps://hundred-days.pages.dev/${DIR}/`);
});

test('「最初から」は舞台の右上にあり、3問以上答えていたら確かめてから始めの画面へ戻る', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await start(page);
  const restart = page.getByRole('button', { name: '最初から' });
  // 答えのボタンから離す（いまは舞台の右上。質問の札より上）
  const place = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect();
    return { restart: box('#restart').toJSON(), stage: box('.stage').toJSON(), card: box('.card').toJSON() };
  });
  expect(place.restart.bottom).toBeLessThanOrEqual(place.stage.bottom);
  expect(place.restart.bottom).toBeLessThan(place.card.top);
  expect(place.restart.right).toBeGreaterThan(place.stage.right - 4);
  // 2問までは確かめずに戻る
  await reply(page, 'はい');
  await restart.click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'intro');
  await start(page);
  for (const label of ['はい', 'いいえ', 'わからない']) await reply(page, label);
  const dialog = page.getByRole('dialog', { name: '最初からにしますか？' });
  await restart.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('ここまでの答えは消えます。');
  await expect(dialog.getByRole('button', { name: '続ける' })).toBeFocused();
  // ダイアログを開いている間は、キーで答えられない
  await page.keyboard.press('1');
  await dialog.getByRole('button', { name: '続ける' }).click();
  await expect(dialog).toBeHidden();
  expect(await snapshot(page)).toMatchObject({ state: 'asking', count: 3 });
  await restart.click();
  await dialog.getByRole('button', { name: '最初から' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'intro');
  await expect(page.locator('#start')).toBeFocused();
  // 推測の画面からも戻れる
  await start(page);
  await askUntilGuess(page, 'takoyaki');
  await restart.click();
  await dialog.getByRole('button', { name: '最初から' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'intro');
  // 結果の画面からは確かめずに戻り、「もう一度占う」は次の種で質問から始める
  await start(page);
  await play(page, 'takoyaki');
  await restart.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'intro');
  await start(page);
  await play(page, 'takoyaki');
  await page.locator('#again').click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'asking');
  expect(await snapshot(page)).toMatchObject({ count: 0, guesses: 0 });
  // 同じ種・同じ手数・同じ避ける出だしなら同じ質問（6回目の占いは種+5）
  const expected = await page.evaluate(async ([seed, slot]) => {
    const oracle = await import('./lib/oracle.js');
    const avoid = window.__day048.game().avoid;
    if (JSON.stringify(avoid) !== localStorage.getItem(slot)) throw new Error('直前の出だしを避けていない');
    return oracle.nextStep(window.__day048.model(), oracle.newGame(seed, { avoid })).q;
  }, [SEED + 5, OPENERS]);
  expect((await snapshot(page)).q).toBe(expected);
});

test('直前の占いの最初の2問を端末に覚え、次の占いの出だしで避ける', async ({ page }) => {
  await open(page);
  await start(page);
  const first = (await snapshot(page)).q;
  await reply(page, 'わからない');
  const second = (await snapshot(page)).q;
  await reply(page, 'わからない');
  expect(await page.evaluate(slot => JSON.parse(localStorage.getItem(slot)), OPENERS)).toEqual([first, second]);
  // 読み込み直しても（localStorage に残るので）効く。再読み込みで続きから始まった占いは、2問なので確かめずに最初へ戻る
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'asking');
  await page.getByRole('button', { name: '最初から' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'intro');
  await start(page);
  const next = (await snapshot(page)).q;
  expect([first, second]).not.toContain(next);
  expect((await page.evaluate(() => window.__day048.game())).avoid).toEqual([first, second]);
});

test('読みの輪の説明は、この端末で最初の1問目にだけ出る', async ({ page }) => {
  await open(page);
  await start(page);
  const hint = page.locator('#ring-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText(HINT_TEXT);
  await reply(page, 'わからない');
  await expect(hint).toBeHidden();
  await page.getByRole('button', { name: '最初から' }).click();
  await start(page);
  await expect(hint).toBeHidden();
  expect(await page.evaluate(slot => localStorage.getItem(slot), HINT)).toBe('1');
  await page.evaluate(slot => sessionStorage.removeItem(slot), SESSION);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await start(page);
  await expect(hint).toBeHidden();
});

test('途中で再読み込みしても続きから遊べる。壊れた続きは捨てて始めの画面から', async ({ page }) => {
  await open(page);
  await start(page);
  for (const label of ['はい', 'いいえ', 'たぶんそう']) await reply(page, label);
  const before = await snapshot(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const after = await snapshot(page);
  expect(after).toMatchObject({ state: 'asking', count: 3, q: before.q, answers: before.answers, guesses: 0 });
  expect(after.reading.value).toBeCloseTo(before.reading.value, 6);
  await expect(page.locator('#counter')).toHaveText('4問目／25');
  await expect(page.locator('#trail .trail__point')).toHaveCount(3);
  await page.getByRole('button', { name: 'ひとつ戻る' }).click();
  await expect(page.locator('#counter')).toHaveText('3問目／25');

  for (const broken of ['{"v":1,', JSON.stringify({ v: 1, seed: 1, played: 1, answers: [{ q: 'nosuch', a: 'yes' }], rejected: [], avoid: [], missAt: null, trail: [] }), JSON.stringify({ v: 1, seed: 1, played: 1, answers: [{ q: 'hot', a: 'maybe' }], rejected: [], avoid: [], missAt: null, trail: [] })]) {
    await page.evaluate(([slot, value]) => sessionStorage.setItem(slot, value), [SESSION, broken]);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'intro');
    expect(await page.evaluate(slot => sessionStorage.getItem(slot), SESSION)).toBeNull();
  }
});

test('キーボード：始めの画面は Enter か 1 で始まり、結果の画面では Enter でもう一度。ボタンの上の Enter は奪わない', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'asking');
  await page.getByRole('button', { name: '最初から' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'intro');
  await page.keyboard.press('1');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'asking');
  await ready(page);
  await play(page, 'takoyaki');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'won');
  await ready(page);
  // 「結果をコピー」の上の Enter はコピーのまま（次の占いを始めない）
  await page.locator('#result-copy').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#result-said')).not.toHaveText('');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'won');
  await page.locator('#won-title').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'asking');
  expect((await snapshot(page)).count).toBe(0);
});

test('答えると占い師が一瞬考え、動きを減らす設定では霧が止まる', async ({ page }) => {
  await open(page);
  await start(page);
  const stage = page.locator('.stage');
  await page.locator('#answers').getByRole('button', { name: 'わからない' }).click();
  await expect(stage).toHaveAttribute('data-mood', 'thinking');
  await expect(stage).toHaveAttribute('data-mood', /idle|confident/);
  expect(await page.locator('.mist__layer--a').evaluate(node => getComputedStyle(node).animationName)).toBe('swirl');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.mist__layer--a').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  expect(await page.locator('.eyes--idle').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
  expect(await page.locator('#ring-fill').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
});

test('本番と同じCSPの下でも動く', async ({ page }) => {
  const headers = readFileSync(new URL('../../dist/_headers', import.meta.url), 'utf8').split('\n');
  const csp = headers[headers.indexOf(`/${DIR}/*`) + 1].trim().replace(/^Content-Security-Policy:\s*/, '');
  expect(csp).toContain("script-src 'self'");
  await page.route(url => url.pathname.startsWith(`/${DIR}/`), async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', event => window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await open(page);
  await start(page);
  await play(page, 'takoyaki');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'won');
  await expect.poll(() => page.locator('#reveal img').evaluate(img => img.complete && img.naturalWidth)).toBe(320);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});
