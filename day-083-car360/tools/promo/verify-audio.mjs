/* Day083 BGMの実ファイル検証（ネットワーク・依存パッケージなし）。
 * node day-083-car360/tools/promo/verify-audio.mjs
 * PNGを自分で開いて構成を確認した後だけ、確認記録を付けて再実行:
 * node day-083-car360/tools/promo/verify-audio.mjs --spectrogram-reviewed
 * 出力: output/audio-report.json / spectrogram-{a,b}.png。失敗時は終了値1。
 * 合成イベントの記録とPCMの実測を区別する。音を聴いたという判定は行わない。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createArrangement, SAMPLE_RATE } from './promo-audio.mjs';
import { DURATION_SECONDS, BPM, STORYBOARD, MUSIC_CUES } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, 'output');
const ffmpeg = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const ffprobe = process.env.FFPROBE || '/opt/homebrew/bin/ffprobe';
const round = (x) => Number.isFinite(x) ? Number(x.toFixed(3)) : null;
const powerDb = (x) => 10 * Math.log10(Math.max(1e-15, x));
const inRange = (x, lo, hi) => x >= lo && x <= hi;
const hash = (data) => createHash('sha256').update(data).digest('hex');

function run(binary, args, binaryOutput = false) {
  const result = spawnSync(binary, args, { encoding: binaryOutput ? null : 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(String(result.stderr));
  return result;
}

function readWav(file) {
  const buffer = readFileSync(file);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('RIFF WAVではありません');
  }
  let format;
  let pcm;
  for (let at = 12; at + 8 <= buffer.length;) {
    const tag = buffer.toString('ascii', at, at + 4);
    const bytes = buffer.readUInt32LE(at + 4);
    if (at + 8 + bytes > buffer.length) throw new Error('不完全なWAVチャンク');
    if (tag === 'fmt ') {
      format = { codec: buffer.readUInt16LE(at + 8), channelCount: buffer.readUInt16LE(at + 10),
        sampleRate: buffer.readUInt32LE(at + 12), bits: buffer.readUInt16LE(at + 22) };
    }
    if (tag === 'data') pcm = buffer.subarray(at + 8, at + 8 + bytes);
    at += 8 + bytes + bytes % 2;
  }
  if (!format || !pcm || format.codec !== 1 || format.channelCount !== 2 || format.bits !== 16) {
    throw new Error('16bit stereo PCMが必要');
  }
  const frames = pcm.length / 4;
  if (!Number.isInteger(frames)) throw new Error('PCMの長さが不正');
  const channels = [new Float64Array(frames), new Float64Array(frames)];
  let clippedSamples = 0;
  let peak = 0;
  let squares = 0;
  let firstAudibleFrame = -1;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < 2; ch++) {
      const value = pcm.readInt16LE(i * 4 + ch * 2);
      if (value === -32768 || value === 32767) clippedSamples++;
      const sample = value / 32768;
      channels[ch][i] = sample;
      peak = Math.max(peak, Math.abs(sample));
      squares += sample * sample;
      if (Math.abs(sample) > 10 ** (-60 / 20) && firstAudibleFrame === -1) firstAudibleFrame = i;
    }
  }
  return { buffer, channels, frames, ...format, clippedSamples, samplePeakDbfs: 20 * Math.log10(peak),
    rmsDbfs: powerDb(squares / frames / 2), firstAudibleSeconds: firstAudibleFrame / format.sampleRate };
}

function loudness(file) {
  const r = run(ffmpeg, ['-hide_banner', '-nostdin', '-i', file, '-af',
    'loudnorm=I=-17:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
  const match = r.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) throw new Error('loudnormのJSONが見つかりません');
  const data = JSON.parse(match[0]);
  return { integratedLufs: Number(data.input_i), truePeakDbtp: Number(data.input_tp),
    loudnessRangeLu: Number(data.input_lra), gatedThresholdLufs: Number(data.input_thresh) };
}

// BS.1770の48kHz K-weighting。3秒の短期値と400msの瞬間値に同じ重みを使う。
function biquad(input, b, a) {
  const out = new Float64Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}
function weightedChannels(channels) {
  return channels.map((channel) => biquad(biquad(channel,
    [1.53512485958697, -2.69169618940638, 1.19839281085285],
    [1, -1.69065929318241, .73248077421585]),
  [1, -2, 1], [1, -1.99004745483398, .99007225036621]));
}
function windowPower(channels, start, end, sampleRate = SAMPLE_RATE) {
  const first = Math.max(0, Math.round(start * sampleRate));
  const last = Math.min(channels[0].length, Math.round(end * sampleRate));
  let sum = 0;
  for (const channel of channels) for (let i = first; i < last; i++) sum += channel[i] ** 2;
  return sum / Math.max(1, last - first);
}
const lufsWindow = (channels, start, end) => -.691 + powerDb(windowPower(channels, start, end));

// Hann窓・8192点FFT・50%重なり。左右のパワーを平均し、モノ合成による打ち消しを避ける。
function spectrum(channels) {
  const size = 8192;
  const hop = size / 2;
  const window = new Float64Array(size);
  const reverse = new Uint16Array(size);
  let windowSquares = 0;
  for (let i = 0; i < size; i++) {
    window[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (size - 1));
    windowSquares += window[i] ** 2;
    let x = i, rev = 0;
    for (let bit = 0; bit < 13; bit++) { rev = (rev << 1) | (x & 1); x >>>= 1; }
    reverse[i] = rev;
  }
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const bins = new Float64Array(size / 2 + 1);
  const frames = [];
  for (let at = 0; at + size <= channels[0].length; at += hop) {
    bins.fill(0);
    for (const channel of channels) {
      im.fill(0);
      for (let i = 0; i < size; i++) re[reverse[i]] = channel[at + i] * window[i];
      for (let width = 2; width <= size; width *= 2) {
        const angle = -2 * Math.PI / width;
        const wr = Math.cos(angle), wi = Math.sin(angle);
        for (let first = 0; first < size; first += width) {
          let ur = 1, ui = 0;
          for (let j = 0; j < width / 2; j++) {
            const left = first + j, right = left + width / 2;
            const tr = re[right] * ur - im[right] * ui;
            const ti = re[right] * ui + im[right] * ur;
            re[right] = re[left] - tr; im[right] = im[left] - ti;
            re[left] += tr; im[left] += ti;
            const next = ur * wr - ui * wi;
            ui = ur * wi + ui * wr; ur = next;
          }
        }
      }
      for (let i = 0; i < bins.length; i++) {
        bins[i] += (re[i] ** 2 + im[i] ** 2) * (i === 0 || i === size / 2 ? 1 : 2)
          / (size * windowSquares * channels.length);
      }
    }
    let total = 0, low = 0, high = 0, upperMid = 0, centroid = 0;
    for (let i = 0; i < bins.length; i++) {
      const frequency = i * SAMPLE_RATE / size;
      const energy = bins[i];
      total += energy; centroid += frequency * energy;
      if (frequency < 120) low += energy;
      if (frequency > 8000) high += energy;
      if (frequency >= 2000) upperMid += energy;
    }
    frames.push({ time: (at + size / 2) / SAMPLE_RATE, total, low, high, upperMid, centroid });
  }
  return frames;
}
function spectralWindow(frames, start, end) {
  const selected = frames.filter((frame) => frame.time >= start && frame.time < end);
  const mean = (key) => selected.reduce((sum, frame) => sum + frame[key], 0) / Math.max(1, selected.length);
  const total = mean('total');
  return { lowToTotalDb: round(powerDb(mean('low') / Math.max(1e-15, total))),
    highRmsDbfs: round(powerDb(mean('high'))), upperMidRmsDbfs: round(powerDb(mean('upperMid'))),
    centroidHz: round(mean('centroid') / Math.max(1e-15, total)) };
}

function verify(variant, available) {
  const name = `Day083_car360_bgm_${variant}`;
  const wavFile = resolve(output, `${name}.wav`);
  const mp3File = resolve(output, `${name}.mp3`);
  const pcm = readWav(wavFile);
  if (pcm.sampleRate !== SAMPLE_RATE) throw new Error('K-weighting・FFTは48kHz専用');
  const weighted = weightedChannels(pcm.channels);
  const spectralFrames = spectrum(pcm.channels);
  const arrangement = createArrangement(variant);
  const shortTerm = {};
  const sections = [STORYBOARD[0], STORYBOARD[1],
    { id: 'S4', start: MUSIC_CUES.dropAt, end: MUSIC_CUES.breakdown.start },
    ...STORYBOARD.filter((scene) => ['S5', 'S6'].includes(scene.id))];
  for (const scene of sections) {
    // 場面末尾での標準3秒窓。S6は2.133秒なので直前のS5を0.867秒含む。
    shortTerm[scene.id] = { sceneStart: scene.start, sceneEnd: scene.end,
      windowStart: round(scene.end - 3), windowEnd: scene.end,
      shortTermLufs: round(lufsWindow(weighted, scene.end - 3, scene.end)),
      spectrum: spectralWindow(spectralFrames, scene.start, scene.end) };
  }
  const pre = [MUSIC_CUES.dropAt - .4, MUSIC_CUES.dropAt];
  const post = [MUSIC_CUES.dropAt, MUSIC_CUES.dropAt + .4];
  const dropBefore = lufsWindow(weighted, ...pre);
  const dropAfter = lufsWindow(weighted, ...post);
  // デジタル無音を際限なく小さいLUFSへ換算せず、-70未満は上限として記録する。
  const dropFloor = -70;
  const dropRise = dropAfter - Math.max(dropFloor, dropBefore);
  const allSpectrum = spectralWindow(spectralFrames, 0, DURATION_SECONDS);
  const tailPower = windowPower(pcm.channels, DURATION_SECONDS - .01, DURATION_SECONDS) / 2;
  const finalSamples = pcm.channels.map((channel) => channel.at(-1));
  let measurement = { integratedLufs: null, truePeakDbtp: null };
  let mp3 = { verified: false };
  if (available) {
    measurement = loudness(wavFile);
    const probe = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp3File]).stdout);
    const stream = probe.streams.find((s) => s.codec_type === 'audio');
    const decoded = run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', mp3File,
      '-f', 's16le', '-acodec', 'pcm_s16le', '-'], true).stdout;
    let clippedSamples = 0;
    for (let at = 0; at < decoded.length; at += 2) {
      const value = decoded.readInt16LE(at);
      if (value === -32768 || value === 32767) clippedSamples++;
    }
    mp3 = { verified: true, ...loudness(mp3File), channels: stream.channels, sampleRate: Number(stream.sample_rate),
      bitRate: Number(stream.bit_rate), containerDurationSeconds: Number(probe.format.duration),
      decodedDurationSeconds: decoded.length / 2 / stream.channels / Number(stream.sample_rate),
      clippedSamples, sha256: hash(readFileSync(mp3File)),
      note: 'コンテナ時間はMP3の符号化遅延・末尾パディングを含む。再生時間はgapless復号後のPCMで測定。' };
    // ローカル版で並列描画時に凡例が欠けたため、画像のフィルター処理を1スレッドに固定。
    run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-filter_threads', '1', '-filter_complex_threads', '1', '-i', wavFile,
      '-lavfi', 'showspectrumpic=s=1600x720:legend=1:scale=log:fscale=log:start=20:stop=20000:color=viridis:drange=75:limit=-10',
      '-frames:v', '1', '-map_metadata', '-1', resolve(output, `spectrogram-${variant}.png`)]);
  }
  const contrast = Math.abs(shortTerm.S0.shortTermLufs - shortTerm.S4.shortTermLufs);
  const checks = {
    integratedLoudness: available && inRange(measurement.integratedLufs, -18.5, -15.5),
    truePeak: available && measurement.truePeakDbtp <= -1.5,
    noClipping: pcm.clippedSamples === 0,
    lowBandBalance: inRange(allSpectrum.lowToTotalDb, -9, -6),
    highBandBalance: inRange(allSpectrum.highRmsDbfs, -43, -38),
    hookDropWithin6Db: contrast <= 6,
    dropRisesAtLeast3Db: dropRise >= 3,
    exactDuration: Math.abs(pcm.frames / pcm.sampleRate - DURATION_SECONDS) <= .02,
    format: pcm.sampleRate === 48000 && pcm.channels.length === 2 && pcm.bits === 16,
    startsOnFirstBeat: pcm.firstAudibleSeconds < .02,
    finalSamplesZero: finalSamples.every((sample) => sample === 0),
    tailNearSilence: powerDb(tailPower) < -70,
    mp3Format: available && mp3.bitRate === 192000 && mp3.channels === 2 && mp3.sampleRate === 48000,
    mp3Duration: available && Math.abs(mp3.decodedDurationSeconds - DURATION_SECONDS) <= .02,
    mp3Loudness: available && inRange(mp3.integratedLufs, -18.5, -15.5),
    mp3Peak: available && mp3.truePeakDbtp <= -1.5 && mp3.clippedSamples === 0,
  };
  return { variant, title: arrangement.title, key: arrangement.key, wav: `${name}.wav`, mp3: `${name}.mp3`,
    wavSha256: hash(pcm.buffer), durationSeconds: pcm.frames / pcm.sampleRate, sampleRate: pcm.sampleRate,
    channels: pcm.channels.length, bitsPerSample: pcm.bits, ...measurement, samplePeakDbfs: round(pcm.samplePeakDbfs),
    rmsDbfs: round(pcm.rmsDbfs), clippedSamples: pcm.clippedSamples,
    firstAudibleSeconds: round(pcm.firstAudibleSeconds), finalSamples, tail10msRmsDbfs: round(powerDb(tailPower)),
    bands: allSpectrum, shortTerm, hookDropDifferenceDb: round(contrast),
    drop: { beforeWindow: pre.map(round), afterWindow: post.map(round),
      beforeMomentaryLufs: dropBefore < dropFloor ? null : round(dropBefore),
      beforeBelowLufs: dropBefore < dropFloor ? dropFloor : null,
      afterMomentaryLufs: round(dropAfter), riseDb: round(dropRise), riseIsLowerBound: dropBefore < dropFloor },
    riser: { early: spectralWindow(spectralFrames, MUSIC_CUES.riser.start, MUSIC_CUES.riser.start + .4),
      late: spectralWindow(spectralFrames, arrangement.breakStart - .4, arrangement.breakStart) },
    mp3Verification: mp3, checks, passed: Object.values(checks).every(Boolean),
    composition: { bpm: BPM, bars: 15, chords: arrangement.chords,
      cues: { dropAt: MUSIC_CUES.dropAt, riserStart: MUSIC_CUES.riser.start,
        silenceStartsAt: round(arrangement.breakStart), counterMelodyAt: arrangement.counterAt,
        breakdownAt: MUSIC_CUES.breakdown.start, endChordAt: MUSIC_CUES.endChordAt, fadeStart: arrangement.fadeStart },
      engine: { start: MUSIC_CUES.dropAt, end: MUSIC_CUES.breakdown.start,
        pitchHz: [60, 180], reachesTopAt: 24, shiftsAt: [17, 19.8, 22.4], gain: .036 },
      eventCount: arrangement.events.length,
      firstEventByKind: Object.fromEntries([...new Set(arrangement.events.map((e) => e.kind))]
        .map((kind) => [kind, round(arrangement.events.find((e) => e.kind === kind).start)])) } };
}

function main() {
  if (process.argv.slice(2).some((arg) => arg !== '--spectrogram-reviewed')) throw new Error('不明な引数');
  const available = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0
    && spawnSync(ffprobe, ['-version'], { stdio: 'ignore' }).status === 0;
  const variants = ['a', 'b'].map((variant) => verify(variant, available));
  const reviewed = available && process.argv.includes('--spectrogram-reviewed');
  const report = {
    specification: 'Day083 BGM: 32 seconds, pure JS synthesis, two variants; shared timeline is read-only.',
    methods: {
      loudness: 'ffmpeg loudnorm input measurement (EBU R128 / BS.1770, true peak oversampled at 192kHz).',
      shortTerm: '48kHz BS.1770 K-weighting, stereo power sum, ungated 3s window ending at each scene end. S6 includes 0.867s of S5.',
      drop: '400ms K-weighted momentary windows immediately before and after dropAt.',
      bands: '8192-point Hann STFT, 50% overlap, Parseval power normalization, mean of L/R powers. Low <120Hz relative to total; high >8kHz absolute dBFS.',
      timing: 'Composition events reference timeline.mjs; measured PCM, waveform onset and silence are checked separately.',
      fallback: available ? null : 'ffmpeg/ffprobe unavailable. JS RMS, peak, K-weighted windows and FFT remain measured; LUFS/true peak/MP3/PNG are unverified.',
    },
    timelineSha256: hash(readFileSync(resolve(here, 'timeline.mjs'))),
    targets: { integratedLufs: [-18.5, -15.5], maxTruePeakDbtp: -1.5, lowToTotalDb: [-9, -6],
      highRmsDbfs: [-43, -38], maxHookDropDifferenceDb: 6, minDropRiseDb: 3, durationSeconds: 32 },
    variants,
    spectrogramReview: { status: reviewed ? 'reviewed' : 'pending',
      files: ['spectrogram-a.png', 'spectrogram-b.png'],
      sha256: available ? ['a', 'b'].map((v) => hash(readFileSync(resolve(output, `spectrogram-${v}.png`)))) : [],
      checks: reviewed ? ['12.8秒からの上昇と14.4秒からの間', '14.933秒のドロップと20.267秒以降の副旋律',
        '25.6秒からの編成減、29.867秒の終止和音、最後0.8秒のフェード'] : [],
      note: '音声の試聴は未実施。--spectrogram-reviewed は画像を実際に開いてから指定する。' },
    measurementsPassed: variants.every((variant) => variant.passed),
    passed: variants.every((variant) => variant.passed) && reviewed,
  };
  writeFileSync(resolve(output, 'audio-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.table(variants.map((v) => ({ variant: v.variant, LUFS: v.integratedLufs, dBTP: v.truePeakDbtp,
    lowDb: v.bands.lowToTotalDb, highDbfs: v.bands.highRmsDbfs, hookDropDb: v.hookDropDifferenceDb,
    dropRiseDb: v.drop.riseDb, seconds: v.durationSeconds, passed: v.passed })));
  for (const variant of variants) {
    const failed = Object.entries(variant.checks).filter(([, ok]) => !ok).map(([key]) => key);
    if (failed.length) console.error(`${variant.variant}: ${failed.join(', ')}`);
  }
  if (!reviewed) console.log('スペクトログラムの画像確認は未記録です。');
  if (!report.passed) process.exitCode = 1;
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
