// 統合の煙試験: アプリを実ブラウザで開き、描けたか・エラーがないか・骨格が契約を満たすかを1回で確かめる。
// 使い方: node day-095-bonsai/tools/smoke.mjs [--path "/?debug=1&gfx=test&fresh=1&tips=0"] [--w 390 --h 844] [--touch] [--out <dir>] [--name smoke]
// 終了コード: 0=問題なし／1=エラーあり。画面の撮影も1枚置く（--out の下）。
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { chromium } = await import(join(repoRoot, 'node_modules', 'playwright', 'index.mjs'));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };

const path = opt('--path', '/?debug=1&gfx=test&fresh=1&tips=0&seed=11');
const w = Number(opt('--w', 390));
const h = Number(opt('--h', 844));
const touch = args.includes('--touch');
const outDir = resolve(opt('--out', './shots'));
mkdirSync(outDir, { recursive: true });

const server = await startServer();
const browser = await chromium.launch({
  headless: !args.includes('--headed'),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});
const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
const page = await context.newPage();
const problems = [];
const external = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
page.on('request', (r) => { if (!r.url().startsWith(server.url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });

let report = {};
try {
  await page.goto(server.url + path, { waitUntil: 'load' });
  await page.waitForFunction('document.querySelector("#app")?.dataset.ready === "true"', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  report = await page.evaluate(async () => {
    const out = { app: { ...document.querySelector('#app').dataset }, hasDebug: !!window.__bonsai };
    try {
      const { validateSkeleton } = await import('/lib/contract.js');
      const tree = window.__bonsai?.tree;
      if (tree) {
        const skel = tree.snapshot();
        out.skeleton = { count: skel.count, pads: skel.pads.count, wires: skel.wires.length, errors: validateSkeleton(skel) };
      }
      const stats = window.__bonsai?.view?.stats?.();
      if (stats) out.stats = stats;
    } catch (error) { out.evalError = String(error?.stack || error); }
    return out;
  });
  await page.screenshot({ path: join(outDir, `${opt('--name', 'smoke')}.png`) });
} catch (error) {
  problems.push(`起動の失敗: ${error.message}`);
}
if (external.length) problems.push(`外部への通信: ${external.slice(0, 5).join(', ')}`);
if (report.skeleton?.errors?.length) problems.push(`骨格が契約に違反: ${report.skeleton.errors.slice(0, 3).join(' / ')}`);
if (report.evalError) problems.push(`確認の失敗: ${report.evalError}`);
console.log(JSON.stringify({ path, viewport: `${w}x${h}`, report, problems }, null, 2));
await browser.close();
await server.close();
process.exit(problems.length ? 1 : 0);
