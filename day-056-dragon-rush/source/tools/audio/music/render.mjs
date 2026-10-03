// OWNER: audio-tools
// 曲のパートを音にする（作業員の側）。1パート＝1つの楽器の音の列を、3分＋尾の長さの帯に並べて返す。
// 残響と層の音量合わせは build.mjs 側（mixdown.mjs）でまとめて行う。ここは乾いた音と、残響へ送る量だけを持つ。
import { SR, env, filt, len, midiHz, pink, stereo, svf, wander } from '../lib/dsp.mjs';
import { rngFor } from '../lib/rng.mjs';
import { norm } from '../lib/sfxkit.mjs';
import { HOLD_TIMELINE, PARTS } from './arrange.mjs';
import { bass, brass, chappa, choir, drum, flute, koto, strings } from './instruments.mjs';
import { BEAT, LENGTH, STEP } from './score.mjs';

/** 曲の終わりから頭へ回り込ませる尾の長さ（秒）。残響と長い音の余韻が収まる長さ。 */
export const TAIL = 8;

function atmos(rng, d, swell) {
  const n = len(d);
  const s = stereo(n);
  const e = env(n, swell.map((v, k) => [(k / (swell.length - 1)) * d, v]));
  for (const side of ['l', 'r']) {
    const src = pink(rng, n);
    const y = svf(src, wander(rng, n, 0.12, 180, 700), 1.1, 'bp');
    filt(y, [['lp', 1800, 0.7]]);
    norm(y);
    for (let i = 0; i < n; i++) s[side][i] = y[i] * e[i];
  }
  return s;
}

function renderEvent(rng, e) {
  const f = midiHz(e.m);
  const o = e.opts ?? {};
  switch (e.inst) {
    case 'strings':
      return strings(rng, f, { dur: e.d, vel: e.vel, ...o });
    case 'brass':
      return brass(rng, f, { dur: e.d, vel: e.vel, ...o });
    case 'choir':
      return choir(rng, f, { dur: e.d, vel: e.vel, ...o });
    case 'bass':
      return bass(rng, f, { dur: e.d, vel: e.vel, ...o });
    case 'koto':
      return koto(rng, f, { dur: Math.max(e.d, 1.2), vel: e.vel, ...o });
    case 'flute':
      return flute(rng, o.notes, e.d, { bright: o.bright ?? 0 });
    case 'drum':
      return drum(rng, o.kind, e.vel, o.pitch ?? 1);
    case 'chappa':
      return chappa(rng, e.vel, o.set ?? 0);
    case 'atmos':
      return atmos(rng, e.d, o.swell);
    default:
      throw new Error(`知らない楽器: ${e.inst}`);
  }
}

/** 音（モノラルかステレオ）を帯の t 秒の位置へ、音量 g・定位 pan で足す。 */
function place(out, audio, t, g, pan) {
  const at = Math.round(t * SR);
  const a = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * Math.SQRT2 * g;
  const gr = Math.sin(a) * Math.SQRT2 * g;
  if (audio.l) {
    const n = Math.min(audio.l.length, out.l.length - at);
    // ステレオの音は、定位を左右の釣り合いで掛ける
    for (let i = 0; i < n; i++) {
      out.l[at + i] += audio.l[i] * gl;
      out.r[at + i] += audio.r[i] * gr;
    }
  } else {
    const n = Math.min(audio.length, out.l.length - at);
    for (let i = 0; i < n; i++) {
      out.l[at + i] += audio[i] * gl;
      out.r[at + i] += audio[i] * gr;
    }
  }
}

/** 作業員の仕事：パート1本を作る。戻り値の配列は転送される（写さない）。 */
export function renderPart(task) {
  const P = PARTS[task.part];
  if (!P) throw new Error(`知らないパート: ${task.part}`);
  const rng = rngFor(task.seed, `music.${task.part}`);
  const out = stereo(len(LENGTH + TAIL));
  const g = 10 ** (P.gain / 20);
  let notes = 0;
  for (const e of P.events()) {
    place(out, renderEvent(rng, e), e.t, g, e.pan ?? 0);
    notes++;
  }
  return { part: task.part, stem: P.stem, send: P.send, notes, l: out.l, r: out.r, transfer: [out.l.buffer, out.r.buffer] };
}

/**
 * r06-audio：パート1本の溜めの帯（arrange.mjs の HOLD）を作る。乱数は曲の本体と別の系列（music.hold.<パート>）なので、曲の本体の出力は変わらない。
 */
export function renderHoldPart(task) {
  const P = PARTS[task.part];
  if (!P) throw new Error(`知らないパート: ${task.part}`);
  const rng = rngFor(task.seed, `music.hold.${task.part}`);
  const out = stereo(len(HOLD_TIMELINE + 1));
  const g = 10 ** (P.gain / 20);
  let notes = 0;
  for (const e of P.hold()) {
    // gain は溜めの小節の層ごとの大きさの調整（arrange.mjs の HOLD_STEM_DB）
    place(out, renderEvent(rng, e), e.t, g * (e.gain ?? 1), e.pan ?? 0);
    notes++;
  }
  return { part: task.part, stem: P.stem, send: P.send, notes, l: out.l, r: out.r, transfer: [out.l.buffer, out.r.buffer] };
}

/**
 * 段階が上がるときの「つなぎ」：次の小節の頭の1拍前から締太鼓と長胴を細かく打ち込み、頭で大太鼓を打つ。
 * 曲の拍に合わせて実行時に鳴らす（1拍前に始める）。variant で刻みの形を変える。
 */
export function renderFill(seed, variant) {
  const rng = rngFor(seed, 'music.fill', variant);
  const out = stereo(len(BEAT + 3));
  const steps = [[0, 1, 2, 3], [0, 2, 3], [1, 2, 3]][variant % 3];
  for (const s of steps) {
    place(out, drum(rng, 'shime', 0.45 + 0.15 * s, 1), s * STEP, 0.5, 0.3);
    place(out, drum(rng, 'nagado', 0.4 + 0.18 * s, 1), s * STEP + 0.004, 0.55, -0.2);
  }
  place(out, drum(rng, 'odaiko', 1, 1), BEAT, 0.9, 0);
  place(out, chappa(rng, 0.8, variant), BEAT, 0.25, 0.4);
  return out;
}
