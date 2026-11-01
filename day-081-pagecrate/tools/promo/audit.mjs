// 書き出した2本（A案・B案の音）を ffmpeg で検査し、output/audit-report.json・first-frame.png・contact-sheet.jpg を書く。
// 1つでも外れたら止める（数値は報告にそのまま残す）。
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {DURATION_SECONDS, FPS, HEIGHT, SECTION, TOTAL_FRAMES, WIDTH} from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'output');
const LIMITS = {lufs: [-18, -16], truePeak: -1.5, low: [-9, -6], high: [-43, -38], hookGap: 6, clipped: 0};
const FILES = {a: 'Day081_pagecrate_promo.mp4', b: 'Day081_pagecrate_promo_b.mp4'};
const STRUCTURE = new Set(['major_brand', 'minor_version', 'compatible_brands', 'encoder', 'language', 'handler_name', 'vendor_id']);
const run = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const number = (text, pattern) => { const match = text.match(pattern); assert.ok(match, `ffmpeg の出力を読めない: ${pattern}`); return Number(match[1]); };
const rms = (file, filter) => Number(number(run(['-i', file, '-vn', '-af', `${filter ? `${filter},` : ''}astats=measure_perchannel=none:measure_overall=RMS_level`, '-f', 'null', '-']).stderr, /RMS level dB:\s*(-?[\d.]+)/).toFixed(2));

function audioNumbers(file) {
  const level = run(['-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr.split('Summary:').at(-1);
  const total = rms(file);
  const decoded = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '2', '-ar', '48000', '-f', 'f32le', 'pipe:1'], {maxBuffer: 64 * 1024 * 1024});
  const samples = new Float32Array(decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength));
  let clipped = 0; let head = 0; const headCount = Math.round(0.1 * 48000) * 2;
  for (let i = 0; i < samples.length; i += 1) { if (Math.abs(samples[i]) >= 0.999) clipped += 1; if (i < headCount) head += samples[i] * samples[i]; }
  const hook = rms(file, `atrim=0:${SECTION.list}`);
  const main = rms(file, `atrim=${SECTION.list}:${SECTION.outro}`);
  return {
    integratedLufs: number(level, /I:\s*(-?[\d.]+) LUFS/), truePeakDbtp: number(level, /Peak:\s*(-?[\d.]+) dBFS/), lra: number(level, /LRA:\s*(-?[\d.]+) LU/),
    totalRmsDb: total, lowVsTotalDb: Number((rms(file, 'lowpass=f=120') - total).toFixed(2)), highRmsDb: rms(file, 'highpass=f=8000'),
    hookRmsDb: hook, mainRmsDb: main, hookGapDb: Number((main - hook).toFixed(2)), clippedSamples: clipped, openingRmsDb: Number((10 * Math.log10(head / headCount)).toFixed(2)),
  };
}
function checkAudio(name, a) {
  assert.ok(a.integratedLufs >= LIMITS.lufs[0] && a.integratedLufs <= LIMITS.lufs[1], `${name}: 統合 ${a.integratedLufs} LUFS`);
  assert.ok(a.truePeakDbtp <= LIMITS.truePeak, `${name}: 真のピーク ${a.truePeakDbtp} dBTP`);
  assert.ok(a.lowVsTotalDb >= LIMITS.low[0] && a.lowVsTotalDb <= LIMITS.low[1], `${name}: 低域 ${a.lowVsTotalDb} dB`);
  assert.ok(a.highRmsDb >= LIMITS.high[0] && a.highRmsDb <= LIMITS.high[1], `${name}: 高域 ${a.highRmsDb} dBFS`);
  assert.ok(Math.abs(a.hookGapDb) <= LIMITS.hookGap, `${name}: フックと本編の差 ${a.hookGapDb} dB`);
  assert.equal(a.clippedSamples, LIMITS.clipped, `${name}: クリップ`);
  assert.ok(a.openingRmsDb > -46, `${name}: 冒頭0.1秒が無音に近い（${a.openingRmsDb} dBFS）`);
}

