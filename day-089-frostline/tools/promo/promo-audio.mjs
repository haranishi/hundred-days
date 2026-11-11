/* Day089 FROSTLINE: the promo BGM, synthesized from numbers only (no recordings, no samples, no packages).
 *   node promo-audio.mjs --variant a|b --out-dir <dir>      -> <dir>/bgm_{a,b}.wav (48 kHz 16 bit stereo) and .mp3 (192 kbps)
 * A「雪原エレクトロ」: D major, detuned-saw pad, FM pluck arpeggio in sixteenths, sub bass pumped by the kick, clap, a bright lead.
 * B「インディ・ギター」: G major, plucked-string guitars (Karplus-Strong) strummed in eighths, finger bass, a live rock kit, a glockenspiel.
 * Both follow the storyboard (timeline.mjs): a flying intro without kick -> the "but..." bar thins out and rises into the drop on the
 * game's title -> groove under the carving, an accent on the brake -> a snare roll up to the take-off -> the drums stop while the rider
 * is in the air (a pad and a rising whoosh hold) -> the impact on the landing frame -> the chorus with the lead -> the end chord.
 * Original chord loops (I-V-vi-IV) and an original six-note motif; every note is computed from a fixed seed, so the same input gives
 * the same file. ffmpeg only measures the loudness and encodes the MP3.
 */
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BAR, BARS, BEAT, BPM, DURATION_SECONDS, MUSIC_CUES, TAP_CUES, bar } from './timeline.mjs';

export const SAMPLE_RATE = 48_000;
export const TARGET_LUFS = -16;
const FRAMES = Math.round(SAMPLE_RATE * DURATION_SECONDS);
const TAU = 2 * Math.PI;
const ffmpeg = process.env.FFMPEG || spawnSync('/bin/sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' }).stdout.trim() || 'ffmpeg';
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const makeBus = () => ({ l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) });

// Sections of the storyboard, in seconds (the music changes with the picture, not only on bar lines).
export const SECTIONS = [
  ['intro', 0, MUSIC_CUES.buildAt], ['build', MUSIC_CUES.buildAt, MUSIC_CUES.dropAt], ['groove', MUSIC_CUES.dropAt, MUSIC_CUES.approachAt],
  ['approach', MUSIC_CUES.approachAt, MUSIC_CUES.takeoffAt], ['air', MUSIC_CUES.takeoffAt, MUSIC_CUES.impactAt],
  ['chorus', MUSIC_CUES.impactAt, MUSIC_CUES.endChordAt], ['end', MUSIC_CUES.endChordAt, DURATION_SECONDS],
];
export const sectionAt = (t) => (SECTIONS.find(([, a, b]) => t >= a - 1e-9 && t < b - 1e-9) ?? SECTIONS.at(-1))[0];

