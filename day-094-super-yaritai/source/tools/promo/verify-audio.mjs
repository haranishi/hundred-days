/* スーパーやりたい放題 BGM 数値検証 + スペクトログラム書き出し
 *   node tools/promo/verify-audio.mjs --out-dir <dir>
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_RATE, TARGET_LUFS, createArrangement, measure } from './promo-audio.mjs';
import { BAR, BEAT, BPM, CARD_TIMES, DURATION_SECONDS, FPS, MUSIC_CUES, STORYBOARD, TAP_CUES } from './timeline.mjs';

const which = (name, env) => process.env[env] || spawnSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim() || name;
const ffmpeg = which('ffmpeg', 'FFMPEG');
const ffprobe = which('ffprobe', 'FFPROBE');
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
  let sum = 0;
  for (let i = a; i < b; i++) sum += (w.l[i] ** 2 + w.r[i] ** 2) / 2;
  return Math.sqrt(sum / Math.max(1, b - a));
};

function filteredRms(w, cutoff, high) {
  let sum = 0;
  for (const ch of ['l', 'r']) {
    let sig = w[ch];
    for (const q of [.5411961, 1.306563]) {
      const w0 = 2 * Math.PI * cutoff / SAMPLE_RATE, c = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
      const a0 = 1 + alpha, a1 = -2 * c, a2 = 1 - alpha;
      const b0 = (1 + (high ? c : -c)) / 2, b1 = high ? -(1 + c) : 1 - c, b2 = b0;
      const out = new Float64Array(w.frames);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < w.frames; i++) {
        const x = sig[i], y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
      }
      sig = out;
    }
    for (const x of sig) sum += x * x;
  }
  return Math.sqrt(sum / (2 * w.frames));
}

function run(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 120000 });
  if (r.error || r.status !== 0) throw new Error(`${command} failed (${r.status}): ${r.error?.message || r.stderr}`);
  return r.stdout;
}

function regenerate(dir, variant) {
  const scratch = join(dir, `.audio-repeat-${variant}-${process.pid}`);
  mkdirSync(scratch, { recursive: true });
  try {
    run(process.execPath, [fileURLToPath(new URL('./promo-audio.mjs', import.meta.url)), '--variant', variant, '--out-dir', scratch]);
    return Object.fromEntries(['wav', 'mp3'].map((ext) => [ext, hash(readFileSync(join(dir, `bgm_${variant}.${ext}`))) === hash(readFileSync(join(scratch, `bgm_${variant}.${ext}`)))]));
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

function onset(w, cue) {
  const win = Math.round(SAMPLE_RATE * .01);
  const level = (i0) => { let s = 0; for (let i = i0; i < i0 + win; i++) s += (w.l[i] ** 2 + w.r[i] ** 2) / 2; return Math.sqrt(s / win) + 1e-9; };
  let best = { rise: -Infinity, at: null };
  for (let t = cue - .25; t <= cue + .25; t += .005) {
    const i = Math.round(t * SAMPLE_RATE);
    if (i - win < 0 || i + win >= w.frames) continue;
    const rise = db(level(i)) - db(level(i - win));
    if (rise > best.rise) best = { rise, at: t };
  }
  return { cue, measured: round(best.at), riseDb: round(best.rise, 1), offsetFrames: round((best.at - cue) * FPS, 2) };
}

function verify(dir, variant) {
  const file = join(dir, `bgm_${variant}.wav`), w = readWav(file), m = measure(file);
  const seconds = w.frames / w.format.sampleRate;
  let firstAudible = -1, peak = 0;
  for (let i = 0; i < w.frames; i++) {
    const v = Math.max(Math.abs(w.l[i]), Math.abs(w.r[i])); peak = Math.max(peak, v);
    if (firstAudible < 0 && v > 10 ** (-60 / 20)) firstAudible = i;
  }
  let startJump = 0;
  for (let i = 1; i < Math.round(.002 * SAMPLE_RATE); i++) startJump = Math.max(startJump, Math.abs(w.l[i] - w.l[i - 1]), Math.abs(w.r[i] - w.r[i - 1]));

  // 意図的捕獲無音区間 (20.80 - 21.15s) 以外で 0.5s 無音抜けがないか確認
  const windows = [];
  for (let t = 0; t + .5 <= DURATION_SECONDS - MUSIC_CUES.fadeSeconds; t += .5) {
    if (t < MUSIC_CUES.caughtResumeAt && t + .5 > MUSIC_CUES.caughtAt) continue;
    windows.push({ t, db: round(db(rms(w, t, t + .5)), 1) });
  }
  const quietest = windows.reduce((a, b) => (b.db < a.db ? b : a));
  const drop = MUSIC_CUES.dropAt, impact = MUSIC_CUES.impactAt, end = MUSIC_CUES.endChordAt;
  const dropRise = { barBeforeDb: round(db(rms(w, drop - BAR, drop)), 1), barAfterDb: round(db(rms(w, drop, drop + BAR)), 1), beatBeforeDb: round(db(rms(w, drop - BEAT, drop)), 1), beatAfterDb: round(db(rms(w, drop, drop + BEAT)), 1) };
  dropRise.barRiseDb = round(dropRise.barAfterDb - dropRise.barBeforeDb, 1);
  dropRise.beatRiseDb = round(dropRise.beatAfterDb - dropRise.beatBeforeDb, 1);
  const strikeRise = { beatBeforeDb: round(db(rms(w, impact - BEAT, impact)), 1), beatAfterDb: round(db(rms(w, impact, impact + BEAT)), 1) };
  strikeRise.beatRiseDb = round(strikeRise.beatAfterDb - strikeRise.beatBeforeDb, 1);
  const caughtSilenceDb = round(db(rms(w, MUSIC_CUES.caughtAt + .02, MUSIC_CUES.caughtResumeAt - .02)), 1);

  const bands = { lowRelativeDb: round(db(filteredRms(w, 120, false)) - db(rms(w, 0, seconds)), 2), highDbfs: round(db(filteredRms(w, 8000, true)), 2) };
  const tail = rms(w, DURATION_SECONDS - .01, DURATION_SECONDS);
  run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin', '-filter_threads', '1', '-filter_complex_threads', '1', '-i', file,
    '-lavfi', 'showspectrumpic=s=1600x720:legend=1:scale=log:fscale=log:start=20:stop=20000:color=viridis:drange=75:limit=-10', '-frames:v', '1', '-map_metadata', '-1', join(dir, `spectrogram-${variant}.png`)]);
  const repeat = regenerate(dir, variant);
  const mp3 = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', join(dir, `bgm_${variant}.mp3`)])).streams[0];
  const arrangement = createArrangement(variant);
  const sync = { kick: onset(w, MUSIC_CUES.kickImpactAt), drop: onset(w, drop), strike: onset(w, impact), endChord: onset(w, end) };

  const checks = {
    deterministicWav: repeat.wav,
    deterministicMp3: repeat.mp3,
    mp3Format: mp3.codec_name === 'mp3' && Number(mp3.sample_rate) === 48000 && mp3.channels === 2 && Number(mp3.bit_rate) === 192000,
    format: w.format.sampleRate === 48000 && w.format.channels === 2 && w.format.bits === 16,
    exactDuration: w.frames === Math.round(DURATION_SECONDS * SAMPLE_RATE),
    integratedLoudness: Math.abs(m.lufs - TARGET_LUFS) <= 1,
    truePeak: m.truePeak <= -1.5,
    noClipping: w.clipped === 0,
    noStartClick: Math.max(Math.abs(w.l[0]), Math.abs(w.r[0])) < 10 ** (-50 / 20) && startJump < .05,
    noDropouts: quietest.db > -40,
    caughtSilencePresent: caughtSilenceDb < -65,
    endsCleanly: w.l.at(-1) === 0 && w.r.at(-1) === 0 && db(tail) < -60,
    dropRiseAtLeast3dB: dropRise.barRiseDb >= 3 && dropRise.beatRiseDb >= 3,
    dropWithinOneFrame: Math.abs(sync.drop.offsetFrames) <= 1,
    strikeWithinOneFrame: Math.abs(sync.strike.offsetFrames) <= 1,
    lowBandBalance: bands.lowRelativeDb >= -10 && bands.lowRelativeDb <= -5,
    highBandBalance: bands.highDbfs >= -45 && bands.highDbfs <= -34,
  };
  return {
    variant, title: arrangement.title, key: arrangement.key, bpm: BPM, seconds,
    integratedLufs: m.lufs, truePeakDbtp: m.truePeak, clippedSamples: w.clipped, quietestHalfSecond: quietest,
    caughtSilenceDb, dropRise, strikeRise, sync, bands, repeat, checks, passed: Object.values(checks).every(Boolean),
  };
}

const args = process.argv.slice(2);
const dir = args.includes('--out-dir') ? args[args.indexOf('--out-dir') + 1] : process.env.PROMO_OUT_DIR;
if (!dir) { console.error('使い方: verify-audio.mjs --out-dir <dir>'); process.exit(1); }
const variants = ['a', 'b'].map((v) => verify(resolve(dir), v));
const report = {
  specification: 'Super Yaritai Promo BGM: 30s, 120 BPM, pure JS synthesis (Variant A/B)',
  note: '数値とスペクトログラム画像のみで検査（耳での試聴は未実施）。',
  variants,
  passed: variants.every((v) => v.passed),
};
writeFileSync(join(resolve(dir), 'audio-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.table(variants.map((v) => ({
  variant: v.variant, LUFS: v.integratedLufs, dBTP: v.truePeakDbtp, clipped: v.clippedSamples,
  quiet: v.quietestHalfSecond.db, caughtDb: v.caughtSilenceDb, dropBar: v.dropRise.barRiseDb,
  dropOff: v.sync.drop.offsetFrames, strikeOff: v.sync.strike.offsetFrames, passed: v.passed,
})));
for (const v of variants) {
  const failed = Object.entries(v.checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (failed.length) console.error(`${v.variant} failed: ${failed.join(', ')}`);
}
if (!report.passed) process.exitCode = 1;
