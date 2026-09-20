/* 筆づかい。1画を「入り・送り・終わり」に分けて太さを変える。

   終わり方は KanjiVG の kvg:type（画の種別）から決める。種別は CJK の画を表す
   文字（㇐ 横・㇑ 縦・㇒ 左払い…）で、末尾の a/b/c/v や `/` のあとは形の細かい
   違いなので、先頭の1文字だけを見る。 */

/* 細く抜く（払い・提） */
const TAPER = new Set(['㇒', '㇓', '㇖', '㇛', '㇜', '㇀', '㇇', '㇗']);
/* 跳ねる（かぎのある画） */
const HOOK = new Set(['㇆', '㇚', '㇟', '㇁', '㇂', '㇃', '㇈', '㇉', '㇋', '㇞', '㇡']);
/* 右払い（捺）。送りで太らせてから抜く */
const SWEEP = new Set(['㇏']);

export function endingOf(type) {
  const head = type ? [...String(type)][0] : '';
  if (SWEEP.has(head)) return 'sweep';
  if (TAPER.has(head)) return 'taper';
  if (HOOK.has(head)) return 'hook';
  return 'stop';
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
/* 端をなめらかにつなぐ */
const ease = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/* u は画の道のりの位置（0〜1）。戻り値は基準の太さに対する倍率。 */
export function widthAt(u, ending) {
  const t = clamp01(u);
  /* 入り：筆を下ろしてから太さが出るまで */
  const entry = lerp(0.42, 1, ease(t / 0.14));
  if (ending === 'taper') {
    if (t < 0.14) return entry;
    if (t < 0.46) return 1;
    return lerp(1, 0.05, ease((t - 0.46) / 0.54));
  }
  if (ending === 'hook') {
    if (t < 0.14) return entry;
    if (t < 0.78) return 1;
    return lerp(1, 0.14, ease((t - 0.78) / 0.22));
  }
  if (ending === 'sweep') {
    /* 捺：細く入って太らせ、最後に抜く */
    if (t < 0.28) return lerp(0.3, 0.86, ease(t / 0.28));
    if (t < 0.82) return lerp(0.86, 1.3, ease((t - 0.28) / 0.54));
    return lerp(1.3, 0.24, ease((t - 0.82) / 0.18));
  }
  /* とめ：太さを保ったまま止める。送りの半ばだけわずかに太らせる */
  if (t < 0.14) return entry;
  return 1 + 0.06 * Math.sin(Math.PI * ((t - 0.14) / 0.86));
}

function normalAt(points, i) {
  const a = points[Math.max(0, i - 1)];
  const b = points[Math.min(points.length - 1, i + 1)];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

/* 画の端の丸み。輪郭は「始点の帽子 → 左側 → 終点の帽子 → 右側（逆順）」の順に
   つなぐので、帽子の円弧も同じ回り方にする。逆に回すと形が自分と交差して、
   先端に白い切れ目が入る。 */
function cap(out, center, normal, radius, forward) {
  if (radius < 0.15) {
    out.push(center);
    return;
  }
  const base = Math.atan2(normal[1], normal[0]);
  for (let k = 1; k <= 5; k++) {
    const a = forward ? base - (Math.PI * k) / 6 : base + Math.PI * (1 - k / 6);
    out.push([center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius]);
  }
}

/* 画の 0〜progress までを、太さの変わる輪郭（多角形）にする。Canvas の stroke は
   1本の線の中で太さを変えられないので、塗りの形として組む。 */
export function strokeOutline(points, ending, baseWidth, progress = 1) {
  const p = clamp01(progress);
  if (points.length < 2 || p <= 0) return [];
  const lastIndex = (points.length - 1) * p;
  const whole = Math.floor(lastIndex);
  const frac = lastIndex - whole;

  const drawn = points.slice(0, whole + 1);
  if (frac > 0 && whole + 1 < points.length) {
    drawn.push([
      lerp(points[whole][0], points[whole + 1][0], frac),
      lerp(points[whole][1], points[whole + 1][1], frac),
    ]);
  }
  if (drawn.length < 2) return [];

  const left = [];
  const right = [];
  for (let i = 0; i < drawn.length; i++) {
    /* 太さは「画全体のどこか」で決める。途中まで描いた画も、書き終わった画と
       同じ位置なら同じ太さになる。 */
    const u = (p * i) / (drawn.length - 1);
    const w = (baseWidth * widthAt(u, ending)) / 2;
    const n = normalAt(drawn, i);
    left.push([drawn[i][0] + n[0] * w, drawn[i][1] + n[1] * w]);
    right.push([drawn[i][0] - n[0] * w, drawn[i][1] - n[1] * w]);
  }

  const out = [];
  cap(out, drawn[0], normalAt(drawn, 0), (baseWidth * widthAt(0, ending)) / 2, false);
  out.push(...left);
  const endIndex = drawn.length - 1;
  cap(out, drawn[endIndex], normalAt(drawn, endIndex), (baseWidth * widthAt(p, ending)) / 2, true);
  for (let i = right.length - 1; i >= 0; i--) out.push(right[i]);
  return out;
}

/* 画の書き始めに置く番号の位置。画が来る向きと逆へ少し逃がす。 */
export function numberAnchor(points, offset = 9) {
  if (!points.length) return [0, 0];
  const a = points[0];
  const b = points[Math.min(points.length - 1, 3)];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [a[0] - (dx / len) * offset, a[1] - (dy / len) * offset];
}