export function createArrangement(variant = 'a') {
  if (!['a', 'b'].includes(variant)) throw new Error('--variant は a または b');
  const a = variant === 'a';
  // One chord per bar: [name, bass midi, voicing]. Bar 7 starts on a suspended dominant; the impact (beat 2) resolves it.
  const chords = a ? [
    ['Dadd9', 38, [62, 64, 66, 69]], ['Asus4', 33, [62, 64, 69, 71]], ['Dadd9', 38, [62, 64, 66, 69]], ['A/C#', 37, [61, 64, 69, 71]],
    ['Bm7', 35, [62, 66, 69, 71]], ['Gmaj7', 31, [62, 66, 67, 71]], ['Em7', 40, [62, 64, 67, 71]], ['Dadd9', 38, [62, 64, 66, 69]],
    ['A/C#', 37, [61, 64, 69, 71]], ['Bm7', 35, [62, 66, 69, 71]], ['Gmaj7', 31, [62, 66, 67, 71]], ['Dadd9', 38, [62, 64, 66, 69, 74]],
  ] : [
    ['G', 43, [43, 47, 50, 55, 59, 67]], ['Dsus4', 38, [50, 57, 62, 67]], ['G', 43, [43, 47, 50, 55, 59, 67]], ['D', 38, [50, 57, 62, 66]],
    ['Em7', 40, [40, 47, 52, 55, 62, 67]], ['Cadd9', 36, [48, 52, 55, 62, 64]], ['Am7', 45, [45, 52, 55, 60, 64]], ['G', 43, [43, 47, 50, 55, 59, 67]],
    ['D', 38, [50, 57, 62, 66]], ['Em7', 40, [40, 47, 52, 55, 62, 67]], ['Cadd9', 36, [48, 52, 55, 62, 64]], ['G', 43, [43, 47, 50, 55, 59, 67]],
  ];
  const sus = a ? ['A7sus4', 33, [62, 64, 67, 69]] : ['Dsus4', 38, [50, 57, 62, 67]];   // bar 7, beat 1 (before the impact)
  // The motif (beat, midi, beats): six notes, the last one answered differently on every second bar.
  const motif = a ? [[0, 78, .75], [.75, 76, .75], [1.5, 74, .5], [2, 76, 1], [3, 81, .5], [3.5, 78, .5]]
    : [[0, 74, .5], [.5, 71, .5], [1, 67, 1], [2, 69, .5], [2.5, 71, .5], [3, 74, 1]];
  const events = [];
  const add = (kind, start, duration, midi, gain, pan = 0, extra = {}) => { if (start < DURATION_SECONDS && duration > 0) events.push({ kind, start: +start.toFixed(6), duration: Math.min(duration, DURATION_SECONDS - start), midi, gain, pan, ...extra }); };
  const sec = sectionAt;
  for (let n = 0; n < BARS; n++) {
    const start = bar(n), at = (b) => start + b * BEAT;
    let [, bassMidi, tones] = chords[n];
    const s0 = sec(start);
    // Pads (A) / a soft organ bed (B) under every section; bar 7 holds the suspended chord until the impact.
    const padGain = { intro: .06, build: .065, groove: .05, approach: .055, air: .1, chorus: .055, end: .07 };
    const segments = n === 7 ? [[start, MUSIC_CUES.impactAt, sus], [MUSIC_CUES.impactAt, start + BAR, chords[7]]] : [[start, start + BAR, chords[n]]];
    for (const [from, to, chord] of segments) {
      for (const [v, midi] of chord[2].entries()) {
        if (!a && midi < 52) continue;   // B: the bed stays above the guitars' low strings
        add(a ? 'saw' : 'organ', from, to - from + (n === BARS - 1 ? 0 : .05), a ? midi : midi + (midi < 60 ? 12 : 0), padGain[sec(from)] * (a ? 1 : .8), (v - (chord[2].length - 1) / 2) * .28);
      }
    }
    if (s0 === 'end') {
      // The end chord: one strum / one stab, the bass, a bell; then the long fade.
      if (a) tones.forEach((m, v) => add('pluck', start + v * .03, 2.4, m + 12, .1, (v - 2) * .25));
      else strum(add, start, tones, 'down', .19, 2.4);
      add('bass', start, 2.4, bassMidi, a ? .09 : .075);
      add(a ? 'bell' : 'glock', start, 2.2, a ? 86 : 79, .07, .2);
      add('crash', start, 2.2, 0, .018);
      continue;
    }
    for (let k = 0; k < 16; k++) {
      const t = start + k * BEAT / 4, s = sec(t), beatPos = k / 4;
      if (n === 7 && t < MUSIC_CUES.impactAt - 1e-9) { tones = sus[2]; bassMidi = sus[1]; } else if (n === 7) { tones = chords[7][2]; bassMidi = chords[7][1]; }
      const full = s === 'groove' || s === 'approach' || s === 'chorus';
      const lift = s === 'chorus' ? 1.12 : 1;
      if (a) {
        // Sixteenth-note FM arpeggio: up through the chord an octave higher, every section but the hush (the intro is softer).
        if (s !== 'air' && s !== 'build') add('pluck', t, BEAT * .45, tones[[0, 1, 2, 3, 2, 1, 3, 2][k % 8] % tones.length] + 12, (s === 'intro' ? .09 : .1) * lift, (k % 2 ? .3 : -.3));
        if (s === 'build' && k % 2 === 0) add('pluck', t, BEAT * .4, tones[(k / 2) % tones.length] + 12, .05 + .06 * (k / 16), (k % 4 ? .35 : -.35));
      } else {
        // Strummed eighths (D . D U . U D U), palm-muted in the intro, open from the drop; arpeggios hold the hush.
        const pattern = { 0: 'down', 4: 'down', 6: 'up', 10: 'up', 12: 'down', 14: 'up' };
        if (pattern[k] && (full || s === 'intro')) strum(add, t, tones, pattern[k], (s === 'intro' ? .17 : .2) * lift * (k === 0 ? 1.1 : 1), s === 'intro' ? .25 : (pattern[k] === 'up' ? .45 : .7), s === 'intro');
        if (s === 'build' && k % 2 === 0) add('string', t, 1.2, tones[(k / 2) % tones.length] + 12, .1 + .08 * (k / 16), (k % 4 ? .3 : -.3));
        if (s === 'air' && k % 4 === 0) add('string', t, 2.0, tones[(k / 4 + 1) % tones.length] + 12, .11, (k % 8 ? .35 : -.35));
      }
      // Bass: eighths on the root (octave jump on the last eighth), from the drop.
      if (full && k % 2 === 0) add('bass', t, BEAT * (k % 4 === 0 ? .9 : .45), bassMidi + (k === 14 ? 12 : 0), (a ? .085 : .072) * lift);
      if (s === 'intro' && k % 4 === 0) add('bass', t, BEAT * .9, bassMidi, a ? .08 : .07);
      // Drums.
      if (full) {
        const kicks = a ? [0, 6, 8, 11] : [0, 7, 8, 10];
        if (kicks.includes(k)) add('kick', t, .4, 0, (a ? .25 : .22) * (k === 0 ? 1 : .9));
        if (k === 4 || k === 12) add(a ? 'clap' : 'snare', t, .35, 0, a ? .2 : .24, a ? .05 : -.05);
        if (k % 2 === 0 || s === 'chorus') add('hat', t + (!a && k % 2 ? .012 : 0), .045, 0, (k % 2 ? .011 : .018) * (k % 4 === 2 ? 1.2 : 1) * (a ? .8 : 1), k % 2 ? .35 : .2);
        if (a && k % 4 === 2 && s === 'chorus') add('openhat', t, .25, 0, .009, .3);
      }
      if (s === 'intro') {
        if (k === 0 || k === 8) add('kick', t, .4, 0, a ? .23 : .23);
        if (k === 12) add(a ? 'clap' : 'snare', t, .35, 0, a ? .15 : .18, 0);
        if (k % 4 === 2) add('hat', t, .035, 0, .014, .3);
      }
      // Build (the 'but...' bar): no beat, a snare roll from eighths to sixteenths, rising into the drop.
      if (s === 'build' && (k >= 8 || k % 2 === 0)) add(a ? 'clap' : 'snare', t, .2, 0, .04 + .14 * (k / 16), 0);
      // Approach: a snare roll on the last two beats before the take-off (16ths, then 32nds), rising.
      if (s === 'approach' && t >= MUSIC_CUES.takeoffAt - 2 * BEAT - 1e-9) {
        const u = (t - (MUSIC_CUES.takeoffAt - 2 * BEAT)) / (2 * BEAT);
        add(a ? 'clap' : 'snare', t, .2, 0, .08 + .14 * u, 0);
        if (u >= .5) add(a ? 'clap' : 'snare', t + BEAT / 8, .15, 0, .09 + .14 * u, 0);
      }
    }
    // The lead / glockenspiel motif: the groove (soft, from bar 3) and the chorus (full); the drop bar carries the title.
    for (const [b, midi, len] of motif) {
      const t = at(b), s = sec(t);
      if (!(s === 'chorus' || (s === 'groove' && n >= 3))) continue;
      const answer = n % 2 && b === motif.at(-1)[0] ? (a ? -5 : -3) : 0;
      add(a ? 'lead' : 'glock', t, len * BEAT + .15, midi + answer, (s === 'chorus' ? (a ? .1 : .13) : (a ? .06 : .08)), -.12);
    }
  }
  // Fixed hits on the cues.
  add('riser', MUSIC_CUES.buildAt, MUSIC_CUES.dropAt - MUSIC_CUES.buildAt, 0, .07);
  for (const cue of [MUSIC_CUES.dropAt, MUSIC_CUES.impactAt]) { add('kick', cue, .45, 0, .36); add('crash', cue, 1.6, 0, .03); add('sub', cue, .9, 0, .12); }
  add(a ? 'bell' : 'glock', MUSIC_CUES.dropAt, 1.4, a ? 86 : 83, .07, .25);
  add('crash', MUSIC_CUES.brakeAt, 1.2, 0, .025, -.2);
  add('riser', MUSIC_CUES.approachAt + BAR / 2, MUSIC_CUES.takeoffAt - MUSIC_CUES.approachAt - BAR / 2, 0, .04);
  add('whoosh', MUSIC_CUES.takeoffAt, MUSIC_CUES.impactAt - MUSIC_CUES.takeoffAt, 0, .06);
  // A rising sparkle into the impact (six tuned grains), and the press ticks.
  for (const [k, midi] of (a ? [74, 78, 81, 86, 90, 93] : [71, 74, 79, 83, 86, 91]).entries()) add(a ? 'bell' : 'glock', MUSIC_CUES.impactAt - .42 + k * .07, .5, midi, .03 + k * .006, (k - 2.5) * .12);
  for (const cue of TAP_CUES) add('tick', cue, .06, a ? 86 : 91, .05);
  events.sort((x, y) => x.start - y.start || x.kind.localeCompare(y.kind));
  return { variant, title: a ? '雪原エレクトロ' : 'インディ・ギター', key: a ? 'D major' : 'G major', bpm: BPM, bars: BARS,
    chords: chords.map((c, i) => ({ at: bar(i), name: c[0] })), sections: SECTIONS, tapCues: TAP_CUES, events };
}
// A strum: strings from low to high (down) or the top four from high to low (up), 9 ms apart.
function strum(add, t, tones, dir, gain, len, muted = false) {
  const strings = dir === 'down' ? tones : tones.slice(-4).reverse();
  // The two lowest strings a little softer (the bass guitar holds the root), so the low end stays clear.
  strings.forEach((midi, i) => add('string', t + i * .009, len, midi, gain * (dir === 'up' ? .7 : 1) * (1 - i * .04) * (midi < 50 ? .7 : 1), (midi - 55) / 30, { muted }));
}

