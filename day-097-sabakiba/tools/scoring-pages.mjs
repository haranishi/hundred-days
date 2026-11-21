// 画面の採点用に、主な画面を固定の手順で撮る（開発用。tools/ は本番に配信されない）。
// 使い方: node day-097-sabakiba/tools/scoring-pages.mjs --out 出力フォルダ [--only 名前,名前]
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { chromium } = await import(join(root, 'node_modules', 'playwright', 'index.mjs'));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const out = resolve(opt('--out', 'shots/pages'));
const only = opt('--only', '') ? new Set(opt('--only').split(',')) : null;
mkdirSync(out, { recursive: true });
const V = { phone: { w: 390, h: 844, dpr: 2, touch: true }, pc: { w: 1280, h: 800, dpr: 1, touch: false }, land: { w: 844, h: 390, dpr: 2, touch: true } };
const G = (sp, step, u = 0.55) => ({ goto: [sp, step, u] });
const PAGES = [
  { name: '01-home-phone', view: 'phone', hash: '' }, { name: '02-home-pc', view: 'pc', hash: '' },
  { name: '03-intro-aji-phone', view: 'phone', hash: '#/fish/aji' },
  { name: '04-guide-aji-02-phone', view: 'phone', hash: '#/fish/aji/2', ...G('aji', 1) },
  { name: '05-guide-aji-04-pc', view: 'pc', hash: '#/fish/aji/4', ...G('aji', 3) },
  { name: '06-guide-aji-09-phone', view: 'phone', hash: '#/fish/aji/9', ...G('aji', 8) },
  { name: '07-guide-aji-13-phone', view: 'phone', hash: '#/fish/aji/13', ...G('aji', 12, 0.9) },
  { name: '08-guide-aji-08-land', view: 'land', hash: '#/fish/aji/8', ...G('aji', 7) },
  { name: '09-xray-left-phone', view: 'phone', hash: '#/fish/aji/8', ...G('aji', 7), click: ['toggle-xray', 'toggle-left'] },
  { name: '10-iwashi-hinge-phone', view: 'phone', hash: '#/fish/iwashi/9', ...G('iwashi', 8) },
  { name: '11-hirame-phone', view: 'phone', hash: '#/fish/hirame/8', ...G('hirame', 7) },
  { name: '12-katsuo-phone', view: 'phone', hash: '#/fish/katsuo/8', ...G('katsuo', 7) },
  { name: '13-practice-result-phone', view: 'phone', hash: '#/fish/aji/4', ...G('aji', 3, 0), click: ['btn-practice'], drag: true },
  { name: '14-done-phone', view: 'phone', hash: '#/done/aji' },
  { name: '15-safety-phone', view: 'phone', hash: '#/safety' }, { name: '16-parts-phone', view: 'phone', hash: '#/parts/aji' },
  { name: '17-settings-phone', view: 'phone', hash: '', click: ['btn-settings'] },
  { name: '18-steps-sheet-phone', view: 'phone', hash: '#/fish/aji/5', ...G('aji', 4), click: ['btn-steps'] },
  { name: '19-gl-off-phone', view: 'phone', hash: '#/fish/aji/3', query: '&gl=off' },
];
const { url, close } = await startServer({ port: 0 });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const notes = [];
for (const p of PAGES) {
  if (only && !only.has(p.name)) continue;
  const v = V[p.view];
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, hasTouch: v.touch, isMobile: v.touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`${url}/index.html?debug=1&freeze=1&seed=1${p.query ?? ''}${p.hash}`, { waitUntil: 'load' });
  if (p.query?.includes('gl=off')) await page.waitForSelector('body[data-gl="off"]', { timeout: 30000 });
  else if (p.hash.includes('/fish/')) await page.waitForSelector('body[data-ready="true"]', { timeout: 90000 });
  else await page.waitForTimeout(800);
  if (p.goto) await page.evaluate(([a, b, c]) => window.__sabaki.goto(a, b, c), p.goto);
  for (const id of p.click ?? []) await page.getByTestId(id).click().catch((e) => errors.push(`click ${id}: ${e.message.slice(0, 80)}`));
  if (p.drag) {
    const box = await page.locator('#stage canvas').boundingBox();
    const y = box.y + box.height * 0.55;
    await page.mouse.move(box.x + box.width * 0.3, y); await page.mouse.down();
    for (let i = 0; i <= 14; i++) await page.mouse.move(box.x + box.width * (0.3 + 0.4 * i / 14), y + (i % 3) * 2, { steps: 2 });
    await page.mouse.up(); await page.waitForTimeout(600);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, `${p.name}.png`) });
  if (errors.length) notes.push({ name: p.name, errors });
  await ctx.close();
}
console.log(JSON.stringify({ out, problems: notes }));
await browser.close(); await close();
