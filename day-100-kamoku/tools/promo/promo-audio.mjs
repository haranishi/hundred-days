// Day100「kamoku」の BGM（A案・B案）と、確定・保存の合図。
// 発振・包絡線・混合は Node の計算だけ。サンプル音源・既存曲の旋律・外部 API は使わない。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BAR, BARS, BEAT, BPM, CUES, DURATION_SECONDS, FADE_OUT_SECONDS, FPS, STORYBOARD, bar } from './timeline.mjs';

export const RATE = 48_000;
export const FRAMES = Math.round(DURATION_SECONDS * RATE);
export const FADE = FADE_OUT_SECONDS;
export const TARGET_LUFS = -16;
const TAU = 2 * Math.PI;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const stereo = (seconds) => new Float32Array(Math.ceil(seconds * RATE) * 2);
const at = (barNo, beatNo = 0) => Math.round((barNo * BAR + beatNo * BEAT) * 1000) / 1000;

export const MAJOR_GESTURES = new Set(['confirm', 'save']);
const dropAt = STORYBOARD.find((scene) => scene.music === 'drop').start;

// A案「未確認の朝」ニ長調。粒の立つマリンバとまっすぐな拍。
// B案「帳簿の灯」変ロ長調。丸いエレピと揺れのある拍。旋律はどちらもこの動画用。
export const SCORES = {
  a: {
    title: '未確認の朝',
    key: 'D major',
    voicings: {
      Dmaj9: [50, [62, 66, 69, 71]],
      'A/C#': [49, [61, 64, 69, 73]],
      Bm7: [47, [62, 66, 69, 71]],
      Gmaj9: [43, [62, 66, 67, 71]],
      Em9: [40, [64, 67, 71, 74]],
      A13: [45, [64, 67, 70, 73]],
      'F#m7': [42, [61, 66, 69, 73]],
      Em7: [40, [64, 67, 71, 74]],
      A9sus: [45, [64, 67, 69, 71]],
      'D6/9': [50, [62, 64, 69, 71]],
    },
    changes: [
      null, null,
      'Dmaj9', 'A/C#', 'Bm7',
      'Gmaj9',
      'Em9', 'A13', 'Dmaj9',
      'F#m7', 'Gmaj9', 'Em7',
      'A9sus', 'D6/9',
      'D6/9', 'D6/9',
    ],
    scale: [62, 64, 66, 69, 71, 74, 76, 78],
    melody: {
      2: [[0.25, 74, 0.4], [1.25, 71, 0.35], [2.25, 78, 0.5], [3.25, 74, 0.4]],
      3: [[0.5, 73, 0.45], [1.75, 71, 0.4], [2.75, 69, 0.7]],
      4: [[0.25, 71, 0.5], [1.5, 74, 0.4], [2.5, 66, 0.8]],
      5: [[0.5, 71, 0.55], [2.0, 74, 0.6], [3.25, 67, 0.45]],
      6: [[0.25, 76, 0.45], [1.25, 74, 0.4], [2.5, 71, 0.7]],
      7: [[0.5, 73, 0.6], [2.0, 76, 0.45], [3.0, 74, 0.55]],
      8: [[0.25, 78, 0.7], [1.75, 74, 0.4], [2.75, 71, 0.7]],
      9: [[0.5, 73, 0.55], [2.0, 76, 0.5], [3.25, 78, 0.4]],
      10: [[0.25, 74, 0.6], [1.5, 71, 0.45], [2.75, 67, 0.6]],
      11: [[0.5, 71, 0.7], [2.25, 74, 0.8]],
    },
  },
  b: {
    title: '帳簿の灯',
    key: 'Bb major',
    voicings: {
      Bbmaj9: [46, [58, 62, 65, 70]],
      Gm9: [43, [58, 62, 65, 67]],
      Ebmaj9: [39, [58, 63, 65, 70]],
      F13: [41, [58, 60, 65, 69]],
      Cm9: [48, [58, 63, 65, 70]],
      Dm7: [50, [60, 65, 69, 72]],
      F9sus: [41, [58, 60, 65, 67]],
      'Bb6/9': [46, [58, 62, 65, 69]],
    },
    changes: [
      null, null,
      'Bbmaj9', 'Gm9', 'Ebmaj9',
      'F13',
      'Cm9', 'F9sus', 'Bbmaj9',
      'Dm7', 'Ebmaj9', 'Cm9',
      'F9sus', 'Bb6/9',
      'Bb6/9', 'Bb6/9',
    ],
    scale: [58, 60, 62, 65, 67, 70, 72, 74],
    melody: {
      2: [[0.66, 70, 0.9], [2.33, 67, 0.8]],
      3: [[0.33, 72, 1.0], [2.16, 70, 0.7], [3.16, 65, 0.5]],
      4: [[0.66, 67, 1.05], [2.5, 65, 0.8]],
      5: [[0.33, 70, 1.1], [2.33, 72, 0.85]],
      6: [[0.66, 74, 0.9], [2.16, 70, 0.75], [3.33, 67, 0.4]],
      7: [[0.33, 72, 1.15], [2.5, 69, 0.7]],
      8: [[0.5, 70, 1.2], [2.66, 74, 0.7]],
      9: [[0.33, 72, 1.0], [2.16, 77, 0.85]],
      10: [[0.66, 74, 1.05], [2.5, 70, 0.8]],
      11: [[0.33, 67, 1.2], [2.66, 70, 0.7]],
    },
  },
};

