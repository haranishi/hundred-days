// 見た目・体験の採点役に渡す画像一式を、決まった手順で撮る（開発用・配信しない）。
// 使い方: node day-095-bonsai/tools/scoring-shots.mjs --out <dir> [--only ui,fixed] [--gfx high] [--names B-pine,E-pine]
// --names は固定ショットを名前の前方一致で絞る（直した所だけ撮り直す）。
// 固定ショット（3D）は visual-direction.md の A〜E。画面（UI）は 390×844（指）・768×1024・1440×900 の初期と、
// 道具を押している間・時間を進めたあと・メニュー・共有・写真の各状態。乱数・日付・視点は URL で固定する。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { chromium } = await import(join(repoRoot, 'node_modules', 'playwright', 'index.mjs'));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const outDir = resolve(opt('--out', './scoring-shots'));
const only = new Set((opt('--only', 'fixed,ui') || '').split(','));
const gfx = opt('--gfx', 'high');
const names = (opt('--names', '') || '').split(',').filter(Boolean);
const wanted = (name) => !names.length || names.some((n) => name.startsWith(n));
mkdirSync(outDir, { recursive: true });

const base = `/?debug=1&fresh=1&gfx=${gfx}&seed=11`;
const READY = "document.querySelector('#app')?.dataset.ready==='true'";
const phone = { w: 390, h: 844, dpr: 2, touch: true };
const wide = { w: 1440, h: 900, dpr: 1, touch: false };
const tablet = { w: 768, h: 1024, dpr: 1, touch: false };

const notes = [];
const server = await startServer();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'] });

async function open(view, query, run) {
  const context = await browser.newContext({ viewport: { width: view.w, height: view.h }, deviceScaleFactor: view.dpr, hasTouch: view.touch, isMobile: view.touch });
  const page = await context.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`console: ${m.text()}`); });
  try {
    await page.goto(`${server.url}${base}&${query}`, { waitUntil: 'load' });
    await page.waitForFunction(READY, null, { timeout: 90000 });
    await page.waitForTimeout(2500);
    await run(page);
  } catch (error) {
    logs.push(`失敗: ${error.message}`);
  }
  await context.close();
  return logs;
}

async function shot(page, name, note) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  notes.push(`- ${name}.png：${note}`);
  console.log('撮影', name);
}

async function branchPoint(page, which) {
  return page.evaluate((w) => {
    const { tree, view } = window.__bonsai;
    const s = tree.snapshot();
    let index = -1;
    const has = new Set(Array.from(s.parent));
    for (let i = 0; i < s.count; i += 1) {
      const top = s.end[3 * i + 1];
      if (w === 'twig' && s.order[i] >= 2 && !has.has(i) && (index < 0 || top > s.end[3 * index + 1])) index = i;
      if (w === 'primary' && s.order[i] === 1 && index < 0) index = i + 2;
    }
    if (index < 0) return null;
    const mid = [0, 1, 2].map((a) => (s.start[3 * index + a] + s.end[3 * index + a]) / 2);
    return view.camera.project(mid);
  }, which);
}

const FIXED = [
  ['A-maple-autumn', 'species=maple&day=40&light=noon&tips=0', '紅葉・秋の盛り（主役のショット）'],
  ['B-pine-earlysummer', 'species=pine&day=226&light=morning&tips=0', '黒松・初夏・朝の光'],
  ['C-plum-bloom', 'species=plum&day=140&light=evening&tips=0', '梅・花・夕の光'],
  ['D-maple-winter', 'species=maple&day=106&light=noon&tips=0', '紅葉・冬の裸の枝ぶり'],
  ['E-pine-closeup', 'species=pine&day=226&light=noon&tips=0&cam=10,80,4.2', '黒松の近景（樹皮・葉の質感・鉢の釉）'],
];

if (only.has('fixed')) {
  for (const [name, query, note] of FIXED.filter(([name]) => wanted(name))) {
    const logs = await open(phone, query, (page) => shot(page, `${name}-390`, `${note}（390×844・スマホ）`));
    if (logs.length) notes.push(`  - ${name}-390 のログ: ${logs.join(' / ')}`);
  }
  for (const [name, query, note] of FIXED.slice(0, 2).filter(([name]) => wanted(name))) {
    const logs = await open(wide, query, (page) => shot(page, `${name}-1440`, `${note}（1440×900・PC）`));
    if (logs.length) notes.push(`  - ${name}-1440 のログ: ${logs.join(' / ')}`);
  }
}

if (only.has('ui')) {
  await open(phone, 'tips=1', (page) => shot(page, 'ui-390-first-open', '初回の表示（案内つき・390×844）'));
  await open(phone, 'tips=0', async (page) => {
    await page.getByRole('button', { name: '切る', exact: true }).click();
    const p = await branchPoint(page, 'twig');
    await page.touchscreen.tap(8, 200).catch(() => {});
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await page.waitForTimeout(900);
    await shot(page, 'ui-390-cut-pressed', '「切る」で枝を押している間（候補の枝と切られる範囲が色づく）');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 6, y: 160, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.getByRole('button', { name: '曲げる', exact: true }).click();
    const q = await branchPoint(page, 'primary');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: q.x, y: q.y, id: 1 }] });
    for (let i = 1; i <= 8; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q.x + 6 * i, y: q.y - 8 * i, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await shot(page, 'ui-390-bent-wired', '「曲げる」で曲げて離したあと（針金が巻かれる）');
  });
  await open(phone, 'tips=0&day=60', async (page) => {
    await page.getByRole('button', { name: '次の季節', exact: true }).click();
    await page.getByRole('button', { name: '1か月', exact: true }).click();
    await shot(page, 'ui-390-after-time', '時間を進めたあと（日付・季節の変化）');
  });
  await open(phone, 'tips=0', async (page) => {
    await page.getByRole('button', { name: 'メニュー', exact: true }).click();
    await shot(page, 'ui-390-menu', 'メニュー（新しい苗・設定・About・キー操作）');
  });
  await open(phone, 'tips=0', async (page) => {
    await page.getByRole('button', { name: 'このアプリを共有する' }).click();
    await shot(page, 'ui-390-share', '共有を開いた状態');
  });
  await open(phone, 'tips=0', async (page) => {
    await page.getByRole('button', { name: '写真', exact: true }).click();
    await page.waitForTimeout(6000);
    await shot(page, 'ui-390-photo', '写真のプレビュー');
  });
  await open(tablet, 'tips=0', (page) => shot(page, 'ui-768-initial', '初期（768×1024）'));
  await open(wide, 'tips=0', (page) => shot(page, 'ui-1440-initial', '初期（1440×900）'));
  await open({ w: 844, h: 390, dpr: 2, touch: true }, 'tips=0', (page) => shot(page, 'ui-844x390-landscape', 'スマホ横向き（844×390）'));
}

writeFileSync(join(outDir, 'images.md'), `# 画像の一覧と内容\n\n${notes.join('\n')}\n`);
await browser.close();
await server.close();
console.log(`完了: ${outDir}`);
