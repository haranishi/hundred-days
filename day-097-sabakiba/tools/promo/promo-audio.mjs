// Day097「さばき場」. All oscillators, noise, envelopes, mixing and mastering run in Node.
// The picture owns the bar lines and UI gestures. No samples or borrowed melodies.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BAR, BARS, BEAT, BPM, CUES, DURATION_SECONDS, FPS, STORYBOARD, at, bar } from './timeline.mjs';

export const RATE = 48_000;
export const FRAMES = Math.round(DURATION_SECONDS * RATE);
export const FADE = 1.5;
export const TARGET_LUFS = -16;
const TAU = 2 * Math.PI;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const stereo = (seconds) => new Float32Array(Math.ceil(seconds * RATE) * 2);
const majorGestures = new Set(['build', 'chime', 'end']);
const dropAt = STORYBOARD.find((s) => s.music === 'drop').start;

// Each voicing is [bass MIDI, upper voices]. The last chord is tied across two bars.
const scores = {
  a: {
    title: '台所の朝', key: 'F major',
    voicings: {
      C7sus4: [36, [60, 65, 67, 70]], F6: [41, [60, 65, 69, 74]],
      Am7: [45, [60, 64, 67, 69]], 'B♭add9': [46, [60, 62, 65, 70]],
      Gm7: [43, [58, 62, 65, 67]], C7: [36, [58, 64, 67, 72]],
      'B♭maj7': [46, [62, 65, 69, 70]], Dm7: [38, [60, 65, 69, 74]],
      'F6/9': [41, [62, 67, 69, 72]],
    },
    changes: ['C7sus4', 'F6', 'Am7', 'B♭add9', 'Gm7', 'C7', 'B♭maj7', 'C7', 'Dm7', 'F6', 'B♭add9', 'Gm7', 'C7', 'F6/9', 'F6/9'],
    cuts: [65, 67, 69, 70, 72, 74, 76, 77], chime: [70, 74, 77],
    // Bar number -> [beat, MIDI, duration in beats]. The cuts carry the tune in bars 6–7.
    melody: {
      1: [[.75, 72, .45], [1.25, 69, .95], [3, 65, .63]],
      2: [[1.75, 64, .45], [2.5, 67, .55], [3.25, 69, .5]],
      3: [[.75, 70, .85], [2.5, 65, .7]],
      4: [[0, 74, .85], [1.25, 70, .45], [2, 67, .9]],
      5: [[.75, 67, .5], [1.5, 64, .7], [3, 70, .45], [3.625, 72, .3]],
      8: [[1.25, 65, .42], [2.25, 69, .38], [2.875, 72, .42], [3.5, 74, .38]],
      9: [[0, 77, .7], [.875, 72, .42], [1.5, 69, .82], [2.75, 72, 1]],
      10: [[0, 74, .78], [3, 72, .65]],
      11: [[0, 74, 1], [1.25, 70, .48], [2.75, 67, .85]],
      12: [[0, 67, .6], [1, 70, .45], [1.75, 72, .64], [3, 76, .68]],
    },
  },
  b: {
    title: 'まな板のリズム', key: 'B♭ major',
    voicings: {
      F9sus4: [41, [55, 58, 60, 63]], 'B♭maj9': [34, [57, 60, 62, 65]],
      Dm7: [38, [53, 57, 60, 62]], Gm9: [43, [53, 57, 58, 62]],
      'E♭maj7': [39, [55, 58, 62, 67]], Cm7: [36, [55, 58, 60, 63]],
      F13: [41, [55, 57, 62, 63]], 'B♭6/9': [34, [55, 60, 62, 65]],
    },
    changes: ['F9sus4', 'B♭maj9', 'Dm7', 'Gm9', 'E♭maj7', 'Cm7', 'Gm9', 'F13', 'F9sus4', 'E♭maj7', 'B♭maj9', 'Cm7', 'F13', 'B♭6/9', 'B♭6/9'],
    cuts: [58, 60, 62, 63, 65, 67, 69, 70], chime: [74, 77, 82],
    melody: {
      1: [[1, 65, 1.12], [2.667, 72, .52], [3.333, 70, .47]],
      2: [[.667, 69, 1.55], [3, 65, .65]],
      3: [[1, 62, .8], [2.333, 67, 1.35]],
      4: [[.667, 67, 1.5], [2.667, 74, .6], [3.333, 70, .5]],
      5: [[0, 67, 1.6], [2.667, 63, .6], [3.667, 65, .3]],
      8: [[1.333, 63, .7], [2.667, 65, .42], [3.333, 67, .55]],
      9: [[.333, 70, 1.5], [2.333, 79, .6], [3.333, 77, .55]],
      10: [[0, 72, .92], [3.333, 69, .5]],
      11: [[.333, 67, 1.52], [2.333, 75, .6], [3.333, 72, .55]],
      12: [[0, 69, 1.3], [2, 67, .8], [3, 65, .8]],
    },
  },
};

