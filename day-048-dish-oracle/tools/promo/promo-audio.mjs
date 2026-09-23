/* Day 048 プロモ動画の BGM「占いの館のワルツ」。外部パッケージ・外部音源なしの純JSで合成する。
   3/4拍子・90 BPM（1小節＝2秒）・D マイナー・34秒＝17小節。場面の秒は timeline.mjs が正本で、
   楽譜はその小節割りに合わせて書いてある（合わなくなったら黙って鳴らさず、止めて知らせる）。
   乱数は固定シードなので、同じ入力なら必ず同じ WAV になる。

   使い方（リポジトリ直下から）:
     node day-048-dish-oracle/tools/promo/promo-audio.mjs                A案（チェレスタ＋ハープ）
     node day-048-dish-oracle/tools/promo/promo-audio.mjs --variant b    B案（ギターのつま弾き＋フルート）
     node day-048-dish-oracle/tools/promo/promo-audio.mjs --out /abs/promo-audio-a.wav
   --out が無ければ $PROMO_MUSIC_DIR（未設定なら OS の一時フォルダ）の promo-audio-<案>.wav に書く。
   リポジトリの中には書かない。描画ツールからは writeMusic(outPath, { variant }) を呼ぶ。
   import しただけでは何も書かない。 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BAR_SECONDS, BEATS_PER_BAR, BPM, DURATION_SECONDS, END_START, REVEAL_AT, STORYBOARD
} from './timeline.mjs';

export const SAMPLE_RATE = 48_000;
export const TARGET_LUFS = -17;
const CHANNELS = 2;
const TAU = Math.PI * 2;
const BEAT = 60 / BPM;                                    // 0.667秒
const BARS = Math.round(DURATION_SECONDS / BAR_SECONDS);  // 17小節
const FRAMES = Math.round(DURATION_SECONDS * SAMPLE_RATE);
const PEAK_CEILING_DB = -2.5;   // サンプルピークの天井。真のピーク -1.5 dBTP に余白を残す
const VARIANT_LABEL = { a: 'A案（チェレスタ＋ハープ）', b: 'B案（ギターのつま弾き＋フルート）' };

// ── 楽譜 ──────────────────────────────────────────────────────────────────
// 場面（timeline の music）ごとの開始小節。楽譜はこの割り付けで書いてある
const SECTION_BAR = Object.freeze({ hook: 0, verse: 2, build: 5, reveal: 8, chorus: 10, soft: 13, end: 15 });

/* 和音。pad＝持続（最低声部は C3 以上＝120Hz より上）、comp＝2・3拍目の軽い和音、
   arp＝分散和音の音列（下から）、root＝1拍目のベース。数値は MIDI ノート番号 */
const CHORDS = {
  Dm: { root: 38, pad: [50, 57, 62, 65], comp: [53, 57, 62], arp: [50, 57, 62, 65, 69, 74, 77] },
  Bb: { root: 34, pad: [50, 58, 62, 65], comp: [53, 58, 62], arp: [46, 53, 58, 62, 65, 70, 74] },
  Gm: { root: 31, pad: [50, 55, 58, 62], comp: [55, 58, 62], arp: [43, 50, 55, 58, 62, 67, 70] },
  A7: { root: 33, pad: [49, 55, 57, 64], comp: [55, 61, 64], arp: [45, 52, 55, 61, 64, 67, 73] },
  A7b9: { root: 33, pad: [49, 55, 58, 64], comp: [55, 58, 61], arp: [45, 52, 55, 58, 61, 64, 70] },
  C: { root: 36, pad: [48, 55, 60, 64], comp: [55, 60, 64], arp: [48, 55, 60, 64, 67, 72, 76] },
  D: { root: 38, pad: [50, 57, 62, 66], comp: [54, 57, 62], arp: [50, 57, 62, 66, 69, 74, 78] }
};
// 1小節1和音。鐘（8小節目）は属和音からの解決、サビは偽終止（A7→B♭）で明るく入り、最後は D メジャーで終わる
const PROGRESSION = ['Dm', 'Bb', 'Gm', 'A7', 'Dm', 'Bb', 'Gm', 'A7', 'Dm', 'A7b9', 'Bb', 'C', 'A7', 'Dm', 'A7', 'D', 'D'];
const SUS_BAR = 14;   // この小節は前半を A7sus4（D）にして、後半で C# に解く

/* 主旋律。[小節頭からの拍, MIDI, 長さ(拍)]。動機は「A G# A D C#｜B♭ A G F」＝5度の半音下の刺繍音で謎めかせ、
   以後は同じ形を1音ずつ上へ積んで（F→G→A）鐘に向けて張りつめる */
