/* プロモ動画の BGM。外部パッケージも外部音源も使わず、固定シードの純JSで合成する。
   同じ入力なら必ず同じ WAV になる。場面の秒は timeline.mjs が正本で、絵コンテを動かすと音も一緒に動く。

   土台は Day 040 の生成器（音色の関数・小節ごとの編曲・タップの音・キックのダッキング・リバーブ）。
   仕上げだけ Day 048 から借りた：BS.1770 の統合ラウドネスで -17 LUFS に合わせ、ソフトニーでピークを丸め、
   TPDF ディザを掛けて 16bit にする。音量をピークでなくラウドネスで合わせるので、音を足しても仕上がりの音量は動かない。

   A案（既定）＝ヨナ抜き長音階（D・E・F#・A・B だけ）の和風の爪弾き。琴の分散和音と旋律（押し手・揺り付き）、
               三味線の撥、鼓・太鼓・拍子木・りん。84 BPM。冒頭は琴の「さらりん」と水の「ぽちゃん」
   B案＝ローファイの鍵盤。FM のエレピ（テープの揺れ付き）、スイングしたドラム、レコードのノイズ。84 BPM

   使い方:
     node promo-audio.mjs                    A案を promo-audio-a.wav へ
     node promo-audio.mjs --variant b        B案を promo-audio-b.wav へ
     node promo-audio.mjs --variant all      両方
     node promo-audio.mjs --variant a --out /abs/path.wav
   render-promo.mjs は writeMusic() を毎回呼んで両案を作り直す（古い WAV で画と音がずれないように）。
   import しただけでは何も書かない。 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANSWER_START, BPM, DURATION_SECONDS, END_START, TAPS, sceneStart } from './timeline.mjs';

export const SAMPLE_RATE = 48_000;
export const TARGET_LUFS = -17;
export const VARIANTS = Object.freeze({ a: 'A案（ヨナ抜きの琴と三味線）', b: 'B案（ローファイの鍵盤）' });
const PEAK_CEILING_DB = -2.5;   // サンプルピークの天井。AAC にした後の真のピークを -1 dBTP より下に保つ余白
const CHANNELS = 2;
const FRAMES = Math.round(DURATION_SECONDS * SAMPLE_RATE);
const TAU = Math.PI * 2;
const BEAT = 60 / BPM;          // 0.714秒
const BAR = BEAT * 4;           // 2.857秒（35秒 ≈ 12.25小節）
const here = dirname(fileURLToPath(import.meta.url));

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const db = (value) => 20 * Math.log10(Math.max(value, 1e-12));
const smooth = (x) => { const k = clamp(x); return k * k * (3 - 2 * k); };

// ── 拍と場面 ──────────────────────────────────────────────────────────────
/* 場面の切れ目は拍に丸める（ずれは最大0.36秒）。小節の途中で編成が変わると切り貼りに聞こえるので、
   編成は拍に乗せる。効果音（押す音・りん）だけは画面と同じ秒ちょうどに鳴らす */
const onBeat = (seconds) => Math.round(seconds / BEAT) * BEAT;
const SECTION = {
  answer: onBeat(sceneStart('S1')),
  sento: onBeat(sceneStart('S2')),
  trend: onBeat(sceneStart('S3')),
  pref: onBeat(sceneStart('S4')),
  bath: onBeat(sceneStart('S5')),
  visit: onBeat(sceneStart('S6')),
  end: onBeat(sceneStart('S7')),
};
const sectionAt = (t) => (t < SECTION.answer ? 'hook' : t < SECTION.sento ? 'answer' : t < SECTION.trend ? 'sento'
  : t < SECTION.pref ? 'trend' : t < SECTION.bath ? 'pref' : t < SECTION.visit ? 'bath' : t < SECTION.end ? 'visit' : 'end');

// ── 和音と旋律 ────────────────────────────────────────────────────────────
/* 1小節1和音。A案はヨナ抜き（D E F# A B）の音だけで組む（4度の G と7度の C# を使わない）。
   pad＝持続、arp＝分散和音の音列（下から）、root/fifth＝三味線・ベース。数値は MIDI ノート番号 */
const CHORDS = {
  a: {
    D6: { pad: [50, 57, 62, 66, 71], arp: [62, 66, 69, 71, 74, 78], root: 50, fifth: 45 },
    Bm7: { pad: [47, 54, 57, 62, 66], arp: [59, 62, 66, 69, 71, 74], root: 47, fifth: 54 },
    Esus: { pad: [52, 57, 59, 62, 64], arp: [64, 69, 71, 74, 76, 81], root: 52, fifth: 47 },
    Asus: { pad: [52, 57, 59, 64, 69], arp: [57, 64, 69, 71, 76, 81], root: 45, fifth: 52 },
  },
  // B案は同じ流れをローファイの響き（Dmaj9・Bm11・Em9・A13）で鳴らす
  b: {
    D6: { pad: [50, 57, 61, 64, 66], arp: [62, 66, 69, 73, 76, 78], root: 38, fifth: 45 },
    Bm7: { pad: [50, 54, 57, 61, 64], arp: [59, 62, 66, 69, 73, 74], root: 35, fifth: 42 },
    Esus: { pad: [50, 55, 59, 62, 66], arp: [64, 67, 71, 74, 78, 79], root: 40, fifth: 47 },
    Asus: { pad: [55, 61, 66, 71], arp: [61, 64, 67, 71, 73, 76], root: 33, fifth: 40 },
  },
};
// 5小節目（推移）は Bm7→Asus で少し沈め、6小節目（大分県に寄る）で主和音に戻る
const BAR_CHORDS = ['D6', 'Bm7', 'Esus', 'Asus', 'Bm7', 'Asus', 'D6', 'Bm7', 'Esus', 'Asus', 'D6', 'D6', 'D6'];
const BAR_COUNT = Math.ceil(DURATION_SECONDS / BAR);

