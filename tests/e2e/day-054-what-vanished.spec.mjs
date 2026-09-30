import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { arrange } from '../../day-054-what-vanished/lib/arrange.js';
import { LEVELS, PROPS } from '../../day-054-what-vanished/lib/catalog.js';
import { planGame } from '../../day-054-what-vanished/lib/rules.js';

/* Day 054 消えたのは、どれ？
   3Dの描画はCIではソフトウェア描画で遅いので、時間はテスト用の窓口 window.__day054.advance() で早送りする。
   ?pace=fast は覚える・探す時間を4秒にする録画・テスト用の進行、?clock=manual は時間を advance() だけで進める。
   ?gfx=test は描画を軽くする（細かさ半分・影なし・描き直しは1秒に1回）。CI では1コマに数秒かかり、
   操作のたびにそのコマを待たされて、1本150秒の上限に2本続けて届いた（2026-10-01 の PR #126）。
   外への通信はすべて塞いで数える。 */

const APP = '/day-054-what-vanished/';
const manifest = JSON.parse(readFileSync(new URL('../../day-054-what-vanished/data/models.json', import.meta.url), 'utf8'));

test.describe.configure({ timeout: 150_000 });

// CI の描画はソフトウェアで1秒に数枚なので、画面は小さめにし、動きを減らす設定で視点の移動を一瞬にする
async function openApp(browser, { viewport = { width: 960, height: 600 }, hash = '', touch = false } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'ja-JP', reducedMotion: 'reduce' });
  const problems = { console: [], outside: [] };
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    problems.outside.push(url.href);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') problems.console.push(m.text()); });
  page.on('pageerror', (e) => problems.console.push(String(e)));
  await page.goto(`${APP}?pace=fast&clock=manual&gfx=test${hash}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', null, { timeout: 120_000 });
  return {
    page,
    close: async () => {
      expect(problems).toEqual({ console: [], outside: [] });
      await context.close();
    }
  };
}

const phase = (page) => page.evaluate(() => window.__day054.game?.phase ?? 'title');
const advance = (page, seconds) => page.evaluate((s) => window.__day054.advance(s), seconds);

/** 覚える→目を閉じる→探す まで早送りする */
async function toSearch(page) {
  await advance(page, 1);
  expect(await phase(page)).toBe('memorize');
  await advance(page, 4.2);
  expect(await phase(page)).toBe('closing');
  await advance(page, 1.8);
  expect(await phase(page)).toBe('search');
}

test('タイトルから3問を通して遊べる（1問目は外し、2・3問目は当てる）', async ({ browser }) => {
  const { page, close } = await openApp(browser, { hash: '#c-n-4242' });
  await expect(page.getByRole('heading', { name: /消えたのは、/ })).toBeVisible();
  await expect(page.locator('#challenge-badge')).toContainText('ふつう・家の番号4242');
  await page.click('#start');
  const plan = planGame(manifest, arrange, 4242, 'normal');
  for (let round = 0; round < 3; round++) {
    await expect(page.locator('#round-no')).toHaveText(`${round + 1}問目 / 3`);
    await toSearch(page);
    const vanished = plan[round].vanished;
    expect(await page.evaluate((id) => window.__day054.hidden(id), vanished), '探す時間には消えている').toBe(true);
    await expect(page.locator('#primary')).toHaveText('わかった！答える');
    await page.click('#primary');
    await expect(page.locator('#answer-screen')).toBeVisible();
    await expect(page.locator('.choice')).toHaveCount(LEVELS.normal.choices[round]);
    const choices = await page.locator('.choice').evaluateAll((els) => els.map((e) => e.dataset.id));
    expect(choices.sort()).toEqual([...plan[round].choices].sort());
    const pick = round === 0 ? choices.find((c) => c !== vanished) : vanished;
    await page.click(`.choice[data-id="${pick}"]`);
    await page.click('#confirm');
    await expect(page.locator('#reveal-verdict')).toHaveText(round === 0 ? 'ざんねん…' : '正解！');
    await expect(page.locator('#reveal-text')).toContainText(PROPS[vanished].name);
    if (round === 0) await expect(page.locator('#look-choice')).toBeVisible();
    // 答え合わせで消えた物が戻ってくる
    await expect.poll(() => page.evaluate((id) => window.__day054.hidden(id), vanished), { timeout: 20_000 }).toBe(false);
    await page.click('#next');
  }
  await expect(page.locator('#result-screen')).toBeVisible();
  await expect(page.locator('#result-score')).toHaveText('2');
  await expect(page.locator('#result-title')).toHaveText('するどい目');
  const href = await page.locator('#result-x').getAttribute('href');
  expect(decodeURIComponent(href)).toContain('/day-054-what-vanished/#c-n-4242');
  await close();
});

test('挑戦リンクなら、むずかしさと3問がリンクのとおりになる', async ({ browser }) => {
  const { page, close } = await openApp(browser, { hash: '#c-h-4321' });
  await expect(page.locator('#challenge-badge')).toContainText('むずかしい');
  await expect(page.locator('#start')).toHaveText('挑戦を受ける');
  await page.click('#start');
  const rounds = await page.evaluate(() => window.__day054.game.rounds.map((r) => r.vanished));
  expect(rounds).toEqual(planGame(manifest, arrange, 4321, 'hard').map((r) => r.vanished));
  for (const id of rounds) expect(PROPS[id].size).toBe('S');
  await toSearch(page);
  await page.click('#primary');
  await expect(page.locator('.choice')).toHaveCount(LEVELS.hard.choices[0]);
  await close();
});

test('一時停止中は残り時間が止まり、続けると動き出す', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await page.click('#start');
  await advance(page, 1.5);
  await page.click('#pause');
  await expect(page.locator('#pause-screen')).toBeVisible();
  const before = await page.evaluate(() => window.__day054.game.timeLeft);
  await page.waitForTimeout(1200);
  await advance(page, 2);
  expect(await page.evaluate(() => window.__day054.game.timeLeft)).toBe(before);
  await page.click('#resume');
  await expect(page.locator('#pause-screen')).toBeHidden();
  await advance(page, 0.5);
  expect(await page.evaluate(() => window.__day054.game.timeLeft)).toBeLessThan(before);
  await close();
});

test('番号キーで選び、Esc で選び直し、Enter で決められる。全問正解なら次の段へ誘う', async ({ browser }) => {
  const { page, close } = await openApp(browser, { hash: '#c-e-77' });
  await page.click('#start');
  const plan = planGame(manifest, arrange, 77, 'easy');
  for (let round = 0; round < 3; round++) {
    await toSearch(page);
    await page.click('#primary');
    await expect(page.locator('.choice')).toHaveCount(LEVELS.easy.choices[round]);
    if (round === 0) {
      // 評価の1周目：答えの画面の Esc が見えない一時停止になり「これにする」が効かなくなった
      await page.keyboard.press('1');
      await expect(page.locator('.choice').nth(0)).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Escape');
      await expect(page.locator('.choice[aria-checked="true"]')).toHaveCount(0);
      await expect(page.locator('#confirm')).toBeDisabled();
      expect(await page.evaluate(() => window.__day054.game.paused)).toBe(false);
    }
    const n = plan[round].choices.indexOf(plan[round].vanished) + 1;
    await page.keyboard.press(String(n));
    await expect(page.locator('.choice').nth(n - 1)).toHaveAttribute('aria-checked', 'true');
    await page.locator('.choice').nth(n - 1).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#reveal-verdict')).toHaveText('正解！');
    await page.click('#next');
  }
  await expect(page.locator('#result-score')).toHaveText('3');
  await expect(page.locator('#again')).toHaveText('次は「ふつう」に挑戦');
  await close();
});

test('見取り図の部屋を押すと、その部屋まで歩いて家具の方を向き、行った印がつく', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await page.click('#start');
  await advance(page, 1);
  const map = await page.locator('#minimap').boundingBox();
  // 見取り図は家（横12m×奥9m）を縦横同じ縮尺で真ん中に置いている。台所は右下（x 7〜12m, z 4〜9m）
  const scale = Math.min((map.width - 12) / 12, (map.height - 12) / 9);
  const ox = map.x + (map.width - 12 * scale) / 2;
  const oy = map.y + (map.height - 9 * scale) / 2;
  await page.mouse.click(ox + 9.5 * scale, oy + 7.5 * scale);
  await expect.poll(() => page.evaluate(() => {
    const p = window.__day054.player;
    return !p.path && Math.hypot(p.x - 7.9, p.z - 6.5) < 0.4;
  }), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => Math.abs(((window.__day054.player.yaw + 72 + 540) % 360) - 180)), { timeout: 20_000 }).toBeLessThan(4);
  expect(await page.evaluate(() => [...window.__day054.state.visited])).toContain('dining');
  await close();
});

test('床を押すとそこまで歩く', async ({ browser }) => {
  const { page, close } = await openApp(browser);
  await page.click('#start');
  await advance(page, 1);
  const start = await page.evaluate(() => ({ x: window.__day054.player.x, z: window.__day054.player.z }));
  // 画面の下寄り中央は、出発点の前の床（廊下）
  const box = await page.locator('#scene').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.78);
  await expect.poll(async () => {
    const p = await page.evaluate(() => ({ x: window.__day054.player.x, z: window.__day054.player.z }));
    return Math.hypot(p.x - start.x, p.z - start.z);
  }, { timeout: 30_000 }).toBeGreaterThan(0.3);
  await close();
});

test('スマホの縦画面で、主ボタン・見取り図・スティックが重ならず押せる大きさ', async ({ browser }) => {
  const { page, close } = await openApp(browser, { viewport: { width: 390, height: 844 }, touch: true });
  await page.click('#start');
  await advance(page, 1);
  const rects = await page.evaluate(() => ['primary', 'minimap', 'joystick', 'pause', 'mute'].map((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { id, x: r.x, y: r.y, w: r.width, h: r.height };
  }));
  for (const r of rects) {
    expect(Math.round(r.h), `${r.id} の高さ`).toBeGreaterThanOrEqual(44);
    expect(Math.round(r.w), `${r.id} の幅`).toBeGreaterThanOrEqual(44);
    expect(r.x >= 0 && r.x + r.w <= 390 && r.y >= 0 && r.y + r.h <= 844, `${r.id} が画面の外`).toBe(true);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `${a.id} と ${b.id} が重なる`).toBe(false);
    }
  }
  // 文字が2行に折れると高さが70px前後になる
  expect(rects.find((r) => r.id === 'primary').h, '主ボタンの文字が1行に収まる').toBeLessThanOrEqual(64);
  // 見た目の採点3周目：目標の帯が2行に折れ、2行目「覚えよう」が操作案内の帯の下にもぐった
  const bands = await page.evaluate(() => ['hud-message', 'controls-hint'].map((id) => {
    const el = document.getElementById(id);
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, h: r.height, text: el.textContent };
  }));
  const [goal, guide] = bands;
  expect(goal.text, '覚える時間の目標が出ている').toContain('覚えよう');
  expect(goal.h, '目標の帯が1行に収まる').toBeLessThanOrEqual(50);
  expect(goal.bottom, '目標の帯と操作案内の帯が重ならない').toBeLessThanOrEqual(guide.top);
  const timerBox = await page.locator('.hud-timer').boundingBox();
  expect(timerBox.y + timerBox.height, '残り秒数の札と目標の帯が重ならない').toBeLessThanOrEqual(goal.top);
  expect(await page.evaluate(() => document.scrollingElement.scrollWidth)).toBeLessThanOrEqual(390);
  // 評価の2周目：候補が8つになる3問目で「これにする」が画面の外に出た
  for (let round = 0; round < 3; round++) {
    if (round > 0) await advance(page, 1);
    await advance(page, 4.2);
    await advance(page, 1.8);
    await page.click('#primary');
    await expect(page.locator('#answer-screen')).toBeVisible();
    const first = page.locator('.choice').first();
    await first.click();
    if (round < 2) {
      await page.click('#confirm');
      await page.click('#next');
    }
  }
  await expect(page.locator('.choice')).toHaveCount(8);
  await page.locator('.choice').nth(7).click();
  const confirm = await page.locator('#confirm').boundingBox();
  expect(confirm.y + confirm.height, '「これにする」が画面の中にある').toBeLessThanOrEqual(844);
  expect(confirm.y).toBeGreaterThanOrEqual(0);
  await close();
});

test('本番のCSPで、模型に埋め込まれた質感画像を読める（connect-src に blob:）', () => {
  const headers = readFileSync(new URL('../../dist/_headers', import.meta.url), 'utf8');
  const block = headers.split(/\n(?=\/)/).find((b) => b.startsWith('/day-054-what-vanished/'));
  expect(block).toBeTruthy();
  expect(block).toMatch(/connect-src 'self' blob:;/);
});
