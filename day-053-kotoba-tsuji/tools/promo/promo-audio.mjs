/* プロモ動画の BGM。外部パッケージも録音素材も使わず、固定シードの純JSで合成する（同じ入力なら必ず同じ WAV）。
   場面の秒は timeline.mjs が正本で、絵コンテを動かすと音も一緒に動く。

   土台は hundred-days の Day 052 の生成器（琴・三味線・太鼓・鼓・拍子木・りんの音色、リバーブ、
   BS.1770 で -17 LUFS に合わせてソフトニーでピークを丸める仕上げ）。ここで足したのは、締太鼓・鉦・大鼓・低い持続音と、
   帯域・場面・正解の前後を数値で測る検査（analyzeMusic）。

   どちらの案も D を主音にした五音だけで組み、旋律は「音階の何段目か」で書いてある（同じ旋律の形が、音階で別の顔になる）。
   A案（既定）＝陽音階（D E G A B）の祭囃子。三味線の旋律、締太鼓の刻み、鉦の「チャンチキ」、大太鼓
   B案＝都節（D E♭ G A B♭）の端唄。琴の旋律、三味線の低音、小鼓の「ポン」、大鼓の「カン」、拍子木
   曲の形は共通：フックは打楽器なし（拍子木の一打と爪弾きだけ）→ 腕前から太鼓が入り、一人前・免許皆伝が山 →
   果たし状で薄くなり、エンドは主音の和音とりんで終わってフェード。正解の音だけは画面と同じ秒ちょうどに鳴らす。

   使い方（リポジトリ直下から）:
     node day-053-kotoba-tsuji/tools/promo/promo-audio.mjs                  A案を promo-audio-a.wav へ
     node day-053-kotoba-tsuji/tools/promo/promo-audio.mjs --variant b      B案を promo-audio-b.wav へ
     node day-053-kotoba-tsuji/tools/promo/promo-audio.mjs --variant all    両方
     --out <wav>  書き出し先（--variant a か b のときだけ）
     --spectrum   showspectrumpic のスペクトログラム（promo-audio-<案>-spectrum.png）を OS の一時フォルダに描く
                  （このフォルダの .gitignore は png を promo-first-frame.png しか除外しないので、リポジトリには置かない）
     --check      検査（LIMITS）に1つでも外れたら終了コード 2 で終わる
   import しただけでは何も書かない。 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAT, BPM, DURATION_SECONDS, END_START, TAPS, WIPE_IN, sceneStart } from './timeline.mjs';

export const SAMPLE_RATE = 48_000;
export const TARGET_LUFS = -17;
export const VARIANTS = Object.freeze({
  a: 'A案（陽音階の祭囃子：三味線・締太鼓・鉦・大太鼓）',
  b: 'B案（都節の端唄：琴・三味線・小鼓・大鼓・拍子木）',
});
/* hundred-days のプロモの BGM の決まり。analyzeMusic の値をここと比べる */
export const LIMITS = Object.freeze({
  lufs: [-18, -16], truePeak: -1.5, low: [-9, -6], high: [-43, -38], hookGap: 6, correct: 3, clipped: 0,
});
const PEAK_CEILING_DB = -2.8;   // サンプルピークの天井。AAC にした後の真のピークを -1.5 dBTP より下に保つ余白
const CHANNELS = 2;
const FRAMES = Math.round(DURATION_SECONDS * SAMPLE_RATE);
const TAU = Math.PI * 2;
const BAR = BEAT * 4;
const here = dirname(fileURLToPath(import.meta.url));

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const db = (value) => 20 * Math.log10(Math.max(value, 1e-12));
const smooth = (x) => { const k = clamp(x); return k * k * (3 - 2 * k); };

// ── 音階と場面 ────────────────────────────────────────────────────────────
/* 音階の段（0＝D4）を MIDI にする。5段で1オクターブ上がる。負の段は下のオクターブ */
const SCALES = { a: [0, 2, 5, 7, 9], b: [0, 1, 5, 7, 8] };
const ROOT = 62;
const degree = (scale, d) => ROOT + 12 * Math.floor(d / 5) + scale[((d % 5) + 5) % 5];

const SECTION = {
  answer: sceneStart('S1'), levels: sceneStart('S2'), ichi: sceneStart('S3'), menkyo: sceneStart('S4'),
  duel: sceneStart('S5'), end: sceneStart('S6'),
};
const sectionAt = (t) => (t < SECTION.answer ? 'hook' : t < SECTION.levels ? 'answer' : t < SECTION.ichi ? 'levels'
  : t < SECTION.menkyo ? 'ichi' : t < SECTION.duel ? 'menkyo' : t < SECTION.end ? 'duel' : 'end');

