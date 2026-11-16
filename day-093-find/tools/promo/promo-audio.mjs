/* Day093 find: deterministic, sample-free Node synthesis (two original variants, 96 BPM, 32 s).
 * A「クローゼット・ポップ」: D major, warm FM electric piano, bright detuned synth pluck lead, punchy sub-bass, tight electronic drums.
 * B「ウィンドウ・ステップ」: Bb major, soft Rhodes-style EP, marimba/vibraphone lead, round walking bass, crisp shaker/clap groove.
 * Distinct melody motifs, keys, and tempo from Day088 (90 BPM C/G) and Day091 (102.9 BPM C/F).
 */
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BEAT, BPM, CARD_TIMES, DURATION_SECONDS, MUSIC_CUES, STORYBOARD, TAP_CUES } from './timeline.mjs';

export const SAMPLE_RATE = 48_000;
export const TARGET_LUFS = -16;
const FRAMES = Math.round(SAMPLE_RATE * DURATION_SECONDS);
const TAU = 2 * Math.PI;
const ffmpeg = process.env.FFMPEG || spawnSync('/bin/sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' }).stdout.trim() || 'ffmpeg';
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const makeBus = () => ({ l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) });
const sectionAt = (t) => STORYBOARD.find((s) => t >= s.start - 1e-9 && t < s.end - 1e-9)?.music ?? 'resolve';

// Chords on the 96 BPM beat grid (written in D major; B transposes down 4 semitones to Bb major).
// Beats: 0..4 intro, 4..8 build, 8..12 drop, 12..20 groove, 20..26 lift, 26..30 bridge, 30..38 chorus, 38..44 preend, 44..52 resolve.
const CHORDS = [
  [0, 'Dmaj7', 38, [62, 66, 69, 73]],
  [4, 'Bm7', 47, [59, 62, 66, 69]],
  [6, 'Asus4', 45, [57, 62, 64, 69]],
  [8, 'Gmaj7', 43, [62, 66, 67, 71]],
  [12, 'A6', 45, [61, 64, 66, 69]],
  [16, 'Bm7', 47, [62, 66, 69, 71]],
  [20, 'Gmaj7', 43, [62, 66, 67, 71]],
  [24, 'A7', 45, [61, 64, 67, 69]],
  [26, 'F#m7', 42, [61, 64, 66, 69]],
  [28, 'Gmaj7', 43, [62, 66, 67, 71]],
  [30, 'Dmaj9', 38, [62, 66, 69, 76]],
  [34, 'Bm7', 47, [62, 66, 69, 71]],
  [38, 'Gmaj7', 43, [62, 66, 67, 71]],
  [42, 'A9sus4', 45, [59, 62, 64, 69]],
  [44, 'Dadd9', 38, [62, 66, 69, 76]],
];
const LAST_BEAT = Math.ceil(DURATION_SECONDS / BEAT);
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const transposeName = (name, shift) =>
  name.replace(/[A-G][b#]?/g, (root) => {
    const base = NOTE_NAMES.indexOf(root.replace('#', ''));
    const off = root.includes('#') ? 1 : 0;
    return NOTE_NAMES[(base + off + shift + 12) % 12];
  });

