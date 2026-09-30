import { expect, test } from '@playwright/test';
import { BOARD_COLUMNS, toggleDakuten, toggleHandakuten } from '../../day-053-kotoba-tsuji/lib/kana.js';
import { generatePuzzle } from '../../day-053-kotoba-tsuji/lib/generator.js';
import { getLevel } from '../../day-053-kotoba-tsuji/lib/levels.js';
import { WORDS } from '../../day-053-kotoba-tsuji/data/words.js';

/* Day 053 ことば辻。単体で作ったときの E2E（61件）から、主な流れを絞って載せた。
   盤の答えはテスト用の窓口（window.__KOTOBA_TEST__ を立てると出る window.__kotoba）から読む。
   外への通信はすべて塞いで数える（書体も同梱なので、1件でもあれば落とす）。 */

const APP = '/day-053-kotoba-tsuji/';
const COACH = '朱の枠に、縦にも横にも合う一字を入れるべし。';
const GIVEN = 'その字は最初から書いてあるでござる。朱の枠を埋めるべし。';
const B2 = getLevel(2).blanks;

// ---------------------------------------------------------------- 開き方と小道具

/* テストごとに新しい context を作る（記録は localStorage に残るので、画面の大きさや腕前ごとにまっさらから始める） */
async function openApp(browser, { viewport = { width: 390, height: 844 }, hash = '', storage = null } = {}) {
  const context = await browser.newContext({ viewport, locale: 'ja-JP', reducedMotion: 'no-preference' });
  await context.addInitScript((entries) => {
    window.__KOTOBA_TEST__ = true;
    for (const [key, value] of Object.entries(entries ?? {})) localStorage.setItem(key, JSON.stringify(value));
  }, storage);
  const problems = { console: [], outside: [] };
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    problems.outside.push(url.href);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') problems.console.push(message.text()); });
  page.on('pageerror', (error) => problems.console.push(String(error)));
  await page.goto(`${APP}${hash}`);
  await page.waitForFunction(() => document.body.dataset.boot === 'ready');
  return {
    page,
    problems,
    // 閉じる前に、コンソールのエラーと外への通信が0件だったことを確かめる
    close: async () => {
      expect(problems).toEqual({ console: [], outside: [] });
      await context.close();
    },
  };
}

// 暖簾は押せば（キーでも）即座に開き切る
async function passNoren(page) {
  if (await page.locator('[data-noren]').count()) await page.keyboard.press('Shift');
  await page.waitForFunction(() => !document.querySelector('[data-noren]'));
}

async function startLevel(page, level) {
  await passNoren(page);
  await page.click('[data-act="start"]');
  await page.click(`.level-card[data-level="${level}"]`);
  await page.waitForSelector('[data-screen="play"]');
}

// 果たし状のリンクから決まった盤を出す
async function openBoard(browser, level, seed, options = {}) {
  const app = await openApp(browser, { ...options, hash: `#c-${level}-${seed}` });
  await app.page.click('[data-act="accept"]');
  await app.page.waitForSelector('[data-screen="play"]');
  return app;
}

// 濁りのある字は「基の字＋゛/゜」に分ける
const SPLIT = {};
for (const column of BOARD_COLUMNS) {
  for (const base of column) {
    if (!base) continue;
    const voiced = toggleDakuten(base);
    if (voiced && !SPLIT[voiced]) SPLIT[voiced] = [base, 'dakuten'];
    const half = toggleHandakuten(base);
    if (half && !SPLIT[half]) SPLIT[half] = [base, 'handakuten'];
  }
}

async function typeKana(page, ch) {
  const split = SPLIT[ch];
  if (split) {
    await page.click(`.key[data-kana="${split[0]}"]`);
    await page.click(`[data-kp="${split[1]}"]`);
  } else await page.click(`.key[data-kana="${ch}"]`);
}

