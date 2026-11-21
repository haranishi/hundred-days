// Measure the delivered WAV and gapless-decoded MP3. Standalone verification also
// rebuilds the accompaniment and other UI stems to locate each gesture in the WAV.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { BEAT, BARS, BPM, CUES, DURATION_SECONDS, FPS, STORYBOARD } from './timeline.mjs';
import { FADE, FRAMES, RATE, TARGET_LUFS, cliOptions, edgeGain, loadCues, loudness, media,
  normalizeCues, pcm16, pcmBuffer, renderMix } from './promo-audio.mjs';

const round = (n, digits = 3) => Number(n.toFixed(digits));
const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
const hash = (b) => createHash('sha256').update(b).digest('hex');
const important = ['build', 'delete', 'undo', 'end'];
const montage = STORYBOARD.find((s) => s.music === 'lift');

function* chunks(buffer, start, end) {
  for (let pos = start; pos < end;) {
    if (pos + 8 > end) throw new Error('WAV チャンクヘッダーの欠損');
    const tag = buffer.toString('ascii', pos, pos + 4), size = buffer.readUInt32LE(pos + 4);
    const next = pos + 8 + size;
    if (next + size % 2 > end) throw new Error('WAV チャンクの欠損');
    yield [tag, buffer.subarray(pos + 8, next)];
    pos = next + size % 2;
  }
}

function readWave(file) {
  const buffer = readFileSync(file);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE' ||
    buffer.readUInt32LE(4) + 8 !== buffer.length) throw new Error('不正な RIFF/WAVE');
  let format, pcm, recipe;
  for (const [tag, data] of chunks(buffer, 12, buffer.length)) {
    if (tag === 'fmt ') format = { codec: data.readUInt16LE(0), channels: data.readUInt16LE(2),
      sampleRate: data.readUInt32LE(4), blockAlign: data.readUInt16LE(12), bits: data.readUInt16LE(14) };
    if (tag === 'data') pcm = data;
    if (tag === 'LIST' && data.toString('ascii', 0, 4) === 'INFO') {
      for (const [key, value] of chunks(data, 4, data.length)) {
        if (key === 'ICMT') recipe = JSON.parse(value.toString('utf8').replace(/\0+$/, ''));
      }
    }
  }
  if (format?.codec !== 1 || format.channels !== 2 || format.bits !== 16 || format.blockAlign !== 4 ||
    !pcm?.length || pcm.length % 4) throw new Error('16bit ステレオ PCM が必要です');
  if (!recipe || !Number.isFinite(recipe.gain) || recipe.gain <= 0) throw new Error('WAV に合成時のゲインがありません');
  return { buffer, format, pcm, recipe, frames: pcm.length / 4 };
}

function rmsDb(w, from, to) {
  const first = Math.max(0, Math.round(from * w.format.sampleRate));
  const last = Math.min(w.frames, Math.round(to * w.format.sampleRate));
  if (last <= first) return null;
  let sum = 0;
  for (let i = first; i < last; i++) sum += w.pcm.readInt16LE(i * 4) ** 2 + w.pcm.readInt16LE(i * 4 + 2) ** 2;
  return db(Math.sqrt(sum / (2 * (last - first))) / 32768);
}

function inspectEdges(w) {
  const sample = (i, ch) => w.pcm.readInt16LE(i * 4 + ch * 2);
  let peak = 0, clipped = 0, firstAudible = -1, startJump = 0;
  for (let i = 0; i < w.frames; i++) {
    const left = Math.abs(sample(i, 0)), right = Math.abs(sample(i, 1));
    peak = Math.max(peak, left, right);
    if (left >= 32767) clipped++;
    if (right >= 32767) clipped++;
    if (firstAudible < 0 && Math.max(left, right) > 32768 * .001) firstAudible = i;
    if (i > 0 && i < .002 * RATE) {
      startJump = Math.max(startJump, Math.abs(sample(i, 0) - sample(i - 1, 0)), Math.abs(sample(i, 1) - sample(i - 1, 1)));
    }
  }
  let quietest = { at: 0, dbfs: Infinity };
  for (let t = 0; t + .5 <= DURATION_SECONDS - FADE; t += .25) {
    const level = rmsDb(w, t, t + .5);
    if (level !== null && level < quietest.dbfs) quietest = { at: t, dbfs: round(level) };
  }
  return { samplePeakDbfs: round(db(peak / 32768)), clippedSamples: clipped,
    firstAudibleSeconds: firstAudible < 0 ? null : round(firstAudible / RATE, 6),
    firstPcm16: [sample(0, 0), sample(0, 1)], lastPcm16: [sample(w.frames - 1, 0), sample(w.frames - 1, 1)],
    startMaxStep: round(startJump / 32768, 6), quietestHalfSecond: quietest,
    tail10msDbfs: round(rmsDb(w, (w.frames - .01 * RATE) / RATE, w.frames / RATE)) };
}

