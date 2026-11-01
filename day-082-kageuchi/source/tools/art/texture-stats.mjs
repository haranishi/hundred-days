// OWNER: world-art
// CC0 の写真（src/art/textures/<id>/）を測り、シェーダーが使う値を src/art/textures/photoStats.ts に書く（r08-world）。
//   node tools/art/texture-stats.mjs            測って書く
//   node tools/art/texture-stats.mjs --check    書かずに、いまのファイルと同じ値になるかだけ確かめる（違えば終了コード 1）
// 測るもの：色の写真の線形の平均輝度（明るさの比の分母）、杉板の写真の板の並び（継ぎ目の位置・板ごとの平均・使ってよい板）、
// 法線の写真の傾きの大きさ（強さを材質どうしでそろえる目安）。
// r08-world-周2：測るのは配る派生（tools/art/texture-derive.mjs が作る白黒の輝度と 512px の法線）。さらに材質ごとに、
// look.ts の強さ・上下の制限・2つの縮尺の重ね方で掛ける係数の、写真全体での平均が 1.00±0.01 に入るかを確かめる（外れたら終了コード 1）。
// r08-world-周3：石と石畳は、粗いミップとの差（高域）で確かめる。
// JPEG を読むのに macOS の sips を使う（PNG に直して pngjs で読む）。
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
const OUT = path.join(TEX, 'photoStats.ts');
const IDS = { cedar: 'japanese_cedar_planks', plaster: 'white_plaster_02', clay: 'clay_plaster', rock: 'rock_surface' };
/** 杉板：継ぎ目の中心から板の内側へ空ける幅（画素）。継ぎ目の暗い谷は中心の ±5 画素 */
const SEAM_MARGIN_PX = 7;
/** 杉板：使わない板の条件（板の中の明るさのばらつき・横の突き付けの継ぎ目） */
const PLANK_MAX_SPREAD = 0.17;
const JOINT_DIP = 0.82;
/** 係数の平均の許す幅（指示書 r08 周2：1.00±0.01） */
const MEAN_TOLERANCE = 0.01;
/** r08-world-周3：石に当てる窓は、明暗の幅が全部の窓の下からこの割合までのものだけ */
const WINDOW_KEEP = 0.25;

const lin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const LIN = Float64Array.from({ length: 256 }, (_, i) => lin(i));
const r4 = (x) => Math.round(x * 10000) / 10000;

async function readJpeg(file, tmp) {
  const png = path.join(tmp, `${path.basename(file, '.jpg')}.png`);
  const r = spawnSync('sips', ['-s', 'format', 'png', file, '--out', png], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`sips が失敗（${file}）: ${r.stderr}`);
  const img = PNG.sync.read(await readFile(png));
  return img;
}

function luminance(img) {
  const { width, height, data } = img;
  const L = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) L[i] = 0.2126 * LIN[data[i * 4]] + 0.7152 * LIN[data[i * 4 + 1]] + 0.0722 * LIN[data[i * 4 + 2]];
  return L;
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

/** 縦に並ぶ板の継ぎ目：列の平均の、近くの平均に対する谷。周期と位相を最小二乗で合わせる。 */
function plankGrid(L, w, h) {
  const col = new Float64Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) col[x] += L[y * w + x] / h;
  const win = 9;
  const rel = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let d = -win; d <= win; d++) s += col[(x + d + w) % w];
    rel[x] = col[x] / (s / (2 * win + 1));
  }
  const dips = [];
  for (let x = 0; x < w; x++) {
    if (rel[x] >= 0.93) continue;
    let isMin = true;
    for (let d = -6; d <= 6; d++) if (rel[(x + d + w) % w] < rel[x]) isMin = false;
    if (isMin) dips.push(x);
  }
  const gaps = dips.slice(1).map((x, i) => x - dips[i]).sort((a, b) => a - b);
  const approx = gaps[Math.floor(gaps.length / 2)];
  const count = Math.round(w / approx);
  const period = w / count;
  // 位相：深い谷（木目の暗い筋と取り違えない）の位置を周期で包んだ円の平均。格子から外れる谷を除いてもう一度
  const circ = (xs) => {
    let sx = 0;
    let sy = 0;
    for (const x of xs) {
      const a = ((x % period) / period) * Math.PI * 2;
      sx += Math.cos(a);
      sy += Math.sin(a);
    }
    return ((Math.atan2(sy, sx) / (Math.PI * 2)) * period + period) % period;
  };
  const deep = dips.filter((x) => rel[x] < 0.85);
  let phase = circ(deep);
  const off = (x) => Math.abs(((x - phase + period * 1.5) % period) - period / 2);
  const kept = deep.filter((x) => off(x) < period * 0.1);
  phase = circ(kept);
  return { count, period, phase, dips: kept };
}