const blanksOf = (page) => page.evaluate(() => {
  const p = window.__kotoba.puzzle();
  return p.blanks.map(({ x, y }) => ({ x, y, ch: p.grid[y][x] }));
});
const entryAt = (page, x, y) => page.evaluate(([x, y]) => window.__kotoba.game().entries[y][x], [x, y]);
const cursorOf = (page) => page.evaluate(() => ({ ...window.__kotoba.game().cursor }));
const leftText = (page) => page.locator('.play-prog').textContent();
const cell = (page, { x, y }) => page.locator(`.cell[data-x="${x}"][data-y="${y}"]`);
const annaiIs = (page, text) => page.waitForFunction((t) => document.querySelector('.annai-text')?.textContent === t, text, { timeout: 3000 });
const annaiHas = (page, text) => page.waitForFunction((t) => document.querySelector('.annai-text')?.textContent.includes(t), text, { timeout: 3000 });
// 答えと違い、「゛」「゜」を付けられない字
const wrongKana = (...avoid) => ['あ', 'い', 'う', 'え', 'お', 'な', 'に', 'ぬ'].find((c) => !avoid.includes(c));

// 空きだけを五十音盤で埋めて結果まで進める（書くとエンジンが次の空きへ移すので、毎回いまのマスを確かめる）
async function solveAll(page) {
  for (let i = 0; i < 60; i++) {
    if (await page.locator('[data-screen="result"]').count()) break;
    const step = await page.evaluate(() => {
      const g = window.__kotoba.game();
      const p = window.__kotoba.puzzle();
      if (!g || g.isComplete()) return { done: true };
      const todo = p.blanks.filter(({ x, y }) => !g.locked[y][x] && g.entries[y][x] !== p.grid[y][x]);
      if (!todo.length) return { done: true };
      const here = todo.find((c) => c.x === g.cursor.x && c.y === g.cursor.y);
      const t = here ?? todo[0];
      return { done: false, x: t.x, y: t.y, ch: p.grid[t.y][t.x], move: !here };
    });
    if (step.done) break;
    if (step.move) await page.click(`.cell[data-x="${step.x}"][data-y="${step.y}"]`);
    await typeKana(page, step.ch);
  }
  await page.waitForSelector('[data-screen="result"]', { timeout: 5000 });
}

async function useHint(page, choice) {
  await page.click('[data-tool="hint"]');
  await page.waitForSelector('[data-dialog="hint"]');
  await page.click(`[data-dialog="hint"] [data-value="${choice}"]`);
}

const clueRows = (page) => page.evaluate(() => {
  const row = (sel) => {
    const el = document.querySelector(sel);
    return el && !el.hidden ? { word: el.dataset.word, text: el.querySelector('.clue-text').textContent } : null;
  };
  return { pair: document.querySelector('.clue').classList.contains('is-pair'), main: row('.clue-row.is-main'), sub: row('.clue-row.is-sub'), cur: window.__kotoba.game().currentWord()?.id };
});

// 手習いの盤を、空きの答えが清音のものと濁る字のものの2つ選ぶ（seed は決まった順に探すので毎回同じ）
function tenaraiSeeds() {
  const found = {};
  for (let i = 0; i < 400 && !(found.plain && found.voiced); i++) {
    const seed = `tn${i.toString(36).padStart(3, '0')}`;
    const p = generatePuzzle({ level: 1, seed, words: WORDS });
    const [b] = p.blanks;
    const ch = p.grid[b.y][b.x];
    const kind = SPLIT[ch] ? 'voiced' : 'plain';
    if (!found[kind]) found[kind] = { seed, ch, x: b.x, y: b.y };
  }
  return found;
}

// 段のいちばん多い免許皆伝の盤（背の低い画面でいちばん窮屈になる）
function tallestSeed() {
  let best = null;
  for (let i = 0; i < 200; i++) {
    const seed = `tl${i.toString(36).padStart(3, '0')}`;
    const p = generatePuzzle({ level: 3, seed, words: WORDS });
    if (!best || p.height > best.h) best = { seed, h: p.height };
  }
  return best.seed;
}

// ---------------------------------------------------------------- タイトル

