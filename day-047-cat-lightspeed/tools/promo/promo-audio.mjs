/* Day 047 プロモ動画の BGM「光速のラン」。外部パッケージ・外部音源なしの純JSで合成する。
   4/4拍子・120 BPM（1小節＝2秒）・E マイナー・34秒＝17小節。結果の場面（28秒）で E メジャーに解決する。
   エレクトロ＋オーケストラ風：分散和音・パッド・ベース・キックとハイハット・スネアのフィル・上昇するシンセ。
   場面の秒は timeline.mjs が正本で、楽譜はその小節割りに合わせて書いてある（合わなくなったら鳴らさず止める）。
   乱数は固定シードなので、同じ入力なら必ず同じ WAV になる。

   使い方（リポジトリ直下から）:
     node day-047-cat-lightspeed/tools/promo/promo-audio.mjs                A案（シンセ中心）
     node day-047-cat-lightspeed/tools/promo/promo-audio.mjs --variant b    B案（ピアノと弦が中心）
     node day-047-cat-lightspeed/tools/promo/promo-audio.mjs --out /abs/promo-audio-a.wav --mp3 --measure
   --out が無ければ $PROMO_MUSIC_DIR（未設定なら OS の一時フォルダ）の promo-audio-<案>.wav に書く。
   --mp3 は聴き比べ用の mp3（192kbps）を、--measure は ffmpeg の測定値とスペクトログラムを同じ場所に出す。
   描画ツールからは writeMusic(outPath, { variant }) を呼ぶ。import しただけでは何も書かない。 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BAR_SECONDS, BEATS_PER_BAR, BPM, DURATION_SECONDS, END_START, LIGHT_AT, STORYBOARD, VACUUM_FROM, VACUUM_TO
} from './timeline.mjs';

export const SAMPLE_RATE = 48_000;
export const TARGET_LUFS = -17;
const CHANNELS = 2;
const TAU = Math.PI * 2;
const BEAT = 60 / BPM;                                    // 0.5秒
const BARS = Math.round(DURATION_SECONDS / BAR_SECONDS);  // 17小節
const FRAMES = Math.round(DURATION_SECONDS * SAMPLE_RATE);
const PEAK_CEILING_DB = -2.5;   // サンプルピークの天井。真のピーク -1.5 dBTP に余白を残す
const VARIANT_LABEL = { a: 'A案（シンセ中心）', b: 'B案（ピアノと弦が中心）' };

// ── 楽譜 ──────────────────────────────────────────────────────────────────
// 場面（timeline の music）ごとの開始小節。楽譜はこの割り付けで書いてある
const SECTION_BAR = Object.freeze({ hook: 0, rise: 2, drive: 4, vacuum: 6, build: 8, lift: 10, climax: 12, resolve: 14, end: 15 });

/* 和音。root＝ベース、pad＝持続（4声・最低声部は C3 以上）、arp＝分散和音の音列（下から6音）。数値は MIDI ノート番号 */
const CHORDS = {
  Em: { root: 40, pad: [52, 59, 64, 67], arp: [64, 67, 71, 76, 79, 83] },
  C: { root: 36, pad: [52, 55, 60, 64], arp: [60, 64, 67, 72, 76, 79] },
  G: { root: 43, pad: [55, 59, 62, 67], arp: [62, 67, 71, 74, 79, 83] },
  D: { root: 38, pad: [54, 57, 62, 66], arp: [62, 66, 69, 74, 78, 81] },
  Am: { root: 45, pad: [52, 57, 60, 64], arp: [64, 69, 72, 76, 81, 84] },
  B7: { root: 47, pad: [54, 57, 59, 63], arp: [63, 66, 69, 71, 75, 78] },
  Em9: { root: 40, pad: [52, 59, 62, 66], arp: [64, 66, 67, 71, 74, 78] },
  Cmaj7: { root: 36, pad: [48, 55, 59, 64], arp: [60, 64, 67, 71, 76, 79] },
  E: { root: 40, pad: [52, 59, 64, 68], arp: [64, 68, 71, 76, 80, 83] }
};
// 1小節に1〜2和音。真空（6・7小節）は9度と長7度で浮かせ、終盤は和音を半小節ずつ速めて B7 から E メジャーへ解決する
const PROGRESSION = [
  ['Em'], ['C'], ['G'], ['D'], ['Em'], ['C', 'D'], ['Em9'], ['Cmaj7'], ['Am'],
  ['C', 'D'], ['Em'], ['C', 'D'], ['Em', 'C'], ['D', 'B7'], ['E'], ['E'], ['E']
];

/* 主旋律。[小節頭からの拍, MIDI, 長さ(拍)]。動機は「E G B–A｜G F# G B」＝主和音を駆け上がって刺繍で戻る形。
   上昇（10・11小節）は3度ずつ積み上げ、頂点（12・13小節）で動機を速い和音の上に戻し、D# から E メジャーへ解く */
