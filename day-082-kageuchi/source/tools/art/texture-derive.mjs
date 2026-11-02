// OWNER: world-art
// r08-world-周2：配る写真を、原本（src/art/textures/<id>/ の Poly Haven の 1K の JPEG）から作る。
//   色の写真 → 線形の輝度（Rec.709 の重み）を sRGB で 8bit にした白黒の JPEG（<id>_lum_1k.jpg）。シェーダーは明るさしか使わない
//   法線の写真 → 2×2 の平均で縮め（既定 512px）、JPEG で書き直す（<id>_nor_gl_512.jpg）
//   node tools/art/texture-derive.mjs [--nor-size 512] [--nor-quality 85] [--lum-quality 88]
// 作り方・元の画像・結果のハッシュは各 provenance.json の derived に書く。原本は来歴のために残すが、コードが参照しないのでビルドには入らない。
// JPEG の読み書きは macOS の sips。sips が埋め込む色の設定（ICC・Exif・Photoshop の欄）は消し、sRGB として読ませる
// （埋め込んだままだと、ブラウザが Gray Gamma 2.2 から変換して輝度がずれる）。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEX = path.join(ROOT, 'src', 'art', 'textures');
export const IDS = { cedar: 'japanese_cedar_planks', plaster: 'white_plaster_02', clay: 'clay_plaster', rock: 'rock_surface' };

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    out[argv[i].slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const NOR_SIZE = Number(args['nor-size'] ?? 512);
const NOR_QUALITY = Number(args['nor-quality'] ?? 85);
const LUM_QUALITY = Number(args['lum-quality'] ?? 88);

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
const LIN = Float64Array.from({ length: 256 }, (_, i) => toLin(i / 255));

function sips(params) {
  const r = spawnSync('sips', params, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`sips が失敗（${params.join(' ')}）: ${r.stderr}`);
}

async function decode(file, tmp) {
  const out = path.join(tmp, `${path.basename(file, '.jpg')}-src.png`);
  sips(['-s', 'format', 'png', file, '--out', out]);
  return PNG.sync.read(await readFile(out));
}

/** JPEG の APP1〜APP15（Exif・ICC・Photoshop の欄）を除く。APP0（JFIF）と画像の本体はそのまま。 */
function stripJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('JPEG ではない');
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error(`JPEG の区切りが読めない（${i}）`);
    const m = buf[i + 1];
    if (m === 0xda) {
      parts.push(buf.subarray(i));
      break;
    }
    const len = buf.readUInt16BE(i + 2);
    if (!(m >= 0xe1 && m <= 0xef)) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat(parts);
}

async function encode(png, opts, quality, tmp, name) {
  const src = path.join(tmp, `${name}.png`);
  const dst = path.join(tmp, `${name}.jpg`);
  await writeFile(src, PNG.sync.write(png, opts));
  sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), src, '--out', dst]);
  return stripJpeg(await readFile(dst));
}

const sha = (b) => createHash('sha256').update(b).digest('hex');

async function main() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kg-derive-'));
  let total = 0;
  try {
    for (const id of Object.values(IDS)) {
      const dir = path.join(TEX, id);
      const diffName = `${id}_diff_1k.jpg`;
      const norName = `${id}_nor_gl_1k.jpg`;
      const diffSrc = await readFile(path.join(dir, diffName));
      const norSrc = await readFile(path.join(dir, norName));

      // 色 → 線形の輝度 → sRGB の 8bit の白黒
      const d = await decode(path.join(dir, diffName), tmp);
      const gray = new PNG({ width: d.width, height: d.height, colorType: 0, inputColorType: 0, inputHasAlpha: false, bitDepth: 8 });
      gray.data = Buffer.alloc(d.width * d.height);
      for (let i = 0; i < d.width * d.height; i++) {
        const y = 0.2126 * LIN[d.data[i * 4]] + 0.7152 * LIN[d.data[i * 4 + 1]] + 0.0722 * LIN[d.data[i * 4 + 2]];
        gray.data[i] = Math.round(toSrgb(y) * 255);
      }
      const lum = await encode(gray, { colorType: 0, inputColorType: 0, inputHasAlpha: false }, LUM_QUALITY, tmp, `${id}-lum`);
      const lumName = `${id}_lum_1k.jpg`;
      await writeFile(path.join(dir, lumName), lum);

      // 法線 → 2×2（以上）の箱で平均して縮める
      const n = await decode(path.join(dir, norName), tmp);
      const f = n.width / NOR_SIZE;
      if (!Number.isInteger(f) || f < 1) throw new Error(`法線の大きさ ${NOR_SIZE} は ${n.width} の整数分の1にする`);
      const small = new PNG({ width: NOR_SIZE, height: NOR_SIZE, colorType: 2, inputColorType: 2, inputHasAlpha: false, bitDepth: 8 });
      small.data = Buffer.alloc(NOR_SIZE * NOR_SIZE * 3);
      for (let y = 0; y < NOR_SIZE; y++) {
        for (let x = 0; x < NOR_SIZE; x++) {
          for (let c = 0; c < 3; c++) {
            let s = 0;
            for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) s += n.data[((y * f + dy) * n.width + (x * f + dx)) * 4 + c];
            small.data[(y * NOR_SIZE + x) * 3 + c] = Math.round(s / (f * f));
          }
        }
      }
      const nor = await encode(small, { colorType: 2, inputColorType: 2, inputHasAlpha: false }, NOR_QUALITY, tmp, `${id}-nor`);
      const norOut = `${id}_nor_gl_${NOR_SIZE}.jpg`;
      await writeFile(path.join(dir, norOut), nor);

      const provFile = path.join(dir, 'provenance.json');
      const prov = JSON.parse(await readFile(provFile, 'utf8'));
      prov.derived = {
        tool: 'tools/art/texture-derive.mjs',
        note: 'Shipped files. Originals above are kept for provenance and are not referenced by the code.',
        [lumName]: {
          from: diffName,
          fromSha256: sha(diffSrc),
          method: `linear luminance (Rec.709 weights), sRGB-encoded 8-bit grayscale JPEG, quality ${LUM_QUALITY}, no ICC/Exif`,
          bytes: lum.length,
          sha256: sha(lum),
        },
        [norOut]: {
          from: norName,
          fromSha256: sha(norSrc),
          method: `${f}x${f} box average to ${NOR_SIZE}px, JPEG quality ${NOR_QUALITY}, no ICC/Exif`,
          bytes: nor.length,
          sha256: sha(nor),
        },
      };
      await writeFile(provFile, `${JSON.stringify(prov, null, 2)}\n`);
      total += lum.length + nor.length;
      console.log(`${id.padEnd(22)} 輝度 ${(lum.length / 1024).toFixed(0).padStart(4)}KB（元の色 ${(diffSrc.length / 1024).toFixed(0)}KB）  法線 ${NOR_SIZE}px ${(nor.length / 1024).toFixed(0).padStart(4)}KB（元 ${(norSrc.length / 1024).toFixed(0)}KB）`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  console.log(`配る写真の合計 ${(total / 1024 / 1024).toFixed(2)}MB`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
