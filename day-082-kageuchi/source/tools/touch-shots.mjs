// OWNER: core
// スマホ対応（2026-11-03・tasks 4.1）の撮影表：端末の大きさ × 画面を、タッチ操作（?touch=1）で撮って .captures/<周の名前>/ に PNG で残す。
// 撮ったら全部を目で見る（重なり・切れ・読めない文字・押せなさそうなボタン）。重なりの機械の監査は e2e/touch.spec.ts。
//
//   node tools/touch-shots.mjs a2              全部（端末 7 × 画面）
//   node tools/touch-shots.mjs a2 --devices 568x320,844x390 --screens title,play
//   --no-build でビルドを省く、--port でプレビューのポートを変える（既定 5406）
//
// 画面の移り変わり（CSS の transition・アニメ）が止まるのを待ってから、ビューポートだけを撮る（position:fixed の部品が焼き込まれないように）。
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openBrowser } from './lib/shoot.mjs';
import { ROOT, buildCore, parseArgs, startPreview } from './core/harness.mjs';

const DEVICES = [
  { name: '568x320', width: 568, height: 320 },
  { name: '667x375', width: 667, height: 375 },
  { name: '844x390', width: 844, height: 390 },
  { name: '932x430', width: 932, height: 430 },
  { name: '915x412', width: 915, height: 412 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '390x844', width: 390, height: 844, portrait: true },
];

/** 待つ：画面の要素の移り変わりが全部終わる（getAnimations が空になるか、上限まで）。 */
async function settle(page, ms = 450) {
  await page.waitForTimeout(ms);
  await page
    .waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && !(a.effect?.target instanceof Element && a.effect.target.classList.contains('kg-rotate-phone'))).length === 0, null, { timeout: 3_000 })
    .catch(() => undefined);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function boot(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.__appReady === true || typeof window.__appError === 'string', null, { timeout: 60_000 });
  const err = await page.evaluate(() => window.__appError ?? null);
  if (err) throw new Error(err);
  await page.waitForFunction(() => window.__viewReady === true, null, { timeout: 90_000 });
}

const tap = (page, testId) => page.getByTestId(testId).tap();
const screenIs = (page, s, timeout = 20_000) => page.waitForFunction((x) => window.__state?.screen === x, s, { timeout });

/** 信長の背後へ置き直して「討つ」が出るまで待つ。 */
async function behindNobunaga(page) {
  await page.waitForFunction(
    () => {
      const nb = window.__state.guards.find((g) => g.id === 'nobunaga');
      if (!nb) return false;
      if (window.__state.player.prompt === 'assassinate') return true;
      const v = (nb.view * Math.PI) / 180;
      window.__game.teleport(nb.x - Math.cos(v) * 1.0, nb.z - Math.sin(v) * 1.0, nb.view);
      return false;
    },
    null,
    { timeout: 15_000, polling: 200 },
  );
}