// 旋律。[小節頭からの拍, MIDI, 長さ(拍), 押し手(半音。負＝下から押し上げる)]
const MOTIF_A = [[0, 74, 1], [1, 76, .5], [1.5, 78, .5, -2], [2, 81, 1.5], [3.5, 78, .5], [4, 76, 1], [5, 74, .5], [5.5, 71, .5], [6, 74, 2, -2]];
const MOTIF_B = [[0, 83, 1, -2], [1, 81, .5], [1.5, 78, .5], [2, 76, 1.5], [3.5, 74, .5], [4, 76, .5], [4.5, 78, .5], [5, 76, 1], [6, 71, 2]];
const MOTIF_C = [[0, 71, 1], [1, 69, .5], [1.5, 66, .5], [2, 64, 1, -2], [3, 59, 1]];
const CADENCE = [[0, 81, 1], [1, 78, .5], [1.5, 76, .5], [2, 74, 2.5, -2]];
const PHRASES = [
  { bar: 1, notes: MOTIF_A },                  // 2.86〜  見出し
  { bar: 3, notes: MOTIF_B },                  // 8.57〜  銭湯（後半は推移の頭へ）
  { bar: 5, notes: MOTIF_C, level: .8 },       // 14.29〜 推移（低く、少なく）
  { bar: 6, notes: MOTIF_A, harmony: -2 },     // 17.14〜 大分県（2音下を重ねた二重奏）
  { bar: 8, notes: MOTIF_B, harmony: -2 },     // 22.86〜 竹瓦温泉
  { bar: 10, notes: CADENCE },                 // 28.57〜 行った → エンド
];
// 分散和音の順番（8分音符8つ）。音列の上下を波のように行き来する
const ARP_PATTERN = [0, 2, 1, 3, 2, 4, 3, 5];
const ARP_DENSITY = { hook: 0, answer: .7, sento: .85, trend: .42, pref: .92, bath: .88, visit: .62, end: 0 };

// ヨナ抜きの音階の中で n 段ずらす（二重奏の下の声部に使う。音階の外へは出ない）
const PENTA = [2, 4, 6, 9, 11];
const PENTA_NOTES = Array.from({ length: 128 }, (_, midi) => midi).filter((midi) => PENTA.includes(midi % 12));
const pentaShift = (midi, steps) => PENTA_NOTES[clamp(PENTA_NOTES.indexOf(midi) + steps, 0, PENTA_NOTES.length - 1)] ?? midi;

// ── 土台 ──────────────────────────────────────────────────────────────────
function randomFactory(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}
const makeBus = () => ({ l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) });
const panGains = (pan) => [Math.cos((clamp(pan, -1, 1) + 1) * Math.PI / 4), Math.sin((clamp(pan, -1, 1) + 1) * Math.PI / 4)];
const firstFrame = (start) => Math.max(0, Math.floor(start * SAMPLE_RATE));
const lastFrame = (start, duration) => Math.min(FRAMES, Math.ceil((start + duration) * SAMPLE_RATE));
const triangle = (phase) => { const cycle = phase / TAU; return 2 * Math.abs(2 * (cycle - Math.floor(cycle + .5))) - 1; };
const sawtooth = (phase) => { const cycle = phase / TAU; return 2 * (cycle - Math.floor(cycle + .5)); };

function swellEnvelope(time, duration, attack, release) {
  if (time < 0 || time >= duration) return 0;
  const rise = Math.min(1, time / Math.max(attack, 1e-4));
  const fall = Math.min(1, (duration - time) / Math.max(release, 1e-4));
  return Math.sin(rise * Math.PI / 2) * Math.sin(fall * Math.PI / 2);
}
function pluckEnvelope(time, duration, attack, tau) {
  if (time < 0 || time >= duration) return 0;
  return (1 - Math.exp(-time / Math.max(attack, 1e-4))) * Math.exp(-time / tau) * Math.min(1, (duration - time) / .06);
}

/* RBJ のフィルタ係数と、状態を持つ1サンプル処理（Day 048 と同じ） */
function rbj(type, frequency, q = Math.SQRT1_2, gainDb = 0) {
  const w0 = TAU * frequency / SAMPLE_RATE;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const amp = 10 ** (gainDb / 40);
  const root = 2 * Math.sqrt(amp) * alpha;
  let c;
  if (type === 'lowpass') c = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === 'highpass') c = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === 'bandpass') c = [alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === 'highshelf') {
    c = [amp * ((amp + 1) + (amp - 1) * cos + root), -2 * amp * ((amp - 1) + (amp + 1) * cos),
      amp * ((amp + 1) + (amp - 1) * cos - root), (amp + 1) - (amp - 1) * cos + root,
      2 * ((amp - 1) - (amp + 1) * cos), (amp + 1) - (amp - 1) * cos - root];
  } else throw new Error(`未対応のフィルタ: ${type}`);
  const [b0, b1, b2, a0, a1, a2] = c;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function biquad([b0, b1, b2, a1, a2]) {
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// ── A案の音色 ─────────────────────────────────────────────────────────────

/** 琴：倍音の足し算。弦の13%の位置を爪で弾いた倍音の強さにし、高い倍音ほど早く消える。
    scoop は押し手（その半音だけ下から弾いて、40ms 後に0.1秒かけて押し上げる）、yuri は余韻の揺り（セント） */
function addKoto(bus, random, { start, midi, gain, pan = 0, tau = .85, scoop = 0, yuri = 0, bright = 1 }) {
  const f0 = hz(midi);
  const life = tau * 6.5;   // 基音が -56dB まで下がったら打ち切る
  const [leftGain, rightGain] = panGains(pan);
  const partials = [];
  for (let n = 1; n <= 14; n += 1) {
    const ratio = n * Math.sqrt(1 + 1.1e-4 * n * n);   // 弦の太さで倍音がわずかに上ずる
    if (f0 * ratio > 15_000) break;
    const amp = Math.abs(Math.sin(Math.PI * n * .13)) / n ** (1.05 - .25 * bright);
    partials.push({ ratio, amp, fall: Math.exp(-(1 + .55 * (n - 1)) / (tau * SAMPLE_RATE)), phase: random() * TAU, env: 1 });
  }
  const norm = 1 / partials.reduce((sum, partial) => sum + partial.amp, 0);
  const first = firstFrame(start);
  const last = lastFrame(start, life);
  let previousNoise = 0; let pickLow = 0;
  const pickAlpha = 1 - Math.exp(-TAU * 7500 / SAMPLE_RATE);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    let semis = scoop ? scoop * (1 - smooth((time - .04) / .1)) : 0;
    if (yuri) semis += yuri / 100 * Math.sin(TAU * 5.4 * time) * smooth((time - .28) / .3);
    const step = TAU * f0 * 2 ** (semis / 12) / SAMPLE_RATE;
    let wave = 0;
    for (const partial of partials) {
      partial.phase += step * partial.ratio;
      wave += Math.sin(partial.phase) * partial.amp * partial.env;
      partial.env *= partial.fall;
    }
    // 爪が弦に当たる「チッ」（中高域のノイズを数ミリ秒。耳に刺さる最上域は落とす）
    const noise = random() * 2 - 1;
    pickLow += ((noise - previousNoise) - pickLow) * pickAlpha;
    const pick = time < .012 ? pickLow * Math.exp(-time / .0022) : 0;
    previousNoise = noise;
    const sample = (wave * norm + pick * .16) * (1 - Math.exp(-time / .0012)) * Math.min(1, (life - time) / .05) * gain;
    bus.l[index] += sample * leftGain;
    bus.r[index] += sample * rightGain;
  }
}

