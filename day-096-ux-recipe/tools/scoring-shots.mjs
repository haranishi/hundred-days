// 採点用の固定ショット（画像だけで採点する人に渡す一式）。使い方:
//   node day-096-ux-recipe/tools/scoring-shots.mjs --out <フォルダ> [--set tool|pages|all] [--only <名前の前方一致>]
// tool  : 道具の画面（目的・編集・各パネル・ダイアログ・見るだけ）を 1440／768／390 で。
// pages : ユーザーが作るページ（8つの目的のレシピ）を、スマホ幅 390 とパソコン幅 960 の全体で。
// 撮影前に、動き（アニメーション）の終わりを待つ。コンソールのエラーが出たら、画面より先にそれを直す。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { GOALS } from '../lib/contract.js';
import { startServer } from './serve.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const out = resolve(opt('out', './scoring-shots'));
const set = opt('set', 'all');
const only = opt('only', '');
mkdirSync(out, { recursive: true });

const DEVICES = {
  '1440': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  '768': { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, hasTouch: true },
  '390': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
const server = await startServer({ port: 0 });
const browser = await chromium.launch();
const written = [];
const problems = [];

async function session(width, fn) {
  const context = await browser.newContext(DEVICES[width]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const shot = async (name, opts = {}) => {
    if (only && !name.startsWith(only)) return;
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5000 }).catch(() => {});
    const file = `${out}/${name}.png`;
    await page.screenshot({ path: file, ...opts });
    written.push(file);
  };
  try { await fn(page, shot); } catch (e) { errors.push(`script: ${e.message.split('\n')[0]}`); }
  if (errors.length) problems.push(`${width}: ${[...new Set(errors)].join(' | ').slice(0, 300)}`);
  await context.close();
}
const open = async (page, query = 'fresh=1&tips=0&debug=1') => {
  await page.goto(`${server.url}/?${query}`);
  await page.waitForSelector('#app[data-ready="true"]', { timeout: 20000 });
};
const pick = (page, label) => page.getByRole('button', { name: new RegExp(label) }).first().click();
const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click();

if (set === 'tool' || set === 'all') {
  for (const w of ['1440', '768', '390']) {
    await session(w, async (page, shot) => {
      await open(page);
      await shot(`tool-${w}-01-goal`);
      await pick(page, '予約してもらう');
      await page.waitForTimeout(500);
      await shot(`tool-${w}-02-editor`);
      if (w === '390') { await tab(page, '構成'); await shot(`tool-${w}-03-outline`); }
      await tab(page, '診断'); await shot(`tool-${w}-04-diagnosis`);
      await tab(page, '見た目'); await shot(`tool-${w}-05-look`);
      if (w !== '1440') await tab(page, '構成'); // 狭い幅では、構成（部品を足す）がタブの中にある
      await page.getByRole('button', { name: '部品を足す' }).first().click();
      await page.waitForTimeout(300);
      await shot(`tool-${w}-06-palette`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '共有・書き出し' }).click();
      await page.waitForTimeout(1200);
      await shot(`tool-${w}-07-share-link`);
      await page.getByRole('tab', { name: '書き出し' }).click();
      await page.waitForTimeout(300);
      await shot(`tool-${w}-08-share-export`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '保存・開く' }).click();
      await page.waitForTimeout(300);
      await shot(`tool-${w}-09-slots`);
      await page.keyboard.press('Escape');
      const link = await page.evaluate(() => window.__uxr.ctx.viewUrl());
      await page.getByRole('button', { name: '目的を選び直す' }).click();
      await pick(page, '買ってもらう');
      await page.waitForTimeout(300);
      await shot(`tool-${w}-10-goal-change`);
      await page.goto(link);
      await page.waitForSelector('#app[data-screen="viewer"]', { timeout: 10000 });
      await page.waitForTimeout(500);
      await shot(`tool-${w}-11-viewer`);
    });
  }
}
if (set === 'pages' || set === 'all') {
  for (const w of ['390', '960']) {
    const context = await browser.newContext({ viewport: { width: Number(w) + 40, height: 900 }, deviceScaleFactor: w === '390' ? 2 : 1 });
    for (const goal of GOALS) {
      const name = `pages-${w}-${goal}`;
      if (only && !name.startsWith(only)) continue;
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${server.url}/tools/gallery.html?mode=recipe&goal=${goal}&width=${w}`);
      await page.waitForSelector('body[data-ready="true"]', { timeout: 15000 });
      const file = `${out}/${name}.png`;
      await page.locator('.frame').screenshot({ path: file });
      written.push(file);
      if (errors.length) problems.push(`${name}: ${errors.join(' | ').slice(0, 200)}`);
      await page.close();
    }
    await context.close();
  }
}
await browser.close();
await server.close();
console.log(`撮影: ${written.length} 枚 → ${out}`);
console.log(written.map((f) => `  ${f}`).join('\n'));
console.log(problems.length ? `■ 問題 ${problems.length} 件\n${problems.map((p) => `  ${p}`).join('\n')}` : '■ 問題: なし');
