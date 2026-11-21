// 採点用の固定ショットを撮る（開発用。tools/ は本番に配信されない）。`?debug=1&freeze=1` の `__sabaki.goto(sp, step, u)` で状態を決め、同じ画角で撮る。
// 使い方: node day-097-sabakiba/tools/scoring-shots.mjs --out 出力フォルダ [--species aji,saba] [--steps all|0,3,5] [--u 0.5,1] [--views phone,pc] [--xray] [--left]
//   phone=390×844(2倍)・pc=1280×800(1倍)・land=844×390。3D の領域（#stage）だけ撮る `--stage` も可。ファイル名: <魚>_<手順>_<u>_<視点>.png
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { chromium } = await import(join(root, 'node_modules', 'playwright', 'index.mjs'));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(n);
const out = resolve(opt('--out', 'shots'));
mkdirSync(out, { recursive: true });
const VIEWS = { phone: { w: 390, h: 844, dpr: 2 }, pc: { w: 1280, h: 800, dpr: 1 }, land: { w: 844, h: 390, dpr: 2 } };
const views = opt('--views', 'phone').split(',').filter((v) => VIEWS[v]);
const species = opt('--species', 'aji').split(',');
const us = opt('--u', '0.5,1').split(',').map(Number);

const { url, close } = await startServer({ port: 0 });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const log = [];
for (const view of views) {
  const v = VIEWS[view];
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, hasTouch: view !== 'pc', isMobile: view !== 'pc' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  for (const sp of species) {
    await page.goto(`${url}/index.html?debug=1&freeze=1&seed=1${flag('--left') ? '&hand=L' : ''}#/fish/${sp}/1`, { waitUntil: 'load' });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 90000 });
    const count = await page.evaluate(() => window.__sabaki.stats().stepCount);
    const steps = opt('--steps', 'all') === 'all' ? [...Array(count).keys()] : opt('--steps').split(',').map(Number);
    if (flag('--xray')) await page.evaluate(() => window.__sabaki.setXray?.(true));
    for (const step of steps) for (const u of us) {
      await page.evaluate(([a, b, c]) => window.__sabaki.goto(a, b, c), [sp, step, u]);
      const file = join(out, `${sp}_${String(step).padStart(2, '0')}_${String(Math.round(u * 100)).padStart(3, '0')}_${view}.png`);
      if (flag('--stage')) await page.locator('#stage').screenshot({ path: file }); else await page.screenshot({ path: file });
      log.push(file);
    }
  }
  if (errors.length) console.error(`⚠️ ${view}: コンソールのエラー ${errors.length} 件`, errors.slice(0, 3));
  await ctx.close();
}
console.log(JSON.stringify({ shots: log.length, out }));
await browser.close(); await close();