/** 三味線：明るい倍音を速く減衰させ、中高域の倍音を少し長く・わずかにずらして残す（さわりの唸り）。
    頭に撥が皮を打つ「ベン」の胴鳴りと、わずかな摺り上げ */
function addShamisen(bus, random, { start, midi, gain, pan = 0, tau = .4 }) {
  const f0 = hz(midi);
  const life = tau * 6;
  const [leftGain, rightGain] = panGains(pan);
  const partials = [];
  for (let n = 1; n <= 20; n += 1) {
    if (f0 * n > 12_000) break;
    partials.push({ ratio: n, amp: 1 / n ** .72, fall: Math.exp(-(1 + .3 * (n - 1)) / (tau * SAMPLE_RATE)), phase: random() * TAU, env: 1 });
    if (n >= 5 && n <= 14) {   // さわり：少し長く残る、揺れた倍音
      partials.push({ ratio: n * 2 ** ((random() * 6 - 3) / 1200), amp: .2 / n ** .5, fall: Math.exp(-1 / (tau * 1.7 * SAMPLE_RATE)), phase: random() * TAU, env: 1 });
    }
  }
  const norm = 1 / partials.reduce((sum, partial) => sum + partial.amp, 0);
  const first = firstFrame(start);
  const last = lastFrame(start, life);
  let low = 0; let high = 0;
  const alphaLow = 1 - Math.exp(-TAU * 4200 / SAMPLE_RATE);
  const alphaHigh = 1 - Math.exp(-TAU * 900 / SAMPLE_RATE);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const step = TAU * f0 * 2 ** (-.35 * (1 - smooth(time / .03)) / 12) / SAMPLE_RATE;
    let wave = 0;
    for (const partial of partials) {
      partial.phase += step * partial.ratio;
      wave += Math.sin(partial.phase) * partial.amp * partial.env;
      partial.env *= partial.fall;
    }
    const noise = random() * 2 - 1;
    low += (noise - low) * alphaLow;
    high += (low - high) * alphaHigh;
    const bachi = time < .03 ? (low - high) * Math.exp(-time / .005) * .9 + Math.sin(TAU * 186 * time) * Math.exp(-time / .02) * .55 : 0;
    const sample = (wave * norm + bachi) * (1 - Math.exp(-time / .0008)) * Math.min(1, (life - time) / .05) * gain;
    bus.l[index] += sample * leftGain;
    bus.r[index] += sample * rightGain;
  }
}

/** 太鼓：低い胴の「ドン」。ピッチが 98→58Hz へ落ち、皮のノイズを少し */
function addTaiko(bus, random, { start, gain }) {
  const duration = .8;
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let phase = 0; let low = 0;
  const alpha = 1 - Math.exp(-TAU * 900 / SAMPLE_RATE);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    phase += TAU * (58 + 40 * Math.exp(-time / .05)) / SAMPLE_RATE;
    low += ((random() * 2 - 1) - low) * alpha;
    const body = Math.sin(phase) * Math.exp(-time / .26) + Math.sin(phase * 1.6) * .25 * Math.exp(-time / .05);
    const sample = (body + low * .5 * Math.exp(-time / .03)) * Math.min(1, time / .002) * gain;
    bus.l[index] += sample; bus.r[index] += sample;
  }
}

/** 鼓：「ポン」。音程のある膜の音で、打った瞬間だけ少し高い */
function addTsuzumi(bus, random, { start, gain, pitch = 320, pan = .2 }) {
  const duration = .5;
  const [leftGain, rightGain] = panGains(pan);
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let phase = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    phase += TAU * pitch * (1 + .38 * Math.exp(-time / .028)) / SAMPLE_RATE;
    const tone = Math.sin(phase) * Math.exp(-time / .15) + Math.sin(phase * 2.3) * .2 * Math.exp(-time / .045);
    const slap = (random() * 2 - 1) * .18 * Math.exp(-time / .004);
    const sample = (tone + slap) * Math.min(1, time / .0015) * gain;
    bus.l[index] += sample * leftGain; bus.r[index] += sample * rightGain;
  }
}

/** 拍子木：木を打ち合わせる「カン」。2つの共鳴と短いクリック */
function addHyoshigi(bus, random, { start, gain, pan = -.25 }) {
  const duration = .12;
  const [leftGain, rightGain] = panGains(pan);
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const wood = Math.sin(TAU * 2150 * time) * Math.exp(-time / .018) + Math.sin(TAU * 3380 * time) * .6 * Math.exp(-time / .011);
    const click = (random() * 2 - 1) * .5 * Math.exp(-time / .0012);
    const sample = (wood + click) * Math.min(1, time / .0006) * gain;
    bus.l[index] += sample * leftGain; bus.r[index] += sample * rightGain;
  }
}

/** りん：倍音が整数倍にならない金属の響き。左右でわずかにずらして唸らせる */
function addRin(bus, { start, midi, gain, pan = 0, tau = 2.6 }) {
  const f0 = hz(midi);
  const modes = [[1, 1, 1], [2.76, .45, .55], [5.4, .22, .3], [8.93, .1, .16]];
  const life = Math.min(tau * 3, DURATION_SECONDS - start);
  const [leftGain, rightGain] = panGains(pan);
  const first = firstFrame(start);
  const last = lastFrame(start, life);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    let left = 0; let right = 0;
    for (const [ratio, amp, life0] of modes) {
      const env = amp * Math.exp(-time / (tau * life0));
      left += Math.sin(TAU * (f0 * ratio - .4) * time) * env;
      right += Math.sin(TAU * (f0 * ratio + .4) * time) * env;
    }
    const shape = Math.min(1, time / .002) * Math.min(1, (life - time) / .2) * gain / 1.77;
    bus.l[index] += left * shape * leftGain * 1.2;
    bus.r[index] += right * shape * rightGain * 1.2;
  }
}

/** 水の「ぽちゃん」：上へ滑る短い正弦を2つ重ねる（しずくが落ちて、泡が震える音） */
function addWaterDrop(bus, { start, gain, pan = 0 }) {
  const [leftGain, rightGain] = panGains(pan);
  for (const [offset, from, to, sweep, decay, amp] of [[0, 520, 1550, .035, .05, 1], [.052, 880, 1260, .03, .032, .42]]) {
    const first = firstFrame(start + offset);
    const last = lastFrame(start + offset, decay * 7);
    let phase = 0;
    for (let index = first; index < last; index += 1) {
      const time = index / SAMPLE_RATE - start - offset;
      phase += TAU * from * (to / from) ** Math.min(1, time / sweep) / SAMPLE_RATE;
      const sample = Math.sin(phase) * Math.exp(-time / decay) * (1 - Math.exp(-time / .0008)) * amp * gain;
      bus.l[index] += sample * leftGain; bus.r[index] += sample * rightGain;
    }
  }
}

