// スコアの数字は、太いペンで一筆書きしたような丸い線をコードで描く。
// 角ばった縁取り数字（原作の見た目）に寄せないため、線の端も角もすべて丸める
const SIX = [
  ['M', 0.46, 0.15],
  ['C', 0.28, 0.08, 0.1, 0.28, 0.1, 0.6],
  ['C', 0.1, 0.8, 0.21, 0.88, 0.32, 0.88],
  ['C', 0.46, 0.88, 0.53, 0.77, 0.53, 0.65],
  ['C', 0.53, 0.51, 0.43, 0.44, 0.32, 0.44],
  ['C', 0.22, 0.44, 0.13, 0.5, 0.11, 0.58],
];

const rotate180 = (cmds) =>
  cmds.map(([op, ...v]) => [op, ...v.map((n, i) => (i % 2 === 0 ? 0.6 - n : 1 - n))]);

const GLYPHS = {
  0: [['E', 0.3, 0.5, 0.19, 0.37]],
  1: [['M', 0.13, 0.27], ['L', 0.3, 0.13], ['L', 0.3, 0.87]],
  2: [['M', 0.11, 0.3], ['C', 0.12, 0.08, 0.5, 0.07, 0.5, 0.31], ['C', 0.5, 0.48, 0.28, 0.6, 0.11, 0.87], ['L', 0.51, 0.87]],
  3: [['M', 0.12, 0.2], ['C', 0.26, 0.06, 0.52, 0.12, 0.49, 0.3], ['C', 0.47, 0.43, 0.34, 0.47, 0.26, 0.47], ['C', 0.42, 0.47, 0.54, 0.55, 0.52, 0.69], ['C', 0.49, 0.9, 0.2, 0.92, 0.1, 0.77]],
  4: [['M', 0.4, 0.87], ['L', 0.4, 0.13], ['L', 0.08, 0.63], ['L', 0.54, 0.63]],
  5: [['M', 0.5, 0.13], ['L', 0.18, 0.13], ['L', 0.15, 0.45], ['C', 0.32, 0.36, 0.54, 0.43, 0.53, 0.63], ['C', 0.52, 0.88, 0.22, 0.93, 0.1, 0.78]],
  6: SIX,
  7: [['M', 0.08, 0.13], ['L', 0.52, 0.13], ['C', 0.38, 0.33, 0.28, 0.6, 0.27, 0.87]],
  8: [['E', 0.31, 0.3, 0.155, 0.16], ['E', 0.31, 0.665, 0.2, 0.205]],
  9: rotate180(SIX),
};

const ADVANCE = { 1: 0.46 };
const DEFAULT_ADVANCE = 0.64;

export function numberWidth(value, h) {
  return String(value)
    .split('')
    .reduce((w, ch) => w + (ADVANCE[ch] ?? DEFAULT_ADVANCE) * h, 0);
}

function tracePath(ctx, str, x0, y0, h) {
  let x = x0;
  for (const ch of str) {
    const g = GLYPHS[ch];
    const adv = (ADVANCE[ch] ?? DEFAULT_ADVANCE) * h;
    const ox = x + (adv - 0.6 * h) / 2;
    const X = (v) => ox + v * h;
    const Y = (v) => y0 + v * h;
    if (g) {
      for (const [op, ...v] of g) {
        if (op === 'M') ctx.moveTo(X(v[0]), Y(v[1]));
        else if (op === 'L') ctx.lineTo(X(v[0]), Y(v[1]));
        else if (op === 'C') ctx.bezierCurveTo(X(v[0]), Y(v[1]), X(v[2]), Y(v[3]), X(v[4]), Y(v[5]));
        else if (op === 'E') {
          ctx.moveTo(X(v[0] + v[2]), Y(v[1]));
          ctx.ellipse(X(v[0]), Y(v[1]), v[2] * h, v[3] * h, 0, 0, Math.PI * 2);
        }
      }
    }
    x += adv;
  }
}

/** x は align に応じた基準（center なら中央）、y は数字の上端、h は高さ */
export function drawNumber(ctx, value, x, y, h, opts = {}) {
  const {
    align = 'center',
    fill = '#fffaf0',
    shade = '#f3cf97',
    outline = '#4b2e2a',
    shadow = 'rgba(60,30,40,0.35)',
  } = opts;
  const str = String(Math.max(0, Math.floor(value)));
  const w = numberWidth(str, h);
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pass = (dx, dy, lw, color) => {
    ctx.beginPath();
    tracePath(ctx, str, x0 + dx, y + dy, h);
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  pass(0, h * 0.07, h * 0.38, shadow);
  pass(0, 0, h * 0.37, outline);
  pass(0, h * 0.025, h * 0.21, shade);
  pass(0, -h * 0.012, h * 0.17, fill);
  ctx.restore();
  return w;
}
