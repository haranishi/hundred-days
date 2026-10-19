// 結末・エピローグの判子（stamp-in アニメの開始が1.9倍）が、スマホの横幅を広げるかを、コマ送りで測る。
// 使い方: node stamp-overflow-probe.mjs <day-071-kage-shogen を含むディレクトリ>   （改修前の版と後の版で比べた）
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const SNAP = process.argv[2];
const server = spawn(process.execPath, [`${SNAP}/day-071-kage-shogen/tools/serve.mjs`], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
const url = await new Promise((resolve) => { let out = ''; server.stdout.on('data', (c) => { out += c; const m = out.match(/http:\/\/127\.0\.0\.1:\d+\/day-071-kage-shogen\//); if (m) resolve(m[0]); }); });
const browser = await chromium.launch({ headless: true });
for (const width of [360, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(url);
  const result = await page.evaluate(async () => {
    const samples = [];
    const panels = [...document.querySelectorAll('[data-panel]')];
    for (const p of panels) p.hidden = p.dataset.panel !== 'epilogue';
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        samples.push(document.documentElement.scrollWidth);
        if (performance.now() - start < 700) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    return { innerWidth, max: Math.max(...samples), first: samples[0], last: samples[samples.length - 1], n: samples.length };
  });
  console.log(`${SNAP.split('/').pop()} width ${width}:`, JSON.stringify(result));
  await ctx.close();
}
await browser.close();
server.kill('SIGTERM');