// ── B案の音色（Day 040 の鍵盤とドラム） ──────────────────────────────────

/** パッド：3声のデチューンした鋸／三角。ローパスはあとでバス全体に掛ける */
function addPad(bus, { start, duration, midi, gain, pan, attack = .35, release = .9 }) {
  const [leftGain, rightGain] = panGains(pan);
  const base = hz(midi);
  const detunes = [-6.5, 0, 7.5];
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    let wave = 0;
    for (const [voice, cents] of detunes.entries()) {
      const phase = TAU * base * 2 ** (cents / 1200) * time + voice * 1.7;
      wave += sawtooth(phase) * .34 + triangle(phase) * .28;
    }
    const sample = wave / 3 * swellEnvelope(time, duration, attack, release) * gain;
    bus.l[index] += sample * leftGain; bus.r[index] += sample * rightGain;
  }
}

/** エレピ：2オペレータの FM。wow はテープのようなゆっくりした音程の揺れ（セント） */
function addElectricPiano(bus, { start, duration, midi, gain, pan, index0 = 2.4, tauMod = .12, tauAmp = .85, wow = 7 }) {
  const [leftGain, rightGain] = panGains(pan);
  const frequency = hz(midi);
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let phase = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const drift = 2 ** (wow / 1200 * Math.sin(TAU * .42 * (index / SAMPLE_RATE)));
    phase += TAU * frequency * drift / SAMPLE_RATE;
    const modulation = Math.sin(phase) * index0 * Math.exp(-time / tauMod);
    const tine = Math.sin(phase * 6) * .12 * Math.exp(-time / .045);
    const sample = (Math.sin(phase + modulation) + tine) * pluckEnvelope(time, duration, .004, tauAmp) * gain;
    bus.l[index] += sample * leftGain; bus.r[index] += sample * rightGain;
  }
}

/** ベース：正弦＋少しの三角。頭に短いスライドを付け、ローパスで丸める */
function addBass(bus, { start, duration, midi, gain, slideFrom = 0 }) {
  const target = hz(midi);
  const from = slideFrom ? hz(midi + slideFrom) : target;
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let phase = 0; let lowpass = 0;
  const alpha = 1 - Math.exp(-TAU * 320 / SAMPLE_RATE);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const glide = Math.min(1, time / .07);
    phase += TAU * (from + (target - from) * glide * glide) / SAMPLE_RATE;
    lowpass += (Math.sin(phase) * .88 + triangle(phase) * .12 - lowpass) * alpha;
    const sample = lowpass * pluckEnvelope(time, duration, .008, .42) * gain;
    bus.l[index] += sample; bus.r[index] += sample;
  }
}

function addKick(bus, { start, gain }) {
  const duration = .42;
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let phase = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    phase += TAU * (40 + 15 * Math.exp(-time / .035)) / SAMPLE_RATE;
    const sample = (Math.sin(phase) * Math.exp(-time / .105) + Math.sin(phase * 2) * .22 * Math.exp(-time / .028)
      + Math.sin(TAU * 1350 * time) * .1 * Math.exp(-time / .003)) * Math.min(1, time / .0015) * gain;
    bus.l[index] += sample; bus.r[index] += sample;
  }
}

function addHat(bus, random, { start, gain, open = false, pan = .12 }) {
  const [leftGain, rightGain] = panGains(pan);
  const duration = open ? .22 : .07;
  const tau = open ? .085 : .017;
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let lowpass = 0;
  const alpha = 1 - Math.exp(-TAU * 7200 / SAMPLE_RATE);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const noise = random() * 2 - 1;
    lowpass += (noise - lowpass) * alpha;
    const sample = (noise - lowpass) * Math.exp(-time / tau) * gain;
    bus.l[index] += sample * leftGain; bus.r[index] += sample * rightGain;
  }
}

function addSnare(bus, random, { start, gain }) {
  const duration = .3;
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let low = 0; let high = 0;
  const alphaLow = 1 - Math.exp(-TAU * 5200 / SAMPLE_RATE);
  const alphaHigh = 1 - Math.exp(-TAU * 700 / SAMPLE_RATE);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const noise = random() * 2 - 1;
    low += (noise - low) * alphaLow;
    high += (low - high) * alphaHigh;
    const sample = (low - high) * Math.exp(-time / .1) * Math.min(1, time / .012) * gain;
    bus.l[index] += sample * .96; bus.r[index] += sample * 1.04;
  }
}

/** レコードの針のノイズ：まばらなプチッと、ごく薄いサー。B案だけ */
function addCrackle(bus, random, { gain }) {
  let hiss = 0; let band = 0;
  const alphaHiss = 1 - Math.exp(-TAU * 5000 / SAMPLE_RATE);
  const alphaBand = 1 - Math.exp(-TAU * 900 / SAMPLE_RATE);
  let pop = 0;
  for (let index = 0; index < FRAMES; index += 1) {
    const noise = random() * 2 - 1;
    hiss += (noise - hiss) * alphaHiss;
    band += (hiss - band) * alphaBand;
    if (random() < 7 / SAMPLE_RATE) pop = (random() < .5 ? -1 : 1) * (.4 + random() * .6);
    pop *= .93;
    const sample = ((hiss - band) * .06 + pop) * gain;
    bus.l[index] += sample * (.9 + .1 * random()); bus.r[index] += sample * (.9 + .1 * random());
  }
}

/** B案の効果音：FM のチャイム（Day 040 と同じ手触り） */
function addChime(bus, { start, duration, midi, gain, pan = 0 }) {
  const [leftGain, rightGain] = panGains(pan);
  const frequency = hz(midi);
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const carrier = TAU * frequency * time;
    const wave = Math.sin(carrier + Math.sin(carrier * 2) * 1.5 * Math.exp(-time / .09)) * .8 + triangle(carrier) * .2;
    const sparkle = Math.sin(carrier * 10) * .2 * Math.exp(-time / .025);
    const sample = (wave + sparkle) * pluckEnvelope(time, duration, .005, .5) * gain;
    bus.l[index] += sample * leftGain; bus.r[index] += sample * rightGain;
  }
}

function addSweep(bus, { start, duration, from, to, gain, pan }) {
  const [leftGain, rightGain] = panGains(pan);
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let phase = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    phase += TAU * (from + (to - from) * (time / duration)) / SAMPLE_RATE;
    const sample = Math.sin(phase) * pluckEnvelope(time, duration, .003, .05) * gain;
    bus.l[index] += sample * leftGain; bus.r[index] += sample * rightGain;
  }
}

