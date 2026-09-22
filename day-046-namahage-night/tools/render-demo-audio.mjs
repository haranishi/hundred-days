// demo.mp4 に、アプリと同じ合成音と静かなBGMを後から付けて demo-with-audio.mp4 を書き出す。
//
//   cd day-046-namahage-night && node tools/render-demo-audio.mjs
//
// 必要なもの: ffmpeg / ffprobe。映像は再エンコードしない（-c:v copy）ので demo.mp4 は触らない。
//
// 「いつ何が鳴ったか」は2通りで手に入る。
//   1. demo-scenario.mjs が録画中に書き出す CUES_FILE（あればこちらを使う）
//   2. 無ければ同じ振り付け（SEGMENTS）をNodeで再生して作る。物理も自動操縦も乱数を使わないので、
//      ブラウザを起動しなくても録画と同じ順番・同じ時刻のイベントが出る。ただし面を切り替える
//      ときの往復（page.evaluate 2回）ぶんだけ、2面目以降が0.1秒ほど前にずれる。
//
// 音色はアプリと二重管理にしないため lib/audio.js から輸入する。ここにあるのは
// 「Web Audio が実際に出す波形をPCMでなぞる式」だけ。
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BGM_GAIN,
  BGM_NOTES,
  BGM_STEP,
  EFFECT_GAIN,
  TAIL_GAIN,
  TONES,
} from '../lib/audio.js';
import { createAutopilot } from '../lib/autopilot.js';
import { createState, step, DT } from '../lib/physics.js';
import { CUES_FILE, SEGMENTS } from '../demo-scenario.mjs';

export const SAMPLE_RATE = 48000;
export const PEAK_CEILING = 10 ** (-1 / 20); // -1 dBFS
export const TARGET_LUFS = -17; // 依頼の -16〜-18 のまん中を狙う
export const TARGET_TP = -1.5; // トゥルーピーク上限(dBTP)
export const LUFS_RANGE = Object.freeze([-18, -16]);
// 録画開始（recordEvents(true)）から demo.mp4 の0秒までのずれ。
// いまの demo.mp4 は録画の頭を1.4秒切ってあり、1面目の開始は動画の 1.42 秒前にあたる。
// 実測のしかた：HUDの経過秒が読めるコマを抜き（ffmpeg -ss T -i demo.mp4 -frames:v 1）、
// 「面の経過秒 − そのコマの時刻」を出す。餅を拾うコマの前後で挟むと0.02秒まで詰められる。
// 録り直したり切る位置を変えたら必ず測り直すこと。
export const VIDEO_LEAD = 1.42;

const PAD_LENGTH = 0.9; // BGMの1音を長めに残して、音どうしを重ねる
const PAD_ATTACK = 0.08; // 立ち上がりを鈍らせ、打楽器のように尖らせない
const DRONE_HZ = BGM_NOTES[0] / 2; // 主音の1オクターブ下。雪山の底鳴り。
const DRONE_MIX = 0.4;

function assertDuration(duration, sampleRate) {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('長さ(秒)が不正です');
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8000) {
    throw new Error('サンプリング周波数が不正です');
  }
}

/** lib/audio.js の音色表を、合成に使う形に開く。 */
export function noteFor(name) {
  if (!Object.hasOwn(TONES, name)) {
    throw new Error(`未知の効果音: ${name}`);
  }
  const [from, to, duration] = TONES[name];
  return { from, to, duration, gain: EFFECT_GAIN };
}

/** GainNode.exponentialRampToValueAtTime(TAIL_GAIN, duration) と同じ減り方。 */
export function envelope(t, duration, gain = EFFECT_GAIN) {
  if (t < 0 || t >= duration) {
    return 0;
  }
  return gain * (TAIL_GAIN / gain) ** (t / duration);
}

/**
 * frequency.exponentialRampToValueAtTime の位相。
 * 周波数が指数で動くので、位相はその積分＝from * expm1(k t) / k になる。
 */
export function sweepPhase(t, from, to, duration) {
  const k = Math.log(to / from) / duration;
  return 2 * Math.PI * (k === 0 ? from * t : (from * Math.expm1(k * t)) / k);
}