const LEAD = [
  [[0, 81, .5], [.5, 80, .5], [1, 81, 1], [2, 86, .5], [2.5, 85, .5]],             // 0 Dm   動機
  [[0, 82, 1.5], [1.5, 81, .5], [2, 79, .5], [2.5, 77, .5]],                         // 1 B♭
  [[0, 79, .5], [.5, 78, .5], [1, 79, 1], [2, 82, .5], [2.5, 81, .5]],             // 2 Gm   応答（1音下で）
  [[0, 79, 1.5], [1.5, 77, .5], [2, 76, .5], [2.5, 73, .5]],                         // 3 A7
  [[0, 74, 2], [2, 69, .5], [2.5, 74, .5]],                                          // 4 Dm
  [[0, 77, .5], [.5, 76, .5], [1, 77, 1], [2, 82, .5], [2.5, 81, .5]],             // 5 B♭   刺繍音を F に
  [[0, 79, .5], [.5, 78, .5], [1, 79, 1], [2, 84, .5], [2.5, 82, .5]],             // 6 Gm   G に
  [[0, 81, .5], [.5, 80, .5], [1, 81, .5], [1.5, 85, .5], [2, 88, .5], [2.5, 91, .5]], // 7 A7  A に＋駆け上がり
  [[1.5, 81, .5], [2, 80, .5], [2.5, 81, .5]],                                       // 8 Dm   鐘のあと、ひそやかに
  [[0, 82, 1], [1, 81, .5], [1.5, 85, .5], [2, 88, .5], [2.5, 85, .5]],             // 9 A7♭9
  [[0, 86, 1.5], [1.5, 84, .5], [2, 82, .5], [2.5, 81, .5]],                         // 10 B♭  サビ
  [[0, 88, 1.5], [1.5, 86, .5], [2, 84, .5], [2.5, 79, .5]],                         // 11 C
  [[0, 81, .5], [.5, 80, .5], [1, 81, .5], [1.5, 88, .5], [2, 85, 1]],             // 12 A7
  [[0, 86, 1.5], [1.5, 85, .5], [2, 86, .5], [2.5, 81, .5]],                         // 13 Dm  薄く
  [[0, 79, 1.5], [1.5, 77, .5], [2, 76, .5], [2.5, 73, .5]],                         // 14 A7
  [[0, 74, 1], [1, 81, .5], [1.5, 80, .5], [2, 81, .5], [2.5, 85, .5]],             // 15 D   動機を長調で
  [[0, 86, 3]]                                                                        // 16 D
];
// サビの副旋律（弦）。主旋律が伸ばす間に動き、主旋律が動く間は伸ばす（B♭ C D｜C D E｜C# E G → F）
const COUNTER = {
  9: [[2, 69, 1]],
  10: [[0, 70, 1], [1, 72, .5], [1.5, 74, 1.5]],
  11: [[0, 72, 1], [1, 74, .5], [1.5, 76, 1.5]],
  12: [[0, 73, 1.5], [1.5, 76, .5], [2, 79, 1]],
  13: [[0, 77, 2.4]]
};
// 分散和音。step＝拍の分割、pattern＝和音の音列の番号（-1 は休み）。小節が進むほど細かく・厚く
const ARPS = {
  5: { step: 1 / 2, pattern: [0, 2, 3, 4, 3, 2], level: .7 },
  6: { step: 1 / 3, pattern: [0, 2, 3, 4, 5, 4, 3, 4, 5], level: .8 },
  7: { step: 1 / 4, pattern: [0, 1, 2, 3, 4, 5], level: .95, octave: true },   // 後半はグリッサンドへ
  9: { step: 1 / 2, pattern: [0, 2, 3, 4, 5, 6], level: .7 },
  10: { step: 1 / 4, pattern: [0, 2, 3, 4, 5, 6, 5, 4, 3, 4, 5, 6], level: .8 },
  11: { step: 1 / 4, pattern: [0, 2, 3, 4, 5, 6, 5, 4, 3, 4, 5, 6], level: .8 },
  12: { step: 1 / 4, pattern: [0, 2, 3, 4, 5, 6, 5, 4, 3, 4, 5, 6], level: .85 },
  13: { step: 1 / 2, pattern: [0, -1, 3, -1, 4, -1], level: .55 },
  14: { step: 1 / 2, pattern: [0, -1, 2, -1, 4, 3], level: .5 }   // sus4 の間は C# を弾かない
};
const COMP_BARS = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12];            // ワルツの「ずん・ちゃっ・ちゃっ」
const SHAKER = { 4: .45, 5: .6, 6: .7, 7: .85, 9: .6, 10: .8, 11: .8, 12: .85 };
const SNAPS = { 6: .75, 7: .85, 9: .7, 10: 1, 11: 1, 12: 1 };   // 2・3拍目の指パッチン
// 鐘の直前 0.2秒だけ伴奏を少し引く（-4dB）。深くすると「音が抜けた」に聞こえる。
// 0.45（-5dB）では実測で直前より -6.7dB 沈んだ（ハープの駆け上がりの減衰が重なる）ので浅くした
const DUCK_DEPTH = .38;

// ── 共通の道具 ────────────────────────────────────────────────────────────
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const panGains = (pan) => [Math.cos((pan + 1) * Math.PI / 4), Math.sin((pan + 1) * Math.PI / 4)];
const makeBus = () => ({ l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) });
/** 鳴らす区間のフレーム番号 [first, last) */
const frames = (start, seconds) => [
  Math.max(0, Math.floor(start * SAMPLE_RATE)),
  Math.min(FRAMES, Math.ceil((start + seconds) * SAMPLE_RATE))
];
const db = (value) => 20 * Math.log10(Math.max(value, 1e-12));

function randomFactory(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

/** RBJ の双2次フィルタ係数 [b0, b1, b2, a1, a2] */
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
/** 係数から、状態を持つ1サンプル処理の関数を作る（状態は呼び出しごとに別） */
function biquad([b0, b1, b2, a1, a2]) {
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
/** 折り返しを抑えた鋸歯波の補正（PolyBLEP） */
function polyBlep(phase, step) {
  if (phase < step) { const x = phase / step; return x + x - x * x - 1; }
  if (phase > 1 - step) { const x = (phase - 1) / step; return x * x + x + x + 1; }
  return 0;
}

// ── 音色 ──────────────────────────────────────────────────────────────────

/** チェレスタ：基音＋音板の非整数倍音（2.76・5.4・8.9倍）が打鍵の瞬間だけ鳴る。離鍵でダンパーが止める */
function celesta(bus, { start, length, midi, gain, pan = 0, rand }) {
  const f = hz(midi);
  const [gl, gr] = panGains(pan);
  const body = 1.35 * (880 / f) ** .4;   // 高い音ほど早く消える
  const seconds = length + .35;
  const high = 8.93 * f < 20_000 ? .05 : 0;
  const tickAlpha = 1 - Math.exp(-TAU * 5000 / SAMPLE_RATE);
  let tickLow = 0;
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const damper = t < length ? 1 : Math.exp(-(t - length) / .07);
    const env = (1 - Math.exp(-t / .0012)) * damper * Math.min(1, (seconds - t) / .02);
    const wave = Math.sin(TAU * f * t) * Math.exp(-t / body)
      + .2 * Math.sin(TAU * 2 * f * t + .4) * Math.exp(-t / (body * .3))
      + .14 * Math.sin(TAU * 2.76 * f * t) * Math.exp(-t / .09)
      + .07 * Math.sin(TAU * 5.4 * f * t) * Math.exp(-t / .018)
      + high * Math.sin(TAU * 8.93 * f * t) * Math.exp(-t / .01);
    // ハンマーが音板に当たる「チッ」（5kHz より上のノイズを 3ms だけ）
    let tick = 0;
    if (t < .02) { const n = rand() * 2 - 1; tickLow += (n - tickLow) * tickAlpha; tick = (n - tickLow) * .4 * Math.exp(-t / .003); }
    const sample = (wave * env + tick) * gain;
    bus.l[i] += sample * gl; bus.r[i] += sample * gr;
  }
}

/** マークツリー（細い金属棒を順に鳴らす「きらめき」）。場面の変わり目に置く */
function markTree(bus, { start, count = 16, spacing = .03, gain, rising = false, rand }) {
  for (let k = 0; k < count; k += 1) {
    const order = rising ? k : count - 1 - k;
    const f = 2400 * 2 ** (1.6 * order / (count - 1));   // 2.4〜7.3kHz
    const pan = -.45 + .9 * k / (count - 1);
    const [gl, gr] = panGains(rising ? pan : -pan);
    const at = start + k * spacing + (rand() - .5) * .006;
    const level = gain * (.7 + .3 * rand());
    const [first, last] = frames(at, .9);
    for (let i = first; i < last; i += 1) {
      const t = i / SAMPLE_RATE - at;
      if (t < 0) continue;
      const wave = Math.sin(TAU * f * t) + (2.76 * f < 20_000 ? .35 * Math.sin(TAU * 2.76 * f * t) * Math.exp(-t / .12) : 0);
      const sample = wave * Math.min(1, t / .0008) * Math.exp(-t / .28) * Math.min(1, (.9 - t) / .05) * level;
      bus.l[i] += sample * gl; bus.r[i] += sample * gr;
    }
  }
}

/** ハープ：整数倍音を弾く位置で重み付けし、高い倍音ほど早く減衰させる。低い弦ほど長く鳴る */
function harp(bus, { start, midi, gain, pan = 0, ring }) {
  const f = hz(midi);
  const [gl, gr] = panGains(pan);
  const decay = clamp(2 * (220 / f) ** .55, .55, 3.4);
  const seconds = ring ?? Math.min(4.5, decay * 2.4);
  const omegas = []; const amps = []; const falls = [];
  let sum = 0;
  for (let n = 1; n <= 12; n += 1) {
    const partial = f * n * Math.sqrt(1 + .00015 * n * n);
    if (partial > 15_000) break;
    const amp = Math.abs(Math.sin(Math.PI * n * .27)) / n ** 1.35;
    omegas.push(TAU * partial); amps.push(amp); sum += amp;
    falls.push(Math.exp(-(1 + .8 * (n - 1)) / (decay * SAMPLE_RATE)));
  }
  for (let k = 0; k < amps.length; k += 1) amps[k] /= sum;
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    let wave = 0;
    for (let k = 0; k < amps.length; k += 1) { wave += amps[k] * Math.sin(omegas[k] * t); amps[k] *= falls[k]; }
    const env = (1 - Math.exp(-t / .0035)) * Math.min(1, (seconds - t) / .08);
    const sample = wave * env * gain;
    bus.l[i] += sample * gl; bus.r[i] += sample * gr;
  }
}

