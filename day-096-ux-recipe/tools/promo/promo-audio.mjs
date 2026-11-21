// Day096「UXレシピ」. All oscillators, noise, envelopes, mixing and mastering run in Node.
// The picture owns the bar lines and UI gestures. No samples or borrowed melodies.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ACTIONS, BAR, BARS, BEAT, BPM, CUES, DURATION_SECONDS, FPS, STORYBOARD, at, bar } from './timeline.mjs';

export const RATE = 48_000;
export const FRAMES = Math.round(DURATION_SECONDS * RATE);
export const FADE = 1.5;
export const TARGET_LUFS = -16;
const TAU = 2 * Math.PI;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const stereo = (seconds) => new Float32Array(Math.ceil(seconds * RATE) * 2);
const majorGestures = new Set(['build', 'delete', 'undo', 'end']);
const tapped = new Set(['build', 'swap', 'move', 'delete', 'expand', 'undo', 'open']);

// Each voicing is [bass MIDI, upper voices]. The last chord is tied across two bars.
const scores = {
  a: {
    title: '木の粒', key: 'D major',
    voicings: {
      'D6/9': [38, [57, 62, 64, 66, 71]], Gmaj7: [43, [55, 59, 62, 66]],
      Aadd9: [45, [57, 59, 61, 64]], Bm7: [35, [57, 59, 62, 66]],
      G6: [43, [55, 59, 62, 64]], Em7: [40, [55, 59, 62, 64]],
      'D/F#': [42, [57, 62, 66, 69]], A6: [45, [57, 61, 64, 66]],
    },
    changes: ['D6/9', 'D6/9', 'Gmaj7', 'Aadd9', 'Bm7', 'G6', 'Em7', 'G6', 'Aadd9', 'Bm7', 'Gmaj7', 'D/F#', 'A6', 'D6/9', 'D6/9'],
    chips: [74, 76, 78, 81, 83],
    // Entries are [beat, MIDI, length in beats]. Leave space between the two phrases.
    melody: {
      groove2: [[[.5, 66, .7], [1.5, 69, .8], [2.75, 74, 1]], [[0, 71, 1.1], [1.5, 69, .5], [2.25, 67, 1.3]]],
      build: [[[.5, 67, .7], [1.5, 71, .7], [2.5, 74, 1]], [[.5, 74, 1], [2, 71, .7], [3, 69, .65]], [[.5, 69, .7], [1.5, 73, .8], [2.5, 76, 1]]],
      lift: [[[.5, 74, .6], [1.5, 78, .65], [2.75, 76, .9]], [[.5, 71, .65], [1.5, 74, .7], [3, 78, .7]]],
      chorus: [[[0, 78, 1.2], [1.5, 81, 1.45], [3.25, 78, .65]], [[0, 76, .8], [1, 73, .65], [2, 71, .85], [3, 69, .7]]],
    },
  },
  b: {
    title: '机辺のエレピ', key: 'E♭ major',
    voicings: {
      'E♭maj9': [39, [55, 58, 62, 65]], Cm9: [36, [51, 55, 58, 62]],
      Fm9: [41, [56, 60, 63, 67]], 'B♭13': [34, [56, 60, 62, 67]],
      'A♭maj9': [44, [55, 58, 60, 63]], Gm7: [43, [53, 58, 62, 67]],
      'E♭6/9': [39, [55, 58, 60, 65]],
    },
    changes: ['E♭maj9', 'Cm9', 'Fm9', 'B♭13', 'E♭maj9', 'A♭maj9', 'Fm9', 'Cm9', 'B♭13', 'A♭maj9', 'Fm9', 'Gm7', 'B♭13', 'E♭6/9', 'E♭6/9'],
    chips: [70, 72, 75, 77, 79],
    melody: {
      groove2: [[[.62, 70, 1.05], [2, 67, .55], [2.62, 65, 1.1]], [[.62, 63, .8], [1.62, 67, .6], [3, 70, .85]]],
      build: [[[0, 68, 1.1], [1.62, 67, .6], [2.62, 63, 1]], [[.62, 67, .9], [2, 70, 1.3]], [[0, 65, 1.1], [1.62, 68, .6], [3, 72, .8]]],
      lift: [[[.62, 72, 1.15], [2.62, 70, .5], [3.3, 67, .65]], [[.62, 68, 1.2], [2.62, 72, 1.1]]],
      chorus: [[[0, 74, 1.45], [1.62, 77, .7], [2.62, 79, 1.25]], [[.62, 77, .8], [1.62, 74, .6], [2.62, 70, 1.2]]],
    },
  },
};