// ── 効果 ──────────────────────────────────────────────────────────────────

/** ステレオのシュレーダー・リバーブ（コム4＋オールパス2・減衰 decay 秒）。Day 040 と同じ */
function reverb(send, decay) {
  const combs = [1215, 1390, 1548, 1760];
  const allpass = [245, 605];
  const output = { l: null, r: null };
  for (const channel of ['l', 'r']) {
    const offset = channel === 'r' ? 23 : 0;
    const input = send[channel];
    const combed = new Float32Array(FRAMES);
    for (const size of combs) {
      const length = size + offset;
      const line = new Float32Array(length);
      const gain = 10 ** (-3 * (length / SAMPLE_RATE) / decay);
      const alpha = 1 - Math.exp(-TAU * 3800 / SAMPLE_RATE);
      let cursor = 0; let damp = 0;
      for (let index = 0; index < FRAMES; index += 1) {
        const value = line[cursor];
        combed[index] += value * .25;
        damp += (value - damp) * alpha;
        line[cursor] = input[index] + damp * gain;
        cursor = (cursor + 1) % length;
      }
    }
    let stage = combed;
    for (const size of allpass) {
      const length = size + offset;
      const line = new Float32Array(length);
      const next = new Float32Array(FRAMES);
      let cursor = 0;
      for (let index = 0; index < FRAMES; index += 1) {
        const delayed = line[cursor];
        const value = stage[index];
        next[index] = delayed - value;
        line[cursor] = value + delayed * .5;
        cursor = (cursor + 1) % length;
      }
      stage = next;
    }
    output[channel] = stage;
  }
  return output;
}

/** 付点8分のピンポンディレイ（入力は右へ、以後 L↔R で受け渡す）。Day 040 と同じ */
function pingPong(bus, { feedback = .3, wet = .13 } = {}) {
  const delay = Math.round(BEAT * .75 * SAMPLE_RATE);
  const lineL = new Float32Array(FRAMES + delay + 1);
  const lineR = new Float32Array(FRAMES + delay + 1);
  const alpha = 1 - Math.exp(-TAU * 3200 / SAMPLE_RATE);
  let dampL = 0; let dampR = 0;
  for (let index = 0; index < FRAMES; index += 1) {
    const tapL = lineL[index]; const tapR = lineR[index];
    dampL += (tapL - dampL) * alpha; dampR += (tapR - dampR) * alpha;
    lineR[index + delay] += (bus.l[index] + bus.r[index]) * .5 * .6 + dampL * feedback;
    lineL[index + delay] += dampR * feedback;
    bus.l[index] += tapL * wet; bus.r[index] += tapR * wet;
  }
}

/** パッドのローパス（1次・遅い揺れ）。持続音を奥へ下げて、爪弾きの輪郭を前に出す */
function padFilter(bus, base) {
  let left = 0; let right = 0;
  for (let index = 0; index < FRAMES; index += 1) {
    const cutoff = base * (1 + .24 * Math.sin(TAU * .062 * (index / SAMPLE_RATE) + .8));
    const alpha = 1 - Math.exp(-TAU * cutoff / SAMPLE_RATE);
    left += (bus.l[index] - left) * alpha;
    right += (bus.r[index] - right) * alpha;
    bus.l[index] = left; bus.r[index] = right;
  }
}

/** 区間を包む持ち上がりと戻り（ダッキング用）。time は at を0とした秒 */
function duckCurve(target, at, { depth, lead = .06, hold = .25, release = .45 }) {
  const first = firstFrame(at - lead);
  const last = lastFrame(at - lead, lead + hold + release * 4);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - at;
    const value = time < 0 ? 1 + time / lead : time < hold ? 1 : Math.exp(-(time - hold) / release);
    const amount = depth * clamp(value);
    if (amount > target[index]) target[index] = amount;
  }
}

// ── 仕上げ（Day 048 から） ────────────────────────────────────────────────

/** ITU-R BS.1770 の統合ラウドネス（K特性・400ms ブロック・絶対/相対ゲート）。48kHz 専用の係数 */
export function integratedLoudness(left, right) {
  const weight = (channel) => {
    const shelf = biquad([1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, .73248077421585]);
    const highpass = biquad([1, -2, 1, -1.99004745483398, .99007225036621]);
    const squared = new Float64Array(channel.length);
    for (let i = 0; i < channel.length; i += 1) { const y = highpass(shelf(channel[i])); squared[i] = y * y; }
    return squared;
  };
  const sl = weight(left); const sr = weight(right);
  const block = Math.round(.4 * SAMPLE_RATE); const hop = Math.round(.1 * SAMPLE_RATE);
  const prefix = new Float64Array(sl.length + 1);
  for (let i = 0; i < sl.length; i += 1) prefix[i + 1] = prefix[i] + sl[i] + sr[i];
  const powers = [];
  for (let s = 0; s + block <= sl.length; s += hop) powers.push((prefix[s + block] - prefix[s]) / block);
  const loud = (power) => -.691 + 10 * Math.log10(Math.max(power, 1e-20));
  const mean = (list) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
  const absolute = powers.filter((p) => loud(p) > -70);
  const threshold = loud(mean(absolute)) - 10;
  return loud(mean(absolute.filter((p) => loud(p) > threshold)));
}

/** 4倍オーバーサンプリングで真のピークを見積もる（窓付き sinc・左右24タップ） */
function truePeak(channel) {
  const taps = 12;
  const kernels = [.25, .5, .75].map((mu) => {
    const kernel = [];
    for (let k = -taps + 1; k <= taps; k += 1) {
      const x = mu - k;
      kernel.push(Math.sin(Math.PI * x) / (Math.PI * x) * .5 * (1 + Math.cos(Math.PI * x / taps)));
    }
    return kernel;
  });
  let peak = 0;
  for (let n = 0; n < channel.length; n += 1) {
    peak = Math.max(peak, Math.abs(channel[n]));
    if (n < taps || n + taps >= channel.length) continue;
    for (const kernel of kernels) {
      let value = 0;
      for (let j = 0; j < kernel.length; j += 1) value += channel[n - taps + 1 + j] * kernel[j];
      peak = Math.max(peak, Math.abs(value));
    }
  }
  return peak;
}

