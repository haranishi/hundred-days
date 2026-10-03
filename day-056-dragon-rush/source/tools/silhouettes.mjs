// OWNER: tools
// 怪獣の札の影絵を作る（r03-roster、docs/CHARACTERS.md の UX5「影絵は実際のモデルを撮った画像を使う」）。
// 標本を影絵の構図（?specimen=<名前>&clip=card&shot=profile&matte=1：怪獣だけを白く、ほかは黒）で撮り、
// 明るさを型抜きの濃さ（アルファ）に直して、怪獣の外形で切り抜いた PNG を public/assets/ui/card-<名前>.png に書く。
// 札（src/ui/cards.ts）は CSS の mask にこの画像を使い、色は CSS で付ける（選んでいる札だけ明るく）。
// r04-roster2：姿勢は怪獣の設定の card（src/config/creatures/。clip=card は標本がそれを読む）。紅竜と雷翼は休みの姿勢の横顔、
// 焔角は咆哮で頭を上げた瞬間を斜め前 35° から（横顔では背の輪郭がこぶの列になり、札の大きさで「とげのある甲羅の四足」に読めた）。
//   node tools/silhouettes.mjs                      ビルドして3体を撮る（DR_OUT_DIR・--port・--no-build が効く）
//   --preview FILE                                  3枚を札の大きさ（148×56 の2倍）で黒地に並べた確認用の PNG も書く
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ROOT, assertHardwareGpu, buildApp, launchBrowser, parseArgs, portFrom, startPreview } from './lib/harness.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const args = parseArgs(process.argv.slice(2));
const IDS = ['kurenai', 'raiyoku', 'homuratsuno'];
const OUT = path.join(ROOT, 'public', 'assets', 'ui');
/** 書き出す大きさ（札の絵の枠 148×56 の2倍前後） */
const W = 360;
const H = 140;

/** 撮った絵（黒の上に白い怪獣）の明るさ → 型抜きの濃さ。背景のわずかな持ち上がりを捨て、縁は滑らかに残す。 */
function alphaOf(png) {
  const { width, height, data } = png;
  const a = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const lum = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) / 255;
    a[i] = Math.min(1, Math.max(0, (lum - 0.08) / 0.35));
  }
  return a;
}

/** 濃さが 0.15 を超える画素を囲む矩形。 */
function bounds(a, width, height) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (a[y * width + x] < 0.15) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) throw new Error('影絵に怪獣が写っていない');
  return { x0, y0, x1, y1 };
}

/** 矩形を W×H に収まるよう縮め（縦横の比は保ち、真ん中に置く）、画素の面積の平均で濃さを取る。 */
function fit(a, width, box) {
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const scale = Math.min((W * 0.96) / bw, (H * 0.94) / bh);
  const ow = bw * scale;
  const oh = bh * scale;
  const ox = (W - ow) / 2;
  const oy = (H - oh) / 2;
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 出力の画素が覆う元の矩形を、4×4 の点で平均する
      let sum = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const u = (x + (sx + 0.5) / 4 - ox) / scale + box.x0;
          const v = (y + (sy + 0.5) / 4 - oy) / scale + box.y0;
          const iu = Math.floor(u);
          const iv = Math.floor(v);
          if (iu < box.x0 || iu > box.x1 || iv < box.y0 || iv > box.y1) continue;
          sum += a[iv * width + iu];
        }
      }
      const o = (y * W + x) * 4;
      out.data[o] = 255;
      out.data[o + 1] = 255;
      out.data[o + 2] = 255;
      out.data[o + 3] = Math.round((sum / 16) * 255);
    }
  }
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  if (!args['no-build']) buildApp();
  const server = await startPreview(portFrom(args, 5323));
  const browser = await launchBrowser();
  const results = [];
  const cards = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    for (const id of IDS) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`${server.url}/?specimen=${id}&clip=card&shot=profile&matte=1&q=high`);
      await page.waitForFunction(() => window.__shotReady === true || typeof window.__appError === 'string', null, { timeout: 150000, polling: 250 });
      const appError = await page.evaluate(() => window.__appError ?? null);
      if (appError) throw new Error(`${id}: ${appError}`);
      assertHardwareGpu(await page.evaluate(() => window.__shotInfo.gpu));
      const png = PNG.sync.read(await page.screenshot({ type: 'png' }));
      const a = alphaOf(png);
      const box = bounds(a, png.width, png.height);
      const file = path.join(OUT, `card-${id}.png`);
      const card = fit(a, png.width, box);
      await writeFile(file, PNG.sync.write(card));
      cards.push(card);
      results.push({ id, file: path.relative(ROOT, file), box, errors });
      console.log(`${id}: ${path.relative(ROOT, file)}（元の外形 ${box.x1 - box.x0 + 1}×${box.y1 - box.y0 + 1} 画素）errors=${errors.length}`);
      await page.close();
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  if (args.preview && cards.length === IDS.length) {
    // 札の絵の枠（148×56）の2倍で、黒地に白の影絵を3枚並べる（見分けられるかを札の大きさで確かめる）
    const cw = 296;
    const ch = 112;
    const sheet = new PNG({ width: cw * cards.length + 16 * (cards.length + 1), height: ch + 32 });
    sheet.data.fill(0);
    for (let i = 0; i < sheet.width * sheet.height; i++) sheet.data[i * 4 + 3] = 255;
    cards.forEach((c, k) => {
      const ox = 16 + k * (cw + 16);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const sx = Math.min(c.width - 1, Math.floor(((x + 0.5) * c.width) / cw));
          const sy = Math.min(c.height - 1, Math.floor(((y + 0.5) * c.height) / ch));
          const v = c.data[(sy * c.width + sx) * 4 + 3];
          const o = ((16 + y) * sheet.width + ox + x) * 4;
          sheet.data[o] = sheet.data[o + 1] = sheet.data[o + 2] = v;
        }
      }
    });
    await mkdir(path.dirname(path.resolve(String(args.preview))), { recursive: true });
    await writeFile(path.resolve(String(args.preview)), PNG.sync.write(sheet));
    console.log(`並べた確認用: ${args.preview}`);
  }
  if (results.some((r) => r.errors.length > 0)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
