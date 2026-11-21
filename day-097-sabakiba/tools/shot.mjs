// 画面を撮る道具（開発・撮影用。tools/ は本番に配信されない）。WebGL はソフトウェア描画（SwiftShader）で動く。
// 使い方: node day-097-sabakiba/tools/shot.mjs --path "index.html#/fish/aji/3" --out 出力.png [--w 390 --h 844 --dpr 2 --wait 1500 --ready --eval "式" --click "セレクタ" --touch]
//   --ready: body[data-ready="true"] を待つ（3D が出たら立つ）  --eval: ready のあとに実行する式（--eval は複数可）  --click: 押す（複数可）
// 標準出力に {ok, errors[], requests{external}} の JSON を1行出す。外部へ出る通信があれば external に入る。
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { startServer } from './serve.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { chromium } = await import(join(root, 'node_modules', 'playwright', 'index.mjs'));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const all = (n) => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []));
const flag = (n) => args.includes(n);
const out = opt('--out');
if (!out) { console.error('--out が要ります'); process.exit(2); }
mkdirSync(dirname(resolve(out)), { recursive: true });

const { url, close } = await startServer({ port: 0 });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const ctx = await browser.newContext({
  viewport: { width: Number(opt('--w', 390)), height: Number(opt('--h', 844)) }, deviceScaleFactor: Number(opt('--dpr', 2)),
  hasTouch: flag('--touch'), isMobile: flag('--touch'), reducedMotion: flag('--reduced') ? 'reduce' : 'no-preference',
});
const page = await ctx.newPage();
const errors = []; const external = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u.slice(0, 200)); });
await page.goto(`${url}/${opt('--path', 'index.html')}`, { waitUntil: 'load' });
if (flag('--ready')) await page.waitForSelector('body[data-ready="true"]', { timeout: 60000 }).catch((e) => errors.push(`ready にならない: ${e.message.slice(0, 120)}`));
for (const sel of all('--click')) await page.click(sel, { timeout: 8000 }).catch((e) => errors.push(`click 失敗 ${sel}: ${e.message.slice(0, 100)}`));
for (const ex of all('--eval')) await page.evaluate(ex).catch((e) => errors.push(`eval 失敗: ${e.message.slice(0, 120)}`));
await page.waitForTimeout(Number(opt('--wait', 1200)));
await page.screenshot({ path: resolve(out), fullPage: flag('--full') });
console.log(JSON.stringify({ ok: errors.length === 0, errors, external }));
await browser.close(); await close();
