// OWNER: world-art
// 世界の見た目の固定構図を撮る。art.html だけをビルド（dist-art）→ プレビュー（5406）→ GPU のブラウザで全構図を
// 1280×720 で撮り、.captures/<周の名前>/art-<構図>.png と shots.json（描画命令数・三角形数・明るさの統計）を書く。
//
//   npm run capture:art -- r01a                  全構図を撮る
//   npm run capture:art -- r01a --shots garden   一部だけ
//   npm run capture:art -- r01a --perf           撮影の後に性能も測る（courtyard と garden、垂直同期を外して 300 コマ）
//   --perf-only で性能だけ。--no-build でビルドを省く。--dev で起動中の dev サーバー（5405）を使う。--port でプレビューのポート
//   --query "hide=wood&see=0" で確認ページの引数を足す（切り分け用。ファイル名に -q を付ける。--tag でファイル名の印を変える）
//   --perf-shots title,fire で性能を測る構図を変える
//   --extra で、確かめの構図（発見の赤み・炎上の段・池の低い角度と真上・鐘楼の透かし・明智勢の見え方・竹の揺れ）も撮る。
//   --extra-only でそれだけ。--extras a,b で一部だけ。--serve <フォルダ> で、ビルドせずにそのフォルダを配って撮る（前の版との見比べ。r02-fix-visual 追加）
//   --append "tex=0" で、全部の構図（確かめの構図も）の引数に足す（写真の質感の有無の見比べ。r08-world 追加）
// 明るさの統計（pngStats）は、本人の dragon-rampage（tools/lib/harness.mjs）から写した。
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
const ALL_SHOTS = ['title', 'start', 'gate', 'courtyard', 'bamboo', 'garden', 'nobunaga', 'fire'];
const PERF_SHOTS_DEFAULT = ['courtyard', 'garden'];
/**
 * 確かめの構図（r02-fix-visual）。shot は元の構図、query は確認ページの引数。diff は「同じ構図の別の時刻」との画素の差を測る相手。
 * 名前の意味：alert0/alert＝発見の赤みの無し/有り（中央の明るさの比を見る）、fire-*＝炎上の段（白飛び）、pond-*＝池、
 * see-shoro＝鐘楼の外から居眠り番を見る（透かし）、army-*＝遊ぶ角度で塀の外の明智勢、bamboo-t2＝竹の揺れ（bamboo との差）
 */
