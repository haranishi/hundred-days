// OWNER: integrate
// 一打ちの効果音のレシピ。どれもノイズと発振器だけで作る（外の音源は使わない）。
// 「！」はメタルギアの音（電子音の上がる和音）に寄せず、拍子木の二打ちと寺の鉦の金属の響きで作る。
import type { SurfaceKind } from '../stage/types';
import type { AudioEngine, Voice } from './engine';

/** 足音：白砂はジャリッ（高めの粒の束）、石畳はコツ（短い硬い響き）、苔はふっ（低く柔らかい）、土はとっ（こもった低い音）。 */
export function footstep(e: AudioEngine, v: Voice, surface: SurfaceKind, run: boolean): void {
  const t = e.now + 0.005;
  const r = e.rng;
  const bright = run ? 1.25 : 1;
  switch (surface) {
    case 'gravel': {
      // 粒が数個ずれて鳴る
      for (let i = 0; i < 5; i++) {
        e.burst({ ...v, gain: v.gain * (0.5 + r() * 0.5) }, t + i * (0.008 + r() * 0.012), {
          dur: 0.03 + r() * 0.03,
          type: 'bandpass',
          freq: (2600 + r() * 2200) * bright,
          q: 1.4,
          level: 0.9,
        });
      }
      e.burst({ ...v, gain: v.gain * 0.5 }, t, { dur: 0.07, type: 'lowpass', freq: 700, q: 0.7, level: 0.8 });
      break;
    }
    case 'stone': {
      e.burst(v, t, { dur: 0.045, type: 'bandpass', freq: (950 + r() * 250) * bright, q: 5, level: 1 });
      e.tone({ ...v, gain: v.gain * 0.25 }, t, { type: 'sine', f0: 210 + r() * 40, f1: 140, dur: 0.06, level: 1 });
      break;
    }
    case 'moss': {
      e.burst({ ...v, gain: v.gain * 0.7 }, t, { dur: 0.09, type: 'lowpass', freq: 340 * bright, q: 0.6, attack: 0.01, level: 1 });
      break;
    }
    default: {
      e.burst(v, t, { dur: 0.08, type: 'lowpass', freq: 560 * bright, q: 0.8, attack: 0.004, level: 1 });
      e.tone({ ...v, gain: v.gain * 0.3 }, t, { type: 'sine', f0: 95, f1: 60, dur: 0.07, level: 1 });
    }
  }
}

/** 「？」：小さな木の音が少し上がる（ぽこっ）。 */
export function question(e: AudioEngine, v: Voice): void {
  const t = e.now + 0.005;
  e.tone(v, t, { type: 'sine', f0: 560, f1: 840, dur: 0.16, glide: 0.07, level: 0.9 });
  e.tone({ ...v, gain: v.gain * 0.3 }, t, { type: 'triangle', f0: 1120, f1: 1680, dur: 0.09, glide: 0.07, level: 1 });
  e.burst({ ...v, gain: v.gain * 0.35 }, t, { dur: 0.02, type: 'bandpass', freq: 1800, q: 6, level: 1 });
}

/** 「！」：拍子木の鋭い二打ち（カッ・カン）に、鉦の金属の響きと低い胴の一打を重ねる。 */
export function alarm(e: AudioEngine, v: Voice): void {
  const t = e.now + 0.005;
  for (const [dt, f] of [
    [0, 2300],
    [0.075, 2750],
  ] as const) {
    e.burst(v, t + dt, { dur: 0.035, type: 'bandpass', freq: f, q: 14, level: 1 });
    e.burst({ ...v, gain: v.gain * 0.6 }, t + dt, { dur: 0.012, type: 'highpass', freq: 5200, q: 0.7, level: 1 });
  }
  // 鉦：倍音がそろわない金属の響き
  for (const [f, lv, d] of [
    [1830, 0.32, 0.9],
    [2940, 0.2, 0.6],
    [4170, 0.12, 0.4],
  ] as const) {
    e.tone({ ...v, gain: v.gain * lv }, t + 0.075, { type: 'sine', f0: f, dur: d, level: 1 });
  }
  e.tone({ ...v, gain: v.gain * 0.55 }, t, { type: 'sine', f0: 92, f1: 52, dur: 0.28, level: 1 });
}

/** 倒れた仲間に気づいた「!?」：「？」より低く、戸惑うように下がる。 */
export function puzzled(e: AudioEngine, v: Voice): void {
  const t = e.now + 0.005;
  e.tone(v, t, { type: 'sine', f0: 700, f1: 420, dur: 0.2, glide: 0.12, level: 0.8 });
  e.burst({ ...v, gain: v.gain * 0.3 }, t, { dur: 0.02, type: 'bandpass', freq: 1500, q: 5, level: 1 });
}

