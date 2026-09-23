// 読みの輪・差分の札・読みの軌跡を画面に出す形へ直す小さな関数。DOM に触れないので単体テストで確かめられる。
// 読みの値（0〜1）と水晶玉に映す料理は lib/oracle.js の reading() が出す。ここは見せ方だけを受け持つ。

// 軌跡の SVG の大きさ。横は答えた問数に応じて使う。25問ぶんの目盛りに置くと、序盤の点が左端に固まって数珠に見えた。
// ただし2〜3点で全幅に引き伸ばすと1本の長い線になるので、8問までは同じ間隔で左から伸ばし、そのあとは全幅に収める
export const TRAIL = Object.freeze({ width: 120, height: 20, pad: 3, minSlots: 8 });

function clamp01(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

// 画面の「63%」。差分もこの丸めた値どうしで取る（49%→63% の札が「+14%」になり、表示と食い違わない）
export function percent(value) {
  return Math.round(clamp01(value) * 100);
}

// 前回の表示からの差（ポイント）。前回が無い（0問目）ときは null
export function delta(previous, next) {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null;
  return percent(next) - percent(previous);
}

export function direction(change) {
  if (change === null || change === undefined) return null;
  if (change > 0) return 'up';
  return change < 0 ? 'down' : 'flat';
}

// 差分の札。色だけに頼らないよう、矢印と符号を付ける（下がったときは全角のマイナス記号）
export function deltaLabel(change) {
  if (change === null || change === undefined) return '';
  if (change > 0) return `↑ +${change}%`;
  if (change < 0) return `↓ −${-change}%`;
  return '±0%';
}

// 読み上げる一文。輪そのものは読み上げから外すので、値と上下はここで言葉にする
export function readingSpeech(value, change = null) {
  const head = `読み ${percent(value)}%`;
  if (change === null || change === undefined) return head;
  if (change > 0) return `${head}、${change}ポイント上がりました`;
  if (change < 0) return `${head}、${-change}ポイント下がりました`;
  return `${head}、変わりません`;
}

// 読みの軌跡の点。entries は [{ v: 読みの値, id: 映していた料理 }] で、entries[0] は答える前の読み。
// entries[0] は点にしない（1問目が上がったか・入れ替わったかを比べるためだけに使う）ので、点の数＝答えた問数になる。
// dropped：前の点より下がった（表示の%で比べる）。switched：最有力の料理が前の点から入れ替わった
export function trailPoints(entries, { width = TRAIL.width, height = TRAIL.height, pad = TRAIL.pad, minSlots = TRAIL.minSlots } = {}) {
  if (!Array.isArray(entries) || entries.length < 2) return [];
  const span = Math.max(1, Math.max(minSlots, entries.length - 1) - 1);
  const stepX = (width - pad * 2) / span;
  const rangeY = height - pad * 2;
  const round = value => Math.round(value * 100) / 100;
  const points = [];
  for (let i = 1; i < entries.length; i++) {
    const value = clamp01(entries[i]?.v);
    const before = entries[i - 1] ?? {};
    const id = entries[i]?.id ?? null;
    points.push({
      index: i,
      value,
      x: round(pad + (i - 1) * stepX),
      y: round(pad + (1 - value) * rangeY),
      dropped: percent(value) < percent(before.v),
      switched: id !== null && id !== (before.id ?? null),
    });
  }
  return points;
}

// 軌跡の折れ線（<polyline points>）
export function trailLine(points) {
  return points.map(point => `${point.x},${point.y}`).join(' ');
}
