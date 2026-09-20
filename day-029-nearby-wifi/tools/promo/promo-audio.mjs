import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION_SECONDS, T_FREE, T_LOCATE, T_PIN } from './timeline.mjs';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BITS_PER_SAMPLE = 16;
const FRAME_COUNT = SAMPLE_RATE * DURATION_SECONDS;
/* 音量はピークでなく RMS で合わせる。ピーク基準だと、音を1つ足しただけで
   正規化の倍率が動いて統合ラウドネスが数dB変わった（実際に -17 → -14.3 LUFS になった）。 */
const TARGET_RMS = 10 ** (-19.3 / 20);    // 統合 -17 LUFS 相当（ffmpeg の ebur128 で実測して決めた）
const PEAK_CEILING = 10 ** (-1.5 / 20);   // ここを超えるならピーク基準へ切り替える
const out = join(dirname(fileURLToPath(import.meta.url)), 'promo-audio.wav');

const left = new Float32Array(FRAME_COUNT);
const right = new Float32Array(FRAME_COUNT);
const TAU = Math.PI * 2;

function randomFactory(seed = 0x290905) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function envelope(time, duration, attack, decay, sustain, release) {
  if (time < 0 || time >= duration) return 0;
  if (time < attack) return time / Math.max(attack, 1 / SAMPLE_RATE);
  if (time < attack + decay) return 1 - (1 - sustain) * ((time - attack) / decay);
  if (time < duration - release) return sustain;
  return sustain * (duration - time) / Math.max(release, 1 / SAMPLE_RATE);
}

function triangle(phase) {
  const cycle = phase / TAU;
  return 2 * Math.abs(2 * (cycle - Math.floor(cycle + .5))) - 1;
}

function panGains(pan) {
  return [Math.cos((pan + 1) * Math.PI / 4), Math.sin((pan + 1) * Math.PI / 4)];
}

function addTone({ start, duration, frequency, gain, pan = 0, attack = .02, decay = .25,
  sustain = .55, release = .5, triangleMix = 0, phaseOffset = 0 }) {
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const last = Math.min(FRAME_COUNT, Math.ceil((start + duration) * SAMPLE_RATE));
  const [leftGain, rightGain] = panGains(pan);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const phase = TAU * frequency * time + phaseOffset;
    const wave = Math.sin(phase) * (1 - triangleMix) + triangle(phase) * triangleMix;
    const sample = wave * envelope(time, duration, attack, decay, sustain, release) * gain;
    left[index] += sample * leftGain;
    right[index] += sample * rightGain;
  }
}

// 高さの変わる音。探すときの「ぴゅっ」に使うので、位相は積分して繋ぐ。
function addSweep({ start, duration, from, to, gain, pan = 0, attack = .004, decay = .05,
  sustain = .34, release = .1 }) {
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const last = Math.min(FRAME_COUNT, Math.ceil((start + duration) * SAMPLE_RATE));
  const [leftGain, rightGain] = panGains(pan);
  let phase = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    phase += TAU * (from + (to - from) * (time / duration)) / SAMPLE_RATE;
    const sample = Math.sin(phase) * envelope(time, duration, attack, decay, sustain, release) * gain;
    left[index] += sample * leftGain;
    right[index] += sample * rightGain;
  }
}

// 薄いパッド。G3・D4 と弱い B4 で開いた和音にし、非常に遅い呼吸だけを持たせる。
const pads = [
  { frequency: 195.9977 * 2 ** (-3 / 1200), gain: .058, pan: -.45, phase: .4 },
  { frequency: 293.6648 * 2 ** (2 / 1200), gain: .05, pan: .43, phase: 2.1 },
  { frequency: 493.8833 * 2 ** (-2 / 1200), gain: .026, pan: .06, phase: 3.6 }
];
for (const pad of pads) {
  const [leftGain, rightGain] = panGains(pad.pan);
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const time = index / SAMPLE_RATE;
    const breathe = .78 + .22 * Math.sin(TAU * (.019 + pad.frequency / 38_000) * time + pad.phase);
    const value = Math.sin(TAU * pad.frequency * time + pad.phase) * pad.gain * breathe;
    left[index] += value * leftGain;
    right[index] += value * rightGain;
  }
}

/* 92 BPM の8分音符。Gメジャー・ペンタトニックを固定シードで並べ、
   3回に1回ほど休符を置く。歩いて探している速さに合わせたテンポ。 */
const notes = [391.9954, 440, 493.8833, 587.3295, 659.2551, 783.9909, 880];
const random = randomFactory();
const eighth = 60 / 92 / 2;
let previous = 0;
for (let step = 0, start = .7; start < 34.6; step += 1, start = .7 + step * eighth) {
  if (random() < .31) continue;
  let choice = Math.floor(random() * notes.length);
  if (choice === previous) choice = (choice + 2 + Math.floor(random() * 3)) % notes.length;
  previous = choice;
  const frequency = notes[choice];
  const pan = (random() * 2 - 1) * .5;
  const gain = .05 + random() * .016;
  const base = { start, duration: 1.1, frequency, gain, pan, attack: .03, decay: .2,
    sustain: .38, release: .62, triangleMix: .34, phaseOffset: random() * TAU };
  addTone(base);
  // フィードバックディレイを2回だけ展開する。反響は左右をゆっくり渡る。
  addTone({ ...base, start: start + .33, gain: gain * .24, pan: -pan * .8, duration: .96 });
  addTone({ ...base, start: start + .66, gain: gain * .08, pan: pan * .55, duration: .84 });
}