export function cliOptions(defaultVariant) {
  const { values } = parseArgs({ options: {
    variant: { type: 'string', default: defaultVariant }, 'out-dir': { type: 'string' }, cues: { type: 'string' },
  } });
  if (values.variant !== undefined && !Object.hasOwn(scores, values.variant)) throw new Error('--variant は a または b');
  const defaultDir = join(tmpdir(), 'day097-promo', 'audio');
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
    const indexed = templates[0].n !== undefined;
    const n = cue.n === undefined ? (indexed ? template?.n : 0) : cue.n;
    if (!Number.isSafeInteger(n) || (indexed ? !templates.some((c) => c.n === n) : n !== 0)) {
      throw new Error(cue.kind + ' の n が範囲外です');
    }
    if (cue.kind !== 'whoosh') return { at: cue.at, kind: cue.kind, n };
    const dir = cue.dir === undefined ? (template?.dir ?? 'up') : cue.dir;
    if (dir !== 'up' && dir !== 'down') throw new Error('whoosh の dir は up または down');
    return { at: cue.at, kind: cue.kind, n, dir };
  });
}

export function loadCues(arg) {
  if (arg === undefined) return normalizeCues(CUES);
  const inline = arg.trimStart();
  const json = inline.startsWith('{') || inline.startsWith('[') ? inline : readFileSync(arg, 'utf8');
  const data = JSON.parse(json);
  return normalizeCues(Array.isArray(data) ? data : data?.cues);
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
  if (voice === 'uke') {
    // Nylon string: the upper modes damp much faster than the body of the note.
    paint(bus, start, length, gain, pan, .0022, .024, (t) => {
      const p = w * t + .12 * (1 - Math.exp(-45 * t));
      return .73 * Math.sin(p) * Math.exp(-7.4 * t)
        + .36 * Math.sin(2 * p) * Math.exp(-14 * t) + .23 * Math.sin(3 * p) * Math.exp(-21 * t)
        + .15 * Math.sin(5 * p) * Math.exp(-42 * t) + .08 * Math.sin(8 * p) * Math.exp(-68 * t);
    });
  } else if (voice === 'pad') {
    paint(bus, start, length, gain, pan, .09, .17, (t) =>
      (.79 * Math.sin(w * t) + .16 * Math.sin(w * 1.0016 * t) + .05 * Math.sin(w * 2 * t)) * Math.exp(-.13 * t));
  } else if (voice === 'mallet') {
    paint(bus, start, length, gain, pan, .003, .035, (t) =>
      .94 * Math.sin(w * t) * Math.exp(-5.8 * t) + .27 * Math.sin(w * 3.99 * t) * Math.exp(-23 * t)
      + .09 * Math.sin(w * 9.93 * t) * Math.exp(-43 * t));
  } else if (voice === 'keys') {
    paint(bus, start, length, gain, pan, .009, .10, (t) => {
      const p = w * t, tine = .79 * Math.exp(-5.6 * t) * Math.sin(1.001 * p);
      return (.83 * Math.sin(p + tine) + .17 * Math.sin(2.002 * p) * Math.exp(-3.8 * t))
        * Math.exp(-1.85 * t) * (.955 + .045 * Math.cos(TAU * 4.1 * t + pan));
    });
  } else if (voice === 'bell') {
    paint(bus, start, length, gain, pan, .0035, .11, (t) =>
      Math.sin(w * t) * Math.exp(-4.9 * t) + .21 * Math.sin(w * 2.01 * t) * Math.exp(-9 * t)
      + .12 * Math.sin(w * 4.18 * t) * Math.exp(-17 * t));
  } else if (voice === 'bass' || voice === 'roundBass') {
    const round = voice === 'roundBass';
    paint(bus, start, length, gain, pan, round ? .012 : .006, .065, (t) => Math.exp(-(round ? 1.15 : 1.85) * t) *
      (.86 * Math.sin(w * t) + (round ? .16 : .30) * Math.sin(2 * w * t) * Math.exp(-2.2 * t)
      + (round ? .06 : .14) * Math.sin(3 * w * t) * Math.exp(-5.5 * t)));
  } else {
    throw new Error('未知の楽器: ' + voice);
  }
}

