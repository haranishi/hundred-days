/* 同梱するサンプル写真 sample/sample.jpg を作り直す。
 *
 *   PLAYWRIGHT=/path/to/playwright/index.js node apps/day-011-photo-metadata/tools/make-sample.mjs
 *
 * このリポジトリは依存パッケージを増やさないので、Playwright は環境変数で借りる
 * （scripts/make-og.mjs と同じ作法）。生成物 sample/sample.jpg もそのまま置いておく。
 *
 * ■ なぜ自分で描くのか
 * 他人が撮った写真も、配布されている画像も使わない。権利の確認が要るうえ、
 * 「メタデータに何が入っているか」を説明する題材として、写り込みまで自分で決められる必要がある。
 *
 * ■ 何を作っているのか（このアプリ最大の見せ場）
 *   1. 表札に架空の住所が写った「全体」の絵
 *   2. その表札を切り落とした「本体」の絵
 * 本体のJPEGにExifを差し込み、IFD1のサムネイルには 1 の「全体」を入れる。
 * つまり「切り落としたはずの表札が、縮小画像としてファイルの中に残っている」状態を再現する。
 * 実機でもよくある事故で、これはメタデータを消さないと消えない。
 *
 * 描くのは自作の図形と文字だけ。外部の画像・フォント・素材は使わない。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildExifPayload, insertApp1, toDms } from '../tests/fixtures/jpeg-builder.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'sample');
const outFile = join(outDir, 'sample.jpg');

// ---------------------------------------------------------------- Playwright を借りる

const spec = process.env.PLAYWRIGHT || 'playwright';
const target = spec.startsWith('.') || spec.startsWith('/') ? pathToFileURL(resolve(spec.replace(/^~/, process.env.HOME))).href : spec;

let chromium;
try {
  // CommonJS の playwright を動的importすると名前付きexportが出ないことがあるので default も見る
  const mod = await import(target);
  chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('chromium が見つかりません');
} catch (error) {
  console.error(error.message);
  console.error(`Playwright を読み込めませんでした（${spec}）。`);
  console.error('例: PLAYWRIGHT=/path/to/playwright/index.js node apps/day-011-photo-metadata/tools/make-sample.mjs');
  process.exit(1);
}

// ---------------------------------------------------------------- 絵を描く

const WIDTH = 960;
const FULL_HEIGHT = 720; // 表札まで入った「全体」
const BODY_HEIGHT = 540; // 表札を切り落とした「本体」
const THUMB_WIDTH = 320; // IFD1に入れるサムネイル（全体の縮小）

/** ブラウザの中で走る。canvas に図形と文字だけで一軒の家を描く。 */
function drawInPage({ width, fullHeight, bodyHeight, thumbWidth }) {
  const font = (size, weight = '400') => `${weight} ${size}px "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`;

  function scene(ctx) {
    // 空（上ほど濃い青）
    const sky = ctx.createLinearGradient(0, 0, 0, 420);
    sky.addColorStop(0, '#8fc4e8');
    sky.addColorStop(1, '#dfeef7');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, 430);

    // 遠くの雲
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y, r] of [[150, 90, 38], [200, 100, 52], [255, 92, 34], [700, 60, 30], [745, 70, 44], [795, 62, 26]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 地面
    ctx.fillStyle = '#cfc7b4';
    ctx.fillRect(0, 430, width, fullHeight - 430);
    ctx.fillStyle = '#bdb49f';
    ctx.fillRect(0, 430, width, 10);

    // 家の本体
    ctx.fillStyle = '#efe3cf';
    ctx.fillRect(210, 150, 620, 300);
    ctx.fillStyle = '#e2d3bb';
    ctx.fillRect(210, 150, 620, 16);

    // 屋根
    ctx.fillStyle = '#5b6a72';
    ctx.beginPath();
    ctx.moveTo(170, 155);
    ctx.lineTo(520, 40);
    ctx.lineTo(870, 155);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4a5860';
    ctx.fillRect(170, 148, 700, 14);

    // 窓（左）
    ctx.fillStyle = '#f7fbfd';
    ctx.fillRect(268, 214, 168, 128);
    ctx.fillStyle = '#a9cfe4';
    ctx.fillRect(276, 222, 152, 112);
    ctx.strokeStyle = '#8b8172';
    ctx.lineWidth = 6;
    ctx.strokeRect(268, 214, 168, 128);
    ctx.beginPath();
    ctx.moveTo(352, 214);
    ctx.lineTo(352, 342);
    ctx.stroke();

    // 玄関
    ctx.fillStyle = '#7d5a3c';
    ctx.fillRect(600, 250, 150, 200);
    ctx.fillStyle = '#6a4a30';
    ctx.fillRect(600, 250, 150, 12);
    ctx.fillStyle = '#d8c48a';
    ctx.beginPath();
    ctx.arc(730, 355, 7, 0, Math.PI * 2);
    ctx.fill();

    // 玄関灯
    ctx.fillStyle = '#f3e2a8';
    ctx.beginPath();
    ctx.moveTo(775, 236);
    ctx.lineTo(805, 236);
    ctx.lineTo(797, 268);
    ctx.lineTo(783, 268);
    ctx.closePath();
    ctx.fill();

    // 植え込み
    ctx.fillStyle = '#5f8f5a';
    for (const [x, y, rx, ry] of [[190, 452, 74, 40], [860, 450, 66, 36], [96, 462, 52, 30]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4f7a4b';
    ctx.beginPath();
    ctx.ellipse(210, 462, 44, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // アプローチ（手前の敷石）
    ctx.fillStyle = '#ded6c6';
    for (let row = 0; row < 4; row += 1) {
      const y = 486 + row * 34;
      ctx.fillRect(560 - row * 46, y, 240 + row * 92, 24);
    }
  }

  /** 表札。ここだけが「切り落とす部分」で、住所は架空。 */
  function nameplate(ctx) {
    // 門柱
    ctx.fillStyle = '#b9b0a1';
    ctx.fillRect(60, 528, 470, 192);
    ctx.fillStyle = '#a89f90';
    ctx.fillRect(60, 528, 470, 12);

    // 板
    ctx.fillStyle = '#fbfbf8';
    ctx.fillRect(92, 566, 406, 126);
    ctx.strokeStyle = '#8d8578';
    ctx.lineWidth = 4;
    ctx.strokeRect(92, 566, 406, 126);

    ctx.fillStyle = '#20242a';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(50, '700');
    ctx.fillText('みどり町 3-14-2', 116, 626);
    ctx.font = font(38, '500');
    ctx.fillText('さくら荘 201', 116, 674);
  }

  function toJpeg(canvas, quality) {
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  }

  // 1. 全体（表札あり）
  const full = document.createElement('canvas');
  full.width = width;
  full.height = fullHeight;
  const fullCtx = full.getContext('2d');
  scene(fullCtx);
  nameplate(fullCtx);

  // 2. 本体（表札を切り落とした上半分）
  const body = document.createElement('canvas');
  body.width = width;
  body.height = bodyHeight;
  body.getContext('2d').drawImage(full, 0, 0, width, bodyHeight, 0, 0, width, bodyHeight);

  // 3. サムネイル（全体の縮小＝切り落としたはずの表札が残る）
  const thumbHeight = Math.round((thumbWidth * fullHeight) / width);
  const thumb = document.createElement('canvas');
  thumb.width = thumbWidth;
  thumb.height = thumbHeight;
  const thumbCtx = thumb.getContext('2d');
  thumbCtx.imageSmoothingQuality = 'high';
  thumbCtx.drawImage(full, 0, 0, thumbWidth, thumbHeight);

  return {
    body: toJpeg(body, 0.86),
    thumbnail: toJpeg(thumb, 0.78),
    thumbSize: [thumbWidth, thumbHeight]
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1, locale: 'ja-JP' });
await page.goto('about:blank');
const drawn = await page.evaluate(drawInPage, { width: WIDTH, fullHeight: FULL_HEIGHT, bodyHeight: BODY_HEIGHT, thumbWidth: THUMB_WIDTH });
await browser.close();

const body = new Uint8Array(Buffer.from(drawn.body, 'base64'));
const thumbnail = new Uint8Array(Buffer.from(drawn.thumbnail, 'base64'));

// ---------------------------------------------------------------- Exif を組み立てて差し込む

/* GPSは東京駅（35.681236, 139.767125）。誰の生活圏でもなく、誰でも知っている場所。
   画面には「サンプルに書き込んだ架空の位置です」と明記する。 */
const LATITUDE = 35.681236;
const LONGITUDE = 139.767125;

const payload = buildExifPayload({
  byteOrder: 'II',
  ifd0: [
    { tag: 0x010f, value: 'SAMPLE OPTICS' }, // Make（架空のメーカー名。実在の事業者名は使わない）
    { tag: 0x0110, value: 'Sample Camera 100' }, // Model
    { tag: 0x0112, type: 3, value: 1 }, // Orientation（回さない）
    { tag: 0x011a, type: 5, value: { n: 72, d: 1 } }, // XResolution
    { tag: 0x011b, type: 5, value: { n: 72, d: 1 } }, // YResolution
    { tag: 0x0128, type: 3, value: 2 }, // ResolutionUnit（インチ）
    { tag: 0x0131, value: 'day-011 make-sample.mjs' }, // Software
    /* 権利表示。第4のカテゴリと、除去ボタン直上の警告を、サンプルだけで確かめられるようにする。
       値は架空で、実在の人物・事業者ではない */
    { tag: 0x013b, value: 'SAMPLE PHOTOGRAPHER' }, // Artist
    { tag: 0x8298, value: '(C) 2026 SAMPLE PHOTOGRAPHER' } // Copyright
  ],
  exif: [
    { tag: 0x9003, value: '2026:08:18 09:11:00' }, // DateTimeOriginal
    { tag: 0x829a, type: 5, value: { n: 1, d: 250 } }, // ExposureTime
    { tag: 0x829d, type: 5, value: { n: 28, d: 10 } }, // FNumber
    { tag: 0x8827, type: 3, value: 200 }, // ISO
    { tag: 0x920a, type: 5, value: { n: 350, d: 10 } }, // FocalLength
    { tag: 0xa430, value: 'SAMPLE OWNER' }, // CameraOwnerName
    { tag: 0xa431, value: 'SN-0000000011' }, // BodySerialNumber
    { tag: 0xa434, value: 'Sample Lens 35mm F2.8' } // LensModel
  ],
  gps: [
    { tag: 0x0000, type: 1, value: [2, 3, 0, 0] }, // GPSVersionID
    { tag: 0x0001, value: 'N' },
    { tag: 0x0002, type: 5, value: toDms(LATITUDE) },
    { tag: 0x0003, value: 'E' },
    { tag: 0x0004, type: 5, value: toDms(LONGITUDE) },
    { tag: 0x0005, type: 1, value: 0 }, // GPSAltitudeRef（海面より上）
    { tag: 0x0006, type: 5, value: { n: 35, d: 10 } }, // GPSAltitude
    { tag: 0x0007, type: 5, value: [{ n: 0, d: 1 }, { n: 11, d: 1 }, { n: 0, d: 1 }] }, // GPSTimeStamp（世界標準時）
    { tag: 0x0010, value: 'T' }, // GPSImgDirectionRef（真北）
    { tag: 0x0011, type: 5, value: { n: 1234, d: 10 } }, // GPSImgDirection
    { tag: 0x001d, value: '2026:08:18' } // GPSDateStamp
  ],
  thumbnail
});

const jpeg = insertApp1(body, payload);

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, jpeg);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;
console.log(`make-sample: sample/sample.jpg を生成しました（${WIDTH}x${BODY_HEIGHT} / ${kb(jpeg.length)}）`);
console.log(`  Exifの区画 ${kb(payload.length)}（うちサムネイル ${drawn.thumbSize.join('x')} / ${kb(thumbnail.length)}）`);
console.log('  生成したら必ず目視すること：表札の住所が本体から消えていて、サムネイルには残っていること');