/** ギター：カープラス・ストロング。1次オールパスで端数の遅延を補い、高い弦でも音程が下がらないようにする。
   弾いた直後の1周期は励振ノイズがそのまま出てサンプル間のピークが跳ねる（-5dBFS が -1.3dBTP になった）ので、
   出力を 7kHz のローパスに通す */
function guitar(bus, { start, midi, gain, pan = 0, decay = 1.6, bright = .5, pick = .2, ring = 2.6, rand }) {
  const tone = biquad(rbj('lowpass', 7000));
  const f = hz(midi);
  const [gl, gr] = panGains(pan);
  const period = SAMPLE_RATE / f;
  const size = Math.max(4, Math.floor(period - .6));
  const frac = period - .5 - size;                 // 平均化フィルタの 0.5 サンプルを引いた残り
  const coef = (1 - frac) / (1 + frac);
  const noise = new Float64Array(size);
  let smooth = 0;
  for (let i = 0; i < size; i += 1) { smooth += ((rand() * 2 - 1) - smooth) * bright; noise[i] = smooth; }
  // 弾く位置の櫛形：ブリッジ寄りほど倍音が残る
  const offset = Math.max(1, Math.round(pick * size));
  const line = new Float64Array(size);
  let mean = 0;
  for (let i = 0; i < size; i += 1) { line[i] = noise[i] - noise[(i - offset + size) % size]; mean += line[i] / size; }
  let peak = 0;
  for (let i = 0; i < size; i += 1) { line[i] -= mean; peak = Math.max(peak, Math.abs(line[i])); }
  for (let i = 0; i < size; i += 1) line[i] /= peak || 1;
  const loss = Math.exp(-1 / (f * decay));
  const [first, last] = frames(start, ring);
  let cursor = 0; let previous = 0; let apIn = 0; let apOut = 0;
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const value = line[cursor];
    const average = (value + previous) * .5;
    previous = value;
    const shifted = coef * average + apIn - coef * apOut;
    apIn = average; apOut = shifted;
    line[cursor] = shifted * loss;
    cursor = cursor + 1 === size ? 0 : cursor + 1;
    const sample = tone(value) * Math.min(1, t / .0015) * Math.min(1, (ring - t) / .06) * gain;
    bus.l[i] += sample * gl; bus.r[i] += sample * gr;
  }
}

/** フルート：基音中心の正弦＋少しの倍音、帯域を絞った息のノイズ、遅れて掛かるビブラート */
function flute(bus, { start, length, midi, gain, pan = 0, rand }) {
  const f = hz(midi);
  const [gl, gr] = panGains(pan);
  const release = .12;
  const seconds = length + release;
  // 息は2倍音のあたりだけに絞る（1次フィルタの差だと裾が 20kHz まで伸びてヒスに聞こえた）
  const bandA = biquad(rbj('bandpass', f * 2, .8));
  const bandB = biquad(rbj('bandpass', f * 2, .8));
  let phase = 0;
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const depth = clamp((t - .2) / .4, 0, 1) * .006;   // ±10セント
    phase += TAU * f * (1 + depth * Math.sin(TAU * 5.2 * t)) / SAMPLE_RATE;
    const tone = Math.sin(phase) + .2 * Math.sin(2 * phase + .6) + .05 * Math.sin(3 * phase + 1.3);
    const air = bandB(bandA(rand() * 2 - 1));
    const rise = Math.sin(Math.min(1, t / .05) * Math.PI / 2);
    const fall = t < length ? 1 : Math.cos(Math.min(1, (t - length) / release) * Math.PI / 2);
    const env = rise * fall * (1 - .1 * Math.min(1, t / 1.5));
    const breath = air * (.09 * env + .45 * Math.exp(-t / .03));   // 吹き始めの息を少し強く
    const sample = (tone * env + breath) * gain;
    bus.l[i] += sample * gl; bus.r[i] += sample * gr;
  }
}