export function createArrangement(variant = 'a') {
  if (!['a', 'b'].includes(variant)) throw new Error('--variant は a または b');
  const a = variant === 'a';
  const shift = a ? 0 : -4; // A = D major, B = Bb major
  const events = [];
  const add = (kind, start, duration, midi, gain, pan = 0, extra = {}) => {
    if (start >= DURATION_SECONDS || duration <= 0) return;
    events.push({ kind, start: +start.toFixed(6), duration, midi: midi + (midi ? shift : 0), gain, pan, ...extra });
  };
  const at = (b) => b * BEAT;
  const span = (c, i) => (CHORDS[i + 1]?.[0] ?? LAST_BEAT) - c[0];

  // Distinct melody motifs (D major reference before transposition):
  // A: crisp syncopated upward-arcing synth pluck phrase
  const motifA = [
    [0, 74, 0.45],
    [0.5, 78, 0.45],
    [1.0, 81, 0.65],
    [1.75, 83, 0.45],
    [2.5, 81, 0.5],
    [3.0, 78, 0.45],
    [3.5, 76, 0.45],
  ];
  // B: lyrical descending-step marimba phrase
  const motifB = [
    [0, 81, 0.5],
    [0.75, 78, 0.45],
    [1.25, 76, 0.45],
    [1.75, 78, 0.6],
    [2.5, 74, 0.55],
    [3.25, 83, 0.4],
    [3.65, 81, 0.35],
  ];
  const motif = a ? motifA : motifB;

  // Pads: subtle harmonic bed across every chord.
  CHORDS.forEach((c, i) => {
    const s = at(c[0]);
    const music = sectionAt(s + 0.01);
    const gain = music === 'build' ? 0.075 : music === 'resolve' ? 0.085 : music === 'intro' ? 0.055 : 0.05;
    c[3].forEach((midi, v) => add('pad', s, at(span(c, i)), midi, gain, (v - 1.5) * 0.28));
  });

  for (let b = 0; b < LAST_BEAT; b++) {
    const t = at(b);
    const music = sectionAt(t + 1e-6);
    const chord = CHORDS.findLast((c) => c[0] <= b);
    const [, , bassMidi, tones] = chord;
    const inBar = b % 4;

    if (music === 'intro') {
      // S0 hook: soft shimmer bell + light EP stabs, no drums/bass so the drop hits harder later.
      if (b === 0) {
        add('bell', t, 1.3, 81, 0.06, 0.2);
        add('bell', t + 0.22, 1.1, 86, 0.045, -0.2);
      }
      if (inBar === 0 || inBar === 2) {
        tones.forEach((midi, v) => add(a ? 'ep' : 'rhodes', t + (inBar === 2 ? 0.5 * BEAT : 0), 0.55, midi, a ? 0.09 : 0.1, (v - 1.5) * 0.25, { decay: 4 }));
      }
      if (b === 3) add('bell', t + 0.5 * BEAT, 0.7, 78, 0.04, 0.15);
      continue;
    }

    if (music === 'build') {
      // S1 cards: soft clock tick on beats 4..7, quiet so the drop creates >= 3dB jump.
      add('tick', t, 0.05, 0, inBar % 2 ? 0.065 : 0.085, inBar % 2 ? 0.25 : -0.25);
      continue;
    }

    if (music === 'resolve') {
      if (t > MUSIC_CUES.endChordAt + 0.01) continue;
      tones.forEach((midi, v) => add(a ? 'ep' : 'rhodes', t + v * 0.035, 2.8, midi, a ? 0.15 : 0.17, (v - 1.5) * 0.25, { decay: 1.25 }));
      add(a ? 'subbass' : 'walkbass', t, 3.0, bassMidi, a ? 0.17 : 0.18);
      add('bell', t, 2.6, 86, 0.08, 0.22);
      add('bell', t + 0.09, 2.4, 90, 0.06, -0.22);
      add('kick', t, 0.4, 0, 0.22);
      add('crash', t, 1.8, 0, 0.085);
      continue;
    }

    const active = ['drop', 'groove', 'lift', 'bridge', 'chorus', 'preend'].includes(music);
    if (!active) continue;
    const isChorus = music === 'chorus';
    const isLift = music === 'lift' || isChorus;
    const isPreend = music === 'preend';
    // Pull back on beat 43 (right before the end chord at beat 44) so endChord has a clear >=3dB rise.
    const isPreEndBreath = b === 43;
    const level = isChorus ? 1.15 : music === 'drop' ? 1.08 : isPreend ? 0.88 : 1.0;

    if (isPreEndBreath) {
      // Gentle breath before the final chord: soft EP only.
      tones.forEach((midi, v) => add(a ? 'ep' : 'rhodes', t, 0.35, midi, 0.05, (v - 1.5) * 0.2, { decay: 6 }));
      continue;
    }

    // Chords: A syncopated upbeat stabs, B soulful offbeat + downbeat Rhodes.
    for (const off of a ? [0, 0.75, 2.0, 2.75] : [0, 1.5, 3.0]) {
      if (inBar === Math.floor(off)) {
        tones.forEach((midi, v) =>
          add(a ? 'ep' : 'rhodes', t + (off % 1) * BEAT + (a ? 0 : v * 0.01), a ? 0.28 : 0.45, midi, (a ? 0.085 : 0.095) * level, (v - 1.5) * 0.26, { decay: a ? 6 : 3.5 }),
        );
      }
    }

    // Lead motif on bar starts (and half-bar pickup for bridge/chorus).
    if ((inBar === 0 || (b === 30)) && !isPreend) {
      const barIdx = Math.floor(b / 4);
      for (const [nb, midi, len] of motif) {
        if (t + nb * BEAT >= MUSIC_CUES.preendAt - 0.05) continue;
        const alt = barIdx % 2 && nb === motif.at(-1)[0] ? 2 : 0;
        add(
          a ? 'pluck' : 'marimba',
          t + nb * BEAT,
          len * BEAT + 0.14,
          midi + alt + (isChorus && a ? 12 : 0),
          (isChorus ? 0.19 : 0.145) * level * (a ? 0.85 : 1),
          a ? -0.14 : 0.16,
          { decay: a ? 4.2 : 0 },
        );
        if (isChorus && !a) {
          add('bell', t + nb * BEAT, len * BEAT, midi + 12, 0.028, -0.32);
        }
      }
    }

    // Lift & chorus shimmer arpeggio.
    if (isLift) {
      for (let k = 0; k < 4; k++) {
        add(a ? 'pluck' : 'bell', t + (k * BEAT) / 4, BEAT / 4 + 0.05, tones[(inBar * 4 + k) % 4] + 12, a ? 0.025 : 0.022, k % 2 ? 0.35 : -0.35, { decay: 12 });
      }
    }

    // Bass groove.
    const bassPattern = a
      ? [[0, 0, 0.8], [0.75, 0, 0.5], [1.5, 7, 0.45], [2.0, 0, 0.8], [3.5, 12, 0.4]]
      : [[0, 0, 1.1], [1.0, 7, 0.7], [2.0, 4, 0.9], [3.0, 7, 0.8]];
    for (const [nb, interval, len] of bassPattern) {
      if (inBar === Math.floor(nb)) {
        add(a ? 'subbass' : 'walkbass', t + (nb % 1) * BEAT, len * BEAT, bassMidi + interval, (a ? 0.135 : 0.145) * level);
      }
    }

    // Drums: 4-on-the-floor pop kick for A, syncopated 1 & 2-and & 3 for B.
    if (a) {
      add('kick', t, 0.28, 0, (inBar === 0 || inBar === 2 ? 0.21 : 0.16) * level);
    } else {
      if (inBar === 0 || inBar === 2) add('kick', t, 0.3, 0, 0.21 * level);
      if (inBar === 1 && isLift) add('kick', t + 0.5 * BEAT, 0.25, 0, 0.14 * level);
    }
    if (inBar === 1 || inBar === 3) add('clap', t, 0.22, 0, (a ? 0.115 : 0.1) * level, -0.05);
    const hatCount = isLift ? 4 : 2;
    for (let k = 0; k < hatCount; k++) {
      const off = (k * BEAT) / hatCount + (!a && k % 2 ? 0.018 : 0);
      add('tick', t + off, 0.05, 0, (k % 2 ? 0.065 : 0.045) * (isLift ? 0.85 : 1) * (a ? 1.2 : 1), k % 2 ? 0.3 : -0.3);
    }
  }

  // S1 riser into bar 2 drop, drop impact, chorus crash.
  add('swell', MUSIC_CUES.buildAt, MUSIC_CUES.dropAt - MUSIC_CUES.buildAt, 0, 0.095);
  add('kick', MUSIC_CUES.dropAt, 0.4, 0, 0.24);
  add('crash', MUSIC_CUES.dropAt, 1.3, 0, 0.13);
  add(a ? 'subbass' : 'walkbass', MUSIC_CUES.dropAt, 0.6, 38 + shift, 0.08);
  add('crash', MUSIC_CUES.chorusAt, 1.0, 0, 0.085);

  // Storyboard card pops & UI tap ticks.
  CARD_TIMES.forEach((cue, k) => add('pon', cue, 0.22, [74, 78, 81][k % 3], 0.075, k % 2 ? 0.25 : -0.25));
  for (const cue of TAP_CUES) add('tap', cue, 0.06, 86, 0.042);

  events.sort((x, y) => x.start - y.start);
  return {
    variant,
    title: a ? 'クローゼット・ポップ' : 'ウィンドウ・ステップ',
    key: a ? 'D major' : 'Bb major',
    bpm: +BPM.toFixed(3),
    chords: CHORDS.map((c) => ({ at: +(c[0] * BEAT).toFixed(3), name: transposeName(c[1], shift) })),
    tapCues: TAP_CUES,
    cardCues: CARD_TIMES,
    events,
  };
}

