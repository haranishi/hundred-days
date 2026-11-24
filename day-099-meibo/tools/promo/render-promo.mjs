// Day099 "meibo" 宣伝動画（縦 1080x1920・30fps・30秒）の撮影・書き出し CLI。
// 2つの Playwright ページ（①meibo 実アプリ DPR 3 ②ステージ CSS 540x960 DPR 2）を使い、
// 毎コマ時計を 1/30 秒進めて clip 付きで撮り、ステージへ貼って書き出す。
//
// 使い方:
//   node day-099-meibo/tools/promo/render-promo.mjs \
//     --out-dir "$OUT" --meibo-bin "$MEIBO_BIN" --db "$MEIBO_DEMO_DB" \
//     [--ai-a a.mp4 --ai-b b.mp4] [--ai-a-in 0 --ai-b-in 0.5] \
//     [--audio-dir "$OUT/audio"] [--mux a,b] \
//     [--frames 120-240] [--no-encode] [--encode-only] [--selftest]
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, get as httpGet } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const CAPTURE_CSS = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    scroll-behavior: auto !important;
  }
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256File = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex');

export function parseCliArgs(argv, env = process.env) {
  const opt = (name, fallback = undefined) => {
    const idx = argv.indexOf(`--${name}`);
    if (idx >= 0) {
      const val = argv[idx + 1];
      if (val === undefined || val.startsWith('--')) throw new Error(`--${name} に値がありません`);
      return val;
    }
    const prefixed = argv.find((a) => a.startsWith(`--${name}=`));
    return prefixed ? prefixed.slice(name.length + 3) : fallback;
  };
  const flag = (name) => argv.includes(`--${name}`);
  const numOpt = (name, fallback) => {
    const raw = opt(name, undefined);
    if (raw === undefined) return fallback;
    const val = Number(raw);
    if (!Number.isFinite(val) || val < 0) throw new Error(`--${name} は 0 以上の数値にしてください: ${raw}`);
    return val;
  };

  const framesArg = opt('frames', '');
  let rangeFrom = 0;
  let rangeTo = T.TOTAL_FRAMES - 1;
  if (framesArg) {
    const match = /^(\d+)-(\d+)$/.exec(framesArg.trim());
    if (!match) throw new Error(`--frames は a-b 形式で指定してください: ${framesArg}`);
    rangeFrom = Number(match[1]);
    rangeTo = Number(match[2]);
    if (rangeFrom > rangeTo || rangeTo >= T.TOTAL_FRAMES) {
      throw new Error(`--frames の範囲が不正です（0..${T.TOTAL_FRAMES - 1}）: ${framesArg}`);
    }
  }

  const muxRaw = opt('mux', '') || '';
  const mux = muxRaw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const v of mux) {
    if (v !== 'a' && v !== 'b') throw new Error(`--mux は a または b を指定してください: ${v}`);
  }

  const outDir = resolve(opt('out-dir', join(tmpdir(), 'day099-promo', 'render')));
  const meiboBin = opt('meibo-bin', env.MEIBO_BIN || '');
  const dbPath = opt('db', env.MEIBO_DEMO_DB || '');
  const aiA = opt('ai-a', '');
  const aiB = opt('ai-b', '');
  const aiAIn = numOpt('ai-a-in', T.AI_CLIPS.a.defaultIn);
  const aiBIn = numOpt('ai-b-in', T.AI_CLIPS.b.defaultIn);
  const audioDir = opt('audio-dir', '');

  return {
    outDir,
    meiboBin: meiboBin ? resolve(meiboBin) : '',
    dbPath: dbPath ? resolve(dbPath) : '',
    aiA: aiA ? resolve(aiA) : '',
    aiB: aiB ? resolve(aiB) : '',
    aiAIn,
    aiBIn,
    audioDir: audioDir ? resolve(audioDir) : '',
    mux,
    partial: Boolean(framesArg),
    rangeFrom,
    rangeTo,
    noEncode: flag('no-encode'),
    encodeOnly: flag('encode-only'),
    selftest: flag('selftest'),
  };
}

export function buildDemoFilter(ranges = T.DEMO_RANGES) {
  const parts = ranges.map(([a, b], i) => `[0:v]trim=${a}:${b},setpts=PTS-STARTPTS[v${i}]`).join(';');
  const inputs = ranges.map((_, i) => `[v${i}]`).join('');
  return `${parts};${inputs}concat=n=${ranges.length}:v=1:a=0,scale=540:960:flags=lanczos,format=yuv420p[v]`;
}

export function formatTokyoMonth(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).format(date);
}

export function findTableColumns(headerTexts) {
  const cleaned = headerTexts.map((t) => String(t ?? '').replace(/[▲▼↑↓↕⇅]/g, '').replace(/\s+/g, ' ').trim());
  const pick = (exactList, partialList) => {
    for (const key of exactList) {
      const idx = cleaned.findIndex((t) => t === key);
      if (idx >= 0) return idx;
    }
    for (const key of partialList) {
      const idx = cleaned.findIndex((t) => t.includes(key));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    companyIndex: pick(['取引先名', '取引先', '会社名', '企業名', '社名'], ['取引先', '会社', '企業', '社名']),
    ownerIndex: pick(['担当', '担当者'], ['担当']),
    nextActionIndex: pick(['次回対応', '次回対応日時'], ['次回対応']),
  };
}

export function normalizeNextActionValue(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text || text === '—' || text === '-' || text === '未設定') return null;
  return text;
}

export function isNegativeCurrency(raw) {
  const text = String(raw ?? '').trim();
  return /^(?:[¥￥]\s*)?[-−－–▲△]/.test(text);
}

export function extractProjectionDiffRows(projections) {
  if (!Array.isArray(projections)) return [];
  const rows = [];
  for (const item of projections) {
    const name = String(item?.owner ?? '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const cells = Array.isArray(item?.cells) ? item.cells : [];
    const diffCell = cells.find((c) => String(c?.label ?? '').trim() === '目標との差')
      || cells.find((c) => String(c?.label ?? '').includes('目標との差'));
    const value = String(diffCell?.value ?? '').replace(/\s+/g, ' ').trim();
    if (!value || value === '—' || value === '-') continue;
    rows.push({ name, value, negative: isNegativeCurrency(value) });
  }
  return rows;
}

export function computeLogoClip(rects, viewport = null, pad = 2) {
  const valid = (Array.isArray(rects) ? rects : []).filter(
    (r) => r && Number.isFinite(r.x) && Number.isFinite(r.y) && r.width > 0 && r.height > 0,
  );
  if (!valid.length) return null;
  const minX = Math.min(...valid.map((r) => r.x));
  const minY = Math.min(...valid.map((r) => r.y));
  const maxX = Math.max(...valid.map((r) => r.x + r.width));
  const maxY = Math.max(...valid.map((r) => r.y + r.height));
  const vpW = Number.isFinite(viewport?.width) ? viewport.width : Infinity;
  const vpH = Number.isFinite(viewport?.height) ? viewport.height : Infinity;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const right = Math.min(vpW, maxX + pad);
  const bottom = Math.min(vpH, maxY + pad);
  if (right <= x || bottom <= y) return null;
  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round((right - x) * 100) / 100,
    height: Math.round((bottom - y) * 100) / 100,
  };
}

// 商談ボードの上端からカメラ上端までの余白（8〜12px。直前の説明文の途中で切れないようにする）。
export function computeBoardTopPad(boardTop, prevBottom = null) {
  if (Number.isFinite(prevBottom) && prevBottom < boardTop) {
    const gap = boardTop - prevBottom;
    if (gap >= 14) return 10;
    if (gap >= 10) return 8;
    return Math.max(4, Math.floor(gap - 1));
  }
  return 10;
}

export function createCalloutState(t0, { label, value = '', sub = '', rows = null, hold }) {
  const cleanLabel = String(label ?? '').trim();
  if (!cleanLabel || !Number.isFinite(hold) || hold <= 0) return null;
  if (Array.isArray(rows)) {
    const cleanRows = rows
      .map((r) => ({
        name: String(r?.name ?? '').trim(),
        value: String(r?.value ?? '').trim(),
        negative: Boolean(r?.negative),
      }))
      .filter((r) => r.name && r.value);
    if (!cleanRows.length) return null;
    return {
      t0,
      hold,
      label: cleanLabel,
      value: '',
      sub: String(sub ?? '').trim(),
      rows: cleanRows,
    };
  }
  const cleanValue = String(value ?? '').trim();
  if (!cleanValue) return null;
  return {
    t0,
    hold,
    label: cleanLabel,
    value: cleanValue,
    sub: String(sub ?? '').trim(),
  };
}

function resolveTool(tool) {
  const homebrew = `/opt/homebrew/bin/${tool}`;
  return process.env[tool.toUpperCase()] || (existsSync(homebrew) ? homebrew : tool);
}

