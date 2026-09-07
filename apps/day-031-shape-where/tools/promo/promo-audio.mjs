import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION_SECONDS, RESULT_START, STORYBOARD, TAPS } from './timeline.mjs';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BITS_PER_SAMPLE = 16;
const FRAME_COUNT = SAMPLE_RATE * DURATION_SECONDS;
/* 音量はピークでなく RMS で合わせる。ピーク基準だと音を1つ足しただけで正規化の倍率が動き、
   統合ラウドネスが数dB変わる（Day 029 で -17 → -14.3 LUFS になった）。 */
const TARGET_RMS = 10 ** (-18.7 / 20);    // 統合 -17.1 LUFS 相当（この曲で ffmpeg の loudnorm を実測して決めた値）
const PEAK_CEILING = 10 ** (-1.5 / 20);   // ここを超えるならピーク基準へ切り替える
const out = join(dirname(fileURLToPath(import.meta.url)), 'promo-audio.wav');

const left = new Float32Array(FRAME_COUNT);
const right = new Float32Array(FRAME_COUNT);
const TAU = Math.PI * 2;

function randomFactory(seed = 0x310907) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
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
    left[index] += sample * leftGain; right[index] += sample * rightGain;
  }
}

function addSweep({ start, duration, from, to, gain, pan = 0 }) {
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const last = Math.min(FRAME_COUNT, Math.ceil((start + duration) * SAMPLE_RATE));
  const [leftGain, rightGain] = panGains(pan);
  let phase = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    phase += TAU * (from + (to - from) * (time / duration)) / SAMPLE_RATE;
    const sample = Math.sin(phase) * envelope(time, duration, .004, .05, .3, .12) * gain;
    left[index] += sample * leftGain; right[index] += sample * rightGain;
  }
}

// 紙のうえで考えている感じの、薄い F の持続音。
for (const pad of [
  { frequency: 87.3071, gain: .052, pan: -.46, phase: .3 },
  { frequency: 130.8128, gain: .042, pan: .4, phase: 2.1 },
  { frequency: 174.6141, gain: .026, pan: .05, phase: 3.6 },
  { frequency: 349.2282, gain: .014, pan: -.2, phase: 5 }
]) {
  const [leftGain, rightGain] = panGains(pad.pan);
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const time = index / SAMPLE_RATE;
    const breathe = .78 + .22 * Math.sin(TAU * .027 * time + pad.phase);
    const sample = Math.sin(TAU * pad.frequency * time + pad.phase) * pad.gain * breathe;
    left[index] += sample * leftGain; right[index] += sample * rightGain;
  }
}

// F メジャーペンタトニックを木琴ふうに。固定シードなので毎回まったく同じ旋律になる。
const notes = [349.2282, 391.9954, 440, 523.2511, 587.3295, 698.4565, 783.9909];
const random = randomFactory();
const eighth = 60 / 88 / 2;
let previous = 0;
for (let step = 0, start = .6; start < 34; step += 1, start = .6 + step * eighth) {
  if (random() < .3) continue;
  let choice = Math.floor(random() * notes.length);
  if (choice === previous) choice = (choice + 2 + Math.floor(random() * 2)) % notes.length;
  previous = choice;
  const gain = .05 + random() * .016;
  const base = {
    start, duration: 1.1, frequency: notes[choice], gain, pan: (random() * 2 - 1) * .5,
    attack: .006, decay: .26, sustain: .22, release: .62, triangleMix: .42, phaseOffset: random() * TAU
  };
  addTone(base);
  addTone({ ...base, start: start + .3, gain: gain * .2, pan: -base.pan * .8, duration: .95 });
}

// 場面の変わり目に、遠くで鐘が鳴るような和音を置く。
for (const [index, scene] of STORYBOARD.slice(1).entries()) {
  const root = [174.6141, 130.8128, 196, 261.6256, 220, 174.6141, 261.6256][index] ?? 174.6141;
  for (const [multiple, gain, duration] of [[1, .115, 2.6], [2.01, .05, 2], [3.98, .022, 1.4]]) {
    addTone({
      start: scene.start, duration, frequency: root * multiple, gain, pan: -.08,
      attack: .006, decay: .5, sustain: .15, release: duration * .55
    });
  }
}

/* 指がボタンに触れる4回。正解のタップは、そのあとに上がる2音を足して「当たった」音にする。 */
for (const [index, tap] of TAPS.entries()) {
  const pan = index % 2 === 0 ? -.14 : .14;
  addSweep({ start: tap.at, duration: .12, from: 1180, to: 720, gain: .13, pan });
  addTone({
    start: tap.at + .06, duration: .5, frequency: 196, gain: .08, pan: -pan,
    attack: .004, decay: .14, sustain: .1, release: .3
  });
  if (tap.kind !== 'correct') continue;
  for (const [offset, frequency, gain] of [[.1, 523.2511, .085], [.24, 698.4565, .075]]) {
    addTone({
      start: tap.at + offset, duration: .8, frequency, gain, pan: pan * .6,
      attack: .006, decay: .22, sustain: .16, release: .5, triangleMix: .25
    });
  }
}

// 結果が出る瞬間だけ、3音の短いファンファーレ。
for (const [offset, frequency] of [[0, 523.2511], [.16, 659.2551], [.32, 783.9909]]) {
  addTone({
    start: RESULT_START + offset, duration: 1.5, frequency, gain: .075, pan: (offset - .16) * 2,
    attack: .008, decay: .3, sustain: .18, release: .9, triangleMix: .2
  });
}

let rawPeak = 0;
let sumSquares = 0;
for (let index = 0; index < FRAME_COUNT; index += 1) {
  const time = index / SAMPLE_RATE;
  const fadeIn = Math.min(1, time / 1);
  const fadeOut = Math.min(1, (DURATION_SECONDS - time) / 2.5);
  const master = Math.sin(Math.PI * .5 * Math.max(0, fadeIn)) * Math.sin(Math.PI * .5 * Math.max(0, fadeOut));
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
  for (const [channel, sample] of [left[index] * scale, right[index] * scale].entries()) {
    const value = Math.max(-1, Math.min(1, sample));
    finalPeak = Math.max(finalPeak, Math.abs(value));
    pcm.writeInt16LE(Math.round(value * 32767), (index * CHANNELS + channel) * 2);
  }
}

const header = Buffer.alloc(44);
const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
header.writeUInt16LE(CHANNELS, 22); header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(byteRate, 28);
header.writeUInt16LE(blockAlign, 32); header.writeUInt16LE(BITS_PER_SAMPLE, 34);
header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
writeFileSync(out, Buffer.concat([header, pcm]));

const rms = rawRms * scale;
const db = (value) => 20 * Math.log10(Math.max(value, Number.EPSILON));
console.log(`WAVを書き出しました: ${out}`);
console.log(`  ${DURATION_SECONDS.toFixed(3)}秒 / ${SAMPLE_RATE}Hz / 16bit / stereo`);
console.log(`  peak ${db(finalPeak).toFixed(2)} dBFS / RMS ${db(rms).toFixed(2)} dBFS`);