/** 低域の掃除・高域の明るさ・フェード → -17 LUFS に合わせてピークを丸める → 16bit 用に TPDF ディザ */
function finish(left, right, random, shelfDb) {
  for (const channel of [left, right]) {
    const highpass = biquad(rbj('highpass', 28));
    const shelf = biquad(rbj('highshelf', 7000, Math.SQRT1_2, shelfDb));
    for (let i = 0; i < FRAMES; i += 1) {
      const t = i / SAMPLE_RATE;
      const fadeIn = Math.min(1, t / .004);                       // 1コマ目から鳴らすので頭は 4ms だけ
      const fadeOut = clamp((DURATION_SECONDS - t) / 1.6);         // 最後の 1.6秒で消す
      channel[i] = shelf(highpass(channel[i])) * fadeIn * (.5 - .5 * Math.cos(Math.PI * fadeOut));
    }
  }
  const ceiling = 10 ** (PEAK_CEILING_DB / 20);
  const knee = ceiling * 10 ** (-5.5 / 20);
  const soft = (x) => {
    const a = Math.abs(x);
    return a <= knee ? x : Math.sign(x) * (knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee)));
  };
  let gain = 10 ** ((TARGET_LUFS - integratedLoudness(left, right)) / 20);
  let outL; let outR; let lufs = 0;
  for (let pass = 0; pass < 6; pass += 1) {
    outL = Float64Array.from(left, (x) => soft(x * gain));
    outR = Float64Array.from(right, (x) => soft(x * gain));
    lufs = integratedLoudness(outL, outR);
    if (Math.abs(lufs - TARGET_LUFS) < .03) break;
    gain *= 10 ** ((TARGET_LUFS - lufs) / 20);
  }
  let kneeHits = 0;
  for (let i = 0; i < FRAMES; i += 1) if (Math.abs(left[i] * gain) > knee || Math.abs(right[i] * gain) > knee) kneeHits += 1;
  const pcm = new Int16Array(FRAMES * CHANNELS);
  let clipped = 0;
  for (let i = 0; i < FRAMES; i += 1) {
    for (const [c, channel] of [outL, outR].entries()) {
      const value = Math.round((channel[i] + (random() - random()) / 32768) * 32767);
      if (value > 32767 || value < -32768) clipped += 1;
      pcm[i * CHANNELS + c] = clamp(value, -32768, 32767);
    }
  }
  // 冒頭0.3秒の音量（無音で始めない、の確かめ）
  let headSum = 0;
  const headFrames = Math.round(.3 * SAMPLE_RATE);
  for (let i = 0; i < headFrames; i += 1) headSum += (outL[i] ** 2 + outR[i] ** 2) / 2;
  return {
    pcm,
    info: {
      lufs, truePeakDb: db(Math.max(truePeak(outL), truePeak(outR))), headRmsDb: db(Math.sqrt(headSum / headFrames)),
      kneePercent: 100 * kneeHits / FRAMES, clipped, seconds: FRAMES / SAMPLE_RATE,
    },
  };
}

// ── 編曲 ──────────────────────────────────────────────────────────────────