const EXTRA_SHOTS = [
  { name: 'courtyard-alert0', shot: 'courtyard', query: 'alert=0' },
  { name: 'courtyard-alert', shot: 'courtyard', query: 'alert=0.8' },
  { name: 'start-alert', shot: 'start', query: 'alert=0.8' },
  { name: 'fire-0.15', shot: 'fire', query: 'fire=0.15' },
  { name: 'fire-0.4', shot: 'fire', query: 'fire=0.4' },
  { name: 'fire-1.0', shot: 'fire', query: 'fire=1' },
  { name: 'fire-finale', shot: 'fire', query: 'fire=0.8&finale=1' },
  { name: 'fire-t2', shot: 'fire', query: 't=20.35', diff: 'fire' },
  { name: 'pond-low', shot: 'nobunaga', query: 'tx=-6.5&ty=0.2&tz=-18.6&yaw=275&pitch=14&dist=5.5&see=0' },
  { name: 'pond-top', shot: 'garden', query: 'tx=-6.5&ty=0&tz=-18.6&yaw=270&pitch=78&dist=11&see=0' },
  { name: 'see-shoro', shot: 'courtyard', query: 'tx=-23.8&ty=0.9&tz=19.4&yaw=300&pitch=62&dist=11&player=-23.8,19&others=-23,19' },
  { name: 'see-shoro-off', shot: 'courtyard', query: 'tx=-23.8&ty=0.9&tz=19.4&yaw=300&pitch=62&dist=11&player=-23.8,19&see=0' },
  { name: 'see-pine', shot: 'courtyard', query: 'tx=-12.2&ty=0.9&tz=21&yaw=290&pitch=36&dist=10&player=-12.2,21' },
  { name: 'army-south', shot: 'courtyard', query: 'tx=-8&ty=1&tz=35&yaw=90&pitch=25&dist=11&player=-8,35' },
  { name: 'army-west', shot: 'courtyard', query: 'tx=-30&ty=1&tz=35&yaw=180&pitch=25&dist=11&player=-30,35' },
  { name: 'army-lane', shot: 'courtyard', query: 'tx=-40&ty=1&tz=10&yaw=110&pitch=30&dist=11&player=-40,10' },
  { name: 'bamboo-t2', shot: 'bamboo', query: 't=11.2', diff: 'bamboo' },
  // r03-fix-visual：足元の明るい円（本堂の北で南東から・南の通りで南から）、手前の炎、水抜き穴、通りの轍、低い角度の空と明智勢
  { name: 'see-hondo', shot: 'courtyard', query: 'tx=-6&ty=0.9&tz=-9&yaw=225&pitch=48&dist=11&player=-6,-9' },
  { name: 'see-hondo-ne', shot: 'courtyard', query: 'tx=-6&ty=0.9&tz=-9&yaw=135&pitch=48&dist=11&player=-6,-9' },
  { name: 'see-street', shot: 'courtyard', query: 'tx=-8&ty=0.9&tz=35&yaw=270&pitch=48&dist=11&player=-8,35' },
  { name: 'fire-near', shot: 'fire', query: 'fire=0.8&dist=24' },
  { name: 'drain-east', shot: 'courtyard', query: 'tx=41&ty=0.9&tz=-27.1&yaw=180&pitch=48&dist=11&player=41,-27.1' },
  { name: 'street-west', shot: 'courtyard', query: 'tx=-20&ty=0.9&tz=35&yaw=180&pitch=48&dist=11&player=-20,35' },
  { name: 'vista-westend', shot: 'courtyard', query: 'tx=-40&ty=0.9&tz=35&yaw=180&pitch=48&dist=11&player=-40,35' },
  // タイトルの構図の変更依頼の案（南から北北東：手前に通りの先の明智勢、中ほどに寺、上の 3 割に空・星・東山）
  { name: 'title-low', shot: 'title', query: 'tx=0&ty=6&tz=-4&yaw=290&pitch=8&dist=95' },
  // r08-world：写真の質感の寄り（灯りの近く）。土塀と切石の根石＝表門の篝火の西、板塀＝中門の西の灯籠のそば、板戸と漆喰＝庫裏の窓の灯り、
  // 切石の基壇・縁側の床＝本堂の前の篝火のそば、自然石＝中門の西の灯籠。--append "tex=0" と同じ構図で見比べる。
  // 寄りのカメラが建物の箱（外形＋2m）に入って壁が抜けないよう、透かしと建物の箱の網点を切る（see=0・inside=0）
  { name: 'tex-dobei', shot: 'gate', query: 'tx=-5.6&ty=1.0&tz=29.6&yaw=75&pitch=6&dist=3&see=0&inside=0' },
  { name: 'tex-board', shot: 'gate', query: 'tx=-4.3&ty=1.0&tz=-11.9&yaw=285&pitch=5&dist=2.6&see=0&inside=0' },
  { name: 'tex-door', shot: 'gate', query: 'tx=18.27&ty=1.3&tz=6.9&yaw=12&pitch=4&dist=2.8&see=0&inside=0' },
  { name: 'tex-plaster', shot: 'gate', query: 'tx=18.27&ty=2.2&tz=8&yaw=345&pitch=8&dist=2.8&see=0&inside=0' },
  { name: 'tex-stone', shot: 'gate', query: 'tx=-7&ty=0.35&tz=9&yaw=290&pitch=12&dist=2.4&see=0&inside=0' },
  { name: 'tex-floor', shot: 'gate', query: 'tx=-6.5&ty=1.35&tz=8&yaw=285&pitch=40&dist=2.8&see=0&inside=0' },
  { name: 'tex-rock', shot: 'gate', query: 'tx=-2.8&ty=0.45&tz=-10.4&yaw=260&pitch=15&dist=1.7&see=0&inside=0' },
];
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
const round = String(args.round ?? args._[0] ?? 'scratch');
const shots = args.shots ? String(args.shots).split(',') : ALL_SHOTS;
const PERF_SHOTS = args['perf-shots'] ? String(args['perf-shots']).split(',') : PERF_SHOTS_DEFAULT;
const outDir = path.join(ROOT, '.captures', round);
const PORT = Number(args.port ?? 5406);

