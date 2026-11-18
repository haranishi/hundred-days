// ビルド済みのゲームで、画面遷移を撮影する。
// タイトル → あそびかた → ひとりで → 試合（画面が消える）→ 一時停止（Esc）→ つづける → 結果。
// ビルドは試験と出力が競合しないよう一時ディレクトリに出し、vite preview を 5342 番で起こして最後に止める。
// 撮ったものは shots/ui/app/（UI_OUT で変えられる）。WebKit（画面ロック中でも動く）。
// 使い方：node tools/ui-app-shots.mjs --out=<ビルドの置き場> [--no-flow] [--no-real]

import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { build, preview } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const DIST = resolve(args.get('out') || resolve(tmpdir(), 'super-yaritai-ui-app'));
const OUT = resolve(ROOT, process.env.UI_OUT || 'shots/ui/app');
const PORT = Number(process.env.UI_APP_PORT || 5342);
const browserType = process.env.SY_BROWSER === 'chromium' ? chromium : webkit;
const VIEWPORTS = [
  { id: 'p390', width: 390, height: 844, touch: true },
  { id: 'l390', width: 844, height: 390, touch: true },
  { id: 'p768', width: 768, height: 1024, touch: true },
  { id: 'd1440', width: 1440, height: 900, touch: false },
];

const failures = [];
const fail = (w) => {
  failures.push(w);
  console.error('  ✗', w);
};