test('タイトルは題字と「いざ、参る」が最初の画面に出て、エラー0・外への通信0。書体は同梱のものが効く', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await expect(page.locator('.title-main')).toHaveText('ことば辻');
  await passNoren(page);
  const start = page.locator('[data-act="start"]');
  await expect(start).toBeVisible();
  const box = await start.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([document.fonts.load('800 64px "Shippori Mincho B1"', 'ことば辻'), document.fonts.load('500 13px "Zen Kaku Gothic New"', '登録なし')]);
    return {
      mincho: document.fonts.check('800 64px "Shippori Mincho B1"', 'ことば辻'),
      gothic: document.fonts.check('500 13px "Zen Kaku Gothic New"', '登録なし'),
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/"/g, '')} ${f.weight}`),
    };
  });
  expect(fonts.mincho).toBe(true);
  expect(fonts.gothic).toBe(true);
  expect(fonts.loaded).toContain('Shippori Mincho B1 800');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await close();
});

test('共有欄は全アプリ共通の部品が1つだけ。タイトルでは口上の列の末尾に出て、ほかの画面では隠れ、戻ると戻る', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await passNoren(page);
  const share = page.locator('.share');
  await expect(share).toHaveCount(1);
  await expect(share).toBeVisible();
  await expect(page.locator('.title-col .share')).toHaveCount(1);
  const x = await share.getByRole('link', { name: 'Xで投稿' }).getAttribute('href');
  expect(decodeURIComponent(x)).toContain('江戸のクロスワード『ことば辻』。空いた辻に一字を入れる、腕試しでござる。');
  expect(x).toContain(encodeURIComponent('https://hundred-days.pages.dev/day-053-kotoba-tsuji/'));
  await page.click('[data-act="howto"]');
  await page.waitForSelector('[data-screen="howto"]');
  await expect(share).toHaveCount(1);
  await expect(share).toBeHidden();
  await page.click('[data-screen="howto"] .back-row .fuda');
  await page.waitForSelector('[data-screen="title"]');
  await expect(page.locator('.title-col .share')).toHaveCount(1);
  await expect(share).toBeVisible();
  await close();
});

// ---------------------------------------------------------------- 腕前と空き

test('手習い：空きは1つ。正しい字を五十音盤で1回（濁る字は「゛」を足して2回）押すと「天晴」', async ({ browser }) => {
  const seeds = tenaraiSeeds();
  expect(seeds.plain && seeds.voiced, '清音と濁る字の盤が見つかる').toBeTruthy();
  for (const [kind, s] of Object.entries(seeds)) {
    const { page, close } = await openBoard(browser, 1, s.seed);
    expect(await blanksOf(page)).toHaveLength(1);
    expect(await cursorOf(page), '始まりのカーソルは空きのマス').toEqual({ x: s.x, y: s.y });
    await page.evaluate(() => {
      window.__taps = 0;
      document.querySelector('.keypad').addEventListener('click', (e) => { if (e.target.closest('button')) window.__taps += 1; }, true);
    });
    await typeKana(page, s.ch);
    await page.waitForSelector('[data-screen="result"]', { timeout: 5000 });
    expect(await page.evaluate(() => window.__taps), `${kind}：押した回数`).toBe(kind === 'voiced' ? 2 : 1);
    await expect(page.locator('[data-seal]')).toHaveAttribute('data-seal', 'appare');
    await expect(page.locator('[data-seal]')).toHaveText('天晴');
    await expect(page.locator('[data-stat="blanks"] dd')).toHaveText('1/1');
    await close();
  }
});

for (const level of [2, 3]) {
  const lv = getLevel(level);
  test(`${lv.name}：空きはちょうど${lv.blanks}マスで、すべて辻。空きだけを埋めると「天晴」`, async ({ browser }) => {
    const { page, close } = await openApp(browser);
    await startLevel(page, level);
    const holes = await blanksOf(page);
    expect(holes).toHaveLength(lv.blanks);
    await expect(page.locator('.cell.is-aki')).toHaveCount(lv.blanks);
    const crossings = await page.evaluate(() => {
      const g = window.__kotoba.game();
      return window.__kotoba.puzzle().blanks.every(({ x, y }) => g.wordsAt(x, y).length === 2);
    });
    expect(crossings).toBe(true);
    expect(await leftText(page)).toBe(`残り ${lv.blanks}字`);
    await solveAll(page);
    await expect(page.locator('[data-seal]')).toHaveText('天晴');
    await expect(page.locator('[data-stat="blanks"] dd')).toHaveText(`${lv.blanks}/${lv.blanks}`);
    await close();
  });
}