// Subtract a sample-accurate mix with this single gesture muted, using the same
// memoryless master. This also isolates quiet keys over bass and chips over a whoosh.
// The search begins 25 ms early and reads the actual PCM instead of reporting the scheduled index.
function measureCue(w, arrangement, stem) {
  const { cue, first, samples } = stem;
  const start = Math.max(0, Math.round((cue.at - .025) * RATE));
  const stop = Math.min(w.frames, FRAMES, Math.round((cue.at + .045) * RATE));
  const residual = new Float64Array(Math.max(0, stop - start));
  let peak = 0;
  for (let frame = start; frame < stop; frame++) {
    const gain = w.recipe.gain * edgeGain(frame);
    for (let ch = 0; ch < 2; ch++) {
      const index = frame * 2 + ch, local = (frame - first) * 2 + ch;
      const background = arrangement.mix[index] - (samples[local] ?? 0);
      const difference = Math.abs(w.pcm.readInt16LE(index * 2) - pcm16(background, gain));
      residual[frame - start] = Math.max(residual[frame - start], difference);
      peak = Math.max(peak, difference);
    }
  }
  const threshold = Math.max(6, .015 * peak);
  const onset = residual.findIndex((value) => value >= threshold);
  const frame = onset < 0 ? null : start + onset;
  const drift = frame === null ? null : (frame / RATE - cue.at) * 1000;
  const before = rmsDb(w, cue.at - .1, cue.at), after = rmsDb(w, cue.at, cue.at + .1);
  const result = { ...cue, measuredFrame: frame, measuredAt: frame === null ? null : round(frame / RATE, 6),
    offsetMs: drift === null ? null : round(drift, 4), within5ms: drift !== null && Math.abs(drift) <= 5 + 1e-9,
    before100msDbfs: before === null ? null : round(before), after100msDbfs: after === null ? null : round(after),
    riseDb: before === null || after === null ? null : round(after - before) };
  if (cue.kind === 'cut') {
    result.beatAt = montage.start + cue.n * BEAT;
    result.beatErrorMs = frame === null ? null : round((frame / RATE - result.beatAt) * 1000, 4);
  }
  return result;
}

function inspectMp3(file, w) {
  const { stdout } = media('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries',
    'stream=codec_name,sample_rate,channels,bit_rate,duration', '-of', 'json', file]);
  const stream = JSON.parse(stdout).streams[0];
  const decoded = media('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0',
    '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1']).stdout;
  let power = 0, error = 0, clipped = 0;
  for (let i = 0; i < decoded.length / 4; i++) {
    const value = decoded.readFloatLE(i * 4);
    if (Math.abs(value) >= 1) clipped++;
    if (i < w.pcm.length / 2) {
      const original = w.pcm.readInt16LE(i * 2) / 32768;
      power += original ** 2; error += (original - value) ** 2;
    }
  }
  const decodedFrames = decoded.length / (4 * stream.channels);
  return { codec: stream.codec_name, sampleRate: Number(stream.sample_rate), channels: stream.channels,
    bitrate: Number(stream.bit_rate), containerSeconds: Number(stream.duration), decodedFrames,
    seconds: decodedFrames / Number(stream.sample_rate), ...loudness(file), clippedSamples: clipped,
    lastPcm16: [Math.round(decoded.readFloatLE(decoded.length - 8) * 32768), Math.round(decoded.readFloatLE(decoded.length - 4) * 32768)],
    signalToErrorDb: round(10 * Math.log10(power / Math.max(1e-16, error)), 2), sha256: hash(readFileSync(file)) };
}