// 低いベル（タイトルの出現に合わせる）。基音と非整数倍の倍音で金属感を作る。
for (const [multiple, gain, duration] of [[1, .148, 3.4], [2.01, .07, 2.6], [3.94, .032, 1.8]]) {
  addTone({ start: 2.85, duration, frequency: 97.9989 * multiple, gain, pan: -.08,
    attack: .008, decay: .6, sustain: .2, release: duration * .56, triangleMix: .04 });
}

// 「現在地から探す」を押した瞬間。上がる音のあと、結果がそろう和音。
addSweep({ start: T_LOCATE, duration: .2, from: 440, to: 880, gain: .14, pan: -.05 });
[391.9954, 587.3295, 783.9909].forEach((frequency, index) => {
  addTone({ start: T_LOCATE + .28 + index * .07, duration: 1.15, frequency, gain: .058 - index * .006,
    pan: -.18 + index * .16, attack: .006, decay: .24, sustain: .2, release: .74, triangleMix: .06 });
});

// 「無料と客向けだけ」の切り替え。短い2音で「絞った」感じを出す。
addTone({ start: T_FREE, duration: .16, frequency: 880, gain: .1, pan: .1,
  attack: .003, decay: .06, sustain: .16, release: .08 });
addTone({ start: T_FREE + .1, duration: .5, frequency: 587.3295, gain: .075, pan: -.08,
  attack: .004, decay: .18, sustain: .14, release: .3 });

// 地図のピンを押した瞬間。高い2音の重なりで「かちっ」と鳴らす。
addSweep({ start: T_PIN, duration: .12, from: 660, to: 990, gain: .12, pan: .06 });
addTone({ start: T_PIN + .1, duration: .8, frequency: 1174.659, gain: .036, pan: .18,
  attack: .004, decay: .22, sustain: .12, release: .5, triangleMix: .08 });
addTone({ start: T_PIN + .1, duration: .8, frequency: 293.6648, gain: .078, pan: -.05,
  attack: .004, decay: .18, sustain: .14, release: .48 });

// 全体のフェードと軽いソフトサチュレーション。
let rawPeak = 0;
let sumSquares = 0;
for (let index = 0; index < FRAME_COUNT; index += 1) {
  const time = index / SAMPLE_RATE;
  const fadeIn = Math.min(1, time / 1);
  const fadeOut = Math.min(1, (DURATION_SECONDS - time) / 2.5);
  const master = Math.sin(Math.PI * .5 * Math.max(0, fadeIn))
    * Math.sin(Math.PI * .5 * Math.max(0, fadeOut));
  left[index] = Math.tanh(left[index] * 1.4) / 1.4 * master;
  right[index] = Math.tanh(right[index] * 1.4) / 1.4 * master;
  rawPeak = Math.max(rawPeak, Math.abs(left[index]), Math.abs(right[index]));
  sumSquares += (left[index] ** 2 + right[index] ** 2) / 2;
}

const rawRms = Math.sqrt(sumSquares / FRAME_COUNT);
let scale = rawRms > 0 ? TARGET_RMS / rawRms : 1;
if (rawPeak * scale > PEAK_CEILING) scale = PEAK_CEILING / rawPeak;
const pcm = Buffer.alloc(FRAME_COUNT * CHANNELS * (BITS_PER_SAMPLE / 8));
let finalPeak = 0;
for (let index = 0; index < FRAME_COUNT; index += 1) {
  const values = [left[index] * scale, right[index] * scale];
  for (let channel = 0; channel < CHANNELS; channel += 1) {
    const value = Math.max(-1, Math.min(1, values[channel]));
    finalPeak = Math.max(finalPeak, Math.abs(value));
    pcm.writeInt16LE(Math.round(value * 32767), (index * CHANNELS + channel) * 2);
  }
}

const header = Buffer.alloc(44);
const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(CHANNELS, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(byteRate, 28);
header.writeUInt16LE(blockAlign, 32);
header.writeUInt16LE(BITS_PER_SAMPLE, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

writeFileSync(out, Buffer.concat([header, pcm]));

const rms = Math.sqrt(sumSquares / FRAME_COUNT) * scale;
const db = (value) => 20 * Math.log10(Math.max(value, Number.EPSILON));
console.log(`WAVを書き出しました: ${out}`);
console.log(`  ${DURATION_SECONDS.toFixed(3)}秒 / ${SAMPLE_RATE}Hz / 16bit / stereo`);
console.log(`  peak ${db(finalPeak).toFixed(2)} dBFS / RMS ${db(rms).toFixed(2)} dBFS`);
