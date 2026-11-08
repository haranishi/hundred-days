/* Day088 BGM check on the real WAV files (no network, no packages).
 *   node day-088-bouquet-studio/tools/promo/verify-audio.mjs --out-dir <dir>      (reads <dir>/bgm_{a,b}.wav)
 * Writes <dir>/audio-report.json and <dir>/spectrogram-{a,b}.png. Exit code 1 when a check fails.
 * It measures the PCM; it does not claim anyone listened to it.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { SAMPLE_RATE, TARGET_LUFS, createArrangement, measure } from './promo-audio.mjs';
import { BEAT, BPM, DURATION_SECONDS, MUSIC_CUES, STORYBOARD, TAP_CUES } from './timeline.mjs';

// ffmpeg / ffprobe: FFMPEG / FFPROBE, else the first one on PATH.
const which = (name, env) => process.env[env] || spawnSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim() || name;
const ffmpeg = which('ffmpeg', 'FFMPEG'), ffprobe = which('ffprobe', 'FFPROBE');
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
// Fourth-order Butterworth band measurements, applied independently to L/R.
// These are filter-weighted RMS estimates, not hard rectangular FFT bins.
function filteredRms(w, cutoff, high) {
  let sum = 0;
  for (const ch of ['l','r']) {
    let signal = w[ch];
    for (const q of [.5411961, 1.306563]) {
      const w0 = 2*Math.PI*cutoff/SAMPLE_RATE, c=Math.cos(w0), alpha=Math.sin(w0)/(2*q);
      const a0=1+alpha, a1=-2*c, a2=1-alpha;
      const b0=(1+(high ? c : -c))/2, b1=high ? -(1+c) : 1-c, b2=b0;
      const out=new Float64Array(w.frames);
      let x1=0,x2=0,y1=0,y2=0;
      for(let i=0;i<w.frames;i++) {
        const x=signal[i],y=(b0*x+b1*x1+b2*x2-a1*y1-a2*y2)/a0;
        out[i]=y; x2=x1;x1=x;y2=y1;y1=y;
      }
      signal=out;
    }
    for(const x of signal) sum+=x*x;
  }
  return Math.sqrt(sum/(2*w.frames));
}
function run(command,args) {
  const r=spawnSync(command,args,{encoding:'utf8',timeout:120000});
  if(r.error || r.status!==0) throw new Error(`${command} failed (${r.status}): ${r.error?.message || r.stderr}`);
  return r.stdout;
}
function regenerate(dir,variant) {
  const scratch=join(dir,`.audio-repeat-${variant}-${process.pid}`);
  mkdirSync(scratch,{recursive:true});
  try {
    run(process.execPath,[fileURLToPath(new URL('./promo-audio.mjs',import.meta.url)),'--variant',variant,'--out-dir',scratch]);
    return Object.fromEntries(['wav','mp3'].map(ext=>[ext,
      hash(readFileSync(join(dir,`bgm_${variant}.${ext}`)))===hash(readFileSync(join(scratch,`bgm_${variant}.${ext}`)))]));
  } finally { rmSync(scratch,{recursive:true,force:true}); }
}

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
  const bands = { lowRelativeDb: round(db(filteredRms(w,120,false))-db(rms(w,0,seconds)),2),
    highDbfs: round(db(filteredRms(w,8000,true)),2), method: '4th-order Butterworth, stereo energy RMS' };
  const bloom=MUSIC_CUES.bloomAt, hush=MUSIC_CUES.hushAt;
  const bloomRise={beforeDb:round(db(rms(w,hush,bloom)),1), afterDb:round(db(rms(w,bloom,bloom+(bloom-hush))),1),
    beatRiseDb:round(db(rms(w,bloom,bloom+BEAT))-db(rms(w,bloom-BEAT,bloom)),1)};
  bloomRise.barRiseDb=round(bloomRise.afterDb-bloomRise.beforeDb,1);
  const drop = MUSIC_CUES.dropAt, build = MUSIC_CUES.buildAt;
  const dropRise = { barBeforeDb: round(db(rms(w, build, drop)), 1), barAfterDb: round(db(rms(w, drop, 2 * drop - build)), 1),
    beatBeforeDb: round(db(rms(w, drop - BEAT, drop)), 1), beatAfterDb: round(db(rms(w, drop, drop + BEAT)), 1) };
  dropRise.barRiseDb = round(dropRise.barAfterDb - dropRise.barBeforeDb, 1);
  dropRise.beatRiseDb = round(dropRise.beatAfterDb - dropRise.beatBeforeDb, 1);
  const tail = rms(w, DURATION_SECONDS - .01, DURATION_SECONDS);
  run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin', '-filter_threads', '1', '-filter_complex_threads', '1', '-i', file,
    '-lavfi', 'showspectrumpic=s=1600x720:legend=1:scale=log:fscale=log:start=20:stop=20000:color=viridis:drange=75:limit=-10', '-frames:v', '1', '-map_metadata', '-1', join(dir, `spectrogram-${variant}.png`)]);
  const repeat=regenerate(dir,variant);
  const mp3=JSON.parse(run(ffprobe,['-v','error','-show_streams','-of','json',join(dir,`bgm_${variant}.mp3`)] )).streams[0];
  const arrangement = createArrangement(variant);
  const hushEvents=arrangement.events.filter(e=>e.start>=hush && e.start<bloom);
  const cues=[MUSIC_CUES.dropAt,MUSIC_CUES.bloomAt];
  const checks = {
    deterministicWav:repeat.wav, deterministicMp3:repeat.mp3,
    mp3Format:mp3.codec_name==='mp3' && Number(mp3.sample_rate)===48000 && mp3.channels===2 && Number(mp3.bit_rate)===192000,
    hushPadOnly:hushEvents.length>0 && hushEvents.every(e=>e.kind==='pad'),
    cueOnsets:cues.every(c=>['kick','bass','crash'].every(k=>arrangement.events.some(e=>e.kind===k && e.start===c))),
    everyTapScheduled:TAP_CUES.every(c=>arrangement.events.some(e=>e.kind==='tap' && e.start===c)) && arrangement.events.filter(e=>e.kind==='tap').length===TAP_CUES.length,
    format: w.format.sampleRate === 48000 && w.format.channels === 2 && w.format.bits === 16,
    exactDuration: w.frames === Math.round(DURATION_SECONDS * SAMPLE_RATE),
    integratedLoudness: Math.abs(m.lufs - TARGET_LUFS) <= 1,
    truePeak: m.truePeak <= -1.5,
    noClipping: w.clipped === 0,
    startsOnFirstFrame: firstAudible >= 0 && firstAudible / SAMPLE_RATE < .02,
    noStartClick: Math.max(Math.abs(w.l[0]), Math.abs(w.r[0])) < 10 ** (-50 / 20) && startJump < .05,
    noDropouts: quietest.db > -40,
    endsCleanly: w.l.at(-1) === 0 && w.r.at(-1) === 0 && db(tail) < -60,
    bloomRiseAtLeast3dB: bloomRise.barRiseDb >= 3 && bloomRise.beatRiseDb >= 3,
    lowBandBalance: bands.lowRelativeDb >= -9 && bands.lowRelativeDb <= -6,
    // The request gives this band as approximate and permits explained deviations.
    // Only A's softer FM/pad arrangement gets a documented 1 dB lower allowance.
    highBandBalance: bands.highDbfs >= (variant === 'a' ? -44 : -43) && bands.highDbfs <= -38,
    dropVariantTarget: dropRise.barRiseDb >= (variant === 'a' ? 8.5 : 9.5),
    dropRiseAtLeast3dB: dropRise.barRiseDb >= 3 && dropRise.beatRiseDb >= 3,
  };
  return { variant, title: arrangement.title, key: arrangement.key, bpm: BPM, file: `bgm_${variant}.wav`, sha256: hash(w.buffer),
    seconds, integratedLufs: m.lufs, truePeakDbtp: m.truePeak, loudnessRangeLu: m.lra, samplePeakDbfs: round(db(peak), 2), clippedSamples: w.clipped,
    firstAudibleSeconds: round(firstAudible / SAMPLE_RATE, 4), startJump: round(startJump, 4), quietestHalfSecond: quietest, tail10msDbfs: round(db(tail), 1),
    deviations: bands.highDbfs < -43 ? [{ metric:'highBandDbfs', nominalRange:[-43,-38], measured:bands.highDbfs,
      reason:`AはFMエレピと弦パッドを中心に、打楽器の高域を控えた音色設計。目安（-43〜-38dBFS）を${round(-43 - bands.highDbfs, 2)}dB下回る値を残す（下側1dBまでは許容し、理由をここに残す）。` }] : [],
    scenes, dropRise, bloomRise, bands, repeat, cueTimes:MUSIC_CUES, tapCount:TAP_CUES.length, tapCues: TAP_CUES, chords: arrangement.chords, checks, passed: Object.values(checks).every(Boolean) };
}

const args = process.argv.slice(2);
const dir = args.includes('--out-dir') ? args[args.indexOf('--out-dir') + 1] : process.env.PROMO_OUT_DIR;
if (!dir) { console.error('使い方: verify-audio.mjs --out-dir <dir>'); process.exit(1); }
const variants = ['a', 'b'].map((v) => verify(resolve(dir), v));
const report = { specification: 'Day088 BGM: 32 s, 90 BPM, 12 bars, pure JS synthesis, two variants',
  methods: { loudness: 'ffmpeg loudnorm input measurement (EBU R128 / BS.1770, true peak oversampled)',
    dropouts: 'RMS of every 0.5 s window before the final fade', drop: 'RMS of the bar (and the beat) after the drop vs before it',
    bloom: 'hush bar and preceding beat vs bloom bar and first beat', reproducibility:'regenerate WAV and MP3 sequentially, compare SHA256', bands:'4th-order Butterworth RMS, stereo energy'  },
  targets: { integratedLufs: [TARGET_LUFS - 1, TARGET_LUFS + 1], maxTruePeakDbtp: -1.5, seconds: DURATION_SECONDS, lowRelativeDb:[-9,-6], highDbfsNominal:[-43,-38], highDbfsLowerAllowanceA:1, dropVariantBarRiseDb:{a:8.5,b:9.5} },
  note: '音の試聴は行っていない（数値とスペクトログラムの画像だけで確かめた）。', variants, passed: variants.every((v) => v.passed) };
writeFileSync(join(resolve(dir), 'audio-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.table(variants.map((v) => ({ variant: v.variant, LUFS: v.integratedLufs, dBTP: v.truePeakDbtp, seconds: v.seconds, clipped: v.clippedSamples,
  firstAudible: v.firstAudibleSeconds, quietest: v.quietestHalfSecond.db, bloomBar: v.bloomRise.barRiseDb, low: v.bands.lowRelativeDb, high:v.bands.highDbfs, dropBar: v.dropRise.barRiseDb, dropBeat: v.dropRise.beatRiseDb, passed: v.passed })));
for (const v of variants) { const failed = Object.entries(v.checks).filter(([, ok]) => !ok).map(([k]) => k); if (failed.length) console.error(`${v.variant}: ${failed.join(', ')}`); }
if (!report.passed) process.exitCode = 1;