// ---------------------------------------------------------------- 対局の中

test('空いた辻では縦と横の問が2段。下の段を押すと入れ替わる', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await startLevel(page, 1);
  const [b] = await blanksOf(page);
  const words = await page.evaluate(({ x, y }) => window.__kotoba.game().wordsAt(x, y).map((w) => ({ id: w.id, clue: w.clue })), b);
  expect(words).toHaveLength(2);
  const before = await clueRows(page);
  expect(before.pair).toBe(true);
  expect(before.main.word).toBe(before.cur);
  const other = words.find((w) => w.id !== before.cur);
  expect(before.sub).toEqual({ word: other.id, text: other.clue });
  await page.click('.clue-row.is-sub');
  const after = await clueRows(page);
  expect(after.main.word).toBe(other.id);
  expect(after.sub.word).toBe(before.cur);
  await close();
});

test('最初から書いてある字は、押しても打っても「消す」でも Backspace でも変わらない', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await startLevel(page, 1);
  const [b] = await blanksOf(page);
  // 空きの無い言葉の、辻でないマス
  const given = await page.evaluate(() => {
    const g = window.__kotoba.game();
    const p = window.__kotoba.puzzle();
    for (const w of p.words.filter((o) => g.blanksOf(o.id).length === 0)) {
      for (let i = 0; i < w.length; i++) {
        const c = w.dir === 'across' ? { x: w.x + i, y: w.y } : { x: w.x, y: w.y + i };
        if (g.wordsAt(c.x, c.y).length === 1) return { ...c, ch: p.grid[c.y][c.x] };
      }
    }
    return null;
  });
  expect(given).toBeTruthy();
  await cell(page, given).click();
  await annaiIs(page, GIVEN);
  await page.click(`.key[data-kana="${wrongKana(given.ch, b.ch)}"]`);
  expect(await entryAt(page, given.x, given.y), '打っても変わらない').toBe(given.ch);
  expect(await entryAt(page, b.x, b.y), '打った字は空きに入る').toBe(wrongKana(given.ch, b.ch));
  await cell(page, given).click();
  await page.click('[data-kp="erase"]');
  expect(await entryAt(page, given.x, given.y), '「消す」でも変わらない').toBe(given.ch);
  await page.keyboard.press('Backspace');
  expect(await entryAt(page, given.x, given.y), 'Backspace でも変わらない').toBe(given.ch);
  await expect(cell(page, given).locator('.ch')).toHaveText(given.ch);
  await close();
});

test('一人前：書くたびに「残り n字」が減り、消すと戻る', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await startLevel(page, 2);
  expect(await leftText(page)).toBe(`残り ${B2}字`);
  const holes = await blanksOf(page);
  const cur = await cursorOf(page);
  const first = holes.find((c) => c.x === cur.x && c.y === cur.y);
  expect(first, '始まりのカーソルは空き').toBeTruthy();
  await page.click(`.key[data-kana="${wrongKana(first.ch)}"]`);
  expect(await leftText(page)).toBe(`残り ${B2 - 1}字`);
  const second = await cursorOf(page);
  await page.click(`.key[data-kana="${wrongKana(holes.find((c) => c.x === second.x && c.y === second.y)?.ch)}"]`);
  expect(await leftText(page)).toBe(`残り ${B2 - 2}字`);
  await page.click('[data-kp="erase"]');
  expect(await leftText(page)).toBe(`残り ${B2 - 1}字`);
  await close();
});

