/* デモ動画に音を付ける。

   Playwrightは音を録らないので、動画は無音で上がる。そこで**アプリと同じ音符データ**
   （lib/music.js の伴奏・lib/chart.js の発射・打点）から、同じ波形と同じ包絡線で
   WAVを組み立て直し、ffmpegで重ねる。day-007/008/010と同じ手。

   使い方（record-demo.mjs のあとに走らせる）:
     node tools/render-demo-audio.mjs

   demo-scenario.mjs が書き出したキュー（曲の頭が動画の末尾から何秒前か）を読んで位置を合わせる。 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHARTS, expandChart } from '../lib/chart.js';
import { COUNT_IN_BEATS, beatToSeconds } from '../lib/beat.js';
import { buildAccompaniment, chordAt, countInTicks, midiToFreq, BEATS_PER_BAR } from '../lib/music.js';
import { FLIGHT_BEATS } from '../lib/chart.js';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const CUES = join(tmpdir(), 'day-012-demo-cues.json');
const RATE = 44100;

if (!existsSync(CUES)) {
  console.error(`キューがありません: ${CUES}`);
  console.error('先に record-demo.mjs を走らせてください。');
  process.exit(1);
}
const cues = JSON.parse(readFileSync(CUES, 'utf8'));

// ---------------------------------------------------------------- 合成

const buffer = new Float32Array(0);
let track = null;

function ensure(seconds) {
  const need = Math.ceil(seconds * RATE) + RATE;
  if (track && track.length >= need) return;
  const next = new Float32Array(need);
  if (track) next.set(track);
  track = next;
}

/** 指数の立ち上がり・減衰。lib/audio.js の #envelope と同じ形。 */
const envelope = (t, attack, duration, peak) => {
  if (t < 0 || t > duration) return 0;
  if (t < attack) return peak * (t / attack);
  return peak * Math.exp(-4.2 * ((t - attack) / Math.max(0.001, duration - attack)));
};

function tone(at, { type = 'triangle', freq, duration, peak, sweepTo = null }) {
  ensure(at + duration + 0.2);
  const start = Math.floor(at * RATE);
  const total = Math.ceil((duration + 0.05) * RATE);
  let phase = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / RATE;
    const f = sweepTo === null ? freq : freq * (sweepTo / freq) ** Math.min(1, t / duration);
    phase += (2 * Math.PI * f) / RATE;
    let wave;
    if (type === 'sine') wave = Math.sin(phase);
    else if (type === 'square') wave = Math.sin(phase) >= 0 ? 1 : -1;
    else if (type === 'sawtooth') wave = ((phase / Math.PI) % 2) - 1;
    else wave = (2 / Math.PI) * Math.asin(Math.sin(phase)); // triangle
    const index = start + i;
    if (index >= 0 && index < track.length) track[index] += wave * envelope(t, Math.min(0.03, duration / 4), duration, peak);
  }
}

/* 雑音にフィルタをかける。BiquadFilterNode の代わりに1次のIIRで近似する
   （デモの音なので、同じ役割の音色になっていれば足りる）。 */
function burst(at, { duration, peak, type = 'bandpass', frequency = 1800 }) {
  ensure(at + duration + 0.2);
  const start = Math.floor(at * RATE);
  const total = Math.ceil((duration + 0.05) * RATE);
  const coefficient = Math.exp((-2 * Math.PI * frequency) / RATE);
  let low = 0;
  let low2 = 0;
  for (let i = 0; i < total; i += 1) {
    const raw = Math.random() * 2 - 1;
    low = raw * (1 - coefficient) + low * coefficient;
    low2 = low * (1 - coefficient) + low2 * coefficient;
    let value;
    if (type === 'lowpass') value = low * 2.2;
    else if (type === 'highpass') value = raw - low;
    else value = (low - low2) * 3.4; // bandpass
    const index = start + i;
    if (index >= 0 && index < track.length) track[index] += value * envelope(i / RATE, 0.004, duration, peak);
  }
}

// ---------------------------------------------------------------- 譜面どおりに並べる

const chart = expandChart(CHARTS[cues.chart ?? 'short']);
const songLength = beatToSeconds(chart.beats, chart.bpm) + 1.2;
ensure(songLength);