export function synthesizeMusic({ variant = 'a' } = {}) {
  if (!VARIANTS[variant]) throw new Error(`--variant は a（琴と三味線）か b（ローファイの鍵盤）です（${variant}）`);
  const A = variant === 'a';
  const random = randomFactory(A ? 0x520929 : 0x52b052);
  const chords = CHORDS[variant];
  const pad = makeBus();
  const pluck = makeBus();   // 琴／エレピ（分散和音・旋律）
  const bass = makeBus();    // 三味線／ベース
  const perc = makeBus();
  const sfx = makeBus();     // 押す音・りん・水の音
  const kickTimes = [];

  // 琴は余韻（tau）で長さが決まるので duration を使わない。エレピは duration で切る
  const lead = ({ duration = 1.6, scoop = 0, yuri = 0, ...options }) => (A
    ? addKoto(pluck, random, { tau: 1.05, scoop, yuri, ...options })
    : addElectricPiano(pluck, { duration, ...options }));
  const arpNote = (options) => (A
    ? addKoto(pluck, random, { tau: .62, bright: .8, ...options })
    : addElectricPiano(pluck, { duration: BEAT * 1.6, tauAmp: .7, ...options }));

  // 冒頭：音を先に鳴らす（無音で始めない）。琴は5音音階を駆け上がる「さらりん」、B案はエレピの和音をかき鳴らす
  if (A) {
    [62, 64, 66, 69, 71, 74, 76, 78, 81].forEach((midi, step) => {
      addKoto(pluck, random, { start: step * .032, midi, gain: .16 + step * .012, pan: -.5 + step * .12, tau: .95 });
    });
  } else {
    chords.D6.pad.forEach((midi, step) => addElectricPiano(pluck, { start: step * .028, duration: 2.6, midi: midi + 12, gain: .1, pan: -.3 + step * .15 }));
  }
  addWaterDrop(sfx, { start: .62, gain: .2, pan: .25 });
  // 問いかけ：押し上げて止まる音（ミ→ファ#）と、下の B で「？」のまま待つ
  lead({ start: 1.22, midi: 76, gain: .2, pan: -.1, scoop: A ? -2 : 0, yuri: A ? 14 : 0, duration: 1.8 });
  lead({ start: 2.14, midi: 71, gain: .15, pan: .15, duration: 1.2 });

  for (let bar = 0; bar < BAR_COUNT; bar += 1) {
    const barStart = bar * BAR;
    const chord = chords[BAR_CHORDS[Math.min(bar, BAR_CHORDS.length - 1)]];
    const beat = (n) => barStart + n * BEAT;
    // 場面は音ごとの時刻で決める（小節の途中で始まる場面もあるため）
    const sectionOf = (n) => sectionAt(beat(n) + .001);

    // パッド：小節をまたいで重ね、継ぎ目を消す。エンドは下の終止和音に任せる
    if (barStart < SECTION.end) {
      const bed = sectionOf(0) === 'hook' ? .8 : sectionOf(0) === 'trend' ? .9 : 1;
      for (const [voice, midi] of chord.pad.entries()) {
        addPad(pad, {
          start: barStart, duration: BAR + .9, midi, gain: (A ? .13 : .15) * bed * (voice === 0 ? .45 : 1),
          pan: (voice - 2) * .22, attack: bar === 0 ? .6 : .3,
        });
      }
    }

    // 分散和音：8分音符。A案はまっすぐ、B案はスイング。場面で密度を変える
    for (let step = 0; step < 8; step += 1) {
      const section = sectionOf(step / 2);
      const keep = random() < ARP_DENSITY[section];
      const humanize = (random() * 2 - 1) * .007;
      const velocity = .6 + random() * .4;
      const octaveUp = random() < .12;
      if (!keep) continue;
      const time = beat(step / 2 + (!A && step % 2 ? .08 : 0)) + humanize;
      if (time < SECTION.answer - .05 || time >= SECTION.end) continue;
      const midi = chord.arp[ARP_PATTERN[(step + bar) % 8] % chord.arp.length] + (octaveUp && !A ? 12 : 0);
      arpNote({ start: time, midi, gain: (A ? .11 : .075) * velocity * (section === 'trend' ? .75 : 1), pan: (random() * 2 - 1) * .38 });
    }

    // 三味線／ベース
    if (A) {
      const patterns = {
        answer: [[0, 'root', 1], [2, 'fifth', .7]],
        visit: [[0, 'root', 1], [2, 'fifth', .7]],
        trend: [[0, 'root', .7]],
        groove: [[0, 'root', 1], [1.5, 'octave', .45], [2, 'fifth', .75], [3.5, 'root', .5]],
      };
      for (const [at, which, level] of patterns.groove) {
        const section = sectionOf(at);
        const pattern = patterns[section] ?? (section === 'hook' || section === 'end' ? [] : patterns.groove);
        const hit = pattern.find(([patternAt]) => patternAt === at);
        if (!hit) continue;
        const midi = which === 'fifth' ? chord.fifth : which === 'octave' ? chord.root + 12 : chord.root;
        addShamisen(bass, random, { start: beat(at), midi, gain: .15 * hit[2] * (which === 'root' && at === 0 ? .85 : 1), pan: .12 });
      }
    } else {
      for (const [at, length, useFifth, scale] of [[0, 1.35, false, 1], [2, .95, false, .8], [3.5, .5, true, .55]]) {
        const section = sectionOf(at);
        if (section === 'hook' || section === 'end' || (at === 3.5 && bar % 4 !== 3)) continue;
        const level = section === 'trend' ? .12 : section === 'answer' ? .15 : .22;
        addBass(bass, { start: beat(at), duration: BEAT * length, midi: useFifth ? chord.fifth : chord.root, gain: level * scale, slideFrom: at === 0 ? -5 : 0 });
      }
    }

    // 打楽器
    if (A) {
      const at0 = sectionOf(0);
      if (!['hook', 'trend', 'end'].includes(at0)) addTaiko(perc, random, { start: beat(0), gain: at0 === 'answer' ? .2 : .26 });
      if (['pref', 'bath'].includes(sectionOf(2.5))) addTaiko(perc, random, { start: beat(2.5), gain: .14 });
      if (['sento', 'pref', 'bath'].includes(sectionOf(3))) addTsuzumi(perc, random, { start: beat(3), gain: .3, pitch: 318 });
      if (['pref', 'bath'].includes(sectionOf(1.5))) addTsuzumi(perc, random, { start: beat(1.5), gain: .16, pitch: 430, pan: -.2 });
      if (['sento', 'pref', 'bath'].includes(sectionOf(3.5)) && bar % 2 === 1) addHyoshigi(perc, random, { start: beat(3.5), gain: .09 });
    } else {
      const quiet = (section) => section === 'answer' || section === 'trend';
      const silent = (section) => section === 'hook' || section === 'end';
      for (const at of bar % 4 === 3 ? [0, 1.5, 2.5, 3.75] : [0, 2.5]) {
        const section = sectionOf(at);
        if (silent(section) || (quiet(section) && at !== 0)) continue;
        kickTimes.push(beat(at));
        addKick(perc, { start: beat(at), gain: (quiet(section) ? .12 : .22) * (at === 0 ? 1 : .8) });
      }
      for (let step = 0; step < 8; step += 1) {
        const at = Math.floor(step / 2) + (step % 2 ? .58 : 0);
        const section = sectionOf(at);
        if (silent(section)) continue;
        addHat(perc, random, { start: beat(at), gain: (quiet(section) ? .13 : .17) * (step % 4 === 0 ? 1 : step % 2 ? .62 : .8), open: !quiet(section) && bar % 4 === 3 && step === 7 });
      }
      for (const at of [1, 3]) {
        const section = sectionOf(at);
        if (!silent(section) && !quiet(section)) addSnare(perc, random, { start: beat(at), gain: .085 });
      }
    }
  }

  // 旋律：2小節ずつ。harmony はヨナ抜きの中で2段下を重ねる（琴の二重奏）
  for (const phrase of PHRASES) {
    const phraseStart = phrase.bar * BAR;
    for (const [at, midi, length, scoop = 0] of phrase.notes) {
      const time = phraseStart + at * BEAT;
      if (time >= DURATION_SECONDS - .5) continue;
      const long = length >= 1.5;
      const gain = (A ? .24 : .15) * (phrase.level ?? 1);
      lead({ start: time, midi, gain, pan: -.12, scoop: A ? scoop : 0, yuri: A && long ? 16 : 0, duration: BEAT * length + .5 });
      if (phrase.harmony) {
        lead({ start: time + .014, midi: pentaShift(midi, phrase.harmony), gain: gain * .55, pan: .3, duration: BEAT * length + .3 });
      }
    }
  }

  // りん・チャイム：見出しの答え（ANSWER_START）とエンド（END_START）はその秒ちょうど
  if (A) {
    addRin(sfx, { start: ANSWER_START, midi: 86, gain: .16, pan: .1, tau: 2.2 });
    [74, 81, 86].forEach((midi, k) => addKoto(pluck, random, { start: ANSWER_START + .02 + k * .1, midi, gain: .13, pan: (k - 1) * .3, tau: 1.1 }));
  } else {
    [[0, 74], [.16, 78], [.32, 81]].forEach(([offset, midi]) => addChime(sfx, { start: ANSWER_START + offset, duration: 1.6, midi, gain: .1, pan: (offset - .16) * 2.4 }));
  }

  // 画面を押す音。switch＝指標の切り替え、tap＝一覧やチップ、correct＝県に寄る・行ったを付ける（いちばんの山）
  const duck = new Float32Array(FRAMES);
  for (const [index, tap] of TAPS.entries()) {
    const pan = index % 2 === 0 ? -.18 : .18;
    if (A) {
      addHyoshigi(sfx, random, { start: tap.at, gain: tap.kind === 'tap' ? .12 : .09, pan });
      if (tap.kind === 'switch') [81, 83, 86].forEach((midi, k) => addKoto(sfx, random, { start: tap.at + .02 + k * .036, midi, gain: .085, pan: pan + k * .1, tau: .55 }));
      if (tap.kind === 'tap') addKoto(sfx, random, { start: tap.at + .01, midi: 86, gain: .07, pan: -pan, tau: .3 });
      if (tap.kind === 'correct') {
        addKoto(sfx, random, { start: tap.at + .04, midi: 81, gain: .2, pan: pan * .5, tau: .9 });
        addKoto(sfx, random, { start: tap.at + .16, midi: 86, gain: .19, pan: -pan * .5, tau: 1.2, yuri: 12 });
        addRin(sfx, { start: tap.at + .16, midi: tap.target === 'visit' ? 93 : 86, gain: .12, pan: -pan, tau: 1.8 });
      }
    } else {
      addSweep(sfx, { start: tap.at, duration: .11, from: 1180, to: 720, gain: .09, pan });
      addChime(sfx, { start: tap.at + .01, duration: .32, midi: 74, gain: tap.kind === 'correct' ? .16 : .055, pan: -pan });
      if (tap.kind === 'correct') {
        addChime(sfx, { start: tap.at + .06, duration: .9, midi: 81, gain: .3, pan: pan * .5 });
        addChime(sfx, { start: tap.at + .16, duration: 1.1, midi: 86, gain: .27, pan: -pan * .5 });
      }
    }
    if (tap.kind === 'correct') duckCurve(duck, tap.at, { depth: .42 });
    else duckCurve(duck, tap.at, { depth: .18, hold: .1, release: .2 });
  }
  // 大分県へ寄る間は、琴が駆け上がって点が出るところで「ぽちゃん」
  const oita = TAPS.find((tap) => tap.target === 'oita');
  if (oita && A) [62, 66, 69, 71, 74, 78, 81].forEach((midi, step) => addKoto(pluck, random, { start: oita.at + .35 + step * .07, midi, gain: .07 + step * .01, pan: -.4 + step * .13, tau: .7 }));
  if (oita) addWaterDrop(sfx, { start: oita.at + 1.15, gain: .16, pan: -.2 });

  // エンド：主和音をゆっくり分散させ、りんを長く鳴らして消える
  const endChord = chords.D6;
  for (const [voice, midi] of [...endChord.pad, A ? 74 : 73].entries()) {
    addPad(pad, { start: SECTION.end, duration: DURATION_SECONDS - SECTION.end, midi, gain: (A ? .09 : .13) * (voice === 0 ? .45 : 1), pan: (voice - 2) * .2, attack: .5, release: 2.6 });
  }
  if (A) {
    addRin(sfx, { start: END_START, midi: 86, gain: .17, pan: 0, tau: 3.4 });
    [62, 66, 69, 71, 74, 78, 81, 86].forEach((midi, step) => addKoto(pluck, random, { start: END_START + .05 + step * .13, midi, gain: .15, pan: -.45 + step * .13, tau: 1.3 }));
    addShamisen(bass, random, { start: END_START + .05, midi: 50, gain: .16, pan: .1, tau: .6 });
    addTaiko(perc, random, { start: END_START + .05, gain: .2 });
  } else {
    endChord.arp.forEach((midi, step) => addElectricPiano(pluck, { start: END_START + .05 + step * .12, duration: 3.2, midi, gain: .085, pan: -.4 + step * .16 }));
    addChime(sfx, { start: END_START, duration: 2.4, midi: 86, gain: .14 });
  }

  // ── 効果とまとめ ──
  padFilter(pad, A ? 1000 : 1200);
  pingPong(pluck, { feedback: A ? .26 : .34, wet: A ? .11 : .16 });
  const send = { l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) };
  for (let i = 0; i < FRAMES; i += 1) {
    send.l[i] = pad.l[i] * .2 + pluck.l[i] * .3 + bass.l[i] * .05 + perc.l[i] * .1 + sfx.l[i] * .3;
    send.r[i] = pad.r[i] * .2 + pluck.r[i] * .3 + bass.r[i] * .05 + perc.r[i] * .1 + sfx.r[i] * .3;
  }
  const room = reverb(send, A ? 1.7 : 1.8);
  // B案はキックで伴奏を少し沈めて揺らす（Day 040 と同じ）
  const kickDuck = new Float32Array(FRAMES);
  for (const at of kickTimes) duckCurve(kickDuck, at, { depth: .22, lead: .008, hold: 0, release: .1 });

  const left = new Float64Array(FRAMES);
  const right = new Float64Array(FRAMES);
  const wet = A ? .2 : .17;
  for (let i = 0; i < FRAMES; i += 1) {
    const bed = (1 - duck[i]) * (1 - kickDuck[i]);
    left[i] = (pad.l[i] + pluck.l[i] + room.l[i] * wet) * bed + (bass.l[i] + perc.l[i]) * (1 - duck[i] * .6) + sfx.l[i];
    right[i] = (pad.r[i] + pluck.r[i] + room.r[i] * wet) * bed + (bass.r[i] + perc.r[i]) * (1 - duck[i] * .6) + sfx.r[i];
  }
  if (!A) {
    const crackle = makeBus();
    addCrackle(crackle, random, { gain: .018 });
    for (let i = 0; i < FRAMES; i += 1) { left[i] += crackle.l[i]; right[i] += crackle.r[i]; }
  }
  return finish(left, right, random, A ? 1.5 : 3);
}

