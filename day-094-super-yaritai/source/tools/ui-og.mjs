// OGP の画像 public/og.png（1200×630）を作る（画面と音の担当）。
// 1. 本物のゲームを開き（?debug=1 の __SY__ を使う）、カートに乗って缶ピラミッドへ突っ込み、
//    缶が崩れて飛んだ瞬間に時間を止めて、ゲームの芯の固定ショット S3（缶ピラミッドの前）で撮る
// 2. その絵に、タイトルと同じ題字（値札POP）と一言を重ねて撮り直す（CSS は src/client/ui/styles/screens.css）
// index.html の og:image:alt「崩れる缶のピラミッドとカートで走るキャラ、「スーパーやりたい放題」の題字」と中身を合わせる。
// vite の開発サーバーはこのスクリプトの中で 5342 番に起こして最後に止める。WebKit（画面ロック中でも動く）。
// 使い方：node tools/ui-og.mjs [--out=public/og.png] [--raw=<3Dだけの絵の置き場>]

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const OUT = resolve(ROOT, args.get('out') || 'public/og.png');
const RAW = args.get('raw') ? resolve(ROOT, args.get('raw')) : null;
const PORT = Number(process.env.UI_OG_PORT || 5342);
const browserType = process.env.SY_BROWSER === 'chromium' ? chromium : webkit;
const W = 1200;
const H = 630;
const SEED = 20261006;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 3Dの場面を作って撮る。撮れた PNG（Buffer）を返す */
async function shootScene(browser) {
  // 2倍の細かさで撮る（重ねるときに少し寄せても、ぼやけないように）
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const sy = (fn, arg) => page.evaluate(fn, arg);
  const me = async () => (await sy(() => window.__SY__.state())).players[0];

  await page.goto(`http://127.0.0.1:${PORT}/?debug=1`);
  await page.waitForFunction(() => '__SY__' in window, null, { timeout: 60_000 });
  await sy((s) => window.__SY__.seed(s), SEED);
  await page.getByRole('button', { name: 'ひとりで遊ぶ', exact: true }).click();
  await page.getByRole('button', { name: 'ふつう', exact: true }).click();
  await page.waitForFunction(() => window.__SY__.state().screen === 'playing', null, { timeout: 60_000 });
  await sy(() => {
    window.__SY__.cpu(false);
    window.__SY__.quality('high');
  });
  await page.waitForFunction(() => window.__SY__.state().phase === 'playing', null, { timeout: 20_000 });
  // CPU（2P）は画面の外へ
  await sy(() => window.__SY__.teleport(1, -12, 10));

  // 1) 入口のカートの前に立ち、乗る（カート置き場：x 7.8〜9.7、z 10.9。docs/04）
  await sy(() => {
    window.__SY__.teleport(0, 7.8, 9.75);
    window.__SY__.face(0, 0);
  });
  await wait(300);
  for (let i = 0; i < 6 && (await me()).ridingCart === null; i++) {
    await sy(() => window.__SY__.input({ action: true, actionPressed: true }, 1));
    await wait(350);
  }
  if ((await me()).ridingCart === null) throw new Error(`カートに乗れなかった（${JSON.stringify((await me()).prompt)}）`);

  // 2) カートを缶ピラミッド（特売台：x 2.05〜4.95・z 3.6）の左前に、ピラミッドへ向けて止める。
  //    ※いまのゲームの芯では、カートの当たり判定が床から立つ箱なので、高さ0.45mの特売台に止められて缶に届かない
  //      （報告に書いた）。そこで缶は次の 3) で崩す
  const pos = async () => (await me()).pos;
  const steer = (x, z, frames = 6) => sy(({ x, z, f }) => window.__SY__.input({ moveX: x, moveZ: z }, f), { x, z, f: frames });
  const driveTo = async (goal, near) => {
    let prev = await pos();
    for (let i = 0; i < 260; i++) {
      const p = await pos();
      const dx = goal.x - p.x;
      const dz = goal.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < near) return true;
      const mvx = p.x - prev.x;
      const mvz = p.z - prev.z;
      prev = p;
      const moving = Math.hypot(mvx, mvz) > 0.004;
      const a = Math.atan2(dx, dz) - Math.atan2(mvx, mvz);
      const err = moving ? Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) : Math.PI;
      // 向きがずれているあいだは遅く（小回り）、合ってきたら少し速く
      const k = err > 0.45 ? 0.2 : Math.min(0.4, 0.2 + d * 0.05);
      await steer((dx / d) * k, (dz / d) * k);
      if (process.env.UI_OG_DEBUG && i % 5 === 0) console.log('drive', goal.x, goal.z, p.x.toFixed(2), p.z.toFixed(2), err.toFixed(2));
      await wait(45);
    }
    return false;
  };
  const stop = async () => {
    let last = await pos();
    for (let i = 0; i < 40; i++) {
      await wait(80);
      const p = await pos();
      if (Math.hypot(p.x - last.x, p.z - last.z) < 0.01) return;
      last = p;
    }
  };
  // カウンター（x −2.4〜1.2・z 10.4〜11.4）とレジの間を西へ抜け、南西から北東へ向かって止まる
  if (!(await driveTo({ x: 2.4, z: 9.3 }, 0.6))) throw new Error('レジの西まで行けなかった');
  if (!(await driveTo({ x: 0.2, z: 7.0 }, 0.6))) throw new Error('回り込めなかった');
  // 最小の回り込み（約0.8m）より小さい所は狙えないので、1m 以内に来たら手を離して止める
  // ピラミッドの左前で、カメラの方を向いて止まる（蹴るのは裏からなので、カートは乗れる距離の外になる）
  if (!(await driveTo({ x: 1.6, z: 5.5 }, 1.05))) throw new Error('ピラミッドの前まで行けなかった');
  await stop();

  // 3) 缶を崩す：カートを降り、ピラミッドの裏（北）からカメラの方へ蹴る。缶が手前へ飛ぶ。
  //    缶が動き出したらゆっくり（0.12倍）にして、飛んでいるあいだにカートへ戻って乗り直す
  const parked = await pos();
  const press = () => sy(() => window.__SY__.input({ action: true, actionPressed: true }, 1));
  await press();
  await wait(400);
  if ((await me()).ridingCart !== null) throw new Error('カートから降りられなかった');
  await sy(() => {
    window.__SY__.teleport(0, 3.5, 2.5);
    window.__SY__.face(0, 0);
  });
  await wait(250);
  const before = (await sy(() => window.__SY__.state())).damage ?? 0;
  if (process.env.UI_OG_DEBUG) console.log('prompt', JSON.stringify((await me()).prompt));
  // 蹴りには振りかぶりがあるので、缶が動き出す（被害率が上がる）まで、ふつうの速さで待つ
  let moved = false;
  for (let k = 0; k < 3 && !moved; k++) {
    await press();
    for (let i = 0; i < 16 && !moved; i++) {
      await wait(50);
      const st = await sy(() => window.__SY__.state());
      moved = (st.damage ?? 0) > before || st.stations?.pyramid?.collapsed === true;
      if (process.env.UI_OG_DEBUG) console.log('kick', k, i, st.players[0].anim, st.damage);
    }
  }
  if (!moved) console.warn(`  蹴っても缶が動かなかった（ボタンの文字：${JSON.stringify((await me()).prompt)}）`);
  await sy(() => window.__SY__.setTimeScale(0.12));
  await sy(({ x, z }) => window.__SY__.teleport(0, x, z), parked);
  for (let i = 0; i < 8 && (await me()).ridingCart === null; i++) {
    await press();
    await wait(260);
  }
  if ((await me()).ridingCart === null) console.warn('  カートに乗り直せなかった（降りたまま撮る）');
  // 缶が宙を舞っているうちに止めて撮る（いまは 0.12 倍の速さ）。崩れ方は毎回少しちがうので、
  // 少しずつ時間を進めて何枚か撮り、--pick（既定 1＝2枚目）で選ぶ。--raw を付けると全部を残す
  const shots = [];
  const steps = (process.env.UI_OG_FLY_MS || '500,450,450').split(',').map(Number);
  await sy(() => window.__SY__.shot('S3'));
  for (const ms of steps) {
    await sy(() => window.__SY__.setTimeScale(0.12));
    await wait(ms);
    await sy(() => window.__SY__.setTimeScale(0));
    await wait(700);
    shots.push(await page.screenshot({ type: 'png' }));
  }
  if (errors.length) console.warn('  3D のページのエラー：', errors.join(' / '));
  await page.close();
  return shots;
}