/** OscillatorNode の triangle の近似。位相0で振幅0から始まるので頭が鳴らない。 */
export function triangle(phase) {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

/** BGMの1音の包絡線。ゆっくり立ち上げて、二乗で細く消す。 */
export function padEnvelope(t, length = PAD_LENGTH, attack = PAD_ATTACK) {
  if (t < 0 || t >= length) {
    return 0;
  }
  if (t < attack) {
    return 0.5 - 0.5 * Math.cos((Math.PI * t) / attack);
  }
  return (1 - (t - attack) / (length - attack)) ** 2;
}

/** ピークを ceiling ちょうどに合わせる。全部0なら0のまま返す。 */
export function normalize(samples, ceiling = PEAK_CEILING) {
  let peak = 0;
  for (const value of samples) {
    peak = Math.max(peak, Math.abs(value));
  }
  return Float64Array.from(samples, value => (peak ? (value * ceiling) / peak : value));
}

/** [{ name, at }] を効果音のPCMにする。at は秒。 */
export function synthesizeEvents(
  events,
  { duration, sampleRate = SAMPLE_RATE, normalized = false } = {},
) {
  assertDuration(duration, sampleRate);
  const samples = new Float64Array(Math.ceil(duration * sampleRate));
  for (const { at, name } of events) {
    if (!Number.isFinite(at) || at < 0) {
      throw new Error('イベントの時刻が不正です');
    }
    const note = noteFor(name);
    const first = Math.round(at * sampleRate);
    const count = Math.ceil(note.duration * sampleRate);
    for (let j = 0; j < count && first + j < samples.length; j++) {
      const t = j / sampleRate;
      samples[first + j] +=
        triangle(sweepPhase(t, note.from, note.to, note.duration)) *
        envelope(t, note.duration, note.gain);
    }
  }
  return normalized ? normalize(samples) : samples;
}

/**
 * 雪山の夜のBGM。アプリと同じ8音（2.8秒でひと巡り）を、低いドローンに重ねて延々と回す。
 * 重なり具合で音量が読めなくなるので、最後にピークを BGM_GAIN へ合わせる
 * ＝効果音の頭（EFFECT_GAIN 0.12）より約10dB低い。
 */
export function synthesizeBgm(
  duration,
  { sampleRate = SAMPLE_RATE, gain = BGM_GAIN } = {},
) {
  assertDuration(duration, sampleRate);
  const samples = new Float64Array(Math.ceil(duration * sampleRate));
  const loop = BGM_NOTES.length * BGM_STEP;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const swell = 0.75 + 0.25 * Math.sin((2 * Math.PI * t) / loop);
    samples[i] = Math.sin(2 * Math.PI * DRONE_HZ * t) * DRONE_MIX * swell;
  }
  for (let n = 0; n * BGM_STEP < duration; n++) {
    const freq = BGM_NOTES[n % BGM_NOTES.length];
    const first = Math.round(n * BGM_STEP * sampleRate);
    const count = Math.ceil(PAD_LENGTH * sampleRate);
    for (let j = 0; j < count && first + j < samples.length; j++) {
      const t = j / sampleRate;
      samples[first + j] += triangle(2 * Math.PI * freq * t) * padEnvelope(t);
    }
  }
  return normalize(samples, gain);
}

/** 効果音とBGMを混ぜて、ピークが天井を超えないところまで戻す。 */
export function mixdown(
  cues,
  { duration = cues.secondsAtEnd, sampleRate = SAMPLE_RATE, ceiling = PEAK_CEILING } = {},
) {
  const effects = synthesizeEvents(cues.events, { duration, sampleRate });
  const bgm = synthesizeBgm(duration, { sampleRate });
  return normalize(
    Float64Array.from(effects, (value, i) => value + bgm[i]),
    ceiling,
  );
}

/** モノラル16bitのWAVにする。 */
export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) =>
    wav.writeInt16LE(
      Math.trunc(Math.max(-1, Math.min(1, sample)) * 32767),
      44 + i * 2,
    ),
  );
  return wav;
}

/**
 * 録画の何秒目から動画に重ねるか。
 * 動画は録画の頭を切ってあるので、音も同じだけ頭を飛ばす。
 * 長さは動画に合わせる（映像を1コマも削らないため）。記録の尻が数百ミリ秒足りなくても、
 * BGMは動画の最後まで鳴り続ける。
 */
export function alignment(videoSeconds, recordedSeconds, lead = VIDEO_LEAD) {
  if (!Number.isFinite(videoSeconds) || videoSeconds <= 0) {
    throw new Error('動画の長さを取れませんでした');
  }
  if (!Number.isFinite(recordedSeconds) || recordedSeconds - lead < videoSeconds - 1) {
    throw new Error('記録が動画に届いていません。デモを録り直してください');
  }
  return { audioFrom: lead, duration: videoSeconds };
}