export function cliOptions(defaultVariant) {
  const { values } = parseArgs({
    options: {
      variant: { type: 'string', default: defaultVariant },
      'out-dir': { type: 'string' },
      cues: { type: 'string' },
    },
  });
  if (values.variant !== undefined && !Object.hasOwn(SCORES, values.variant)) {
    throw new Error('--variant は a または b');
  }
  const defaultDir = join(tmpdir(), 'day100-promo-audio');
  return { variant: values.variant, dir: resolve(values['out-dir'] ?? defaultDir), cueFile: values.cues };
}

export function normalizeCues(input) {
  if (!Array.isArray(input)) throw new Error('JSON に cues 配列が必要です');
  const count = new Map();
  return [...input].sort((a, b) => a?.at - b?.at).map((cue) => {
    const templates = CUES.filter((item) => item.kind === cue?.kind);
    if (!templates.length || !Number.isFinite(cue.at) || cue.at < 0 || cue.at >= DURATION_SECONDS) {
      throw new Error('合図の kind または at が無効です: ' + JSON.stringify(cue));
    }
    const index = count.get(cue.kind) ?? 0;
    count.set(cue.kind, index + 1);
    const template = templates[index];
    const n = cue.n === undefined ? template?.n : cue.n;
    if (!Number.isSafeInteger(n) || !templates.some((item) => item.n === n)) {
      throw new Error(`${cue.kind} の n が範囲外です`);
    }
    return { at: cue.at, kind: cue.kind, n };
  });
}

export function loadCues(arg) {
  if (arg === undefined) return normalizeCues(CUES);
  const inline = arg.trimStart();
  const json = inline.startsWith('{') || inline.startsWith('[') ? inline : readFileSync(arg, 'utf8');
  const data = JSON.parse(json);
  return normalizeCues(Array.isArray(data) ? data : data?.cues);
}

function paint(bus, start, length, gain, pan, attack, release, oscillator) {
  const first = Math.round(start * RATE);
  const count = Math.min(Math.round(length * RATE), bus.length / 2 - first);
  if (count <= 0 || first < 0) return;
  const angle = (pan + 1) * Math.PI / 4;
  const left = gain * Math.cos(angle);
  const right = gain * Math.sin(angle);
  const atk = Math.max(1 / RATE, attack);
  const rel = Math.max(1 / RATE, release);
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / atk) * Math.min(1, (count - 1 - i) / (rel * RATE));
    const value = oscillator(t) * env;
    const pos = (first + i) * 2;
    bus[pos] += value * left;
    bus[pos + 1] += value * right;
  }
}

