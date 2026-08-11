// apps/day-NNN-*/demo.mp4（720×1280・縦型）と screenshot.webp（1200×750）を作る。
//
// このリポジトリは依存パッケージゼロを保つため、Playwright は依存に入れない。
// 別プロジェクトの Playwright を借りて実行する：
//
//   PLAYWRIGHT=/path/to/playwright/index.js node scripts/record-demo.mjs --day 4
//
// 各Dayの操作の振り付けは apps/day-NNN-*/demo-scenario.mjs に置く。
//   export default async function (page, h) { ... }
//   h.pause(ms) / h.slide(sel, from, to, stepMs) / h.scrollTo(sel)
//
// webm → mp4 の変換に ffmpeg を使う。生成後は必ず動画とスクショを目視すること
// （CLAUDE.md 公開前チェック②）。

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- 引数

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const day = Number(argOf('--day'));
if (!Number.isInteger(day) || day < 1) {
  console.error('使い方: node scripts/record-demo.mjs --day 4 [--video-only] [--shot-only]');
  process.exit(1);
}

const videoOnly = args.includes('--video-only');
const shotOnly = args.includes('--shot-only');

const padded = String(day).padStart(3, '0');
const dir = readdirSync(join(root, 'apps')).find((d) => d.startsWith(`day-${padded}-`));
if (!dir) {
  console.error(`apps/day-${padded}-* が見つかりません`);
  process.exit(1);
}

const appDir = join(root, 'apps', dir);
const indexUrl = pathToFileURL(join(appDir, 'index.html')).href;
const scenarioPath = join(appDir, 'demo-scenario.mjs');

// ---------------------------------------------------------------- Playwright

const spec = process.env.PLAYWRIGHT || 'playwright';
const target = spec.startsWith('.') || spec.startsWith('/')
  ? pathToFileURL(resolve(spec.replace(/^~/, process.env.HOME))).href
  : spec;

let chromium;
try {
  const mod = await import(target);
  chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('chromium が見つかりません');
} catch (e) {
  console.error(e.message);
  console.error(`Playwright を読み込めませんでした（${spec}）。`);
  console.error('例: PLAYWRIGHT=/path/to/playwright/index.js node scripts/record-demo.mjs --day 4');
  process.exit(1);
}

const has = (cmd) => {
  try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; }
};

// ---------------------------------------------------------------- 動画

const VIDEO = { width: 720, height: 1280 }; // 最終出力（ffmpegで拡大）
const VIEW = { width: 540, height: 960 }; // 録画時のビューポート。9:16

// ⚠️ recordVideo.size は必ず VIEW と一致させる。
// Playwrightはページ映像を**拡大しない**。録画サイズの方が大きいと、原寸のまま左上に置いて
// 余白を #808080 のグレーで埋める（アスペクト比が同じでも起きる）。
// 実際にDay004で右180px・下320pxがグレーになった。720×1280への拡大はffmpeg側で行う。
const RECORD = VIEW;