function chord(bus, voice, start, length, tones, gain, sweep = 0) {
  tones.forEach((midi, v) => {
    const delay = sweep >= 0 ? sweep * v : -sweep * (tones.length - 1 - v);
    note(bus, voice, start + delay, length - delay, midi, gain, (v - (tones.length - 1) / 2) * .22);
  });
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

function rhythm(music, variant, i, section, root) {
  const morning = variant === 'a', chorus = section === 'chorus', lift = section === 'lift';
  const beatAt = (beat) => at(i, beat);
  const livelyBar = chorus && i % 2 === 1;
  const kicks = morning ? (livelyBar ? [0, 1.5, 2.75] : [0, 2.5])
    : (livelyBar ? [0, 1.667, 3.333] : [0, 2.667]);
  for (const beat of kicks) {
    const gain = section === 'drop' && beat === 0 ? .50 : beat === 0 ? .36 : .26;
    glide(music, beatAt(beat), morning ? .21 : .25, morning ? 142 : 106, morning ? 57 : 51, .023, .082, gain);
  }
  const bass = morning ? [[0, 0, 1.28], [1.75, 7, .42], [2.5, 0, .87]]
    : [[0, 0, 1.83], [2.333, 7, .65], [3.333, 0, .59]];
  for (const [beat, interval, beats] of bass) {
    note(music, morning ? 'bass' : 'roundBass', beatAt(beat), beats * BEAT, root + interval, interval ? .17 : .27);
  }

  const seed = 9707 + 89 * i;
  if (morning) {
    // A single light clap in the eight-fish montage leaves each mallet attack clear.
    for (const beat of lift ? [3.5] : [1, 3.5]) {
      const when = beatAt(beat);
      noise(music, when, .095, 4100, 1550, 'brush', .26, -.14, seed + beat * 8);
      noise(music, when + .012, .069, 3000, 1450, 'brush', .19, .17, seed + beat * 12);
      glide(music, when, .054, 550, 310, .011, .018, .058);
    }
    for (const beat of chorus || section === 'build' ? [.5, 2.25, 3.25] : [.5, 2.25]) {
      noise(music, beatAt(beat), .068, 5900, 2400, 'brush', .14, .29, seed + beat * 16);
    }
  } else {
    // Swung wire swishes and a much shorter brush stroke on the backbeat.
    for (const beat of [1.04, 3.04]) {
      noise(music, beatAt(beat), .19, 3350, 1400, 'brush', .22, -.18, seed + beat * 100);
      glide(music, beatAt(beat), .074, 282, 161, .022, .026, .05, -.08);
    }
    for (const beat of lift ? [.667] : [.667, 2.333]) {
      noise(music, beatAt(beat), .235, 1550, 5100, 'wind', .14, .27, seed + beat * 1000);
    }
  }
}

function accompaniment(variant) {
  const score = scores[variant], morning = variant === 'a';
  const music = stereo(DURATION_SECONDS), chords = [];
  for (let i = 0; i < BARS; i++) {
    const start = bar(i), scene = STORYBOARD.find((s) => start >= s.start && start < s.end);
    const section = scene.music, name = score.changes[i], [root, tones] = score.voicings[name];
    chords.push({ at: start, scene: section, name, bassMidi: root, upperMidi: tones });
    if (section === 'intro') {
      chord(music, 'pad', start, BAR, tones, morning ? .023 : .021);
      const voice = morning ? 'uke' : 'keys';
      note(music, voice, start, .57, morning ? 67 : 65, .135, -.17);
      note(music, voice, start + .56, .38, morning ? 72 : 67, .078, .16);
      continue;
    }
    if (section === 'resolve') {
      if (start === scene.start) {
        const hold = scene.end - start;
        chord(music, 'pad', start, hold, tones, morning ? .060 : .067);
        note(music, morning ? 'bass' : 'roundBass', start, hold, root, .23);
      }
      continue;
    }

    rhythm(music, variant, i, section, root);
    const lift = section === 'lift', chorus = section === 'chorus';
    if (morning) {
      const strums = lift ? [.5, 2.5] : chorus || section === 'groove2' ? [0, 1.5, 2.75, 3.5] : [0, 1.5, 2.75];
      strums.forEach((beat, k) => {
        chord(music, 'uke', at(i, beat), beat === 0 ? .36 : .23, tones, beat === 0 ? .105 : .080, k % 2 ? -.006 : .009);
      });
    } else {
      const comps = lift ? [[.667, .45], [2.667, .37]] : [[0, .80], [1.667, .42], [3, chorus ? .46 : .34]];
      for (const [beat, length] of comps) chord(music, 'keys', at(i, beat), length, tones, lift ? .063 : .090, .004);
    }
    if (chorus) chord(music, 'pad', start, BAR, tones, .029);
    for (const [beat, midi, beats] of score.melody[i] ?? []) {
      note(music, morning ? 'mallet' : 'keys', at(i, beat), BEAT * beats, midi, chorus ? .235 : .185, -.17);
      if (chorus) note(music, morning ? 'uke' : 'keys', at(i, beat) + .012, BEAT * beats, midi - 12, .063, .26);
    }
  }
  return { music, chords };
}

const gestureLengths = { tap: .047, whoosh: .40, shimmer: .65, ping: .28, flip: .16,
  cut: .27, label: .43, chime: .78, step: .085, end: 1.15 };

function gesture(variant, cue, length) {
  const sound = stereo(length), score = scores[variant], morning = variant === 'a';
  const { kind, n = 0 } = cue, scale = score.cuts, seed = 9757 + 53 * n;
  switch (kind) {
    // View, x-ray, mirror and labels have their own simultaneous tap in CUES.
    // "Next" has only a step; the tuned contact below is its whole click.
    case 'tap':
    case 'step': {
      const isStep = kind === 'step';
      const frequency = isStep ? hz(scale[n] + 12) : 690;
      glide(sound, 0, length, frequency * 1.42, frequency, .006, isStep ? .021 : .011, isStep ? .12 : .092, -.07);
      noise(sound, 0, .024, 2800, 950, 'brush', .086, .08, seed);
      break;
    }
    case 'build': {
      const low = hz(morning ? 60 : 53), high = low * 1.5;
      paint(sound, 0, length, .153, -.06, .004, .016, (t) => {
        const u = t / length;
        const phase = TAU * (low * t + (high - low) * t * u / 2);
        return (.39 + .61 * u * u) * (Math.sin(phase) + .14 * Math.sin(2 * phase));
      });
      noise(sound, 0, length, 520, 4100, 'rise', .24, .20, seed);
      break;
    }
    case 'whoosh': {
      const up = cue.dir === 'up', from = up ? 620 : 3400, to = up ? 3400 : 620, pan = up ? .42 : -.42;
      noise(sound, 0, length, from, to, 'wind', .22, -pan, seed);
      noise(sound, length * .19, length * .81, from, to, 'wind', .16, pan, seed + 1);
      break;
    }
    case 'shimmer':
      [scale[0], scale[2], scale[4]].forEach((midi, v) =>
        note(sound, 'bell', v * .012, length - v * .012, midi + 24, .105 - v * .018, -.29 + .29 * v));
      break;
    case 'ping':
      note(sound, 'bell', 0, length, scale[4] + 12, .133, .12);
      break;
    case 'flip': {
      const low = hz(scale[1]), span = 1.65 * low;
      paint(sound, 0, length, .128, .10, .002, .029, (t) => {
        // Integrate a half-sine pitch curve: low -> high -> low in one continuous sweep.
        const cycles = low * t + span * length / Math.PI * (1 - Math.cos(Math.PI * t / length));
        return Math.sin(TAU * cycles) * Math.exp(-6 * t);
      });
      break;
    }
    case 'cut':
      note(sound, morning ? 'mallet' : 'uke', 0, length, scale[n], morning ? .275 : .31, -.22 + n * .06);
      break;
    case 'label':
      note(sound, 'keys', 0, .22, scale[2], .133, -.19);
      note(sound, 'keys', .115, length - .115, scale[4], .114, .16);
      break;
    case 'chime':
      score.chime.forEach((midi, v) => {
        const start = [0, .092, .205][v];
        note(sound, 'bell', start, length - start, midi, .31 - .025 * v, -.22 + .22 * v);
      });
      break;
    case 'end': {
      const [root, tones] = score.voicings[score.changes.at(-1)];
      chord(sound, morning ? 'uke' : 'keys', 0, length, tones, morning ? .18 : .165, morning ? .008 : .004);
      note(sound, morning ? 'mallet' : 'keys', 0, .82, root + 24, .21, -.09);
      break;
    }
    default: throw new Error('未知の効果音: ' + kind);
  }
  return sound;
}

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
  const stems = cues.map((cue) => {
    // The storyboard gives the rise its start and the downbeat its landing.
    const length = cue.kind === 'build' ? Math.min(1, dropAt > cue.at ? dropAt - cue.at : .5) : gestureLengths[cue.kind];
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