function cueInventory(cues) {
  return cues.map((c) => {
    if (c.kind === 'whoosh') return c.kind + '/' + c.dir;
    return ['chip', 'cut', 'swap', 'move', 'key'].includes(c.kind) ? c.kind + '/' + c.n : c.kind;
  }).sort().join(',');
}

export function analyze(dir, variant, { arrangement, cues } = {}) {
  const file = 'bgm_' + variant + '.wav', path = join(dir, file), w = readWave(path);
  if (w.recipe.variant !== variant) throw new Error(file + ' の案と楽譜が一致しません');
  const planned = cues ?? (w.recipe.cueSource === 'override' ? normalizeCues(w.recipe.cues) : normalizeCues(CUES));
  arrangement ??= renderMix(variant, planned);
  const m = loudness(path), edges = inspectEdges(w), mp3 = inspectMp3(join(dir, 'bgm_' + variant + '.mp3'), w);
  const measured = arrangement.stems.map((s) => measureCue(w, arrangement, s));
  const cuts = measured.filter((c) => c.kind === 'cut');
  const accents = Object.fromEntries(important.map((kind) => [kind, measured.filter((c) => c.kind === kind).map((c) => c.riseDb)]));
  const checks = {
    format: w.format.sampleRate === RATE, exactDuration: w.frames === FRAMES,
    integratedLoudness: Math.abs(m.integratedLufs - TARGET_LUFS) <= 1, truePeak: m.truePeakDbtp <= -1.5,
    noClipping: edges.clippedSamples === 0, startsOnFirstFrame: edges.firstAudibleSeconds !== null && edges.firstAudibleSeconds < .020,
    noStartClick: edges.firstPcm16.every((v) => v === 0) && edges.startMaxStep < .05,
    noDropouts: edges.quietestHalfSecond.dbfs > -40,
    endsCleanly: edges.lastPcm16.every((v) => v === 0) && edges.tail10msDbfs < -60,
    matchesSynthesis: w.pcm.equals(pcmBuffer(arrangement.mix, w.recipe.gain)),
    storyboardCues: cueInventory(measured) === cueInventory(normalizeCues(CUES)),
    cueOnsetsWithin5ms: measured.every((c) => c.within5ms),
    accentsRise3dB: Object.values(accents).every((rises) => rises.length > 0 && rises.every((v) => v !== null && v >= 3)),
    eightCutsOnBeat: cuts.length === 8 && cuts.every((c, i) => c.n === i && c.beatErrorMs !== null && Math.abs(c.beatErrorMs) <= 5),
    mp3Format: mp3.codec === 'mp3' && mp3.sampleRate === RATE && mp3.channels === 2 && mp3.bitrate === 320000,
    mp3GaplessLength: mp3.decodedFrames === FRAMES, mp3MatchesWav: mp3.signalToErrorDb > 20,
    mp3Loudness: Math.abs(mp3.integratedLufs - TARGET_LUFS) <= 1, mp3TruePeak: mp3.truePeakDbtp <= -1.5,
    mp3NoClipping: mp3.clippedSamples === 0, mp3EndsCleanly: mp3.lastPcm16.every((v) => v === 0),
  };
  return { variant, title: arrangement.title, key: arrangement.key, file, sha256: hash(w.buffer),
    cueSource: cues ? 'verification override' : w.recipe.cueSource, frames: w.frames, seconds: w.frames / w.format.sampleRate,
    format: w.format, ...m, ...edges, mp3, chords: arrangement.chords,
    scenes: STORYBOARD.map((s) => ({ ...s, rmsDbfs: round(rmsDb(w, s.start, s.end)) })),
    accentRiseDb: accents, cues: measured, checks, passed: Object.values(checks).every(Boolean) };
}

