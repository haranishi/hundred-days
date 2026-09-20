import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BITS_PER_SAMPLE = 16;
const DURATION_SECONDS = 36;
const T_SAVE = 23.4;
const FRAME_COUNT = SAMPLE_RATE * DURATION_SECONDS;
const TARGET_PEAK = 10 ** (-3.8 / 20); // -3.8 dBFS ≒ 統合 -17 LUFS（Day 026 と同程度）
const out = join(dirname(fileURLToPath(import.meta.url)), 'promo-audio.wav');

const left = new Float32Array(FRAME_COUNT);
const right = new Float32Array(FRAME_COUNT);
const TAU = Math.PI * 2;

function randomFactory(seed = 0x270903) {
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

function addTone({ start, duration, frequency, gain, pan = 0, attack = .02, decay = .25,
  sustain = .55, release = .5, triangleMix = 0, phaseOffset = 0 }) {
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const last = Math.min(FRAME_COUNT, Math.ceil((start + duration) * SAMPLE_RATE));
  const leftGain = Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = Math.sin((pan + 1) * Math.PI / 4);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const phase = TAU * frequency * time + phaseOffset;
    const wave = Math.sin(phase) * (1 - triangleMix) + triangle(phase) * triangleMix;
    const sample = wave * envelope(time, duration, attack, decay, sustain, release) * gain;
    left[index] += sample * leftGain;
    right[index] += sample * rightGain;
  }
}

// 薄いパッド。C3・G3 と弱い E4 で明るい和音にし、非常に遅い呼吸だけを持たせる。
const pads = [
  { frequency: 130.8128 * 2 ** (-4 / 1200), gain: .056, pan: -.46, phase: .1 },
  { frequency: 195.9977 * 2 ** (3 / 1200), gain: .05, pan: .42, phase: 1.7 },
  { frequency: 329.6276 * 2 ** (-2 / 1200), gain: .03, pan: .08, phase: 3.2 }
];
for (const pad of pads) {
  const leftGain = Math.cos((pad.pan + 1) * Math.PI / 4);
  const rightGain = Math.sin((pad.pan + 1) * Math.PI / 4);
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const time = index / SAMPLE_RATE;
    const breathe = .78 + .22 * Math.sin(TAU * (.021 + pad.frequency / 35_000) * time + pad.phase);
    const value = Math.sin(TAU * pad.frequency * time + pad.phase) * pad.gain * breathe;
    left[index] += value * leftGain;
    right[index] += value * rightGain;
  }
}

// 84 BPM の8分音符。Cメジャー・ペンタトニックを固定シードで並べる。
const notes = [261.6256, 293.6648, 329.6276, 391.9954, 440, 523.2511];
const random = randomFactory();
const eighth = 60 / 84 / 2;
let previous = 0;
for (let step = 0, start = .8; start < 34.2; step += 1, start = .8 + step * eighth) {
  let choice = Math.floor(random() * notes.length);
  if (choice === previous) choice = (choice + 2 + Math.floor(random() * 3)) % notes.length;
  previous = choice;
  const frequency = notes[choice];
  const pan = (random() * 2 - 1) * .48;
  const gain = .046 + random() * .015;
  const base = { start, duration: 1.18, frequency, gain, pan, attack: .03, decay: .2,
    sustain: .42, release: .6, triangleMix: .44, phaseOffset: random() * TAU };
  addTone(base);
  // フィードバックディレイを2回だけ展開する。反響は左右をゆっくり渡る。
  addTone({ ...base, start: start + .34, gain: gain * .23, pan: -pan * .8, duration: 1.04 });
  addTone({ ...base, start: start + .68, gain: gain * .075, pan: pan * .55, duration: .9 });
}

// 3.3秒の低いベル（タイトルの出現に合わせる）。基音と非整数倍の倍音で金属感を作る。
for (const [multiple, gain, duration] of [[1, .15, 3.5], [2.01, .072, 2.7], [3.94, .033, 1.9]]) {
  addTone({ start: 3.3, duration, frequency: 110 * multiple, gain, pan: -.08,
    attack: .008, decay: .62, sustain: .2, release: duration * .56, triangleMix: .04 });
}

// 保存のタップに、A5→E6の小さな2音チャイム。
for (const [start, frequency, pan] of [[T_SAVE, 880, -.18], [T_SAVE + .15, 1318.5102, .24]]) {
  addTone({ start, duration: 1.45, frequency, gain: .071, pan, attack: .004,
    decay: .2, sustain: .22, release: .9, triangleMix: .08 });
  addTone({ start, duration: 1.05, frequency: frequency * 2.003, gain: .019, pan: -pan,
    attack: .004, decay: .12, sustain: .12, release: .72 });
}

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

const scale = rawPeak > 0 ? TARGET_PEAK / rawPeak : 1;
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