function randomFactory(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function synthesize(arrangement) {
  const buses = Object.fromEntries(['pad', 'lead', 'bass', 'drums', 'fx'].map((n) => [n, makeBus()]));
  const random = randomFactory(arrangement.variant === 'a' ? 0x93a : 0x93b);
  for (const e of arrangement.events) {
    const busName =
      e.kind === 'pad' || e.kind === 'swell' ? 'pad'
      : e.kind === 'subbass' || e.kind === 'walkbass' ? 'bass'
      : ['kick', 'clap', 'tick', 'crash'].includes(e.kind) ? 'drums'
      : ['tap', 'pon'].includes(e.kind) ? 'fx' : 'lead';
    const bus = buses[busName];
    const gl = Math.cos(((e.pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((e.pan + 1) * Math.PI) / 4);
    const f = hz(e.midi);
    const first = Math.max(0, Math.round(e.start * SAMPLE_RATE));
    const last = Math.min(FRAMES, Math.round((e.start + e.duration) * SAMPLE_RATE));
    let low = 0, band = 0, phase = 0;

    for (let i = first; i < last; i++) {
      const t = (i - first) / SAMPLE_RATE;
      const left = e.duration - t;
      const release = clamp(left / 0.03);
      let s = 0;
      switch (e.kind) {
        case 'pluck': {
          // Bright filtered synth pluck with subtle detuned pair.
          const bright = Math.exp(-t * 9);
          const core = Math.sin(TAU * f * t) + 0.45 * Math.sin(TAU * f * 2 * t) * bright + 0.22 * Math.sin(TAU * f * 3 * t) * bright * bright;
          const detune = Math.sin(TAU * (f * 1.004) * t) * 0.35;
          s = (core + detune) * 0.55 * Math.exp(-t * (e.decay || 4)) * clamp(t / 0.002) * release;
          break;
        }
        case 'ep': {
          const mod = 1.45 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 4.5);
          s = (Math.sin(TAU * f * t + mod) + 0.15 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 3)) * Math.exp(-t * (e.decay || 2.5)) * clamp(t / 0.003) * release * 0.72;
          break;
        }
        case 'rhodes': {
          const tine = 0.28 * Math.sin(TAU * f * 4 * t) * Math.exp(-t * 14);
          s = (0.78 * Math.sin(TAU * f * t) + 0.22 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 3) + tine) * Math.exp(-t * (e.decay || 2.2)) * clamp(t / 0.004) * release * 0.75;
          break;
        }
        case 'marimba': {
          s = Math.sin(TAU * f * t) * Math.exp(-t * 3.4) + 0.32 * Math.sin(TAU * f * 3.98 * t) * Math.exp(-t * 12) + 0.08 * Math.sin(TAU * f * 9.1 * t) * Math.exp(-t * 28);
          s *= clamp(t / 0.002) * release * 0.72;
          break;
        }
        case 'bell': {
          const mod = Math.sin(TAU * f * 3.5 * t) * 1.9 * Math.exp(-t * 3.2);
          s = Math.sin(TAU * f * t + mod) * Math.exp(-t * (e.decay || 1.7)) * clamp(t / 0.002) * release * 0.58;
          break;
        }
        case 'pad': {
          const sub = f * 0.5 >= 125 ? 0.12 * Math.sin(TAU * f * 0.5 * t) : 0.12 * Math.sin(TAU * f * t);
          const soft = 0.62 * Math.sin(TAU * f * t + 0.28 * Math.sin(TAU * 0.35 * t)) + 0.24 * Math.sin(TAU * f * 2.002 * t) + sub;
          s = soft * Math.sin((clamp(t / 0.5) * Math.PI) / 2) * Math.sin((clamp(left / 0.45) * Math.PI) / 2);
          break;
        }
        case 'subbass': {
          const env = clamp(t / 0.005) * Math.exp(-t * 1.6) * release;
          s = (0.82 * Math.sin(TAU * f * t) + 0.22 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 7)) * env;
          break;
        }
        case 'walkbass': {
          const env = clamp(t / 0.006) * Math.exp(-t * 1.35) * release;
          s = (0.78 * Math.sin(TAU * f * t) + 0.2 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 5) + 0.07 * Math.sin(TAU * f * 3 * t) * Math.exp(-t * 11)) * env;
          break;
        }
        case 'kick': {
          phase += (50 + 68 * Math.exp(-t / 0.018)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / 0.105) * clamp(t / 0.002) * release;
          break;
        }
        case 'tap': {
          phase += (f + f * 0.14 * Math.exp(-t / 0.004)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / 0.012) * clamp(t / 0.0008) * release;
          break;
        }
        case 'pon': {
          phase += (f + f * 0.48 * Math.exp(-t / 0.01)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / 0.07) * clamp(t / 0.002) * release;
          break;
        }
        case 'tick':
        case 'swell':
        case 'crash':
        case 'clap': {
          const n = random() * 2 - 1;
          const centre =
            e.kind === 'swell' ? 580 * 2 ** ((3.2 * t) / e.duration)
            : e.kind === 'tick' ? 7600
            : e.kind === 'crash' ? 5600
            : 1650;
          const q = e.kind === 'clap' ? 1.05 : 0.7;
          const fc = 2 * Math.sin((Math.PI * Math.min(centre, 16000)) / SAMPLE_RATE);
          low += fc * band;
          const high = n - low - q * band;
          band += fc * high;
          let env;
          if (e.kind === 'tick') env = Math.exp(-t / 0.013) * clamp(t / 0.0008);
          else if (e.kind === 'swell') env = (t / e.duration) ** 2.2 * clamp(left / 0.05);
          else if (e.kind === 'crash') env = Math.exp(-t / 0.46) * clamp(t / 0.002) * release;
          else env = (t < 0.03 ? Math.exp(-(t % 0.01) / 0.0025) : Math.exp(-(t - 0.03) / 0.06)) * clamp(t / 0.0008) * release;
          s = band * env;
          break;
        }
        default:
          throw new Error(`unknown kind ${e.kind}`);
      }
      bus.l[i] += s * e.gain * gl;
      bus.r[i] += s * e.gain * gr;
    }
  }

  // Schroeder reverb on pad/lead/fx and light drums.
  const wet = makeBus();
  for (const ch of ['l', 'r']) {
    const send = new Float32Array(FRAMES);
    for (let i = 0; i < FRAMES; i++) {
      send[i] = buses.pad[ch][i] * 0.24 + buses.lead[ch][i] * 0.28 + buses.drums[ch][i] * 0.08 + buses.fx[ch][i] * 0.12;
    }
    let stage = new Float32Array(FRAMES);
    for (const size of [1297, 1453, 1601, 1777]) {
      const length = size + (ch === 'r' ? 29 : 0);
      const line = new Float32Array(length);
      const feedback = 10 ** ((-3 * length) / SAMPLE_RATE / 1.5);
      let damp = 0;
      for (let i = 0; i < FRAMES; i++) {
        const pos = i % length;
        const val = line[pos];
        stage[i] += val * 0.25;
        damp += (val - damp) * 0.35;
        line[pos] = send[i] + damp * feedback;
      }
    }
    for (const size of [225, 556]) {
      const length = size + (ch === 'r' ? 23 : 0);
      const line = new Float32Array(length);
      const next = new Float32Array(FRAMES);
      for (let i = 0; i < FRAMES; i++) {
        const pos = i % length;
        next[i] = line[pos] - stage[i];
        line[pos] = stage[i] + line[pos] * 0.5;
      }
      stage = next;
    }
    wet[ch] = stage;
  }

  const mix = makeBus();
  const fadeFrames = Math.round(MUSIC_CUES.fadeSeconds * SAMPLE_RATE);
  for (const ch of ['l', 'r']) {
    let prev = 0, hpv = 0;
    for (let i = 0; i < FRAMES; i++) {
      const t = i / SAMPLE_RATE;
      const raw = buses.pad[ch][i] + buses.lead[ch][i] + buses.bass[ch][i] + buses.drums[ch][i] + buses.fx[ch][i] + wet[ch][i] * 0.32;
      const build = t >= MUSIC_CUES.buildAt && t < MUSIC_CUES.dropAt;
      const sectionGain = build ? 0.72 : 1.0;
      hpv = raw - prev + Math.exp((-TAU * 30) / SAMPLE_RATE) * hpv;
      prev = raw;
      const left = FRAMES - 1 - i;
      const fade = left < fadeFrames ? Math.sin((clamp(left / fadeFrames) * Math.PI) / 2) ** 2 : 1;
      const fadeIn = Math.sin((clamp(i / (0.006 * SAMPLE_RATE)) * Math.PI) / 2) ** 2;
      mix[ch][i] = hpv * fade * fadeIn * sectionGain;
    }
  }
  return mix;
}