/** パッド：わずかにずらした3本の鋸歯＋三角。明るさ（ローパス）はバスでまとめて掛ける */
function padVoice(bus, { start, length, midi, gain, pan = 0, attack = .5, release = 1 }) {
  const [gl, gr] = panGains(pan);
  const seconds = length + release;
  const voices = [-7, 0, 6].map((cents, k) => ({ step: hz(midi) * 2 ** (cents / 1200) / SAMPLE_RATE, phase: k * .37 }));
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    let wave = 0;
    for (const voice of voices) {
      voice.phase += voice.step;
      if (voice.phase >= 1) voice.phase -= 1;
      const saw = 2 * voice.phase - 1 - polyBlep(voice.phase, voice.step);
      wave += saw * .55 + (1 - 4 * Math.abs(voice.phase - .5)) * .45;
    }
    const rise = Math.sin(Math.min(1, t / attack) * Math.PI / 2);
    const fall = t < length ? 1 : Math.cos(Math.min(1, (t - length) / release) * Math.PI / 2);
    const sample = wave / 3 * rise * fall * gain;
    bus.l[i] += sample * gl; bus.r[i] += sample * gr;
  }
}

/** 弦（副旋律）：ビブラート付きの鋸歯を2本。弓の立ち上がりは遅め */
function stringVoice(bus, { start, length, midi, gain, pan = 0 }) {
  const [gl, gr] = panGains(pan);
  const release = .35;
  const seconds = length + release;
  const base = hz(midi);
  const voices = [-6, 5].map((cents, k) => ({ ratio: 2 ** (cents / 1200), phase: k * .5, offset: k * 1.7 }));
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const depth = clamp((t - .15) / .35, 0, 1) * .0055;
    let wave = 0;
    for (const voice of voices) {
      const step = base * voice.ratio * (1 + depth * Math.sin(TAU * 5.4 * t + voice.offset)) / SAMPLE_RATE;
      voice.phase += step;
      if (voice.phase >= 1) voice.phase -= 1;
      wave += 2 * voice.phase - 1 - polyBlep(voice.phase, step);
    }
    const rise = Math.sin(Math.min(1, t / .16) * Math.PI / 2) * (.85 + .15 * Math.min(1, t / .6));
    const fall = t < length ? 1 : Math.cos(Math.min(1, (t - length) / release) * Math.PI / 2);
    const sample = wave / 2 * rise * fall * gain;
    bus.l[i] += sample * gl; bus.r[i] += sample * gr;
  }
}

/** コントラバスのピッツィカート：基音＋2〜4倍音。弾いた瞬間だけピッチがわずかに高い */
function bassNote(bus, { start, midi, gain, length = 1.2 }) {
  const f = hz(midi);
  const release = .12;
  const seconds = length + release;
  let phase = 0;
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    phase += TAU * f * (1 + .02 * Math.exp(-t / .02)) / SAMPLE_RATE;
    const wave = Math.sin(phase)
      + .42 * Math.sin(2 * phase) * Math.exp(-t / .4)
      + .2 * Math.sin(3 * phase) * Math.exp(-t / .2)
      + .08 * Math.sin(4 * phase) * Math.exp(-t / .1);
    const fall = t < length ? 1 : Math.cos(Math.min(1, (t - length) / release) * Math.PI / 2);
    const sample = wave * (1 - Math.exp(-t / .004)) * Math.exp(-t / .55) * fall * gain;
    bus.l[i] += sample; bus.r[i] += sample;
  }
}

/* 鐘：教会の鐘の部分音（ハム・プライム・短3度のティアス・5度・ノミナル…）。[比, 振幅, 減衰秒]
   打った瞬間の高い部分音を強く・短くし、低い唸りは長く残す（前後0.5秒より +3dB 以上目立たせるため） */
const BELL_PARTIALS = [
  [.5, .32, 2.8], [1, .55, 1.7], [1.188, .42, 1.3], [1.5, .3, .95], [2, .7, .8],
  [2.5, .3, .5], [2.66, .28, .42], [3.01, .25, .32], [4.06, .16, .2], [5.24, .1, .13]
];
/** 鐘：部分音ごとに左右の位相をずらして広げ、わずかなうなりを付ける。打撃は高域ノイズを一瞬。
   位相のずれは ±0.9rad まで（π 近くまでずらすとモノラル再生でその部分音が消える） */
function bell(bus, { start, midi, gain, seconds = 5, rand }) {
  const f = hz(midi);
  const parts = BELL_PARTIALS.map(([ratio, amp, decay], k) => ({
    omega: TAU * f * ratio, wobble: TAU * (.3 + .13 * k), amp,
    fall: Math.exp(-1 / (decay * SAMPLE_RATE)), level: 1, offset: .9 * Math.sin(1.7 * k + .5)
  }));
  const strikeAlpha = 1 - Math.exp(-TAU * 2500 / SAMPLE_RATE);
  let strikeLow = 0;
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    let left = 0; let right = 0;
    for (const part of parts) {
      const wob = .12 * Math.sin(part.wobble * t);
      left += part.amp * part.level * Math.sin(part.omega * t) * (1 + wob);
      right += part.amp * part.level * Math.sin(part.omega * t + part.offset) * (1 - wob);
      part.level *= part.fall;
    }
    const noise = rand() * 2 - 1;
    strikeLow += (noise - strikeLow) * strikeAlpha;
    const strike = (noise - strikeLow) * .4 * Math.exp(-t / .012);
    const env = Math.min(1, t / .001) * Math.min(1, (seconds - t) / .3) * gain;
    bus.l[i] += (left + strike) * env; bus.r[i] += (right + strike) * env;
  }
}

/** フィンガースナップ：2kHz 付近の帯域ノイズを一瞬＋硬いクリックと高域の「パチッ」 */
function snap(bus, { start, gain, pan = 0, rand }) {
  const [gl, gr] = panGains(pan);
  const band = biquad(rbj('bandpass', 2300, 1.3));
  const crack = biquad(rbj('highpass', 6500));
  const [first, last] = frames(start, .12);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const noise = rand() * 2 - 1;
    const click = t < .0015 ? noise * (1 - t / .0015) : 0;
    const env = Math.min(1, t / .0006) * Math.exp(-t / .016);
    const sample = (band(noise) * 2.2 + click * .6 + crack(noise) * .9 * Math.exp(-t / .006)) * env * gain;
    bus.l[i] += sample * gl; bus.r[i] += sample * gr;
  }
}