test('濁点：空きに か＋゛ で が、もう一度で か。濁りを付けられない字には台詞', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await startLevel(page, 2);
  const b = (await blanksOf(page)).find((c) => !['か', 'が', 'あ'].includes(c.ch));
  await cell(page, b).click();
  await page.click('.key[data-kana="か"]');
  await page.click('[data-kp="dakuten"]');
  expect(await entryAt(page, b.x, b.y)).toBe('が');
  await expect(cell(page, b).locator('.ch')).toHaveText('が');
  await page.click('[data-kp="dakuten"]');
  expect(await entryAt(page, b.x, b.y)).toBe('か');
  await cell(page, b).click();
  await page.click('.key[data-kana="あ"]');
  await page.click('[data-kp="dakuten"]');
  expect(await entryAt(page, b.x, b.y)).toBe('あ');
  await annaiIs(page, 'その字に濁りは付けられぬ。');
  await close();
});

test('ローマ字：ne で空きに「ね」、ko で次の空きに「こ」。Backspace で消える', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await startLevel(page, 3);
  const holes = await blanksOf(page);
  const i = holes.findIndex((c, k) => k + 1 < holes.length && c.ch !== 'ね' && holes[k + 1].ch !== 'こ');
  const [b1, b2] = [holes[i], holes[i + 1]];
  const cur = await cursorOf(page);
  if (cur.x !== b1.x || cur.y !== b1.y) await cell(page, b1).click();
  await page.keyboard.type('ne');
  expect(await entryAt(page, b1.x, b1.y)).toBe('ね');
  expect(await cursorOf(page), '書くと次の空きへ移る').toEqual({ x: b2.x, y: b2.y });
  await page.keyboard.type('ko');
  expect(await entryAt(page, b2.x, b2.y)).toBe('こ');
  await page.keyboard.press('Backspace');
  expect(await entryAt(page, b2.x, b2.y)).toBe('');
  expect(await entryAt(page, b1.x, b1.y)).toBe('ね');
  await close();
});

test('助太刀：一字と一問で数が増え、結果に出る', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await startLevel(page, 2);
  const hints = () => page.evaluate(() => window.__kotoba.game().hintsLetters);
  await useHint(page, 'letter');
  expect(await hints()).toBe(1);
  await annaiHas(page, 'この一字は「');
  await expect(page.locator('.cell.is-revealed')).toHaveCount(1);
  const word = await page.evaluate(() => window.__kotoba.game().currentWord().answer);
  await useHint(page, 'word');
  const total = await hints();
  expect(total).toBeGreaterThan(1);
  await annaiHas(page, `は「${word}」でござる`);
  await solveAll(page);
  await expect(page.locator('[data-stat="hints"] dd')).toHaveText(`${total}字`);
  await expect(page.locator('[data-stat="blanks"] dd')).toHaveText(`${B2 - total}/${B2}`);
  await close();
});

test('吟味：違う字に朱の印と台詞。何も書いていなければそう言う', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await startLevel(page, 2);
  await page.click('[data-tool="check"]');
  await annaiIs(page, 'まだ何も書かれておらぬぞ。');
  const cur = await cursorOf(page);
  const b = (await blanksOf(page)).find((c) => c.x === cur.x && c.y === cur.y);
  await page.click(`.key[data-kana="${wrongKana(b.ch)}"]`);
  await page.click('[data-tool="check"]');
  await annaiIs(page, '朱で印を付けた字が違うておる。1字、直すがよい。');
  await expect(cell(page, b)).toHaveClass(/is-wrong/);
  await expect(page.locator('.cell.is-wrong')).toHaveCount(1);
  await close();
});

