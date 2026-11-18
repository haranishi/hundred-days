// 固定ショットの撮影（docs/04）：S1 入口から見た店内／S2 お菓子の通路／S3 缶ピラミッドの前／S4 荒らした後の店／
// S5 スマホ縦のゲーム画面／S6 結果画面。
// 乱数（seed）・時刻（時間を止める）・カメラ（__SY__.shot）を固定して撮り、描画の回数・三角形の数・毎秒の描画数も残す。
// 使い方：node tools/shots.mjs [出力先]   （既定は shots/core/）
//   SY_BROWSER=chromium で Chromium（既定は WebKit：画面ロック中でも起動し、GPU で描ける）
//   SHOTS_PORT で開発サーバーのポートを変える（既定 5331）
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.argv[2] ?? 'shots/core');
const PORT = Number(process.env.SHOTS_PORT ?? 5331);
const BROWSER = process.env.SY_BROWSER === 'chromium' ? chromium : webkit;
const SEED = 20261006;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });

// 開発サーバーを起こす（最後に必ず止める）
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let ready = false;
server.stdout.on('data', (d) => {
  if (String(d).includes('Local')) ready = true;
});
server.stderr.on('data', (d) => process.stderr.write(d));

const browser = await BROWSER.launch();
const report = { browser: process.env.SY_BROWSER === 'chromium' ? 'chromium' : 'webkit', seed: SEED, viewport: '1440x900', shots: {} };
try {
  for (let i = 0; i < 150 && !ready; i++) await wait(200);
  if (!ready) throw new Error('開発サーバーが起きませんでした');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${PORT}/?debug=1`);
  await page.waitForFunction(() => '__SY__' in window);
  const sy = (fn, arg) => page.evaluate(fn, arg);
  await sy((s) => window.__SY__.seed(s), SEED);
  await page.getByRole('button', { name: /ひとりで/ }).first().click();
  await page.getByRole('button', { name: /ふつう/ }).first().click();
  await page.waitForFunction(() => window.__SY__.state().screen === 'playing', null, { timeout: 60_000 });
  // CPU は止め、画質は「高」に固定する（毎回同じ絵にするため）
  await sy(() => {
    window.__SY__.cpu(false);
    window.__SY__.quality('high');
  });
  await page.waitForFunction(() => window.__SY__.state().phase === 'playing', null, { timeout: 20_000 });
  await sy(() => window.__SY__.teleport(1, 5.2, 6.0));

  const shoot = async (name, setup) => {
    await sy(() => window.__SY__.setTimeScale(1));
    await setup();
    await sy(() => window.__SY__.setTimeScale(0));
    await sy((n) => window.__SY__.shot(n), name);
    await wait(2200);
    const st = await sy(() => window.__SY__.state());
    await page.screenshot({ path: resolve(OUT, `${name}.png`) });
    report.shots[name] = { drawCalls: st.drawCalls, triangles: st.triangles, fps: st.fps, quality: st.quality, damage: st.damage };
    console.log(name, JSON.stringify(report.shots[name]));
    await sy(() => window.__SY__.shot(null));
  };
  const place = async (x, z, yaw) => {
    await sy(({ x, z, yaw }) => {
      window.__SY__.teleport(0, x, z);
      window.__SY__.face(0, yaw);
    }, { x, z, yaw });
    await wait(150);
  };
  const press = async () => {
    await sy(() => window.__SY__.input({ action: true, actionPressed: true }, 1));
    await wait(650);
  };

  await shoot('S1', () => place(3.2, 9.0, Math.PI));
  await shoot('S2', () => place(-6.5, -2.4, Math.PI));
  await shoot('S3', () => place(2.3, 5.3, Math.PI * 0.8));

  // S4：台本どおりに荒らしてから、S1 と同じ構図で撮る
  await shoot('S4', async () => {
    const HALF = Math.PI / 2;
    const sweeps = [
      // [x, z, 向き]：棚の面の前の立ち位置（store.ts の棚の列 x=−9,−4,1,6 と面の位置から）
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
    await place(3.5, 4.7, Math.PI);
    await press();
    await press();
    await place(3.5, 3.9, Math.PI);
    await sy(() => window.__SY__.input({ moveZ: -1 }, 40));
    await wait(1500);
    await place(3.2, 9.0, Math.PI);
    await wait(1500);
  });

  // S6：結果画面（試合を終わらせて、結果画面を撮る）
  await sy(() => {
    window.__SY__.setTimeScale(1);
    window.__SY__.forceEnd();
  });
  await page.waitForFunction(() => window.__SY__.state().screen === 'results', null, { timeout: 20_000 });
  await wait(1500);
  await page.screenshot({ path: resolve(OUT, 'S6.png') });
  report.shots.S6 = { screen: 'results', viewport: '1440x900' };
  console.log('S6', JSON.stringify(report.shots.S6));

  // S5：スマホ縦のゲーム画面（HUD とタッチ操作つき。追いかけるカメラのまま）
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await phone.newPage();
  mp.on('pageerror', (e) => errors.push(e.message));
  mp.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await mp.goto(`http://localhost:${PORT}/?debug=1`);
  await mp.waitForFunction(() => '__SY__' in window);
  await mp.evaluate((s) => window.__SY__.seed(s), SEED);
  await mp.getByRole('button', { name: /ひとりで/ }).first().click();
  await mp.getByRole('button', { name: /ふつう/ }).first().click();
  await mp.waitForFunction(() => window.__SY__.state().phase === 'playing', null, { timeout: 60_000 });
  await mp.evaluate(() => {
    window.__SY__.cpu(false);
    window.__SY__.quality('mid');
    window.__SY__.teleport(1, 5.6, 6.4);
    window.__SY__.teleport(0, 4.2, 7.6);
    window.__SY__.face(0, Math.PI);
  });
  // 指で触ったことにして、タッチの操作を出しつつ少し走ってから缶ピラミッドを蹴る（時刻 1:58・ポップ・粒・壊し跡が入った生の瞬間を撮る）
  await mp.touchscreen.tap(60, 780);
  await mp.evaluate(() => window.__SY__.input({ moveZ: -1, dash: true }, 42));
  await wait(800);
  await mp.evaluate(() => {
    window.__SY__.teleport(0, 4.2, 5.6);
    window.__SY__.face(0, Math.PI);
    window.__SY__.input({ action: true, actionPressed: true }, 1);
  });
  await wait(2900);
  await mp.evaluate(() => {
    window.__SY__.teleport(0, 2.69, 0.28);
    window.__SY__.face(0, -Math.PI / 2);
    window.__SY__.input({ action: true, actionPressed: true }, 1);
  });
  await wait(600);
  await mp.evaluate(() => window.__SY__.setTimeScale(0));
  await wait(900);
  const st5 = await mp.evaluate(() => window.__SY__.state());
  await mp.screenshot({ path: resolve(OUT, 'S5.png') });
  report.shots.S5 = { drawCalls: st5.drawCalls, triangles: st5.triangles, fps: st5.fps, quality: st5.quality, viewport: '390x844@2' };
  console.log('S5', JSON.stringify(report.shots.S5));
  await phone.close();
  report.errors = errors;
  writeFileSync(resolve(OUT, 'shots.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`saved to ${OUT}`);
  if (errors.length) console.log('console errors:', errors);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