const LEAD = [
  [[0, 76, .5], [.5, 79, .5], [1, 83, .75], [1.75, 81, .25], [2, 79, .5], [2.5, 78, .5], [3, 79, .5], [3.5, 71, .5]],   // 0 Em  動機
  [[0, 76, .5], [.5, 79, .5], [1, 84, .75], [1.75, 83, .25], [2, 79, .5], [2.5, 76, .5], [3, 74, 1]],                   // 1 C
  [[0, 74, .5], [.5, 79, .5], [1, 83, .75], [1.75, 81, .25], [2, 79, .5], [2.5, 74, .5], [3, 79, .5], [3.5, 81, .5]],   // 2 G   応答
  [[0, 78, 1.5], [1.5, 74, .5], [2, 78, .5], [2.5, 81, .5], [3, 86, .5], [3.5, 83, .5]],                                 // 3 D
  [[0, 76, .5], [.5, 79, .5], [1, 83, .75], [1.75, 81, .25], [2, 79, .5], [2.5, 78, .5], [3, 79, .5], [3.5, 71, .5]],   // 4 Em  動機をもう一度
  [[0, 76, .5], [.5, 79, .5], [1, 84, .5], [1.5, 83, .5], [2, 81, .5], [2.5, 78, .5], [3, 81, .5], [3.5, 83, .5]],      // 5 C|D 後半を上へ
  [], [],                                                                                                                // 6-7 真空：旋律なし
  [[0, 76, .5], [.5, 81, .5], [1, 84, 1], [2, 76, .5], [2.5, 81, .5], [3, 83, 1]],                                       // 8 Am  動機の頭だけ
  [[0, 84, .5], [.5, 79, .5], [1, 76, .5], [1.5, 79, .5], [2, 86, .5], [2.5, 81, .5], [3, 78, .5], [3.5, 81, .5]],      // 9 C|D
  [[0, 76, .5], [.5, 79, .5], [1, 78, .5], [1.5, 81, .5], [2, 79, .5], [2.5, 83, .5], [3, 81, .5], [3.5, 84, .5]],      // 10 Em 3度ずつ上がる
  [[0, 83, .5], [.5, 86, .5], [1, 84, .5], [1.5, 88, .5], [2, 86, .5], [2.5, 90, .5], [3, 88, .5], [3.5, 90, .5]],      // 11 C|D
  [[0, 76, .5], [.5, 79, .5], [1, 83, .75], [1.75, 81, .25], [2, 84, .5], [2.5, 83, .5], [3, 79, .5], [3.5, 76, .5]],   // 12 Em|C 頂点
  [[0, 78, .5], [.5, 81, .5], [1, 86, .75], [1.75, 84, .25], [2, 83, .5], [2.5, 81, .5], [3, 78, .5], [3.5, 75, .5]],   // 13 D|B7
  [[0, 76, .5], [.5, 80, .5], [1, 83, .5], [1.5, 88, 2.5]],                                                              // 14 E   解決
  [[0, 88, .5], [.5, 83, .5], [1, 80, .5], [1.5, 76, 2.5]],                                                              // 15 E   余韻（小さく）
  []
];
// 弦の副旋律。上昇では E→G→C→D と持ち上げ、頂点では B→C→D→D#→E と半音で解決へ寄せる
const COUNTER = {
  10: [[0, 64, 2], [2, 67, 2]],
  11: [[0, 72, 2], [2, 74, 2]],
  12: [[0, 71, 2], [2, 72, 2]],
  13: [[0, 74, 2], [2, 75, 2]],
  14: [[0, 76, 4]]
};
// 分散和音。step＝拍の分割、pattern＝和音の音列の番号（-1 は休み）。16分は3・3・2の区切りで前へ転がす
const ARP8 = [0, 2, 4, 2, 1, 3, 5, 3];
const ARP16 = [0, 2, 4, 0, 2, 4, 0, 2, 1, 3, 5, 1, 3, 5, 1, 3];
const CASCADE = [5, 3, 4, 2, 3, 1, 2, 0, 5, 3, 4, 2, 3, 1, 2, 0];
const ARPS = {
  0: { step: 1 / 2, pattern: ARP8, level: .9, bright: .5 },
  1: { step: 1 / 2, pattern: ARP8, level: .9, bright: .55 },
  2: { step: 1 / 2, pattern: ARP8, level: .85, bright: .6 },
  3: { step: 1 / 4, pattern: ARP16, level: .8, bright: .7 },
  4: { step: 1 / 4, pattern: ARP16, level: .9, bright: .85 },
  5: { step: 1 / 4, pattern: ARP16, level: .9, bright: .9 },
  8: { step: 1 / 4, pattern: ARP16, level: .8, bright: .55 },
  9: { step: 1 / 4, pattern: ARP16, level: .85, bright: .85 },
  10: { step: 1 / 4, pattern: ARP16, level: .9, bright: 1 },
  11: { step: 1 / 4, pattern: ARP16, level: .95, bright: 1.05, octaveFrom: 2 },
  12: { step: 1 / 4, pattern: ARP16, level: 1, bright: 1.15, octaveFrom: 0 },
  13: { step: 1 / 4, pattern: ARP16, level: 1, bright: 1.15, octaveFrom: 0 },
  14: { step: 1 / 4, pattern: CASCADE, level: .7, bright: 1 },
  15: { step: 1 / 2, pattern: [5, 4, 3, 2, 3, 4, 5, 4], level: .45, bright: .75 },
  16: { step: 1 / 2, pattern: [5, 4, 3, 2, 1, 0, -1, -1], level: .3, bright: .6 }
};

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

/** RBJ の双2次フィルタ係数 [b0, b1, b2, a1, a2]（仕上げの固定フィルタ用） */
function rbj(type, frequency, q = Math.SQRT1_2, gainDb = 0) {
  const w0 = TAU * frequency / SAMPLE_RATE;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const amp = 10 ** (gainDb / 40);
  const root = 2 * Math.sqrt(amp) * alpha;
  let c;
  if (type === 'highpass') c = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
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
/** 状態変数フィルタ（TPT 型）。カットオフを1サンプルごとに動かせる */
function svf(mode = 'low') {
  let ic1 = 0; let ic2 = 0;
  return (x, cutoff, q = Math.SQRT1_2) => {
    const g = Math.tan(Math.PI * clamp(cutoff, 10, SAMPLE_RATE * .45) / SAMPLE_RATE);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)); const a2 = g * a1; const a3 = g * a2;
    const v3 = x - ic2; const v1 = a1 * ic1 + a2 * v3; const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    return mode === 'low' ? v2 : mode === 'band' ? v1 : x - k * v1 - v2;
  };
}
/** 折り返しを抑えた鋸歯波・矩形波（PolyBLEP）。osc は { phase } を持ち回る */
function polyBlep(phase, step) {
  if (phase < step) { const x = phase / step; return x + x - x * x - 1; }
  if (phase > 1 - step) { const x = (phase - 1) / step; return x * x + x + x + 1; }
  return 0;
}
function saw(osc, step) {
  osc.phase += step; if (osc.phase >= 1) osc.phase -= 1;
  return 2 * osc.phase - 1 - polyBlep(osc.phase, step);
}
function pulse(osc, step) {
  osc.phase += step; if (osc.phase >= 1) osc.phase -= 1;
  const half = osc.phase + .5 >= 1 ? osc.phase - .5 : osc.phase + .5;
  return (osc.phase < .5 ? 1 : -1) + polyBlep(osc.phase, step) - polyBlep(half, step);
}
const add = (bus, i, sample, gl, gr) => { bus.l[i] += sample * gl; bus.r[i] += sample * gr; };

// ── 音色（旋律と和音） ────────────────────────────────────────────────────

/** A案の主旋律：わずかにずらした鋸歯3本＋1オクターブ下の矩形。音の頭でフィルタが開いて閉じる */
function synthLead(bus, { start, length, midi, gain, pan = 0, bright = 1 }) {
  const [gl, gr] = panGains(pan);
  const seconds = length + .16;
  const f = hz(midi);
  const oscs = [-11, 0, 10].map((cents, k) => ({ ratio: 2 ** (cents / 1200), phase: (k * .37) % 1 }));
  const sub = { phase: .1 };
  const filter = svf('low');
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const vibrato = 1 + clamp((t - .2) / .3, 0, 1) * .0045 * Math.sin(TAU * 5.5 * t);
    let wave = 0;
    for (const osc of oscs) wave += saw(osc, f * osc.ratio * vibrato / SAMPLE_RATE);
    wave = wave / 3 + .28 * pulse(sub, f * .5 * vibrato / SAMPLE_RATE);
    const cutoff = (1300 + 4200 * Math.exp(-t / .2)) * bright * (1 + .0005 * f);   // 高い音ほど少し明るく
    const hold = .74 + .26 * Math.exp(-Math.min(t, length) / .14);
    const env = Math.min(1, t / .005) * hold * (t < length ? 1 : Math.exp(-(t - length) / .03)) * Math.min(1, (seconds - t) / .005);
    add(bus, i, filter(wave, cutoff, .95) * env * gain, gl, gr);
  }
}

/** A案の分散和音：鋸歯2本を、フィルタの速い減衰で「ポン」と弾く */
function pluckSynth(bus, { start, length, midi, gain, pan = 0, bright = 1 }) {
  const [gl, gr] = panGains(pan);
  const seconds = length + .12;
  const f = hz(midi);
  const oscs = [-7, 7].map((cents, k) => ({ ratio: 2 ** (cents / 1200), phase: k * .5 }));
  const filter = svf('low');
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const wave = (saw(oscs[0], f * oscs[0].ratio / SAMPLE_RATE) + saw(oscs[1], f * oscs[1].ratio / SAMPLE_RATE)) * .5;
    const cutoff = 280 + (700 + 5600 * Math.exp(-t / .06)) * bright;
    const env = Math.min(1, t / .002) * Math.exp(-t / .22) * (t < length ? 1 : Math.exp(-(t - length) / .03)) * Math.min(1, (seconds - t) / .005);
    add(bus, i, filter(wave, cutoff, 1.1) * env * gain, gl, gr);
  }
}

