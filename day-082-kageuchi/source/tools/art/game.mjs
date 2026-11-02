// OWNER: world-art（r02-fix-visual 追加）
// 遊ぶ画面（index.html）で見た目を確かめる。中核の撮影（tools/capture.mjs）と同じ ?shot= の構図を、別のビルド先（dist-f2）と
// 別のポート（5409）で撮る。並行して中核の担当が dist-core と 5404 を使っていても、互いのビルドを上書きしないため。
//
//   node tools/art/game.mjs r02-visual                 ビルド → 全構図を .captures/<周>/game-<構図>.png
//   --shots start,courtyard   一部だけ。--no-build でビルドを省く。--port でポート（既定 5409）
//   --alert                   発見の赤みの見比べ（中核の ui-alert と同じ手順で発見にし、同じ場所の平常と中央の明るさを比べる）
//   --doze                    鐘楼の居眠り番を横から当て身する途中（屋根の透かしと others の確かめ。r02-fix-play の checks4 と同じ立ち位置）
//   --perf <前の版のフォルダ>   性能：今の版と前の版を交互に2回ずつ、同じブラウザ・同じ時刻に測る（負荷平均つき）
//                             --dpr 2 で画素を増やす（WebKit は垂直同期で 16.7ms に張り付くので、GPU の差は画素を増やして見る）
import { execSync, spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertGpu, openBrowser, shoot } from '../lib/shoot.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VITE = path.join(ROOT, 'node_modules', '.bin', 'vite');
const OUT_DIR = 'dist-f2';
const ALL = ['title', 'start', 'gate', 'courtyard', 'bamboo', 'garden', 'nobunaga', 'finale', 'gameover', 'result'];
const VIEWPORT = { width: 1280, height: 720 };

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const round = String(args._[0] ?? 'scratch');
const outDir = path.join(ROOT, '.captures', round);
const PORT = Number(args.port ?? 5409);