/** 当て身の始まり：袖を払う風の音。 */
export function takedownStart(e: AudioEngine, v: Voice): void {
  const t = e.now + 0.005;
  e.burst(v, t, { dur: 0.18, type: 'bandpass', freq: 700, sweepTo: 2600, q: 1.2, attack: 0.04, level: 0.8 });
}

/** 当て身が決まる：鈍い打撃と、崩れる布の音。 */
export function takedownDone(e: AudioEngine, v: Voice): void {
  const t = e.now + 0.005;
  e.tone(v, t, { type: 'sine', f0: 120, f1: 48, dur: 0.22, level: 1 });
  e.burst({ ...v, gain: v.gain * 0.8 }, t, { dur: 0.06, type: 'lowpass', freq: 900, q: 0.8, level: 1 });
  e.burst({ ...v, gain: v.gain * 0.45 }, t + 0.18, { dur: 0.3, type: 'lowpass', freq: 520, q: 0.6, attack: 0.03, level: 1, brown: true });
}

/** 小石を投げる：短い風切り。 */
export function stoneThrow(e: AudioEngine, v: Voice): void {
  const t = e.now + 0.005;
  e.burst(v, t, { dur: 0.12, type: 'bandpass', freq: 1400, sweepTo: 3200, q: 2, attack: 0.02, level: 0.6 });
}

/** 小石の着地：コッ、と二度跳ねる。 */
export function stoneLand(e: AudioEngine, v: Voice): void {
  const t = e.now + 0.005;
  const r = e.rng;
  e.burst(v, t, { dur: 0.03, type: 'bandpass', freq: 1900 + r() * 400, q: 7, level: 1 });
  e.burst({ ...v, gain: v.gain * 0.45 }, t + 0.11, { dur: 0.025, type: 'bandpass', freq: 2200 + r() * 400, q: 7, level: 1 });
  e.burst({ ...v, gain: v.gain * 0.2 }, t + 0.19, { dur: 0.02, type: 'bandpass', freq: 2500, q: 7, level: 1 });
  e.burst({ ...v, gain: v.gain * 0.35 }, t, { dur: 0.08, type: 'highpass', freq: 3000, q: 0.7, level: 1 });
}

/** 太鼓の一打（胴の鳴りと皮の打音）。big で大きく長く。 */
export function taiko(e: AudioEngine, v: Voice, at: number, big = false): void {
  const t = Math.max(e.now + 0.005, at);
  e.tone(v, t, { type: 'sine', f0: big ? 96 : 118, f1: big ? 46 : 58, dur: big ? 1.4 : 0.7, glide: big ? 0.5 : 0.3, level: 1 });
  e.tone({ ...v, gain: v.gain * 0.35 }, t, { type: 'triangle', f0: big ? 190 : 230, f1: 110, dur: 0.25, level: 1 });
  e.burst({ ...v, gain: v.gain * 0.5 }, t, { dur: 0.05, type: 'lowpass', freq: 1300, q: 0.8, level: 1 });
}

/** 討ち取りの一閃：鋭い風切り。 */
export function slash(e: AudioEngine, v: Voice, at: number): void {
  const t = Math.max(e.now + 0.005, at);
  e.burst(v, t, { dur: 0.16, type: 'bandpass', freq: 1800, sweepTo: 6200, q: 1.6, attack: 0.03, level: 0.9 });
  e.burst({ ...v, gain: v.gain * 0.5 }, t + 0.12, { dur: 0.05, type: 'highpass', freq: 4200, q: 0.7, level: 1 });
}

/** 討たれた：槍の突きの風切りと重い当たり、そのあと低く沈む音。 */
export function struck(e: AudioEngine, v: Voice): void {
  const t = e.now + 0.005;
  e.burst(v, t, { dur: 0.14, type: 'bandpass', freq: 900, sweepTo: 2600, q: 1.4, attack: 0.02, level: 0.8 });
  e.tone(v, t + 0.12, { type: 'sine', f0: 130, f1: 42, dur: 0.35, level: 1 });
  e.burst({ ...v, gain: v.gain * 0.7 }, t + 0.12, { dur: 0.08, type: 'lowpass', freq: 800, q: 0.7, level: 1 });
  // 沈む：低い音がゆっくり下がる
  e.tone({ ...v, gain: v.gain * 0.45, send: 0.4 }, t + 0.3, { type: 'triangle', f0: 110, f1: 55, dur: 1.6, glide: 1.6, attack: 0.05, level: 1 });
  e.tone({ ...v, gain: v.gain * 0.3, send: 0.4 }, t + 0.3, { type: 'sine', f0: 164, f1: 82, dur: 1.6, glide: 1.6, attack: 0.05, level: 1 });
}