export function cliOptions(defaultVariant) {
  const { values } = parseArgs({ options: {
    variant: { type: 'string', default: defaultVariant }, 'out-dir': { type: 'string' }, cues: { type: 'string' },
  } });
  if (values.variant !== undefined && !Object.hasOwn(scores, values.variant)) throw new Error('--variant は a または b');
  const defaultDir = join(tmpdir(), 'day096-promo', 'audio'); // リポジトリの外（生成物をコミットしない）
  return { variant: values.variant, dir: resolve(values['out-dir'] ?? defaultDir), cueFile: values.cues };
}

export function normalizeCues(input) {
  if (!Array.isArray(input)) throw new Error('JSON に cues 配列が必要です');
  const count = new Map();
  return [...input].sort((a, b) => a?.at - b?.at).map((cue) => {
    const templates = CUES.filter((c) => c.kind === cue?.kind);
    if (!templates.length || !Number.isFinite(cue.at) || cue.at < 0 || cue.at >= DURATION_SECONDS) {
      throw new Error('合図の kind または at が無効です: ' + JSON.stringify(cue));
    }
    const index = count.get(cue.kind) ?? 0;
    count.set(cue.kind, index + 1);
    const template = templates[index];
    const n = cue.n ?? template?.n ?? 0;
    if (!Number.isSafeInteger(n) || n < 0 || (cue.kind === 'chip' && n >= 5)) throw new Error('合図の n が無効です');
    if (cue.kind !== 'whoosh') return { at: cue.at, kind: cue.kind, n };
    const dir = cue.dir ?? template?.dir ?? 'up';
    if (dir !== 'up' && dir !== 'down') throw new Error('whoosh の dir は up または down');
    return { at: cue.at, kind: cue.kind, n, dir };
  });
}

export function loadCues(arg) {
  if (arg === undefined) return normalizeCues(CUES);
  const json = arg.trimStart().startsWith('{') ? arg : readFileSync(arg, 'utf8');
  return normalizeCues(JSON.parse(json).cues);
}

// The same stereo painter serves musical notes and isolated UI sounds. Every voice
// starts and releases continuously; local cue offsets are rounded only once to a sample.
function paint(bus, start, length, gain, pan, attack, release, oscillator) {
  const first = Math.round(start * RATE);
  const count = Math.min(Math.round(length * RATE), bus.length / 2 - first);
  const angle = (pan + 1) * Math.PI / 4;
  const left = gain * Math.cos(angle), right = gain * Math.sin(angle);
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / attack) * Math.min(1, (count - 1 - i) / (release * RATE));
    const value = oscillator(t) * env;
    const pos = (first + i) * 2;
    bus[pos] += value * left;
    bus[pos + 1] += value * right;
  }
}

function note(bus, voice, start, length, midi, gain, pan = 0) {
  const w = TAU * hz(midi);
  if (voice === 'pad') {
    paint(bus, start, length, gain, pan, .095, .16, (t) =>
      .72 * Math.sin(w * t) + .20 * Math.sin(w * 1.0021 * t) + .08 * Math.sin(w * 2 * t));
  } else if (voice === 'mallet') {
    paint(bus, start, length, gain, pan, .0028, .048, (t) =>
      Math.sin(w * t) * Math.exp(-4.8 * t) + .22 * Math.sin(w * 3.96 * t) * Math.exp(-17 * t)
      + .10 * Math.sin(w * 2 * t) * Math.exp(-9 * t));
  } else if (voice === 'keys') {
    paint(bus, start, length, gain, pan, .006, .095, (t) => {
      const tine = .68 * Math.exp(-8 * t) * Math.sin(w * 2 * t);
      return Math.sin(w * t + tine) * Math.exp(-1.65 * t) * (.96 + .04 * Math.cos(TAU * 3.35 * t));
    });
  } else if (voice === 'bass') {
    paint(bus, start, length, gain, pan, .007, .05, (t) => Math.exp(-1.3 * t) *
      (.74 * Math.sin(w * t) + .23 * Math.sin(2 * w * t) + .10 * Math.sin(3 * w * t) * Math.exp(-4 * t)));
  } else {
    throw new Error('未知の楽器: ' + voice);
  }
}

// Integrate the falling/rising frequency so pitch changes do not break phase.
function glide(bus, start, length, from, to, slide, decay, gain, pan = 0) {
  paint(bus, start, length, gain, pan, .0018, .014, (t) => {
    const cycles = to * t + (from - to) * slide * (1 - Math.exp(-t / slide));
    return Math.sin(TAU * cycles) * Math.exp(-t / decay);
  });
}

