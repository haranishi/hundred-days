// OWNER: tools
// 撮影・計測の道具が共有する部品：ビルド、プレビューの起動（子プロセス、終了時に必ず止める）、
// GPU を使うブラウザ（Chromium か WebKit。どちらにするかは tools/lib/browser.mjs が決める）、PNG の明るさの統計。
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { launchArgs, resolveBrowser } from './browser.mjs';

export { GPU_ARGS, UNCAPPED_ARGS } from './browser.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VITE = path.join(ROOT, 'node_modules', '.bin', 'vite');

// r01-city：並行する担当どうしでビルドの置き場所とポートがぶつからないよう、環境変数で変えられるようにした。
// DR_OUT_DIR（既定 dist）＝ビルドの出力先、DR_PORT（既定は各道具の番号）＝プレビューのポート。--port でも指定できる
export const OUT_DIR = process.env.DR_OUT_DIR ?? '../game';

/** 道具ごとの既定のポートを、--port か環境変数 DR_PORT で上書きする。 */
export function portFrom(args, fallback) {
  const raw = args.port ?? process.env.DR_PORT;
  const port = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`ポートの指定が数ではない: ${raw}`);
  return port;
}

/** `--key=value` / `--key value` / `--flag` / 位置引数を読む。 */
export function parseArgs(argv) {
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

export function buildApp() {
  const t0 = Date.now();
  const r = spawnSync(VITE, ['build', '--logLevel', 'warn', '--outDir', OUT_DIR], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`vite build が失敗しました（終了コード ${r.status}）`);
  return Date.now() - t0;
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`プレビューが ${timeoutMs}ms 以内に応答しませんでした: ${lastError}`);
}

/** vite preview を子プロセスで起動する。stop() か、このプロセスの終了で必ず止める。 */
export async function startPreview(port) {
  const child = spawn(VITE, ['preview', '--outDir', OUT_DIR, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const kill = () => {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
  };
  process.on('exit', kill);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, () => {
      kill();
      process.exit(130);
    });
  }
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(url, 30000);
  } catch (e) {
    kill();
    throw new Error(`${e.message}\n--- preview の出力 ---\n${output}`);
  }
  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        kill();
        setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGKILL');
        }, 3000);
      }),
  };
}

let choice = null;
/** 使うブラウザ（{ name, reason }）。DR_BROWSER と画面のロックから、このプロセスで1回だけ決める。 */
export function browserChoice() {
  choice ??= resolveBrowser();
  return choice;
}

/**
 * GPU を使うブラウザを起動する。uncapped は垂直同期を外してフレームの実コストを測る（計測用）、
 * autoplay は操作なしでも音を出す。どちらも Chromium の起動引数で、WebKit には渡さない
 * （WebKit は垂直同期を外せず、音は操作なしで出る）。
 */
export async function launchBrowser({ uncapped = false, autoplay = false } = {}) {
  const { name, reason } = browserChoice();
  console.log(`ブラウザ: ${name}（${reason}）${name === 'webkit' && uncapped ? '。WebKit は垂直同期を外せないので、コマは画面の更新に合わせて出る' : ''}`);
  return (name === 'webkit' ? webkit : chromium).launch({ args: launchArgs(name, { uncapped, autoplay }), headless: true });
}

/** ソフトウェア描画の名前（Chromium の SwiftShader・Mesa の llvmpipe・Apple Software Renderer など）。 */
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software/i;
/** mac の WebKit が返す GPU の名前。指紋対策で、実機の GPU（M4 Pro など）でもこの名前に丸める。 */
const WEBKIT_GPU = 'Apple GPU';

/**
 * ページの WebGL がソフトウェア描画に落ちていないかを確かめる。名前が取れない（'unknown'・空）ときも失敗にする。
 * Chromium は ANGLE の実名を返す（例 "ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)"）。
 * WebKit は名前を "Apple GPU" に丸めるので、名前では実機の型は分からない。mac の WebKit の WebGL は
 * ANGLE の Metal で描き、ソフトウェアの描き手を持たない（WebGPU でも、ソフトウェアの装置を求めると null が返る）。
 * それで WebKit は「丸めた名前そのもの」を実機とみなし、それ以外の名前が来たら想定外として止める。
 */
export function assertHardwareGpu(gpu, browser = browserChoice().name) {
  const name = String(gpu ?? '').trim();
  if (!name || name === 'unknown') throw new Error(`GPU の名前が取れません（${browser}）: ${gpu}`);
  if (SOFTWARE_GPU.test(name)) throw new Error(`GPU ではなくソフトウェア描画になっています（${browser}）: ${name}`);
  if (browser === 'webkit' && name !== WEBKIT_GPU) throw new Error(`WebKit の GPU の名前が想定（${WEBKIT_GPU}）と違います: ${name}`);
}

/** PNG の明るさの統計（sRGB の値から相対輝度）。露出と白飛びを数値で比べるため。 */
export async function pngStats(file) {
  const png = PNG.sync.read(await readFile(file));
  const { width, height, data } = png;
  const n = width * height;
  const lum = new Float32Array(n);
  let clipped = 0;
  let crushed = 0;
  let sum = 0;
  const toLinear = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const y = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    lum[i] = y;
    sum += y;
    if (r >= 250 || g >= 250 || b >= 250) clipped++;
    if (r <= 6 && g <= 6 && b <= 6) crushed++;
  }
  const sorted = Array.from(lum).sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(n - 1, Math.floor((p / 100) * n))];
  const round = (x) => Math.round(x * 10000) / 10000;
  return {
    width,
    height,
    meanLum: round(sum / n),
    p5: round(pct(5)),
    p50: round(pct(50)),
    p95: round(pct(95)),
    p99: round(pct(99)),
    clippedRatio: round(clipped / n),
    crushedRatio: round(crushed / n),
  };
}