function note(bus, voice, start, length, midi, gain, pan = 0) {
  const w = TAU * hz(midi);
  if (voice === 'pad') {
    paint(bus, start, length, gain, pan, 0.04, 0.16, (t) =>
      (0.74 * Math.sin(w * t) + 0.18 * Math.sin(w * 1.002 * t) + 0.08 * Math.sin(2 * w * t)) * Math.exp(-0.12 * t));
  } else if (voice === 'marimba') {
    paint(bus, start, length, gain, pan, 0.0024, 0.04, (t) =>
      Math.sin(w * t) * Math.exp(-5.2 * t)
      + 0.22 * Math.sin(w * 3.97 * t) * Math.exp(-20 * t)
      + 0.08 * Math.sin(w * 2 * t) * Math.exp(-9 * t));
  } else if (voice === 'epiano') {
    paint(bus, start, length, gain, pan, 0.008, 0.09, (t) => {
      const phase = w * t;
      const tine = 0.6 * Math.exp(-6 * t) * Math.sin(2.003 * phase);
      return (0.82 * Math.sin(phase + tine) + 0.16 * Math.sin(2 * phase) * Math.exp(-4.2 * t)) * Math.exp(-1.65 * t);
    });
  } else if (voice === 'bell') {
    paint(bus, start, length, gain, pan, 0.003, 0.08, (t) =>
      Math.sin(w * t) * Math.exp(-4.2 * t)
      + 0.22 * Math.sin(w * 2.01 * t) * Math.exp(-9 * t)
      + 0.1 * Math.sin(w * 4.08 * t) * Math.exp(-17 * t));
  } else if (voice === 'bass' || voice === 'roundBass') {
    const round = voice === 'roundBass';
    paint(bus, start, length, gain, pan, round ? 0.012 : 0.006, 0.06, (t) =>
      Math.exp(-(round ? 1.1 : 1.7) * t)
      * (0.84 * Math.sin(w * t) + (round ? 0.16 : 0.26) * Math.sin(2 * w * t) * Math.exp(-2.2 * t)));
  } else {
    throw new Error('未知の楽器: ' + voice);
  }
}

function chord(bus, voice, start, length, tones, gain, sweep = 0) {
  tones.forEach((midi, index) => {
    const delay = sweep >= 0 ? sweep * index : -sweep * (tones.length - 1 - index);
    note(bus, voice, start + delay, length - delay, midi, gain, (index - (tones.length - 1) / 2) * 0.2);
  });
}

function glide(bus, start, length, from, to, slide, decay, gain, pan = 0) {
  paint(bus, start, length, gain, pan, 0.0016, 0.014, (t) => {
    const cycles = to * t + (from - to) * slide * (1 - Math.exp(-t / slide));
    return Math.sin(TAU * cycles) * Math.exp(-t / decay);
  });
}

function noise(bus, start, length, from, to, shape, gain, pan, seed) {
  let state = (seed | 0) || 1;
  let fast = 0;
  let slow = 0;
  const first = 1 - Math.exp(-TAU * from / RATE);
  const last = 1 - Math.exp(-TAU * to / RATE);
  paint(bus, start, length, gain, pan, 0.002, Math.min(length / 4, 0.08), (t) => {
    state = (Math.imul(1664525, state) + 1013904223) | 0;
    const u = t / length;
    const cutoff = first + (last - first) * u;
    fast += cutoff * (state / 2147483648 - fast);
    slow += 0.27 * cutoff * (fast - slow);
    const env = shape === 'wind' ? 0.2 + 0.8 * Math.sin(Math.PI * u) ** 2 : shape === 'flat' ? 1 : Math.exp(-3.6 * u);
    return (fast - slow) * env;
  });
}

