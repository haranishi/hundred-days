import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION_SECONDS, T_RANDOM_TAP, T_SEARCH_TAP } from './timeline.mjs';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BITS_PER_SAMPLE = 16;
const FRAME_COUNT = SAMPLE_RATE * DURATION_SECONDS;
const TARGET_PEAK = 10 ** (-3.8 / 20); // Day 028 と同じピーク処理で統合ラウドネス感を揃える。
const out = join(dirname(fileURLToPath(import.meta.url)), 'promo-audio.wav');
const left = new Float32Array(FRAME_COUNT);
const right = new Float32Array(FRAME_COUNT);
const TAU = Math.PI * 2;

function randomFactory(seed = 0x300905) {
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

// 深夜の世界地図らしい D minor add9 の薄いパッド。
for (const pad of [
  { frequency: 73.4162, gain: .055, pan: -.48, phase: .1 },
  { frequency: 110, gain: .046, pan: .42, phase: 1.8 },
  { frequency: 164.8138, gain: .03, pan: .08, phase: 3.1 },
  { frequency: 329.6276, gain: .018, pan: -.16, phase: 4.2 },
]) {
  const [leftGain, rightGain] = panGains(pad.pan);
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const time = index / SAMPLE_RATE;
    const breathe = .76 + .24 * Math.sin(TAU * .024 * time + pad.phase);
    const sample = Math.sin(TAU * pad.frequency * time + pad.phase) * pad.gain * breathe;
    left[index] += sample * leftGain; right[index] += sample * rightGain;
  }
}

// D minor pentatonic。固定シードなので毎回まったく同じ旋律になる。
const notes = [293.6648, 349.2282, 391.9954, 440, 523.2511, 587.3295, 698.4565];
const random = randomFactory();
const eighth = 60 / 80 / 2;
let previous = 0;
for (let step = 0, start = .75; start < 34.2; step += 1, start = .75 + step * eighth) {
  if (random() < .28) continue;
  let choice = Math.floor(random() * notes.length);
  if (choice === previous) choice = (choice + 2 + Math.floor(random() * 2)) % notes.length;
  previous = choice;
  const gain = .052 + random() * .018;
  const base = { start, duration: 1.25, frequency: notes[choice], gain, pan: (random() * 2 - 1) * .52,
    attack: .03, decay: .2, sustain: .36, release: .72, triangleMix: .32, phaseOffset: random() * TAU };
  addTone(base);
  addTone({ ...base, start: start + .34, gain: gain * .22, pan: -base.pan * .8, duration: 1.05 });
  addTone({ ...base, start: start + .68, gain: gain * .075, pan: base.pan * .5, duration: .9 });
}

// タイトルと各6秒区切りに、遠くで灯りが点くようなベルを置く。
for (const [start, root] of [[2.7, 110], [5.2, 146.8324], [12, 130.8128], [18, 174.6141], [24, 146.8324], [30, 220]]) {
  for (const [multiple, gain, duration] of [[1, .12, 2.8], [2.01, .055, 2.1], [3.96, .024, 1.5]]) {
    addTone({ start, duration, frequency: root * multiple, gain, pan: -.1,
      attack: .006, decay: .5, sustain: .16, release: duration * .55 });
  }
}

// 検索候補とランダムボタンの2回のタップ。
for (const [at, pan] of [[T_SEARCH_TAP, -.12], [T_RANDOM_TAP, .14]]) {
  addSweep({ start: at, duration: .14, from: 920, to: 610, gain: .14, pan });
  addTone({ start: at + .08, duration: .55, frequency: 196, gain: .085, pan: -pan,
    attack: .004, decay: .14, sustain: .12, release: .32 });
  addTone({ start: at + .09, duration: .9, frequency: 783.9909, gain: .034, pan,
    attack: .008, decay: .25, sustain: .16, release: .52 });
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

const scale = rawPeak > 0 ? TARGET_PEAK / rawPeak : 1;
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

const rms = Math.sqrt(sumSquares / FRAME_COUNT) * scale;
const db = (value) => 20 * Math.log10(Math.max(value, Number.EPSILON));
console.log(`WAVを書き出しました: ${out}`);
console.log(`  ${DURATION_SECONDS.toFixed(3)}秒 / ${SAMPLE_RATE}Hz / 16bit / stereo`);
console.log(`  peak ${db(finalPeak).toFixed(2)} dBFS / RMS ${db(rms).toFixed(2)} dBFS`);
