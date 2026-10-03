// OWNER: audio-tools
// 音の合成の部品のうち、発振器（帯域を制限したのこぎり波・矩形波・正弦・下降する正弦）と雑音（白・ピンク・ブラウン・ゆらぎ）。
// 周波数は数か標本ごとの配列（Hz）。乱数は呼ぶ側が rng.mjs の系列を渡す。dsp.mjs からも同じ名前で読める。
import { SR, TAU, smooth } from './dsp.mjs';

// ---------------------------------------------------------------- 発振器

function polyBlep(t, dt) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

const at = (f, i) => (typeof f === 'number' ? f : f[i]);

/** 帯域を制限したのこぎり波（PolyBLEP）。freq は数か標本ごとの配列（Hz）。 */
export function saw(n, freq, phase = 0) {
  const out = new Float32Array(n);
  let p = phase;
  for (let i = 0; i < n; i++) {
    const dt = at(freq, i) / SR;
    out[i] = 2 * p - 1 - polyBlep(p, dt);
    p += dt;
    if (p >= 1) p -= 1;
  }
  return out;
}

/** 帯域を制限した矩形波（デューティ比 duty）。 */
export function pulse(n, freq, duty = 0.5, phase = 0) {
  const out = new Float32Array(n);
  let p = phase;
  for (let i = 0; i < n; i++) {
    const dt = at(freq, i) / SR;
    let v = p < duty ? 1 : -1;
    v += polyBlep(p, dt);
    let q = p - duty;
    if (q < 0) q += 1;
    v -= polyBlep(q, dt);
    out[i] = v;
    p += dt;
    if (p >= 1) p -= 1;
  }
  return out;
}

export function sine(n, freq, phase = 0) {
  const out = new Float32Array(n);
  let p = phase;
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin(TAU * p);
    p += at(freq, i) / SR;
    if (p >= 1) p -= 1;
  }
  return out;
}

/** 周波数が f0 から f1 へ指数で下がる（時定数 tau 秒）正弦。重い衝撃の「圧」の芯に使う。 */
export function sweepSine(n, f0, f1, tau, phase = 0) {
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = f1 + (f0 - f1) * Math.exp(-i / (tau * SR));
  return sine(n, f, phase);
}

// ---------------------------------------------------------------- 雑音

export function white(rng, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.bi();
  return out;
}

/** ピンク雑音の近似。独立した白雑音を14段の2進間隔で保持し、等重みで足す独自実装。 */
export function pink(rng, n) {
  const out = new Float32Array(n);
  const held = new Float64Array(14);
  for (let row = 0; row < held.length; row++) held[row] = rng.bi();
  let sum = held.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) {
    // 周期ごとに更新する1段を、時刻の2進桁から直接選ぶ。
    let tick = i + 1, row = 0;
    while ((tick & 1) === 0 && row < held.length - 1) { tick >>>= 1; row++; }
    const next = rng.bi();
    sum += next - held[row];
    held[row] = next;
    out[i] = (sum + rng.bi()) / 9;
  }
  return out;
}

/** ブラウン雑音（漏れのある積分）。低い地鳴りの素。 */
export function brown(rng, n) {
  const out = new Float32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = v * 0.998 + rng.bi() * 0.06;
    out[i] = v;
  }
  return out;
}

/** 滑らかにゆらぐ値の列（ランダムな点を rate Hz で置き、その間を滑らかにつなぐ）。 */
export function wander(rng, n, rate, lo = -1, hi = 1) {
  const out = new Float32Array(n);
  const step = Math.max(1, Math.round(SR / rate));
  let a = rng.range(lo, hi);
  let b = rng.range(lo, hi);
  for (let i = 0; i < n; i++) {
    const k = i % step;
    if (k === 0 && i > 0) {
      a = b;
      b = rng.range(lo, hi);
    }
    out[i] = a + (b - a) * smooth(k / step);
  }
  return out;
}