function build() {
  const t0 = Date.now();
  const r = spawnSync(VITE, ['build', '--logLevel', 'warn', '--outDir', 'dist-art', '--emptyOutDir'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, KAGE_PAGES: 'art', VITE_CACHE_DIR: 'node_modules/.vite-art' },
  });
  if (r.status !== 0) throw new Error(`vite build が失敗（終了コード ${r.status}）`);
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
  throw new Error(`プレビューが応答しない: ${last}`);
}

/** vite preview を子プロセスで起動する。stop() か、このプロセスの終了で必ず止める。 */
async function startPreview(port) {
  const child = spawn(VITE, ['preview', '--outDir', String(args.serve ?? 'dist-art'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
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
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${url}/art.html`, 30000);
  } catch (e) {
    kill();
    throw new Error(`${e.message}\n${output}`);
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

/** PNG の明るさの統計（sRGB の値から相対輝度）。 */
async function pngStats(file) {
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
  const r4 = (x) => Math.round(x * 10000) / 10000;
  // r02-fix-visual: 中央（縦横の中ほど 40%）の明るさと、縁（外側 12%）の赤み（R−G の平均、0..255）
  let cSum = 0;
  let cN = 0;
  let red = 0;
  let eN = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;
      const i = y * width + x;
      if (u > 0.3 && u < 0.7 && v > 0.3 && v < 0.7) {
        cSum += lum[i];
        cN++;
      } else if (u < 0.12 || u > 0.88 || v < 0.12 || v > 0.88) {
        red += data[i * 4] - data[i * 4 + 1];
        eN++;
      }
    }
  }
  return {
    meanLum: r4(sum / n),
    p5: r4(pct(5)),
    p50: r4(pct(50)),
    p95: r4(pct(95)),
    p99: r4(pct(99)),
    clippedRatio: r4(clipped / n),
    crushedRatio: r4(crushed / n),
    centerLum: r4(cSum / Math.max(1, cN)),
    edgeRed: Math.round((red / Math.max(1, eN)) * 10) / 10,
  };
}

/** 2枚の画素の差（sRGB の 0..255 の平均の絶対差と、差が 6 を超える画素の割合）。 */
async function pngDiff(fileA, fileB) {
  const a = PNG.sync.read(await readFile(fileA));
  const b = PNG.sync.read(await readFile(fileB));
  if (a.width !== b.width || a.height !== b.height) return null;
  let sum = 0;
  let moved = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const d = (Math.abs(a.data[i * 4] - b.data[i * 4]) + Math.abs(a.data[i * 4 + 1] - b.data[i * 4 + 1]) + Math.abs(a.data[i * 4 + 2] - b.data[i * 4 + 2])) / 3;
    sum += d;
    if (d > 6) moved++;
  }
  return { meanAbs: Math.round((sum / n) * 100) / 100, movedRatio: Math.round((moved / n) * 10000) / 10000 };
}

async function captureShots(url) {
  const { browser, name, reason } = await openBrowser();
  console.log(`ブラウザ: ${name}（${reason}）`);
  const results = [];
  const wantExtra = args.extra || args['extra-only'] || args.extras;
  const extraNames = args.extras ? String(args.extras).split(',') : null;
  const jobs = [
    ...(args['extra-only'] ? [] : shots.map((s) => ({ name: s, shot: s, query: args.query ?? '', tag: args.query ? `-${args.tag ?? 'q'}` : '' }))),
    ...(wantExtra ? EXTRA_SHOTS.filter((e) => !extraNames || extraNames.includes(e.name)).map((e) => ({ ...e, extra: true, tag: '' })) : []),
  ];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (const job of jobs) {
      const page = await context.newPage();
      const file = path.join(outDir, `art-${job.name}${job.tag}.png`);
      const t0 = Date.now();
      let errors = [];
      try {
        ({ errors } = await shoot(page, `${url}/art.html?shot=${job.shot}${job.query ? `&${job.query}` : ''}${args.append ? `&${args.append}` : ''}`, file, { timeout: 120_000 }));
      } catch (e) {
        const appError = await page.evaluate(() => window.__artError ?? null).catch(() => null);
        throw new Error(`${job.name} の撮影に失敗: ${appError ?? e.message}`);
      }
      const gpu = await assertGpu(page);
      const info = await page.evaluate(() => window.__shotInfo ?? null);
      const stats = await pngStats(file);
      const diff = job.diff ? await pngDiff(file, path.join(outDir, `art-${job.diff}.png`)).catch(() => null) : null;
      results.push({ shot: job.name, query: job.query || undefined, append: args.append || undefined, file: path.relative(ROOT, file), ...info, gpu, wallMs: Date.now() - t0, stats, diff, errors });
      if (info?.check) console.log(`  シェーダーの数: 前 ${info.check.programsBefore} → 後 ${info.check.programsAfter}`);
      console.log(
        `${job.name.padEnd(16)} calls=${String(info?.calls).padStart(4)} tris=${String(info?.triangles).padStart(8)} warm=${info?.warmMs}ms mean=${stats.meanLum} center=${stats.centerLum} edgeRed=${stats.edgeRed} p95=${stats.p95} clip=${stats.clippedRatio} crush=${stats.crushedRatio}${diff ? ` diff(${job.diff})=${diff.meanAbs}/${diff.movedRatio}` : ''} errors=${errors.length}`,
      );
      if (errors.length) console.log(`  最初のエラー: ${errors[0].slice(0, 1500)}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

async function measurePerf(url) {
  const { browser, name } = await openBrowser({ uncapped: true });
  const out = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (const shot of PERF_SHOTS) {
      const page = await context.newPage();
      await page.goto(`${url}/art.html?perf=1&shot=${shot}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__shotReady === true || typeof window.__artError === 'string', null, { timeout: 180_000, polling: 250 });
      const res = await page.evaluate(() => window.__perfResult ?? { error: window.__artError });
      out.push({ browser: name, ...res });
      console.log(`perf ${shot.padEnd(10)} p50=${res.p50}ms p95=${res.p95}ms cpuP50=${res.cpuP50}ms calls=${res.calls} tris=${res.triangles} ${res.width}x${res.height}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const buildMs = args.dev || args.serve || args['no-build'] ? 0 : build();
  const server = args.dev ? { url: 'http://127.0.0.1:5405', stop: async () => {} } : await startPreview(PORT);
  try {
    const results = args['perf-only'] ? [] : await captureShots(server.url);
    const perf = args.perf || args['perf-only'] ? await measurePerf(server.url) : null;
    const summaryFile = path.join(outDir, args['perf-only'] ? 'perf.json' : 'shots.json');
    await writeFile(summaryFile, JSON.stringify({ round, date: new Date().toISOString(), viewport: VIEWPORT, buildMs, shots: results, perf }, null, 2));
    console.log(`保存先: ${path.relative(ROOT, outDir)}/`);
    if (results.some((r) => r.errors.length > 0)) process.exitCode = 1;
  } finally {
    await server.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