/** 画面の一覧。landscape は横向きの端末、portrait は縦向きの端末で撮る。 */
const SCREENS = [
  { name: 'title', on: 'both', query: 'touch=1', run: async () => {} },
  {
    name: 'select',
    on: 'both',
    query: 'touch=1',
    run: async (page) => {
      await tap(page, 'btn-start');
      await screenIs(page, 'select');
    },
  },
  {
    name: 'briefing-top',
    on: 'both',
    query: 'touch=1',
    run: async (page) => {
      await tap(page, 'btn-start');
      await tap(page, 'stage-honnoji');
      await screenIs(page, 'briefing');
    },
  },
  {
    name: 'briefing-bottom',
    on: 'both',
    query: 'touch=1',
    run: async (page) => {
      await tap(page, 'btn-start');
      await tap(page, 'stage-honnoji');
      await screenIs(page, 'briefing');
      await page.evaluate(() => {
        const s = document.querySelector('[data-testid="screen-briefing"]');
        s.scrollTop = s.scrollHeight;
      });
    },
  },
  {
    // 開始直後：遊び始めの操作のヒントが出ている間
    name: 'play-start',
    on: 'landscape',
    query: 'touch=1&autostart=1&seed=1&god=1',
    run: async (page) => {
      await page.waitForFunction(() => document.querySelector('.kg-touchhint')?.classList.contains('kg-on'), null, { timeout: 10_000 });
    },
  },
  {
    // 発見中（見られている帯）＋逃げ方の案内
    name: 'play-alert',
    on: 'landscape',
    query: 'touch=1&autostart=1&seed=1&god=1',
    run: async (page) => {
      await page.evaluate(() => window.__game.teleport(0, 33.5, 270));
      await page.evaluate(() => window.__input.down('KeyW'));
      await page.waitForFunction(() => window.__state.phase === 'alert', null, { timeout: 20_000 });
      await page.evaluate(() => window.__input.up('KeyW'));
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__game.freeze(true));
    },
  },
  {
    // 小石：ちょん押しでねらいを保った状態（「投げる」と「やめる」が見える）
    name: 'play-aim',
    on: 'landscape',
    query: 'touch=1&autostart=1&seed=1&god=1',
    run: async (page) => {
      await page.evaluate(() => window.__game.teleport(-14, 33.5, 270));
      await page.waitForTimeout(300);
      await tap(page, 'touch-btn-stone');
      await page.waitForFunction(() => window.__touch.info()?.aim === 'latched', null, { timeout: 5_000 });
      await page.waitForTimeout(600);
      await page.evaluate(() => window.__game.freeze(true));
    },
  },
  {
    // 当て身が押せる状態（信長の背後）
    name: 'play-action',
    on: 'landscape',
    query: 'touch=1&autostart=1&seed=1&god=1',
    run: async (page) => {
      await behindNobunaga(page);
      await page.evaluate(() => window.__game.freeze(true));
    },
  },
  {
    name: 'pause',
    on: 'landscape',
    query: 'touch=1&autostart=1&seed=1&god=1',
    run: async (page) => {
      await tap(page, 'touch-btn-pause');
      await screenIs(page, 'pause');
    },
  },
  {
    name: 'gameover',
    on: 'landscape',
    query: 'touch=1&autostart=1&seed=1',
    run: async (page) => {
      await page.evaluate(() => window.__game.lose());
      await screenIs(page, 'gameover', 30_000);
    },
  },
  {
    name: 'result',
    on: 'landscape',
    query: 'touch=1&autostart=1&seed=1&god=1',
    run: async (page) => {
      await page.evaluate(() => window.__game.win());
      await screenIs(page, 'result', 40_000);
    },
  },
  {
    // 縦向きで遊ぶ画面＝自動で止めて、横向きの案内
    name: 'rotate',
    on: 'portrait',
    query: 'touch=1&autostart=1&seed=1&god=1',
    run: async (page) => {
      await page.waitForFunction(() => document.querySelector('[data-testid="rotate-prompt"]')?.classList.contains('kg-on'), null, { timeout: 10_000 });
    },
  },
];

const args = parseArgs(process.argv.slice(2));
const round = String(args._[0] ?? args.round ?? 'touch-scratch');
const port = Number(args.port ?? 5406);
const pickDevices = args.devices ? String(args.devices).split(',') : null;
const pickScreens = args.screens ? String(args.screens).split(',') : null;
const outDir = path.join(ROOT, '.captures', round);

async function main() {
  await mkdir(outDir, { recursive: true });
  if (!args['no-build']) buildCore();
  const server = await startPreview(port);
  const { browser, name: browserName, reason } = await openBrowser();
  console.log(`ブラウザ: ${browserName}（${reason}）`);
  const results = [];
  let failed = false;
  try {
    for (const d of DEVICES) {
      if (pickDevices && !pickDevices.includes(d.name)) continue;
      const context = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: browserName === 'chromium' });
      for (const sc of SCREENS) {
        if (pickScreens && !pickScreens.includes(sc.name)) continue;
        if (sc.on === 'landscape' && d.portrait) continue;
        if (sc.on === 'portrait' && !d.portrait) continue;
        const page = await context.newPage();
        const errors = [];
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });
        page.on('pageerror', (e) => errors.push(String(e)));
        // 共有欄（配信先の hundred-days が足す部品）は、隣の day-082-kageuchi/shared/ の実物を返す（e2e/fixtures.ts と同じ）
        await page.route('**/shared/share.*', async (route) => {
          const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
          const file = path.join(ROOT, '..', 'shared', name);
          if (!/^share\.(css|js)$/.test(name) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
          return route.fulfill({ body: readFileSync(file), contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript' });
        });
        const file = path.join(outDir, `${d.name}-${sc.name}.png`);
        try {
          await boot(page, `${server.url}/?${sc.query}`);
          await sc.run(page);
          await settle(page);
          await page.screenshot({ path: file });
        } catch (e) {
          errors.push(String(e));
        }
        results.push({ device: d.name, screen: sc.name, file: path.relative(ROOT, file), errors });
        console.log(`${d.name.padEnd(9)} ${sc.name.padEnd(16)} errors=${errors.length}${errors.length ? `  ${errors[0].slice(0, 300)}` : ''}`);
        if (errors.length) failed = true;
        await page.close();
      }
      await context.close();
    }
    await writeFile(path.join(outDir, 'touch-shots.json'), JSON.stringify({ round, date: new Date().toISOString(), browser: browserName, shots: results }, null, 2));
    console.log(`保存先: ${path.relative(ROOT, outDir)}/`);
  } finally {
    await browser.close();
    await server.stop();
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
