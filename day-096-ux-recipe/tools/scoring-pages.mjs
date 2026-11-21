// 採点用: 出力されるページ（目的のレシピ）を、読める大きさの区間に分けて撮る。縦長の1枚だと採点役の画像が縮んで文字がつぶれるため。
// 使い方: node day-096-ux-recipe/tools/scoring-pages.mjs --out <フォルダ> [--goals reserve,buy,inquire,apply,event] [--widths 390,960]
//   名前: pages-<幅>-<目的>-<n>of<k>.png。幅390は2倍の解像度で約1400px（CSS）ごと、幅960は等倍で約1500pxごとに区切る。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { GOALS } from '../lib/contract.js';
import { startServer } from './serve.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const out = resolve(opt('out', './scoring-pages'));
const goals = opt('goals', 'reserve,buy,inquire,apply,event').split(',').filter((g) => GOALS.includes(g));
const widths = opt('widths', '390,960').split(',').map(Number);
mkdirSync(out, { recursive: true });

const server = await startServer({ port: 0 });
const browser = await chromium.launch();
const written = [];
for (const width of widths) {
  const context = await browser.newContext({ viewport: { width: width + 40, height: 1000 }, deviceScaleFactor: width <= 480 ? 2 : 1 });
  const chunk = width <= 480 ? 1400 : 1500;
  for (const goal of goals) {
    const page = await context.newPage();
    await page.goto(`${server.url}/tools/gallery.html?mode=recipe&goal=${goal}&width=${width}`);
    await page.waitForSelector('body[data-ready="true"]', { timeout: 15000 });
    const box = await page.locator('.frame').boundingBox();
    const parts = Math.max(1, Math.ceil(box.height / chunk));
    for (let n = 0; n < parts; n += 1) {
      const y = box.y + n * chunk;
      const file = `${out}/pages-${width}-${goal}-${n + 1}of${parts}.png`;
      await page.screenshot({ path: file, fullPage: true, clip: { x: box.x, y, width: box.width, height: Math.min(chunk, box.y + box.height - y) } });
      written.push(file);
    }
    await page.close();
  }
  await context.close();
}
await browser.close();
await server.close();
console.log(`撮影: ${written.length} 枚 → ${out}`);
console.log(written.map((f) => `  ${f}`).join('\n'));