function planks(L, w, h, grid) {
  const out = [];
  for (let k = 0; k < grid.count; k++) {
    const x0 = grid.phase + grid.period * k;
    const a = Math.ceil(x0 + SEAM_MARGIN_PX);
    const b = Math.floor(x0 + grid.period - SEAM_MARGIN_PX);
    const vals = [];
    const row = new Float64Array(h);
    for (let y = 0; y < h; y++) {
      for (let x = a; x < b; x++) {
        const v = L[y * w + (x % w)];
        vals.push(v);
        row[y] += v / (b - a);
      }
    }
    const m = mean(vals);
    const sd = Math.sqrt(mean(vals.map((v) => (v - m) ** 2)));
    // 横の突き付けの継ぎ目：行の平均が、前後 12 行の平均より深く沈む所
    const joints = [];
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let d = -12; d <= 12; d++) s += row[(y + d + h) % h];
      const q = row[y] / (s / 25);
      let isMin = true;
      for (let d = -5; d <= 5; d++) if (row[(y + d + h) % h] < row[y]) isMin = false;
      if (q < JOINT_DIP && isMin) joints.push(y);
    }
    out.push({ k, mean: m, spread: sd / m, joints, use: sd / m <= PLANK_MAX_SPREAD && joints.length === 0 });
  }
  return out;
}

function slopes(img) {
  const { width, height, data } = img;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const nx = (data[i * 4] / 255) * 2 - 1;
    const ny = (data[i * 4 + 1] / 255) * 2 - 1;
    const nz = Math.max((data[i * 4 + 2] / 255) * 2 - 1, 0.35);
    const a = -nx / nz;
    const b = -ny / nz;
    sx += a;
    sy += b;
    sxx += a * a;
    syy += b * b;
  }
  return { mean: [r4(sx / n), r4(sy / n)], rms: r4(Math.sqrt((sxx + syy) / (2 * n))) };
}

/**
 * r08-world-周3：石1つに当てる写真の窓を選ぶ。窓（石の大きさ ÷ tile）を 16 画素おきに置き、窓を 4×2（縦長なら 2×4）に分けた
 * 小区画の平均の明るさの幅が小さい（大きな明暗の境を含まない）順に、重なりすぎないものを count 個取る。
 * 返すのは uv（v は画像の下から）での窓の左下と、その窓の平均の輝度（石ごとの比の分母）。
 */