/** パッド：わずかにずらした3本の鋸歯＋三角。明るさ（ローパス）はバスでまとめて掛ける */
function padVoice(bus, { start, length, midi, gain, pan = 0, attack = .4, release = .8 }) {
  const [gl, gr] = panGains(pan);
  const seconds = length + release;
  const oscs = [-8, 0, 7].map((cents, k) => ({ step: hz(midi) * 2 ** (cents / 1200) / SAMPLE_RATE, phase: k * .37 }));
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    let wave = 0;
    for (const osc of oscs) {
      const s = saw(osc, osc.step);
      wave += s * .55 + (1 - 4 * Math.abs(osc.phase - .5)) * .45;
    }
    const rise = Math.sin(Math.min(1, t / attack) * Math.PI / 2);
    const fall = t < length ? 1 : Math.cos(Math.min(1, (t - length) / release) * Math.PI / 2);
    add(bus, i, wave / 3 * rise * fall * gain, gl, gr);
  }
}

/** 弦：ビブラート付きの鋸歯を3本。弓の立ち上がりは attack で決める（短くすればスピッカート） */
function stringVoice(bus, { start, length, midi, gain, pan = 0, attack = .16, release = .35, vibrato = .0055 }) {
  const [gl, gr] = panGains(pan);
  const seconds = length + release;
  const base = hz(midi);
  const oscs = [-7, 0, 6].map((cents, k) => ({ ratio: 2 ** (cents / 1200), phase: k * .33, offset: k * 1.7 }));
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const depth = clamp((t - .15) / .35, 0, 1) * vibrato;
    let wave = 0;
    for (const osc of oscs) wave += saw(osc, base * osc.ratio * (1 + depth * Math.sin(TAU * 5.3 * t + osc.offset)) / SAMPLE_RATE);
    const rise = Math.sin(Math.min(1, t / attack) * Math.PI / 2);
    const fall = t < length ? 1 : Math.cos(Math.min(1, (t - length) / release) * Math.PI / 2);
    add(bus, i, wave / 3 * rise * fall * gain, gl, gr);
  }
}

/** B案のピアノ：弦の部分音（わずかな非調和性・打つ位置で重み付け）を2本の弦でうならせる。離鍵でダンパーが止める */
function piano(bus, { start, length, midi, gain, pan = 0, velocity = 1, rand }) {
  const [gl, gr] = panGains(pan);
  const f = hz(midi);
  const decay = clamp(2.4 * (262 / f) ** .5, .7, 5);   // 低い弦ほど長く鳴る
  const seconds = Math.min(length + .45, decay * 3);
  const parts = [];
  let sum = 0;
  for (let n = 1; n <= 12; n += 1) {
    const partial = f * n * Math.sqrt(1 + .00035 * n * n);
    if (partial > 13_000) break;
    const amp = Math.abs(Math.sin(Math.PI * n / 7.4)) / n ** (1.45 - .45 * velocity);
    parts.push({ w1: TAU * partial / SAMPLE_RATE, w2: TAU * partial * 1.0007 / SAMPLE_RATE, amp, fall: Math.exp(-(1 + .5 * (n - 1)) / (decay * SAMPLE_RATE)) });
    sum += amp;
  }
  for (const part of parts) part.amp /= sum;
  const thump = svf('low');
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const j = i - first;
    let wave = 0;
    for (const part of parts) { wave += part.amp * (Math.sin(part.w1 * j) + Math.sin(part.w2 * j + .3)); part.amp *= part.fall; }
    const hammer = t < .03 ? thump(rand() * 2 - 1, 2400) * .5 * Math.exp(-t / .004) : 0;
    const damper = t < length ? 1 : Math.exp(-(t - length) / .09);
    const env = (1 - Math.exp(-t / .0015)) * damper * Math.min(1, (seconds - t) / .02);
    add(bus, i, (wave * .5 + hammer) * env * gain, gl, gr);
  }
}

/** A案のベース：鋸歯を短いフィルタの開閉で弾き、同じ高さの正弦で芯を足す */
function synthBass(bus, { start, length, midi, gain }) {
  const f = hz(midi);
  const seconds = length + .05;
  const osc = { phase: 0 };
  const filter = svf('low');
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const s = saw(osc, f / SAMPLE_RATE);
    const body = filter(s, 340 + 1600 * Math.exp(-t / .06), 1.1) * .85 + Math.sin(TAU * osc.phase) * .14;
    const env = Math.min(1, t / .003) * (t < length ? 1 : Math.exp(-(t - length) / .015)) * Math.min(1, (seconds - t) / .004);
    const sample = body * env * gain;
    bus.l[i] += sample; bus.r[i] += sample;
  }
}

/** B案のベース：チェロとコントラバスの短い弓（鋸歯2本を暗く）＋正弦の芯 */
function bowedBass(bus, { start, length, midi, gain }) {
  const f = hz(midi);
  const seconds = length + .08;
  const oscs = [-5, 5].map((cents, k) => ({ ratio: 2 ** (cents / 1200), phase: k * .5 }));
  const filter = svf('low');
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const s = (saw(oscs[0], f * oscs[0].ratio / SAMPLE_RATE) + saw(oscs[1], f * oscs[1].ratio / SAMPLE_RATE)) * .5;
    const body = filter(s, 800 + 500 * Math.exp(-t / .04), .9) * .9 + Math.sin(TAU * oscs[0].phase) * .15;
    const env = Math.sin(Math.min(1, t / .012) * Math.PI / 2) * (t < length ? 1 : Math.exp(-(t - length) / .03)) * Math.min(1, (seconds - t) / .005);
    const sample = body * env * gain;
    bus.l[i] += sample; bus.r[i] += sample;
  }
}

// ── 音色（打楽器と効果） ──────────────────────────────────────────────────

/** キック：正弦のピッチを 160Hz から 45Hz へ落とす。スマホのスピーカーでも聞こえるよう、2倍音と打点の音を足す */
function kick(bus, { start, gain, rand }) {
  const seconds = .42;
  const click = svf('band');
  let phase = 0;
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    phase += TAU * (48 + 125 * Math.exp(-t / .03)) / SAMPLE_RATE;
    const body = Math.sin(phase) * .8 * Math.exp(-t / .07);
    const punch = Math.sin(phase * 2) * .75 * Math.exp(-t / .05);
    const tick = t < .02 ? click(rand() * 2 - 1, 3200, 1.2) * 1.1 * Math.exp(-t / .004) : 0;
    const sample = (body + punch + tick) * Math.min(1, t / .001) * Math.min(1, (seconds - t) / .02) * gain;
    bus.l[i] += sample; bus.r[i] += sample;
  }
}

/** スネア：帯域を絞ったノイズ＋胴鳴り（188Hz）＋高域のざらつき */
function snare(bus, { start, gain, pan = 0, rand }) {
  const [gl, gr] = panGains(pan);
  const seconds = .3;
  const band = svf('band'); const air = svf('high');
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const n = rand() * 2 - 1;
    const shell = Math.sin(TAU * 188 * t) * .55 * Math.exp(-t / .05) + Math.sin(TAU * 331 * t) * .2 * Math.exp(-t / .03);
    const wires = band(n, 1900, .8) * 1.3 * Math.exp(-t / .075) + air(n, 5500) * .35 * Math.exp(-t / .06);
    add(bus, i, (shell + wires) * Math.min(1, t / .0008) * Math.min(1, (seconds - t) / .02) * gain, gl, gr);
  }
}

