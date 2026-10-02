/* Day 055 プロモ動画の BGM（32秒・純JS波形合成）
   明るく温かいアコースティック／トイピアノ調のBGMを合成し、promo-audio.wav へ出力する。 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION_SECONDS } from './timeline.mjs';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BITS_PER_SAMPLE = 16;
const FRAME_COUNT = SAMPLE_RATE * DURATION_SECONDS;
const TAU = Math.PI * 2;
const here = dirname(fileURLToPath(import.meta.url));

const out = resolve(here, 'promo-audio.wav');
const TARGET_RMS = 10 ** (-17.5 / 20); // -17.5 dB RMS

const BPM = 108;
const BEAT = 60 / BPM;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

const makeBus = () => ({ l: new Float32Array(FRAME_COUNT), r: new Float32Array(FRAME_COUNT) });
const music = makeBus();

// コード進行: Cmaj7 (C E G B) -> G/B (B D G) -> Am7 (A C E G) -> Fmaj7 (F A C E)
const CHORDS = [
  { notes: [60, 64, 67, 71], bass: 36 },
  { notes: [59, 62, 67, 71], bass: 35 },
  { notes: [57, 60, 64, 67], bass: 33 },
  { notes: [53, 57, 60, 64], bass: 41 },
];

// メロディ (MIDIノート, 開始拍, 長さ拍)
const MELODY = [
  // 1-2小節
  [72, 0, 1], [74, 1, 1], [76, 2, 1.5], [72, 3.5, 0.5],
  [79, 4, 2], [76, 6, 2],
  // 3-4小節
  [77, 8, 1], [76, 9, 1], [74, 10, 1.5], [72, 11.5, 0.5],
  [74, 12, 3],
  // 5-6小節
  [72, 16, 1], [74, 17, 1], [76, 18, 1.5], [79, 19.5, 0.5],
  [81, 20, 2], [76, 22, 2],
  // 7-8小節
  [77, 24, 1], [76, 25, 1], [74, 26, 1.5], [72, 27.5, 0.5],
  [72, 28, 4],
  // 9-10小節（展開・盛り上がり）
  [76, 32, 1], [77, 33, 1], [79, 34, 2],
  [84, 36, 2], [81, 38, 2],
  // 11-12小節（締め）
  [79, 40, 1.5], [76, 41.5, 0.5], [74, 42, 2],
  [72, 44, 4], [72, 48, 6],
];

// プラック音合成（マリンバ／トイピアノ風）
function renderPluck(bus, startSec, midi, durSec, gain, pan = 0) {
  const f0 = hz(midi);
  const startSample = Math.floor(startSec * SAMPLE_RATE);
  const totalSamples = Math.floor(Math.min(durSec * 1.5, DURATION_SECONDS - startSec) * SAMPLE_RATE);
  if (totalSamples <= 0 || startSample >= FRAME_COUNT) return;

  const leftGain = gain * Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = gain * Math.sin((pan + 1) * Math.PI / 4);

  for (let i = 0; i < totalSamples; i++) {
    const idx = startSample + i;
    if (idx >= FRAME_COUNT) break;
    const t = i / SAMPLE_RATE;
    // 指数減衰エンベロープ
    const env = Math.exp(-t * 6.5);
    // 基音 + 倍音 (ベル／木琴のような明るい倍音)
    const wave = Math.sin(TAU * f0 * t) +
                 0.45 * Math.sin(TAU * f0 * 2.0 * t) * Math.exp(-t * 12) +
                 0.25 * Math.sin(TAU * f0 * 3.01 * t) * Math.exp(-t * 18);
    const s = wave * env;
    bus.l[idx] += s * leftGain;
    bus.r[idx] += s * rightGain;
  }
}

// ベース音合成
function renderBass(bus, startSec, midi, durSec, gain) {
  const f0 = hz(midi);
  const startSample = Math.floor(startSec * SAMPLE_RATE);
  const totalSamples = Math.floor(Math.min(durSec, DURATION_SECONDS - startSec) * SAMPLE_RATE);
  if (totalSamples <= 0 || startSample >= FRAME_COUNT) return;

  for (let i = 0; i < totalSamples; i++) {
    const idx = startSample + i;
    if (idx >= FRAME_COUNT) break;
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 3.0);
    // 丸みのあるサイン波＋わずかな2倍音
    const wave = Math.sin(TAU * f0 * t) + 0.2 * Math.sin(TAU * f0 * 2 * t);
    const s = wave * env * gain;
    bus.l[idx] += s * 0.7;
    bus.r[idx] += s * 0.7;
  }
}

// シェイカー／リズム
function renderShaker(bus, startSec, gain, pan = 0.2) {
  const startSample = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.floor(0.04 * SAMPLE_RATE);
  const leftGain = gain * Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = gain * Math.sin((pan + 1) * Math.PI / 4);

  let seed = 12345;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };

  for (let i = 0; i < len; i++) {
    const idx = startSample + i;
    if (idx >= FRAME_COUNT) break;
    const t = i / len;
    const env = (1 - t) * (1 - t);
    const s = rand() * env;
    bus.l[idx] += s * leftGain;
    bus.r[idx] += s * rightGain;
  }
}

// 演奏シーケンスのレンダリング
const totalBars = Math.ceil(DURATION_SECONDS / (BEAT * 4));
for (let bar = 0; bar < totalBars; bar++) {
  const chord = CHORDS[bar % CHORDS.length];
  const barStart = bar * 4 * BEAT;

  // ベース
  renderBass(music, barStart, chord.bass, BEAT * 1.8, 0.45);
  renderBass(music, barStart + BEAT * 2, chord.bass, BEAT * 1.8, 0.4);

  // アルペジオ和音
  for (let beat = 0; beat < 4; beat++) {
    const t = barStart + beat * BEAT;
    const note = chord.notes[beat % chord.notes.length];
    renderPluck(music, t, note, BEAT * 0.8, 0.22, (beat % 2 === 0 ? -0.3 : 0.3));
    renderPluck(music, t + BEAT * 0.5, chord.notes[(beat + 2) % chord.notes.length], BEAT * 0.6, 0.15, (beat % 2 === 0 ? 0.3 : -0.3));
    // シェイカー
    renderShaker(music, t, 0.12, 0.25);
    renderShaker(music, t + BEAT * 0.5, 0.08, -0.25);
  }
}

// メロディの演奏
for (const [midi, beat, dur] of MELODY) {
  const t = beat * BEAT;
  if (t < DURATION_SECONDS - 1) {
    renderPluck(music, t, midi, dur * BEAT, 0.48, 0);
  }
}

// RMS正規化
let sumSq = 0;
for (let i = 0; i < FRAME_COUNT; i++) {
  sumSq += music.l[i] * music.l[i] + music.r[i] * music.r[i];
}
const rms = Math.sqrt(sumSq / (FRAME_COUNT * 2)) || 1e-6;
const scale = TARGET_RMS / rms;

// 16bit PCM WAV ヘッダー生成
const dataSize = FRAME_COUNT * CHANNELS * (BITS_PER_SAMPLE / 8);
const buffer = Buffer.alloc(44 + dataSize);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(CHANNELS, 22);
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), 28);
buffer.writeUInt16LE(CHANNELS * (BITS_PER_SAMPLE / 8), 32);
buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

// 書き込み（クリッピング防止）
let offset = 44;
for (let i = 0; i < FRAME_COUNT; i++) {
  const l = Math.max(-1, Math.min(1, music.l[i] * scale));
  const r = Math.max(-1, Math.min(1, music.r[i] * scale));
  buffer.writeInt16LE(Math.round(l < 0 ? l * 32768 : l * 32767), offset);
  buffer.writeInt16LE(Math.round(r < 0 ? r * 32768 : r * 32767), offset + 2);
  offset += 4;
}

writeFileSync(out, buffer);
console.log(`promo-audio.mjs: Wrote ${out} (${Math.round(buffer.length / 1024)}KB)`);