function randomFactory(seed) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
const polyblep = (t, dt) => (t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0);

export function synthesize(arrangement) {
  const a = arrangement.variant === 'a';
  const names = ['pad', 'lead', 'bass', 'drums', 'fx'];
  const buses = Object.fromEntries(names.map((name) => [name, makeBus()]));
  const random = randomFactory(a ? 0x89a : 0x89b);
  const kicks = [];
  for (const e of arrangement.events) {
    const busName = ['saw', 'organ'].includes(e.kind) ? 'pad' : ['bass', 'sub'].includes(e.kind) ? 'bass'
      : ['kick', 'snare', 'clap', 'hat', 'openhat', 'crash'].includes(e.kind) ? 'drums' : ['riser', 'whoosh', 'tick'].includes(e.kind) ? 'fx' : 'lead';
    if (e.kind === 'kick') kicks.push(e.start);
    const bus = buses[busName];
    const gl = Math.cos((e.pan + 1) * Math.PI / 4), gr = Math.sin((e.pan + 1) * Math.PI / 4);
    const f = hz(e.midi);
    const first = Math.max(0, Math.round(e.start * SAMPLE_RATE));
    const last = Math.min(FRAMES, Math.round((e.start + e.duration) * SAMPLE_RATE));
    // Per-note state.
    const ph = [random(), random(), random()], det = [-0.11, 0, 0.12].map((c) => 2 ** (c / 12));
    let low = 0, band = 0, phase = 0, lp = 0, hp = 0, prev = 0;
    let ks = null, ksIndex = 0;
    if (e.kind === 'string') {
      // Karplus-Strong: a delay line of one period, filled with a filtered noise burst (the pick). The two-point average delays
      // half a sample more, so the line is half a sample shorter.
      const n = Math.max(2, Math.round(SAMPLE_RATE / f - .5));
      ks = new Float32Array(n);
      let s = 0;
      for (let i = 0; i < n; i++) { s += ((random() * 2 - 1) - s) * (e.muted ? .15 : .18); ks[i] = s; }
    }
    for (let i = first; i < last; i++) {
      const t = (i - first) / SAMPLE_RATE, left = e.duration - t;
      const release = clamp(left / .02);
      let s = 0;
      switch (e.kind) {
        case 'saw': {
          // Three detuned band-limited saws through a state-variable low-pass; the cutoff follows the section.
          for (let v = 0; v < 3; v++) {
            const inc = f * det[v] / SAMPLE_RATE;
            ph[v] += inc; if (ph[v] >= 1) ph[v] -= 1;
            s += (2 * ph[v] - 1 - polyblep(ph[v], inc)) / 3;
          }
          const sect = sectionAt(e.start + t);
          const cutoff = sect === 'build' ? 500 * 2 ** (3 * clamp((e.start + t - MUSIC_CUES.buildAt) / (MUSIC_CUES.dropAt - MUSIC_CUES.buildAt))) : sect === 'air' ? 900 : sect === 'intro' ? 1400 : sect === 'end' ? 2200 : 2600;
          const fc = 2 * Math.sin(Math.PI * Math.min(cutoff, 7000) / SAMPLE_RATE);
          low += fc * band; const high = s - low - 1.1 * band; band += fc * high;
          s = low * Math.sin(clamp(t / .06) * Math.PI / 2) * Math.sin(clamp(left / .12) * Math.PI / 2);
          break;
        }
        case 'organ': {
          // B's bed: a soft organ (fundamental, octave, twelfth), slowly breathing.
          s = (.6 * Math.sin(TAU * f * t) + .25 * Math.sin(TAU * f * 2.001 * t) + .12 * Math.sin(TAU * f * 3 * t)) * (1 + .08 * Math.sin(TAU * 5.2 * t));
          s *= Math.sin(clamp(t / .12) * Math.PI / 2) * Math.sin(clamp(left / .2) * Math.PI / 2) * .7;
          break;
        }
        case 'pluck': {
          const index = 1.8 * Math.exp(-t / .07);
          s = Math.sin(TAU * f * t + index * Math.sin(TAU * f * 2 * t)) * Math.exp(-t / .22) * clamp(t / .002) * release;
          break;
        }
        case 'lead': {
          // A's lead: two saws a few cents apart, filtered, with a late vibrato.
          const vib = 1 + .004 * Math.sin(TAU * 5.5 * t) * clamp((t - .15) / .2);
          for (let v = 0; v < 2; v++) { const inc = f * vib * (v ? 1.006 : 1) / SAMPLE_RATE; ph[v] += inc; if (ph[v] >= 1) ph[v] -= 1; s += (2 * ph[v] - 1 - polyblep(ph[v], inc)) / 2; }
          const fc = 2 * Math.sin(Math.PI * (1800 + 2600 * Math.exp(-t / .12)) / SAMPLE_RATE);
          low += fc * band; const high = s - low - .9 * band; band += fc * high;
          s = low * clamp(t / .01) * Math.exp(-t / 1.2) * release;
          break;
        }
        case 'string': {
          // One sample of the string: average two neighbours, a little loss (muted strings lose more).
          const n = ks.length, j = ksIndex % n, next = (ksIndex + 1) % n;
          s = ks[j];
          ks[j] = (ks[j] + ks[next]) * .5 * (e.muted ? .985 : .9975);
          ksIndex++;
          lp += (s - lp) * .45;   // a gentle low-pass (about 5 kHz): the string's bite without the hiss
          s = lp * clamp(left / .05) * .95;
          break;
        }
        case 'bell': case 'glock': {
          const partials = e.kind === 'bell' ? [[1, 1, 1.6], [2.76, .35, 3], [5.4, .18, 6]] : [[1, 1, 2.2], [3.93, .28, 7], [9.2, .035, 14]];
          for (const [ratio, amp, decay] of partials) s += amp * Math.sin(TAU * f * ratio * t) * Math.exp(-t * decay);
          s *= clamp(t / .002) * release * .55;
          break;
        }
        case 'bass': {
          // Sine, a little octave and a soft clip: audible on small speakers, round on big ones.
          const env = clamp(t / .005) * Math.exp(-t * (a ? 2.2 : 3.2)) * release;
          const raw = Math.sin(TAU * f * t) + .55 * Math.sin(TAU * f * 2 * t) + (a ? .1 : .2) * Math.sin(TAU * f * 3 * t);
          s = Math.tanh(1.4 * raw) * env * .8;
          break;
        }
        case 'sub': {
          phase += (32 + 38 * Math.exp(-t / .18)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .38) * clamp(t / .004) * release;
          break;
        }
        case 'kick': {
          // A short, punchy kick: the pitch falls from about 170 to 58 Hz; a longer tail carried most of the energy under 120 Hz.
          phase += (58 + 112 * Math.exp(-t / .026)) / SAMPLE_RATE;
          const click = (random() * 2 - 1) * Math.exp(-t / .0018) * .35;
          s = (Math.sin(TAU * phase) * Math.exp(-t / .1) + click) * clamp(t / .001) * release;
          break;
        }
        case 'snare': {
          // Body (185 Hz) and the wires: noise band-passed around 2 kHz, then a soft low-pass (a white-noise snare carried most of
          // the mix's energy above 8 kHz).
          const n = random() * 2 - 1, fc = 2 * Math.sin(Math.PI * 2000 / SAMPLE_RATE);
          low += fc * band; const high = n - low - .9 * band; band += fc * high;
          lp += (band - lp) * .4;
          s = (.6 * Math.sin(TAU * 185 * t) * Math.exp(-t / .07) + lp * 1.6 * Math.exp(-t / .12)) * clamp(t / .001) * release;
          break;
        }
        case 'clap': {
          const n = random() * 2 - 1;
          const fc = 2 * Math.sin(Math.PI * 1500 / SAMPLE_RATE); low += fc * band; const high = n - low - .9 * band; band += fc * high;
          const bursts = [0, .011, .022].reduce((m, b) => m + (t >= b ? Math.exp(-(t - b) / .006) : 0), 0) * .6 + Math.exp(-t / .12) * (t > .022 ? 1 : 0);
          s = band * 2.2 * bursts * release;
          break;
        }
        case 'hat': case 'openhat': case 'crash': case 'riser': case 'whoosh': case 'tick': {
          const n = random() * 2 - 1;
          if (e.kind === 'tick') { phase += (f + f * .15 * Math.exp(-t / .004)) / SAMPLE_RATE; s = Math.sin(TAU * phase) * Math.exp(-t / .012) * clamp(t / .0008) * release; break; }
          // Band-passed / high-passed noise with a per-kind centre and envelope.
          const u = clamp(t / e.duration);
          const centre = e.kind === 'riser' ? 500 * 2 ** (3.4 * u) : e.kind === 'whoosh' ? 300 * 2 ** (4 * u) : e.kind === 'crash' ? 6000 : 8500;
          const q = e.kind === 'riser' || e.kind === 'whoosh' ? .5 : .8;
          const fc = 2 * Math.sin(Math.PI * Math.min(centre, 12000) / SAMPLE_RATE);
          low += fc * band; const high = n - low - q * band; band += fc * high;
          const v = e.kind === 'hat' || e.kind === 'openhat' || e.kind === 'crash' ? high : band;
          let env;
          if (e.kind === 'hat') env = Math.exp(-t / .035) * clamp(t / .0007);
          else if (e.kind === 'openhat') env = Math.exp(-t / .2) * clamp(t / .001) * release;
          else if (e.kind === 'crash') env = Math.exp(-t / .55) * clamp(t / .002) * release * (1 + .25 * Math.sin(TAU * 7 * t));
          else if (e.kind === 'riser') env = u * u * clamp(left / .04);
          else env = (.25 + .75 * u * u) * clamp(t / .15) * clamp(left / .03);
          s = v * env;
          if (e.kind === 'whoosh') { phase += (180 * 2 ** (2.2 * u)) / SAMPLE_RATE; s += .25 * Math.sin(TAU * phase) * env; }
          break;
        }
        default: throw new Error(`unknown kind ${e.kind}`);
      }
      bus.l[i] += s * e.gain * gl;
      bus.r[i] += s * e.gain * gr;
    }
  }
  // A: the pad, the arpeggio and the bass breathe with the kick (side-chain style ducking).
  const duck = new Float32Array(FRAMES).fill(1);
  if (a) for (const k of kicks) { const i0 = Math.round(k * SAMPLE_RATE); for (let i = i0; i < Math.min(FRAMES, i0 + Math.round(.3 * SAMPLE_RATE)); i++) duck[i] = Math.min(duck[i], 1 - .45 * Math.exp(-(i - i0) / SAMPLE_RATE / .09)); }
  // Reverb (small Schroeder) on the pad, the lead and a little of the drums.
  const wet = makeBus();
  for (const ch of ['l', 'r']) {
    const send = new Float32Array(FRAMES);
    for (let i = 0; i < FRAMES; i++) send[i] = buses.pad[ch][i] * .3 + buses.lead[ch][i] * .28 + buses.drums[ch][i] * .06 + buses.fx[ch][i] * .2;
    let stage = new Float32Array(FRAMES);
    for (const size of [1381, 1499, 1621, 1777]) {
      const length = size + (ch === 'r' ? 31 : 0), line = new Float32Array(length);
      const feedback = 10 ** (-3 * length / SAMPLE_RATE / 1.8);
      let damp = 0;
      for (let i = 0; i < FRAMES; i++) { const pos = i % length, value = line[pos]; stage[i] += value * .25; damp += (value - damp) * .4; line[pos] = send[i] + damp * feedback; }
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
      const t = i / SAMPLE_RATE, s = sectionAt(t);
      const d = duck[i];
      const raw = (buses.pad[ch][i] + buses.bass[ch][i]) * d + buses.lead[ch][i] * (a ? (.55 + .45 * d) : 1) + buses.drums[ch][i] + buses.fx[ch][i] + wet[ch][i] * .4;
      const sectionGain = s === 'build' ? .9 : 1;
      hpv = raw - prev + Math.exp(-TAU * 28 / SAMPLE_RATE) * hpv; prev = raw;   // DC / sub-rumble high-pass
      const left = FRAMES - 1 - i;
      const fade = left < fadeFrames ? Math.sin(clamp(left / fadeFrames) * Math.PI / 2) ** 2 : 1;
      const fadeIn = Math.sin(clamp(i / (.006 * SAMPLE_RATE)) * Math.PI / 2) ** 2;
      mix[ch][i] = hpv * fade * fadeIn * sectionGain;
    }
  }
  return mix;
}