/** クラップ：短いノイズを3回ずらして重ね、残りを伸ばす */
function clap(bus, { start, gain, rand }) {
  const seconds = .35;
  const bandL = svf('band'); const bandR = svf('band');
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    let env = 0;
    for (const at of [0, .009, .019]) if (t >= at) env = Math.max(env, Math.exp(-(t - at) / (at === .019 ? .09 : .006)));
    const fade = Math.min(1, (seconds - t) / .02);
    bus.l[i] += bandL(rand() * 2 - 1, 1250, 1.1) * env * fade * gain;
    bus.r[i] += bandR(rand() * 2 - 1, 1350, 1.1) * env * fade * gain;
  }
}

/** ハイハット：ハイパスしたノイズ。open で伸ばす */
function hat(bus, { start, gain, open = false, pan = .15, rand }) {
  const [gl, gr] = panGains(pan);
  const seconds = open ? .3 : .06;
  const tau = open ? .1 : .017;
  const high = svf('high');
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    add(bus, i, high(rand() * 2 - 1, 7600, .8) * Math.exp(-t / tau) * Math.min(1, t / .0005) * Math.min(1, (seconds - t) / .01) * gain, gl, gr);
  }
}

/* シンバルの金属の部分音（Hz・振幅）。ノイズだけだと「さー」になるので、にじむ倍音を少し足す */
const CYMBAL_PARTIALS = [[3150, .22], [4230, .2], [5270, .17], [6810, .15], [8210, .12], [9650, .1], [11_900, .07]];
/** クラッシュ：左右で別のノイズ＋金属の部分音。長く減衰させる */
function crash(bus, { start, gain, seconds = 2.2, rand }) {
  const highL = svf('high'); const highR = svf('high');
  const phases = CYMBAL_PARTIALS.map(() => rand() * TAU);
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    let metal = 0;
    for (const [k, [f, amp]] of CYMBAL_PARTIALS.entries()) metal += amp * Math.sin(TAU * f * t + phases[k]) * Math.exp(-t / (.5 + .1 * k));
    const env = Math.min(1, t / .002) * Math.exp(-t / .75) * Math.min(1, (seconds - t) / .2) * gain;
    bus.l[i] += (highL(rand() * 2 - 1, 4800, .7) * .9 + metal * .5) * env;
    bus.r[i] += (highR(rand() * 2 - 1, 4800, .7) * .9 - metal * .5) * env;
  }
}

/** ティンパニ：膜の部分音（1・1.5・1.99・2.44倍）と、打った瞬間の低いノイズ */
function timpani(bus, { start, midi, gain, rand }) {
  const f = hz(midi);
  const seconds = 1.6;
  const thud = svf('low');
  const modes = [[1, 1, .9], [1.5, .45, .55], [1.99, .3, .4], [2.44, .16, .3]];
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const bend = 1 + .03 * Math.exp(-t / .05);   // 叩いた瞬間だけ少し高い
    let wave = 0;
    for (const [ratio, amp, decay] of modes) wave += amp * Math.sin(TAU * f * ratio * bend * t) * Math.exp(-t / decay);
    const hit = t < .05 ? thud(rand() * 2 - 1, 900) * Math.exp(-t / .012) : 0;
    const sample = (wave * .7 + hit) * Math.min(1, t / .002) * Math.min(1, (seconds - t) / .2) * gain;
    bus.l[i] += sample; bus.r[i] += sample;
  }
}

/** 鼓動：「ドッ・クン」。胸に響く低いうなりに、スマホでも聞こえる 120〜180Hz の倍音を足す */
function heartbeat(bus, { start, gain }) {
  for (const [offset, level, pitch] of [[0, 1, 58], [.25, .7, 66]]) {
    const at = start + offset;
    let phase = 0;
    const [first, last] = frames(at, .36);
    for (let i = first; i < last; i += 1) {
      const t = i / SAMPLE_RATE - at;
      if (t < 0) continue;
      phase += TAU * pitch * (.8 + .35 * Math.exp(-t / .025)) / SAMPLE_RATE;
      const wave = Math.sin(phase) + .8 * Math.sin(phase * 2.5) * Math.exp(-t / .06);
      const sample = wave * Math.min(1, t / .006) * Math.exp(-t / .09) * Math.min(1, (.36 - t) / .03) * level * gain;
      bus.l[i] += sample; bus.r[i] += sample;
    }
  }
}

/** 低い衝撃音（真空に入る瞬間）：正弦を 70Hz から 32Hz へ沈める */
function boom(bus, { start, gain }) {
  const seconds = 1.4;
  let phase = 0;
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    phase += TAU * (32 + 38 * Math.exp(-t / .18)) / SAMPLE_RATE;
    const sample = (Math.sin(phase) + .25 * Math.sin(phase * 3) * Math.exp(-t / .12)) * Math.min(1, t / .004) * Math.exp(-t / .45) * Math.min(1, (seconds - t) / .2) * gain;
    bus.l[i] += sample; bus.r[i] += sample;
  }
}

/** ライザー：帯域を上へ動かすノイズ。rising=false で下る（ダウンリフター） */
function riser(bus, { start, seconds, gain, from = 350, to = 9000, rising = true, rand }) {
  const bandL = svf('band'); const bandR = svf('band');
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const k = t / seconds;
    const center = from * (to / from) ** k;
    const env = (rising ? k * k : (1 - k) ** 2) * Math.min(1, t / .01) * Math.min(1, (seconds - t) / .01) * gain;
    bus.l[i] += bandL(rand() * 2 - 1, center, 1.6) * env;
    bus.r[i] += bandR(rand() * 2 - 1, center * 1.03, 1.6) * env;
  }
}

/** 上昇するシンセ：鋸歯の音程を2オクターブ引き上げ、フィルタも一緒に開く */
function uplifter(bus, { start, seconds, midi, gain }) {
  const oscs = [-9, 9].map((cents, k) => ({ ratio: 2 ** (cents / 1200), phase: k * .5 }));
  const filter = svf('low');
  const [first, last] = frames(start, seconds);
  for (let i = first; i < last; i += 1) {
    const t = i / SAMPLE_RATE - start;
    if (t < 0) continue;
    const k = t / seconds;
    const f = hz(midi + 24 * k * k);
    const wave = (saw(oscs[0], f * oscs[0].ratio / SAMPLE_RATE) + saw(oscs[1], f * oscs[1].ratio / SAMPLE_RATE)) * .5;
    const sample = filter(wave, 500 + 5500 * k * k, 1.4) * k * Math.min(1, (seconds - t) / .01) * gain;
    bus.l[i] += sample * .8; bus.r[i] += sample;
  }
}

// ── 効果 ──────────────────────────────────────────────────────────────────

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

/** バス全体に、時間で動くローパス（12dB/oct）を掛ける。bypassAbove より上のカットオフでは素通し */
function lowpassBus(bus, cutoffAt, q = Math.SQRT1_2, bypassAbove = Infinity) {
  const left = svf('low'); const right = svf('low');
  for (let i = 0; i < FRAMES; i += 1) {
    const cutoff = cutoffAt(i / SAMPLE_RATE);
    const l = left(bus.l[i], cutoff, q); const r = right(bus.r[i], cutoff, q);
    if (cutoff < bypassAbove) { bus.l[i] = l; bus.r[i] = r; }
  }
}

/** バス全体に固定のハイパス（12dB/oct） */
function highpassBus(bus, cutoff) {
  const left = svf('high'); const right = svf('high');
  for (let i = 0; i < FRAMES; i += 1) { bus.l[i] = left(bus.l[i], cutoff); bus.r[i] = right(bus.r[i], cutoff); }
}