/**
 * 録画なしで振り付けをなぞり、同じキューを作る。
 * 面をクリアするとアプリは時計ごと止まる（クリア画面）ので、そこで打ち切って
 * 次の面の開始はSEGMENTSの尺で数える。こうすると実時間＝動画の時間と揃う。
 */
export function simulateCues(segments = SEGMENTS) {
  const events = [];
  let base = 0;
  for (const { id, ms } of segments) {
    let s = createState(id);
    const decide = createAutopilot(s.level);
    for (let i = 0, ticks = Math.round(ms / 1000 / DT); i < ticks; i++) {
      s = step(s, decide(s));
      const at = base + (i + 1) * DT;
      for (const name of s.events) {
        events.push({ name, at });
      }
      if (s.status !== 'playing') {
        break;
      }
    }
    base += ms / 1000;
  }
  return { secondsAtEnd: base, events };
}

/** 録画が残したキューがあればそれを、無ければ振り付けの再生結果を返す。 */
export function loadCues(file = CUES_FILE) {
  if (!existsSync(file)) {
    return { cues: simulateCues(), source: '振り付けの再生（録画のキューなし）' };
  }
  const cues = JSON.parse(readFileSync(file, 'utf8'));
  if (
    !Array.isArray(cues.events) ||
    !cues.events.length ||
    !Number.isFinite(cues.secondsAtEnd) ||
    cues.events.some(event => event.at > cues.secondsAtEnd)
  ) {
    throw new Error(`キューが空か不正です: ${file}`);
  }
  return { cues, source: file };
}

function probeSeconds(file) {
  return Number(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      { encoding: 'utf8' },
    ).trim(),
  );
}

/** ffmpeg の loudnorm に測らせる（1周目）。 */
function measureLoudness(file) {
  const filter = `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:print_format=json`;
  const result = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', file, '-af', filter, '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`ラウドネスを測れませんでした\n${result.stderr}`);
  }
  const start = result.stderr.lastIndexOf('{');
  const end = result.stderr.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('loudnorm の測定値を読めませんでした');
  }
  return JSON.parse(result.stderr.slice(start, end + 1));
}

/** 測った値を渡して合わせ直す（2周目）。線形に足せないときは ffmpeg が自動で圧縮に切り替える。 */
function applyLoudnorm(input, output, measured) {
  const filter = [
    `loudnorm=I=${TARGET_LUFS}`,
    `TP=${TARGET_TP}`,
    'LRA=11',
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    'linear=true',
  ].join(':');
  execFileSync(
    'ffmpeg',
    // prettier-ignore
    ['-y', '-v', 'error', '-i', input, '-af', filter,
      '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'pcm_s16le', output],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

const USAGE =
  'Dayフォルダで node tools/render-demo-audio.mjs（ffmpeg / ffprobe が必要）';

export function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log(USAGE);
    return;
  }
  if (args.length) {
    throw new Error('対応する引数は --help だけです');
  }
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const video = join(appDir, 'demo.mp4');
  const out = join(appDir, 'demo-with-audio.mp4');
  const { cues, source } = loadCues();
  const sync = alignment(probeSeconds(video), cues.secondsAtEnd);

  // 動画に乗る範囲だけを切り出してから測る。使わない頭と尻でラウドネスがぶれないように。
  const full = mixdown(cues, { duration: sync.audioFrom + sync.duration });
  const from = Math.round(sync.audioFrom * SAMPLE_RATE);
  const clip = full.slice(from, from + Math.round(sync.duration * SAMPLE_RATE));
  const raw = join(tmpdir(), 'day-046-demo-raw.wav');
  const wav = join(tmpdir(), 'day-046-demo.wav');
  writeFileSync(raw, encodeWav(clip));
  applyLoudnorm(raw, wav, measureLoudness(raw));
  const loudness = Number(measureLoudness(wav).input_i);
  const [low, high] = LUFS_RANGE;
  if (!(loudness >= low && loudness <= high)) {
    throw new Error(`ラウドネスが ${low}〜${high} LUFS に入りません: ${loudness} LUFS`);
  }

  execFileSync(
    'ffmpeg',
    // prettier-ignore
    ['-y', '-v', 'error', '-i', video, '-i', wav,
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '128k', '-shortest',
      '-map_metadata', '-1', '-movflags', '+faststart', out],
    { stdio: 'inherit' },
  );
  console.log(
    `作成: demo-with-audio.mp4 / 音は ${source} / ` +
      `${sync.audioFrom}秒から ${sync.duration.toFixed(2)}秒 / ` +
      `効果音 ${cues.events.length}件 / ${loudness} LUFS`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