/** 16bit ステレオの WAV にする */
export function encodeWav(pcm) {
  const bytes = pcm.length * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + bytes, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22); header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28); header.writeUInt16LE(CHANNELS * 2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(bytes, 40);
  return Buffer.concat([header, Buffer.from(pcm.buffer, pcm.byteOffset, bytes)]);
}

/** 曲を合成して WAV を書き出す（render-promo.mjs から呼ぶ入口） */
export function writeMusic(outPath, { variant = 'a' } = {}) {
  const { pcm, info } = synthesizeMusic({ variant });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encodeWav(pcm));
  return { ...info, variant, outPath };
}

export const defaultMusicPath = (variant) => join(here, `promo-audio-${variant}.wav`);

export function describeMusic(info) {
  return `${VARIANTS[info.variant]} / ${info.seconds.toFixed(3)}秒・${SAMPLE_RATE}Hz・16bit・stereo / `
    + `${info.lufs.toFixed(2)} LUFS・真のピーク(推定) ${info.truePeakDb.toFixed(2)} dBTP・冒頭0.3秒 ${info.headRmsDb.toFixed(1)} dBFS`
    + ` / ピークを丸めた区間 ${info.kneePercent.toFixed(3)}%・クリップ ${info.clipped}`;
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const argValue = (name, fallback) => {
    const at = argv.indexOf(name);
    const next = at >= 0 ? argv[at + 1] : undefined;
    return next && !next.startsWith('--') ? next : fallback;
  };
  const choice = argValue('--variant', 'a').toLowerCase();
  const variants = choice === 'all' ? Object.keys(VARIANTS) : [choice];
  const custom = argValue('--out', null);
  if (custom && variants.length > 1) {
    console.error('--out は --variant a か b と一緒に使います');
    process.exit(1);
  }
  try {
    for (const variant of variants) {
      const info = writeMusic(custom ? resolve(custom) : defaultMusicPath(variant), { variant });
      console.log(`WAVを書き出しました: ${info.outPath}`);
      console.log(`  ${describeMusic(info)}`);
      console.log(`  D のヨナ抜き / ${BPM} BPM / ${(DURATION_SECONDS / BAR).toFixed(2)}小節`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