await build({ root: ROOT, configFile: resolve(ROOT, 'vite.config.ts'), logLevel: 'warn', build: { outDir: DIST, emptyOutDir: true } });
const server = await preview({ root: ROOT, configFile: resolve(ROOT, 'vite.config.ts'), build: { outDir: DIST }, preview: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' });
let browser = null;
try {
  browser = await browserType.launch();
  await mkdir(OUT, { recursive: true });
  // --no-flow で流れの撮影を飛ばす（本物の結果だけを撮り直すとき）
  for (const vp of args.has('no-flow') ? [] : VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, locale: 'ja-JP', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const external = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol !== 'data:' && u.protocol !== 'blob:' && u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') external.push(r.url());
    });
    const state = () => page.evaluate(() => window.__SY__.state());
    const shot = (name) => page.screenshot({ path: resolve(OUT, `${vp.id}-${name}.png`) });

    await page.goto(`http://127.0.0.1:${PORT}/?debug=1`);
    await page.getByRole('heading', { name: 'スーパーやりたい放題' }).waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => '__SY__' in window);
    // 後ろの3Dの店（素材の読み込みを待つ）が見えてから撮る
    await page.waitForTimeout(5000);
    await shot('1-title');

    await page.getByRole('button', { name: 'あそびかた', exact: true }).click();
    await page.getByRole('heading', { name: 'あそびかた', level: 1 }).waitFor();
    await shot('2-howto');
    await page.getByRole('button', { name: 'もどる' }).click();

    await page.getByRole('button', { name: 'ひとりで遊ぶ', exact: true }).click();
    await page.getByRole('heading', { name: 'ひとりで遊ぶ' }).waitFor();
    await shot('3-solo');
    await page.getByRole('button', { name: 'ふつう', exact: true }).click();
    const t0 = Date.now();
    while ((await state()).screen !== 'playing') {
      if (Date.now() - t0 > 60_000) throw new Error('試合が始まらない');
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1500);
    const hidden = await page.evaluate(() => document.getElementById('screens')?.dataset.screen === undefined && !document.querySelector('#screens .sy-layer'));
    if (!hidden) fail(`${vp.id}: 試合中に画面が消えていない`);
    await shot('4-game');

    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: '一時停止' }).waitFor({ timeout: 5_000 });
    await shot('5-pause');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    if ((await state()).screen !== 'playing') fail(`${vp.id}: 一時停止で Esc を押しても試合にもどらない（${(await state()).screen}）`);

    await page.evaluate(() => window.__SY__.forceEnd());
    const t1 = Date.now();
    while ((await state()).screen !== 'results') {
      if (Date.now() - t1 > 20_000) throw new Error('結果が出ない');
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(600);
    await shot('6-results');
    if ((await page.locator('[data-testid=results] li').count()) < 2) fail(`${vp.id}: 結果の順位が2人に満たない`);

    if (errors.length) fail(`${vp.id}: コンソールのエラー ${errors.join(' / ')}`);
    if (external.length) fail(`${vp.id}: 外への通信 ${external.join(' / ')}`);
    await context.close();
    console.log(`  ${vp.id}: 6枚`);
  }

  // ───────── 本物の試合の結果（第2波）：ベル・なぎ払い・缶ピラミッドをやってから終わらせ、結果を5つの大きさで撮る ─────────
  if (!args.has('no-real')) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'ja-JP', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    const sy = (fn, arg) => page.evaluate(fn, arg);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await page.goto(`http://127.0.0.1:${PORT}/?debug=1`);
    await page.waitForFunction(() => '__SY__' in window, null, { timeout: 60_000 });
    await sy(() => window.__SY__.seed(20261006));
    await page.getByRole('button', { name: 'ひとりで遊ぶ', exact: true }).click();
    await page.getByRole('button', { name: 'ふつう', exact: true }).click();
    await page.waitForFunction(() => window.__SY__.state().phase === 'playing', null, { timeout: 60_000 });
    const place = async (x, z, yaw) => {
      await sy(({ x, z, yaw }) => {
        window.__SY__.teleport(0, x, z);
        window.__SY__.face(0, yaw);
      }, { x, z, yaw });
      await wait(150);
    };
    const press = async (ms = 600) => {
      await sy(() => window.__SY__.input({ action: true, actionPressed: true }, 1));
      await wait(ms);
    };
    // ベルを20回（店のデータのベルの前。連打は0.12秒より間を空ける）
    await place(-0.6, 9.78, Math.PI);
    for (let i = 0; i < 22; i++) await press(170);
    // 棚の商品をなぎ払う（ゲームの芯の S4 と同じ立ち位置）
    const HALF = Math.PI / 2;
    const sweeps = [
      ...[-5.24, -3.4, -1.56, 0.28].map((z) => [-5.69, z, HALF]),
      ...[-3.4, -1.56, 0.28].map((z) => [-7.31, z, -HALF]),
      ...[-1.56, 0.28].map((z) => [-0.69, z, HALF]),
      ...[-3.4, -1.56, 0.28].map((z) => [-2.31, z, -HALF]),
      ...[-1.56, 0.28].map((z) => [7.69, z, -HALF]),
    ];
    for (const [x, z, yaw] of sweeps) {
      await place(x, z, yaw);
      await press();
    }
    // 缶ピラミッドを正面から蹴って崩す
    await place(3.5, 4.72, Math.PI);
    await press(500);
    await press(900);
    await sy(() => window.__SY__.forceEnd());
    await page.waitForFunction(() => window.__SY__.state().screen === 'results', null, { timeout: 30_000 });
    await page.waitForTimeout(800);
    const result = await sy(() => window.__SY__.state().result);
    await writeFile(resolve(OUT, 'real-result.json'), JSON.stringify(result, null, 2));
    for (const vp of [
      { id: 'p390', width: 390, height: 844 },
      { id: 'l390', width: 844, height: 390 },
      { id: 'p768', width: 768, height: 1024 },
      { id: 'l768', width: 1024, height: 768 },
      { id: 'd1440', width: 1440, height: 900 },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(OUT, `${vp.id}-real-results.png`) });
      const over = await page.evaluate(() => {
        const layer = document.querySelector('#screens .sy-layer');
        return Math.max(document.documentElement.scrollWidth, layer ? layer.scrollWidth : 0) - window.innerWidth;
      });
      if (over > 0.5) fail(`${vp.id}: 本物の結果が横にはみ出す（${over}px）`);
    }
    // 縦長のスマホで、全体も撮る（下に貼りつけた列は最後に置く）
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      const layer = document.querySelector('#screens .sy-layer');
      if (!layer) return;
      const h = layer.scrollHeight;
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.minHeight = `${h}px`;
      // 本物のアプリでは #app が画面の大きさで切っているので、全体を撮るあいだだけ外す
      for (const el of [document.getElementById('app'), document.getElementById('screens')]) {
        if (!el) continue;
        el.style.position = 'static';
        el.style.height = 'auto';
        el.style.overflow = 'visible';
      }
      layer.style.position = 'absolute';
      layer.style.height = `${h}px`;
      layer.style.overflow = 'visible';
      for (const bar of document.querySelectorAll('.sy-bottom-bar')) bar.style.position = 'static';
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(OUT, 'p390-real-results--full.png'), fullPage: true });
    const me = result?.players?.find((p) => p.kind === 'human');
    console.log(`  本物の結果：${me?.score}点・達成 ${me?.achieved?.join(',')}・被害率 ${result?.damage}`);
    if (!me || me.achieved.length < 2) fail('本物の結果：やっちゃダメが2つ以上達成されていない');
    if (errors.length) fail(`本物の結果：コンソールのエラー ${errors.join(' / ')}`);
    await context.close();
  }
} catch (e) {
  fail(`止まった：${e.stack || e}`);
} finally {
  await browser?.close().catch(() => {});
  await new Promise((r) => server.httpServer.close(r));
  await writeFile(resolve(OUT, 'report.json'), JSON.stringify({ failures, at: new Date().toISOString() }, null, 2));
  console.log(failures.length === 0 ? '✓ 本物のアプリでも画面がつながった' : `✗ ${failures.length}件`);
  process.exitCode = failures.length ? 1 : 0;
}
