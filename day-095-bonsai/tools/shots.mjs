// 画面の撮影。評価者（体験・見た目の採点役）と、実装担当が自分の絵を確かめるための道具。
// 使い方:
//   node day-095-bonsai/tools/shots.mjs --out <dir> --name a1 --path '/?debug=1&gfx=low' --w 390 --h 844 [--dpr 2]
//        [--touch] [--wait 'document.body.dataset.ready==="true"'] [--settle 1200] [--eval '<js>'] [--full]
//   複数まとめて: --batch <json>  例 [{"name":"a","path":"/?debug=1","w":390,"h":844}, ...]
// 撮影の約束: 乱数・日付・視点は URL の引数で固定し、描き終わるまで --settle ミリ秒待つ（既定 1200）。
// ブラウザは Playwright の Chromium（画面なし・ソフトウェア描画）。実GPUで撮るときは --headed。
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { chromium } = await import(join(repoRoot, 'node_modules', 'playwright', 'index.mjs'));

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes(name);

const outDir = resolve(opt('--out', './shots'));
mkdirSync(outDir, { recursive: true });
const batch = opt('--batch') ? JSON.parse(readFileSync(resolve(opt('--batch')), 'utf8')) : [{
  name: opt('--name', 'shot'), path: opt('--path', '/'), w: Number(opt('--w', 390)), h: Number(opt('--h', 844)),
  dpr: Number(opt('--dpr', 1)), touch: flag('--touch'), wait: opt('--wait', 'document.body.dataset.ready==="true"'),
  settle: Number(opt('--settle', 1200)), eval: opt('--eval'), full: flag('--full'),
}];

const server = await startServer();
const browser = await chromium.launch({
  headless: !flag('--headed'),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});
let failed = 0;
for (const shot of batch) {
  const context = await browser.newContext({
    viewport: { width: shot.w ?? 390, height: shot.h ?? 844 }, deviceScaleFactor: shot.dpr ?? 1,
    hasTouch: !!shot.touch, isMobile: !!shot.touch, reducedMotion: shot.reduced ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => logs.push(`requestfailed: ${r.url()}`));
  try {
    await page.goto(server.url + (shot.path ?? '/'), { waitUntil: 'load' });
    if (shot.wait) await page.waitForFunction(shot.wait, null, { timeout: 45000 });
    if (shot.eval) await page.evaluate(shot.eval);
    await page.waitForTimeout(shot.settle ?? 1200);
    const file = join(outDir, `${shot.name}.png`);
    await page.screenshot({ path: file, fullPage: !!shot.full });
    console.log(`撮影: ${file}${logs.length ? `  （コンソール ${logs.length}件）` : ''}`);
    for (const line of logs.slice(0, 8)) console.log(`   ${line}`);
  } catch (error) {
    failed += 1;
    console.log(`失敗: ${shot.name}: ${error.message}`);
    for (const line of logs.slice(0, 8)) console.log(`   ${line}`);
  }
  await context.close();
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