function renderRhythm(music, variant, barIdx, section, root) {
  const bright = variant === 'a';
  const chorus = section === 'chorus' || section === 'build';
  const beatAt = (beat) => at(barIdx, beat);
  const seed = 8100 + 91 * barIdx;
  const kicks = bright
    ? (chorus ? [0, 1.5, 2, 3.5] : [0, 2, 3])
    : (chorus ? [0, 1.66, 2.66] : [0, 2.5]);
  for (const beat of kicks) {
    const level = section === 'drop' && beat === 0 ? 0.62 : beat === 0 ? 0.4 : 0.28;
    glide(music, beatAt(beat), bright ? 0.2 : 0.24, bright ? 150 : 118, bright ? 52 : 48, 0.022, 0.08, level);
  }
  const bassLine = bright
    ? [[0, 0, 0.9], [1.5, 7, 0.4], [2, 0, 0.8], [3.25, 12, 0.45]]
    : [[0, 0, 1.5], [2, 7, 0.55], [2.66, 0, 0.8]];
  for (const [beat, interval, beats] of bassLine) {
    note(music, bright ? 'bass' : 'roundBass', beatAt(beat), beats * BEAT, root + interval, interval ? 0.18 : 0.28);
  }
  if (bright) {
    for (const beat of [1, 3]) {
      noise(music, beatAt(beat), 0.09, 3200, 1400, 'brush', 0.22, 0.12, seed + beat);
    }
    for (const beat of [0.5, 1.5, 2.5, 3.5]) {
      noise(music, beatAt(beat), 0.05, 6200, 2800, 'brush', 0.11, 0.3, seed + Math.round(beat * 20));
    }
  } else {
    for (const beat of [1, 3]) {
      noise(music, beatAt(beat) + 0.02, 0.16, 2400, 900, 'brush', 0.18, -0.1, seed + Math.round(beat * 40));
    }
    for (const beat of [0.66, 1.66, 2.66, 3.66]) {
      noise(music, beatAt(beat), 0.12, 1800, 4600, 'wind', 0.1, 0.28, seed + Math.round(beat * 50));
    }
  }
}

function introBed(music, variant) {
  const bright = variant === 'a';
  const tones = bright ? [62, 66, 69, 71] : [58, 62, 65, 70];
  chord(music, 'pad', 0, 3.72, tones, bright ? 0.055 : 0.06);
  noise(music, 0, 3.72, 180, 480, 'flat', 0.03, 0, bright ? 44001 : 44002);
  if (bright) {
    note(music, 'marimba', 0.012, 0.55, 74, 0.12, -0.1);
    note(music, 'marimba', 0.85, 0.5, 71, 0.1, 0.12);
    note(music, 'marimba', 1.7, 0.6, 78, 0.1, -0.08);
    note(music, 'marimba', 2.65, 0.7, 69, 0.09, 0.1);
  } else {
    note(music, 'epiano', 0.01, 0.9, 70, 0.11, -0.08);
    note(music, 'epiano', 1.15, 0.85, 65, 0.09, 0.1);
    note(music, 'epiano', 2.35, 0.9, 67, 0.09, -0.06);
  }
}

function accompaniment(variant) {
  const score = SCORES[variant];
  if (score.changes.length !== BARS) throw new Error('コード進行が16小節ではない');
  const bright = variant === 'a';
  const music = stereo(DURATION_SECONDS);
  const chords = [];
  introBed(music, variant);
  let resolveHeld = false;

  for (let i = 0; i < BARS; i++) {
    const start = bar(i);
    const scene = STORYBOARD.find((item) => start >= item.start - 1e-9 && start < item.end - 1e-9);
    const section = scene.music;
    const name = score.changes[i];
    if (!name || section === 'intro') {
      chords.push({ at: start, scene: section, name: null, bassMidi: null, upperMidi: [] });
      continue;
    }
    const [root, tones] = score.voicings[name];
    chords.push({ at: start, scene: section, name, bassMidi: root, upperMidi: tones });
    if (section === 'resolve') {
      if (!resolveHeld) {
        const hold = DURATION_SECONDS - start;
        chord(music, 'pad', start, hold, tones, 0.075);
        note(music, bright ? 'bass' : 'roundBass', start, Math.min(1.1, hold), root, 0.22);
        resolveHeld = true;
      }
      continue;
    }
    if (section === 'calm') {
      chord(music, 'pad', start, BAR + 0.06, tones, 0.05);
      chord(music, bright ? 'marimba' : 'epiano', start + 0.25, 1.15, tones, 0.055, 0.018);
      continue;
    }
    renderRhythm(music, variant, i, section, root);
    const chorus = section === 'chorus' || section === 'build';
    if (bright) {
      [0, 0.75, 1.5, 2.25, 3].forEach((beat, index) => {
        note(music, 'marimba', at(i, beat), 0.28, tones[(index + i) % tones.length], index === 0 ? 0.12 : 0.09, ((index % 3) - 1) * 0.22);
      });
    } else {
      for (const [beat, length] of [[0, 0.8], [1.66, 0.5], [3, chorus ? 0.48 : 0.36]]) {
        chord(music, 'epiano', at(i, beat), length, tones, 0.08, 0.008);
      }
    }
    chord(music, 'pad', start, BAR + 0.04, tones, chorus ? 0.04 : 0.026);
    for (const [beat, midi, beats] of score.melody[i] ?? []) {
      const voice = bright ? 'marimba' : 'epiano';
      note(music, voice, at(i, beat), BEAT * beats + 0.05, midi, chorus ? 0.2 : 0.16, -0.12);
    }
  }

  const dropFrame = Math.round(dropAt * RATE);
  const dipFrom = Math.round((dropAt - 0.1) * RATE);
  for (let i = dipFrom; i < dropFrame; i++) {
    music[i * 2] *= 0.2;
    music[i * 2 + 1] *= 0.2;
  }
  return { music, chords };
}