/** 3Dの絵に題字と一言を重ねる */
async function compose(browser, scene) {
  const css = await readFile(resolve(ROOT, 'src/client/ui/styles/screens.css'), 'utf8');
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const bg = `data:image/png;base64,${scene.toString('base64')}`;
  await page.setContent(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
${css}
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
/* 3Dの絵はそのまま（2倍で撮ったものを縮めて敷く）。カートのキャラと崩れる缶は左〜中央、題字は右上、一言は右下 */
.og { position: relative; width: ${W}px; height: ${H}px; background: #fff8ec url(${bg}) center / cover no-repeat; }
.og::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 52% 60% at 100% 10%, rgba(255,248,236,.8), rgba(255,248,236,0) 70%); }
.og .sy-awning { z-index: 1; }
.og-hero { position: absolute; right: 34px; top: 58px; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; z-index: 2; }
.og .sy-logo { transform: rotate(-3deg); }
.og .sy-logo-top { font-size: 34px; }
.og .sy-logo-main { font-size: 70px; }
.og .sy-store-sign { font-size: 18px; margin-right: 24px; }
.og .sy-store-sign-small { font-size: 13px; }
.og-foot { position: absolute; right: 34px; bottom: 30px; z-index: 2; }
.og .sy-tagline { font-size: 24px; max-width: none; }
</style></head><body><div class="sy-root"><div class="og">
  <div class="sy-awning" aria-hidden="true"><div class="sy-awning-cloth"></div><div class="sy-awning-edge"></div></div>
  <div class="og-hero">
    <p class="sy-store-sign"><span class="sy-store-sign-small">舞台は</span>スーパーきちんと堂</p>
    <h1 class="sy-logo"><span class="sy-logo-top">スーパー</span><span class="sy-logo-main">やりたい放題</span></h1>
  </div>
  <div class="og-foot">
    <p class="sy-tagline"><span class="sy-tagline-part">2分間で、スーパーの“やっちゃダメ”を全部やれ</span></p>
  </div>
</div></div></body></html>`);
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(200);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return png;
}

const server = await createServer({
  root: ROOT,
  configFile: resolve(ROOT, 'vite.config.ts'),
  server: { port: PORT, strictPort: true, host: '127.0.0.1' },
  logLevel: 'warn',
});
let browser = null;
let failed = false;
try {
  await server.listen();
  browser = await browserType.launch();
  const scenes = await shootScene(browser);
  if (RAW) {
    await mkdir(dirname(RAW), { recursive: true });
    for (const [i, png] of scenes.entries()) await writeFile(RAW.replace(/\.png$/, `-${i}.png`), png);
  }
  const pick = Math.min(scenes.length - 1, Number(args.get('pick') ?? 1));
  const scene = scenes[pick];
  const og = await compose(browser, scene);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, og);
  console.log(`  ${OUT}（${W}×${H}・${(og.length / 1024).toFixed(0)}KB）`);
} catch (e) {
  failed = true;
  console.error('止まった', e);
} finally {
  await browser?.close().catch(() => {});
  await server.close().catch(() => {});
  process.exitCode = failed ? 1 : 0;
}