function loadAvg() {
  const m = execSync('uptime').toString().match(/load averages?:\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function build() {
  const r = spawnSync(VITE, ['build', '--logLevel', 'warn', '--outDir', OUT_DIR, '--emptyOutDir'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, KAGE_PAGES: 'index', VITE_CACHE_DIR: 'node_modules/.vite-f2' },
  });
  if (r.status !== 0) throw new Error(`vite build が失敗（終了コード ${r.status}）`);
}

async function startPreview(dir) {
  const child = spawn(VITE, ['preview', '--outDir', dir, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const kill = () => child.exitCode === null && !child.killed && child.kill('SIGTERM');
  process.on('exit', kill);
  const url = `http://127.0.0.1:${PORT}`;
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const res = await fetch(`${url}/`);
      if (res.ok) break;
    } catch {
      /* まだ */
    }
    if (Date.now() > deadline || child.exitCode !== null) {
      kill();
      throw new Error(`プレビューが立たない: ${log}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        kill();
        setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 3000);
      }),
  };
}

/** 平均と中央（縦横の中ほど 40%）の相対輝度、白飛びの割合。 */
async function stats(file) {
  const { width, height, data } = PNG.sync.read(await readFile(file));
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  let sum = 0;
  let c = 0;
  let cn = 0;
  let clip = 0;
  let red = 0;
  let en = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
      sum += l;
      if (data[i] >= 250 || data[i + 1] >= 250 || data[i + 2] >= 250) clip++;
      const u = x / width;
      const v = y / height;
      if (u > 0.3 && u < 0.7 && v > 0.3 && v < 0.7) {
        c += l;
        cn++;
      } else if (u < 0.12 || u > 0.88 || v < 0.12 || v > 0.88) {
        red += data[i] - data[i + 1];
        en++;
      }
    }
  }
  const r4 = (x) => Math.round(x * 10000) / 10000;
  return { meanLum: r4(sum / (width * height)), centerLum: r4(c / cn), clipped: r4(clip / (width * height)), edgeRed: Math.round((red / en) * 10) / 10 };
}

async function shots(url) {
  const list = args.shots ? String(args.shots).split(',') : ALL;
  const { browser, name } = await openBrowser();
  const out = [];
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (const s of list) {
      const page = await ctx.newPage();
      const file = path.join(outDir, `game-${s}.png`);
      const { errors } = await shoot(page, `${url}/?shot=${s}`, file, { timeout: 240_000 });
      const st = await stats(file);
      out.push({ shot: s, browser: name, ...st, errors });
      console.log(`${s.padEnd(10)} mean=${st.meanLum} center=${st.centerLum} clip=${st.clipped} errors=${errors.length}${errors.length ? ` ${errors[0].slice(0, 300)}` : ''}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}

/** 発見の赤み：中核の ui-alert と同じ手順で発見にした画と、同じ場所に立った平常の画。 */
async function alertPair(url) {
  const { browser } = await openBrowser();
  const out = {};
  try {
    for (const kind of ['normal', 'alert']) {
      const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(`${url}/?autostart=1&seed=1&god=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__state?.screen === 'play' && window.__viewReady === true, null, { timeout: 240_000, polling: 250 });
      if (kind === 'alert') {
        await page.evaluate(() => window.__game.teleport(0, 33.5, 270));
        await page.evaluate(() => window.__input.down('KeyW'));
        await page.waitForFunction(() => window.__state.phase === 'alert', null, { timeout: 30_000 });
        await page.evaluate(() => window.__input.up('KeyW'));
      }
      await page.evaluate(() => window.__game.teleport(-14, 37.5, 270));
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__game.freeze(true));
      await page.waitForTimeout(300);
      const file = path.join(outDir, `game-ui-${kind}.png`);
      await page.screenshot({ path: file });
      out[kind] = await stats(file);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  out.centerRatio = Math.round((out.alert.centerLum / out.normal.centerLum) * 1000) / 1000;
  console.log(`発見の赤み：中央の明るさ 平常 ${out.normal.centerLum} → 発見 ${out.alert.centerLum}（比 ${out.centerRatio}）、縁の赤み ${out.normal.edgeRed} → ${out.alert.edgeRed}`);
  return out;
}

/** 鐘楼の居眠り番（-23, 19、東向き）を南から当て身し、動作の途中で止めて撮る。 */
async function dozeTakedown(url) {
  const { browser } = await openBrowser();
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${url}/?autostart=1&seed=1&god=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__state?.screen === 'play' && window.__viewReady === true, null, { timeout: 240_000, polling: 250 });
    await page.evaluate(() => {
      window.__game.teleport(-23, 19.8, 270);
      window.__game.setCrouch(true);
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__input.tap('KeyE'));
    await page.waitForTimeout(450);
    await page.evaluate(() => window.__game.freeze(true));
    await page.waitForTimeout(300);
    const file = path.join(outDir, 'game-doze-takedown.png');
    await page.screenshot({ path: file });
    const action = await page.evaluate(() => window.__state?.player?.action ?? null);
    console.log(`居眠り番の当て身：${file}（動作 ${JSON.stringify(action)}）`);
    return { file: path.relative(ROOT, file), action, ...(await stats(file)) };
  } finally {
    await browser.close();
  }
}

async function perfOnce(url, spot) {
  const pick = await openBrowser({ uncapped: true });
  try {
    const ctx = await pick.browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: Number(args.dpr ?? 1) });
    const page = await ctx.newPage();
    const loadBefore = loadAvg();
    await page.goto(`${url}/?autostart=1&god=1&seed=1&perf=${spot}`);
    const gpu = await assertGpu(page);
    await page.waitForFunction(() => window.__perfResult !== undefined || typeof window.__appError === 'string', null, { timeout: 300_000, polling: 250 });
    const res = await page.evaluate(() => window.__perfResult ?? { error: window.__appError });
    return { spot, browser: pick.name, gpu, ...res, loadBefore, loadAfter: loadAvg() };
  } finally {
    await pick.browser.close();
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  if (!args['no-build']) build();
  const result = { round, date: new Date().toISOString() };
  if (!args['perf-only']) {
    const server = await startPreview(OUT_DIR);
    try {
      if (!args['alert-only']) result.shots = await shots(server.url);
      if (args.alert || args['alert-only']) result.alert = await alertPair(server.url);
      if (args.doze) result.doze = await dozeTakedown(server.url);
    } finally {
      await server.stop();
    }
  }
  if (args.perf || args['perf-only']) {
    const base = String(args.perf === true ? args['perf-only'] : args.perf ?? args['perf-only']);
    const spots = String(args.spots ?? 'courtyard,garden').split(',');
    const runs = [];
    // 今の版 → 前の版 → 今の版 → 前の版（負荷の移り変わりを両方へ同じだけ掛ける）
    for (const [label, dir] of [['now', OUT_DIR], ['base', base], ['now', OUT_DIR], ['base', base]]) {
      const server = await startPreview(dir);
      try {
        for (const spot of spots) {
          const r = await perfOnce(server.url, spot);
          runs.push({ label, ...r });
          console.log(`${label.padEnd(4)} ${spot.padEnd(10)} p50=${r.p50}ms p95=${r.p95}ms cpuP50=${r.cpuP50} calls=${r.calls} tris=${r.triangles} 負荷 ${r.loadBefore?.[0]}→${r.loadAfter?.[0]} ${r.browser}`);
        }
      } finally {
        await server.stop();
      }
    }
    result.perf = runs;
  }
  await writeFile(path.join(outDir, args['perf-only'] ? 'game-perf.json' : 'game.json'), JSON.stringify(result, null, 2));
  console.log(`保存先: ${path.relative(ROOT, outDir)}/`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