function spectrogram(file, image) {
  media('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-filter_threads', '1', '-filter_complex_threads', '1', '-i', file,
    '-lavfi', 'showspectrumpic=s=1400x650:legend=1:scale=log:fscale=log:start=20:stop=20000:color=viridis:drange=75:limit=-8',
    '-frames:v', '1', '-update', '1', '-map_metadata', '-1', image]);
}

function reportFor(variants) {
  return { day: 96, seconds: DURATION_SECONDS, frames: FRAMES, fps: FPS, bpm: BPM, bars: BARS, fadeSeconds: FADE,
    targets: { integratedLufs: [-17, -15], maxTruePeakDbtp: -1.5, minAccentRiseDb: 3, maxCueOffsetMs: 5 },
    methods: {
      levels: 'FFmpeg loudnorm input measurements on WAV and MP3. MP3 duration is counted after gapless decode.',
      transients: 'Stereo full-band RMS in the 100 ms after and before each requested cue, in the finished WAV.',
      onsets: 'WAV minus remastered accompaniment and all other gestures. First residual above 6 PCM units or 1.5% of the local peak, whichever is greater. Search −25 to +45 ms.',
      cuts: 'Measured onset minus (lift scene start + cut index × beat duration), in milliseconds.',
      dropouts: 'Overlapping 0.5 s stereo RMS windows every 0.25 s through the start of the final fade.',
    }, note: '耳による試聴は未了。', variants, complete: variants.length === 2, passed: variants.every((v) => v.passed) };
}

// Stage each render beside the outputs. Serialize the short report merge so that
// two encoders finishing together retain both variants and all files are complete.
export async function withStaging(dir, prepare) {
  mkdirSync(dir, { recursive: true });
  const stage = mkdtempSync(join(dir, '.audio-work-')), lock = join(dir, '.audio-report.lock');
  let locked = false;
  try {
    const { variants, files } = prepare(stage);
    const deadline = Date.now() + 10000;
    while (!locked) {
      try { mkdirSync(lock); locked = true; }
      catch (error) {
        if (error.code !== 'EEXIST' || Date.now() >= deadline) throw error;
        await delay(25);
      }
    }
    const reportPath = join(dir, 'audio-report.json');
    const previous = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')).variants : [];
    const merged = previous.filter((old) => !variants.some((v) => v.variant === old.variant)).concat(variants);
    merged.sort((a, b) => a.variant.localeCompare(b.variant));
    for (const v of variants) {
      if (!files.includes(v.file) && (hash(readFileSync(join(dir, v.file))) !== v.sha256 ||
        hash(readFileSync(join(dir, 'bgm_' + v.variant + '.mp3'))) !== v.mp3.sha256)) {
        throw new Error('検査中に音源が変更されました。再検査してください。');
      }
    }
    writeFileSync(join(stage, 'audio-report.json'), JSON.stringify(reportFor(merged), null, 2) + '\n');
    for (const name of [...files, 'audio-report.json']) renameSync(join(stage, name), join(dir, name));
    for (const v of variants) {
      const failed = Object.keys(v.checks).filter((check) => !v.checks[check]);
      console.log(v.variant.toUpperCase() + ': ' + v.seconds.toFixed(3) + ' s, ' + v.integratedLufs + ' LUFS, ' +
        v.truePeakDbtp + ' dBTP; ' + (failed.length ? 'FAIL ' + failed.join(', ') : 'PASS'));
    }
    return variants;
  } finally {
    if (locked) rmdirSync(lock);
    rmSync(stage, { recursive: true, force: true });
  }
}

async function main() {
  const { dir, variant, cueFile } = cliOptions();
  const cues = cueFile === undefined ? undefined : loadCues(cueFile);
  const checked = await withStaging(dir, (stage) => {
    const files = [], variants = [];
    for (const v of variant ? [variant] : ['a', 'b']) {
      const result = analyze(dir, v, { cues });
      const image = 'spectrogram-' + v + '.png';
      spectrogram(join(dir, result.file), join(stage, image));
      files.push(image); variants.push(result);
    }
    return { variants, files };
  });
  if (checked.some((v) => !v.passed)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
