// 絵を「色ごとの層」に分ける。AIは使わず、背景の塗りつぶし → 減色（k-means）→ 食材の系統へ割り当て → 掃除 の順に、
// 乱数なしで処理する（同じ絵・同じ設定なら、いつも同じ型紙になるように）
import { rgbToLabInto, labToHex } from './color.js';
import { FAMILIES, fitScale } from './foods.js';

export const DIFFICULTY = {
  easy: { id: 'easy', name: 'かんたん', k: 4, minMm2: 16, size: 256 },
  normal: { id: 'normal', name: 'ふつう', k: 6, minMm2: 6, size: 256 },
  hard: { id: 'hard', name: 'こだわり', k: 8, minMm2: 2, size: 320 },
};

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

// 連結成分（同じ値の画素のかたまり）。same=false なら 0 以外をひとかたまりに見る
export function components(labels, w, h, { conn = 8, same = true } = {}) {
  const n = w * h;
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const nb = conn === 4 ? N4 : N8;
  const list = [];
  for (let i = 0; i < n; i++) {
    if (!labels[i] || comp[i] >= 0) continue;
    const id = list.length;
    const value = labels[i];
    let top = 0;
    stack[top++] = i;
    comp[i] = id;
    let area = 0;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    while (top) {
      const p = stack[--top];
      area++;
      const x = p % w;
      const y = (p - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const [dx, dy] of nb) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!labels[q] || comp[q] >= 0 || (same && labels[q] !== value)) continue;
        comp[q] = id;
        stack[top++] = q;
      }
    }
    list.push({ id, value, area, x0, y0, x1, y1 });
  }
  return { comp, list };
}

function toLab(data, n) {
  const lab = new Float32Array(n * 3);
  // イラストは同じ色が続くので、色ごとに一度だけ変換する
  const cache = new Map();
  for (let i = 0; i < n; i++) {
    const key = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
    let v = cache.get(key);
    if (!v) {
      v = rgbToLabInto(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], new Float32Array(3));
      cache.set(key, v);
    }
    lab[i * 3] = v[0];
    lab[i * 3 + 1] = v[1];
    lab[i * 3 + 2] = v[2];
  }
  return lab;
}

// RGB を各5bitにまとめた色の度数分布。画素ごとに k-means を回すより速く、結果は画素の並び順だけで決まる
function histogram(lab, data, indices) {
  const binOf = new Map();
  const counts = [];
  const sums = [];
  const pixelBin = new Int32Array(indices.length);
  for (let t = 0; t < indices.length; t++) {
    const i = indices[t];
    const key = ((data[i * 4] >> 3) << 10) | ((data[i * 4 + 1] >> 3) << 5) | (data[i * 4 + 2] >> 3);
    let b = binOf.get(key);
    if (b === undefined) {
      b = counts.length;
      binOf.set(key, b);
      counts.push(0);
      sums.push(0, 0, 0);
    }
    counts[b]++;
    sums[b * 3] += lab[i * 3];
    sums[b * 3 + 1] += lab[i * 3 + 1];
    sums[b * 3 + 2] += lab[i * 3 + 2];
    pixelBin[t] = b;
  }
  const points = new Float64Array(counts.length * 3);
  for (let b = 0; b < counts.length; b++) for (let c = 0; c < 3; c++) points[b * 3 + c] = sums[b * 3 + c] / counts[b];
  return { points, weights: Float64Array.from(counts), pixelBin };
}

const dist2 = (p, i, q, j) => (p[i * 3] - q[j * 3]) ** 2 + (p[i * 3 + 1] - q[j * 3 + 1]) ** 2 + (p[i * 3 + 2] - q[j * 3 + 2]) ** 2;