test('降参：札で確かめてから答えを明かし、結果は「無念」。「まだ粘る」なら対局に戻る', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await startLevel(page, 3);
  await useHint(page, 'giveup');
  await page.click('[data-dialog="giveup"] .is-primary');
  await expect(page.locator('[data-dialog]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__kotoba.game().gaveUp)).toBe(false);
  await useHint(page, 'giveup');
  await page.click('[data-dialog="giveup"] [data-value="yes"]');
  await page.waitForSelector('[data-screen="result"]');
  await expect(page.locator('[data-seal]')).toHaveAttribute('data-seal', 'munen');
  await expect(page.locator('.result-head')).toHaveText('無念…。されど、答えを知るのも修行のうち。');
  await expect(page.locator('.rank')).toHaveCount(0);
  await close();
});

// ---------------------------------------------------------------- 保存と果たし状

test('途中で再読み込みしても「続きから」で同じ盤・同じ字が戻る', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await startLevel(page, 2);
  await page.click('.key[data-kana="さ"]');
  const second = await cursorOf(page);
  await page.click('.key[data-kana="く"]');
  const before = await page.evaluate(() => ({ seed: window.__kotoba.puzzle().seed, entries: window.__kotoba.game().entries }));
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.boot === 'ready');
  await passNoren(page);
  await page.click('[data-act="resume"]');
  await page.waitForSelector('[data-screen="play"]');
  const after = await page.evaluate(() => ({ seed: window.__kotoba.puzzle().seed, entries: window.__kotoba.game().entries }));
  expect(after).toEqual(before);
  await expect(cell(page, second).locator('.ch')).toHaveText('く');
  expect(await leftText(page)).toBe(`残り ${B2 - 2}字`);
  await close();
});

test('果たし状のリンク（#c-2-<seed>-192）で開くと、同じ seed の盤と空きが出る', async ({ browser }) => {
  const seed = 'k3f9a2';
  const { page, close } = await openApp(browser, { hash: `#c-2-${seed}-192` });
  await page.waitForSelector('[data-screen="challenge"]');
  await expect(page.locator('.letter-head')).toHaveText('果たし状が届いたでござる');
  await expect(page.locator('.letter-time')).toHaveText('差出人は 3分12秒 で解いたそうな。');
  await page.click('[data-act="accept"]');
  await page.waitForSelector('[data-screen="play"]');
  const expected = generatePuzzle({ level: 2, seed, words: WORDS });
  expect(await page.evaluate(() => window.__kotoba.puzzle())).toEqual(JSON.parse(JSON.stringify(expected)));
  const shown = await page.evaluate(() => [...document.querySelectorAll('.cell.is-aki')].map((c) => ({ x: Number(c.dataset.x), y: Number(c.dataset.y) })));
  expect(shown).toEqual(expected.blanks);
  expect(await page.evaluate(() => location.hash), '受けたら hash を消す').toBe('');
  await close();
});

test('結果の果たし状は独自の欄（.hatashi）。Xの投稿画面のURLに同じ盤のリンクが入り、共通の共有欄とぶつからない', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await startLevel(page, 1);
  const seed = await page.evaluate(() => window.__kotoba.puzzle().seed);
  await solveAll(page);
  await expect(page.locator('.hatashi')).toHaveCount(1);
  await expect(page.locator('.hatashi .hatashi-head')).toContainText('果たし状を送る');
  await expect(page.locator('.share')).toBeHidden();
  const href = await page.locator('.hatashi [data-share="x"]').getAttribute('href');
  const params = new URL(href).searchParams;
  expect(params.get('url')).toMatch(new RegExp(`/day-053-kotoba-tsuji/#c-1-${seed}-\\d+$`));
  expect(params.get('text')).toMatch(/^『ことば辻』手習い（埋める字1）を\d+秒で解いたでござる。そなたに解けるか？$/);
  await close();
});

test('しつらえの3項目が再読み込み後も残る（控えめなら暖簾は出ない）', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await passNoren(page);
  await page.click('[data-act="settings"]');
  await page.getByText('鳴らさない', { exact: true }).click();
  await page.getByText('しない', { exact: true }).click();
  await page.getByText('控えめ', { exact: true }).click();
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.boot === 'ready');
  await expect(page.locator('[data-noren]')).toHaveCount(0);
  await page.click('[data-act="settings"]');
  await expect(page.locator('#set-sound-false')).toBeChecked();
  await expect(page.locator('#set-autoCheck-false')).toBeChecked();
  await expect(page.locator('#set-motion-reduce')).toBeChecked();
  await close();
});

// ---------------------------------------------------------------- スマホの幅と高さ

