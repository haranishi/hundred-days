// OWNER: chars-art
// 人物の確認ページ chars.html の撮影。全構図を .captures/<周>/chars-<名前>.png へ、連番は1枚の一覧画像（chars-film-<名前>.png）に
// まとめ、足の滑りと性能の数字を .captures/<周>/chars-summary.json に書く。
//   npm run capture:chars -- r01a                    ビルド（dist-chars）→ preview（5408）で全部撮る
//   npm run capture:chars -- r01a --dev              dev サーバー（5407）を子プロセスで立てて撮る（ビルドを省く）
//   --shots lineup,poses   一部の構図だけ／--films walk,run   一部の連番だけ／--no-films／--no-perf／--frames 48
//   --keep-frames          連番の1コマずつの PNG も残す（film-<名前>/0000.png …）
// サーバーはこの道具が立てて、終わりに必ず止める。
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertGpu, openBrowser, shoot } from '../lib/shoot.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VITE = path.join(ROOT, 'node_modules', '.bin', 'vite');

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
const round = String(args._[0] ?? args.round ?? 'scratch');
const outDir = path.join(ROOT, '.captures', round);
const W = Number(args.width ?? 1280);
const H = Number(args.height ?? 720);
const ALL_SHOTS = ['lineup', 'lineupBack', 'poses', 'gameplay', 'gameplayMatte', 'closeAshigaru', 'closePlayer', 'closeSamurai', 'closeRanmaru', 'closeNobunaga'];
const ALL_FILMS = ['walk', 'run', 'crouch', 'takedown', 'assassinate', 'stopgo', 'alert', 'crouchup', 'turn', 'strike'];
const shots = args.shots ? String(args.shots).split(',') : ALL_SHOTS;
const films = args['no-films'] ? [] : args.films ? String(args.films).split(',') : ALL_FILMS;
// 連番のコマ数（1/60 秒刻み）。動作は始まりから倒れ終わるまで入るように長めにする
const FILM_FRAMES = { walk: 48, run: 36, crouch: 48, takedown: 84, assassinate: 120, stopgo: 288, alert: 192, crouchup: 192, turn: 144, strike: 96 };
const framesOf = (f) => Number(args.frames ?? FILM_FRAMES[f] ?? 48);

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
      last = new Error(`HTTP ${r.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`サーバーが応答しない: ${last}`);
}

/** サーバー（dev か preview）を子プロセスで立てる。stop() で必ず止める。 */
async function startServer(dev) {
  const port = dev ? 5407 : 5408;
  // すでに同じポートで動いている dev サーバーがあれば、それを使う（止めるのは立てた人）
  if (dev) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/chars.html`);
      if (r.ok) return { url: `http://127.0.0.1:${port}`, stop: async () => {} };
    } catch {
      // 動いていないので立てる
    }
  }
  const argv = dev
    ? ['--port', String(port), '--strictPort', '--host', '127.0.0.1']
    : ['preview', '--outDir', 'dist-chars', '--port', String(port), '--strictPort', '--host', '127.0.0.1'];
  const env = { ...process.env, VITE_CACHE_DIR: 'node_modules/.vite-chars', KAGE_PAGES: 'chars' };
  const child = spawn(VITE, argv, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const kill = () => {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
  };
  process.on('exit', kill);
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => (kill(), process.exit(130)));
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${url}/chars.html`, 30000);
  } catch (e) {
    kill();
    throw new Error(`${e.message}\n${log}`);
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

function build() {
  const t0 = Date.now();
  const r = spawnSync(VITE, ['build', '--outDir', 'dist-chars', '--logLevel', 'warn'], {
    cwd: ROOT,
    env: { ...process.env, KAGE_PAGES: 'chars', VITE_CACHE_DIR: 'node_modules/.vite-chars' },
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`ビルドに失敗（${r.status}）`);
  return Date.now() - t0;
}

/** PNG を縮めて（面積平均）、一覧の1マスにする。 */
function shrink(png, f) {
  const w = Math.floor(png.width / f);
  const h = Math.floor(png.height / f);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0];
      for (let j = 0; j < f; j++) {
        for (let i = 0; i < f; i++) {
          const k = ((y * f + j) * png.width + (x * f + i)) * 4;
          acc[0] += png.data[k];
          acc[1] += png.data[k + 1];
          acc[2] += png.data[k + 2];
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = acc[0] / (f * f);
      out.data[o + 1] = acc[1] / (f * f);
      out.data[o + 2] = acc[2] / (f * f);
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** 連番を一覧の1枚にまとめる（cols 列。各コマを f 分の1に縮める）。 */
function sheet(pngs, cols, f) {
  const cells = pngs.map((p) => shrink(p, f));
  const cw = cells[0].width;
  const ch = cells[0].height;
  const rows = Math.ceil(cells.length / cols);
  const out = new PNG({ width: cw * cols, height: ch * rows });
  out.data.fill(0);
  cells.forEach((c, n) => {
    const ox = (n % cols) * cw;
    const oy = Math.floor(n / cols) * ch;
    for (let y = 0; y < ch; y++) c.data.copy(out.data, ((oy + y) * out.width + ox) * 4, y * cw * 4, (y + 1) * cw * 4);
  });
  return out;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const buildMs = args.dev ? 0 : build();
  const server = await startServer(Boolean(args.dev));
  const { browser, name, reason } = await openBrowser();
  const summary = { round, date: new Date().toISOString(), browser: name, browserReason: reason, viewport: { W, H }, buildMs, shots: [], films: [], perf: null, errors: [] };
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const probe = await context.newPage();
    await probe.goto(`${server.url}/chars.html?shot=lineup`);
    summary.gpu = await assertGpu(probe);
    await probe.close();
    for (const s of shots) {
      const page = await context.newPage();
      const file = path.join(outDir, `chars-${s}.png`);
      const t0 = Date.now();
      // 「poses.3」のように書くと ?shot=poses&cell=3（1マスに寄る）
      // 「poses.3.side」は横から
      const [base, cellNo, view] = s.split('.');
      const q = (cellNo === undefined ? `shot=${base}` : `shot=${base}&cell=${cellNo}`) + (view ? `&view=${view}` : '');
      // ページの誤り（知らない構図など）は待たずに止める
      page.on('pageerror', () => {});
      const { errors } = await shoot(page, `${server.url}/chars.html?${q}`, file, { timeout: 90000 }).catch(async (e) => {
        const labErr = await page.evaluate(() => window.__labError ?? null).catch(() => null);
        throw new Error(`shot ${s}: ${labErr ?? e.message}`);
      });
      const info = await page.evaluate(() => window.__shotInfo ?? null);
      summary.shots.push({ name: s, file: path.relative(ROOT, file), ms: Date.now() - t0, info, errors });
      console.log(`shot ${s.padEnd(14)} ${Date.now() - t0}ms calls=${info?.calls} tris=${info?.triangles} errors=${errors.length}`);
      if (errors.length) console.log(`  最初のエラー: ${errors[0].slice(0, 800)}`);
      await page.close();
    }
    for (const f of films) {
      const page = await context.newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));
      const fw = 640;
      const fh = 360;
      await page.setViewportSize({ width: fw, height: fh });
      const frames = framesOf(f);
      await page.goto(`${server.url}/chars.html?film=${f}&frames=${frames}`);
      await page.waitForFunction(() => window.__filmReady === true || typeof window.__labError === 'string', null, { timeout: 60000 });
      const labErr = await page.evaluate(() => window.__labError ?? null);
      if (labErr) throw new Error(`film ${f}: ${labErr}`);
      const pngs = [];
      const dir = path.join(outDir, `film-${f}`);
      if (args['keep-frames']) await mkdir(dir, { recursive: true });
      for (let k = 0; k < frames; k++) {
        const n = await page.evaluate(() => window.__filmStep());
        if (n !== k) throw new Error(`コマ番号がずれた: 期待 ${k}、実際 ${n}`);
        const buf = await page.screenshot({ type: 'png' });
        pngs.push(PNG.sync.read(buf));
        if (args['keep-frames']) await writeFile(path.join(dir, `${String(k).padStart(4, '0')}.png`), buf);
      }
      const slip = await page.evaluate(() => ({ max: window.__footSlip ?? null, info: window.__footSlipInfo ?? null }));
      const every = Math.max(1, Math.round(frames / 24));
      const picked = pngs.filter((_, i) => i % every === 0).slice(0, 24);
      const out = sheet(picked, 4, 2);
      const file = path.join(outDir, `chars-film-${f}.png`);
      await writeFile(file, PNG.sync.write(out));
      summary.films.push({ name: f, frames, every, file: path.relative(ROOT, file), footSlip: slip.max, footSlipInfo: slip.info, errors });
      console.log(`film ${f.padEnd(12)} ${frames}コマ（一覧は ${every} コマおき） 足の滑りの最大 ${slip.max === null ? '-' : slip.max.toFixed(4)} m/s errors=${errors.length}`);
      if (errors.length) console.log(`  最初のエラー: ${errors[0].slice(0, 800)}`);
      await page.close();
    }
    if (!args['no-perf']) {
      const page = await context.newPage();
      await page.goto(`${server.url}/chars.html?perf=1`);
      await page.waitForFunction(() => window.__perfResult !== undefined || typeof window.__labError === 'string', null, { timeout: 120000 });
      summary.perf = await page.evaluate(() => window.__perfResult ?? window.__labError);
      console.log('perf', JSON.stringify(summary.perf));
      await page.close();
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  let prev = {};
  try {
    prev = JSON.parse(await readFile(path.join(outDir, 'chars-summary.json'), 'utf8'));
  } catch {
    prev = {};
  }
  // 一部だけ撮り直したときは、前の結果を残して上書きする
  const merged = { ...prev, ...summary, shots: mergeBy(prev.shots, summary.shots), films: mergeBy(prev.films, summary.films), perf: summary.perf ?? prev.perf ?? null };
  await writeFile(path.join(outDir, 'chars-summary.json'), JSON.stringify(merged, null, 2));
  console.log(`保存先: ${path.relative(ROOT, outDir)}/`);
  const bad = summary.shots.some((s) => s.errors.length) || summary.films.some((f) => f.errors.length);
  if (bad) process.exitCode = 1;
}

function mergeBy(a = [], b = []) {
  const m = new Map(a.map((x) => [x.name, x]));
  for (const x of b) m.set(x.name, x);
  return [...m.values()];
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
