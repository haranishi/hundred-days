// アプリと同じ指数スイープと包絡線をPCMへ合成する。import時はI/Oしない。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_RATE = 48000;
export const PEAK_CEILING = 10 ** (-1 / 20);
export const AUDIO_FROM = 0.3; // 弾が飛んでいる画から開始。映像と音を同じだけ切る。
export function noteFor(name, march = 0) {
  const notes = { fire: [720, 320, .08], hit: [390, 780, .12], hurt: [150, 45, .3], flinch: [260, 530, .09], wave: [440, 880, .4], march: [[130, 195, 165][march % 3], 110, .055] };
  if (!Object.hasOwn(notes, name)) throw new Error(`未知のイベント: ${name}`);
  const [from, to, duration] = notes[name];
  return { from, to, duration, type: name === 'hurt' ? 'sawtooth' : 'triangle', gain: name === 'march' ? .5 : 1 };
}
export function envelope(t, duration) {
  if (t < 0 || t >= duration) return 0;
  return t < .008 ? .0001 * ( .07 / .0001) ** (t / .008)
    : .07 * (.0001 / .07) ** ((t - .008) / (duration - .008));
}
export function normalize(samples, ceiling = PEAK_CEILING) {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const gain = peak ? ceiling / peak : 1;
  return Float64Array.from(samples, value => value * gain);
}
export function synthesizeEvents(events, { duration, sampleRate = SAMPLE_RATE, normalized = true } = {}) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(sampleRate) || sampleRate < 8000) throw new Error('duration / sampleRate が不正です');
  const samples = new Float64Array(Math.ceil(duration * sampleRate));
  let march = 0;
  for (const { t, name } of events) {
    if (!Number.isFinite(t) || t < 0) throw new Error('イベント時刻が不正です');
    const note = noteFor(name, march);
    if (name === 'march') march++;
    const first = Math.round(t * sampleRate);
    const k = Math.log(note.to / note.from) / note.duration;
    for (let j = 0; j < Math.ceil(note.duration * sampleRate) && first + j < samples.length; j++) {
      const time = j / sampleRate;
      // 指数変化する周波数を積分。各イベントの位相は0から。
      const phase = 2 * Math.PI * note.from * Math.expm1(k * time) / k;
      const wave = note.type === 'sawtooth' ? 2 * ((phase / (2 * Math.PI) + .5) % 1) - 1 : 2 / Math.PI * Math.asin(Math.sin(phase));
      samples[first + j] += wave * envelope(time, note.duration) * note.gain;
    }
  }
  return normalized ? normalize(samples) : samples;
}
export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) => wav.writeInt16LE(Math.trunc(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2));
  return wav;
}
export function alignment(videoDuration, secondsAtEnd) {
  if (!Number.isFinite(videoDuration) || !Number.isFinite(secondsAtEnd) || secondsAtEnd <= AUDIO_FROM || videoDuration + .1 < secondsAtEnd) throw new Error('動画とキューの長さが不整合です。録画からやり直してください');
  // record-demo は頭を切らない。Day 012 と同様、末尾から開始点を逆算する。
  return { videoFrom: Math.max(0, videoDuration - secondsAtEnd) + AUDIO_FROM, audioFrom: AUDIO_FROM, duration: secondsAtEnd - AUDIO_FROM };
}
export function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) { console.log('Dayフォルダで node tools/render-demo-audio.mjs（先に録画。ffmpeg / ffprobe 必須）'); return; }
  if (args.length) throw new Error('対応する引数は --help のみです');
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const cues = JSON.parse(readFileSync(join(tmpdir(), 'day-045-demo-cues.json'), 'utf8'));
  if (!Array.isArray(cues.events) || !cues.events.length || cues.events.some(e => e.t > cues.secondsAtEnd)) throw new Error('キューが空か不正です。先にデモを録画してください');
  const video = join(appDir, 'demo.mp4'), out = join(appDir, 'demo-with-audio.mp4');
  const length = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' }).trim());
  const sync = alignment(length, cues.secondsAtEnd);
  const wav = join(tmpdir(), 'day-045-demo.wav');
  writeFileSync(wav, encodeWav(synthesizeEvents(cues.events, { duration: cues.secondsAtEnd })));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(sync.videoFrom), '-i', video,
    '-ss', String(sync.audioFrom), '-i', wav, '-t', String(sync.duration), '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-r', '25',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-map_metadata', '-1', '-movflags', '+faststart', out], { stdio: 'inherit' });
  console.log(`作成: demo-with-audio.mp4 / 切り出し ${sync.videoFrom.toFixed(3)}秒 / 音 ${sync.audioFrom}秒から`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