/** 付点8分のピンポンディレイ（返りは高域を落とす） */
function pingPong(bus, { feedback = .32, wet = .15 }) {
  const delay = Math.round(BEAT * .75 * SAMPLE_RATE);
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
function freeverb(inputL, inputR, { room = .8, damp = .35 } = {}) {
  const scale = SAMPLE_RATE / 44_100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const allpasses = [556, 441, 341, 225];
  const out = { l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) };
  for (const [channel, spread] of [['l', 0], ['r', 23]]) {
    const combLines = combs.map((size) => ({ line: new Float32Array(Math.round((size + spread) * scale)), cursor: 0, store: 0 }));
    const apLines = allpasses.map((size) => ({ line: new Float32Array(Math.round((size + spread) * scale)), cursor: 0 }));
    const target = out[channel];
    for (let i = 0; i < FRAMES; i += 1) {
      const input = (inputL[i] + inputR[i]) * .15;
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
  if (BPM !== 120 || BEATS_PER_BAR !== 4 || Math.abs(BAR_SECONDS - BEATS_PER_BAR * BEAT) > 1e-9) {
    problems.push(`4/4拍子・120 BPM・1小節2秒の前提（いまは ${BEATS_PER_BAR}拍・${BPM} BPM・${BAR_SECONDS}秒）`);
  }
  if (BARS !== LEAD.length || BARS !== PROGRESSION.length || Math.abs(BARS * BAR_SECONDS - DURATION_SECONDS) > 1e-9) {
    problems.push(`尺は ${LEAD.length}小節＝${LEAD.length * BAR_SECONDS}秒の前提（いまは ${DURATION_SECONDS}秒）`);
  }
  for (const [music, bar] of Object.entries(SECTION_BAR)) {
    const scene = STORYBOARD.find((item) => item.music === music);
    if (!scene || Math.abs(scene.start - bar * BAR_SECONDS) > 1e-9) problems.push(`${music} は ${bar * BAR_SECONDS}秒始まりの前提`);
  }
  if (VACUUM_FROM !== SECTION_BAR.vacuum * BAR_SECONDS || VACUUM_TO !== SECTION_BAR.build * BAR_SECONDS) problems.push('真空は12〜16秒の前提');
  if (LIGHT_AT !== SECTION_BAR.lift * BAR_SECONDS) problems.push(`上昇音型は ${SECTION_BAR.lift * BAR_SECONDS}秒始まりの前提`);
  if (END_START !== SECTION_BAR.end * BAR_SECONDS) problems.push(`余韻は ${SECTION_BAR.end * BAR_SECONDS}秒始まりの前提`);
  if (problems.length) {
    throw new Error(`timeline.mjs が BGM の楽譜と合いません。promo-audio.mjs の楽譜を書き直してください: ${problems.join(' / ')}`);
  }
}

/**
 * 曲を合成して、16bit・左右交互の PCM（Int16Array）と測定値を返す（書き出しはしない）
 * @param {{ variant?: 'a' | 'b' }} options
 */
export function synthesizeMusic({ variant = 'a' } = {}) {
  const v = String(variant).toLowerCase();
  if (v !== 'a' && v !== 'b') throw new Error(`variant は a か b だけです（受け取った値: ${variant}）`);
  checkTimeline();
  const isA = v === 'a';
  const human = randomFactory(0x0470a1);   // タイミングと強弱の揺れ（A・B 共通）
  const noise = randomFactory(0x0470a2);   // 打楽器・効果・打鍵のノイズ
  const barStart = (bar) => bar * BAR_SECONDS;
  const beatTime = (bar, beat) => barStart(bar) + beat * BEAT;
  const sectionOf = (bar) => Object.entries(SECTION_BAR).filter(([, first]) => first <= bar).at(-1)[0];
  const chordAt = (bar, beat) => {
    const list = PROGRESSION[bar];
    return CHORDS[list[Math.min(list.length - 1, Math.floor(beat / (BEATS_PER_BAR / list.length)))]];
  };
  const jitter = (ms) => (human() * 2 - 1) * ms / 1000;
  const bus = {
    lead: makeBus(), arp: makeBus(), pad: makeBus(), strings: makeBus(), bass: makeBus(),
    kick: makeBus(), drums: makeBus(), snare: makeBus(), fx: makeBus(), heart: makeBus()
  };
  const kickTimes = [];
  const kickAt = (time, level = 1) => { kickTimes.push(time); kick(bus.kick, { start: time, gain: (isA ? .28 : .31) * level, rand: noise }); };

  // 主旋律。A はシンセ（頂点は1オクターブ上を重ねる）。B は前半ピアノ、上昇から先は弦が歌い、ピアノが上で光る
  const LEAD_LEVEL = { hook: .95, rise: .92, drive: 1, build: .82, lift: .95, climax: 1.08, resolve: 1.05, end: .45 };
  for (const [bar, notes] of LEAD.entries()) {
    const section = sectionOf(bar);
    for (const [beat, midi, length] of notes) {
      const exact = bar === 0 && beat === 0;          // 1コマ目から鳴らすので最初の音は揺らさない
      const start = beatTime(bar, beat) + (exact ? 0 : jitter(3));
      const accent = (beat % 1 === 0 ? 1 : .9) * (.95 + human() * .1);
      const gain = LEAD_LEVEL[section] * accent;
      const held = length * BEAT * (length >= 1 ? .97 : .88);   // 短い音は少し切って刻みを立てる
      if (isA) {
        if (section === 'end') pluckSynth(bus.lead, { start, length: held + .3, midi, gain: .22 * gain, pan: .1, bright: .7 });
        else synthLead(bus.lead, { start, length: held, midi, gain: .19 * gain, pan: -.05, bright: section === 'hook' ? .82 : section === 'climax' ? 1.2 : 1 });
        if (section === 'climax' || section === 'resolve') synthLead(bus.lead, { start: start + .004, length: held, midi: midi + 12, gain: .06 * gain, pan: .28 });
      } else if (['lift', 'climax', 'resolve'].includes(section)) {
        stringVoice(bus.strings, { start, length: held + .04, midi, gain: .2 * gain, pan: -.12, attack: .03, release: .18 });
        piano(bus.lead, { start: start + .003, length: held, midi: midi + 12, gain: .3 * gain, pan: .22, velocity: .8, rand: noise });
      } else {
        piano(bus.lead, { start, length: held + .08, midi, gain: .62 * gain, pan: -.06, velocity: .9, rand: noise });
      }
    }
  }

  // 分散和音（A＝シンセのポン、B＝ピアノ）。低い音は左、高い音は右へ
  for (const [barKey, plan] of Object.entries(ARPS)) {
    const bar = Number(barKey);
    for (const [step, index] of plan.pattern.entries()) {
      if (index < 0) continue;
      const beat = step * plan.step;
      const chord = chordAt(bar, beat);
      const midi = chord.arp[index];
      const start = beatTime(bar, beat) + (bar === 0 && step === 0 ? 0 : jitter(2));
      const length = plan.step * BEAT * .9;
      const accent = (beat % 1 === 0 ? 1 : step % 2 ? .78 : .88) * (.95 + human() * .1);
      const bright = plan.bright * (bar === SECTION_BAR.build ? .55 + .45 * beat / BEATS_PER_BAR : 1);   // 立て直しは小節の中で明るく
      const pan = clamp((midi - 72) / 22, -.55, .55);
      const octave = plan.octaveFrom !== undefined && beat >= plan.octaveFrom;
      if (isA) {
        pluckSynth(bus.arp, { start, length, midi, gain: .15 * plan.level * accent, pan, bright });
        if (octave) pluckSynth(bus.arp, { start: start + .003, length, midi: midi + 12, gain: .055 * plan.level * accent, pan: -pan * .6, bright });
      } else {
        piano(bus.arp, { start, length: length + .05, midi, gain: .3 * plan.level * accent, pan, velocity: .45 + .4 * bright, rand: noise });
        if (octave) piano(bus.arp, { start: start + .003, length, midi: midi + 12, gain: .12 * plan.level * accent, pan: -pan * .6, velocity: .6, rand: noise });
      }
    }
  }

  // パッド（A＝シンセ、B＝弦の合奏）：同じ高さが続く声部はつなげて、和音ごとに息継ぎしない
  const padNotes = [[], [], [], []];
  for (let bar = 0; bar < BARS; bar += 1) {
    const list = PROGRESSION[bar];
    for (const [k, name] of list.entries()) {
      const start = barStart(bar) + k * BAR_SECONDS / list.length;
      const end = bar === BARS - 1 ? DURATION_SECONDS + .1 : start + BAR_SECONDS / list.length;
      for (const [voice, midi] of CHORDS[name].pad.entries()) {
        const notes = padNotes[voice];
        const previous = notes.at(-1);
        if (previous && previous.midi === midi && Math.abs(previous.end - start) < 1e-9) previous.end = end;
        else notes.push({ midi, start, end, attack: bar === 0 ? .08 : bar === SECTION_BAR.vacuum ? .6 : .3 });
      }
    }
  }
  for (const [voice, notes] of padNotes.entries()) {
    for (const note of notes) {
      const options = { start: note.start, length: note.end - note.start, midi: note.midi, pan: (voice - 1.5) * .36, attack: note.attack };
      if (isA) padVoice(bus.pad, { ...options, gain: .07 * (voice === 0 ? .75 : 1), release: .6 });
      else stringVoice(bus.pad, { ...options, gain: .085 * (voice === 0 ? .8 : 1), attack: Math.max(.25, note.attack), release: .6, vibrato: .004 });
    }
  }

  // 弦の副旋律（上昇と頂点）。A では控えめにオーケストラの厚みだけ足す
  for (const [barKey, notes] of Object.entries(COUNTER)) {
    const bar = Number(barKey);
    for (const [beat, midi, length] of notes) {
      stringVoice(bus.strings, { start: beatTime(bar, beat), length: length * BEAT, midi, gain: (isA ? .1 : .13) * (bar === SECTION_BAR.resolve ? .9 : 1), pan: .3, attack: .18 });
    }
  }

  // ベース：上り（裏拍の8分）→ 疾走（16分で転がす）→ 真空は無し → 立て直しの後半から戻り → 頂点で転がす → 解決は伸ばす
  const bassNote = (start, length, midi, level) => {
    if (isA) synthBass(bus.bass, { start, length, midi, gain: .3 * level });
    else bowedBass(bus.bass, { start, length, midi, gain: .34 * level });
  };
  for (let bar = 0; bar < BARS; bar += 1) {
    const section = sectionOf(bar);
    const offbeats = section === 'rise' || (section === 'build' && bar === SECTION_BAR.build + 1) || bar === SECTION_BAR.lift;
    const rolling = section === 'drive' || section === 'climax' || bar === SECTION_BAR.lift + 1;
    for (let beat = 0; beat < BEATS_PER_BAR; beat += 1) {
      const root = chordAt(bar, beat).root;
      if (offbeats) bassNote(beatTime(bar, beat + .5), BEAT * .42, root, section === 'rise' ? .85 : .95);
      if (rolling) {
        if (bar === SECTION_BAR.lift + 1 && beat === 3) { bassNote(beatTime(bar, 3.25), BEAT * .18, root + 12, .8); continue; }   // 頂点の直前は空ける
        for (const [k, sub] of [.25, .5, .75].entries()) bassNote(beatTime(bar, beat + sub), BEAT * .2, root + (k === 1 && section === 'climax' ? 12 : 0), k === 1 ? 1 : .82);
      }
    }
  }
  bassNote(barStart(SECTION_BAR.resolve), BAR_SECONDS * 1.6, CHORDS.E.root, .75);

  // ドラム
  const hatAt = (time, level, open = false) => hat(bus.drums, { start: time + jitter(2), gain: (isA ? .1 : .085) * level, open, pan: open ? -.2 : .18, rand: noise });
  const snareAt = (time, level) => snare(bus.snare, { start: time, gain: .34 * level, pan: .04, rand: noise });
  for (let bar = 0; bar < BARS; bar += 1) {
    const section = sectionOf(bar);
    const beat = (b) => beatTime(bar, b);
    if (section === 'hook') {
      for (const b of [0, 2]) kickAt(beat(b), .85);
      for (let s = 0; s < 8; s += 1) hatAt(beat(s / 2), s % 2 ? .75 : .45);
      if (bar === 1) { snareAt(beat(3.5), .45); riser(bus.fx, { start: beat(2.4), seconds: 1.6, gain: .05, rand: noise }); }
    } else if (section === 'rise') {
      for (const b of bar === 2 ? [0, 2] : [0, 1, 2, 3]) kickAt(beat(b), .92);
      for (const b of [1, 3]) snareAt(beat(b), .82);
      const sixteenth = bar === 3;
      for (let s = 0; s < (sixteenth ? 16 : 8); s += 1) hatAt(beat(s * (sixteenth ? .25 : .5)), sixteenth ? (s % 4 === 2 ? .85 : .5) : (s % 2 ? .8 : .45));
      if (bar === 3) {
        for (const [k, b] of [3.25, 3.5, 3.75].entries()) snareAt(beat(b), .45 + .15 * k);
        riser(bus.fx, { start: beat(1), seconds: 1.5, gain: .07, rand: noise });
      }
    } else if (section === 'drive') {
      for (const b of [0, 1, 2, 3]) kickAt(beat(b));
      for (const b of [1, 3]) { snareAt(beat(b), 1); clap(bus.snare, { start: beat(b), gain: .12, rand: noise }); }
      for (let s = 0; s < 16; s += 1) hatAt(beat(s / 4), s % 4 === 2 ? .35 : s % 2 ? .45 : .6, s % 4 === 2);
      if (bar === SECTION_BAR.drive) crash(bus.drums, { start: beat(0), gain: .09, rand: noise });
      if (bar === SECTION_BAR.drive + 1) {
        for (const [k, b] of [3.25, 3.5, 3.75].entries()) snareAt(beat(b), .65 + .15 * k);   // 真空の手前のフィル（3拍目は通常の打点）
        riser(bus.fx, { start: beat(2), seconds: 1, gain: .06, from: 800, to: 12_000, rand: noise });
      }
    } else if (section === 'build') {
      for (const b of [0, 1, 2, 3]) kickAt(beat(b), bar === SECTION_BAR.build ? .8 : .9);
      const sixteenth = bar === SECTION_BAR.build + 1;
      for (let s = 0; s < (sixteenth ? 16 : 8); s += 1) hatAt(beat(s * (sixteenth ? .25 : .5)), sixteenth ? (s % 2 ? .4 : .55) : (s % 2 ? .7 : .4));
      if (sixteenth) for (const b of [1, 3]) clap(bus.snare, { start: beat(b), gain: .2, rand: noise });
    } else if (section === 'lift') {
      const last = bar === SECTION_BAR.lift + 1;
      for (const b of [0, 1, 2, 3]) kickAt(beat(b), last && b === 3 ? .7 : .95);
      for (let s = 0; s < 16; s += 1) hatAt(beat(s / 4), s % 4 === 2 ? .45 : s % 2 ? .4 : .55, last && s % 4 === 2);
      // スネアのロール：8分 → 16分 → 32分へ細かくしながら強める（23.75秒で止めて頂点の頭を空ける）
      const hits = last
        ? [...Array.from({ length: 8 }, (_, k) => k * .25), ...Array.from({ length: 12 }, (_, k) => 2 + k * .125)]
        : Array.from({ length: 8 }, (_, k) => k * .5);
      for (const b of hits) {
        const progress = (bar - SECTION_BAR.lift) * BEATS_PER_BAR + b;   // 0〜7.5拍
        snareAt(beat(b), .3 + .6 * (progress / 7.5) ** 1.5);
      }
      if (last) riser(bus.fx, { start: beat(0), seconds: BAR_SECONDS - .08, gain: .11, from: 300, to: 11_000, rand: noise });
    } else if (section === 'climax') {
      for (const b of [0, 1, 2, 3]) kickAt(beat(b), 1.05);
      for (const b of [1, 3]) { snareAt(beat(b), 1.05); clap(bus.snare, { start: beat(b), gain: .16, rand: noise }); }
      for (let s = 0; s < 16; s += 1) hatAt(beat(s / 4), s % 4 === 2 ? .5 : s % 2 ? .5 : .65, s % 4 === 2);
      crash(bus.drums, { start: beat(0), gain: bar === SECTION_BAR.climax ? .15 : .09, rand: noise });
      if (bar === SECTION_BAR.climax + 1) {
        for (const [k, b] of [3.25, 3.5, 3.75].entries()) snareAt(beat(b), .7 + .15 * k);
        riser(bus.fx, { start: beat(2.5), seconds: .75, gain: .07, from: 1500, to: 12_000, rand: noise });
      }
    } else if (section === 'resolve') {
      kickAt(beat(0), 1.05);
      snareAt(beat(0), .7);
      crash(bus.drums, { start: beat(0), gain: .15, seconds: 3.6, rand: noise });
    }
  }
  // 場面の山：頂点と解決にティンパニ、真空の入口に低い衝撃と下りのノイズ、上昇に音程の上がるシンセ
  timpani(bus.kick, { start: barStart(SECTION_BAR.climax), midi: 40, gain: isA ? .2 : .3, rand: noise });
  timpani(bus.kick, { start: barStart(SECTION_BAR.resolve), midi: 40, gain: isA ? .22 : .32, rand: noise });
  if (!isA) timpani(bus.kick, { start: barStart(SECTION_BAR.drive), midi: 40, gain: .22, rand: noise });
  boom(bus.fx, { start: VACUUM_FROM, gain: .2 });
  riser(bus.fx, { start: VACUUM_FROM, seconds: 1.1, gain: .07, from: 7000, to: 250, rising: false, rand: noise });
  if (isA) uplifter(bus.fx, { start: LIGHT_AT, seconds: BAR_SECONDS * 2 - .06, midi: 52, gain: .09 });
  else for (const [k, midi] of [64, 71, 76].entries()) stringVoice(bus.strings, { start: LIGHT_AT + k * .02, length: BAR_SECONDS * 2 - .3, midi, gain: .06, pan: (k - 1) * .5, attack: 3.6, release: .3 });
  // 鼓動：真空の4拍ごと（1秒に1回）。パッドと鼓動だけが残る
  for (let k = 0; k < (VACUUM_TO - VACUUM_FROM); k += 1) heartbeat(bus.heart, { start: VACUUM_FROM + k, gain: .36 * (k === 0 ? .8 : 1) });

  // ── バスごとの処理 ──
  // パッドは場面で厚みと明るさを変える（真空で前へ、頂点で最大、余韻で閉じる）
  const padLevel = automation([[0, .9], [4, .9], [8, .95], [12, 1.3], [16, .95], [20, 1.05], [24, 1.3], [28, 1.35], [30, 1.15], [34, 1]]);
  const padBright = automation([[0, 1300], [4, 1700], [8, 2300], [12, 1500], [16, 1600], [20, 3000], [24, 4300], [28, 4000], [30, 2600], [34, 2000]]);
  lowpassBus(bus.pad, (t) => padBright(t) * (isA ? 1 : .85) * (1 + .15 * Math.sin(TAU * .09 * t)));
  lowpassBus(bus.strings, () => (isA ? 3600 : 4800));
  highpassBus(bus.bass, 85);
  for (let i = 0; i < FRAMES; i += 1) { const g = padLevel(i / SAMPLE_RATE); bus.pad.l[i] *= g; bus.pad.r[i] *= g; }
  pingPong(bus.lead, { feedback: .3, wet: isA ? .16 : .12 });

  // キックに合わせて伴奏を一瞬引く（サイドチェイン）。疾走感の「うねり」
  const duck = new Float32Array(FRAMES);
  for (const at of kickTimes) {
    const [first, last] = frames(at, .4);
    for (let i = first; i < last; i += 1) {
      const t = i / SAMPLE_RATE - at;
      const value = t < .004 ? t / .004 : Math.exp(-(t - .004) / .11);
      if (value > duck[i]) duck[i] = value;
    }
  }
  const DUCK = { pad: .42, arp: .28, bass: .5, strings: .25, lead: .1 };
  for (const [name, depth] of Object.entries(DUCK)) {
    for (let i = 0; i < FRAMES; i += 1) { const g = 1 - depth * duck[i]; bus[name].l[i] *= g; bus[name].r[i] *= g; }
  }

  // リバーブ
  const SEND = { lead: .2, arp: .16, pad: .22, strings: .3, snare: .18, drums: .06, fx: .2, heart: .1, kick: .02 };
  const sendL = new Float32Array(FRAMES); const sendR = new Float32Array(FRAMES);
  for (const [name, amount] of Object.entries(SEND)) {
    for (let i = 0; i < FRAMES; i += 1) { sendL[i] += bus[name].l[i] * amount; sendR[i] += bus[name].r[i] * amount; }
  }
  const reverb = freeverb(sendL, sendR, { room: .8, damp: .35 });

  // ── まとめ ──
  const mix = makeBus();
  const REVERB_RETURN = .85;
  for (let i = 0; i < FRAMES; i += 1) {
    let l = reverb.l[i] * REVERB_RETURN; let r = reverb.r[i] * REVERB_RETURN;
    for (const name in bus) { l += bus[name].l[i]; r += bus[name].r[i]; }
    mix.l[i] = l; mix.r[i] = r;
  }
  // 真空：12秒ちょうどで全体を 600Hz まで閉じて「こもらせ」、16秒から3.6秒かけて開く（立て直し）
  const vacuumCutoff = (t) => {
    if (t < VACUUM_FROM - .05 || t > VACUUM_TO + 3.6) return 20_000;
    if (t < VACUUM_FROM + .25) return 20_000 * (600 / 20_000) ** ((t - (VACUUM_FROM - .05)) / .3);
    if (t < VACUUM_TO) return 600;
    return 600 * (20_000 / 600) ** (((t - VACUUM_TO) / 3.6) ** 1.6);
  };
  lowpassBus(mix, vacuumCutoff, .8, 19_999);
  return finish(Float64Array.from(mix.l), Float64Array.from(mix.r), noise, v);
}

/** 仕上げ：低域の掃除・場面の大きさ・フェード → -17 LUFS に合わせてピークを丸める → 16bit 用に TPDF ディザ */
function finish(left, right, rand, variant) {
  const SHELF_DB = variant === 'a' ? -2.5 : -.8;   // 8kHz 以上を -38〜-43 dBFS に収める
  const sectionGain = automation([[0, 1], [3.9, 1], [4, 1], [23.9, 1], [24, 1.06], [27.9, 1.06], [28, 1], [34, 1]]);
  for (const channel of [left, right]) {
    const highpass = biquad(rbj('highpass', 28));
    const shelf = biquad(rbj('highshelf', 7000, Math.SQRT1_2, SHELF_DB));
    for (let i = 0; i < FRAMES; i += 1) {
      const t = i / SAMPLE_RATE;
      const fadeIn = Math.min(1, t / .004);                       // 1コマ目から鳴らすので頭は 4ms だけ
      const fadeOut = clamp((DURATION_SECONDS - t) / 2, 0, 1);     // 最後の 2秒で消す
      channel[i] = shelf(highpass(channel[i])) * sectionGain(t) * fadeIn * (.5 - .5 * Math.cos(Math.PI * fadeOut));
    }
  }
  const ceiling = 10 ** (PEAK_CEILING_DB / 20);
  const knee = ceiling * 10 ** (-5 / 20);
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

// ── 測定（ffmpeg） ────────────────────────────────────────────────────────

/**
 * 音声ファイルを ffmpeg で測る：統合ラウドネス・真のピーク・帯域（astats の RMS）・場面ごとの大きさとスペクトル重心・尺。
 * 耳で聴けない代わりの確認に使う。WAV ならクリップ（±32767 に張り付いたサンプル）も数える
 */
export function measureMusic(path) {
  const ffmpeg = (filter) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', filter, '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).stderr;
  const summary = (log) => log.slice(log.lastIndexOf('Summary:'));
  const loudness = (log) => Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary(log))?.[1]);
  const rms = (chain) => {
    const log = ffmpeg(`${chain}astats=measure_perchannel=none:measure_overall=RMS_level`);
    return Number(/RMS level dB:\s*(-?[\d.]+)/.exec(log.slice(log.lastIndexOf('Overall')))?.[1]);
  };
  const trim = (from, to) => `atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,`;
  const whole = ffmpeg('ebur128=peak=true');
  const total = rms('');
  const scenes = STORYBOARD.map((scene) => {
    const log = ffmpeg(`${trim(scene.start, scene.end)}aspectralstats=win_size=4096:measure=centroid,ametadata=mode=print`);
    const values = [...log.matchAll(/centroid=([\d.]+)/g)].map((match) => Number(match[1]));
    return {
      id: scene.id, music: scene.music, lufs: loudness(ffmpeg(`${trim(scene.start, scene.end)}ebur128`)),
      centroid: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
    };
  });
  const hook = scenes.find((scene) => scene.music === 'hook').lufs;
  const body = loudness(ffmpeg(`${trim(4, 28)}ebur128`));
  const duration = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }).stdout);
  let clipped = null;
  if (path.endsWith('.wav')) {
    const data = readFileSync(path);
    clipped = 0;
    for (let offset = 44; offset + 1 < data.length; offset += 2) { const value = data.readInt16LE(offset); if (value >= 32767 || value <= -32768) clipped += 1; }
  }
  return {
    lufs: loudness(whole), truePeak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary(whole))?.[1]),
    lowVsTotal: rms('lowpass=f=120,lowpass=f=120,') - total, high: rms('highpass=f=8000,highpass=f=8000,'), total,
    hook, body, hookGap: body - hook, scenes, duration, clipped
  };
}