/* 旋律。[拍（動画の頭から）, 音階の段, 長さ(拍)]。一人前は言葉が解ける拍（23・25・27・29）を空け、
   正解の音のあとに旋律が応える（掛け合い）。数字の段は A でも B でも同じ */
const MELODY = [
  // フック：上がって、6段目（E5／E♭5）の「？」で止まる
  [0.5, 5, .5], [1, 6, .5], [1.5, 7, .5], [2, 8, 1.5], [3.5, 7, .5], [4, 6, 1],
  // 答え：主音へ降りて落ち着く
  [6, 8, .5], [6.5, 7, .5], [7, 5, 1], [8.5, 6, .5], [9, 7, 1], [10, 5, 2],
  // 腕前：1段ずつ上がる（1・7・15）
  [12, 3, .5], [12.5, 4, .5], [13, 5, 1], [14, 5, .5], [14.5, 6, .5], [15, 7, 1], [16, 7, .5], [16.5, 8, .5], [17, 9, 1], [18, 10, 1.5],
  // 一人前：本歌。言葉が解ける拍（22・24・26・28＝大太鼓の拍）を空け、正解の音のあとに応える
  [20, 5, .5], [20.5, 7, .5], [21, 8, .5], [21.5, 7, .5],
  [22.5, 6, .5], [23, 7, .5], [23.5, 8, .5],
  [24.5, 8, .5], [25, 9, .5], [25.5, 8, .5],
  [26.5, 7, .5], [27, 8, .5], [27.5, 10, .5],
  [28.5, 9, .5], [29, 8, .5], [29.5, 7, .5], [30, 5, 1], [31, 6, .5], [31.5, 7, .5],
  // 免許皆伝：高い所で山を作る
  [32, 10, 1], [33, 9, .5], [33.5, 8, .5], [34, 9, 1], [35.5, 10, .5], [36, 11, .5], [36.5, 10, .5], [37, 9, .5], [37.5, 8, .5], [38, 7, 1], [39, 8, 1],
  // 果たし状：短い掛け合いで薄くなる
  [40.5, 7, .5], [41, 5, .5], [41.5, 6, .5], [42, 7, 1.5], [44, 8, .5], [44.5, 7, .5], [45, 6, 1],
  // エンド：主音で止める
  [46, 5, 3],
];
const LEAD_LEVEL = { hook: 1.3, answer: 1, levels: 1, ichi: 1.05, menkyo: 1.1, duel: .95, end: 1 };

/* 分散和音（琴の8分音符）。場面で密度を変える */
const ARP = [0, 2, 4, 3, 5, 4, 2, 3];
const ARP_DENSITY = { hook: .85, answer: .5, levels: .7, ichi: .85, menkyo: .95, duel: .6, end: 0 };

/* 三味線の低音。[小節の中の拍, 音階の段（-5＝D3・-3＝G3・-2＝A3・-1＝B3／B♭3）]。
   どれも 120Hz より上に置き、低域（<120Hz）は大太鼓と持続音に任せる（D3 未満に下げると低域が全体比 -2dB まで膨らんだ） */
const BASS = {
  answer: [[0, -5], [2, -2]],
  levels: [[0, -5], [2, -2], [3, -5]],
  ichi: [[0, -5], [1.5, -5], [2, -2], [3, -3], [3.5, -2]],
  menkyo: [[0, -5], [1, -5], [1.5, -2], [2, -1], [3, -2], [3.5, -3]],
  duel: [[0, -5], [2, -2]],
};

/* 打楽器（小節の中の拍）。フックとエンドは鳴らさない */
const PERC = {
  a: {
    answer: { tsuzumi: [3] },
    levels: { taiko: [0, 2], shime: [0, 1, 2, 3, 3.5, 3.75], kane: [1, 3] },
    ichi: { taiko: [0, 2], shime: [0, .5, .75, 1, 1.5, 2, 2.5, 2.75, 3, 3.5], kane: [.5, .75, 1.5, 2.5, 2.75, 3.5] },
    menkyo: { taiko: [0, 2, 3, 3.5], shime: [0, .25, .5, .75, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.5], kane: [.5, .75, 1.5, 2.5, 2.75, 3.5] },
    duel: { taiko: [0], shime: [0, 1, 2, 3] },
  },
  b: {
    answer: { tsuzumi: [3] },
    levels: { taiko: [0, 2], tsuzumi: [1.5, 3] },
    ichi: { taiko: [0, 2], tsuzumi: [1, 2.5, 3], ookawa: [1.5, 3.5], hyoshigi: [3.75] },
    menkyo: { taiko: [0, 2, 3.5], tsuzumi: [1, 2.5, 3], ookawa: [.5, 1.5, 3.5], hyoshigi: [3.75] },
    duel: { taiko: [0], tsuzumi: [3] },
  },
};

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