function runTool(tool, args) {
  const bin = resolveTool(tool);
  const r = spawnSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${tool} failed (code ${r.status}): ${(r.stderr || '').slice(-500)}`);
  return r;
}

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createNetServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolvePort(port)));
    });
  });
}

function probeHttp200(url) {
  return new Promise((resolveOk) => {
    const req = httpGet(url, (res) => {
      res.resume();
      resolveOk(res.statusCode === 200);
    });
    req.on('error', () => resolveOk(false));
    req.setTimeout(1000, () => { req.destroy(); resolveOk(false); });
  });
}

async function stopChild(child, graceMs = 3000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolveStop) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveStop();
    };
    child.once('exit', finish);
    try { child.kill('SIGTERM'); } catch { finish(); return; }
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }
      setTimeout(finish, 300);
    }, graceMs);
  });
}

async function startMeiboServer({ meiboBin, dbPath, outDir }) {
  const workDir = join(outDir, 'work-db');
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  const workDb = join(workDir, 'meibo-demo-copy.db');
  copyFileSync(dbPath, workDb);
  // meibo は WAL を使う。書き戻し前の変更が `-wal` にあっても、複製から落とさない。
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(dbPath + suffix)) copyFileSync(dbPath + suffix, workDb + suffix);
  }

  const port = await getFreePort();
  const child = spawn(meiboBin, ['serve', workDb, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  const append = (chunk) => {
    logs = (logs + chunk.toString('utf8')).slice(-4000);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);

  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`meibo サーバーが起動直後に終了しました (code=${child.exitCode}, signal=${child.signalCode}):\n${logs}`);
    }
    if (await probeHttp200(url)) {
      return { child, port, url, workDb, getLogs: () => logs };
    }
    await sleep(100);
  }
  await stopChild(child);
  throw new Error(`meibo サーバーが 15 秒待っても ${url} で 200 を返しませんでした:\n${logs}`);
}

function readMeiboIdentity(meiboBin, dbPath) {
  let version = null;
  try {
    const r = spawnSync(meiboBin, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0 && (r.stdout || '').trim()) version = r.stdout.trim();
  } catch { /* ignore */ }
  return {
    appVersion: version,
    appSha256: sha256File(meiboBin),
    dbSha256: sha256File(dbPath),
  };
}

// AI クリップ（a.mp4 / b.mp4）を 1080x1920（cover 中央切り抜き）・30fps の JPEG 連番へ展開する。音声は捨てる。
function extractAiFrames(clipPath, clipSpec, inSeconds, outDir) {
  const dest = join(outDir, 'ai', clipSpec.key);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  runTool('ffmpeg', [
    '-y',
    '-ss', String(inSeconds),
    '-i', clipPath,
    '-t', String(clipSpec.duration),
    '-an',
    '-vf', `fps=${T.FPS},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuvj420p`,
    '-q:v', '2',
    join(dest, '%04d.jpg'),
  ]);
  const expected = Math.round(clipSpec.duration * T.FPS);
  let count = 0;
  for (let i = 1; i <= expected + 5; i++) {
    if (existsSync(join(dest, `${String(i).padStart(4, '0')}.jpg`))) count = i;
    else break;
  }
  if (count === 0) throw new Error(`AI クリップ ${clipSpec.label} から連番画像を展開できませんでした: ${clipPath}`);
  return { dir: dest, count };
}

function startStageServer({ outDir, liveState }) {
  const aiRoot = resolve(outDir, 'ai');
  const server = createHttpServer((req, res) => {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    if (pathname === '/live/app.jpg') {
      if (!liveState.appJpeg) { res.writeHead(404); res.end('no app frame'); return; }
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
      res.end(liveState.appJpeg);
      return;
    }
    if (pathname === '/live/logo.png') {
      if (!liveState.logoPng) { res.writeHead(404); res.end('no logo'); return; }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      res.end(liveState.logoPng);
      return;
    }
    let root = null;
    let rel = '';
    if (pathname.startsWith('/stage/')) { root = here; rel = pathname.slice(7); }
    else if (pathname.startsWith('/ai/')) { root = aiRoot; rel = pathname.slice(4); }
    if (!root) { res.writeHead(404); res.end('not found'); return; }
    const target = resolve(root, normalize(rel));
    if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403); res.end('forbidden'); return; }
    if (!existsSync(target) || !statSync(target).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(target));
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolveServer({ server, port: typeof addr === 'object' && addr ? addr.port : 0 });
    });
  });
}

// ---- 実ブラウザ撮影 ----

async function capture(opts) {
  if (!opts.meiboBin || !existsSync(opts.meiboBin)) {
    throw new Error('meibo の実行ファイルが見つかりません。--meibo-bin または環境変数 MEIBO_BIN で指定してください。');
  }
  if (!opts.dbPath || !existsSync(opts.dbPath)) {
    throw new Error('デモ DB が見つかりません。--db または環境変数 MEIBO_DEMO_DB で指定してください。');
  }
  if (opts.aiA && !existsSync(opts.aiA)) throw new Error(`--ai-a のファイルが見つかりません: ${opts.aiA}`);
  if (opts.aiB && !existsSync(opts.aiB)) throw new Error(`--ai-b のファイルが見つかりません: ${opts.aiB}`);

  mkdirSync(opts.outDir, { recursive: true });
  const frameDir = opts.partial
    ? join(opts.outDir, `preview-${opts.rangeFrom}-${opts.rangeTo}`)
    : join(opts.outDir, 'frames');
  if (!opts.partial) rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });

  const aiFrames = {
    a: opts.aiA ? extractAiFrames(opts.aiA, T.AI_CLIPS.a, opts.aiAIn, opts.outDir) : null,
    b: opts.aiB ? extractAiFrames(opts.aiB, T.AI_CLIPS.b, opts.aiBIn, opts.outDir) : null,
  };

  const identity = readMeiboIdentity(opts.meiboBin, opts.dbPath);
  const capturedAt = new Date();
  const targetMonth = formatTokyoMonth(capturedAt);
  const report = {
    day: 99,
    capturedAt: capturedAt.toISOString(),
    targetMonth,
    fps: T.FPS,
    totalFrames: T.TOTAL_FRAMES,
    range: [opts.rangeFrom, opts.rangeTo],
    identity,
    aiClips: {
      a: aiFrames.a ? { mode: 'video', inSeconds: opts.aiAIn, frames: aiFrames.a.count } : { mode: 'placeholder' },
      b: aiFrames.b ? { mode: 'video', inSeconds: opts.aiBIn, frames: aiFrames.b.count } : { mode: 'placeholder' },
    },
    actions: [],
    readValues: {},
    missing: [],
    warnings: [],
    msPerFrame: 0,
  };

  const liveState = { appJpeg: null, logoPng: null };
  // meibo を先に起動する。ステージ用サーバーを先に開くと、meibo の起動に失敗したとき、開いたまま残って Node が終わらなくなる。
  const meiboSrv = await startMeiboServer({ meiboBin: opts.meiboBin, dbPath: opts.dbPath, outDir: opts.outDir });

  let browser = null;
  const onSignal = () => {
    stopChild(meiboSrv.child).finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  let stageSrv = null;
  try {
    stageSrv = await startStageServer({ outDir: opts.outDir, liveState });
  } catch (err) {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await stopChild(meiboSrv.child);
    throw err;
  }

  const reportPath = join(opts.outDir, opts.partial ? `capture-report-${opts.rangeFrom}-${opts.rangeTo}.json` : 'capture-report.json');
  const writeReport = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

  try {
    browser = await chromium.launch({ args: ['--lang=ja-JP'] }); // 日付・月の入力欄の表示を日本語にする（既定は英語）
    const appViewport = { width: 1280, height: 2200 };
    const appContext = await browser.newContext({
      viewport: appViewport,
      deviceScaleFactor: 3,
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      reducedMotion: 'reduce',
      bypassCSP: true, // アプリのCSPは style-src 'self'。撮影用の遷移停止CSSを差し込むため、撮影用の複製に限って外す
    });
    const appPage = await appContext.newPage();
    appPage.on('pageerror', (e) => report.warnings.push(`app pageerror: ${e.message}`));
    appPage.on('console', (m) => { if (m.type() === 'error') report.warnings.push(`app console: ${m.text().slice(0, 200)}`); });
    appPage.on('dialog', (d) => { report.warnings.push(`app dialog (${d.type()}): ${d.message()}`); d.accept().catch(() => {}); });

    const stageContext = await browser.newContext({
      viewport: { width: T.STAGE.width, height: T.STAGE.height },
      deviceScaleFactor: T.STAGE.dpr,
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      reducedMotion: 'reduce',
    });
    const stagePage = await stageContext.newPage();
    stagePage.on('pageerror', (e) => report.warnings.push(`stage pageerror: ${e.message}`));

    // Node側ポーリングによる 3 秒待機ヘルパー（page.clock.pauseAt 中でも固まらない）
    async function waitVisible(locator, { scene, step, query, timeoutMs = 3000 }) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() <= deadline) {
        try {
          if (await locator.count() > 0) {
            const box = await locator.first().boundingBox();
            if (box && box.width > 0 && box.height > 0) return locator.first();
          }
        } catch { /* retry */ }
        await sleep(50);
      }
      report.missing.push({ scene, step, query });
      writeReport();
      throw new Error(`[${scene}] 手順「${step}」で部品が見つかりません（${timeoutMs}ms待機）: ${query}`);
    }

    async function waitCondition(checkFn, { scene, step, query, timeoutMs = 3000 }) {
      const deadline = Date.now() + timeoutMs;
      let lastError = null;
      while (Date.now() <= deadline) {
        try {
          const ok = await checkFn();
          if (ok) return ok;
        } catch (err) {
          lastError = err;
        }
        await sleep(50);
      }
      report.missing.push({ scene, step, query, reason: lastError?.message || 'timeout' });
      writeReport();
      throw new Error(`[${scene}] 手順「${step}」の条件を満たしませんでした（${timeoutMs}ms待機）: ${query}`);
    }

    async function docRectOf(locator) {
      return locator.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
      });
    }

    async function docBounds() {
      return appPage.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: Math.max(document.documentElement.scrollHeight, window.innerHeight),
      }));
    }

    const unionRect = (rects) => {
      const xs = rects.map((r) => r.x);
      const ys = rects.map((r) => r.y);
      const rs = rects.map((r) => r.x + r.width);
      const bs = rects.map((r) => r.y + r.height);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...rs) - x, height: Math.max(...bs) - y };
    };

    const navButton = (label) => appPage.locator('nav.workspace-navigation button').filter({ hasText: label }).first();
    const laneByHeading = (prefix) => appPage.locator('.crm-lane').filter({ has: appPage.locator('h2', { hasText: new RegExp(`^${prefix}`) }) }).first();

    // ---- 1. アプリ初期読み込み・ロゴ取得・UI-1 準備（撮らない工程）----
    const clockInstalledAtMs = Date.now();
    await appPage.clock.install({ time: capturedAt });
    await appPage.goto(meiboSrv.url, { waitUntil: 'domcontentloaded' });
    await appPage.addStyleTag({ content: CAPTURE_CSS });

    await waitCondition(
      () => appPage.evaluate(() => {
        const tc = document.getElementById('table-container');
        const btn = document.getElementById('start-call-mode');
        return tc && tc.getAttribute('aria-busy') === 'false' && btn && !btn.disabled;
      }),
      { scene: 'prep', step: '取引先一覧の読み込み', query: '#table-container[aria-busy="false"] と #start-call-mode 有効化', timeoutMs: 10_000 },
    );

    // 終わりのカード・下端ブランド表示用ロゴ（.brand-mark と右の「meibo」の外接矩形＋上下左右2pxを clip 撮影。撮れなければ a.brand 要素撮影）
    let logoBg = null;
    try {
      const brandLoc = appPage.locator('a.brand').first();
      if (await brandLoc.count() > 0 && await brandLoc.boundingBox()) {
        const brandInfo = await appPage.evaluate(() => {
          const brand = document.querySelector('a.brand');
          if (!brand) return null;
          let bg = null;
          let cur = brand;
          while (cur && cur.nodeType === 1) {
            const color = getComputedStyle(cur).backgroundColor;
            const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(color);
            if (m) {
              const r = Number(m[1]);
              const g = Number(m[2]);
              const b = Number(m[3]);
              const a = m[4] === undefined ? 1 : Number(m[4]);
              if (a >= 0.95) {
                const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                if (luma >= 210) bg = `rgb(${r}, ${g}, ${b})`;
                break;
              }
            }
            cur = cur.parentElement;
          }
          const mark = brand.querySelector('.brand-mark');
          if (!mark) return { bg, rects: null, viewport: { width: window.innerWidth, height: window.innerHeight } };
          const mr = mark.getBoundingClientRect();
          if (mr.width <= 0 || mr.height <= 0) {
            return { bg, rects: null, viewport: { width: window.innerWidth, height: window.innerHeight } };
          }
          const textRects = [];
          const walker = document.createTreeWalker(brand, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            if (mark.contains(node)) continue;
            const raw = node.nodeValue || '';
            if (!raw.trim()) continue;
            const range = document.createRange();
            const idx = raw.toLowerCase().indexOf('meibo');
            if (idx >= 0) {
              range.setStart(node, idx);
              range.setEnd(node, idx + 5);
            } else {
              const lead = raw.length - raw.trimStart().length;
              const trail = raw.length - raw.trimEnd().length;
              range.setStart(node, lead);
              range.setEnd(node, raw.length - trail);
            }
            const r = range.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.right >= mr.right) {
              textRects.push({ x: r.left, y: r.top, width: r.width, height: r.height, isMeibo: idx >= 0 });
            }
          }
          let targets = textRects.filter((r) => r.isMeibo);
          if (!targets.length) targets = textRects;
          if (!targets.length) {
            targets = [...brand.children]
              .filter((ch) => ch !== mark)
              .map((ch) => ch.getBoundingClientRect())
              .filter((r) => r.width > 0 && r.height > 0 && r.right >= mr.right)
              .map((r) => ({ x: r.left, y: r.top, width: r.width, height: r.height }));
          }
          const rects = targets.length
            ? [{ x: mr.left, y: mr.top, width: mr.width, height: mr.height }, ...targets]
            : null;
          return { bg, rects, viewport: { width: window.innerWidth, height: window.innerHeight } };
        });
        logoBg = brandInfo?.bg || null;
        const clip = computeLogoClip(brandInfo?.rects, brandInfo?.viewport, 2);
        if (clip) {
          try {
            liveState.logoPng = await appPage.screenshot({ clip, type: 'png' });
            report.readValues.logoCaptured = true;
            report.readValues.logoCaptureMode = 'clip';
          } catch {
            liveState.logoPng = await brandLoc.screenshot({ type: 'png' });
            report.readValues.logoCaptured = true;
            report.readValues.logoCaptureMode = 'element';
          }
        } else {
          liveState.logoPng = await brandLoc.screenshot({ type: 'png' });
          report.readValues.logoCaptured = true;
          report.readValues.logoCaptureMode = 'element';
        }
      } else {
        report.readValues.logoCaptured = false;
        report.readValues.logoCaptureMode = 'fallback';
        report.warnings.push('a.brand が見つからず、終わりのカードは文字のみで表示します');
      }
    } catch (err) {
      report.readValues.logoCaptured = false;
      report.readValues.logoCaptureMode = 'fallback';
      report.warnings.push(`a.brand の撮影に失敗: ${err.message}`);
    }

    // 準備：「取引先」→「架電モード」→ 1件目の記録画面を開く
    const callModeBtn = await waitVisible(appPage.getByRole('button', { name: '架電モード' }), {
      scene: 'prep', step: '架電モード起動', query: 'button "架電モード"',
    });
    await callModeBtn.click();

    await waitVisible(appPage.getByRole('heading', { name: '活動を記録する' }), {
      scene: 'prep', step: '架電モード1件目の表示', query: 'heading "活動を記録する"', timeoutMs: 5000,
    });
    await waitCondition(
      () => appPage.evaluate(() => document.getElementById('record-workspace')?.getAttribute('aria-busy') === 'false'),
      { scene: 'prep', step: '1件目レコード読込完了', query: '#record-workspace[aria-busy="false"]' },
    );

    const firstCompanyName = (await appPage.locator('#selected-company-title').first().innerText()).trim();
    report.readValues.firstCompanyName = firstCompanyName;

    // 活動メモは required のため、準備の段階で短い合成メモを入れておく
    const noteField = await waitVisible(appPage.getByLabel('活動メモ'), {
      scene: 'prep', step: '活動メモの事前入力', query: 'label "活動メモ" (#activity-note)',
    });
    await noteField.fill(T.PREP_ACTIVITY_NOTE);

    // ステージを準備
    await stagePage.goto(`http://127.0.0.1:${stageSrv.port}/stage/stage.html`, { waitUntil: 'load' });
    await stagePage.evaluate(() => document.fonts.ready);
    await stagePage.evaluate((cfg) => window.stage.init(cfg), {
      end: T.END_CARD,
      footerNote: T.STAGE.footerNote.text,
      footerBrandText: T.STAGE.footerBrand.text,
      logoSrc: liveState.logoPng ? '/live/logo.png' : null,
      logoBg,
    });

    // 時計を止めてコマ送り開始
    // install 後は実時間で進んでいる。pauseAt は未来の時刻しか受け付けないので、経過分に少し足した時刻で止める。
    await appPage.clock.pauseAt(new Date(capturedAt.getTime() + (Date.now() - clockInstalledAtMs) + 1500));

    // ---- 2. 撮影中の状態 ----
    const S = {
      viewport: { ...appViewport },
      viewportChangedAtFrame: -1,
      camera: { cx: 1050, cy: 520, w: 490, h: 490 / T.WINDOW_ASPECT },
      camAnim: null,
      boardPan: null,
      finger: { x: 270, y: 500, alpha: 0 },
      fingerAnim: null,
      fingerFade: null,
      fingerLeaveAt: null,
      tapAt: null,
      tapPos: null,
      highlights: [],
      callout: null,
      calloutWarned: {},
      nextAction: null,
      pendingDeal: null,
      movedDeal: null,
      landingForecast: null,
      projectionDiffs: null,
      lastCamDocRect: { x: 800, y: 200, width: 490, height: 490 / T.WINDOW_ASPECT },
    };

    const realizedCues = [];

    function showCallout(t, { label, value = '', sub = '', rows = null, hold }) {
      const state = createCalloutState(t, { label, value, sub, rows, hold });
      if (!state) return false;
      S.callout = state;
      return true;
    }

    async function readFirstRowNextAction() {
      const raw = await appPage.evaluate(() => {
        const table = document.querySelector('#table-container table') || document.querySelector('table');
        if (!table) return { hasTable: false, headers: [], hasRow: false, cells: [], companyPrimary: [] };
        const headerRow = table.querySelector('thead tr:last-child') || table.querySelector('thead tr');
        const headers = headerRow
          ? [...headerRow.querySelectorAll('th, td')].map((el) => (el.innerText || el.textContent || '').trim())
          : [...table.querySelectorAll('thead th')].map((el) => (el.innerText || el.textContent || '').trim());
        const firstRow = table.querySelector('tbody tr');
        if (!firstRow) return { hasTable: true, headers, hasRow: false, cells: [], companyPrimary: [] };
        const cellEls = [...firstRow.cells];
        return {
          hasTable: true,
          headers,
          hasRow: true,
          cells: cellEls.map((el) => (el.innerText || el.textContent || '').trim()),
          companyPrimary: cellEls.map((el) => {
            const inner = el.querySelector('a, button, strong, .company-name');
            const text = inner ? (inner.innerText || inner.textContent || '') : (el.innerText || el.textContent || '');
            return text.split('\n').map((s) => s.trim()).find(Boolean) || '';
          }),
        };
      });
      const cols = findTableColumns(raw.headers);
      let companyName = '';
      if (raw.hasRow) {
        if (cols.companyIndex >= 0 && cols.companyIndex < raw.companyPrimary.length) {
          companyName = raw.companyPrimary[cols.companyIndex];
        } else {
          companyName = raw.companyPrimary.find((text) => Boolean(text)) || '';
        }
      }
      const rawNext = raw.hasRow && cols.nextActionIndex >= 0 && cols.nextActionIndex < raw.cells.length
        ? raw.cells[cols.nextActionIndex]
        : '';
      const value = normalizeNextActionValue(rawNext);
      return {
        hasTable: raw.hasTable,
        hasRow: raw.hasRow,
        headers: raw.headers,
        ...cols,
        companyName,
        rawNext,
        value,
      };
    }

    async function resolveCameraGoal(targetName, preferredWidth) {
      const bounds = await docBounds();
      if (targetName === 'activityPanel') {
        const heading = await waitVisible(appPage.getByRole('heading', { name: '活動を記録する' }), {
          scene: 'ui-1', step: '活動パネル位置取得', query: 'heading "活動を記録する"',
        });
        const panel = heading.locator('xpath=ancestor::section[contains(@class,"detail-section")]').first();
        const rect = await docRectOf(panel);
        return T.computeCameraForRect(rect, { padX: 22, padY: 16, preferredWidth, alignX: 'center', alignY: 'top', bounds });
      }
      if (targetName === 'callModeNext') {
        const nextBtn = await waitVisible(appPage.getByRole('button', { name: '保存して次へ' }), {
          scene: 'ui-1', step: '保存して次へボタン位置取得', query: 'button "保存して次へ"',
        });
        const banner = appPage.locator('.call-mode-banner').first();
        const rBtn = await docRectOf(nextBtn);
        const rBan = await docRectOf(banner);
        // 保存すると右上にトースト（「架電を記録し、再架電を予約しました。」）が出る。ボタンからページの右端までを収める。
        const rightEdge = bounds?.width ?? (rBtn.x + rBtn.width + 200);
        return T.computeCameraForRect({ x: rightEdge - (preferredWidth ?? 480), y: rBan.y - 8, width: preferredWidth ?? 480, height: rBan.height + 170 }, {
          padX: 0, padY: 12, preferredWidth, alignX: 'right', alignY: 'top', bounds,
        });
      }
      if (targetName === 'companyHeader') {
        const title = await waitVisible(appPage.locator('#selected-company-title'), {
          scene: 'ui-1', step: '取引先名見出し位置取得', query: '#selected-company-title',
        });
        const banner = appPage.locator('.call-mode-banner').first();
        const rects = [await docRectOf(title)];
        if (await banner.count() > 0 && await banner.boundingBox()) rects.push(await docRectOf(banner));
        const r = unionRect(rects);
        return T.computeCameraForRect({ x: r.x, y: r.y, width: Math.min(r.width, 460), height: Math.min(r.height + 40, 380) }, {
          padX: 20, padY: 20, preferredWidth, alignX: 'left', alignY: 'top', bounds,
        });
      }
      if (targetName === 'exitCallMode') {
        const exitBtn = await waitVisible(appPage.getByRole('button', { name: '架電モードを終了' }), {
          scene: 'ui-1', step: '架電モードを終了ボタン位置取得', query: 'button "架電モードを終了"',
        });
        const rBtn = await docRectOf(exitBtn);
        const banner = appPage.locator('.call-mode-banner').first();
        const topY = (await banner.count() > 0 && await banner.boundingBox())
          ? Math.min(rBtn.y, (await docRectOf(banner)).y)
          : rBtn.y;
        return T.computeCameraForRect(
          { x: rBtn.x - 40, y: topY, width: rBtn.width + 80, height: Math.max(rBtn.height + 160, 220) },
          { padX: 24, padY: 20, preferredWidth, alignX: 'center', alignY: 'top', bounds },
        );
      }
      if (targetName === 'firstRowNextAction') {
        const table = await waitVisible(appPage.locator('#table-container table').first(), {
          scene: 'ui-1', step: '取引先一覧テーブル位置取得', query: '#table-container table',
        });
        const firstRow = await waitVisible(table.locator('tbody tr').first(), {
          scene: 'ui-1', step: '取引先一覧 1 行目位置取得', query: '#table-container table tbody tr:first-child',
        });
        const nextIdx = S.nextAction?.nextActionIndex ?? -1;
        const ownerIdx = S.nextAction?.ownerIndex ?? -1;
        const rowCells = firstRow.locator(':scope > th, :scope > td');
        const headCells = table.locator('thead tr:last-child > th, thead tr:last-child > td');
        const cellCount = await rowCells.count();
        const headCount = await headCells.count();
        if (nextIdx >= 0 && nextIdx < cellCount) {
          await rowCells.nth(nextIdx).evaluate((cell) => {
            const sc = cell.closest('#table-container');
            if (sc && sc.scrollWidth > sc.clientWidth + 4) {
              const sr = sc.getBoundingClientRect();
              const cr = cell.getBoundingClientRect();
              const cellCenter = cr.left - sr.left + sc.scrollLeft + cr.width / 2;
              sc.scrollLeft = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, cellCenter - sc.clientWidth / 2));
            }
          });
          const nextCellRect = await docRectOf(rowCells.nth(nextIdx));
          const rects = [nextCellRect];
          if (nextIdx < headCount) rects.push(await docRectOf(headCells.nth(nextIdx)));
          if (ownerIdx >= 0 && ownerIdx < cellCount && ownerIdx !== nextIdx) {
            const ownerCellRect = await docRectOf(rowCells.nth(ownerIdx));
            const combined = unionRect([...rects, ownerCellRect]);
            const maxCombinedW = (preferredWidth ?? T.MAX_READABLE_CAMERA_WIDTH) - 36;
            if (combined.width <= maxCombinedW) {
              rects.push(ownerCellRect);
              if (ownerIdx < headCount) rects.push(await docRectOf(headCells.nth(ownerIdx)));
            }
          }
          const r = unionRect(rects);
          return T.computeCameraForRect(r, {
            padX: 28, padY: 36, preferredWidth, alignX: 'center', alignY: 'top', bounds,
          });
        }
        const rowRect = await docRectOf(firstRow);
        return T.computeCameraForRect(rowRect, {
          padX: 24, padY: 36, preferredWidth, alignX: 'right', alignY: 'top', bounds,
        });
      }
      if (targetName === 'navDeals') {
        const btn = await waitVisible(navButton('商談'), { scene: 'ui-1', step: '商談タブ位置取得', query: 'nav.workspace-navigation button "商談"' });
        const rect = await docRectOf(btn);
        return T.computeCameraForRect(rect, { padX: 80, padY: 40, preferredWidth, alignX: 'center', alignY: 'top', bounds });
      }
      if (targetName === 'boardStart') {
        const board = await waitVisible(appPage.locator('.crm-board'), { scene: 'ui-2', step: '商談ボード位置取得', query: '.crm-board' });
        const info = await board.evaluate((el) => {
          el.scrollLeft = 0;
          const r = el.getBoundingClientRect();
          let prev = el.previousElementSibling;
          while (prev && prev.getBoundingClientRect().height <= 0) prev = prev.previousElementSibling;
          if (!prev && el.parentElement) {
            prev = el.parentElement.previousElementSibling;
            while (prev && prev.getBoundingClientRect().height <= 0) prev = prev.previousElementSibling;
          }
          const prevBottom = prev ? prev.getBoundingClientRect().bottom + window.scrollY : null;
          return {
            rect: { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height },
            prevBottom,
          };
        });
        const padY = computeBoardTopPad(info.rect.y, info.prevBottom);
        return T.computeCameraForRect(info.rect, { padX: 14, padY, preferredWidth, alignX: 'left', alignY: 'top', bounds });
      }
      if (targetName === 'salesReportBtn') {
        const btn = await waitVisible(appPage.getByRole('button', { name: '月次集計' }), {
          scene: 'ui-2', step: '月次集計ボタン位置取得', query: 'button "月次集計"',
        });
        const rect = await docRectOf(btn);
        return T.computeCameraForRect(rect, { padX: 40, padY: 36, preferredWidth, alignX: 'right', alignY: 'top', bounds });
      }
      if (targetName === 'reportTotalsLeft' || targetName === 'reportTotalsRight') {
        const totals = await waitVisible(appPage.locator('dl.sales-report-totals'), {
          scene: 'ui-3', step: '月次集計4カード位置取得', query: 'dl.sales-report-totals',
        });
        const rect = await docRectOf(totals);
        return T.computeCameraForRect(rect, {
          padX: 18, padY: 112, preferredWidth, alignX: targetName === 'reportTotalsLeft' ? 'left' : 'right', alignY: 'top', bounds, // カードの上の「対象月」の行まで窓に入れる（上端で見切れた）
        });
      }
      if (targetName === 'projectionRight') {
        // 表は横にスクロールする入れ物に入っている。右端まで送って、「着地予測・月間目標・目標との差」の列を見せる（担当名は札で補う）。
        const heading = await waitVisible(appPage.getByRole('heading', { name: '商談担当別の着地予測' }), {
          scene: 'ui-3', step: '担当別の表見出し位置取得', query: 'heading "商談担当別の着地予測"',
        });
        const box = await waitVisible(appPage.locator('.sales-projection-scroll'), {
          scene: 'ui-3', step: '担当別の表の入れ物の位置取得', query: '.sales-projection-scroll',
        });
        await appPage.evaluate(() => {
          const sc = document.querySelector('.sales-projection-scroll');
          if (sc) sc.scrollLeft = sc.scrollWidth;
        });
        const r = unionRect([await docRectOf(heading), await docRectOf(box)]);
        return T.computeCameraForRect(r, {
          padX: 12, padY: 22, preferredWidth, alignX: 'right', alignY: 'top', bounds,
        });
      }
      if (targetName === 'projectionLeft') {
        const heading = await waitVisible(appPage.getByRole('heading', { name: '商談担当別の着地予測' }), {
          scene: 'ui-3', step: '担当別の表見出し位置取得', query: 'heading "商談担当別の着地予測"',
        });
        const table = await waitVisible(appPage.locator('table.sales-projection-table'), {
          scene: 'ui-3', step: '担当別の表位置取得', query: 'table.sales-projection-table',
        });
        await appPage.evaluate(() => {
          const sc = document.querySelector('.sales-projection-scroll');
          if (sc) sc.scrollLeft = 0;
        });
        const r = unionRect([await docRectOf(heading), await docRectOf(table)]);
        return T.computeCameraForRect(r, {
          padX: 18, padY: 22, preferredWidth, alignX: 'left', alignY: 'top', bounds,
        });
      }
      throw new Error(`未知のカメラ対象: ${targetName}`);
    }

    async function readProjectionDiffColumnRect() {
      return appPage.evaluate(() => {
        const table = document.querySelector('table.sales-projection-table');
        if (!table) return null;
        const headers = [...table.querySelectorAll('thead tr:last-child th, thead tr:last-child td')];
        let colIdx = headers.findIndex((el) => (el.textContent || '').trim() === '目標との差');
        if (colIdx < 0) colIdx = headers.findIndex((el) => (el.textContent || '').includes('目標との差'));
        const sc = table.closest('.sales-projection-scroll');
        const clipBox = sc && sc.scrollWidth > sc.clientWidth + 2 ? sc.getBoundingClientRect() : null;
        const rects = [];
        const pushRect = (el) => {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          let left = r.left;
          let right = r.right;
          if (clipBox) {
            left = Math.max(left, clipBox.left);
            right = Math.min(right, clipBox.right);
            if (right <= left) return;
          }
          rects.push({ x: left + window.scrollX, y: r.top + window.scrollY, width: right - left, height: r.height });
        };
        if (colIdx >= 0 && headers[colIdx]) pushRect(headers[colIdx]);
        for (const row of table.querySelectorAll('tbody tr')) {
          let cell = [...row.querySelectorAll('td')].find((td) => {
            const lbl = (td.dataset.label || '').trim();
            return lbl === '目標との差' || lbl.includes('目標との差');
          });
          if (!cell && colIdx >= 0) cell = row.cells[colIdx] || null;
          if (cell) pushRect(cell);
        }
        if (!rects.length) return null;
        const x = Math.min(...rects.map((r) => r.x));
        const y = Math.min(...rects.map((r) => r.y));
        const right = Math.max(...rects.map((r) => r.x + r.width));
        const bottom = Math.max(...rects.map((r) => r.y + r.height));
        return { x, y, width: right - x, height: bottom - y };
      });
    }

    async function resolveHighlightTarget(targetName) {
      if (targetName === 'callbackTiming') return { loc: appPage.locator('#activity-callback-timing').first() };
      if (targetName === 'companyTitle') return { loc: appPage.locator('#selected-company-title').first() };
      if (targetName === 'firstRowNextActionCell') {
        const idx = S.nextAction?.nextActionIndex;
        if (typeof idx === 'number' && idx >= 0) {
          return { loc: appPage.locator('#table-container table tbody tr').first().locator(':scope > th, :scope > td').nth(idx) };
        }
        return null;
      }
      if (targetName === 'proposalTopDealCard') {
        const lane = laneByHeading('提案');
        if (await lane.count() === 0) return null;
        const firstCard = lane.locator('.crm-deal-card').first();
        if (await firstCard.count() === 0) return null;
        const dealName = (await firstCard.locator('.crm-record-name').first().innerText().catch(() => '')).trim();
        if (dealName) {
          S.pendingDeal = S.pendingDeal || { name: dealName, amount: '', from: '提案' };
          return { loc: lane.locator('.crm-deal-card').filter({ hasText: dealName }).first() };
        }
        return { loc: firstCard };
      }
      if (targetName === 'movedDealCard' && S.movedDeal?.name) {
        return { loc: laneByHeading('受注').locator('.crm-deal-card').filter({ hasText: S.movedDeal.name }).first() };
      }
      if (targetName === 'landingCard') {
        return { loc: appPage.locator('dl.sales-report-totals > div').filter({ has: appPage.locator('dt', { hasText: '着地予測' }) }).first() };
      }
      if (targetName === 'projectionTable') {
        return { loc: appPage.locator('table.sales-projection-table').first() };
      }
      if (targetName === 'projectionDiffColumn') {
        const rect = await readProjectionDiffColumnRect();
        if (!rect) return null;
        return { getRect: readProjectionDiffColumnRect, fallbackRect: rect };
      }
      return null;
    }

    async function resolveClickLocator(action) {
      if (action.type === 'check-absence') {
        return waitVisible(appPage.getByLabel('不在のため再架電を予約'), {
          scene: action.scene, step: action.label, query: 'label "不在のため再架電を予約"',
        });
      }
      if (action.type === 'save-and-next') {
        return waitVisible(appPage.getByRole('button', { name: '保存して次へ' }), {
          scene: action.scene, step: action.label, query: 'button "保存して次へ"',
        });
      }
      if (action.type === 'exit-call-mode') {
        return waitVisible(appPage.getByRole('button', { name: '架電モードを終了' }), {
          scene: action.scene, step: action.label, query: 'button "架電モードを終了"',
        });
      }
      if (action.type === 'open-deals-board') {
        return waitVisible(navButton(action.nav), {
          scene: action.scene, step: action.label, query: `nav.workspace-navigation button "${action.nav}"`,
        });
      }
      if (action.type === 'focus-deal-stage' || action.type === 'move-deal-won') {
        const lane = await waitVisible(laneByHeading(action.fromLane), {
          scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}"`,
        });
        const card = S.pendingDeal?.name
          ? await waitVisible(lane.locator('.crm-deal-card').filter({ hasText: S.pendingDeal.name }).first(), {
            scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}" のカード "${S.pendingDeal.name}"`,
          })
          : await waitVisible(lane.locator('.crm-deal-card').first(), {
            scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}" の先頭カード`,
          });
        return waitVisible(card.locator('select.crm-stage-select').first(), {
          scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}" 先頭カードの段階 <select>`,
        });
      }
      if (action.type === 'open-sales-report') {
        return waitVisible(appPage.getByRole('button', { name: '月次集計' }), {
          scene: action.scene, step: action.label, query: 'button "月次集計"',
        });
      }
      return null;
    }

    async function projectedCamDocRectAt(targetTime) {
      if (!S.camAnim) return S.lastCamDocRect;
      const p = T.clamp((targetTime - S.camAnim.t0) / Math.max(1e-6, S.camAnim.t1 - S.camAnim.t0));
      const cam = T.interpolateCamera(S.camAnim.from, S.camAnim.to, p);
      const bounds = await docBounds();
      return T.cameraToClip(cam, S.viewport, bounds.height).docRect;
    }

    function startFingerApproach(t, targetDocRect, arriveAt, camDocRect = S.lastCamDocRect) {
      const center = { x: targetDocRect.x + targetDocRect.width / 2, y: targetDocRect.y + targetDocRect.height / 2 };
      const st = T.appToStagePoint(center, camDocRect);
      const to = {
        x: T.clamp(st.x, T.STAGE.window.x + 12, T.STAGE.window.x + T.STAGE.window.width - 12),
        y: T.clamp(st.y, T.STAGE.window.y + 12, T.STAGE.window.y + T.STAGE.window.height - 12),
      };
      const from = S.finger.alpha > 0.3
        ? { x: S.finger.x, y: S.finger.y }
        : { x: T.clamp(to.x + 42, 40, 500), y: T.clamp(to.y + 84, 240, 730) };
      S.finger.x = from.x;
      S.finger.y = from.y;
      S.fingerAnim = { t0: t, t1: Math.max(t + 0.05, arriveAt - 0.03), from, to };
      S.fingerFade = { t0: t, t1: t + 0.14, from: S.finger.alpha, to: 1 };
      S.fingerLeaveAt = null;
    }

    // ---- 3. 予定表（時刻順）を組み立てる ----
    // 同一時刻の実行順: 0=viewport変更 -> 1=操作・画面遷移 -> 2=カメラ・パン・強調・札 -> 3=次操作への指移動(approach)
    const queue = [];
    let seq = 0;
    const orderOf = (type) => {
      if (type === 'set-viewport') return 0;
      if (type === 'camera-focus' || type === 'board-pan' || type === 'highlight' || type === 'show-callout') return 2;
      return 1;
    };
    const push = (atSec, order, action, fn) => queue.push({ at: atSec, order, seq: seq++, action, fn });

    for (const action of T.ACTIONS) {
      if (action.lead) {
        push(Math.max(0, action.at - action.lead), 3, { ...action, type: `approach:${action.type}` }, async (t) => {
          const loc = await resolveClickLocator(action);
          if (!loc) return;
          const rect = await docRectOf(loc);
          const camDocRect = await projectedCamDocRectAt(action.at);
          startFingerApproach(t, rect, action.at, camDocRect);
        });
      }

      push(action.at, orderOf(action.type), action, async (t, f) => {
        if (action.cue) realizedCues.push({ ...action.cue, at: Math.round((f / T.FPS) * 1000) / 1000 });

        if (action.type === 'cue' || action.type === 'end-card') {
          if (action.type === 'end-card') S.fingerFade = { t0: t, t1: t + 0.12, from: S.finger.alpha, to: 0 };
          return;
        }

        if (action.type === 'set-viewport') {
          S.viewport = { width: action.width, height: action.height };
          S.viewportChangedAtFrame = f;
          await appPage.setViewportSize(S.viewport);
          await appPage.evaluate(() => { void document.body.offsetHeight; });
          await appPage.clock.runFor(16);
          return;
        }

        if (action.type === 'camera-focus') {
          const goal = await resolveCameraGoal(action.target, action.width);
          if (!action.over || action.over <= 0) {
            S.camera = goal;
            S.camAnim = null;
            const bounds = await docBounds();
            S.lastCamDocRect = T.cameraToClip(S.camera, S.viewport, bounds.height).docRect;
          } else {
            S.camAnim = { t0: t, t1: t + action.over, from: { ...S.camera }, to: goal };
          }
          return;
        }

        if (action.type === 'check-absence') {
          const loc = await resolveClickLocator(action);
          const rect = await docRectOf(loc);
          const pt = T.appToStagePoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, S.lastCamDocRect);
          S.finger.x = pt.x; S.finger.y = pt.y; S.fingerAnim = null; S.tapAt = t; S.tapPos = pt; S.fingerLeaveAt = t + 0.25;
          await loc.click();
          const checked = await loc.isChecked();
          const timingText = (await appPage.locator('#activity-callback-timing').first().innerText().catch(() => '')).trim();
          report.readValues.absenceChecked = checked;
          report.readValues.callbackTimingText = timingText;
          if (!checked) report.warnings.push('不在チェックボックスがチェック状態になりませんでした');
          return;
        }

        if (action.type === 'save-and-next') {
          const loc = await resolveClickLocator(action);
          const rect = await docRectOf(loc);
          const pt = T.appToStagePoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, S.lastCamDocRect);
          S.finger.x = pt.x; S.finger.y = pt.y; S.fingerAnim = null; S.tapAt = t; S.tapPos = pt; S.fingerLeaveAt = t + 0.22;
          await loc.click();
          const nextName = await waitCondition(
            async () => {
              const busy = await appPage.evaluate(() => document.getElementById('record-workspace')?.getAttribute('aria-busy'));
              if (busy === 'true') return false;
              const titleEl = appPage.locator('#selected-company-title').first();
              if (await titleEl.count() === 0) return false;
              const name = (await titleEl.innerText()).trim();
              return name && name !== firstCompanyName ? name : false;
            },
            { scene: action.scene, step: action.label, query: `保存後の次の取引先名（${firstCompanyName} から変化）` },
          );
          report.readValues.secondCompanyName = nextName;
          report.readValues.companyChanged = nextName !== firstCompanyName;
          return;
        }

        if (action.type === 'hide-notice') {
          // アプリのトースト（#notice）は、次に出すときに自分で hidden を外す。次のボタンに重ならないよう、読ませたあとで消す。
          await appPage.evaluate(() => { const n = document.getElementById('notice'); if (n) n.hidden = true; });
          return;
        }
        if (action.type === 'exit-call-mode') {
          const loc = await resolveClickLocator(action);
          const rect = await docRectOf(loc);
          const pt = T.appToStagePoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, S.lastCamDocRect);
          S.finger.x = pt.x; S.finger.y = pt.y; S.fingerAnim = null; S.tapAt = t; S.tapPos = pt; S.fingerLeaveAt = t + 0.22;
          await loc.click();
          await waitCondition(
            async () => {
              const ready = await appPage.evaluate(() => {
                const tc = document.getElementById('table-container');
                if (!tc || tc.getAttribute('aria-busy') !== 'false') return false;
                const r = tc.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return false;
                return Boolean(tc.querySelector('table tbody tr'));
              });
              if (!ready) return false;
              const h1 = appPage.getByRole('heading', { level: 1, name: '取引先' }).first();
              return (await h1.count() > 0) && Boolean(await h1.boundingBox());
            },
            { scene: action.scene, step: '取引先一覧の読み込み完了', query: 'h1 "取引先"・#table-container[aria-busy="false"]・table tbody tr' },
          );
          let rowInfo = await readFirstRowNextAction();
          const settleDeadline = Date.now() + 1500;
          while (Date.now() < settleDeadline) {
            const busy = await appPage.evaluate(() => document.getElementById('table-container')?.getAttribute('aria-busy'));
            if (busy === 'false' && rowInfo.value) break;
            await sleep(50);
            rowInfo = await readFirstRowNextAction();
          }
          report.readValues.nextAction = {
            companyName: rowInfo.companyName,
            value: rowInfo.value || '',
          };
          S.nextAction = {
            companyName: rowInfo.companyName,
            value: rowInfo.value,
            nextActionIndex: rowInfo.nextActionIndex,
            ownerIndex: rowInfo.ownerIndex,
          };
          if (rowInfo.companyName && firstCompanyName && rowInfo.companyName !== firstCompanyName) {
            report.warnings.push(`取引先一覧 1 行目の社名（${rowInfo.companyName}）が架電 1 件目（${firstCompanyName}）と一致しません`);
          }
          if (!rowInfo.hasTable || !rowInfo.hasRow) {
            S.calloutWarned.nextAction = true;
            report.warnings.push('取引先一覧の 1 行目を読み取れなかったため、「次回対応」の大きな札を出さずに続行します');
          } else if (rowInfo.nextActionIndex < 0) {
            S.calloutWarned.nextAction = true;
            report.warnings.push('取引先一覧の thead th から「次回対応」列を見つけられなかったため、大きな札を出さずに続行します');
          } else if (!rowInfo.value) {
            S.calloutWarned.nextAction = true;
            report.warnings.push(`取引先一覧 1 行目の「次回対応」セルから有効な日付を読み取れなかったため、大きな札を出さずに続行します（取得値: "${rowInfo.rawNext}"）`);
          }
          return;
        }

        if (action.type === 'open-deals-board') {
          const loc = await resolveClickLocator(action);
          const rect = await docRectOf(loc);
          const pt = S.viewportChangedAtFrame === f && S.finger.alpha > 0.3
            ? { x: S.finger.x, y: S.finger.y }
            : T.appToStagePoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, S.lastCamDocRect);
          S.finger.x = pt.x; S.finger.y = pt.y; S.fingerAnim = null; S.tapAt = t; S.tapPos = pt; S.fingerLeaveAt = t + 0.22;
          await loc.click();
          await waitCondition(
            async () => {
              const ready = await appPage.evaluate(() => {
                const box = document.getElementById('crm-workspace');
                if (!box || box.hidden) return false;
                if (box.getAttribute('aria-busy') === 'true') return false;
                return !(box.textContent || '').includes('読み込んでいます');
              });
              if (!ready) return false;
              const board = appPage.locator('.crm-board').first();
              if (await board.count() > 0 && await board.boundingBox()) return 'board';
              const toBoard = appPage.getByRole('button', { name: 'ボードで表示' }).first();
              if (await toBoard.count() > 0 && await toBoard.boundingBox()) return 'toggle';
              return false;
            },
            { scene: action.scene, step: '商談の読み込み', query: '#crm-workspace 読込完了（.crm-board または ボードで表示）' },
          );
          const boardAlready = appPage.locator('.crm-board').first();
          if (!(await boardAlready.count() > 0 && await boardAlready.boundingBox())) {
            const toBoard = appPage.getByRole('button', { name: 'ボードで表示' }).first();
            if (await toBoard.count() > 0 && await toBoard.boundingBox()) {
              await toBoard.click();
            }
          }
          await waitVisible(appPage.locator('.crm-board'), {
            scene: action.scene, step: '商談ボードの表示', query: '.crm-board',
          });
          return;
        }

        if (action.type === 'board-pan') {
          const board = await waitVisible(appPage.locator('.crm-board'), {
            scene: action.scene, step: action.label, query: '.crm-board',
          });
          const lane = await waitVisible(laneByHeading(action.toLane), {
            scene: action.scene, step: action.label, query: `商談列 "${action.toLane}"`,
          });
          const panInfo = await board.evaluate((b, targetPrefix) => {
            const lanes = [...b.querySelectorAll('.crm-lane')];
            const found = lanes.find((el) => (el.querySelector('h2')?.textContent || '').trim().startsWith(targetPrefix));
            if (!found) return null;
            const br = b.getBoundingClientRect();
            const fr = found.getBoundingClientRect();
            let prev = b.previousElementSibling;
            while (prev && prev.getBoundingClientRect().height <= 0) prev = prev.previousElementSibling;
            if (!prev && b.parentElement) {
              prev = b.parentElement.previousElementSibling;
              while (prev && prev.getBoundingClientRect().height <= 0) prev = prev.previousElementSibling;
            }
            const prevBottom = prev ? prev.getBoundingClientRect().bottom + window.scrollY : null;
            const laneLeftInBoard = fr.left - br.left + b.scrollLeft;
            const max = Math.max(0, b.scrollWidth - b.clientWidth);
            const targetScroll = Math.max(0, Math.min(max, laneLeftInBoard - 24));
            const laneFinalLeftInBoard = laneLeftInBoard - targetScroll;
            return {
              from: b.scrollLeft,
              to: targetScroll,
              targetDocX: br.left + window.scrollX + laneFinalLeftInBoard,
              targetDocY: br.top + window.scrollY,
              prevBottom,
              laneWidth: fr.width,
              boardHeight: br.height,
            };
          }, action.toLane);
          if (!panInfo) throw new Error(`[${action.scene}] 手順「${action.label}」で列「${action.toLane}」が見つかりません`);
          S.boardPan = { t0: t, t1: t + action.over, from: panInfo.from, to: panInfo.to };
          const bounds = await docBounds();
          const padY = computeBoardTopPad(panInfo.targetDocY, panInfo.prevBottom);
          const goal = T.computeCameraForRect(
            { x: panInfo.targetDocX, y: panInfo.targetDocY, width: Math.min(panInfo.laneWidth * 2, 460), height: Math.min(panInfo.boardHeight, 480) },
            { padX: 16, padY, preferredWidth: 500, alignX: 'left', alignY: 'top', bounds },
          );
          S.camAnim = { t0: t, t1: t + action.over, from: { ...S.camera }, to: goal };
          void lane;
          return;
        }

        if (action.type === 'focus-deal-stage') {
          const fromLane = await waitVisible(laneByHeading(action.fromLane), {
            scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}"`,
          });
          const card = S.pendingDeal?.name
            ? await waitVisible(fromLane.locator('.crm-deal-card').filter({ hasText: S.pendingDeal.name }).first(), {
              scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}" のカード "${S.pendingDeal.name}"`,
            })
            : await waitVisible(fromLane.locator('.crm-deal-card').first(), {
              scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}" の先頭カード`,
            });
          const dealName = (await card.locator('.crm-record-name').first().innerText()).trim();
          const dealAmount = (await card.locator('.crm-money').first().innerText().catch(() => '')).trim();
          S.pendingDeal = { name: dealName, amount: dealAmount, from: action.fromLane };
          const selectLoc = await waitVisible(card.locator('select.crm-stage-select').first(), {
            scene: action.scene, step: action.label, query: `商談「${dealName}」の段階 <select>`,
          });
          const rect = await docRectOf(selectLoc);
          const pt = T.appToStagePoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, S.lastCamDocRect);
          S.finger.x = pt.x; S.finger.y = pt.y; S.finger.alpha = 1; S.fingerAnim = null; S.fingerFade = null;
          S.tapAt = t; S.tapPos = pt; S.fingerLeaveAt = null;
          return;
        }

        if (action.type === 'preview-deal-stage') {
          const fromLane = await waitVisible(laneByHeading(action.fromLane), {
            scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}"`,
          });
          const card = S.pendingDeal?.name
            ? await waitVisible(fromLane.locator('.crm-deal-card').filter({ hasText: S.pendingDeal.name }).first(), {
              scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}" のカード "${S.pendingDeal.name}"`,
            })
            : await waitVisible(fromLane.locator('.crm-deal-card').first(), {
              scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}" の先頭カード`,
            });
          const dealName = S.pendingDeal?.name || (await card.locator('.crm-record-name').first().innerText()).trim();
          const dealAmount = S.pendingDeal?.amount || (await card.locator('.crm-money').first().innerText().catch(() => '')).trim();
          S.pendingDeal = { name: dealName, amount: dealAmount, from: action.fromLane };
          const selectLoc = await waitVisible(card.locator('select.crm-stage-select').first(), {
            scene: action.scene, step: action.label, query: `商談「${dealName}」の段階 <select>`,
          });
          const stageVal = String(action.stageValue ?? '4');
          const actualVal = await selectLoc.evaluate((el, val) => {
            el.value = val;
            return el.value;
          }, stageVal);
          if (actualVal !== stageVal) {
            report.warnings.push(`段階選択欄の表示値を "${stageVal}" に設定できませんでした（現在値: "${actualVal}"）`);
          }
          // カードが消える 14.75s より前に指の輪を消し、次のカードの上に残らないようにする（14.55→14.71 でフェードアウト）
          S.fingerLeaveAt = t + 0.25;
          return;
        }

        if (action.type === 'move-deal-won') {
          S.fingerAnim = null;
          S.fingerLeaveAt = null;
          if (S.finger.alpha > 0.01) {
            S.fingerFade = { t0: t, t1: Math.min(t + 0.1, 14.88), from: S.finger.alpha, to: 0 };
          } else {
            S.finger.alpha = 0;
            S.fingerFade = null;
          }
          S.highlights = S.highlights.filter((hl) => hl.target !== 'proposalTopDealCard');

          const fromLane = await waitVisible(laneByHeading(action.fromLane), {
            scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}"`,
          });
          const card = S.pendingDeal?.name
            ? await waitVisible(fromLane.locator('.crm-deal-card').filter({ hasText: S.pendingDeal.name }).first(), {
              scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}" のカード "${S.pendingDeal.name}"`,
            })
            : await waitVisible(fromLane.locator('.crm-deal-card').first(), {
              scene: action.scene, step: action.label, query: `商談列 "${action.fromLane}" の先頭カード`,
            });
          const dealName = S.pendingDeal?.name || (await card.locator('.crm-record-name').first().innerText()).trim();
          const dealAmount = S.pendingDeal?.amount || (await card.locator('.crm-money').first().innerText().catch(() => '')).trim();
          const selectLoc = await waitVisible(card.locator('select.crm-stage-select').first(), {
            scene: action.scene, step: action.label, query: `商談「${dealName}」の段階 <select>`,
          });
          const savedScrollLeft = await appPage.evaluate(() => document.querySelector('.crm-board')?.scrollLeft ?? 0);
          const stageVal = String(action.stageValue ?? '4');
          await selectLoc.evaluate((el, val) => {
            if (el.value !== val) el.value = val;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, stageVal);
          await waitCondition(
            async () => {
              const wonLane = laneByHeading(action.toStage);
              if (await wonLane.count() === 0) return false;
              const moved = wonLane.locator('.crm-deal-card').filter({ hasText: dealName });
              return (await moved.count()) > 0;
            },
            { scene: action.scene, step: '受注列へのカード移動確認', query: `商談列 "${action.toStage}" 内のカード "${dealName}"` },
          );
          // 再描画で新しく生成された .crm-board の横スクロール位置を復元し、左端への瞬間戻りを防ぐ
          await appPage.evaluate((sl) => {
            const b = document.querySelector('.crm-board');
            if (b) b.scrollLeft = sl;
          }, savedScrollLeft);
          S.movedDeal = { name: dealName, amount: dealAmount, from: action.fromLane, to: action.toStage };
          report.readValues.movedDeal = S.movedDeal;
          return;
        }

        if (action.type === 'open-sales-report') {
          const btn = await resolveClickLocator(action);
          const rect = await docRectOf(btn);
          const pt = T.appToStagePoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, S.lastCamDocRect);
          S.finger.x = pt.x; S.finger.y = pt.y; S.fingerAnim = null; S.tapAt = t; S.tapPos = pt; S.fingerLeaveAt = t + 0.22;
          await btn.click();

          const monthInput = await waitVisible(appPage.locator('.sales-report-month input[type="month"]'), {
            scene: action.scene, step: '月次集計の対象月入力', query: '.sales-report-month input[type="month"]',
          });
          await waitVisible(appPage.locator('dl.sales-report-totals'), {
            scene: action.scene, step: '月次集計カードの読み込み', query: 'dl.sales-report-totals',
          });
          const currentMonth = await monthInput.inputValue();
          if (currentMonth !== targetMonth) {
            await monthInput.fill(targetMonth);
            await monthInput.dispatchEvent('change');
            await waitCondition(
              () => appPage.evaluate(() => Boolean(document.querySelector('dl.sales-report-totals'))
                && !document.querySelector('.sales-report')?.textContent?.includes('集計しています')),
              { scene: action.scene, step: `対象月 ${targetMonth} の再集計`, query: 'dl.sales-report-totals 再描画' },
            );
          }

          const reportData = await appPage.evaluate(() => {
            const totals = [...document.querySelectorAll('dl.sales-report-totals > div')].map((cell) => ({
              label: cell.querySelector('dt')?.textContent?.trim() || '',
              value: cell.querySelector('dd:not(.sales-report-caption)')?.textContent?.trim() || '',
              caption: cell.querySelector('dd.sales-report-caption')?.textContent?.trim() || '',
            }));
            const projHeaders = [...document.querySelectorAll('table.sales-projection-table thead th')].map((th) => th.textContent?.trim() || '');
            const projections = [...document.querySelectorAll('table.sales-projection-table tbody tr')].map((row) => {
              const hasRowTh = Boolean(row.querySelector('th'));
              return {
                owner: row.querySelector('th')?.textContent?.trim() || '',
                cells: [...row.querySelectorAll('td')].map((td, idx) => ({
                  label: td.dataset.label || projHeaders[hasRowTh ? idx + 1 : idx] || '',
                  value: td.textContent?.trim() || '',
                })),
              };
            });
            return { totals, projections };
          });
          report.readValues.salesReportMonth = targetMonth;
          report.readValues.salesReportTotals = reportData.totals;
          report.readValues.salesProjections = reportData.projections;

          const landing = reportData.totals.find((item) => item.label === '着地予測');
          if (landing && landing.value && landing.value !== '—') {
            S.landingForecast = { label: landing.label, value: landing.value };
          } else {
            S.landingForecast = null;
            S.calloutWarned.landingForecast = true;
            report.warnings.push('月次集計から「着地予測」の有効な金額を読み取れなかったため、大きな札を出さずに続行します');
          }

          const diffRows = extractProjectionDiffRows(reportData.projections);
          if (diffRows.length > 0) {
            S.projectionDiffs = diffRows;
          } else {
            S.projectionDiffs = null;
            S.calloutWarned.projectionDiffs = true;
            report.warnings.push('月次集計の担当別の表から「目標との差」を読み取れなかったため、大きな札を出さずに続行します');
          }
          return;
        }

        if (action.type === 'show-callout') {
          const source = action.valueFrom === 'nextAction'
            ? { value: S.nextAction?.value, sub: S.nextAction?.companyName || '' }
            : action.valueFrom === 'landingForecast'
              ? { value: S.landingForecast?.value, sub: '' }
              : action.valueFrom === 'projectionDiffs'
                ? { rows: S.projectionDiffs || [] }
                : { value: action.calloutValue, sub: action.calloutSub || '' };
          const shown = showCallout(t, {
            label: action.calloutLabel,
            value: source.value || '',
            sub: source.sub || '',
            rows: source.rows ?? null,
            hold: action.hold,
          });
          if (!shown && !S.calloutWarned[action.valueFrom]) {
            report.warnings.push(`大きな札「${action.calloutLabel || ''}」の値を読み取れなかったため、札を出さずに続行します`);
          }
          return;
        }

        if (action.type === 'highlight') {
          const resolved = await resolveHighlightTarget(action.target);
          if (resolved?.getRect && resolved.fallbackRect) {
            S.highlights.push({ target: action.target, t0: t, hold: action.hold, getRect: resolved.getRect, fallbackRect: resolved.fallbackRect });
          } else if (resolved?.loc && await resolved.loc.count() > 0 && await resolved.loc.boundingBox()) {
            S.highlights.push({ target: action.target, t0: t, hold: action.hold, loc: resolved.loc, fallbackRect: await docRectOf(resolved.loc) });
          } else if (action.target !== 'projectionDiffColumn' || !S.projectionDiffs?.length) {
            report.warnings.push(`highlight 対象が見つかりません: ${action.target}`);
          }
        }
      });
    }
    queue.sort((x, y) => x.at - y.at || x.order - y.order || x.seq - y.seq);

    // ---- 4. コマ送り撮影（0..899）----
    const started = Date.now();
    for (let f = 0; f < T.TOTAL_FRAMES; f++) {
      if (opts.partial && f > opts.rangeTo) break;
      const t = f / T.FPS;

      while (queue.length && queue[0].at <= t + 1e-6) {
        const q = queue.shift();
        await q.fn(t, f);
        report.actions.push({ frame: f, at: Math.round(t * 1000) / 1000, type: q.action.type, label: q.action.label });
      }

      // 連続する動きの更新
      if (S.camAnim) {
        const p = T.clamp((t - S.camAnim.t0) / (S.camAnim.t1 - S.camAnim.t0));
        S.camera = T.interpolateCamera(S.camAnim.from, S.camAnim.to, p);
        if (p >= 1) S.camAnim = null;
      }
      if (S.boardPan) {
        const p = T.easeInOut(T.clamp((t - S.boardPan.t0) / (S.boardPan.t1 - S.boardPan.t0)));
        const sl = S.boardPan.from + (S.boardPan.to - S.boardPan.from) * p;
        await appPage.evaluate((v) => { const b = document.querySelector('.crm-board'); if (b) b.scrollLeft = v; }, sl);
        if (t >= S.boardPan.t1) S.boardPan = null;
      }
      if (S.fingerFade) {
        const p = T.clamp((t - S.fingerFade.t0) / (S.fingerFade.t1 - S.fingerFade.t0));
        S.finger.alpha = S.fingerFade.from + (S.fingerFade.to - S.fingerFade.from) * p;
        if (p >= 1) S.fingerFade = null;
      }
      if (S.fingerLeaveAt != null && t >= S.fingerLeaveAt && !S.fingerFade) {
        S.fingerFade = { t0: t, t1: t + 0.16, from: S.finger.alpha, to: 0 };
        S.fingerLeaveAt = null;
      }
      if (S.fingerAnim) {
        const p = T.easeInOut(T.clamp((t - S.fingerAnim.t0) / (S.fingerAnim.t1 - S.fingerAnim.t0)));
        S.finger.x = S.fingerAnim.from.x + (S.fingerAnim.to.x - S.fingerAnim.from.x) * p;
        S.finger.y = S.fingerAnim.from.y + (S.fingerAnim.to.y - S.fingerAnim.from.y) * p - 10 * Math.sin(Math.PI * p);
      }

      if (f > 0) {
        const dtMs = Math.round((f + 1) * 1000 / T.FPS) - Math.round(f * 1000 / T.FPS);
        await appPage.clock.runFor(dtMs);
      }

      const mix = T.layerMixAt(t);
      const shouldCaptureApp = mix.uiAlpha > 0.001 && (mix.mode !== 'crossfade-out' || !liveState.appJpeg);

      if (f < opts.rangeFrom || f > opts.rangeTo) {
        if (shouldCaptureApp) {
          S.lastCamDocRect = T.cameraToClip(S.camera, S.viewport, S.viewport.height).docRect;
        }
        continue;
      }

      if (shouldCaptureApp) {
        const bounds = await docBounds();
        const { scrollY, docRect, clip } = T.cameraToClip(S.camera, S.viewport, bounds.height);
        S.lastCamDocRect = docRect;
        await appPage.evaluate((y) => { if (Math.abs(window.scrollY - y) > 0.5) window.scrollTo(0, y); }, scrollY);
        liveState.appJpeg = await appPage.screenshot({ clip, type: 'jpeg', quality: 92 });
      }

      // 重ね物の計算
      const hls = [];
      if (mix.uiAlpha > 0.001 && mix.mode !== 'crossfade-out') {
        for (const hl of S.highlights) {
          const dt = t - hl.t0;
          if (dt < 0 || dt >= hl.hold) continue;
          let rect = hl.fallbackRect;
          try {
            if (hl.getRect) {
              const nextRect = await hl.getRect();
              if (nextRect) rect = nextRect;
            } else if (hl.loc && await hl.loc.count() > 0 && await hl.loc.boundingBox()) {
              rect = await docRectOf(hl.loc);
            }
          } catch { /* fallback */ }
          const mapped = T.appToStageRect(rect, S.lastCamDocRect);
          if (!mapped) continue;
          const fadeOut = Math.min(0.25, hl.hold * 0.2);
          const alpha = dt < 0.12 ? dt / 0.12 : dt > hl.hold - fadeOut ? T.clamp((hl.hold - dt) / fadeOut) : 1;
          hls.push({ ...mapped, alpha });
        }
      }

      const ripple = S.tapAt != null && t - S.tapAt >= 0 && t - S.tapAt < 0.42
        ? { x: S.tapPos.x, y: S.tapPos.y, p: T.clamp((t - S.tapAt) / 0.42) }
        : null;
      const press = S.tapAt != null && t - S.tapAt >= 0 && t - S.tapAt < 0.12;
      let callout = null;
      if (S.callout && t >= S.callout.t0 && t < S.callout.t0 + S.callout.hold) {
        const dt = t - S.callout.t0;
        const pin = T.easeOut(T.clamp(dt / 0.16));
        const pout = T.clamp((S.callout.hold - dt) / 0.24);
        callout = {
          label: S.callout.label,
          value: S.callout.value,
          sub: S.callout.sub || '',
          rows: S.callout.rows || null,
          alpha: Math.min(pin, pout),
          scale: 0.86 + 0.14 * pin,
        };
      }

      let aiSrc = null;
      if (mix.clip && aiFrames[mix.clip]) {
        const idx = T.clamp(mix.aiFrameIndex + 1, 1, aiFrames[mix.clip].count);
        aiSrc = `/ai/${mix.clip}/${String(idx).padStart(4, '0')}.jpg`;
      }

      await stagePage.evaluate((st) => window.stage.apply(st), {
        t,
        uiAlpha: mix.uiAlpha,
        aiAlpha: mix.aiAlpha,
        scrimAlpha: mix.scrimAlpha,
        aiOnTop: mix.aiOnTop,
        aiClip: mix.clip,
        aiSrc,
        appSrc: liveState.appJpeg ? `/live/app.jpg?f=${f}` : null,
        showFooterNote: mix.uiAlpha > 0.001 && mix.mode !== 'ai-a' && mix.mode !== 'ai-b',
        caption: T.captionAt(t),
        hls,
        ripple,
        finger: S.finger.alpha > 0.01 && mix.uiAlpha > 0.001 ? { x: S.finger.x, y: S.finger.y, alpha: S.finger.alpha, press } : null,
        callout,
        end: T.endCardAt(t),
      });

      await stagePage.screenshot({ path: join(frameDir, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 95 });
      if (f % 60 === 0) console.log(`frame ${f}/${T.TOTAL_FRAMES}  t=${t.toFixed(2)}s  ${Math.round((Date.now() - started) / 1000)}s elapsed`);
    }

    const capturedCount = Math.max(1, opts.rangeTo - opts.rangeFrom + 1);
    report.msPerFrame = Math.round((Date.now() - started) / capturedCount);

    // 実際に操作が起きたコマの時刻を cues.json に書き出す（部分撮影時は絵コンテ時刻で補完）
    const cuesOut = realizedCues.length === T.CUES.length
      ? realizedCues.sort((a, b) => a.at - b.at)
      : T.CUES.map((c) => ({ ...c, at: Math.round((Math.ceil(c.at * T.FPS - 1e-6) / T.FPS) * 1000) / 1000 }));
    writeFileSync(join(opts.outDir, 'cues.json'), JSON.stringify({ cues: cuesOut }, null, 2) + '\n');
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    if (browser) await browser.close().catch(() => {});
    await new Promise((r) => stageSrv.server.close(r));
    await stopChild(meiboSrv.child);
  }

  writeReport();
  console.log(`撮影おわり: ${report.msPerFrame} ms/コマ・警告 ${report.warnings.length}件`);
  for (const w of report.warnings.slice(0, 12)) console.log('  警告:', w);
  if (opts.partial || opts.noEncode) return;
  encode(opts);
}