function selectWindows({ L, w, h, mean }, tile, size, count) {
  const W = Math.round((size[0] / tile) * w);
  const H = Math.round((size[1] / tile) * h);
  const nx = W >= H ? 4 : 2;
  const ny = W >= H ? 2 : 4;
  const sw = Math.floor(W / nx);
  const sh = Math.floor(H / ny);
  // 2×2 に並べた写真の累積和（窓が端をまたいでも読めるように）
  const W2 = w * 2;
  const H2 = h * 2;
  const S = new Float64Array((W2 + 1) * (H2 + 1));
  for (let y = 0; y < H2; y++) {
    let row = 0;
    for (let x = 0; x < W2; x++) {
      row += L[(y % h) * w + (x % w)];
      S[(y + 1) * (W2 + 1) + (x + 1)] = S[y * (W2 + 1) + (x + 1)] + row;
    }
  }
  const rect = (x, y, ww, hh) => S[(y + hh) * (W2 + 1) + (x + ww)] - S[y * (W2 + 1) + (x + ww)] - S[(y + hh) * (W2 + 1) + x] + S[y * (W2 + 1) + x];
  const cands = [];
  for (let y = 0; y < h; y += 16) {
    for (let x = 0; x < w; x += 16) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const m = rect(x + i * sw, y + j * sh, sw, sh) / (sw * sh) / mean;
          lo = Math.min(lo, m);
          hi = Math.max(hi, m);
        }
      }
      cands.push({ x, y, score: hi - lo, wmean: rect(x, y, W, H) / (W * H) });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  // 明暗の幅が全部の窓の下から 25% に入るものだけを使い、窓の 1/4 以上ずれたものを取る（裏返しと合わせて石ごとに違って見える）
  const cap = cands[Math.floor(cands.length * WINDOW_KEEP)].score;
  const near = (a, b, n) => Math.min(Math.abs(a - b), n - Math.abs(a - b));
  const picked = [];
  for (const c of cands) {
    if (picked.length >= count || c.score > cap) break;
    if (picked.every((q) => near(c.x, q.x, w) >= W / 4 || near(c.y, q.y, h) >= H / 4)) picked.push(c);
  }
  return {
    size: [r4(W / w), r4(H / h)],
    px: [W, H],
    maxScore: r4(picked[picked.length - 1].score),
    medianScore: r4(cands[Math.floor(cands.length / 2)].score),
    list: picked.map((c) => [r4(c.x / w), r4(1 - (c.y + H) / h), r4(c.wmean)]),
    raw: picked,
  };
}

