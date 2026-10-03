// OWNER: dragon
// 怪獣の標本（?specimen=）を撮る：各怪獣を street・closeup・overview で1枚ずつ、3体を並べた1枚（lineup）、
// クリップごとの連番の一覧（横顔で1枚に8コマ）。歩き・走りは 1/30 秒刻みで足の甲の位置を読み、接地している間の滑り（m）を測る。
// ビルド → プレビューを子プロセスで起動 → GPU を使うブラウザ（tools/lib/harness.mjs と同じ）。
//
//   npm run capture:specimens -- r02roster                 既定の一式を .captures/r02roster/specimens/ に
//   --only raiyoku,homuratsuno   怪獣を選ぶ（kurenai も撮れる）
//   --shots street,closeup       構図を選ぶ（profile も可）。--no-lineup・--no-films で省く
//   --films-only                 連番と滑りだけ   --clips walk,run  クリップを選ぶ
//   --no-build でビルドを省く、--port でポート（環境変数 DR_PORT も可）、--q で画質
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ROOT, assertHardwareGpu, buildApp, launchBrowser, parseArgs, portFrom, startPreview } from '../lib/harness.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const VIEWPORT = { width: 1600, height: 900 };
const args = parseArgs(process.argv.slice(2));
const PORT = portFrom(args, 5361);
const round = String(args.round ?? args._[0] ?? 'scratch');
const quality = String(args.q ?? 'high');
const only = args.only ? String(args.only).split(',') : ['raiyoku', 'homuratsuno'];
const shots = args.shots ? String(args.shots).split(',') : ['street', 'closeup', 'overview'];
const clipFilter = args.clips ? String(args.clips).split(',') : null;
const filmsOnly = Boolean(args['films-only']);
const outDir = path.join(ROOT, '.captures', round, 'specimens');

// 構図ごとに見せるクリップ（空を飛べない焔角の overview は歩き）
const SHOT_CLIP = {
  street: { kurenai: 'idle', raiyoku: 'idle', homuratsuno: 'idle' },
  closeup: { kurenai: 'roar', raiyoku: 'roar', homuratsuno: 'roar' },
  overview: { kurenai: 'glide', raiyoku: 'glide', homuratsuno: 'walk' },
  profile: { kurenai: 'idle', raiyoku: 'idle', homuratsuno: 'idle' },
};
const SHEET = { cols: 4, rows: 2, width: 480, height: 270 };

function watchErrors(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function waitReady(page, flag) {
  await page.waitForFunction((f) => window[f] === true || typeof window.__appError === 'string', flag, { timeout: 150000, polling: 250 });
  const appError = await page.evaluate(() => window.__appError ?? null);
  if (appError) throw new Error(`ページの起動に失敗: ${appError}`);
}

async function shot(context, url, id, name, clip) {
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`${url}/?specimen=${id}&clip=${clip}&shot=${name}&q=${quality}`);
  await waitReady(page, '__shotReady');
  const info = await page.evaluate(() => window.__shotInfo);
  assertHardwareGpu(info.gpu);
  const file = path.join(outDir, `${id}-${name}.png`);
  await page.screenshot({ path: file, type: 'png' });
  await page.close();
  console.log(`${id.padEnd(12)} ${name.padEnd(9)} ${clip.padEnd(7)} calls=${info.calls} tris=${info.triangles} ready=${info.readyMs}ms errors=${errors.length}`);
  if (errors.length) console.log(`  最初のエラー: ${errors[0].slice(0, 800)}`);
  return { id, shot: name, clip, file: path.relative(ROOT, file), calls: info.calls, triangles: info.triangles, readyMs: info.readyMs, consoleErrors: errors };
}

/** PNG を w×h に縮める（箱の平均）。 */
function downscale(png, w, h) {
  const out = new PNG({ width: w, height: h });
  const sx = png.width / w;
  const sy = png.height / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const y0 = Math.floor(y * sy);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      const acc = [0, 0, 0];
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * png.width + xx) * 4;
          acc[0] += png.data[i];
          acc[1] += png.data[i + 1];
          acc[2] += png.data[i + 2];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = acc[0] / n;
      out.data[o + 1] = acc[1] / n;
      out.data[o + 2] = acc[2] / n;
      out.data[o + 3] = 255;
    }
  }
  return out;
}

function sheetOf(cells) {
  const { cols, rows, width, height } = SHEET;
  const sheet = new PNG({ width: cols * width, height: rows * height });
  cells.forEach((cell, k) => {
    const ox = (k % cols) * width;
    const oy = Math.floor(k / cols) * height;
    for (let y = 0; y < height; y++) cell.data.copy(sheet.data, ((oy + y) * sheet.width + ox) * 4, y * width * 4, (y + 1) * width * 4);
  });
  return PNG.sync.write(sheet);
}