export const GESTURE_LENGTHS = { confirm: 0.42, save: 0.62 };

function gesture(variant, cue, length) {
  const sound = stereo(length);
  const score = SCORES[variant];
  const bright = variant === 'a';
  if (cue.kind === 'confirm') {
    const root = score.scale[4] + (cue.n ? 2 : 0);
    glide(sound, 0, 0.08, 280, 640, 0.016, 0.03, 0.2, -0.05);
    note(sound, 'bell', 0, 0.36, root + 12, 0.32, 0.08);
    note(sound, bright ? 'marimba' : 'epiano', 0.03, 0.28, root, 0.24, -0.1);
    note(sound, 'bell', 0.05, 0.3, root + 7, 0.16, 0.16);
  } else if (cue.kind === 'save') {
    const tones = [score.scale[2], score.scale[4], score.scale[6], score.scale[7]];
    tones.forEach((midi, index) => {
      note(sound, 'bell', index * 0.03, length - index * 0.03, midi + 12, 0.22 - index * 0.02, -0.2 + index * 0.13);
    });
    note(sound, bright ? 'marimba' : 'epiano', 0.02, 0.4, tones[1], 0.18, 0.05);
  } else {
    throw new Error('未知の効果音: ' + cue.kind);
  }
  return sound;
}

export function renderMix(variant, cues) {
  const { music: mix, chords } = accompaniment(variant);
  for (const cue of cues.filter((item) => MAJOR_GESTURES.has(item.kind))) {
    const frame = Math.round(cue.at * RATE);
    for (let i = Math.max(0, Math.round(frame - 0.135 * RATE)); i < Math.min(FRAMES, Math.round(frame + 0.01 * RATE)); i++) {
      const dt = (i - frame) / RATE;
      const depth = Math.max(0, Math.min(1, (dt + 0.135) / 0.05, (0.01 - dt) / 0.02));
      mix[i * 2] *= 1 - 0.55 * depth;
      mix[i * 2 + 1] *= 1 - 0.55 * depth;
    }
  }
  const stems = cues.map((cue) => {
    const samples = gesture(variant, cue, GESTURE_LENGTHS[cue.kind]);
    const first = Math.round(cue.at * RATE);
    const count = Math.min(samples.length, mix.length - 2 * first);
    for (let i = 0; i < count; i++) mix[first * 2 + i] += samples[i];
    return { cue, first, samples };
  });
  return { variant, title: SCORES[variant].title, key: SCORES[variant].key, bpm: BPM, bars: BARS, fps: FPS, chords, mix, stems };
}

export function edgeGain(frame) {
  if (frame < 0.008 * RATE) return Math.sin((Math.PI / 2) * frame / (0.008 * RATE)) ** 2;
  const left = FRAMES - 1 - frame;
  return left < FADE * RATE ? Math.sin((Math.PI / 2) * left / (FADE * RATE)) ** 2 : 1;
}

export function pcm16(value, gain) {
  const x = value * gain;
  const magnitude = Math.abs(x);
  const limited = magnitude <= 0.58 ? x : Math.sign(x) * (0.58 + 0.175 * Math.tanh((magnitude - 0.58) / 0.175));
  return Math.round(limited * 32767);
}