// 重みつき k-means。初期値は「いちばん多い色 → そこから最も遠い色 → …」で決め、乱数を使わない。
// 1画素だけの色（JPEG のにじみなど）が中心を奪わないよう、遠い色の候補は0.3%以上ある色に限る
export function kmeans(points, weights, k, maxIter = 20) {
  const m = weights.length;
  let total = 0;
  for (let i = 0; i < m; i++) total += weights[i];
  let cand = [];
  for (let i = 0; i < m; i++) if (weights[i] >= total * 0.003) cand.push(i);
  if (cand.length < k) cand = Array.from({ length: m }, (_, i) => i);
  let kk = Math.min(k, m);
  const centers = new Float64Array(kk * 3);
  let first = 0;
  for (let i = 1; i < m; i++) if (weights[i] > weights[first]) first = i;
  for (let c = 0; c < 3; c++) centers[c] = points[first * 3 + c];
  const minD = new Float64Array(m).fill(Infinity);
  for (let c = 1; c < kk; c++) {
    for (let i = 0; i < m; i++) minD[i] = Math.min(minD[i], dist2(points, i, centers, c - 1));
    let best = cand[0];
    for (const i of cand) if (minD[i] > minD[best]) best = i;
    if (!(minD[best] > 0)) {
      kk = c;
      break;
    }
    for (let d = 0; d < 3; d++) centers[c * 3 + d] = points[best * 3 + d];
  }
  const assign = new Int32Array(m).fill(-1);
  const counts = new Float64Array(kk);
  for (let it = 0; it < maxIter; it++) {
    let changed = 0;
    for (let i = 0; i < m; i++) {
      let bj = 0;
      let bd = Infinity;
      for (let j = 0; j < kk; j++) {
        const d = dist2(points, i, centers, j);
        if (d < bd) {
          bd = d;
          bj = j;
        }
      }
      if (assign[i] !== bj) changed++;
      assign[i] = bj;
    }
    const sums = new Float64Array(kk * 3);
    counts.fill(0);
    for (let i = 0; i < m; i++) {
      const j = assign[i];
      counts[j] += weights[i];
      for (let d = 0; d < 3; d++) sums[j * 3 + d] += points[i * 3 + d] * weights[i];
    }
    for (let j = 0; j < kk; j++) if (counts[j] > 0) for (let d = 0; d < 3; d++) centers[j * 3 + d] = sums[j * 3 + d] / counts[j];
    if (!changed) break;
  }
  return { centers: centers.subarray(0, kk * 3), assign, counts, k: kk };
}

const isPaper = (L, a, b) => L > 70 && a * a + b * b < 144;

// 基準色に近いか、白い紙とその影（明るくて色みが薄い）なら背景として広げる
function flood(bg, seeds, lab, W, H, ref, tol2, paperRule) {
  const ok = (j) => {
    const L = lab[j * 3];
    const a = lab[j * 3 + 1];
    const b = lab[j * 3 + 2];
    return (L - ref[0]) ** 2 + (a - ref[1]) ** 2 + (b - ref[2]) ** 2 < tol2 || (paperRule && isPaper(L, a, b));
  };
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  for (const s of seeds) {
    if (bg[s] || !ok(s)) continue;
    bg[s] = 1;
    queue[tail++] = s;
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % W;
    const y = (p - x) / W;
    const visit = (q) => {
      if (!bg[q] && ok(q)) {
        bg[q] = 1;
        queue[tail++] = q;
      }
    };
    if (x > 0) visit(p - 1);
    if (x < W - 1) visit(p + 1);
    if (y > 0) visit(p - W);
    if (y < H - 1) visit(p + W);
  }
}

function backgroundMask(img, lab, tolerance, bgSeeds) {
  const { width: W, height: H, data } = img;
  const n = W * H;
  const bg = new Uint8Array(n);
  const tol2 = tolerance * tolerance;
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 128) transparent++;
  if (transparent >= n * 0.02) {
    for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 128) bg[i] = 1;
  } else {
    const border = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) border.push(y * W + x);
    const hist = histogram(lab, data, border);
    const km = kmeans(hist.points, hist.weights, 3);
    let pick = 0;
    for (let c = 1; c < km.k; c++) if (km.counts[c] > km.counts[pick]) pick = c;
    let ref;
    if (km.counts[pick] >= border.length * 0.3) ref = Array.from(km.centers.subarray(pick * 3, pick * 3 + 3));
    else {
      let top = 0;
      for (let b = 1; b < hist.weights.length; b++) if (hist.weights[b] > hist.weights[top]) top = b;
      ref = Array.from(hist.points.subarray(top * 3, top * 3 + 3));
    }
    flood(bg, border, lab, W, H, ref, tol2, true);
  }
  // タップで消す所は、その点の色を基準にする。白っぽい点のときだけ「白い紙」の決まりも使う
  // （ほっぺを消したいのに、つながった白い顔まで消えないように）
  for (const s of bgSeeds) {
    const x = Math.max(0, Math.min(W - 1, Math.floor(s.x)));
    const y = Math.max(0, Math.min(H - 1, Math.floor(s.y)));
    const i = y * W + x;
    if (bg[i]) continue;
    const ref = [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]];
    flood(bg, [i], lab, W, H, ref, tol2, isPaper(ref[0], ref[1], ref[2]));
  }
  return bg;
}