/** 接地している間の足の滑り（m）：足の甲が足の裏から 8cm 未満の区間ごとに、水平の位置が最初からどれだけ離れたかの最大。 */
function footSlide(samples) {
  const byFoot = new Map();
  for (const s of samples) for (const f of s.feet) {
    if (!byFoot.has(f.name)) byFoot.set(f.name, []);
    byFoot.get(f.name).push(f);
  }
  let worst = 0;
  const perFoot = {};
  const plantedFrames = {};
  for (const [name, list] of byFoot) {
    let start = null;
    let max = 0;
    let planted = 0;
    for (const f of list) {
      if (f.y - f.sole >= 0.08) {
        start = null;
        continue;
      }
      planted++;
      if (!start) start = f;
      max = Math.max(max, Math.hypot(f.x - start.x, f.z - start.z));
    }
    perFoot[name] = Math.round(max * 1000) / 1000;
    plantedFrames[name] = planted;
    worst = Math.max(worst, max);
  }
  return { maxSlide: Math.round(worst * 1000) / 1000, perFoot, plantedFrames, frames: samples.length };
}

async function films(context, url, id) {
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`${url}/?specimen=${id}&clip=idle&film=profile&frames=1&drive=ext&q=${quality}`);
  await waitReady(page, '__filmReady');
  const report = JSON.parse(await readFile(path.join(ROOT, 'tools', 'blender', id === 'kurenai' ? 'dragon-report.json' : `${id}-report.json`), 'utf8'));
  const names = Object.keys(report.clips).filter((c) => !clipFilter || clipFilter.includes(c));
  const results = [];
  await mkdir(path.join(outDir, 'films'), { recursive: true });
  for (const clip of names) {
    const c = report.clips[clip];
    const cells = [];
    const n = SHEET.cols * SHEET.rows;
    for (let k = 0; k < n; k++) {
      const t = c.loop ? (c.duration * k) / n : (c.duration * k) / (n - 1);
      await page.evaluate(([cl, tt]) => window.__specimenShow(cl, tt), [clip, t]);
      const buf = await page.screenshot({ type: 'png' });
      cells.push(downscale(PNG.sync.read(buf), SHEET.width, SHEET.height));
    }
    const file = path.join(outDir, 'films', `${id}-${clip}.png`);
    await writeFile(file, sheetOf(cells));
    const entry = { clip, duration: c.duration, sheet: path.relative(ROOT, file) };
    if (c.stride) {
      // 2周ぶんを 1/30 秒刻みで：足の甲の位置（前へ 歩幅÷周期 で進めているので、接地中は動かないはず）
      const samples = [];
      for (let t = 0; t <= c.duration * 2 + 1e-6; t += 1 / 30) samples.push(await page.evaluate(([cl, tt]) => window.__specimenShow(cl, tt), [clip, t]).then((i) => i.specimens[0]));
      Object.assign(entry, { stride: c.stride }, footSlide(samples));
    }
    results.push(entry);
    const slide = entry.maxSlide !== undefined ? `  接地中の滑り 最大 ${entry.maxSlide}m（接地のコマ ${Object.values(entry.plantedFrames).join('・')} / ${entry.frames}）` : '';
    console.log(`${id.padEnd(12)} film ${clip.padEnd(8)} ${c.duration}s${slide}`);
  }
  await page.close();
  if (errors.length) console.log(`  最初のエラー: ${errors[0].slice(0, 800)}`);
  return { id, clips: results, consoleErrors: errors };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const buildMs = args['no-build'] ? 0 : buildApp();
  const server = await startPreview(PORT);
  const browser = await launchBrowser();
  const summary = { round, quality, date: new Date().toISOString(), viewport: VIEWPORT, buildMs, shots: [], films: [] };
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    if (!filmsOnly) {
      for (const id of only) for (const name of shots) summary.shots.push(await shot(context, server.url, id, name, args.clip ? String(args.clip) : SHOT_CLIP[name][id]));
      if (!args['no-lineup']) summary.shots.push(await shot(context, server.url, 'lineup', 'profile', 'idle'));
    }
    if (!args['no-films']) for (const id of only) summary.films.push(await films(context, server.url, id));
    await writeFile(path.join(outDir, 'specimens.json'), JSON.stringify(summary, null, 2));
    console.log(`保存先: ${path.relative(ROOT, outDir)}/（specimens.json と PNG）`);
    const errors = [...summary.shots, ...summary.films].reduce((n, r) => n + r.consoleErrors.length, 0);
    if (errors > 0) {
      console.error(`コンソールにエラーが ${errors} 件ありました`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