function limit(bus, gain, ceiling) {
  const look = Math.round(0.005 * SAMPLE_RATE);
  const rel = Math.exp(-1 / (0.08 * SAMPLE_RATE));
  const out = makeBus();
  const peak = new Float32Array(FRAMES);
  for (let i = 0; i < FRAMES; i++) peak[i] = Math.max(Math.abs(bus.l[i]), Math.abs(bus.r[i])) * gain;
  const need = new Float32Array(FRAMES);
  for (let i = 0; i < FRAMES; i++) {
    let m = 0;
    for (let k = i; k < Math.min(FRAMES, i + look); k++) m = Math.max(m, peak[k]);
    need[i] = m > ceiling ? ceiling / m : 1;
  }
  let g = 1, reduced = 0;
  for (let i = 0; i < FRAMES; i++) {
    g = need[i] < g ? need[i] : need[i] + (g - need[i]) * rel;
    if (g < 0.999) reduced++;
    out.l[i] = bus.l[i] * gain * g;
    out.r[i] = bus.r[i] * gain * g;
  }
  return { out, reducedPercent: (100 * reduced) / FRAMES };
}

export function wavBuffer(bus) {
  const buffer = Buffer.alloc(44 + FRAMES * 4);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(FRAMES * 4, 40);
  for (let i = 0; i < FRAMES; i++) {
    for (const [c, ch] of ['l', 'r'].entries()) {
      const v = bus[ch][i];
      if (!Number.isFinite(v) || Math.abs(v) >= 1) throw new Error(`PCM overflow at frame ${i}`);
      buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 4 + c * 2);
    }
  }
  return buffer;
}