/** 動画の指定位置の平均色を取る。グレー余白の混入を機械的に検出するために使う。 */
function sampleColor(file, x, y, seconds = 2) {
  const buf = execFileSync('ffmpeg', [
    '-v', 'error', '-ss', String(seconds), '-i', file, '-frames:v', '1',
    '-vf', `crop=40:40:${x}:${y},scale=1:1`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'
  ], { maxBuffer: 1 << 20 });
  return [...buf.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** 右端・下端・右下がPlaywrightの余白色になっていないか検査する。 */
function assertNoPadding(file) {
  const points = [
    ['右端', VIDEO.width - 60, Math.round(VIDEO.height * 0.3)],
    ['下端', Math.round(VIDEO.width * 0.5), VIDEO.height - 60],
    ['右下', VIDEO.width - 60, VIDEO.height - 60]
  ];
  const bad = points
    .map(([name, x, y]) => [name, sampleColor(file, x, y)])
    .filter(([, hex]) => hex === '808080');

  if (bad.length) {
    console.error(`✖ 余白のグレー(#808080)が混入しています: ${bad.map(([n]) => n).join('・')}`);
    console.error('  recordVideo.size とビューポートが一致しているか確認すること。');
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function recordVideo() {
  if (!existsSync(scenarioPath)) {
    console.error(`振り付けがありません: ${scenarioPath}`);
    console.error('export default async function (page, h) { ... } を書いてください。');
    process.exit(1);
  }
  if (!has('ffmpeg')) {
    console.error('ffmpeg が見つかりません。webm から mp4 に変換できないため中止します。');
    process.exit(1);
  }

  const scenario = (await import(pathToFileURL(scenarioPath).href)).default;
  const work = mkdtempSync(join(tmpdir(), 'day-demo-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    locale: 'ja-JP',
    reducedMotion: 'no-preference',
    recordVideo: { dir: work, size: RECORD }
  });
  const page = await context.newPage();
  await page.goto(indexUrl, { waitUntil: 'load' });

  const h = {
    pause: (ms) => page.waitForTimeout(ms),
    /** range入力をfromからtoまで1段ずつ動かして、値が変わる様子を見せる */
    slide: async (selector, from, to, stepMs = 380) => {
      const dir = to >= from ? 1 : -1;
      for (let v = from; dir > 0 ? v <= to : v >= to; v += dir) {
        await page.evaluate(([sel, val]) => {
          const el = document.querySelector(sel);
          el.value = String(val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }, [selector, v]);
        await page.waitForTimeout(stepMs);
      }
    },
    scrollTo: async (selector, ms = 700) => {
      await page.evaluate((sel) => {
        document.querySelector(sel).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, selector);
      await page.waitForTimeout(ms);
    },
    scrollTop: async (ms = 600) => {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(ms);
    }
  };

  await scenario(page, h);
  await context.close();
  await browser.close();

  const webm = readdirSync(work).find((f) => f.endsWith('.webm'));
  if (!webm) {
    console.error('録画ファイルが作られませんでした');
    process.exit(1);
  }

  const out = join(appDir, 'demo.mp4');
  execFileSync('ffmpeg', [
    '-y', '-i', join(work, webm),
    '-an',                                   // 音声なし
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
    '-pix_fmt', 'yuv420p', '-r', '25',
    '-movflags', '+faststart',
    '-vf', `scale=${VIDEO.width}:${VIDEO.height}:flags=lanczos`,
    out
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  rmSync(work, { recursive: true, force: true });
  assertNoPadding(out);
  return out;
}

// ---------------------------------------------------------------- スクショ

async function shoot() {
  // 何を写すかはDayごとに違うので、振り付けファイルから任意で調整できるようにする。
  //   export const shotScroll = 200;                     … 縦スクロール量(px)
  //   export async function shotSetup(page) { ... }      … 撮る前の操作
  let shotScroll = 0;
  let shotSetup = null;
  if (existsSync(scenarioPath)) {
    const mod = await import(pathToFileURL(scenarioPath).href);
    shotScroll = Number(mod.shotScroll) || 0;
    shotSetup = typeof mod.shotSetup === 'function' ? mod.shotSetup : null;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1, locale: 'ja-JP' });
  await page.goto(indexUrl, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  if (shotSetup) await shotSetup(page);
  if (shotScroll) {
    await page.evaluate((y) => window.scrollTo(0, y), shotScroll);
    await page.waitForTimeout(200);
  }

  const png = join(appDir, '.shot.png');
  await page.screenshot({ path: png, type: 'png' });
  await browser.close();

  const out = join(appDir, 'screenshot.webp');
  if (has('cwebp')) {
    execFileSync('cwebp', ['-q', '82', '-metadata', 'none', png, '-o', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  } else if (has('ffmpeg')) {
    execFileSync('ffmpeg', ['-y', '-i', png, '-map_metadata', '-1', '-q:v', '72', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  } else {
    console.error('cwebp も ffmpeg も無いのでWebPに変換できません。PNGを残します:', png);
    return png;
  }
  rmSync(png, { force: true });
  return out;
}

// ---------------------------------------------------------------- 実行

const made = [];
if (!shotOnly) made.push(await recordVideo());
if (!videoOnly) made.push(await shoot());

for (const f of made) console.log('作成:', f.replace(root + '/', ''));
console.log('必ず動画とスクショを目視してから公開すること。');