function noise(bus, start, length, from, to, shape, gain, pan, seed) {
  let state = (seed | 0) || 1, fast = 0, slow = 0;
  const first = 1 - Math.exp(-TAU * from / RATE), last = 1 - Math.exp(-TAU * to / RATE);
  paint(bus, start, length, gain, pan, .0025, Math.min(length / 4, .08), (t) => {
    state = (Math.imul(1664525, state) + 1013904223) | 0;
    const u = t / length, cutoff = first + (last - first) * u;
    fast += cutoff * (state / 2147483648 - fast);
    slow += .27 * cutoff * (fast - slow);
    const env = shape === 'wind' ? .16 + .84 * Math.sin(Math.PI * u) ** 2
      : shape === 'rise' ? .2 + .8 * u : Math.exp(-3.8 * u);
    return (fast - slow) * env;
  });
}

function accompaniment(variant) {
  const score = scores[variant], pop = variant === 'a', voice = pop ? 'mallet' : 'keys';
  const music = stereo(DURATION_SECONDS), chords = [];
  for (let i = 0; i < BARS; i++) {
    const start = bar(i), scene = STORYBOARD.find((s) => start >= s.start && start < s.end);
    const label = scene.music, phrase = Math.round((start - scene.start) / BAR);
    const name = score.changes[i], [root, tones] = score.voicings[name];
    chords.push({ at: start, scene: label, name, bassMidi: root, upperMidi: tones });
    const intro = label === 'intro', ending = label === 'resolve';
    const lift = label === 'lift', chorus = label === 'chorus', build = label === 'build';
    const spread = (v) => (v - (tones.length - 1) / 2) * .21;
    if (ending && phrase > 0) continue;
    const sustain = ending ? scene.end - start : BAR + .06;
    const padLevel = intro ? .031 : ending ? .064 : chorus ? .065 : build ? .039 + .007 * phrase : .043;
    tones.forEach((midi, v) => note(music, 'pad', start, sustain, midi, padLevel, spread(v)));

    if (intro) {
      note(music, voice, start, .92, root + 24, .081, -.10);
      note(music, voice, at(i, 1.65), .68, tones[2] + 12, .046, .22);
      noise(music, start, BAR, 490, 780, 'wind', .033, -.2, 96);
      // An airy musical pickup lands on the first kick; the build UI sound starts on the tap.
      noise(music, scene.end - .22, .22, 580, 2400, 'rise', .072, .2, 1696);
      continue;
    }
    if (ending) {
      note(music, 'bass', start, sustain, root, .235);
      continue;
    }
    const kickBeats = lift ? [0, 1, 2, 3] : chorus ? [0, 1.5, 2] : [0, 2];
    for (const beat of kickBeats) {
      glide(music, at(i, beat), .27, pop ? 139 : 116, pop ? 54 : 57, .031, .088,
        (label === 'drop' && beat === 0 ? .51 : .36) * (beat === 0 ? 1 : .87));
    }
    const bassNotes = pop ? [[0, 0, 1.12], [1.5, 7, .38], [2, 0, .85], [3.25, 12, .51]]
      : [[0, 0, 1.51], [1.67, 7, .26], [2, 0, 1.19], [3.62, 7, .30]];
    for (const [beat, interval, beats] of bassNotes) {
      note(music, 'bass', at(i, beat), BEAT * beats, root + interval, .255 * (interval ? .68 : 1));
    }
    for (const beat of [1, 3]) {
      const when = at(i, beat) + (pop ? 0 : .013);
      noise(music, when, pop ? .13 : .18, pop ? 2600 : 1900, 1100, 'brush', pop ? .25 : .177, -.13, 410 + i * 4 + beat);
      if (pop) noise(music, when + .014, .082, 1900, 1300, 'brush', .155, .12, 203 + i + beat);
      glide(music, when, .095, pop ? 430 : 315, pop ? 245 : 190, .012, .028, pop ? .07 : .05, -.11);
    }
    const offbeat = pop ? .5 : .60;
    for (let beat = 0; beat < 4; beat++) {
      const seed = 1049 + i * 113 + beat * 47;
      noise(music, at(i, beat + offbeat), .092, pop ? 4000 : 3000, 1850, 'brush', beat % 2 ? .117 : .144, .26, seed);
      if (lift || (build && beat < phrase + 1)) noise(music, at(i, beat + .80), .052, 2800, 1550, 'brush', .082, -.2, seed + 9);
    }
    // A's wooden offbeats answer the bass. B's lightly rolled, swung stabs leave longer rests.
    if (pop) {
      const beats = lift || chorus || (build && phrase > 0) ? [.5, 1.5, 2.5, 3.5] : [.5, 2.5];
      beats.forEach((beat, k) => note(music, voice, at(i, beat), .34, tones[(k + i) % tones.length], .114, .30));
    } else {
      for (const beat of lift || chorus ? [.63, 1.63, 3.1] : [.63, 2.63]) {
        tones.forEach((midi, v) => note(music, 'keys', at(i, beat) + v * .007, .45, midi, .072, spread(v)));
      }
    }
    const melody = score.melody[label]?.[phrase];
    for (const [beat, midi, beats] of melody ?? []) {
      const when = at(i, beat), length = BEAT * beats + .09;
      note(music, voice, when, length, midi, chorus ? .242 : .203, -.13);
      if (chorus || (build && phrase === 2)) note(music, voice, when + .013, length, midi - 12, .063, .31);
    }
  }
  return { music, chords };
}