const report = {status: 'passed', checkedAt: new Date().toISOString().slice(0, 10), limits: LIMITS, videos: {}, wav: {}};
for (const [variant, name] of Object.entries(FILES)) {
  const file = join(out, name);
  assert.ok(existsSync(file), `先に npm run render を実行してください: ${name}`);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], {encoding: 'utf8'}));
  const v = probe.streams.find((s) => s.codec_type === 'video'); const a = probe.streams.find((s) => s.codec_type === 'audio');
  assert.equal(probe.streams.length, 2, `${name}: 映像と音の2本だけ`);
  assert.deepEqual([v.codec_name, v.width, v.height, v.pix_fmt, v.r_frame_rate, Number(v.nb_read_frames)], ['h264', WIDTH, HEIGHT, 'yuv420p', `${FPS}/1`, TOTAL_FRAMES], `${name}: 映像の形式`);
  assert.deepEqual([a.codec_name, a.sample_rate, a.channels], ['aac', '48000', 2], `${name}: 音の形式`);
  const duration = Number(probe.format.duration);
  assert.ok(Math.abs(duration - DURATION_SECONDS) < 0.1, `${name}: 長さ ${duration}`);
  const tags = [probe.format, ...probe.streams].flatMap((entry) => Object.keys(entry.tags ?? {}));
  assert.deepEqual(tags.filter((key) => !STRUCTURE.has(key)), [], `${name}: 付帯情報（題名・作者・場所など）が残っている`);
  const black = run(['-i', file, '-vf', 'blackdetect=d=0.05:pix_th=0.08', '-an', '-f', 'null', '-']);
  assert.equal(black.status, 0); assert.ok(!/black_start:/.test(black.stderr), `${name}: 黒いコマがある`);
  const audio = audioNumbers(file);
  checkAudio(name, audio);
  report.videos[variant] = {file: name, bytes: Number(probe.format.size), duration, video: {codec: v.codec_name, width: v.width, height: v.height, pixFmt: v.pix_fmt, fps: v.r_frame_rate, frames: Number(v.nb_read_frames)}, audio: {codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels, ...audio}, tags: [...new Set(tags)], blackFrames: false};
}

// 1コマ目から動いていること：0コマ目と8コマ目を縮小した灰色で比べる
const pair = execFileSync('ffmpeg', ['-v', 'error', '-i', join(out, FILES.a), '-vf', "select='eq(n\\,0)+eq(n\\,8)',scale=270:480:flags=area,format=gray", '-fps_mode', 'passthrough', '-frames:v', '2', '-f', 'rawvideo', 'pipe:1'], {maxBuffer: 8 * 1024 * 1024});
const size = 270 * 480; let changed = 0; let sum = 0;
for (let i = 0; i < size; i += 1) { const d = Math.abs(pair[i] - pair[size + i]); sum += d; if (d > 12) changed += 1; }
report.motion = {frames: [0, 8], meanAbsDiff: Number((sum / size).toFixed(2)), changedRatio: Number((changed / size).toFixed(4))};
assert.ok(report.motion.changedRatio > 0.02, `0コマ目と8コマ目がほぼ同じ（${report.motion.changedRatio}）`);

// BGM の WAV も同じ物差しで（AAC にする前の値）。スペクトログラムは目で見る用
for (const variant of ['a', 'b']) {
  const wav = join(out, `score-${variant}.wav`);
  report.wav[variant] = {...audioNumbers(wav), synth: JSON.parse(readFileSync(join(out, `audio-report-${variant}.json`), 'utf8'))};
  checkAudio(`score-${variant}.wav`, report.wav[variant]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-lavfi', 'showspectrumpic=s=1440x512:mode=combined:scale=log:fscale=log:legend=1:color=intensity', join(out, `spectrum-${variant}.png`)]);
}
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(out, FILES.a), '-frames:v', '1', join(out, 'first-frame.png')]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(out, FILES.a), '-vf', 'fps=1/4,scale=360:640,tile=3x3', '-frames:v', '1', join(out, 'contact-sheet.jpg')]);
const captured = JSON.parse(readFileSync(join(out, 'capture-events.json'), 'utf8'));
report.capture = {source: captured.source, frames: captured.frames, events: captured.events.length, done: captured.events.find((e) => e.type === 'done')?.seconds, checks: captured.checks};
writeFileSync(join(out, 'audit-report.json'), `${JSON.stringify(report, null, 2)}\n`);
const line = (r) => `統合 ${r.integratedLufs} LUFS / 真のピーク ${r.truePeakDbtp} dBTP / 低域 ${r.lowVsTotalDb} dB / 高域 ${r.highRmsDb} dBFS / フック差 ${r.hookGapDb} dB / クリップ ${r.clippedSamples}`;
for (const variant of ['a', 'b']) console.log(`${FILES[variant]}: ${(report.videos[variant].bytes / 1e6).toFixed(1)}MB / ${line(report.videos[variant].audio)}`);
console.log(`動き（0→8コマ）: 変化した画素 ${(report.motion.changedRatio * 100).toFixed(1)}% / 検査はすべて合格`);