for (const event of [...countInTicks(), ...buildAccompaniment(chart.beats)]) {
  const at = beatToSeconds(event.beat, chart.bpm);
  const seconds = event.duration * 0.42;
  if (event.voice === 'bass') {
    tone(at, { type: 'triangle', freq: event.freq, duration: seconds, peak: event.gain });
    tone(at, { type: 'sine', freq: event.freq / 2, duration: seconds, peak: event.gain * 0.6 });
  } else if (event.voice === 'pad') {
    tone(at, { type: 'sine', freq: event.freq, duration: event.duration * 0.5, peak: event.gain });
  } else if (event.voice === 'melody') {
    tone(at, { type: 'triangle', freq: event.freq, duration: seconds, peak: event.gain });
    tone(at, { type: 'sine', freq: event.freq * 2, duration: seconds * 0.6, peak: event.gain * 0.3 });
  } else {
    tone(at, { type: 'square', freq: event.freq, duration: 0.06, peak: event.gain * 0.5 });
  }
}

for (const object of chart.objects) {
  const at = beatToSeconds(object.fireBeat, chart.bpm);
  if (object.kind === 'gull') {
    tone(at, { type: 'sawtooth', freq: 720, duration: 0.26, peak: 0.16, sweepTo: 1080 });
    continue;
  }
  for (const offset of object.kind === 'double' ? [0, 0.075] : [0]) {
    burst(at + offset, { duration: 0.16, peak: 0.3, type: 'lowpass', frequency: 620 });
    tone(at + offset, { type: 'sine', freq: object.kind === 'double' ? 210 : 150, duration: 0.26, peak: 0.32, sweepTo: 48 });
  }
}

/* デモは打点ちょうどで自動的に打っている（demo-scenario.mjs）ので、
   打った音と、その2拍あとの敵船への着弾音は、譜面から決まる。 */
for (const note of chart.notes) {
  const at = beatToSeconds(note.beat, chart.bpm);
  burst(at, { duration: 0.09, peak: 0.42, type: 'bandpass', frequency: 2100 });
  tone(at, { type: 'triangle', freq: 330, duration: 0.12, peak: 0.16 });
  const bar = Math.floor(Math.max(0, note.beat) / BEATS_PER_BAR);
  tone(at + 0.01, { type: 'sine', freq: midiToFreq(chordAt(bar).pad[2]) * 2, duration: 0.5, peak: 0.12 });

  const landing = beatToSeconds(note.beat + FLIGHT_BEATS, chart.bpm);
  burst(landing, { duration: 0.34, peak: 0.13, type: 'lowpass', frequency: 240 });
  tone(landing, { type: 'sine', freq: 70, duration: 0.34, peak: 0.14 });
}

// ---------------------------------------------------------------- WAVにして重ねる

const video = join(appDir, 'demo.mp4');
const out = join(appDir, 'demo-with-audio.mp4');
const duration = Number(execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video
], { encoding: 'utf8' }).trim());

/* 頭のタイトル画面を切り落とし、**遊んでいる最中から始める**。
   理由は2つある。
   ①動画の1コマ目がそのままサムネになるので、文字だらけの画面ではなく砲弾が飛んでいる絵にしたい
   ②タイトル画面の間は曲が鳴っていない。頭から4秒無音だと「音が入っていない」と受け取られる
   拍1.2で切ると、最初の砲弾が中ほどまで来ていて、その0.4秒後に最初の判定が出る。 */
const START_BEAT = 1.2;
const audioFrom = beatToSeconds(START_BEAT, chart.bpm);
const songStart = Math.max(0, duration - cues.songStartFromEnd);
const cutAt = songStart + audioFrom;

let peak = 0;
for (const sample of track) peak = Math.max(peak, Math.abs(sample));
const gain = peak > 0 ? 0.82 / peak : 1;

const pcm = Buffer.alloc(track.length * 2);
for (let i = 0; i < track.length; i += 1) {
  pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(track[i] * gain * 32767))), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

const wav = join(tmpdir(), 'day-012-demo.wav');
writeFileSync(wav, Buffer.concat([header, pcm]));

console.log(`録画 ${duration.toFixed(2)}秒 / 曲の頭 ${songStart.toFixed(2)}秒 / 切り出し ${cutAt.toFixed(2)}秒から`);

// 途中から切るので映像は作り直す（コピーだと切れ目が固まる）
execFileSync('ffmpeg', [
  '-y',
  '-ss', cutAt.toFixed(3), '-i', video,
  '-ss', audioFrom.toFixed(3), '-i', wav,
  '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-r', '25',
  '-c:a', 'aac', '-b:a', '128k',
  '-shortest', '-movflags', '+faststart',
  out
], { stdio: ['ignore', 'ignore', 'pipe'] });

const made = Number(execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out
], { encoding: 'utf8' }).trim());
console.log(`作成: ${out}（${made.toFixed(2)}秒・1コマ目はプレイ中）`);