function gesture(variant, cue, length) {
  const sound = stereo(length), score = scores[variant], pop = variant === 'a';
  const { kind, n } = cue;
  const voice = pop ? 'mallet' : 'keys', seed = 9603 + 41 * n;
  const tap = () => glide(sound, 0, .055, 1030, 540, .008, .014, .080, -.06);
  if (tapped.has(kind)) tap();
  switch (kind) {
    case 'tap': tap(); break;
    case 'build':
      [0, 1, 2, 3].forEach((step) => note(sound, 'mallet', step * .047, .23, score.chips[step], .15 - .014 * step, -.21 + step * .14));
      noise(sound, 0, .19, 740, 3200, 'rise', .14, .2, seed);
      break;
    case 'whoosh': {
      const up = cue.dir === 'up';
      noise(sound, 0, length, up ? 670 : 2300, up ? 2300 : 630, 'wind', .095, up ? .26 : -.26, seed);
      break;
    }
    case 'chip': note(sound, 'mallet', 0, .21, score.chips[n], .122, -.24 + n * .12); break;
    case 'swap':
      noise(sound, 0, .145, 760 + n * 220, 1760 + n * 300, 'wind', .16, n % 2 ? -.3 : .3, seed);
      glide(sound, 0, .10, 650 + n * 95, 830 + n * 115, .035, .035, .047, .09);
      break;
    case 'move': glide(sound, 0, .095, 480 - n * 35, 285 - n * 25, .017, .026, .128, -.14); break;
    case 'delete': {
      const low = pop ? 57 : 58;
      glide(sound, 0, .24, hz(low + 7), hz(low), .066, .092, .207, -.1);
      break;
    }
    case 'expand':
      note(sound, voice, 0, .16, score.chips[0] - 12, .093, -.08);
      note(sound, voice, .050, .17, score.chips[1], .081, .14);
      break;
    case 'undo': {
      const low = pop ? 69 : 70;
      note(sound, 'mallet', 0, .28, low, .175, -.12);
      note(sound, 'mallet', .072, .33, low + 7, .178, .16);
      break;
    }
    case 'cut':
      note(sound, 'mallet', 0, .115, score.chips[[0, 2, 1, 3][n % 4]] - 12, .144, n % 2 ? .17 : -.17);
      noise(sound, 0, .057, 2300, 1100, 'brush', .11, .06, seed);
      break;
    case 'open':
      glide(sound, 0, .13, 420, 750, .043, .043, .112, .13);
      break;
    case 'key': glide(sound, 0, .033, 715 + 31 * (n % 4), 470, .006, .008, .032, .10 * ((n % 3) - 1)); break;
    case 'end': {
      const [root, tones] = score.voicings[score.changes.at(-1)];
      note(sound, voice, 0, .74, root + 24, .182);
      tones.forEach((midi, v) => note(sound, voice, .013 * v, .85, midi, .135, (v - 2) * .15));
      break;
    }
    default: throw new Error('未知の効果音: ' + kind);
  }
  return sound;
}

const gestureLengths = { tap: .055, build: .39, chip: .21, swap: .145, move: .095,
  delete: .24, expand: .22, undo: .41, cut: .115, open: .13, key: .033, end: .91 };