// ---- 書き出し ----

function encode(opts) {
  const frameDir = join(opts.outDir, 'frames');
  const firstFrame = join(frameDir, '0000.jpg');
  if (!existsSync(firstFrame)) throw new Error(`連番画像が見つかりません: ${firstFrame}`);

  const silent = join(opts.outDir, 'silent.mp4');
  // JPEG 連番は全範囲（yuvj420p）のため scale=in_range=pc:out_range=tv で変換する。
  runTool('ffmpeg', [
    '-y',
    '-framerate', String(T.FPS),
    '-i', join(frameDir, '%04d.jpg'),
    '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p',
    '-color_range', 'tv',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-map_metadata', '-1',
    '-an',
    silent,
  ]);

  runTool('ffmpeg', ['-y', '-i', firstFrame, '-frames:v', '1', join(opts.outDir, 'first-frame.png')]);
  runTool('ffmpeg', [
    '-y', '-i', silent,
    '-vf', 'fps=1,scale=216:-1,tile=10x3',
    '-frames:v', '1', '-q:v', '3',
    join(opts.outDir, 'contact-sheet.jpg'),
  ]);

  for (const v of opts.mux) {
    if (!opts.audioDir) { console.log(`--audio-dir が未指定のため ${v}.mp4 をスキップします`); continue; }
    const wav = join(opts.audioDir, `bgm_${v}.wav`);
    if (!existsSync(wav)) { console.log(`音が見つかりません: ${wav}`); continue; }
    runTool('ffmpeg', [
      '-y', '-i', silent, '-i', wav,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      '-af', `apad=whole_dur=${T.DURATION_SECONDS}`,
      '-t', String(T.DURATION_SECONDS),
      '-movflags', '+faststart', '-map_metadata', '-1',
      join(opts.outDir, `${v}.mp4`),
    ]);
  }

  // 一覧用 demo.mp4（無音・540x960・UI場面のみ・合計16秒前後）
  runTool('ffmpeg', [
    '-y', '-i', silent,
    '-filter_complex', buildDemoFilter(T.DEMO_RANGES),
    '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-r', String(T.FPS), '-movflags', '+faststart', '-map_metadata', '-1', '-an',
    join(opts.outDir, 'demo.mp4'),
  ]);

  const probe = runTool('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration,pix_fmt',
    '-of', 'default=nw=1', silent,
  ]);
  console.log(probe.stdout.trim().replace(/\n/g, '  '));
}

function runSelftest() {
  const res = T.selftestStoryboard();
  if (!res.ok) {
    console.error('SELFTEST FAIL:');
    for (const err of res.errors) console.error('  -', err);
    process.exitCode = 1;
    return;
  }
  console.log(
    `SELFTEST PASS: ${res.totalFrames} frames (${res.durationSeconds}s @ ${T.FPS}fps), `
    + `${res.scenes} scenes, ${res.captions} captions, ${res.cues} cues, demo=${res.demoSeconds}s`,
  );
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.selftest) { runSelftest(); return; }
  if (opts.encodeOnly) { encode(opts); return; }
  await capture(opts);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
