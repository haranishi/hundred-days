// 効果音のレシピ（SfxName の全部）。音源ファイルは使わず、synth.ts の部品を組み合わせて作る。
// p は音程の倍率（1＝そのまま）。打つ音は毎回少し音程をずらし、同じ音の繰り返しに聞こえないようにする。
// Record<SfxName, …> なので、SfxName に名前が増えたら型の検査で漏れがわかる。

import type { SfxName } from '../../shared/view';
import { SILENT, held, midiToHz, noiseBuffer, noiseHit, partials, tone } from './synth';

export interface SfxRecipe {
  /** 鳴り終わるまでの長さ（秒）。同時に鳴る数の計算に使う */
  dur: number;
  play(ctx: BaseAudioContext, out: AudioNode, t: number, p: number): void;
}

/** ±4% のゆらぎ */
const wobble = (): number => 1 + (Math.random() - 0.5) * 0.08;

function thud(ctx: BaseAudioContext, out: AudioNode, t: number, f: number, peak: number): void {
  tone(ctx, out, { type: 'sine', freq: f, freqEnd: f * 0.4, t, attack: 0.002, decay: 0.14, peak });
  noiseHit(ctx, out, { t, decay: 0.06, peak: peak * 0.6, filter: 'lowpass', freq: 900, q: 0.8 });
}

function canHit(ctx: BaseAudioContext, out: AudioNode, t: number, base: number, k: number): void {
  partials(ctx, out, {
    t,
    base,
    ratios: [1, 1.52, 2.33, 3.17, 4.1],
    decays: [0.34 * k, 0.27 * k, 0.21 * k, 0.15 * k, 0.11 * k],
    peaks: [0.1, 0.075, 0.06, 0.045, 0.035],
  });
  noiseHit(ctx, out, { t, decay: 0.02, peak: 0.08, filter: 'highpass', freq: 3500 });
}

/** 明るい音の連なり（ファンファーレ用）。三角波に、弱い矩形波を重ねて金管っぽく */
function brassNote(ctx: BaseAudioContext, out: AudioNode, t: number, midi: number, decay: number, peak: number): void {
  const f = midiToHz(midi);
  tone(ctx, out, { type: 'triangle', freq: f, t, attack: 0.008, decay, peak });
  tone(ctx, out, { type: 'square', freq: f, t, attack: 0.008, decay: decay * 0.6, peak: peak * 0.18 });
}

/** ビブラートのかかった音（泣き声・トロンボーン） */
function wail(
  ctx: BaseAudioContext,
  out: AudioNode,
  spec: { t: number; freq: number; freqEnd: number; length: number; peak: number; rate: number; depth: number; cutoff: number },
): void {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(spec.freq, spec.t);
  o.frequency.exponentialRampToValueAtTime(spec.freqEnd, spec.t + spec.length);
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(spec.rate, spec.t);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(spec.depth, spec.t);
  lfo.connect(depth).connect(o.detune);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(spec.cutoff, spec.t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, spec.t);
  g.gain.exponentialRampToValueAtTime(spec.peak, spec.t + 0.03);
  g.gain.setValueAtTime(spec.peak, spec.t + spec.length * 0.7);
  g.gain.exponentialRampToValueAtTime(SILENT, spec.t + spec.length);
  o.connect(lp).connect(g).connect(out);
  o.start(spec.t);
  lfo.start(spec.t);
  o.stop(spec.t + spec.length + 0.05);
  lfo.stop(spec.t + spec.length + 0.05);
}