/** 測定値を読める形にし、基準から外れた項目を返す */
export function judgeMusic(m) {
  const byMusic = Object.fromEntries(m.scenes.map((scene) => [scene.music, scene]));
  const loudest = m.scenes.reduce((a, b) => (b.lufs > a.lufs ? b : a));
  const failures = [];
  if (Math.abs(m.lufs - TARGET_LUFS) > .5) failures.push(`統合 ${m.lufs} LUFS`);
  if (!(m.truePeak <= -1.5)) failures.push(`真のピーク ${m.truePeak} dBTP`);
  if (m.clipped) failures.push(`クリップ ${m.clipped}`);
  if (m.lowVsTotal > -6 || m.lowVsTotal < -9) failures.push(`低域の全体比 ${m.lowVsTotal.toFixed(1)} dB`);
  if (m.high > -38 || m.high < -43) failures.push(`高域 ${m.high.toFixed(1)} dBFS`);
  if (m.hookGap > 6) failures.push(`フックと本編の差 ${m.hookGap.toFixed(1)} dB`);
  if (!(byMusic.vacuum.centroid < byMusic.drive.centroid && byMusic.vacuum.centroid < byMusic.build.centroid)) failures.push('真空のスペクトル重心が前後より下がっていない');
  if (loudest.music !== 'climax') failures.push(`いちばん大きいのが ${loudest.music}`);
  if (Math.abs(m.duration - DURATION_SECONDS) > .001) failures.push(`尺 ${m.duration}秒`);
  const lines = [
    `統合 ${m.lufs} LUFS / 真のピーク ${m.truePeak} dBTP / クリップ ${m.clipped ?? '-'} / 尺 ${m.duration.toFixed(3)}秒`,
    `低域（<120Hz）全体比 ${m.lowVsTotal.toFixed(1)} dB / 高域（>8kHz）${m.high.toFixed(1)} dBFS / フック ${m.hook.toFixed(1)}・本編 ${m.body.toFixed(1)} LUFS（差 ${m.hookGap.toFixed(1)} dB）`,
    ...m.scenes.map((scene) => `  ${scene.id} ${scene.music.padEnd(7)} ${scene.lufs.toFixed(1).padStart(6)} LUFS・重心 ${Math.round(scene.centroid)} Hz`)
  ];
  return { failures, lines };
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
    console.log('node promo-audio.mjs [--variant a|b] [--out <絶対パス.wav>] [--mp3] [--measure]');
    process.exit(0);
  }
  const variant = argValue('--variant', 'a').toLowerCase();
  const fallbackDir = process.env.PROMO_MUSIC_DIR || join(tmpdir(), 'day047-promo-music');
  const out = resolve(argValue('--out', join(fallbackDir, `promo-audio-${variant}.wav`)));
  try {
    const info = writeMusic(out, { variant });
    console.log(`WAVを書き出しました: ${out}`);
    console.log(`  ${VARIANT_LABEL[variant]} / E マイナー→E メジャー / 4/4拍子 / ${BPM} BPM / ${BARS}小節`);
    console.log(`  ${info.seconds.toFixed(3)}秒 / ${SAMPLE_RATE}Hz / 16bit / stereo`);
    console.log(`  ${info.lufs.toFixed(2)} LUFS / 真のピーク(推定) ${info.truePeakDb.toFixed(2)} dBTP / クリップ ${info.clipped} / ピークを丸めた区間 ${info.kneePercent.toFixed(3)}%`);
    if (argv.includes('--mp3')) {
      const mp3 = out.replace(/\.wav$/i, '.mp3');
      spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-c:a', 'libmp3lame', '-b:a', '192k', mp3], { stdio: 'inherit' });
      console.log(`mp3: ${mp3}`);
    }
    if (argv.includes('--measure')) {
      const { failures, lines } = judgeMusic(measureMusic(out));
      console.log(lines.join('\n'));
      const picture = out.replace(/\.wav$/i, '-spectrum.png');
      spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-lavfi', 'showspectrumpic=s=1360x560:legend=1:scale=log', picture], { stdio: 'inherit' });
      console.log(`スペクトログラム: ${picture}`);
      if (failures.length) { console.error(`基準から外れた項目: ${failures.join(' / ')}`); process.exitCode = 1; }
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
