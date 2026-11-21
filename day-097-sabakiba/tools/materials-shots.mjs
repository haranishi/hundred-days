// 材質の固定ショットを一括撮影する道具（shot.mjs を元に作成）。
// 使い方: node day-097-sabakiba/tools/materials-shots.mjs --out shots/r1 [--w 900 --h 600 --dpr 1 --wait 800]
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { chromium } = await import(join(root, 'node_modules', 'playwright', 'index.mjs'));

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};

const outDir = resolve(opt('--out', 'shots/r1'));
const width = Number(opt('--w', 900));
const height = Number(opt('--h', 600));
const dpr = Number(opt('--dpr', 1));
const waitMs = Number(opt('--wait', 700));
const filter = opt('--only', '');
const filterSet = filter ? new Set(filter.split(',').map((s) => s.trim()).filter(Boolean)) : null;

mkdirSync(outDir, { recursive: true });

// 画質順に並べて同一ページの WebGL コンテキストとコンパイル済みシェーダーを再利用します。
const SHOTS = [
  { id: '01_side_standard', query: 'sp=aji&q=standard&yaw=0&pitch=8&zoom=1.06' },
  { id: '05_belly', query: 'sp=aji&q=standard&focus=belly&yaw=6&pitch=-46&zoom=1.08' },
  { id: '09_xray', query: 'sp=aji&q=standard&xray=1&yaw=-8&pitch=12&zoom=1.06' },
  { id: '07_explode_white', query: 'sp=aji&q=standard&flesh=white&explode=0.85&yaw=-24&pitch=16&zoom=1.15' },
  { id: '08_explode_red', query: 'sp=aji&q=standard&flesh=red&explode=0.85&yaw=-24&pitch=16&zoom=1.15' },
  { id: '11_quality_high', query: 'sp=aji&q=high&yaw=-10&pitch=12&zoom=1.06' },
  { id: '02_head_closeup', query: 'sp=aji&q=high&focus=head&yaw=16&pitch=8&zoom=1.18' },
  { id: '03_scales_closeup', query: 'sp=aji&q=high&focus=body&yaw=-12&pitch=10&zoom=1.65' },
  { id: '04_tail_scutes', query: 'sp=aji&q=high&focus=tail&yaw=-8&pitch=8&zoom=1.35' },
  { id: '06_explode_pink', query: 'sp=aji&q=high&explode=0.85&yaw=-24&pitch=16&zoom=1.15' },
  { id: '14_cut_flesh_sface', query: 'sp=aji&q=high&only=R.dorsal,R.ventral,bone,viscera,kidney&explode=0.35&yaw=-16&pitch=10&zoom=1.22' },
  { id: '15_head_cap', query: 'sp=aji&q=high&only=head&yaw=132&pitch=10&zoom=1.18' },
  { id: '10_incisions', query: 'sp=aji&q=high&cuts=headCut:L:0.88,bellySlit::1,dorsalCut:L:0.78&yaw=-14&pitch=10&zoom=1.16' },
  { id: '13_scaled_off', query: 'sp=aji&q=high&focus=body&scale=0&scutes=0&yaw=-12&pitch=10&zoom=1.55' },
  { id: '12_quality_light', query: 'sp=aji&q=light&yaw=-10&pitch=12&zoom=1.06' },
];

const selected = filterSet ? SHOTS.filter((s) => filterSet.has(s.id)) : SHOTS;
const { url, close } = await startServer({ port: 0 });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});

const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
const page = await ctx.newPage();

const results = [];
const allErrors = [];
const external = [];

let currentErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') currentErrors.push(m.text().slice(0, 400));
});
page.on('pageerror', (e) => currentErrors.push(String(e).slice(0, 400)));
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith(url) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u.slice(0, 200));
});

let loaded = false;
for (const shot of selected) {
  const t0 = Date.now();
  currentErrors = [];
  const file = join(outDir, `${shot.id}.png`);
  if (!loaded) {
    await page.goto(`${url}/tools/materials-view.html?${shot.query}`, { waitUntil: 'load' });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 90000 }).catch((e) => {
      currentErrors.push(`ready にならない: ${e.message.slice(0, 140)}`);
    });
    loaded = true;
  } else {
    const res = await page.evaluate((q) => window.__materialsView.apply(q), shot.query).catch((e) => {
      currentErrors.push(`切替失敗: ${e.message.slice(0, 140)}`);
      return null;
    });
    if (!res?.ready) {
      await page.waitForSelector('body[data-ready="true"]', { timeout: 90000 }).catch((e) => {
        currentErrors.push(`ready にならない: ${e.message.slice(0, 140)}`);
      });
    }
  }
  if (waitMs > 0) await page.waitForTimeout(waitMs);
  await page.screenshot({ path: file });
  const ms = Date.now() - t0;
  console.error(`[shot] ${shot.id} (${ms}ms) errors=${currentErrors.length}`);
  results.push({ id: shot.id, file, ms, errors: currentErrors });
  for (const err of currentErrors) allErrors.push(`${shot.id}: ${err}`);
}

await browser.close();
await close();

console.log(JSON.stringify({
  ok: allErrors.length === 0 && external.length === 0,
  total: results.length,
  outDir,
  errors: allErrors,
  external,
}, null, 2));
if (allErrors.length > 0 || external.length > 0) process.exitCode = 1;
