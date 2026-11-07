/* Day087 BGM check on the real WAV files (no network, no packages).
 *   node day-087-oricube/tools/promo/verify-audio.mjs --out-dir <dir>      (reads <dir>/bgm_{a,b}.wav)
 * Writes <dir>/audio-report.json and <dir>/spectrogram-{a,b}.png. Exit code 1 when a check fails.
 * It measures the PCM; it does not claim anyone listened to it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { SAMPLE_RATE, TARGET_LUFS, createArrangement, measure } from './promo-audio.mjs';
import { BEAT, BPM, DURATION_SECONDS, MUSIC_CUES, PAPER_CUES, STORYBOARD, TAP_CUES } from './timeline.mjs';

const ffmpeg = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const round = (x, d = 3) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
const hash = (data) => createHash('sha256').update(data).digest('hex');

function readWav(file) {
  const buffer = readFileSync(file);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('RIFF WAV ではありません');
  let format, pcm;
  for (let at = 12; at + 8 <= buffer.length;) {
    const tag = buffer.toString('ascii', at, at + 4), bytes = buffer.readUInt32LE(at + 4);
    if (tag === 'fmt ') format = { codec: buffer.readUInt16LE(at + 8), channels: buffer.readUInt16LE(at + 10), sampleRate: buffer.readUInt32LE(at + 12), bits: buffer.readUInt16LE(at + 22) };
    if (tag === 'data') pcm = buffer.subarray(at + 8, at + 8 + bytes);
    at += 8 + bytes + (bytes % 2);
  }
  if (!format || !pcm || format.codec !== 1 || format.channels !== 2 || format.bits !== 16) throw new Error('16bit stereo PCM が必要');
  const frames = pcm.length / 4, l = new Float64Array(frames), r = new Float64Array(frames);
  let clipped = 0;
  for (let i = 0; i < frames; i++) {
    const a = pcm.readInt16LE(i * 4), b = pcm.readInt16LE(i * 4 + 2);
    if (Math.abs(a) >= 32767 || Math.abs(b) >= 32767) clipped++;
    l[i] = a / 32768; r[i] = b / 32768;
  }
  return { buffer, format, frames, l, r, clipped };
}
const rms = (w, from, to) => {
  const a = Math.max(0, Math.round(from * SAMPLE_RATE)), b = Math.min(w.frames, Math.round(to * SAMPLE_RATE));
  let sum = 0; for (let i = a; i < b; i++) sum += (w.l[i] ** 2 + w.r[i] ** 2) / 2;
  return Math.sqrt(sum / Math.max(1, b - a));
};
// 2nd-order high-pass at 2.5 kHz (RBJ), mono sum: where the paper sound lives.
function highBand(w) {
  const f0 = 2500, q = .707, w0 = 2 * Math.PI * f0 / SAMPLE_RATE, alpha = Math.sin(w0) / (2 * q), cos = Math.cos(w0);
  const b0 = (1 + cos) / 2, b1 = -(1 + cos), b2 = (1 + cos) / 2, a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  const out = new Float64Array(w.frames); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < w.frames; i++) {
    const x = (w.l[i] + w.r[i]) / 2, y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}
const bandRms = (band, from, to) => {
  const a = Math.max(0, Math.round(from * SAMPLE_RATE)), b = Math.min(band.length, Math.round(to * SAMPLE_RATE));
  let s = 0; for (let i = a; i < b; i++) s += band[i] ** 2; return Math.sqrt(s / Math.max(1, b - a));
};

function verify(dir, variant) {
  const file = join(dir, `bgm_${variant}.wav`), w = readWav(file), m = measure(file);
  const seconds = w.frames / w.format.sampleRate;
  let firstAudible = -1, peak = 0;
  for (let i = 0; i < w.frames; i++) {
    const v = Math.max(Math.abs(w.l[i]), Math.abs(w.r[i])); peak = Math.max(peak, v);
    if (firstAudible < 0 && v > 10 ** (-60 / 20)) firstAudible = i;
  }
  // Click at the very start: the first sample must be quiet and the first 2 ms must not jump.
  let startJump = 0;
  for (let i = 1; i < Math.round(.002 * SAMPLE_RATE); i++) startJump = Math.max(startJump, Math.abs(w.l[i] - w.l[i - 1]), Math.abs(w.r[i] - w.r[i - 1]));
  // Unnatural silence: every 0.5 s window before the fade must carry sound.
  const windows = [];
  for (let t = 0; t + .5 <= DURATION_SECONDS - MUSIC_CUES.fadeSeconds; t += .5) windows.push({ t, db: round(db(rms(w, t, t + .5)), 1) });
  const quietest = windows.reduce((a, b) => (b.db < a.db ? b : a));
  // Per-scene loudness (RMS dBFS), for the report.
  const scenes = STORYBOARD.map((s) => ({ id: s.id, music: s.music, rmsDb: round(db(rms(w, s.start, s.end)), 1) }));
  // Paper cues: high-band energy just after each cue vs. just before.
  const band = highBand(w);
  const paper = PAPER_CUES.map((cue) => ({ cue, riseDb: round(db(bandRms(band, cue, cue + .06)) - db(bandRms(band, cue - .09, cue - .01)), 1),
    fullBandRiseDb: round(db(rms(w, cue, cue + .06)) - db(rms(w, cue - .09, cue - .01)), 1) }));
  const meanRise = paper.reduce((s, p) => s + p.riseDb, 0) / paper.length;
  // The drop: the bar where the paper starts to move must be clearly louder than the build bar before it.
  const drop = MUSIC_CUES.dropAt, build = MUSIC_CUES.buildAt;
  const dropRise = { barBeforeDb: round(db(rms(w, build, drop)), 1), barAfterDb: round(db(rms(w, drop, 2 * drop - build)), 1),
    beatBeforeDb: round(db(rms(w, drop - BEAT, drop)), 1), beatAfterDb: round(db(rms(w, drop, drop + BEAT)), 1) };
  dropRise.barRiseDb = round(dropRise.barAfterDb - dropRise.barBeforeDb, 1);
  dropRise.beatRiseDb = round(dropRise.beatAfterDb - dropRise.beatBeforeDb, 1);
  const tail = rms(w, DURATION_SECONDS - .01, DURATION_SECONDS);
  spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin', '-filter_threads', '1', '-filter_complex_threads', '1', '-i', file,
    '-lavfi', 'showspectrumpic=s=1600x720:legend=1:scale=log:fscale=log:start=20:stop=20000:color=viridis:drange=75:limit=-10', '-frames:v', '1', '-map_metadata', '-1', join(dir, `spectrogram-${variant}.png`)]);
  const checks = {
    format: w.format.sampleRate === 48000 && w.format.channels === 2 && w.format.bits === 16,
    exactDuration: w.frames === Math.round(DURATION_SECONDS * SAMPLE_RATE),
    integratedLoudness: Math.abs(m.lufs - TARGET_LUFS) <= 1,
    truePeak: m.truePeak <= -1.5,
    noClipping: w.clipped === 0,
    startsOnFirstFrame: firstAudible >= 0 && firstAudible / SAMPLE_RATE < .02,
    noStartClick: Math.max(Math.abs(w.l[0]), Math.abs(w.r[0])) < 10 ** (-50 / 20) && startJump < .05,
    noDropouts: quietest.db > -40,
    endsCleanly: w.l.at(-1) === 0 && w.r.at(-1) === 0 && db(tail) < -60,
    paperAudible: meanRise >= 2,
    dropRiseAtLeast3dB: dropRise.barRiseDb >= 3 && dropRise.beatRiseDb >= 3,
  };
  const arrangement = createArrangement(variant);
  return { variant, title: arrangement.title, key: arrangement.key, bpm: BPM, file: `bgm_${variant}.wav`, sha256: hash(w.buffer),
    seconds, integratedLufs: m.lufs, truePeakDbtp: m.truePeak, loudnessRangeLu: m.lra, samplePeakDbfs: round(db(peak), 2), clippedSamples: w.clipped,
    firstAudibleSeconds: round(firstAudible / SAMPLE_RATE, 4), startJump: round(startJump, 4), quietestHalfSecond: quietest, tail10msDbfs: round(db(tail), 1),
    scenes, dropRise, paperCues: paper, paperMeanRiseDb: round(meanRise, 1), tapCues: TAP_CUES, chords: arrangement.chords, checks, passed: Object.values(checks).every(Boolean) };
}

const args = process.argv.slice(2);
const dir = args.includes('--out-dir') ? args[args.indexOf('--out-dir') + 1] : process.env.PROMO_OUT_DIR;
if (!dir) { console.error('使い方: verify-audio.mjs --out-dir <dir>'); process.exit(1); }
const variants = ['a', 'b'].map((v) => verify(resolve(dir), v));
const report = { specification: 'Day087 BGM: 32 s, 90 BPM, 12 bars, pure JS synthesis, two variants',
  methods: { loudness: 'ffmpeg loudnorm input measurement (EBU R128 / BS.1770, true peak oversampled)',
    dropouts: 'RMS of every 0.5 s window before the final fade', drop: 'RMS of the bar (and the beat) after the drop vs before it',
    paper: 'high-pass 2.5 kHz RMS, 60 ms after each cue vs 80 ms before' },
  targets: { integratedLufs: [TARGET_LUFS - 1, TARGET_LUFS + 1], maxTruePeakDbtp: -1.5, seconds: DURATION_SECONDS },
  note: '音の試聴は行っていない（数値とスペクトログラムの画像だけで確かめた）。', variants, passed: variants.every((v) => v.passed) };
writeFileSync(join(resolve(dir), 'audio-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.table(variants.map((v) => ({ variant: v.variant, LUFS: v.integratedLufs, dBTP: v.truePeakDbtp, seconds: v.seconds, clipped: v.clippedSamples,
  firstAudible: v.firstAudibleSeconds, quietest: v.quietestHalfSecond.db, paperRise: v.paperMeanRiseDb, dropBar: v.dropRise.barRiseDb, dropBeat: v.dropRise.beatRiseDb, passed: v.passed })));
for (const v of variants) { const failed = Object.entries(v.checks).filter(([, ok]) => !ok).map(([k]) => k); if (failed.length) console.error(`${v.variant}: ${failed.join(', ')}`); }
if (!report.passed) process.exitCode = 1;