export const SFX: Record<SfxName, SfxRecipe> = {
  // 商品が落ちる「ゴトッ」
  knock: {
    dur: 0.2,
    play(ctx, out, t, p) {
      const w = wobble() * p;
      tone(ctx, out, { type: 'sine', freq: 150 * w, freqEnd: 58 * w, t, attack: 0.002, decay: 0.14, peak: 0.42 });
      tone(ctx, out, { type: 'triangle', freq: 330 * w, freqEnd: 170 * w, t, attack: 0.001, decay: 0.06, peak: 0.14 });
      noiseHit(ctx, out, { t, decay: 0.07, peak: 0.26, filter: 'bandpass', freq: 750 * w, q: 1.2 });
    },
  },
  // 缶「カラン」：打って、小さく跳ねてもう一度
  can: {
    dur: 0.45,
    play(ctx, out, t, p) {
      const base = 1250 * wobble() * p;
      canHit(ctx, out, t, base, 1);
      canHit(ctx, out, t + 0.075, base * 1.03, 0.55);
    },
  },
  // 缶ピラミッドが崩れる「ガラガラッ」
  crash: {
    dur: 0.95,
    play(ctx, out, t, p) {
      noiseHit(ctx, out, { t, decay: 0.6, peak: 0.3, filter: 'lowpass', freq: 4200 * p, freqEnd: 500, q: 0.7 });
      tone(ctx, out, { type: 'sine', freq: 95 * p, freqEnd: 40, t, attack: 0.003, decay: 0.3, peak: 0.38 });
      for (let i = 0; i < 7; i++) {
        const at = t + 0.03 + i * 0.065 + Math.random() * 0.04;
        canHit(ctx, out, at, (1050 + Math.random() * 500) * p, 0.7 - i * 0.05);
      }
    },
  },
  // 呼び出しベル「チーン」
  bell: {
    dur: 0.22,
    play(ctx, out, t, p) {
      partials(ctx, out, { t, base: 2350 * p, ratios: [1, 2.76, 5.4], decays: [0.16, 0.09, 0.04], peaks: [0.17, 0.055, 0.018] });
      noiseHit(ctx, out, { t, decay: 0.012, peak: 0.09, filter: 'highpass', freq: 5000 });
    },
  },
  // 店内放送のチャイム：4音で上がって下がる（オリジナル。実在のチャイムの並びは使わない）
  'pa-chime': {
    dur: 2.2,
    play(ctx, out, t, p) {
      [79, 83, 86, 81].forEach((m, i) => {
        const at = t + i * 0.3;
        const f = midiToHz(m) * p;
        tone(ctx, out, { type: 'sine', freq: f, t: at, attack: 0.006, decay: i === 3 ? 1.3 : 0.9, peak: 0.2 });
        tone(ctx, out, { type: 'sine', freq: f * 2, t: at, attack: 0.004, decay: 0.45, peak: 0.05 });
        tone(ctx, out, { type: 'triangle', freq: f * 4, t: at, attack: 0.002, decay: 0.12, peak: 0.02 });
      });
    },
  },
  // 試食を食べる「もぐ」
  eat: {
    dur: 0.32,
    play(ctx, out, t, p) {
      const w = wobble() * p;
      tone(ctx, out, { type: 'sine', freq: 270 * w, freqEnd: 180 * w, t, attack: 0.012, decay: 0.09, peak: 0.3 });
      noiseHit(ctx, out, { t, decay: 0.05, peak: 0.12, filter: 'bandpass', freq: 950, q: 2 });
      tone(ctx, out, { type: 'sine', freq: 215 * w, freqEnd: 140 * w, t: t + 0.13, attack: 0.012, decay: 0.1, peak: 0.3 });
      noiseHit(ctx, out, { t: t + 0.13, decay: 0.06, peak: 0.12, filter: 'bandpass', freq: 650, q: 2 });
    },
  },
  // 冷凍ケースに入る「ひゅう」
  freezer: {
    dur: 0.85,
    play(ctx, out, t, p) {
      noiseHit(ctx, out, { t, attack: 0.08, decay: 0.65, peak: 0.28, filter: 'bandpass', freq: 1900 * p, freqEnd: 650, q: 3 });
      tone(ctx, out, { type: 'sine', freq: 1500 * p, freqEnd: 900 * p, t, attack: 0.12, decay: 0.5, peak: 0.03 });
    },
  },
  // 滑る「つるっ」→ すてん
  slip: {
    dur: 0.5,
    play(ctx, out, t, p) {
      tone(ctx, out, { type: 'sine', freq: 480 * p, freqEnd: 1750 * p, t, attack: 0.006, decay: 0.22, peak: 0.2 });
      thud(ctx, out, t + 0.25, 125 * p, 0.38);
    },
  },
  // 駄々をこねる：床をばたばた＋「えーん」
  tantrum: {
    dur: 0.75,
    play(ctx, out, t, p) {
      for (let i = 0; i < 6; i++) {
        tone(ctx, out, { type: 'sine', freq: (i % 2 ? 95 : 120) * p, freqEnd: 55, t: t + i * 0.09, attack: 0.002, decay: 0.07, peak: 0.3 });
      }
      wail(ctx, out, { t, freq: 560 * p, freqEnd: 430 * p, length: 0.62, peak: 0.07, rate: 7, depth: 45, cutoff: 1500 });
    },
  },
  // トイレットペーパーのピン「カコーン」
  pin: {
    dur: 0.45,
    play(ctx, out, t, p) {
      const w = wobble() * p;
      tone(ctx, out, { type: 'triangle', freq: 1650 * w, t, attack: 0.001, decay: 0.03, peak: 0.18 });
      noiseHit(ctx, out, { t, decay: 0.02, peak: 0.16, filter: 'bandpass', freq: 2600, q: 4 });
      tone(ctx, out, { type: 'sine', freq: 760 * w, t: t + 0.035, attack: 0.003, decay: 0.34, peak: 0.24 });
      tone(ctx, out, { type: 'sine', freq: 1150 * w, t: t + 0.035, attack: 0.003, decay: 0.2, peak: 0.07 });
    },
  },
  // スイカが転がる「ゴロゴロ」
  roll: {
    dur: 0.8,
    play(ctx, out, t, p) {
      for (let i = 0; i < 9; i++) {
        noiseHit(ctx, out, { t: t + i * 0.07, decay: 0.06, peak: 0.16 * (1 - i * 0.07), filter: 'lowpass', freq: 320 * p, q: 0.9 });
      }
      tone(ctx, out, { type: 'sine', freq: 72 * p, t, attack: 0.05, decay: 0.6, peak: 0.12 });
    },
  },
  // コンボが上がる：短い上昇の分散和音（段で音程が上がる。p に段の高さが入る）
  'combo-up': {
    dur: 0.32,
    play(ctx, out, t, p) {
      [0, 4, 7, 12].forEach((semi, i) => {
        const f = 880 * p * 2 ** (semi / 12);
        tone(ctx, out, { type: 'triangle', freq: f, t: t + i * 0.045, attack: 0.003, decay: 0.12, peak: 0.13 });
        tone(ctx, out, { type: 'square', freq: f, t: t + i * 0.045, attack: 0.003, decay: 0.05, peak: 0.02 });
      });
      noiseHit(ctx, out, { t: t + 0.12, decay: 0.08, peak: 0.04, filter: 'highpass', freq: 7000 });
    },
  },
  // コンボが切れる「ぷしゅ〜」
  'combo-break': {
    dur: 0.38,
    play(ctx, out, t, p) {
      tone(ctx, out, { type: 'triangle', freq: 620 * p, freqEnd: 170 * p, t, attack: 0.005, decay: 0.3, peak: 0.18 });
      noiseHit(ctx, out, { t, decay: 0.26, peak: 0.09, filter: 'lowpass', freq: 2200, freqEnd: 300 });
    },
  },
  // 点が入る「ポン」
  score: {
    dur: 0.12,
    play(ctx, out, t, p) {
      tone(ctx, out, { type: 'sine', freq: 900 * p, freqEnd: 1320 * p, t, attack: 0.003, decay: 0.08, peak: 0.16 });
      tone(ctx, out, { type: 'triangle', freq: 1800 * p, t, attack: 0.002, decay: 0.04, peak: 0.04 });
    },
  },
  // 達成のハンコ「ポン！」と小さなファンファーレ
  achieve: {
    dur: 1.05,
    play(ctx, out, t, p) {
      thud(ctx, out, t, 190 * p, 0.42);
      [72, 76, 79].forEach((m, i) => brassNote(ctx, out, t + 0.11 + i * 0.08, m + 12 * Math.log2(p), 0.16, 0.12));
      brassNote(ctx, out, t + 0.35, 84 + 12 * Math.log2(p), 0.55, 0.13);
      for (const m of [76, 79]) tone(ctx, out, { type: 'sine', freq: midiToHz(m) * p, t: t + 0.35, attack: 0.01, decay: 0.6, peak: 0.05 });
    },
  },
  // 完全制覇：大きいファンファーレとシンバル
  complete: {
    dur: 2.5,
    play(ctx, out, t, p) {
      const run = [67, 72, 76, 79, 84];
      run.forEach((m, i) => brassNote(ctx, out, t + i * 0.1, m, 0.2, 0.11));
      for (const m of [72, 76, 79, 84, 88]) brassNote(ctx, out, t + 0.55, m, 1.6, 0.06);
      noiseHit(ctx, out, { t: t + 0.55, decay: 1.4, peak: 0.1, filter: 'highpass', freq: 6000 * p });
      tone(ctx, out, { type: 'sine', freq: 98 * p, freqEnd: 70, t: t + 0.55, attack: 0.005, decay: 0.6, peak: 0.3 });
    },
  },
  // 店員が気づく「ピピッ」
  notice: {
    dur: 0.25,
    play(ctx, out, t, p) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4500, t);
      lp.connect(out);
      held(ctx, lp, { type: 'square', freq: 1976 * p, t, length: 0.06, peak: 0.075 });
      held(ctx, lp, { type: 'square', freq: 1976 * p, t: t + 0.1, length: 0.09, peak: 0.075 });
    },
  },
  // 捕まる：がっかりの「あ〜あ」（下がる3音）
  caught: {
    dur: 1.0,
    play(ctx, out, t, p) {
      const notes = [67, 64, 60];
      notes.forEach((m, i) => {
        const f = midiToHz(m) * p;
        const last = i === notes.length - 1;
        wail(ctx, out, { t: t + i * 0.2, freq: f, freqEnd: last ? f * 0.92 : f, length: last ? 0.5 : 0.17, peak: 0.12, rate: last ? 6 : 0.1, depth: last ? 35 : 0, cutoff: 1300 });
      });
    },
  },
  // 逃げ切った「ひゅっ」＋「ピコッ」
  escape: {
    dur: 0.45,
    play(ctx, out, t, p) {
      tone(ctx, out, { type: 'sine', freq: 600 * p, freqEnd: 1400 * p, t, attack: 0.004, decay: 0.14, peak: 0.18 });
      tone(ctx, out, { type: 'triangle', freq: midiToHz(84) * p, t: t + 0.16, attack: 0.003, decay: 0.12, peak: 0.15 });
      tone(ctx, out, { type: 'triangle', freq: midiToHz(91) * p, t: t + 0.25, attack: 0.003, decay: 0.16, peak: 0.15 });
    },
  },
  // カウントダウンの「ピッ」
  countdown: {
    dur: 0.2,
    play(ctx, out, t, p) {
      tone(ctx, out, { type: 'sine', freq: 880 * p, t, attack: 0.004, decay: 0.15, peak: 0.24 });
      tone(ctx, out, { type: 'triangle', freq: 1760 * p, t, attack: 0.003, decay: 0.06, peak: 0.04 });
    },
  },
  // スタートの「ピー！」
  go: {
    dur: 0.62,
    play(ctx, out, t, p) {
      held(ctx, out, { type: 'sine', freq: 1760 * p, t, length: 0.45, peak: 0.16, release: 0.12 });
      held(ctx, out, { type: 'triangle', freq: 880 * p, t, length: 0.45, peak: 0.12, release: 0.12 });
      tone(ctx, out, { type: 'sine', freq: midiToHz(76) * p, t, attack: 0.01, decay: 0.55, peak: 0.06 });
    },
  },
  // 終了の笛「ピーーッ」：笛の中の玉が震えるように、音量を速く揺らす
  'time-up': {
    dur: 1.1,
    play(ctx, out, t, p) {
      const length = 0.9;
      const { gain } = held(ctx, out, { type: 'sine', freq: 2650 * p, t, length, peak: 0.13, release: 0.12 });
      const trill = ctx.createOscillator();
      trill.frequency.setValueAtTime(28, t);
      const amount = ctx.createGain();
      amount.gain.setValueAtTime(0.05, t);
      trill.connect(amount).connect(gain.gain);
      trill.start(t);
      trill.stop(t + length + 0.05);
      const breath = ctx.createBufferSource();
      breath.buffer = noiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2650 * p, t);
      bp.Q.setValueAtTime(6, t);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(SILENT, t);
      bg.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
      bg.gain.setValueAtTime(0.05, t + length - 0.1);
      bg.gain.exponentialRampToValueAtTime(SILENT, t + length);
      breath.connect(bp).connect(bg).connect(out);
      breath.start(t);
      breath.stop(t + length + 0.05);
    },
  },
  // 物を持つ「ひょい」
  'pick-up': {
    dur: 0.12,
    play(ctx, out, t, p) {
      tone(ctx, out, { type: 'sine', freq: 500 * p, freqEnd: 950 * p, t, attack: 0.003, decay: 0.08, peak: 0.22 });
    },
  },
  // 投げる「ブン」
  throw: {
    dur: 0.25,
    play(ctx, out, t, p) {
      noiseHit(ctx, out, { t, attack: 0.02, decay: 0.16, peak: 0.24, filter: 'bandpass', freq: 600 * p, freqEnd: 2600 * p, q: 1.5 });
      tone(ctx, out, { type: 'sine', freq: 210 * p, freqEnd: 120 * p, t, attack: 0.01, decay: 0.1, peak: 0.1 });
    },
  },
  // ジャンプ「ぴょん」
  jump: {
    dur: 0.18,
    play(ctx, out, t, p) {
      tone(ctx, out, { type: 'sine', freq: 330 * p, freqEnd: 720 * p, t, attack: 0.005, decay: 0.13, peak: 0.22 });
      tone(ctx, out, { type: 'square', freq: 165 * p, freqEnd: 360 * p, t, attack: 0.005, decay: 0.08, peak: 0.025 });
    },
  },
  // ダッシュ「シュッ」
  dash: {
    dur: 0.2,
    play(ctx, out, t, p) {
      noiseHit(ctx, out, { t, attack: 0.01, decay: 0.14, peak: 0.24, filter: 'bandpass', freq: 3000 * p, freqEnd: 6500 * p, q: 1.2 });
    },
  },
  // 画面のボタン「ポチ」
  button: {
    dur: 0.08,
    play(ctx, out, t, p) {
      tone(ctx, out, { type: 'sine', freq: 1100 * p, freqEnd: 800 * p, t, attack: 0.002, decay: 0.05, peak: 0.22 });
    },
  },
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];