/* トライアングル：非整数倍の部分音（1〜13kHz）。[周波数, 振幅, 減衰秒] */
const TRIANGLE_PARTIALS = [
  [1180, .3, 1.6], [3450, .5, 1.4], [4700, .45, 1.3], [6380, .6, 1.2],
  [8120, .5, 1], [9750, .4, .9], [11_600, .3, .8], [13_300, .2, .7]
];
/** トライアングル：ワルツの1拍目を「チーン」と光らせる。部分音ごとに左右で少しうならせる */
function triangleHit(bus, { start, gain, pan = .35, seconds = 2.6 }) {
  const [gl, gr] = panGains(pan);
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    let wave = 0;
    for (const [k, [f, amp, decay]] of TRIANGLE_PARTIALS.entries()) {
      wave += amp * Math.sin(TAU * f * t + k) * Math.exp(-t / decay) * (1 + .1 * Math.sin(TAU * (1.1 + .4 * k) * t));
    }
    const sample = wave * Math.min(1, t / .0008) * Math.min(1, (seconds - t) / .3) * gain;
    bus.l[i] += sample * gl; bus.r[i] += sample * gr;
  }
}

/** シェイカー：高域のノイズ。粒が揃うまでの立ち上がりを少し遅く */
function shaker(bus, { start, gain, pan = .3, rand }) {
  const [gl, gr] = panGains(pan);
  const alpha = 1 - Math.exp(-TAU * 6000 / SAMPLE_RATE);
  let low = 0;
  const [first, last] = frames(start, .1);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const noise = rand() * 2 - 1;
    low += (noise - low) * alpha;
    const sample = (noise - low) * Math.min(1, t / .006) * Math.exp(-t / .02) * gain;
    bus.l[i] += sample * gl; bus.r[i] += sample * gr;
  }
}

// ── 効果 ──────────────────────────────────────────────────────────────────

/** バス全体に2段の1次ローパス（時間で動くカットオフ） */
function lowpassBus(bus, cutoffAt) {
  let l1 = 0; let l2 = 0; let r1 = 0; let r2 = 0;
  for (let i = 0; i < FRAMES; i += 1) {
    const alpha = 1 - Math.exp(-TAU * cutoffAt(i / SAMPLE_RATE) / SAMPLE_RATE);
    l1 += (bus.l[i] - l1) * alpha; l2 += (l1 - l2) * alpha; bus.l[i] = l2;
    r1 += (bus.r[i] - r1) * alpha; r2 += (r1 - r2) * alpha; bus.r[i] = r2;
  }
}

/** 4分音符のピンポンディレイ（返りは高域を落とす） */
function pingPong(bus, { feedback = .3, wet = .14 }) {
  const delay = Math.round(BEAT * SAMPLE_RATE);
  const lineL = new Float32Array(FRAMES + delay + 1);
  const lineR = new Float32Array(FRAMES + delay + 1);
  const alpha = 1 - Math.exp(-TAU * 3500 / SAMPLE_RATE);
  let dampL = 0; let dampR = 0;
  for (let i = 0; i < FRAMES; i += 1) {
    dampL += (lineL[i] - dampL) * alpha;
    dampR += (lineR[i] - dampR) * alpha;
    const mono = (bus.l[i] + bus.r[i]) * .5;
    lineR[i + delay] += mono * .6 + dampL * feedback;
    lineL[i + delay] += dampR * feedback;
    bus.l[i] += lineL[i] * wet;
    bus.r[i] += lineR[i] * wet;
  }
}

/** Freeverb 型のリバーブ（コム8本＋オールパス4本／ch）。右は少し遅延をずらして広げる */
function freeverb(inputL, inputR, { room = .82, damp = .4 } = {}) {
  const scale = SAMPLE_RATE / 44_100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const allpasses = [556, 441, 341, 225];
  const out = { l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) };
  for (const [channel, spread] of [['l', 0], ['r', 23]]) {
    const combLines = combs.map((size) => ({ line: new Float32Array(Math.round((size + spread) * scale)), cursor: 0, store: 0 }));
    const apLines = allpasses.map((size) => ({ line: new Float32Array(Math.round((size + spread) * scale)), cursor: 0 }));
    const target = out[channel];
    for (let i = 0; i < FRAMES; i += 1) {
      const input = (inputL[i] + inputR[i]) * .15;   // 左右を混ぜて入れる
      let sum = 0;
      for (const comb of combLines) {
        const value = comb.line[comb.cursor];
        comb.store = value * (1 - damp) + comb.store * damp;
        comb.line[comb.cursor] = input + comb.store * room;
        comb.cursor = comb.cursor + 1 === comb.line.length ? 0 : comb.cursor + 1;
        sum += value;
      }
      for (const ap of apLines) {
        const buffered = ap.line[ap.cursor];
        ap.line[ap.cursor] = sum + buffered * .5;
        ap.cursor = ap.cursor + 1 === ap.line.length ? 0 : ap.cursor + 1;
        sum = buffered - sum;
      }
      target[i] = sum / 8;
    }
  }
  return out;
}