function majority(labels, w, h, maxLabel) {
  const out = labels.slice();
  const cnt = new Int32Array(maxLabel + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const cur = labels[i];
      if (!cur) continue;
      cnt.fill(0);
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const v = labels[ny * w + nx];
          if (v) cnt[v]++;
        }
      }
      let best = cur;
      for (let v = 1; v <= maxLabel; v++) if (cnt[v] > cnt[best]) best = v;
      out[i] = best;
    }
  }
  labels.set(out);
}

// 細い黒線は、切れる太さまで太らせる。前景の外には広げない
function dilate(labels, w, h, target, radius) {
  for (let s = 0; s < radius; s++) {
    const nb = s % 2 === 0 ? N4 : N8;
    const add = [];
    for (let i = 0; i < w * h; i++) {
      if (!labels[i] || labels[i] === target) continue;
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of nb) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && labels[ny * w + nx] === target) {
          add.push(i);
          break;
        }
      }
    }
    for (const i of add) labels[i] = target;
  }
}

// 小さすぎて切れない島は、いちばん長く接している層へ移す。どこにも接していなければ土台へ
function absorbSmall(labels, w, h, minPx, baseLabel) {
  for (let pass = 0; pass < 6; pass++) {
    const { comp, list } = components(labels, w, h, { conn: 8, same: true });
    const small = list.filter((c) => c.area < minPx).sort((a, b) => a.area - b.area || a.id - b.id);
    let changed = false;
    for (const c of small) {
      const touch = new Map();
      const pixels = [];
      for (let y = c.y0; y <= c.y1; y++) {
        for (let x = c.x0; x <= c.x1; x++) {
          const i = y * w + x;
          if (comp[i] !== c.id) continue;
          pixels.push(i);
          for (const [dx, dy] of N4) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const v = labels[ny * w + nx];
            if (v && v !== labels[i] && comp[ny * w + nx] !== c.id) touch.set(v, (touch.get(v) || 0) + 1);
          }
        }
      }
      let best = 0;
      let bestN = 0;
      for (const [v, k] of touch) {
        if (k > bestN || (k === bestN && v < best)) {
          best = v;
          bestN = k;
        }
      }
      if (!best && c.value !== baseLabel) best = baseLabel;
      if (!best || best === labels[pixels[0]]) continue;
      for (const i of pixels) labels[i] = best;
      changed = true;
    }
    if (!changed) return;
  }
}

