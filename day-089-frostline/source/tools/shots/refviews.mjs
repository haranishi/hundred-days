// 参考画像と同じ視点（山のデータの views）で撮り、参考画像と左右に並べた絵を作る。見た目の採点と、配置の確認に使う。
// node tools/shots/refviews.mjs --out DIR [--url URL] [--refs refs/valley] [--only id,id] [--width 836] [--settle 2500] [--q high]
// 出力：DIR/<番号>-<id>.png（自分の画）と DIR/<番号>-<id>-pair.png（左＝参考、右＝自分の画）
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { GPU_ARGS, ready } from './common.mjs';

const { values } = parseArgs({ options: {
  url: { type: 'string', default: 'http://127.0.0.1:5183/' }, out: { type: 'string' }, refs: { type: 'string', default: 'refs/valley' },
  only: { type: 'string' }, width: { type: 'string', default: '836' }, settle: { type: 'string', default: '2500' }, q: { type: 'string' },
} });
if (!values.out) { console.error('--out DIR を指定してください'); process.exit(1); }
await mkdir(values.out, { recursive: true });
const url = new URL(values.url); url.searchParams.set('debug', '1'); if (values.q) url.searchParams.set('q', values.q);
const width = Number(values.width);
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const problems = [];
try {
  const context = await browser.newContext({ viewport: { width, height: Math.round(width * 9 / 16) }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => problems.push(`例外: ${e.message}`));
  await page.goto(url.href, { waitUntil: 'load', timeout: 30000 });
  await ready(page);
  const views = await page.evaluate(() => window.__ginrei.views());
  const only = values.only ? new Set(values.only.split(',')) : null;
  const sheet = await context.newPage();
  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    if (only && !only.has(v.id)) continue;
    const refPath = v.ref ? resolve(values.refs, v.ref) : null;
    // 参考画像の縦横の比に合わせる（無ければ 16:9）
    let aspect = 16 / 9;
    if (refPath && existsSync(refPath)) { const head = await readFile(refPath); aspect = head.readUInt32BE(16) / head.readUInt32BE(20); }
    const height = Math.round(width / aspect);
    await page.setViewportSize({ width, height });
    await page.evaluate((index) => window.__ginrei.vista(index), i);
    // 木の読み込みと、残像を消す処理が落ち着くまで待つ
    await page.waitForTimeout(Number(values.settle));
    const name = `${String(i + 1).padStart(2, '0')}-${v.id}`;
    // 画面の部品（下の帯）は写さない
    await page.addStyleTag({ content: '.ui-layer { visibility: hidden !important; }' }).catch(() => {});
    await page.screenshot({ path: join(values.out, `${name}.png`) });
    if (refPath && existsSync(refPath)) {
      const ref = (await readFile(refPath)).toString('base64'), mine = (await readFile(join(values.out, `${name}.png`))).toString('base64');
      await sheet.setViewportSize({ width: width * 2 + 12, height: height + 34 });
      await sheet.setContent(`<body style="margin:0;background:#111;color:#eee;font:14px sans-serif"><div style="display:flex;gap:12px"><img src="data:image/png;base64,${ref}" style="width:${width}px;height:${height}px;object-fit:cover"><img src="data:image/png;base64,${mine}" style="width:${width}px;height:${height}px"></div><div style="padding:6px 8px">左：参考（${v.ref}）　右：いまの画（${v.name ?? v.id}）</div></body>`);
      await sheet.screenshot({ path: join(values.out, `${name}-pair.png`) });
    }
    console.log(name, JSON.stringify({ pos: v.pos, target: v.target, fov: v.fov }));
  }
  await page.evaluate(() => window.__ginrei.vista(null));
} finally { await browser.close(); }
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; } else console.log('問題なし');