export function measure(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-i', file, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) throw new Error(r.stderr);
  const match = r.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) throw new Error('loudnorm の測定値を読めません');
  const d = JSON.parse(match[0]);
  return { lufs: Number(d.input_i), truePeak: Number(d.input_tp), lra: Number(d.input_lra) };
}

function main() {
  const args = process.argv.slice(2);
  const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const variant = value('--variant', 'a');
  const dir = value('--out-dir', process.env.PROMO_OUT_DIR);
  if (!dir) throw new Error('使い方: promo-audio.mjs --variant a|b --out-dir <dir>');
  const out = join(resolve(dir), `bgm_${variant}.wav`);
  mkdirSync(dirname(out), { recursive: true });
  const arrangement = createArrangement(variant);
  const mix = synthesize(arrangement);
  let peak = 0;
  for (let i = 0; i < FRAMES; i++) peak = Math.max(peak, Math.abs(mix.l[i]), Math.abs(mix.r[i]));
  let gain = 0.25 / peak, ceiling = 10 ** (-2.2 / 20), result = null;
  const scratch = join(dirname(out), `.measure-${variant}-${process.pid}.wav`);
  try {
    for (let pass = 0; pass < 8; pass++) {
      const { out: limited, reducedPercent } = limit(mix, gain, ceiling);
      writeFileSync(scratch, wavBuffer(limited));
      const m = measure(scratch);
      result = { limited, m, reducedPercent, gain, ceilingDb: 20 * Math.log10(ceiling) };
      const lufsOk = Math.abs(m.lufs - TARGET_LUFS) <= 0.3, tpOk = m.truePeak <= -1.6;
      if (lufsOk && tpOk) break;
      if (!tpOk) ceiling *= 10 ** ((-1.7 - m.truePeak) / 20);
      if (!lufsOk) gain *= 10 ** ((TARGET_LUFS - m.lufs) / 20);
    }
  } finally {
    try { unlinkSync(scratch); } catch { /* none */ }
  }
  writeFileSync(out, wavBuffer(result.limited));
  const mp3 = out.replace(/\.wav$/, '.mp3');
  const enc = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-nostdin', '-i', out, '-c:a', 'libmp3lame', '-b:a', '192k', '-map_metadata', '-1', mp3], { encoding: 'utf8', timeout: 60000 });
  if (enc.status !== 0) throw new Error(`mp3 に書き出せません: ${enc.stderr}`);
  console.log(`${arrangement.title} / ${arrangement.key} / ${BPM.toFixed(2)} BPM / ${DURATION_SECONDS}.000秒 -> ${out}`);
  console.log(JSON.stringify({ lufs: result.m.lufs, truePeak: result.m.truePeak, lra: result.m.lra, limiterActivePercent: +result.reducedPercent.toFixed(2), ceilingDb: +result.ceilingDb.toFixed(2) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