function nearestFamily(center) {
  let best = 'white';
  let bd = Infinity;
  for (const [id, fam] of Object.entries(FAMILIES)) {
    for (const lab of fam.labs) {
      const d = (center[0] - lab[0]) ** 2 + (center[1] - lab[1]) ** 2 + (center[2] - lab[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
  }
  return best;
}

export function analyze(img, opts = {}) {
  const { difficulty = 'normal', tolerance = 14, bgSeeds = [], box = 'school' } = opts;
  const conf = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const { width: W, height: H, data } = img;
  const n = W * H;
  const lab = toLab(data, n);
  const bg = backgroundMask(img, lab, tolerance, bgSeeds);

  let fgCount = 0;
  for (let i = 0; i < n; i++) if (!bg[i]) fgCount++;
  if (fgCount < n * 0.02) return { error: 'no-foreground' };

  // 紙のしみのような小さな点は、キャラの一部にしない（外形のご飯に余計な粒が出るため）
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = bg[i] ? 0 : 1;
  const { comp, list } = components(fg, W, H, { conn: 8 });
  const boxOf = (cs) => cs.reduce((b, c) => ({ x0: Math.min(b.x0, c.x0), y0: Math.min(b.y0, c.y0), x1: Math.max(b.x1, c.x1), y1: Math.max(b.y1, c.y1) }), { x0: W, y0: H, x1: -1, y1: -1 });
  const speck = n * 0.0005;
  const big = list.filter((c) => c.area >= speck);
  if (!big.length) return { error: 'no-foreground' };
  const rough = boxOf(big);
  const roughScale = opts.mmPerPx ?? fitScale(rough.x1 - rough.x0 + 1, rough.y1 - rough.y0 + 1, box).mmPerPx;
  const minKeep = Math.max(speck, conf.minMm2 / roughScale ** 2);
  let kept = list.filter((c) => c.area >= minKeep);
  if (!kept.length) kept = [big.reduce((a, b) => (b.area > a.area ? b : a))];
  const keep = new Uint8Array(list.length);
  let keptPx = 0;
  for (const c of kept) {
    keep[c.id] = 1;
    keptPx += c.area;
  }
  if (keptPx < n * 0.02) return { error: 'no-foreground' };

  const bb = boxOf(kept);
  const w = bb.x1 - bb.x0 + 1;
  const h = bb.y1 - bb.y0 + 1;
  const mmPerPx = opts.mmPerPx ?? fitScale(w, h, box).mmPerPx;
  const minPx = conf.minMm2 / (mmPerPx * mmPerPx);

  const fgIdx = new Int32Array(keptPx);
  let t = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (bb.y0 + y) * W + bb.x0 + x;
      if (!bg[si] && keep[comp[si]]) fgIdx[t++] = si;
    }
  }

  const hist = histogram(lab, data, fgIdx);
  const km = kmeans(hist.points, hist.weights, conf.k);
  const famOfCluster = [];
  for (let c = 0; c < km.k; c++) famOfCluster.push(nearestFamily(km.centers.subarray(c * 3, c * 3 + 3)));
  const families = [...new Set(famOfCluster)];
  const labels = new Uint8Array(w * h);
  for (let s = 0; s < fgIdx.length; s++) {
    const si = fgIdx[s];
    const x = (si % W) - bb.x0;
    const y = Math.floor(si / W) - bb.y0;
    labels[y * w + x] = families.indexOf(famOfCluster[km.assign[hist.pixelBin[s]]]) + 1;
  }

  // 層の見本の色は、その系統にまとめた色の平均（画素数で重みづけ）
  const colorOf = families.map((fam) => {
    const acc = [0, 0, 0];
    let wsum = 0;
    for (let c = 0; c < km.k; c++) {
      if (famOfCluster[c] !== fam) continue;
      for (let d = 0; d < 3; d++) acc[d] += km.centers[c * 3 + d] * km.counts[c];
      wsum += km.counts[c];
    }
    return labToHex(acc.map((v) => v / Math.max(1, wsum)));
  });

  const maxLabel = families.length;
  const blackLabel = families.indexOf('black') + 1;
  if (difficulty === 'easy' && blackLabel) dilate(labels, w, h, blackLabel, Math.max(1, Math.round(0.8 / mmPerPx)));
  majority(labels, w, h, maxLabel);
  majority(labels, w, h, maxLabel);
  const areas = new Int32Array(maxLabel + 1);
  for (let i = 0; i < w * h; i++) areas[labels[i]]++;
  let baseLabel = 1;
  for (let v = 2; v <= maxLabel; v++) if (areas[v] > areas[baseLabel]) baseLabel = v;
  absorbSmall(labels, w, h, minPx, baseLabel);

  // 層の番号は面積の大きい順に振り直す（1がいちばん広い＝土台になる層）
  areas.fill(0);
  for (let i = 0; i < w * h; i++) areas[labels[i]]++;
  const order = [];
  for (let v = 1; v <= maxLabel; v++) if (areas[v] > 0) order.push(v);
  order.sort((a, b) => areas[b] - areas[a] || a - b);
  const remap = new Uint8Array(maxLabel + 1);
  order.forEach((v, idx) => {
    remap[v] = idx + 1;
  });
  let foregroundPx = 0;
  for (let i = 0; i < w * h; i++) {
    labels[i] = remap[labels[i]];
    if (labels[i]) foregroundPx++;
  }
  const layers = order.map((v, idx) => ({ id: idx + 1, family: families[v - 1], colorHex: colorOf[v - 1], areaPx: areas[v] }));

  return {
    width: w,
    height: h,
    labels,
    layers,
    foregroundPx,
    bbox: { x: bb.x0, y: bb.y0, w, h },
    source: { width: W, height: H },
    mmPerPx,
    difficulty: conf.id,
    tolerance,
  };
}
