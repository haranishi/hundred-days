/* Day091 バーチャルオフィス: deterministic, sample-free Node synthesis (two variants).
 * A「ドットのオフィス」: C major, soft pulse-wave chords and lead, triangle bass (a nod to the pixel art).
 * B「あさのカフェ」: F major, FM electric piano, marimba lead, bells, a round sine bass.
 * Sections and every cue (the cards, the drop, the taps, the hush, the end chord) come from timeline.mjs.
 * ffmpeg only measures loudness and encodes; no recordings or samples are used.
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

// Chords on the beat grid: [first beat, name, bass, tones] (C major; B plays everything a fourth higher, in F major).
const CHORDS = [
  [0, 'Cmaj7', 36, [60, 64, 67, 71]], [4, 'Am7', 45, [57, 60, 64, 67]], [8, 'Fmaj7', 41, [57, 60, 64, 65]], [10, 'Gsus4', 43, [55, 60, 62, 67]],
  [12, 'C', 36, [60, 64, 67, 72]], [16, 'G6', 43, [59, 62, 67, 76]], [20, 'Am7', 45, [60, 64, 67, 69]], [24, 'Fadd9', 41, [57, 60, 65, 67]],
  [28, 'C/E', 40, [60, 64, 67, 72]], [32, 'Fmaj7', 41, [57, 60, 64, 65]], [36, 'G6', 43, [59, 62, 67, 76]], [40, 'Am7', 45, [60, 64, 67, 69]],
  [44, 'Fadd9', 41, [57, 60, 65, 67]], [46, 'Gsus4', 43, [55, 60, 62, 67]], [48, 'Cadd9', 36, [60, 64, 67, 74]],
];
const LAST_BEAT = Math.ceil(DURATION_SECONDS / BEAT);
// Chord names for the report, in the key that sounds (B is a fourth up, F major, so flats): Am7 -> Dm7, Fmaj7 -> Bbmaj7, C/E -> F/A.
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const transposeName = (name, up) => name.replace(/[A-G][b#]?/g, (root) => NOTE_NAMES[(NOTE_NAMES.indexOf(root.replace('#', '')) + (root.includes('#') ? 1 : 0) + up + 12) % 12]);

// The score, shared by the synthesis and the report.
export function createArrangement(variant = 'a') {
  if (!['a', 'b'].includes(variant)) throw new Error('--variant は a または b');
  const a = variant === 'a', up = a ? 0 : 5;
  const events = [];
  // Only pads start inside the hush (alone with the NPCs); a phrase that would run into it is cut there.
  const add = (kind, start, duration, midi, gain, pan = 0, extra = {}) => {
    if (start >= DURATION_SECONDS || duration <= 0 || (kind !== 'pad' && start >= MUSIC_CUES.hushAt - 1e-6 && start < MUSIC_CUES.endChordAt - 1e-6)) return;
    events.push({ kind, start: +start.toFixed(6), duration, midi: midi + (midi ? up : 0), gain, pan, ...extra });
  };
  const at = (b) => b * BEAT;
  const span = (c, i) => (CHORDS[i + 1]?.[0] ?? LAST_BEAT) - c[0];
  // Original six-note hooks (pentatonic, so they sit on every chord); the odd bars answer with a different last note.
  const motif = a ? [[0, 76, .5], [.5, 79, .5], [1, 81, .75], [2, 79, .5], [2.5, 76, .5], [3, 74, .75]]
    : [[0, 76, .5], [.75, 79, .5], [1.5, 81, .5], [2, 79, .75], [3, 76, .5], [3.5, 74, .5]];
  // Pads: one per chord, on their own bus (they carry the cards and the hush).
  CHORDS.forEach((c, i) => {
    const s = at(c[0]), music = sectionAt(s + 0.01);
    const gain = music === 'hush' ? .1 : music === 'build' ? .085 : music === 'resolve' ? .07 : music === 'intro' ? .045 : .05;
    c[3].forEach((midi, v) => add('pad', s, at(span(c, i)), midi, gain, (v - 1.5) * .3));
  });
  for (let b = 0; b < LAST_BEAT; b++) {
    const t = at(b), music = sectionAt(t + 1e-6), chord = CHORDS.findLast((c) => c[0] <= b), [, , bassMidi, tones] = chord, inBar = b % 4;
    const groove = ['drop', 'groove', 'lift', 'chorus'].includes(music), lift = music === 'lift' || music === 'chorus', chorus = music === 'chorus';
    const level = chorus ? 1.12 : 1;
    if (music === 'intro') {
      // The hook: light chord stabs on 1, the "and" of 2 and 3, a bell on the first beat. No drums.
      for (const off of inBar === 0 ? [0, 1.5] : inBar === 2 ? [.5] : []) tones.forEach((midi, v) => add(a ? 'pulse' : 'ep', t + off * BEAT + (a ? 0 : v * .012), .45, midi, a ? .05 : .1, (v - 1.5) * .25, { decay: 5 }));
      if (b === 0) { add('bell', t, 1.4, 79, .05, .25); add('bell', t + .29, 1.1, 84, .035, -.2); }
      if (b === 4) tones.forEach((midi, v) => add(a ? 'pulse' : 'ep', t, .5, midi, a ? .05 : .1, (v - 1.5) * .25, { decay: 5 }));
      continue;
    }
    if (music === 'build') {
      // The cards: a lonely clock on every beat (the pops of the cards are added below), no drums or bass.
      add('tick', t, .05, 0, inBar % 2 ? .07 : .1, inBar % 2 ? .3 : -.3);
      continue;
    }
    if (music === 'hush') continue;   // pad only
    if (music === 'resolve') {
      if (t > MUSIC_CUES.endChordAt + .01) continue;
      tones.forEach((midi, v) => add(a ? 'pulse' : 'ep', t + v * .03, 2.6, midi, a ? .075 : .17, (v - 1.5) * .25, { decay: 1.4 }));
      add(a ? 'tri' : 'bass', t, 2.8, bassMidi + (a ? 12 : 0), a ? .12 : .2);
      add('bell', t, 2.4, 84, .05, .2); add('bell', t + .07, 2.2, 88, .04, -.2);
      add('kick', t, .4, 0, .26); add('crash', t, 1.6, 0, .07);
      continue;
    }
    if (!groove) continue;
    // Chords: A offbeat pulse stabs, B piano on 1 and the "and" of 2 and 3.
    for (const off of a ? [.5, 1.5, 2.5, 3.5] : [0, 1.5, 2.5]) if (inBar === Math.floor(off)) {
      tones.forEach((midi, v) => add(a ? 'pulse' : 'ep', t + (off % 1) * BEAT + (a ? 0 : v * .012), a ? .22 : .5, midi, (a ? .058 : .11) * level, (v - 1.5) * .27, { decay: a ? 9 : 3 }));
    }
    // Lead: one six-note phrase per bar.
    if (inBar === 0) {
      const bar = Math.floor(b / 4);
      for (const [nb, midi, len] of motif) add(a ? 'pulse' : 'marimba', t + nb * BEAT, len * BEAT + .15, midi + (bar % 2 && nb === motif.at(-1)[0] ? -2 : 0) + (chorus && a ? 12 : 0),
        (chorus ? .2 : .13) * (a ? .7 : 1), -.15, { decay: a ? 2.6 : 0 });
      if (chorus && !a) for (const [nb, midi, len] of motif) add('bell', t + nb * BEAT, len * BEAT, midi + 12, .03, .35);
    }
    // Lift and chorus: a quiet 16th arpeggio of the chord (pulse for A, bells for B).
    if (lift) for (let k = 0; k < 4; k++) add(a ? 'pulse' : 'bell', t + k * BEAT / 4, BEAT / 4 + .05, tones[(inBar * 4 + k) % 4] + 12, a ? .022 : .02, k % 2 ? .35 : -.35, { decay: 14 });
    // Bass: root, fifth on the "and" of 2, root on 3, octave on the "and" of 4 (A's triangle sits an octave up, as chip bass does).
    for (const [nb, interval, len] of [[0, 0, 1.2], [1.5, 7, .4], [2, 0, 1.2], [3.5, 12, .4]]) if (inBar === Math.floor(nb)) add(a ? 'tri' : 'bass', t + (nb % 1) * BEAT, len * BEAT, bassMidi + interval + (a ? 12 : 0), (a ? .13 : .21) * level);
    // Drums: kick on 1 and 3 (and the "a" of 3 in the chorus), clap on 2 and 4, hats on 8ths (16ths from the lift).
    if (inBar === 0 || inBar === 2) add('kick', t, .32, 0, (a ? .26 : .27) * level);
    if (chorus && inBar === 2) add('kick', t + .75 * BEAT, .25, 0, .16);
    if (inBar === 1 || inBar === 3) add('clap', t, .22, 0, .1 * level, -.05);
    for (let k = 0; k < (lift ? 4 : 2); k++) { const off = k * BEAT / (lift ? 4 : 2) + (!a && k % 2 ? .02 : 0); add('tick', t + off, .05, 0, (k % 2 ? .06 : .045) * (lift ? .8 : 1) * (a ? 1.35 : 1), k % 2 ? .3 : -.3); }
  }
  // The build rises into the drop; the drop and the chorus start hit; the end chord is set above.
  add('swell', MUSIC_CUES.buildAt, MUSIC_CUES.dropAt - MUSIC_CUES.buildAt, 0, .085);
  add('kick', MUSIC_CUES.dropAt, .4, 0, .27); add('crash', MUSIC_CUES.dropAt, 1.2, 0, .12); add(a ? 'tri' : 'bass', MUSIC_CUES.dropAt, .5, 36, a ? .06 : .08);
  add('crash', MUSIC_CUES.chorusAt, 1, 0, .08);
  // One soft pop per card (tuned, rising), and a small tick for every tap seen on screen.
  CARD_TIMES.forEach((cue, k) => add('pon', cue, .22, [72, 74, 76, 79, 81, 84][k % 6], .07, k % 2 ? .25 : -.25));
  for (const cue of TAP_CUES) add('tap', cue, .065, 84, .045);
  events.sort((x, y) => x.start - y.start);
  return { variant, title: a ? 'ドットのオフィス' : 'あさのカフェ', key: a ? 'C major' : 'F major', bpm: +BPM.toFixed(3),
    chords: CHORDS.map((c) => ({ at: +(c[0] * BEAT).toFixed(3), name: transposeName(c[1], up) })), tapCues: TAP_CUES, cardCues: CARD_TIMES, events };
}

function randomFactory(seed) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}

function synthesize(arrangement) {
  const names = ['pad', 'lead', 'bass', 'drums', 'fx'];
  const buses = Object.fromEntries(names.map((name) => [name, makeBus()]));
  const random = randomFactory(arrangement.variant === 'a' ? 0x91a : 0x91b);
  for (const e of arrangement.events) {
    const busName = e.kind === 'pad' || e.kind === 'swell' ? 'pad' : e.kind === 'bass' || e.kind === 'tri' ? 'bass'
      : ['kick', 'clap', 'tick', 'crash', 'swish'].includes(e.kind) ? 'drums' : ['tap', 'pon'].includes(e.kind) ? 'fx' : 'lead';
    const bus = buses[busName];
    const gl = Math.cos((e.pan + 1) * Math.PI / 4), gr = Math.sin((e.pan + 1) * Math.PI / 4);
    const f = hz(e.midi);
    const first = Math.max(0, Math.round(e.start * SAMPLE_RATE)), last = Math.min(FRAMES, Math.round((e.start + e.duration) * SAMPLE_RATE));
    let hp = 0, band = 0, low = 0, phase = 0;
    const harmonics = e.kind === 'pulse' ? Array.from({ length: Math.max(1, Math.floor(Math.min(11000 / f, 31) / 2) + 1) }, (_, i) => 2 * i + 1) : null;
    for (let i = first; i < last; i++) {
      const t = (i - first) / SAMPLE_RATE, left = e.duration - t;
      const release = clamp(left / .03);
      let s = 0;
      switch (e.kind) {
        case 'pulse': {
          // Band-limited square (odd harmonics below 11 kHz, rolled off a little): the soft "chip" voice of A.
          for (const k of harmonics) s += Math.sin(TAU * f * k * t) / k ** 1.2;
          s *= .6 * (e.decay ? Math.exp(-t * e.decay) : 1) * clamp(t / .004) * release;
          break;
        }
        case 'tri': {
          for (let k = 1; k <= 9; k += 2) s += ((k - 1) / 2 % 2 ? -1 : 1) * Math.sin(TAU * f * k * t) / (k * k);
          s *= 1.15 * clamp(t / .006) * Math.exp(-t * 1.4) * release;
          break;
        }
        case 'ep': {
          const mod = 1.35 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 5);
          s = (Math.sin(TAU * f * t + mod) + .16 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 3)) * Math.exp(-t * (e.decay || 2.3)) * clamp(t / .003) * release * .72;
          break;
        }
        case 'marimba': {
          s = Math.sin(TAU * f * t) * Math.exp(-t * 3.2) + .35 * Math.sin(TAU * f * 3.93 * t) * Math.exp(-t * 11)
            + .08 * Math.sin(TAU * f * 9.2 * t) * Math.exp(-t * 30) + .18 * Math.sin(TAU * 110 * t) * Math.exp(-t / .008);
          s *= clamp(t / .002) * release * .7;
          break;
        }
        case 'bell': {
          const mod = Math.sin(TAU * f * 3.5 * t) * 2.2 * Math.exp(-t * 3);
          s = Math.sin(TAU * f * t + mod) * Math.exp(-t * (e.decay || 1.6)) * clamp(t / .002) * release * .6;
          break;
        }
        case 'pad': {
          // The sub-octave layer is left out below 125 Hz (it would only thicken the bass under the cards and the hush).
          const sub = f * .5 >= 125 ? .13 * Math.sin(TAU * f * .5 * t) : .13 * Math.sin(TAU * f * t);
          const soft = .62 * Math.sin(TAU * f * t + .3 * Math.sin(TAU * .35 * t)) + .25 * Math.sin(TAU * f * 2.003 * t) + sub;
          s = soft * Math.sin(clamp(t / .5) * Math.PI / 2) * Math.sin(clamp(left / .45) * Math.PI / 2);
          break;
        }
        case 'bass': {
          const env = clamp(t / .006) * Math.exp(-t * 1.2) * release;
          s = (.85 * Math.sin(TAU * f * t) + .15 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 6)) * env;
          break;
        }
        case 'kick': {
          phase += (52 + 60 * Math.exp(-t / .02)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .11) * clamp(t / .002) * release;
          break;
        }
        case 'tap': {
          phase += (f + f * .12 * Math.exp(-t / .004)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .012) * clamp(t / .0008) * release;
          break;
        }
        case 'pon': {
          // A soft bubble pop for each card: a tuned sine that drops into its note.
          phase += (f + f * .5 * Math.exp(-t / .01)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .07) * clamp(t / .002) * release;
          break;
        }
        case 'swish': case 'tick': case 'swell': case 'crash': case 'clap': {
          const n = random() * 2 - 1;
          const centre = e.kind === 'swell' ? 600 * 2 ** (3 * t / e.duration) : e.kind === 'tick' ? 7000 : e.kind === 'crash' ? 5200 : e.kind === 'clap' ? 1500 : 2600;
          const q = e.kind === 'clap' ? 1.1 : .7;
          const fc = 2 * Math.sin(Math.PI * Math.min(centre, 16000) / SAMPLE_RATE);
          low += fc * band; const high = n - low - q * band; band += fc * high;
          let env;
          if (e.kind === 'swish') env = Math.sin(Math.PI * clamp(t / e.duration)) ** 2;
          else if (e.kind === 'tick') env = Math.exp(-t / .012) * clamp(t / .0008);
          else if (e.kind === 'swell') env = (t / e.duration) ** 2 * clamp(left / .05);
          else if (e.kind === 'crash') env = Math.exp(-t / .45) * clamp(t / .002) * release;
          else env = (t < .03 ? Math.exp(-(t % .01) / .0025) : Math.exp(-(t - .03) / .06)) * clamp(t / .0008) * release;
          s = band * env;
          break;
        }
        default: throw new Error(`unknown kind ${e.kind}`);
      }
      bus.l[i] += s * e.gain * gl;
      bus.r[i] += s * e.gain * gr;
    }
  }
  // Reverb (small Schroeder): pad, lead and quiet interaction sounds.
  const wet = makeBus();
  for (const ch of ['l', 'r']) {
    const send = new Float32Array(FRAMES);
    for (let i = 0; i < FRAMES; i++) send[i] = buses.pad[ch][i] * .25 + buses.lead[ch][i] * .3 + buses.drums[ch][i] * .08 + buses.fx[ch][i] * .1;
    let stage = new Float32Array(FRAMES);
    for (const size of [1311, 1487, 1613, 1789]) {
      const length = size + (ch === 'r' ? 29 : 0), line = new Float32Array(length);
      const feedback = 10 ** (-3 * length / SAMPLE_RATE / 1.6);
      let damp = 0;
      for (let i = 0; i < FRAMES; i++) {
        const pos = i % length, value = line[pos];
        stage[i] += value * .25; damp += (value - damp) * .35; line[pos] = send[i] + damp * feedback;
      }
    }
    for (const size of [225, 556]) {
      const length = size + (ch === 'r' ? 23 : 0), line = new Float32Array(length), next = new Float32Array(FRAMES);
      for (let i = 0; i < FRAMES; i++) { const pos = i % length; next[i] = line[pos] - stage[i]; line[pos] = stage[i] + line[pos] * .5; }
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
      // The hush (alone with the NPCs): only the pad bus plays until the end chord.
      const hush = t >= MUSIC_CUES.hushAt && t < MUSIC_CUES.endChordAt;
      const foreground = hush ? 0 : (t < MUSIC_CUES.hushAt ? clamp((MUSIC_CUES.hushAt - t) / .025) : 1);
      const raw = buses.pad[ch][i] + foreground * (buses.lead[ch][i] + buses.bass[ch][i] + buses.drums[ch][i] + buses.fx[ch][i] + wet[ch][i] * .35);
      const build = t >= MUSIC_CUES.buildAt && t < MUSIC_CUES.dropAt;
      const sectionGain = build ? (arrangement.variant === 'a' ? .8 : .75) : hush ? .7 : 1;
      hpv = raw - prev + Math.exp(-TAU * 30 / SAMPLE_RATE) * hpv; prev = raw;
      const left = FRAMES - 1 - i;
      const fade = left < fadeFrames ? Math.sin(clamp(left / fadeFrames) * Math.PI / 2) ** 2 : 1;
      const fadeIn = Math.sin(clamp(i / (.006 * SAMPLE_RATE)) * Math.PI / 2) ** 2;
      mix[ch][i] = hpv * fade * fadeIn * sectionGain;
    }
  }
  return mix;
}

// Look-ahead peak limiter (5 ms look-ahead, smooth release) to a sample-peak ceiling.
function limit(bus, gain, ceiling) {
  const look = Math.round(.005 * SAMPLE_RATE), rel = Math.exp(-1 / (.08 * SAMPLE_RATE));
  const out = makeBus();
  const peak = new Float32Array(FRAMES);
  for (let i = 0; i < FRAMES; i++) peak[i] = Math.max(Math.abs(bus.l[i]), Math.abs(bus.r[i])) * gain;
  const need = new Float32Array(FRAMES);
  for (let i = 0; i < FRAMES; i++) { let m = 0; for (let k = i; k < Math.min(FRAMES, i + look); k++) m = Math.max(m, peak[k]); need[i] = m > ceiling ? ceiling / m : 1; }
  let g = 1, reduced = 0;
  for (let i = 0; i < FRAMES; i++) {
    g = need[i] < g ? need[i] : need[i] + (g - need[i]) * rel;
    if (g < .999) reduced++;
    out.l[i] = bus.l[i] * gain * g; out.r[i] = bus.r[i] * gain * g;
  }
  return { out, reducedPercent: 100 * reduced / FRAMES };
}

export function wavBuffer(bus) {
  const buffer = Buffer.alloc(44 + FRAMES * 4);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24); buffer.writeUInt32LE(SAMPLE_RATE * 4, 28); buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(FRAMES * 4, 40);
  for (let i = 0; i < FRAMES; i++) for (const [c, ch] of ['l', 'r'].entries()) {
    const v = bus[ch][i];
    if (!Number.isFinite(v) || Math.abs(v) >= 1) throw new Error(`PCM overflow at frame ${i}`);
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 4 + c * 2);
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
  // Gain toward the target loudness, limit to a ceiling, measure the true peak, tighten the ceiling if needed.
  let gain = .25 / peak, ceiling = 10 ** (-2.2 / 20), result = null;
  const scratch = join(dirname(out), `.measure-${variant}-${process.pid}.wav`);
  try {
    for (let pass = 0; pass < 8; pass++) {
      const { out: limited, reducedPercent } = limit(mix, gain, ceiling);
      writeFileSync(scratch, wavBuffer(limited));
      const m = measure(scratch);
      result = { limited, m, reducedPercent, gain, ceilingDb: 20 * Math.log10(ceiling) };
      const lufsOk = Math.abs(m.lufs - TARGET_LUFS) <= .3, tpOk = m.truePeak <= -1.6;
      if (lufsOk && tpOk) break;
      if (!tpOk) ceiling *= 10 ** ((-1.7 - m.truePeak) / 20);
      if (!lufsOk) gain *= 10 ** ((TARGET_LUFS - m.lufs) / 20);
    }
  } finally { try { unlinkSync(scratch); } catch { /* none */ } }
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