export function pcmBuffer(mix, gain) {
  const pcm = Buffer.allocUnsafe(FRAMES * 4);
  for (let i = 0; i < FRAMES; i++) {
    const level = gain * edgeGain(i);
    pcm.writeInt16LE(pcm16(mix[i * 2], level), i * 4);
    pcm.writeInt16LE(pcm16(mix[i * 2 + 1], level), i * 4 + 2);
  }
  return pcm;
}

function chunk(tag, data) {
  const block = Buffer.alloc(8 + data.length + (data.length % 2));
  block.write(tag);
  block.writeUInt32LE(data.length, 4);
  data.copy(block, 8);
  return block;
}

export function buildWav(pcm, recipe) {
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(2, 2);
  format.writeUInt32LE(RATE, 4);
  format.writeUInt32LE(RATE * 4, 8);
  format.writeUInt16LE(4, 12);
  format.writeUInt16LE(16, 14);
  const chunks = [chunk('fmt ', format), chunk('data', pcm)];
  if (recipe) {
    const comment = chunk('ICMT', Buffer.from(JSON.stringify(recipe) + '\0'));
    chunks.push(chunk('LIST', Buffer.concat([Buffer.from('INFO'), comment])));
  }
  return chunk('RIFF', Buffer.concat([Buffer.from('WAVE'), ...chunks]));
}

export function media(tool, args, input) {
  const homebrew = '/opt/homebrew/bin/' + tool;
  const binary = process.env[tool.toUpperCase()] || (existsSync(homebrew) ? homebrew : tool);
  const result = spawnSync(binary, args, { input, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(tool + ': ' + result.stderr.toString().trim());
  return result;
}

export function loudness(source) {
  const input = Buffer.isBuffer(source) ? source : undefined;
  const { stderr } = media('ffmpeg', [
    '-hide_banner', '-nostdin', '-nostats', '-i', input ? 'pipe:0' : source,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-',
  ], input);
  const data = JSON.parse(stderr.toString().match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? 'null');
  if (!data || !Number.isFinite(Number(data.input_i))) throw new Error('ラウドネスを測定できません');
  return {
    integratedLufs: Number(data.input_i),
    truePeakDbtp: Number(data.input_tp),
    loudnessRangeLu: Number(data.input_lra),
  };
}

function encode(dir, arrangement, externalCues) {
  const { variant, mix, stems } = arrangement;
  let gain = 1;
  mkdirSync(dir, { recursive: true });
  for (let pass = 0; pass < 6; pass++) {
    const pcm = pcmBuffer(mix, gain);
    const measured = loudness(buildWav(pcm));
    if (Math.abs(measured.integratedLufs - TARGET_LUFS) <= 0.18 && measured.truePeakDbtp <= -1.6) {
      const recipe = { variant, gain, cueSource: externalCues ? 'override' : 'timeline' };
      if (externalCues) recipe.cues = stems.map((stem) => stem.cue);
      const file = join(dir, 'bgm_' + variant + '.wav');
      writeFileSync(file, buildWav(pcm, recipe));
      media('ffmpeg', [
        '-v', 'error', '-nostdin', '-y', '-i', file, '-map_metadata', '-1',
        '-c:a', 'libmp3lame', '-b:a', '320k', '-write_xing', '1', join(dir, 'bgm_' + variant + '.mp3'),
      ]);
      return;
    }
    gain *= 10 ** ((TARGET_LUFS - measured.integratedLufs) / 20);
  }
  throw new Error('マスタリングが目標値に収まりません');
}

async function main() {
  const { dir, variant, cueFile } = cliOptions('a');
  const arrangement = renderMix(variant, loadCues(cueFile));
  const { analyze, withStaging } = await import('./verify-audio.mjs');
  const [result] = await withStaging(dir, (stage) => {
    encode(stage, arrangement, cueFile !== undefined);
    const report = analyze(stage, variant, { arrangement });
    return { variants: [report], files: ['bgm_' + variant + '.wav', 'bgm_' + variant + '.mp3'] };
  });
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