/* RBJ のフィルタ係数と、状態を持つ1サンプル処理 */
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
  else if (type === 'lowshelf') {
    c = [amp * ((amp + 1) - (amp - 1) * cos + root), 2 * amp * ((amp - 1) - (amp + 1) * cos),
      amp * ((amp + 1) - (amp - 1) * cos - root), (amp + 1) + (amp - 1) * cos + root,
      -2 * ((amp - 1) + (amp + 1) * cos), (amp + 1) + (amp - 1) * cos - root];
  } else if (type === 'highshelf') {
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

// ── 音色（琴・三味線・太鼓・鼓・拍子木・りんは Day 052 と同じ作り） ─────────

/** 琴：弦の13%の位置を爪で弾いた倍音。scoop は押し手（半音、負＝下から押し上げる）、yuri は余韻の揺り（セント） */
function addKoto(bus, random, { start, midi, gain, pan = 0, tau = .85, scoop = 0, yuri = 0, bright = 1 }) {
  const f0 = hz(midi);
  const life = tau * 6.5;
  const [leftGain, rightGain] = panGains(pan);
  const partials = [];
  for (let n = 1; n <= 14; n += 1) {
    const ratio = n * Math.sqrt(1 + 1.1e-4 * n * n);
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
    const noise = random() * 2 - 1;
    pickLow += ((noise - previousNoise) - pickLow) * pickAlpha;
    const pick = time < .012 ? pickLow * Math.exp(-time / .0022) : 0;
    previousNoise = noise;
    const sample = (wave * norm + pick * .16) * (1 - Math.exp(-time / .0012)) * Math.min(1, (life - time) / .05) * gain;
    bus.l[index] += sample * leftGain;
    bus.r[index] += sample * rightGain;
  }
}

/** 三味線：明るい倍音が速く消え、中高域の倍音が少し長く揺れて残る（さわり）。頭に撥が皮を打つ「ベン」 */
function addShamisen(bus, random, { start, midi, gain, pan = 0, tau = .4 }) {
  const f0 = hz(midi);
  const life = tau * 6;
  const [leftGain, rightGain] = panGains(pan);
  const partials = [];
  for (let n = 1; n <= 20; n += 1) {
    if (f0 * n > 12_000) break;
    partials.push({ ratio: n, amp: 1 / n ** .72, fall: Math.exp(-(1 + .3 * (n - 1)) / (tau * SAMPLE_RATE)), phase: random() * TAU, env: 1 });
    if (n >= 5 && n <= 14) {
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

/** 大太鼓：低い胴の「ドン」。ピッチが 98→58Hz へ落ち、皮のノイズを少し */
function addTaiko(bus, random, { start, gain }) {
  const first = firstFrame(start);
  const last = lastFrame(start, .8);
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

/** 締太鼓：張りの強い高い皮の「テン」。打った瞬間だけ少し高く、すぐ消える。撥の当たりのノイズ */
function addShime(bus, random, { start, gain, pitch = 520, pan = .18 }) {
  const [leftGain, rightGain] = panGains(pan);
  const first = firstFrame(start);
  const last = lastFrame(start, .2);
  let phase = 0; let prev = 0; let hp = 0;
  const alpha = 1 - Math.exp(-TAU * 3000 / SAMPLE_RATE);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    phase += TAU * pitch * (1 + .14 * Math.exp(-time / .008)) / SAMPLE_RATE;
    const tone = Math.sin(phase) * Math.exp(-time / .04) + Math.sin(phase * 1.52) * .38 * Math.exp(-time / .022)
      + Math.sin(phase * 2.18) * .2 * Math.exp(-time / .012);
    const noise = random() * 2 - 1;
    hp += ((noise - prev) - hp) * alpha; prev = noise;
    const sample = (tone + hp * .7 * Math.exp(-time / .0035)) * Math.min(1, time / .0008) * gain;
    bus.l[index] += sample * leftGain; bus.r[index] += sample * rightGain;
  }
}

/** 鉦（摺鉦）：整数倍にならない金属の倍音の「チャン」。0.25拍の裏は押さえて短く（チキ） */
function addKane(bus, random, { start, gain, pan = -.22, damp = false }) {
  const [leftGain, rightGain] = panGains(pan);
  const modes = [[1, 1], [2.02, .5], [2.74, .42], [3.93, .3], [5.36, .2], [6.9, .12]];
  const f0 = 1180;
  const tau = damp ? .035 : .11;
  const first = firstFrame(start);
  const last = lastFrame(start, tau * 6);
  const phases = modes.map(() => random() * TAU);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    let wave = 0;
    modes.forEach(([ratio, amp], k) => { wave += Math.sin(TAU * f0 * ratio * time + phases[k]) * amp * Math.exp(-time / (tau / (1 + k * .25))); });
    const click = (random() * 2 - 1) * .4 * Math.exp(-time / .0012);
    const sample = (wave / 2.2 + click) * Math.min(1, time / .0005) * gain;
    bus.l[index] += sample * leftGain; bus.r[index] += sample * rightGain;
  }
}

/** 小鼓：「ポン」。音程のある膜の音で、打った瞬間だけ少し高い */
function addTsuzumi(bus, random, { start, gain, pitch = 320, pan = .2 }) {
  const [leftGain, rightGain] = panGains(pan);
  const first = firstFrame(start);
  const last = lastFrame(start, .5);
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

/** 大鼓（おおかわ）：乾いた高い「カン」。高めの共鳴2つと、強い当たり */
function addOokawa(bus, random, { start, gain, pan = .3 }) {
  const [leftGain, rightGain] = panGains(pan);
  const first = firstFrame(start);
  const last = lastFrame(start, .12);
  const band = biquad(rbj('bandpass', 2600, 1.4));
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const ring = Math.sin(TAU * 910 * time) * Math.exp(-time / .028) + Math.sin(TAU * 1730 * time) * .55 * Math.exp(-time / .016);
    const crack = band(random() * 2 - 1) * 2.4 * Math.exp(-time / .006);
    const sample = (ring + crack) * Math.min(1, time / .0005) * gain;
    bus.l[index] += sample * leftGain; bus.r[index] += sample * rightGain;
  }
}

/** 拍子木：木を打ち合わせる「チョン」。2つの共鳴と短いクリック */
function addHyoshigi(bus, random, { start, gain, pan = -.25 }) {
  const [leftGain, rightGain] = panGains(pan);
  const first = firstFrame(start);
  const last = lastFrame(start, .12);
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

/** 低い持続音：基音と少しの倍音だけの柔らかい音。level(t) で場面ごとの厚みを変える（低域の土台） */
function addDrone(bus, { midi, gain, level }) {
  const f0 = hz(midi);
  let phase = 0;
  for (let index = 0; index < FRAMES; index += 1) {
    const time = index / SAMPLE_RATE;
    phase += TAU * f0 * (1 + .0012 * Math.sin(TAU * .23 * time)) / SAMPLE_RATE;
    const wave = Math.sin(phase) + .22 * Math.sin(2 * phase) + .06 * Math.sin(3 * phase);
    const sample = wave * gain * level(time) * Math.min(1, time / .03);
    bus.l[index] += sample; bus.r[index] += sample;
  }
}

/** 琴の流し爪（グリッサンド）：音階の段 from から to まで、step 秒おきに */
function kotoSweep(bus, random, scale, { start, from, to, step = .024, gain, tau = .7 }) {
  const dir = to >= from ? 1 : -1;
  const count = Math.abs(to - from) + 1;
  for (let k = 0; k < count; k += 1) {
    addKoto(bus, random, { start: start + k * step, midi: degree(scale, from + dir * k), gain: gain * (.75 + .25 * k / count), pan: -.45 + .9 * k / count, tau });
  }
}

// ── 効果 ──────────────────────────────────────────────────────────────────

/** ステレオのシュレーダー・リバーブ（コム4＋オールパス2・減衰 decay 秒） */
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

/** 区間を包む持ち上がりと戻り（ダッキング用）。time は at を0とした秒 */
function duckCurve(target, at, { depth, lead = .05, hold = .25, release = .4 }) {
  const first = firstFrame(at - lead);
  const last = lastFrame(at - lead, lead + hold + release * 4);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - at;
    const value = time < 0 ? 1 + time / lead : time < hold ? 1 : Math.exp(-(time - hold) / release);
    const amount = depth * clamp(value);
    if (amount > target[index]) target[index] = amount;
  }
}

// ── 仕上げ（Day 048・052 と同じ） ─────────────────────────────────────────

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
function finish(left, right, random, shelfDb, lowShelfDb) {
  for (const channel of [left, right]) {
    const highpass = biquad(rbj('highpass', 30));
    // 110Hz より下を下げる（A 5.5dB・B 3.5dB）。大太鼓の胴鳴りが RMS を占め、低域（<120Hz）が全体比 -3dB まで膨らんだため
    const lowShelf = biquad(rbj('lowshelf', 110, Math.SQRT1_2, lowShelfDb));
    const shelf = biquad(rbj('highshelf', 7000, Math.SQRT1_2, shelfDb));
    for (let i = 0; i < FRAMES; i += 1) {
      const t = i / SAMPLE_RATE;
      const fadeIn = Math.min(1, t / .004);                      // 1コマ目から鳴らすので頭は 4ms だけ
      const fadeOut = clamp((DURATION_SECONDS - t) / 1.8);       // 最後の 1.8秒で消す
      channel[i] = shelf(lowShelf(highpass(channel[i]))) * fadeIn * (.5 - .5 * Math.cos(Math.PI * fadeOut));
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
      if (value >= 32767 || value <= -32768) clipped += 1;
      pcm[i * CHANNELS + c] = clamp(value, -32768, 32767);
    }
  }
  return {
    pcm, outL, outR,
    info: { lufs, truePeakDb: db(Math.max(truePeak(outL), truePeak(outR))), kneePercent: 100 * kneeHits / FRAMES, clipped, seconds: FRAMES / SAMPLE_RATE },
  };
}

// ── 数値の検査（hundred-days の決まりと同じ物差し：ffmpeg の2極フィルタ＋astats の RMS に合わせる） ──

function rmsDb(left, right, from = 0, to = DURATION_SECONDS) {
  const a = firstFrame(from); const b = lastFrame(from, to - from);
  let sum = 0;
  for (let i = a; i < b; i += 1) sum += (left[i] * left[i] + right[i] * right[i]) / 2;
  return 10 * Math.log10(Math.max(sum / Math.max(1, b - a), 1e-20));
}
function bandPass(channel, type, frequency) {
  const filter = biquad(rbj(type, frequency));
  return Float64Array.from(channel, (x) => filter(x));
}

/** 低域（<120Hz）の全体との差・高域（>8kHz）の RMS・フックと本編の差・正解の音の前後との差・冒頭0.3秒 */
export function analyzeMusic(left, right) {
  const total = rmsDb(left, right);
  const low = rmsDb(bandPass(left, 'lowpass', 120), bandPass(right, 'lowpass', 120)) - total;
  const high = rmsDb(bandPass(left, 'highpass', 8000), bandPass(right, 'highpass', 8000));
  const hook = rmsDb(left, right, 0, SECTION.answer);
  const main = rmsDb(left, right, SECTION.answer, SECTION.end);
  const sections = Object.fromEntries(['hook', 'answer', 'levels', 'ichi', 'menkyo', 'duel', 'end'].map((name, i, list) => {
    const from = name === 'hook' ? 0 : SECTION[name];
    const to = i + 1 < list.length ? SECTION[list[i + 1]] : DURATION_SECONDS;
    return [name, rmsDb(left, right, from, to)];
  }));
  // 正解の音：鳴った直後の0.4秒と、直前（-0.6〜-0.2秒）・少し後（+0.85〜+1.25秒）の RMS の差
  const corrects = TAPS.filter((tap) => tap.kind === 'answer' || tap.kind === 'word').map((tap) => {
    const self = rmsDb(left, right, tap.at, tap.at + .4);
    const before = self - rmsDb(left, right, tap.at - .6, tap.at - .2);
    const after = self - rmsDb(left, right, tap.at + .85, tap.at + 1.25);
    return { at: tap.at, kind: tap.kind, before, after, margin: Math.min(before, after) };
  });
  return { low, high, hook, main, hookGap: main - hook, sections, corrects, headRmsDb: rmsDb(left, right, 0, .3) };
}

export function judgeMusic(info) {
  const problems = [];
  const [lo, hi] = LIMITS.lufs;
  if (!(info.lufs >= lo && info.lufs <= hi)) problems.push(`統合 ${info.lufs.toFixed(2)} LUFS`);
  if (!(info.truePeakDb <= LIMITS.truePeak)) problems.push(`真のピーク ${info.truePeakDb.toFixed(2)} dBTP`);
  if (!(info.low >= LIMITS.low[0] && info.low <= LIMITS.low[1])) problems.push(`低域 ${info.low.toFixed(1)} dB`);
  if (!(info.high >= LIMITS.high[0] && info.high <= LIMITS.high[1])) problems.push(`高域 ${info.high.toFixed(1)} dBFS`);
  if (!(Math.abs(info.hookGap) <= LIMITS.hookGap)) problems.push(`フックと本編の差 ${info.hookGap.toFixed(1)} dB`);
  const weak = info.corrects.filter((c) => c.margin < LIMITS.correct);
  if (weak.length) problems.push(`正解の音が前後より +${LIMITS.correct} dB に届かない: ${weak.map((c) => `${c.at.toFixed(2)}秒 ${c.margin.toFixed(1)}`).join('、')}`);
  if (info.clipped > LIMITS.clipped) problems.push(`クリップ ${info.clipped}`);
  if (!(info.headRmsDb > -40)) problems.push(`冒頭0.3秒 ${info.headRmsDb.toFixed(1)} dBFS`);
  return problems;
}

// ── 編曲 ──────────────────────────────────────────────────────────────────

export function synthesizeMusic({ variant = 'a' } = {}) {
  if (!VARIANTS[variant]) throw new Error(`--variant は a（陽音階の祭囃子）か b（都節の端唄）です（${variant}）`);
  const A = variant === 'a';
  const scale = SCALES[variant];
  const note = (d) => degree(scale, d);
  const random = randomFactory(A ? 0x53a0c1 : 0x53b0c2);
  const lead = makeBus();    // 旋律（A＝三味線、B＝琴）
  const bed = makeBus();     // 琴の分散和音・旋律の影
  const low = makeBus();     // 三味線の低音・持続音
  const perc = makeBus();
  const sfx = makeBus();     // 正解・押す・幕の音

  // 低い持続音（D2 と A2）。フックは打楽器が無いぶん少し厚く、エンドで消える
  const DRONE_LEVEL = { hook: 1.25, answer: 1, levels: 1, ichi: 1, menkyo: 1.05, duel: .9, end: .8 };
  const droneLevel = (t) => DRONE_LEVEL[sectionAt(t)] * clamp((DURATION_SECONDS - t) / 2);
  addDrone(low, { midi: 38, gain: A ? .016 : .017, level: droneLevel });
  addDrone(low, { midi: 45, gain: A ? .009 : .01, level: droneLevel });

  // 冒頭：拍子木の「チョン」と、撥で開放弦を鳴らす「ベン」。1コマ目から音がある
  addHyoshigi(sfx, random, { start: 0, gain: .34, pan: -.15 });
  addHyoshigi(sfx, random, { start: .2, gain: .26, pan: .15 });
  for (const midi of [50, 57, 62]) addShamisen(low, random, { start: .03, midi, gain: .13, pan: .1, tau: .5 });
  for (const at of [2, 4]) for (const midi of [50, 57]) addShamisen(low, random, { start: at * BEAT + .01, midi, gain: .09, pan: .1, tau: .45 });

  // 旋律。A は三味線（琴が1オクターブ下で影を付ける）、B は琴（三味線が1オクターブ下で撥を添える）
  for (const [at, d, length] of MELODY) {
    const start = at * BEAT;
    if (start >= DURATION_SECONDS - .4) continue;
    const midi = note(d);
    const gain = (A ? .2 : .23) * LEAD_LEVEL[sectionAt(start + .001)];
    if (A) {
      addShamisen(lead, random, { start, midi, gain, pan: -.08, tau: length >= 1 ? .5 : .3 });
      addKoto(bed, random, { start: start + .012, midi: midi - 12, gain: gain * .3, pan: .3, tau: .65 });
    } else {
      addKoto(lead, random, { start, midi, gain, pan: -.1, tau: length >= 1 ? 1.05 : .75, scoop: length >= 1.5 ? -1 : 0, yuri: length >= 1 ? 14 : 0 });
      addShamisen(bed, random, { start: start + .01, midi: midi - 12, gain: gain * .28, pan: .25, tau: .28 });
    }
  }

  // 琴の分散和音（8分音符）。場面で密度を変え、エンドは鳴らさない
  const eighths = Math.floor(DURATION_SECONDS / (BEAT / 2));
  for (let step = 0; step < eighths; step += 1) {
    const t = step * BEAT / 2;
    const section = sectionAt(t + .001);
    const keep = random() < ARP_DENSITY[section];
    const humanize = (random() * 2 - 1) * .006;
    const velocity = .6 + random() * .4;
    const pan = (random() * 2 - 1) * .4;
    if (!keep || t < .45) continue;
    const bar = Math.floor(t / BAR);
    const d = ARP[step % 8] + (bar % 2 ? 2 : 0) + (section === 'menkyo' ? 3 : 0);
    addKoto(bed, random, { start: t + humanize, midi: note(d), gain: (A ? .065 : .075) * velocity, pan, tau: A ? .5 : .62, bright: .85 });
  }

  // 三味線の低音と打楽器（小節ごと）。フックとエンドは鳴らさない
  const bars = Math.ceil(DURATION_SECONDS / BAR);
  const patterns = PERC[variant];
  // 決め：正解の音の直後（-0.05〜+0.32秒）は刻み（締太鼓・鉦・鼓・大鼓・拍子木）を止め、正解の一打だけを聞かせる
  const kime = TAPS.filter((tap) => tap.kind === 'answer' || tap.kind === 'word').map((tap) => tap.at);
  const inKime = (t) => kime.some((at) => t > at - .05 && t < at + .32);
  const positions = (name) => [...new Set(Object.values(patterns).flatMap((p) => p[name] ?? []))];
  for (let bar = 0; bar < bars; bar += 1) {
    const barStart = bar * BAR;
    for (const [at, d] of Object.values(BASS).flat()) {
      const t = barStart + at * BEAT;
      const section = sectionAt(t + .001);
      if (!BASS[section]?.some(([p, q]) => p === at && q === d) || t >= DURATION_SECONDS) continue;
      addShamisen(low, random, { start: t, midi: note(d), gain: (A ? .15 : .16) * (at === 0 ? 1 : .8), pan: .12, tau: .45 });
    }
    const hit = (name, fn) => {
      for (const at of positions(name)) {
        const t = barStart + at * BEAT;
        const section = sectionAt(t + .001);
        if (!patterns[section]?.[name]?.includes(at) || t >= DURATION_SECONDS) continue;
        if (name !== 'taiko' && inKime(t)) continue;
        fn(t, at, section);
      }
    };
    hit('taiko', (t, at, section) => addTaiko(perc, random, { start: t, gain: (at === 0 ? .21 : .16) * (section === 'levels' ? .85 : 1) }));
    hit('shime', (t, at, section) => addShime(perc, random, { start: t, gain: (Number.isInteger(at) ? .1 : .07) * (section === 'duel' ? .7 : 1), pitch: at % 1 === .75 ? 560 : 520 }));
    hit('kane', (t, at) => addKane(perc, random, { start: t, gain: at % 1 === .75 ? .035 : .05, damp: at % 1 === .75 }));
    hit('tsuzumi', (t, at) => addTsuzumi(perc, random, { start: t, gain: .22, pitch: at === 2.5 ? 400 : 318, pan: .2 }));
    hit('ookawa', (t) => addOokawa(perc, random, { start: t, gain: .1, pan: .3 }));
    hit('hyoshigi', (t, at, section) => { if (bar % 2 === 1 || section === 'menkyo') addHyoshigi(perc, random, { start: t, gain: .09 }); });
  }

  // 画面の出来事の音。answer＝いちばんの正解、word＝言葉が1つ解ける、tap＝押すだけ、wipe＝幕
  const duck = new Float32Array(FRAMES);
  for (const [index, tap] of TAPS.entries()) {
    const pan = index % 2 === 0 ? -.2 : .2;
    if (tap.kind === 'answer') {
      kotoSweep(sfx, random, scale, { start: tap.at, from: 0, to: 10, step: .022, gain: .2, tau: .9 });
      addRin(sfx, { start: tap.at + .02, midi: note(10), gain: .26, tau: 2 });
      addTsuzumi(sfx, random, { start: tap.at, gain: .34, pitch: 330, pan: 0 });
      addTaiko(sfx, random, { start: tap.at, gain: .3 });
      for (const midi of [50, 57, 62]) addShamisen(sfx, random, { start: tap.at + .01, midi, gain: .14, pan: .1, tau: .6 });
      duckCurve(duck, tap.at, { depth: .6, hold: .5, release: .5 });
    } else if (tap.kind === 'word') {
      addKoto(sfx, random, { start: tap.at, midi: note(8), gain: .38, pan: pan * .5, tau: .55 });
      addKoto(sfx, random, { start: tap.at + .085, midi: note(10), gain: .38, pan: -pan * .5, tau: .6 });
      addRin(sfx, { start: tap.at + .085, midi: note(10), gain: .2, pan: -pan, tau: .6 });
      addTsuzumi(sfx, random, { start: tap.at, gain: .36, pitch: 350, pan });
      addTaiko(sfx, random, { start: tap.at, gain: .22 });
      addShamisen(sfx, random, { start: tap.at + .005, midi: note(-5), gain: .12, pan: .1, tau: .4 });
      duckCurve(duck, tap.at, { depth: .6, hold: .35, release: .3 });
    } else if (tap.kind === 'tap') {
      addHyoshigi(sfx, random, { start: tap.at, gain: .16, pan });
      addKoto(sfx, random, { start: tap.at + .01, midi: note(10), gain: .08, pan: -pan, tau: .3 });
      duckCurve(duck, tap.at, { depth: .15, hold: .1, release: .2 });
    } else if (tap.kind === 'wipe') {
      kotoSweep(sfx, random, scale, { start: tap.at - WIPE_IN, from: 10, to: 1, step: WIPE_IN / 10, gain: .12, tau: .5 });
      addHyoshigi(sfx, random, { start: tap.at - .02, gain: .26, pan: -.2 });
      addHyoshigi(sfx, random, { start: tap.at + .15, gain: .22, pan: .2 });
      duckCurve(duck, tap.at, { depth: .25, hold: .2, release: .3 });
    }
  }

  // エンド：大太鼓と「ベン」、琴を流し下ろし、りんを長く鳴らして消える
  const E = SECTION.end;
  addTaiko(perc, random, { start: E, gain: .36 });
  for (const midi of [50, 57, 62, 69]) addShamisen(sfx, random, { start: E + .01, midi, gain: .13, pan: .1, tau: .9 });
  kotoSweep(sfx, random, scale, { start: E + .05, from: 10, to: 0, step: .05, gain: .15, tau: 1.3 });
  addRin(sfx, { start: E + .02, midi: note(10), gain: .18, tau: 3.2 });
  addKoto(lead, random, { start: E + .8, midi: note(5), gain: .14, pan: 0, tau: 1.4, yuri: 12 });
  if (END_START !== E) throw new Error('エンドの秒が timeline.mjs とずれています');

  // ── 効果とまとめ ──
  const send = { l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) };
  for (let i = 0; i < FRAMES; i += 1) {
    send.l[i] = lead.l[i] * .25 + bed.l[i] * .35 + low.l[i] * .04 + perc.l[i] * .12 + sfx.l[i] * .3;
    send.r[i] = lead.r[i] * .25 + bed.r[i] * .35 + low.r[i] * .04 + perc.r[i] * .12 + sfx.r[i] * .3;
  }
  const room = reverb(send, A ? 1.5 : 1.9);
  const left = new Float64Array(FRAMES);
  const right = new Float64Array(FRAMES);
  const wet = A ? .18 : .22;
  for (let i = 0; i < FRAMES; i += 1) {
    const bedGain = 1 - duck[i];
    left[i] = (lead.l[i] + bed.l[i] + room.l[i] * wet) * bedGain + (low.l[i] + perc.l[i]) * (1 - duck[i] * .9) + sfx.l[i];
    right[i] = (lead.r[i] + bed.r[i] + room.r[i] * wet) * bedGain + (low.r[i] + perc.r[i]) * (1 - duck[i] * .9) + sfx.r[i];
  }
  const done = finish(left, right, random, A ? 2 : 3, A ? -5.5 : -3.5);
  const analysis = analyzeMusic(done.outL, done.outR);
  return { pcm: done.pcm, info: { ...done.info, ...analysis } };
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

/** 曲を合成して WAV を書き出す。spectrum を付けると OS の一時フォルダに showspectrumpic の絵も描く */
export function writeMusic(outPath, { variant = 'a', spectrum = false } = {}) {
  const { pcm, info } = synthesizeMusic({ variant });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encodeWav(pcm));
  let spectrumPath = null;
  if (spectrum) {
    spectrumPath = join(tmpdir(), basename(outPath).replace(/\.wav$/, '-spectrum.png'));
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', outPath, '-lavfi', 'showspectrumpic=s=1200x540:legend=1:scale=log:fscale=lin', spectrumPath]);
  }
  return { ...info, variant, outPath, spectrumPath };
}

export const defaultMusicPath = (variant) => join(here, `promo-audio-${variant}.wav`);

export function describeMusic(info) {
  const f = (value, digits = 1) => value.toFixed(digits);
  return [
    `${VARIANTS[info.variant]} / ${f(info.seconds, 3)}秒・${SAMPLE_RATE}Hz・16bit・stereo・${BPM} BPM`,
    `統合 ${f(info.lufs, 2)} LUFS・真のピーク(推定) ${f(info.truePeakDb, 2)} dBTP・クリップ ${info.clipped}・冒頭0.3秒 ${f(info.headRmsDb)} dBFS`,
    `低域(<120Hz) 全体比 ${f(info.low)} dB・高域(>8kHz) ${f(info.high)} dBFS・フック ${f(info.hook)} / 本編 ${f(info.main)} dBFS（差 ${f(info.hookGap)} dB）`,
    `場面の RMS: ${Object.entries(info.sections).map(([name, value]) => `${name} ${f(value)}`).join('・')}`,
    `正解の音（直後0.4秒と前・後の差）: ${info.corrects.map((c) => `${f(c.at, 2)}秒 +${f(c.before)}/+${f(c.after)}`).join('・')}`,
  ].join('\n  ');
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
  let failed = false;
  try {
    for (const variant of variants) {
      const info = writeMusic(custom ? resolve(custom) : defaultMusicPath(variant), { variant, spectrum: argv.includes('--spectrum') });
      const problems = judgeMusic(info);
      console.log(`WAVを書き出しました: ${info.outPath}${info.spectrumPath ? `（スペクトログラム ${info.spectrumPath}）` : ''}`);
      console.log(`  ${describeMusic(info)}`);
      console.log(problems.length ? `  検査: 外れ ${problems.join(' / ')}` : '  検査: すべて範囲内');
      if (problems.length) failed = true;
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (failed && argv.includes('--check')) process.exit(2);
}