export function renderMix(variant, cues) {
  const { music: mix, chords } = accompaniment(variant);
  // Let the accompaniment take a small breath before the highlighted gestures.
  for (const cue of cues.filter((c) => majorGestures.has(c.kind))) {
    const frame = Math.round(cue.at * RATE);
    for (let i = Math.max(0, frame - .13 * RATE); i < Math.min(FRAMES, frame + .012 * RATE); i++) {
      const t = (i - frame) / RATE;
      const depth = Math.max(0, Math.min(1, (t + .13) / .055, (.012 - t) / .025));
      mix[i * 2] *= 1 - .31 * depth;
      mix[i * 2 + 1] *= 1 - .31 * depth;
    }
  }
  const stems = cues.map((cue, index) => {
    let length = gestureLengths[cue.kind];
    if (cue.kind === 'whoosh') {
      const scroll = ACTIONS.find((a) => a.type === 'scroll' && a.cue?.dir === cue.dir);
      const next = cues.slice(index + 1).find((c) => c.kind === 'whoosh' && c.at > cue.at);
      length = Math.min(scroll.over, (next?.at ?? DURATION_SECONDS) - cue.at);
    }
    const samples = gesture(variant, cue, length);
    const first = Math.round(cue.at * RATE);
    const count = Math.min(samples.length, mix.length - 2 * first);
    for (let i = 0; i < count; i++) mix[first * 2 + i] += samples[i];
    return { cue, first, samples };
  });
  return { variant, title: scores[variant].title, key: scores[variant].key, bpm: BPM, bars: BARS, fps: FPS, chords, mix, stems };
}

export function edgeGain(frame) {
  if (frame < .008 * RATE) return Math.sin(Math.PI / 2 * frame / (.008 * RATE)) ** 2;
  const left = FRAMES - 1 - frame;
  return left < FADE * RATE ? Math.sin(Math.PI / 2 * left / (FADE * RATE)) ** 2 : 1;
}

// Unity slope below the knee, smooth peak protection above. This has zero latency.
export function pcm16(value, gain) {
  const x = value * gain, magnitude = Math.abs(x);
  const limited = magnitude <= .58 ? x : Math.sign(x) * (.58 + .175 * Math.tanh((magnitude - .58) / .175));
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
  block.write(tag); block.writeUInt32LE(data.length, 4); data.copy(block, 8);
  return block;
}

function wav(pcm, recipe) {
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1); format.writeUInt16LE(2, 2); format.writeUInt32LE(RATE, 4);
  format.writeUInt32LE(RATE * 4, 8); format.writeUInt16LE(4, 12); format.writeUInt16LE(16, 14);
  const chunks = [chunk('fmt ', format), chunk('data', pcm)];
  // A standard INFO comment lets verification recover captured timings and gain
  // from a standalone WAV even after audio-report.json has been moved or deleted.
  if (recipe) {
    const comment = chunk('ICMT', Buffer.from(JSON.stringify(recipe) + '\0'));
    chunks.push(chunk('LIST', Buffer.concat([Buffer.from('INFO'), comment])));
  }
  return chunk('RIFF', Buffer.concat([Buffer.from('WAVE'), ...chunks]));
}

export function media(tool, args, input) {
  const homebrew = '/opt/homebrew/bin/' + tool;
  const binary = process.env[tool.toUpperCase()] || (existsSync(homebrew) ? homebrew : tool);
  const r = spawnSync(binary, args, { input, maxBuffer: 32 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(tool + ': ' + r.stderr.toString().trim());
  return r;
}

export function loudness(source) {
  const input = Buffer.isBuffer(source) ? source : undefined;
  const { stderr } = media('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', '-i', input ? 'pipe:0' : source,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], input);
  const data = JSON.parse(stderr.toString().match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? 'null');
  if (!data || !Number.isFinite(Number(data.input_i))) throw new Error('ラウドネスを測定できません');
  return { integratedLufs: Number(data.input_i), truePeakDbtp: Number(data.input_tp), loudnessRangeLu: Number(data.input_lra) };
}

function encode(dir, arrangement, externalCues) {
  const { variant, mix, stems } = arrangement;
  let gain = 1;
  for (let pass = 0; pass < 5; pass++) {
    const pcm = pcmBuffer(mix, gain);
    const m = loudness(wav(pcm));
    if (Math.abs(m.integratedLufs - TARGET_LUFS) <= .18 && m.truePeakDbtp <= -1.6) {
      const recipe = { variant, gain, cueSource: externalCues ? 'override' : 'timeline' };
      if (externalCues) recipe.cues = stems.map((s) => s.cue);
      const file = join(dir, 'bgm_' + variant + '.wav');
      writeFileSync(file, wav(pcm, recipe));
      media('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', file, '-map_metadata', '-1',
        '-c:a', 'libmp3lame', '-b:a', '320k', '-write_xing', '1', join(dir, 'bgm_' + variant + '.mp3')]);
      return;
    }
    gain *= 10 ** ((TARGET_LUFS - m.integratedLufs) / 20);
  }
  throw new Error('マスタリングが目標値に収まりません');
}

async function main() {
  const { dir, variant, cueFile } = cliOptions('a');
  const arrangement = renderMix(variant, loadCues(cueFile));
  // Both entry points measure the finished files with the same verifier.
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