/** 決まった種の擬似乱数（xorshift32）。 */
function rand(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

/**
 * 材質ごとに、シェーダーと同じ式（look.ts の強さ・上下の制限・2つの縮尺の重ね方）で掛ける係数を写真全体で平均する。
 * いちばん細かいミップ（原寸の画素）で測る。粗いミップほど値の幅が狭く、上下の制限に当たりにくいので、ここが最も外れやすい。
 * 2つの縮尺は、独立に選んだ2点の比の和 × 1/√2（kgTexPair と同じ）を 200 万組で平均する。
 */
async function checkMeans(lums, plankRegions, stats) {
  const { LOOK } = await import(path.join(ROOT, 'src', 'art', 'world', 'look.ts'));
  const P = LOOK.photo;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const single = (key, strength, lo, hi) => {
    const { L, mean } = lums[key];
    let sum = 0;
    for (let i = 0; i < L.length; i++) sum += clamp(1 + strength * (L[i] / mean - 1), lo, hi);
    return sum / L.length;
  };
  // r08-world-周3：粗いミップ（lod）との差 ÷ 平均（石と石畳）。ミップは 2×2 の箱で縮め、GPU と同じく双線形で読み戻す（端は巻き戻す）
  const coarse = (key, lod) => {
    const { L, w, h } = lums[key];
    const k = 2 ** lod;
    const mw = w / k;
    const mh = h / k;
    const mip = new Float64Array(mw * mh);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mip[Math.floor(y / k) * mw + Math.floor(x / k)] += L[y * w + x] / (k * k);
    const up = new Float64Array(w * h);
    const at = (x, y) => mip[(((y % mh) + mh) % mh) * mw + (((x % mw) + mw) % mw)];
    for (let y = 0; y < h; y++) {
      const v = (y + 0.5) / k - 0.5;
      const y0 = Math.floor(v);
      const fy = v - y0;
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / k - 0.5;
        const x0 = Math.floor(u);
        const fx = u - x0;
        up[y * w + x] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
      }
    }
    return up;
  };
  const highPass = (key, lod, strength, lo, hi) => {
    const { L, mean } = lums[key];
    const up = coarse(key, lod);
    let sum = 0;
    for (let i = 0; i < L.length; i++) sum += clamp(1 + strength * ((L[i] - up[i]) / mean), lo, hi);
    return sum / L.length;
  };
  const pair = (key, strength, lo, hi, seed) => {
    const { L, mean } = lums[key];
    const r = rand(seed);
    const n = 2_000_000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const a = L[Math.floor(r() * L.length)] / mean - 1;
      const b = L[Math.floor(r() * L.length)] / mean - 1;
      sum += clamp(1 + strength * 0.7071 * (a + b), lo, hi);
    }
    return sum / n;
  };
  // 杉板：使う板の内側ごとに、その板の平均で割った比（板は等しい確率で選ばれる）
  const wood = (() => {
    const { L, w, h } = lums.cedar;
    const { grid, list } = plankRegions;
    let total = 0;
    let count = 0;
    for (const p of list.filter((q) => q.use)) {
      const x0 = grid.phase + grid.period * p.k;
      const a = Math.ceil(x0 + SEAM_MARGIN_PX);
      const b = Math.floor(x0 + grid.period - SEAM_MARGIN_PX);
      let sum = 0;
      for (let y = 0; y < h; y++) for (let x = a; x < b; x++) sum += clamp(1 + P.wood.strength * (L[y * w + (x % w)] / p.mean - 1), 0.35, 1.9);
      total += sum / (h * (b - a));
      count++;
    }
    return total / count;
  })();
  // r08-world-周3：窓ごとに、その窓の平均で割った比（窓は等しい確率で選ばれる）
  const windowMean = (key, win, strength, lo, hi) => {
    const { L, w, h } = lums[key];
    const [W, H] = win.px;
    let total = 0;
    for (const c of win.raw) {
      let sum = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sum += clamp(1 + strength * (L[((c.y + y) % h) * w + ((c.x + x) % w)] / c.wmean - 1), lo, hi);
      total += sum / (W * H);
    }
    return total / win.raw.length;
  };
  const rows = [
    ['wood（板・床）', wood],
    ['plaster（白壁）', pair('plaster', P.plaster.strength, 0.5, 1.6, 11)],
    ['plaster（町屋）', pair('plaster', P.plaster.strength * P.plaster.town, 0.5, 1.6, 12)],
    ['dobei（土塀）', pair('clay', P.dobei.strength, 0.5, 1.6, 13)],
    ['stone（切石・窓）', windowMean('rock', stats.rock.windowsRaw.cut, P.stone.strength, 0.4, 1.8)],
    ['stone（自然石）', highPass('rock', P.stone.coarseLod, P.stone.strength, 0.4, 1.8)],
    ['stone（溝の底）', highPass('rock', P.stone.coarseLod, P.stone.strength * P.stone.wet, 0.4, 1.8)],
    ['ground（石畳・窓）', windowMean('rock', stats.rock.windowsRaw.path, P.ground.strength, 0.4, 1.8)],
  ];
  let ok = true;
  console.log(`係数の写真全体での平均（許す幅 1±${MEAN_TOLERANCE}）`);
  for (const [name, m] of rows) {
    const pass = Math.abs(m - 1) <= MEAN_TOLERANCE;
    if (!pass) ok = false;
    console.log(`  ${name.padEnd(14)} ${m.toFixed(4)} ${pass ? '' : '← 外れ'}`);
  }
  return ok;
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function main() {
  const check = process.argv.includes('--check');
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kg-tex-'));
  const stats = {};
  const hashes = {};
  const lums = {};
  let plankRegions = null;
  try {
    for (const [key, id] of Object.entries(IDS)) {
      const diff = path.join(TEX, id, `${id}_lum_1k.jpg`);
      const nor = path.join(TEX, id, `${id}_nor_gl_512.jpg`);
      hashes[key] = [await sha256(diff), await sha256(nor)];
      const d = await readJpeg(diff, tmp);
      const L = luminance(d);
      const s = { size: d.width, mean: r4(mean(L)), slope: slopes(await readJpeg(nor, tmp)) };
      lums[key] = { L, w: d.width, h: d.height, mean: s.mean };
      if (key === 'cedar') {
        const grid = plankGrid(L, d.width, d.height);
        const list = planks(L, d.width, d.height, grid);
        plankRegions = { grid, list };
        const use = list.filter((p) => p.use);
        s.planks = {
          count: grid.count,
          // 板 k は u = (phase + period×k) / 幅 から1枚分。margin は継ぎ目の中心から内へ空ける幅（u）
          u0: r4(grid.phase / d.width),
          width: r4(grid.period / d.width),
          margin: r4(SEAM_MARGIN_PX / d.width),
          use: use.map((p) => p.k),
          means: use.map((p) => r4(p.mean)),
        };
        console.log(`杉板：${grid.count} 枚・周期 ${grid.period.toFixed(2)}px・位相 ${grid.phase.toFixed(2)}px（谷 ${grid.dips.join(',')}）`);
        for (const p of list) console.log(`  板 ${String(p.k).padStart(2)} 平均 ${p.mean.toFixed(4)}（全体の ${(p.mean / s.mean).toFixed(2)} 倍）ばらつき ${p.spread.toFixed(3)} 継ぎ目 ${p.joints.join(',') || 'なし'} ${p.use ? '使う' : '使わない'}`);
      }
      // 明るさの比（輝度 ÷ 平均）を写真全体で平均すると 1 になること（平均の反射率を変えない、の確かめ）
      const ratioMean = mean(Array.from(L, (v) => v / s.mean));
      console.log(`${key.padEnd(8)} 平均輝度 ${s.mean} 比の平均 ${ratioMean.toFixed(4)} 法線の傾き rms ${s.slope.rms}（平均 ${s.slope.mean.join(', ')}）`);
      stats[key] = s;
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  // r08-world-周3：切石と石畳の窓
  const { LOOK } = await import(path.join(ROOT, 'src', 'art', 'world', 'look.ts'));
  const cut = selectWindows(lums.rock, LOOK.photo.stone.tile, LOOK.photo.stone.window, LOOK.photo.stone.windows);
  const pathW = selectWindows(lums.rock, LOOK.photo.ground.tile, LOOK.photo.ground.window, LOOK.photo.ground.windows);
  stats.rock.windowsRaw = { cut, path: pathW };
  for (const [name, win] of [['切石', cut], ['石畳', pathW]]) {
    console.log(`${name}の窓：${win.px[0]}×${win.px[1]}px・${win.list.length} 個・明暗の幅 最大 ${win.maxScore}（全部の窓の中央値 ${win.medianScore}）`);
  }
  const meansOk = await checkMeans(lums, plankRegions, stats);
  stats.rock.windows = {
    cut: { size: cut.size, list: cut.list },
    path: { size: pathW.size, list: pathW.list },
  };
  delete stats.rock.windowsRaw;
  const body = `// OWNER: world-art
// 生成物（r08-world）：tools/art/texture-stats.mjs が src/art/textures/ の CC0 の写真から測った値。手で直さず、道具を回し直す。
// mean＝色の写真の線形の平均輝度。planks＝杉板の板の並び（u0・width・margin は u の単位）と、使う板の番号とその平均輝度。
// slope＝法線の写真の傾き（高さ÷長さ）の rms と平均。rock.windows＝切石（cut）と石畳（path）に当てる、明暗の境を含まない窓
// （size は uv での窓の大きさ、list は [窓の左下の u, v（画像の下から）, 窓の平均の輝度]。look.ts の tile・window・windows から選ぶ）。元の画像の sha256：
${Object.entries(hashes)
  .map(([k, [a, b]]) => `//   ${k}: diff ${a} / nor ${b}`)
  .join('\n')}
export const PHOTO_STATS = ${JSON.stringify(stats, null, 2)
    .replace(/"(\w+)":/g, '$1:')
    .replace(/\[\s+([-\d.,\s]+?)\s+\]/g, (_, inner) => `[${inner.split(/,\s*/).join(', ')}]`)} as const;
`;
  if (!meansOk) process.exitCode = 1;
  if (check) {
    const cur = await readFile(OUT, 'utf8').catch(() => '');
    if (cur !== body) {
      console.error('photoStats.ts が測り直した値と違う（node tools/art/texture-stats.mjs で書き直す）');
      process.exitCode = 1;
    } else console.log('photoStats.ts は測り直した値と同じ');
    return;
  }
  await writeFile(OUT, body);
  console.log(`書いた: ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
