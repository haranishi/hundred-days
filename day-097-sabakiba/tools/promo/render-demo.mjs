// 一覧カード用の短い動画（demo.mp4・約16秒・無音・縦540×960）を、1コマずつ決定的に撮って作る（開発用。tools/ は本番に配信されない）。
// 使い方: node day-097-sabakiba/tools/promo/render-demo.mjs --out 出力フォルダ [--fps 15]   → 出力フォルダに f0001.png… と demo.mp4
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { startServer } from '../serve.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const { chromium } = await import(join(root, 'node_modules', 'playwright', 'index.mjs'));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const out = resolve(opt('--out', 'demo-frames'));
const FPS = Number(opt('--fps', 15));
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });

// 台本（秒）。各区間は { at, dur, run(t) }。t は 0〜1。
const SP = 'aji';
const ease = (t) => t * t * (3 - 2 * t);
const SEGMENTS = [
  { dur: 1.6, name: '入口', setup: async (p) => { await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(500); } },
  { dur: 1.2, name: '前置き', setup: async (p) => { await p.getByTestId('species-card-aji').first().click(); await p.waitForTimeout(500); } },
  { dur: 0.8, name: '始める', setup: async (p) => { await p.getByTestId('btn-start').click(); await p.waitForSelector('body[data-ready="true"]', { timeout: 90000 }); } },
  { dur: 3.2, name: '頭を落とす', goto: (t) => [SP, 3, 0.15 + 0.8 * ease(t)] },
  { dur: 2.8, name: '腹を開く', goto: (t) => [SP, 5, 0.1 + 0.85 * ease(t)] },
  { dur: 3.0, name: '身を外す', goto: (t) => [SP, 8, 0.1 + 0.88 * ease(t)] },
  { dur: 2.2, name: '透視', goto: (t) => [SP, 7, 0.55], setup: async (p) => { await p.evaluate(() => window.__sabaki.setXray(true)); } },
  { dur: 1.2, name: '完成', goto: (t) => [SP, 14, 1], setup: async (p) => { await p.evaluate(() => window.__sabaki.setXray(false)); } },
];

const { url, close } = await startServer({ port: 0 });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 415, height: 738 }, deviceScaleFactor: 540 / 415, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(`${url}/index.html?debug=1&freeze=1&seed=1#/`, { waitUntil: 'load' });
await page.waitForTimeout(800);
let n = 0;
for (const seg of SEGMENTS) {
  if (seg.setup) await seg.setup(page);
  const frames = Math.max(1, Math.round(seg.dur * FPS));
  for (let i = 0; i < frames; i++) {
    const t = frames === 1 ? 1 : i / (frames - 1);
    if (seg.goto) { const [a, b, c] = seg.goto(t); await page.evaluate(([x, y, z]) => window.__sabaki.goto(x, y, z), [a, b, c]); }
    n += 1;
    await page.screenshot({ path: join(out, `f${String(n).padStart(4, '0')}.png`) });
  }
  console.error(`${seg.name}: ${frames} コマ`);
}
await browser.close(); await close();
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(out, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '27', '-movflags', '+faststart', join(out, 'demo.mp4')], { stdio: 'inherit' });
console.log(JSON.stringify({ frames: n, seconds: +(n / FPS).toFixed(1), ffmpeg: r.status }));