/* 対局画面が1画面に収まること（ページはスクロールしない・キーは押せる大きさ）と、
   始めの声かけの札が「退く」「残り」と空いた辻を覆わないこと。3つの腕前と、段のいちばん多い免許皆伝の盤で見る */
const measurePlay = (page) => page.evaluate(() => {
  const keys = [...document.querySelectorAll('.key')].map((k) => k.getBoundingClientRect());
  const kana = [...document.querySelectorAll('.key[data-kana]')].map((k) => k.getBoundingClientRect());
  const board = document.querySelector('.board').getBoundingClientRect();
  return {
    scrollY: document.documentElement.scrollHeight - innerHeight,
    scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    keys: keys.length,
    keyW: Math.min(...kana.map((k) => k.width)),
    keyH: Math.min(...keys.map((k) => k.height)),
    cellH: Math.min(...[...document.querySelectorAll('.cell[data-x]')].map((c) => c.getBoundingClientRect().height)),
    board: { left: board.left, right: board.right },
  };
});

const measureAnnai = (page) => page.evaluate(() => {
  const a = document.querySelector('.annai');
  const r = a.getBoundingClientRect();
  const inside = (x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const covered = window.__kotoba.puzzle().blanks.filter(({ x, y }) => {
    const c = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`).getBoundingClientRect();
    return inside(c.left + c.width / 2, c.top + c.height / 2);
  });
  // 札を押せる状態にして、その下の「退く」「残り」に指が届くか（札に遮られないか）を確かめる
  a.style.pointerEvents = 'auto';
  const reach = (sel) => {
    const b = document.querySelector(sel).getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return Boolean(hit && hit.closest(sel));
  };
  const result = { on: a.dataset.state === 'on', covered: covered.length, leave: reach('[data-act="leave"]'), left: reach('.play-prog') };
  a.style.pointerEvents = '';
  return result;
});

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 390, height: 660 }]) {
  test(`${viewport.width}×${viewport.height}：3つの腕前でページがスクロールせず、キーは28×36px以上。声かけの札は「退く」「残り」と空き辻を覆わない`, async ({ browser }) => {
    const where = (label) => `${viewport.width}×${viewport.height}・${label}`;
    for (const level of [1, 2, 3]) {
      const { page, close } = await openApp(browser, { viewport });
      await startLevel(page, level);
      await page.waitForFunction((t) => document.querySelector('.annai')?.dataset.state === 'on' && document.querySelector('.annai-text').textContent === t, COACH, { timeout: 3000 });
      const a = await measureAnnai(page);
      expect(a.covered, where(`腕前${level}：札が空き辻を隠す`)).toBe(0);
      expect(a.leave, where(`腕前${level}：札が「退く」を隠す`)).toBe(true);
      expect(a.left, where(`腕前${level}：札が「残り」を隠す`)).toBe(true);
      const m = await measurePlay(page);
      expect(m.scrollY, where(`腕前${level}：ページが縦にスクロールする`)).toBeLessThanOrEqual(0);
      expect(m.scrollX, where(`腕前${level}：横にはみ出す`)).toBeLessThanOrEqual(0);
      expect(m.keys, '五十音46字＋゛゜消す').toBe(49);
      expect(m.keyW, where(`腕前${level}：かなのキーの幅`)).toBeGreaterThanOrEqual(28);
      expect(m.keyH, where(`腕前${level}：キーの高さ`)).toBeGreaterThanOrEqual(36);
      expect(m.board.left >= 0 && m.board.right <= viewport.width, where('盤が横にはみ出す')).toBe(true);
      await close();
    }
    const { page, close } = await openBoard(browser, 3, tallestSeed(), { viewport });
    const m = await measurePlay(page);
    expect(await page.evaluate(() => window.__kotoba.puzzle().height)).toBeGreaterThanOrEqual(11);
    expect(m.scrollY, where('段のいちばん多い免許皆伝：ページが縦にスクロールする')).toBeLessThanOrEqual(0);
    expect(m.keyH).toBeGreaterThanOrEqual(36);
    expect(m.cellH, where('段のいちばん多い免許皆伝：マスは24px以上')).toBeGreaterThanOrEqual(24);
    await close();
  });
}
