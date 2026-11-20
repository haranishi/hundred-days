// 固定ショットの撮影（開発・採点用）。開発サーバーを内部で起こし、指定の画面を撮って、コンソールのエラーも集める。
// 使い方:
//   node day-096-ux-recipe/tools/shots.mjs --out <出力フォルダ> [--width 390] [--height 844] [--scale 1] [--browser chromium|webkit] [--full] [--touch] <名前>=<パス?クエリ> ...
//   例: node day-096-ux-recipe/tools/shots.mjs --out /tmp/shots --full "hero=tools/gallery.html?mode=block&type=hero&variant=0"
// 終わると、JSON を1行出す: { shots:[{name,file,errors:[…]}], errors:n }。errors が 0 でなければ、画面より先にそれを直す。
// 画面は data-ready="true"（body か #app）になってから撮る。撮影前に、動き（アニメーション）の終わりも待つ。
import { chromium, webkit } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './serve.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const flag = (name) => argv.includes(`--${name}`);
const targets = argv.filter((a, i) => /^[\w.-]+=.+/.test(a) && !argv[i - 1]?.startsWith('--'));
if (!targets.length) { console.error('使い方: shots.mjs --out <dir> <名前>=<パス?クエリ> ...'); process.exit(2); }

const out = resolve(opt('out', './shots'));
mkdirSync(out, { recursive: true });
const width = Number(opt('width', 390));
const height = Number(opt('height', 844));
const scale = Number(opt('scale', 1));
const engine = opt('browser', 'chromium') === 'webkit' ? webkit : chromium;

const server = await startServer({ port: 0 });
const browser = await engine.launch();
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: flag('touch'), isMobile: flag('touch') && engine === chromium });
const results = [];
for (const target of targets) {
  const cut = target.indexOf('=');
  const name = target.slice(0, cut);
  const path = target.slice(cut + 1).replace(/^\//, '');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`${server.url}/${path}`);
  await page.waitForSelector('[data-ready="true"]', { timeout: 20_000 }).catch(() => errors.push('data-ready が true になりませんでした'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5_000 }).catch(() => {});
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file, fullPage: flag('full') });
  results.push({ name, file, errors });
  await page.close();
}
await browser.close();
await server.close();
console.log(JSON.stringify({ shots: results, errors: results.reduce((n, r) => n + r.errors.length, 0) }));
