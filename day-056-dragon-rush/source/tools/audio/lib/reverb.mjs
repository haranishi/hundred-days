// OWNER: audio-tools
// 合成のインパルス応答（残響の素）。街の響きを「近・中・遠」の3種と、曲用のホールで作る。
// 作り方：帯域ごとに減衰の速さが違う雑音（高い音ほど早く消える）＋初期反射（壁や建物の面からの少数の跳ね返り）
// ＋遠い型だけ離れた建物や山からの遅れた反射。左右は別の雑音にして広がりを出し、エネルギーを 1 に揃える。
import { Biquad, SR, filt, len, onePoleLp, smooth } from './dsp.mjs';

/** 型ごとの値。rt60 は [低域 <300Hz, 中域, 高域 >3kHz] の残響時間（秒）。 */
export const IR_SPECS = {
  near: { seconds: 1.8, predelay: 0.01, rt60: [1.35, 1.05, 0.5], early: { count: 16, from: 0.006, to: 0.09 }, buildup: 0.03, width: 0.75, lowpass: 9000, echoes: [] },
  mid: { seconds: 3.2, predelay: 0.03, rt60: [2.6, 1.9, 0.85], early: { count: 12, from: 0.025, to: 0.19 }, buildup: 0.09, width: 0.9, lowpass: 6000, echoes: [{ t: 0.42, gain: 0.35, lp: 3000 }] },
  far: {
    seconds: 4.6,
    predelay: 0.08,
    rt60: [3.9, 3.0, 1.1],
    early: { count: 6, from: 0.07, to: 0.3 },
    buildup: 0.28,
    width: 1,
    lowpass: 3200,
    echoes: [
      { t: 0.36, gain: 0.5, lp: 2200 },
      { t: 0.83, gain: 0.42, lp: 1600 },
      { t: 1.45, gain: 0.3, lp: 1100 },
    ],
  },
  hall: { seconds: 3.4, predelay: 0.022, rt60: [2.9, 2.35, 1.35], early: { count: 14, from: 0.009, to: 0.085 }, buildup: 0.045, width: 0.92, lowpass: 12000, echoes: [] },
};

function decayBand(noise, rt60, lo, hi) {
  const b = Float32Array.from(noise);
  if (lo) filt(b, [['hp', lo, 0.707], ['hp', lo, 0.707]]);
  if (hi) filt(b, [['lp', hi, 0.707], ['lp', hi, 0.707]]);
  const k = -6.9078 / (rt60 * SR);
  for (let i = 0; i < b.length; i++) b[i] *= Math.exp(k * i);
  return b;
}

/** インパルス応答を作る（{ l, r }、各チャンネルの二乗和が 1）。 */
export function makeIR(rng, spec) {
  const n = len(spec.seconds);
  const pre = Math.round(spec.predelay * SR);
  const common = new Float32Array(n);
  for (let i = 0; i < n; i++) common[i] = rng.gauss();
  const out = {};
  for (const side of ['l', 'r']) {
    const noise = new Float32Array(n);
    const w = spec.width;
    for (let i = 0; i < n; i++) noise[i] = Math.sqrt(1 - w) * common[i] + Math.sqrt(w) * rng.gauss();
    const lo = decayBand(noise, spec.rt60[0], 0, 300);
    const mid = decayBand(noise, spec.rt60[1], 300, 3000);
    const hi = decayBand(noise, spec.rt60[2], 3000, 0);
    const ch = new Float32Array(n);
    const build = Math.max(1, Math.round(spec.buildup * SR));
    for (let i = pre; i < n; i++) {
      const j = i - pre;
      ch[i] = (lo[j] + mid[j] + hi[j]) * 0.5 * smooth(j / build);
    }
    // 初期反射：面ごとに吸われ方が違うので、跳ね返りごとに高域の落ち方を変える
    const early = new Float32Array(n);
    for (let k = 0; k < spec.early.count; k++) {
      const t = rng.range(spec.early.from, spec.early.to);
      const idx = Math.round(t * SR) + (side === 'r' ? rng.int(0, 40) : 0);
      if (idx >= n) continue;
      const g = (rng.chance(0.5) ? 1 : -1) * rng.range(0.5, 1) * (1 - (t - spec.early.from) / (spec.early.to - spec.early.from + 1e-9)) * 3;
      const tap = new Float32Array(Math.min(n - idx, 256));
      tap[0] = g;
      onePoleLp(tap, rng.range(1800, 7000));
      for (let i = 0; i < tap.length; i++) early[idx + i] += tap[i];
    }
    // 遅れた反射（遠い建物・山）：短い雑音の塊を、遠いほど高域を落として置く
    for (const e of spec.echoes) {
      const idx = Math.round((e.t + rng.range(-0.02, 0.02)) * SR);
      const m = Math.min(n - idx, len(0.12));
      if (m <= 0) continue;
      const burst = new Float32Array(m);
      for (let i = 0; i < m; i++) burst[i] = rng.gauss() * Math.exp(-i / (0.03 * SR));
      filt(burst, [['lp', e.lp, 0.707]]);
      const decay = Math.exp((-6.9078 * e.t) / spec.rt60[1]);
      for (let i = 0; i < m; i++) early[idx + i] += burst[i] * e.gain * 4 * Math.max(0.25, decay);
    }
    for (let i = 0; i < n; i++) ch[i] += early[i];
    new Biquad().lp(spec.lowpass, 0.707).run(ch);
    new Biquad().hp(28, 0.707).run(ch);
    const fade = Math.round(n * 0.12);
    for (let i = 0; i < fade; i++) ch[n - 1 - i] *= smooth(i / fade);
    let e2 = 0;
    for (let i = 0; i < n; i++) e2 += ch[i] * ch[i];
    const g = 1 / Math.sqrt(e2 || 1);
    for (let i = 0; i < n; i++) ch[i] *= g;
    out[side] = ch;
  }
  return out;
}