// Look-ahead peak limiter (5 ms) to a sample-peak ceiling.
function limit(bus, gain, ceiling) {
  const look = Math.round(.005 * SAMPLE_RATE), rel = Math.exp(-1 / (.08 * SAMPLE_RATE));
  const out = makeBus(), peak = new Float32Array(FRAMES), need = new Float32Array(FRAMES);
  for (let i = 0; i < FRAMES; i++) peak[i] = Math.max(Math.abs(bus.l[i]), Math.abs(bus.r[i])) * gain;
  // Running maximum over the look-ahead window (a monotonic deque).
  const q = []; let head = 0;
  for (let i = FRAMES - 1; i >= 0; i--) {
    while (q.length > head && peak[q[q.length - 1]] <= peak[i]) q.pop();
    q.push(i);
    while (q[head] > i + look - 1) head++;
    const m = peak[q[head]];
    need[i] = m > ceiling ? ceiling / m : 1;
  }
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
  // Iterate: gain toward the target loudness, limit to a ceiling, measure the true peak, tighten the ceiling if needed.
  let gain = .3 / peak, ceiling = 10 ** (-2.2 / 20), result = null;
  const scratch = join(dirname(out), `.measure-${variant}-${process.pid}.wav`);
  try {
    for (let pass = 0; pass < 10; pass++) {
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
  console.log(`${arrangement.title} / ${arrangement.key} / ${BPM} BPM / ${DURATION_SECONDS}.000秒 -> ${out}`);
  console.log(JSON.stringify({ lufs: result.m.lufs, truePeak: result.m.truePeak, lra: result.m.lra, limiterActivePercent: +result.reducedPercent.toFixed(2), ceilingDb: +result.ceilingDb.toFixed(2), events: arrangement.events.length }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