/** ITU-R BS.1770 の統合ラウドネス（K特性・400ms ブロック・絶対/相対ゲート）。48kHz 専用の係数 */
function integratedLoudness(left, right) {
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
      const sinc = Math.sin(Math.PI * x) / (Math.PI * x);
      kernel.push(sinc * .5 * (1 + Math.cos(Math.PI * x / taps)));
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

// ── 合成 ──────────────────────────────────────────────────────────────────

/** 絵コンテの小節割りが楽譜と合うかを確かめる。合わないまま鳴らすと画と音がずれるので止める */
function checkTimeline() {
  const problems = [];
  if (BPM !== 90 || BEATS_PER_BAR !== 3 || Math.abs(BAR_SECONDS - BEATS_PER_BAR * BEAT) > 1e-9) {
    problems.push(`3/4拍子・90 BPM・1小節2秒の前提（いまは ${BEATS_PER_BAR}拍・${BPM} BPM・${BAR_SECONDS}秒）`);
  }
  if (BARS !== LEAD.length || Math.abs(BARS * BAR_SECONDS - DURATION_SECONDS) > 1e-9) {
    problems.push(`尺は ${LEAD.length}小節＝${LEAD.length * 2}秒の前提（いまは ${DURATION_SECONDS}秒）`);
  }
  for (const [music, bar] of Object.entries(SECTION_BAR)) {
    const scene = STORYBOARD.find((item) => item.music === music);
    if (!scene || Math.abs(scene.start - bar * BAR_SECONDS) > 1e-9) problems.push(`${music} は ${bar * BAR_SECONDS}秒始まりの前提`);
  }
  if (REVEAL_AT !== SECTION_BAR.reveal * BAR_SECONDS) problems.push(`鐘は ${SECTION_BAR.reveal * BAR_SECONDS}秒の前提`);
  if (END_START !== SECTION_BAR.end * BAR_SECONDS) problems.push(`終止は ${SECTION_BAR.end * BAR_SECONDS}秒の前提`);
  if (problems.length) {
    throw new Error(`timeline.mjs が BGM の楽譜と合いません。promo-audio.mjs の楽譜を書き直してください: ${problems.join(' / ')}`);
  }
}

/** 区間ごとの値を直線でつなぐ（[秒, 値] の列） */
const automation = (points) => (t) => {
  if (t <= points[0][0]) return points[0][1];
  for (let k = 1; k < points.length; k += 1) {
    const [t1, v1] = points[k];
    if (t <= t1) {
      const [t0, v0] = points[k - 1];
      return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
    }
  }
  return points.at(-1)[1];
};

/**
 * 曲を合成して、16bit・左右交互の PCM（Int16Array）と測定値を返す（書き出しはしない）
 * @param {{ variant?: 'a' | 'b' }} options
 */
export function synthesizeMusic({ variant = 'a' } = {}) {
  const v = String(variant).toLowerCase();
  if (v !== 'a' && v !== 'b') throw new Error(`variant は a か b だけです（受け取った値: ${variant}）`);
  checkTimeline();
  const isA = v === 'a';
  const human = randomFactory(0x0480d1);   // タイミングと強弱の揺れ（A・B 共通）
  const noise = randomFactory(0x0480d2);   // 打楽器・鐘・息のノイズ
  const pluck = randomFactory(0x0480d3);   // ギターの弾き始めの雑音
  const barStart = (bar) => bar * BAR_SECONDS;
  const beatTime = (bar, beat) => barStart(bar) + beat * BEAT;
  const sectionOf = (bar) => Object.entries(SECTION_BAR).filter(([, first]) => first <= bar).at(-1)[0];
  const jitter = (ms) => (human() * 2 - 1) * ms / 1000;
  const velocity = (beat) => (beat % 1 === 0 ? (beat === 0 ? 1 : .86) : .78) * (.95 + human() * .1);

  const bus = {
    lead: makeBus(), arp: makeBus(), waltz: makeBus(), pad: makeBus(),
    counter: makeBus(), perc: makeBus(), bell: makeBus()
  };

  // 主旋律。A はチェレスタ（サビだけハープを1オクターブ下に重ねる）。B は冒頭だけギター、以後はフルート
  const LEAD_LEVEL = { hook: .9, verse: 1, build: 1.05, reveal: .8, chorus: 1.15, soft: .72, end: .9 };
  for (const [bar, notes] of LEAD.entries()) {
    const section = sectionOf(bar);
    for (const [beat, midi, length] of notes) {
      const exact = bar === 0 && beat === 0;          // 1コマ目から鳴らすので最初の音は揺らさない
      const start = beatTime(bar, beat) + (exact ? 0 : jitter(4));
      const gain = LEAD_LEVEL[section] * velocity(beat);
      if (isA) {
        celesta(bus.lead, { start, length: length * BEAT * 1.15 + .05, midi, gain: .26 * gain, pan: -.08, rand: noise });
        if (section === 'chorus') harp(bus.lead, { start: start + .008, midi: midi - 12, gain: .1 * gain, pan: .12, ring: 1.6 });
      } else if (section === 'hook') {
        guitar(bus.lead, { start, midi: midi - 12, gain: .72 * gain, pan: -.06, decay: 1.4, bright: .5, pick: .16, ring: length * BEAT + .9, rand: pluck });
      } else {
        flute(bus.lead, { start, length: Math.max(.12, length * BEAT - .03), midi, gain: .2 * gain, pan: -.06, rand: noise });
      }
    }
  }
  // フックの左手（A はチェレスタの空5度、B はギターの開放弦）。和音を決めすぎず、謎めいた響きに
  for (const [bar, pair] of [[0, [62, 69]], [1, [58, 65]]]) {
    for (const [k, midi] of pair.entries()) {
      const start = barStart(bar) + k * .018;
      if (isA) celesta(bus.lead, { start, length: 1.9, midi, gain: .08 * (k ? .8 : 1), pan: -.25 + k * .2, rand: noise });
      else guitar(bus.lead, { start, midi: midi - 12, gain: .42 * (k ? .75 : 1), pan: -.2 + k * .15, decay: 2.2, bright: .4, ring: 2.1, rand: pluck });
    }
  }

  // パッド：同じ高さが続く声部はつなげて、小節ごとに息継ぎしない
  const padNotes = [[], [], [], []];
  for (let bar = SECTION_BAR.verse; bar < BARS; bar += 1) {
    const chord = CHORDS[PROGRESSION[bar]];
    const holdToEnd = bar >= SECTION_BAR.end;
    for (const [voice, midi] of chord.pad.entries()) {
      const list = padNotes[voice];
      const start = barStart(bar);
      const end = holdToEnd ? DURATION_SECONDS + .2 : start + BAR_SECONDS;
      if (bar === SUS_BAR && voice === 0) {            // A7sus4 → A7（D3 から C#3 へ）
        list.push({ midi: 50, start, end: beatTime(bar, 2), attack: .35 });
        list.push({ midi, start: beatTime(bar, 2), end, attack: .25 });
        continue;
      }
      const previous = list.at(-1);
      if (previous && previous.midi === midi && Math.abs(previous.end - start) < 1e-9) previous.end = end;
      else list.push({ midi, start, end, attack: bar === SECTION_BAR.verse ? .8 : bar === SECTION_BAR.reveal ? .9 : .35 });
    }
  }
  for (const [voice, list] of padNotes.entries()) {
    for (const note of list) {
      padVoice(bus.pad, {
        start: note.start, length: note.end - note.start, midi: note.midi,
        gain: .075 * (voice === 0 ? .8 : 1), pan: (voice - 1.5) * .34, attack: note.attack, release: .9
      });
    }
  }

  // ワルツの低音（1拍目）と、2・3拍目の軽い和音
  const BASS_LEVEL = { verse: .9, build: .95, reveal: .85, chorus: 1, soft: .7, end: .8 };
  for (let bar = SECTION_BAR.verse; bar < SECTION_BAR.end + 1; bar += 1) {
    const chord = CHORDS[PROGRESSION[bar]];
    const section = sectionOf(bar);
    const length = bar === SECTION_BAR.end ? 3.6 : bar === SECTION_BAR.reveal ? 1.8 : BEAT * 1.25;
    bassNote(bus.waltz, { start: barStart(bar), midi: chord.root, gain: .3 * BASS_LEVEL[section] * (isA ? 1 : .9), length });
  }
  for (const bar of COMP_BARS) {
    const chord = CHORDS[PROGRESSION[bar]];
    const section = sectionOf(bar);
    const level = { verse: 1, build: .88, reveal: .8, chorus: 1 }[section];
    for (const beat of [1, 2]) {
      const start = beatTime(bar, beat) + jitter(5);
      const accent = (beat === 1 ? 1 : .82) * level * (.95 + human() * .1);
      for (const [k, midi] of chord.comp.entries()) {
        if (isA) harp(bus.waltz, { start: start + k * .012, midi, gain: .075 * accent, pan: -.3 + k * .12, ring: .5 });
        else guitar(bus.waltz, { start: start + k * .014, midi, gain: .1 * accent, pan: -.3 + k * .12, decay: .8, bright: .42, ring: .45, rand: pluck });
      }
    }
  }

  // 分散和音（A＝ハープ・B＝ギター）。低い音は左、高い音は右へ
  for (const [barKey, plan] of Object.entries(ARPS)) {
    const bar = Number(barKey);
    const chord = CHORDS[PROGRESSION[bar]];
    for (const [step, index] of plan.pattern.entries()) {
      if (index < 0) continue;
      const beat = step * plan.step;
      const midi = chord.arp[index];
      const start = beatTime(bar, beat) + jitter(5);
      const gain = plan.level * velocity(beat % 1 === 0 ? beat : .5);
      const pan = clamp((midi - 62) / 26, -.6, .6);
      if (isA) {
        harp(bus.arp, { start, midi, gain: .11 * gain, pan });
        if (plan.octave) harp(bus.arp, { start: start + .01, midi: midi + 12, gain: .05 * gain, pan: -pan * .5 });
      } else {
        guitar(bus.arp, { start, midi, gain: .15 * gain, pan, decay: 1.5, bright: .5, rand: pluck });
        if (plan.octave) guitar(bus.arp, { start: start + .01, midi: midi + 12, gain: .07 * gain, pan: -pan * .5, decay: 1.2, bright: .55, rand: pluck });
      }
    }
  }

  // 鐘の手前：D の和声的短音階で駆け上がる（A7 の上では A フリジアン・ドミナント＝謎めいた響き）
  {
    const run = isA
      ? [62, 64, 65, 67, 69, 70, 73, 74, 76, 77, 79, 81, 82, 85, 86]
      : [45, 52, 55, 58, 61, 64, 67, 70, 73, 76];
    const first = REVEAL_AT - 1;
    const spacing = .72 / run.length;
    for (const [k, midi] of run.entries()) {
      const gain = .6 + .4 * k / (run.length - 1);
      if (isA) harp(bus.arp, { start: first + k * spacing, midi, gain: .16 * gain, pan: clamp((midi - 74) / 20, -.6, .6), ring: 1.3 });
      else guitar(bus.arp, { start: first + k * spacing, midi, gain: .19 * gain, pan: clamp((midi - 60) / 24, -.6, .6), decay: 1.2, bright: .6, ring: 1.3, rand: pluck });
    }
  }

  // 16.0秒ちょうどに鐘（D）。同じ瞬間にワルツの低音 D2 も長めに弾く（上の低音のループ）
  bell(bus.bell, { start: REVEAL_AT, midi: 74, gain: .48, rand: noise });

  // きらめき（マークツリー）：鐘への駆け上がり、サビの頭、終止
  markTree(bus.perc, { start: REVEAL_AT - .95, count: 18, spacing: .04, gain: .035, rising: true, rand: noise });
  markTree(bus.perc, { start: barStart(SECTION_BAR.chorus) - .05, count: 16, spacing: .03, gain: .04, rand: noise });
  markTree(bus.perc, { start: END_START, count: 16, spacing: .045, gain: .032, rand: noise });

  // サビの副旋律（A＝ヴィオラ域、B＝チェロ域）
  for (const [barKey, notes] of Object.entries(COUNTER)) {
    const bar = Number(barKey);
    for (const [beat, midi, length] of notes) {
      const fade = bar === SECTION_BAR.soft ? .7 : 1;
      stringVoice(bus.counter, {
        start: beatTime(bar, beat), length: length * BEAT, midi: isA ? midi : midi - 12,
        gain: .18 * fade * (isA ? 1 : 1.15), pan: .28
      });
    }
  }

  // 打楽器：シェイカー（8分、ビルドの最後だけ16分）と指パッチン（2・3拍目）。ドラムは使わない
  for (const [barKey, level] of Object.entries(SHAKER)) {
    const bar = Number(barKey);
    const sixteenth = bar === SECTION_BAR.reveal - 1;
    const count = sixteenth ? 12 : 6;               // 16分は鐘の直前まで（最後の1粒は鐘の前の引きに掛かる）
    for (let step = 0; step < count; step += 1) {
      const beat = step * (sixteenth ? .25 : .5);
      const accent = beat % 1 === 0 ? 1 : .6;
      const crescendo = bar === SECTION_BAR.reveal + 1 ? .55 + .45 * beat / 3 : 1;
      shaker(bus.perc, { start: beatTime(bar, beat) + jitter(4), gain: .24 * level * accent * crescendo, pan: .32, rand: noise });
    }
  }
  // トライアングル：サビの各小節の頭と終止和音
  for (const bar of [SECTION_BAR.chorus, SECTION_BAR.chorus + 1, SECTION_BAR.chorus + 2, SECTION_BAR.end]) {
    triangleHit(bus.perc, { start: barStart(bar) + (bar === SECTION_BAR.end ? .02 : jitter(3)), gain: (isA ? .045 : .035) * (bar === SECTION_BAR.end ? .8 : 1) });
  }
  for (const [barKey, level] of Object.entries(SNAPS)) {
    const bar = Number(barKey);
    for (const beat of [1, 2]) {
      snap(bus.perc, { start: beatTime(bar, beat) + jitter(4), gain: .16 * level * (beat === 1 ? 1 : .85), pan: beat === 1 ? -.22 : .22, rand: noise });
    }
  }

  // 終止：D メジャーの和音を下から転がす。A は最後にチェレスタのきらめき
  {
    const roll = isA ? [38, 45, 50, 54, 57, 62, 66, 69, 74] : [50, 57, 62, 66, 69, 74];
    for (const [k, midi] of roll.entries()) {
      const start = END_START + k * (isA ? .035 : .03);
      if (isA) harp(bus.arp, { start, midi, gain: .12, pan: clamp((midi - 60) / 24, -.6, .6), ring: 4.2 });
      else guitar(bus.arp, { start, midi, gain: .16, pan: clamp((midi - 60) / 24, -.6, .6), decay: 2.8, bright: .45, ring: 4.2, rand: pluck });
    }
    if (isA) {
      for (const [k, midi] of [90, 93, 98].entries()) {
        celesta(bus.lead, { start: beatTime(SECTION_BAR.end + 1, 1 + k * .5), length: .6, midi, gain: .1, pan: .2, rand: noise });
      }
    }
  }

  // ── バスごとの処理 ──
  // パッドは場面で厚みと明るさを変える（ビルドで開き、サビで最大、薄くする場面で閉じる）
  const padLevel = automation([[0, 1], [10, 1], [15.5, 1.12], [16, 1], [19.5, 1.05], [20, 1.35], [25.5, 1.35], [26.5, .62], [30, .85], [34, .85]]);
  const padBright = automation([[0, 1], [10, 1], [16, 1.35], [20, 1.2], [26, .85], [30, 1], [34, 1]]);
  lowpassBus(bus.pad, (t) => 1150 * padBright(t) * (1 + .22 * Math.sin(TAU * .07 * t + .8)));
  for (let i = 0; i < FRAMES; i += 1) { const g = padLevel(i / SAMPLE_RATE); bus.pad.l[i] *= g; bus.pad.r[i] *= g; }
  lowpassBus(bus.counter, () => (isA ? 3000 : 1900));
  pingPong(bus.lead, { feedback: .3, wet: .14 });

  // 鐘の直前 0.2秒だけ伴奏を引く（15.8秒から下げ、16.0秒で最深、0.35秒で戻す）。鐘そのものは引かない
  for (let i = 0; i < FRAMES; i += 1) {
    const t = i / SAMPLE_RATE;
    if (t < REVEAL_AT - .2 || t > REVEAL_AT + .35) continue;
    const depth = t < REVEAL_AT - .15 ? (t - (REVEAL_AT - .2)) / .05 : t <= REVEAL_AT ? 1 : 1 - (t - REVEAL_AT) / .35;
    const g = 1 - DUCK_DEPTH * depth;
    for (const name of ['lead', 'arp', 'waltz', 'pad', 'counter', 'perc']) { bus[name].l[i] *= g; bus[name].r[i] *= g; }
  }

  // リバーブ（夜の館らしく長め）
  const SEND = { lead: .32, arp: .26, waltz: .14, pad: .2, counter: .28, perc: .12, bell: .5 };
  const sendL = new Float32Array(FRAMES); const sendR = new Float32Array(FRAMES);
  for (const [name, amount] of Object.entries(SEND)) {
    for (let i = 0; i < FRAMES; i += 1) { sendL[i] += bus[name].l[i] * amount; sendR[i] += bus[name].r[i] * amount; }
  }
  const reverb = freeverb(sendL, sendR, { room: .82, damp: .28 });

  // ── まとめ ──
  const left = new Float64Array(FRAMES); const right = new Float64Array(FRAMES);
  const REVERB_RETURN = .9;
  for (let i = 0; i < FRAMES; i += 1) {
    let l = reverb.l[i] * REVERB_RETURN; let r = reverb.r[i] * REVERB_RETURN;
    for (const name in bus) { l += bus[name].l[i]; r += bus[name].r[i]; }
    left[i] = l; right[i] = r;
  }
  return finish(left, right, noise, v);
}

/** 仕上げ：低域の掃除・高域の明るさ・フェード → -17 LUFS に合わせてピークを丸める → 16bit 用に TPDF ディザ */
function finish(left, right, rand, variant) {
  const SHELF_DB = 8;   // 楽器が暗めなので 6.5kHz より上を持ち上げる（8kHz 以上 -38〜-43 dBFS に入れる）
  for (const channel of [left, right]) {
    const highpass = biquad(rbj('highpass', 25));
    const shelf = biquad(rbj('highshelf', 6500, Math.SQRT1_2, SHELF_DB));
    for (let i = 0; i < FRAMES; i += 1) {
      const t = i / SAMPLE_RATE;
      const fadeIn = Math.min(1, t / .004);                       // 1コマ目から鳴らすので頭は 4ms だけ
      const fadeOut = clamp((DURATION_SECONDS - t) / 1.5, 0, 1);   // 最後の 1.5秒で消す
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
  for (let pass = 0; pass < 5; pass += 1) {
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
      const dither = (rand() - rand()) / 32768;
      const value = Math.round((channel[i] + dither) * 32767);
      if (value > 32767 || value < -32768) clipped += 1;
      pcm[i * CHANNELS + c] = clamp(value, -32768, 32767);
    }
  }
  return {
    pcm,
    info: {
      variant, lufs, truePeakDb: db(Math.max(truePeak(outL), truePeak(outR))),
      kneePercent: 100 * kneeHits / FRAMES, clipped, seconds: FRAMES / SAMPLE_RATE
    }
  };
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

/**
 * 曲を合成して WAV を書き出す（描画ツールから呼ぶ入口）
 * @param {string} outPath 書き出し先
 * @param {{ variant?: 'a' | 'b' }} options
 */
export function writeMusic(outPath, { variant = 'a' } = {}) {
  const { pcm, info } = synthesizeMusic({ variant });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encodeWav(pcm));
  return { ...info, outPath };
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const argValue = (name, fallback) => {
    const at = argv.indexOf(name);
    const next = at >= 0 ? argv[at + 1] : undefined;
    return next && !next.startsWith('--') ? next : fallback;
  };
  if (argv.includes('--help')) {
    console.log('node promo-audio.mjs [--variant a|b] [--out <絶対パス.wav>]');
    process.exit(0);
  }
  const variant = argValue('--variant', 'a').toLowerCase();
  const fallbackDir = process.env.PROMO_MUSIC_DIR || join(tmpdir(), 'day048-promo-music');
  const out = resolve(argValue('--out', join(fallbackDir, `promo-audio-${variant}.wav`)));
  try {
    const info = writeMusic(out, { variant });
    console.log(`WAVを書き出しました: ${out}`);
    console.log(`  ${VARIANT_LABEL[variant]} / D マイナー / 3/4拍子 / ${BPM} BPM / ${BARS}小節`);
    console.log(`  ${info.seconds.toFixed(3)}秒 / ${SAMPLE_RATE}Hz / 16bit / stereo`);
    console.log(`  ${info.lufs.toFixed(2)} LUFS / 真のピーク(推定) ${info.truePeakDb.toFixed(2)} dBTP / クリップ ${info.clipped}`);
    console.log(`  ピークを丸めた区間 ${info.kneePercent.toFixed(3)}%`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
