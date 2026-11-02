// OWNER: core
// 中核の道具（撮影・自動プレイ）が共有する部品：引数・ビルド（自分のページだけ）・プレビュー（子プロセス。終わりに必ず止める）・PNG の明るさ。
// ブラウザは tools/lib/browser.mjs・tools/lib/shoot.mjs（共通）を使う。ビルドとプレビューの手順は dragon-rampage の tools/lib/harness.mjs を参考に書いた。
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VITE = path.join(ROOT, 'node_modules', '.bin', 'vite');
/** 中核のビルドの置き場所（他の担当の dist-* とぶつからない）。 */
export const OUT_DIR = 'dist-core';

/** `--key=value` / `--key value` / `--flag` / 位置引数。 */
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

/** 自分のページ（index.html）だけをビルドする。並行して作っている他の担当の作りかけで落ちないように。 */
export function buildCore() {
  const t0 = Date.now();
  const r = spawnSync(VITE, ['build', '--logLevel', 'warn', '--outDir', OUT_DIR], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, KAGE_PAGES: 'index' },
  });
  if (r.status !== 0) throw new Error(`vite build が失敗しました（終了コード ${r.status}）`);
  return Date.now() - t0;
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`プレビューが ${timeoutMs}ms 以内に応答しませんでした: ${last}`);
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
    await waitForHttp(url, 30_000);
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

/** PNG の明るさの統計（sRGB から相対輝度）。真っ黒・白飛びを数で見るため。 */
export async function pngStats(file) {
  const png = PNG.sync.read(await readFile(file));
  const { width, height, data } = png;
  const n = width * height;
  let sum = 0;
  let clipped = 0;
  let crushed = 0;
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    sum += 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    if (r >= 250 && g >= 250 && b >= 250) clipped++;
    if (r <= 6 && g <= 6 && b <= 6) crushed++;
  }
  const round = (x) => Math.round(x * 10000) / 10000;
  return { width, height, meanLum: round(sum / n), clippedRatio: round(clipped / n), crushedRatio: round(crushed / n) };
}
