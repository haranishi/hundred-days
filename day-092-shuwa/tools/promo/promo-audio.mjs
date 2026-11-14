/* Day092 "てことば" promo BGM: 32 s, 90 BPM, 12 bars, 48 kHz stereo. Pure JS synthesis, no samples, no packages.
 * Usage (from the repository root):
 *   node day-092-shuwa/tools/promo/promo-audio.mjs --variant a --out-dir <dir>   -> <dir>/bgm_a.wav (and bgm_a.mp3, 192 kbps)
 *   node day-092-shuwa/tools/promo/promo-audio.mjs --variant b --out-dir <dir>   -> <dir>/bgm_b.wav
 * (--out-dir may also come from PROMO_OUT_DIR.) Then check with verify-audio.mjs.
 * a "やわらかいピアノポップ": G major, a soft electric piano melody in a 3+3+2 rhythm, warm pad, round bass, finger snaps and shaker.
 * b "カリンバと手拍子": A major, kalimba arpeggios in eighths, plucked bass, hand claps on 2 and 4 (a nod to "hands").
 * Both melodies were written for this video (bar by bar over the chords below); neither reuses Day087's figures.
 * Both follow the storyboard: no drums under the hook (IV), drums out and a rising swell under "the chart is the other
 * person's view" (V), the drop on the tonic exactly when the view switches to your own (kick, bass, a soft crash), more
 * weight for turning and the slow sign, the chorus for the lesson, the name and the dictionary, a counter-melody under
 * the streak, and a final chord with a fade.
 * Both: a small bright "kira" where a hand shape lands (SHAPE_CUES) and a soft tick on every tap (TAP_CUES).
 * Loudness: ffmpeg loudnorm only measures; the gain and a look-ahead peak limiter are applied here (target -16 LUFS, TP <= -1.5 dBTP).
 */
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BAR, BARS, BEAT, BPM, DURATION_SECONDS, MUSIC_CUES, SHAPE_CUES, STORYBOARD, TAP_CUES, bar } from './timeline.mjs';

export const SAMPLE_RATE = 48_000;
export const TARGET_LUFS = -16;
const FRAMES = Math.round(SAMPLE_RATE * DURATION_SECONDS);
const TAU = 2 * Math.PI;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const makeBus = () => ({ l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) });
const sceneAt = (time) => STORYBOARD.findLast((s) => time >= s.start - 1e-6) ?? STORYBOARD[0];

// The score, shared by the synthesis and the report.
// Each bar: [chord name, bass midi, chord tones, melody [beat, midi, length in beats]].
const SCORE = {
  a: [   // G major. Hook on IV, build on V, the drop lands on I.
    ['Cadd9', 36, [55, 60, 62, 64], [[0, 76, 1.5], [1.5, 74, .5], [2, 79, 2]]],
    ['D', 38, [54, 57, 62, 66], [[0, 78, 1.5], [1.5, 76, .5], [2, 74, 1], [3, 69, 1]]],
    ['G', 43, [55, 59, 62, 67], [[0, 74, .75], [.75, 76, .75], [1.5, 79, .5], [2, 83, .75], [2.75, 81, .75], [3.5, 79, .5]]],
    ['Em7', 40, [55, 59, 62, 64], [[0, 79, .75], [.75, 78, .75], [1.5, 76, .5], [2, 74, 1], [3, 71, 1]]],
    ['Cadd9', 36, [55, 60, 62, 64], [[0, 76, .75], [.75, 79, .75], [1.5, 81, .5], [2, 79, .75], [2.75, 76, .75], [3.5, 74, .5]]],
    ['D', 38, [54, 57, 62, 66], [[0, 78, .75], [.75, 81, .75], [1.5, 86, .5], [2, 81, 1], [3, 78, .5], [3.5, 76, .5]]],
    ['G', 43, [55, 59, 62, 67], [[0, 74, .75], [.75, 79, .75], [1.5, 83, .5], [2, 81, .75], [2.75, 79, .75], [3.5, 74, .5]]],
    ['D/F#', 42, [54, 57, 62, 66], [[0, 76, .75], [.75, 78, .75], [1.5, 81, .5], [2, 78, 1], [3, 74, 1]]],
    ['Em7', 40, [55, 59, 62, 64], [[0, 71, .75], [.75, 74, .75], [1.5, 76, .5], [2, 79, .75], [2.75, 78, .75], [3.5, 76, .5]]],
    ['Cadd9', 36, [55, 60, 62, 64], [[0, 79, .75], [.75, 76, .75], [1.5, 74, .5], [2, 76, 1], [3, 79, 1]]],
    ['D', 38, [54, 57, 62, 66], [[0, 81, .75], [.75, 79, .75], [1.5, 78, .5], [2, 76, .75], [2.75, 78, .75], [3.5, 81, .5]]],
    ['Gadd9', 43, [55, 59, 62, 67, 69, 74], [[0, 79, 4]]],
  ],
  b: [   // A major. Kalimba in eighths; the same harmonic plan (IV, V, then I at the drop).
    ['Dadd9', 38, [57, 62, 64, 66], [[0, 69, .5], [.5, 74, .5], [1, 76, .5], [1.5, 78, .5], [2, 76, .5], [2.5, 74, .5], [3, 69, 1]]],
    ['E', 40, [56, 59, 64, 66], [[0, 71, .5], [.5, 76, .5], [1, 78, .5], [1.5, 80, .5], [2, 78, .5], [2.5, 76, .5], [3, 71, 1]]],
    ['A', 45, [57, 61, 64, 69], [[0, 76, .5], [.5, 81, .5], [1, 80, .5], [1.5, 81, .5], [2, 83, .5], [2.5, 85, .5], [3, 81, 1]]],
    ['F#m7', 42, [57, 61, 64, 66], [[0, 78, .5], [.5, 81, .5], [1, 85, .5], [1.5, 83, .5], [2, 81, .5], [2.5, 78, .5], [3, 76, 1]]],
    ['Dmaj7', 38, [57, 61, 62, 66], [[0, 74, .5], [.5, 78, .5], [1, 81, .5], [1.5, 85, .5], [2, 83, .5], [2.5, 81, .5], [3, 78, 1]]],
    ['E', 40, [56, 59, 64, 66], [[0, 76, .5], [.5, 80, .5], [1, 83, .5], [1.5, 80, .5], [2, 78, .5], [2.5, 76, .5], [3, 71, 1]]],
    ['A', 45, [57, 61, 64, 69], [[0, 81, .5], [.5, 85, .5], [1, 88, .5], [1.5, 85, .5], [2, 83, .5], [2.5, 81, .5], [3, 76, 1]]],
    ['E/G#', 44, [56, 59, 64, 68], [[0, 80, .5], [.5, 83, .5], [1, 88, .5], [1.5, 83, .5], [2, 80, .5], [2.5, 78, .5], [3, 76, 1]]],
    ['F#m7', 42, [57, 61, 64, 66], [[0, 78, .5], [.5, 81, .5], [1, 85, .5], [1.5, 88, .5], [2, 85, .5], [2.5, 81, .5], [3, 83, 1]]],
    ['Dmaj7', 38, [57, 61, 62, 66], [[0, 81, .5], [.5, 78, .5], [1, 74, .5], [1.5, 78, .5], [2, 81, .5], [2.5, 85, .5], [3, 83, 1]]],
    ['E', 40, [56, 59, 64, 66], [[0, 83, .5], [.5, 80, .5], [1, 76, .5], [1.5, 80, .5], [2, 83, .5], [2.5, 88, .5], [3, 85, 1]]],
    ['Aadd9', 45, [57, 61, 64, 69, 71, 76], [[0, 81, 4]]],
  ],
};

export function createArrangement(variant = 'a') {
  if (!['a', 'b'].includes(variant)) throw new Error('--variant は a または b');
  const a = variant === 'a', score = SCORE[variant];
  const lead = a ? 'epiano' : 'kalimba';
  const events = [];
  const endAt = MUSIC_CUES.endChordAt;
  let cutoff = DURATION_SECONDS;   // notes of a bar cut short by the end chord must start before it
  const add = (kind, start, duration, midi, gain, pan = 0) => { if (start < cutoff - 1e-6) events.push({ kind, start, duration, midi, gain, pan }); };
  for (let n = 0; n < BARS - 1; n++) {
    const start = bar(n), music = sceneAt(start + 1e-3).music;
    if (start >= endAt - 1e-6) break;
    cutoff = Math.min(bar(n + 1), endAt);
    const [, bassMidi, tones, melody] = score[n];
    const at = (b) => start + b * BEAT;
    const intro = music === 'intro', build = music === 'build', drop = music === 'drop', groove = music === 'groove', lift = music === 'lift';
    const chorus = music === 'chorus' || music === 'chorus2', counter = music === 'chorus2';
    const quiet = intro || build;   // no drums before the drop
    const level = intro ? .8 : build ? .62 : drop ? 1.08 : groove ? 1 : lift ? 1.05 : chorus ? 1.05 : 1;
    // Pad: the whole bar (or up to the end chord); held back under the build, opened by the drop.
    for (const [v, midi] of tones.entries()) add('pad', start, cutoff - start + .25, midi, (build ? .042 : .052) * level, (v - (tones.length - 1) / 2) * .34);
    // Melody: under the build only the notes on beats 1 and 3 sound (held back, waiting for the drop); the lift doubles it an octave up.
    for (const [b, midi, len] of melody) {
      if (build && b !== 0 && b !== 2) continue;
      add(lead, at(b), len * BEAT + .55, midi, (a ? .25 : .24) * level, a ? -.12 : -.08);
      if (lift || counter) add(lead, at(b) + .012, len * BEAT + .4, midi + 12, (a ? .07 : .06) * level, a ? .3 : .25);
    }
    // Answer: the chord tones broken upward on the off-beats, from the drop on.
    if (!quiet) for (const [k, b] of [.5, 1.5, 2.5, 3.5].entries()) add(lead, at(b), .8, tones[k % tones.length] + 12, (a ? .085 : .075) * level, a ? .36 : .3);
    // Counter-melody under the streak: long chord tones high above the lead.
    if (counter) for (const [b, k, len] of [[0, 3, 1.5], [1.5, 2, .5], [2, 1, 2]]) add('bell', at(b), len * BEAT + .5, tones[k] + 24, .045, -.4);
    // Bass: one held note under the hook and the build; from the drop a pop figure (1, the "and" of 2, 3) or a pluck (b).
    if (!quiet) {
      const figure = a ? [[0, 0, 1.2], [1.5, 0, .45], [2, 7, .9], [3.5, 12, .4]] : [[0, 0, .9], [1.5, 12, .4], [2, 0, .9], [3.5, 7, .4]];
      for (const [b, interval, len] of figure) add(a ? 'bass' : 'pluckbass', at(b), BEAT * len, bassMidi + interval, (a ? .23 : .25) * level, 0);
    } else {
      add('bass', at(0), BAR, bassMidi, build ? .11 : .15, 0);
    }
    if (quiet) continue;   // no drums under the hook and the build
    if (drop) { add('kick', at(0), .45, 0, .44, 0); add('crash', at(0), 1.6, 0, .075, 0); }
    for (const b of chorus ? [0, 1.5, 2, 3] : [0, 2]) add('kick', at(b), .32, 0, (b === 0 ? .34 : .27) * level, 0);
    for (const b of [1, 3]) add(a ? 'snap' : 'clap', at(b), a ? .18 : .26, 0, (a ? .12 : .13) * level, a ? .12 : -.08);
    for (let k = 0; k < 8; k++) add('shaker', at(k / 2 + .25) - .02, .09, 0, (k % 2 ? .05 : .034) * level, k % 2 ? .28 : -.28);
  }
  // Final chord with the end card (it starts mid-bar, on beat 42): a slow upward roll, the melody's last note on top, the decay.
  {
    cutoff = DURATION_SECONDS;
    const [, bassMidi, tones, melody] = score.at(-1), length = DURATION_SECONDS - endAt;
    for (const [v, midi] of tones.entries()) add('pad', endAt, length, midi, .068, (v - (tones.length - 1) / 2) * .34);
    tones.forEach((midi, v) => add(lead, endAt + v * .05, length - v * .05, midi + 12, .19 - v * .014, (v - 2.5) * .22));
    add(lead, endAt, length, melody[0][1], .2, .05);
    add('bell', endAt + .02, length, melody[0][1] + 12, .05, -.2);
    add('bass', endAt, length, bassMidi, a ? .26 : .27, 0);
  }
  // Build: a swell that rises through the bar and stops right at the drop. Lift: a softer swell into the chorus.
  add('swell', MUSIC_CUES.buildAt, MUSIC_CUES.dropAt - MUSIC_CUES.buildAt, 0, .12, 0);
  add('swell', MUSIC_CUES.liftAt + BAR / 2, MUSIC_CUES.chorusAt - MUSIC_CUES.liftAt - BAR / 2, 0, .07, 0);
  // A small bright "kira" where a hand shape lands; a soft tick on every tap.
  for (const cue of SHAPE_CUES) add('kira', cue - .003, .42, a ? 95 : 93, .16, (cue * 7.3 % 1) * .5 - .25);
  for (const cue of TAP_CUES) add('tap', cue, .08, 0, .1, 0);
  events.sort((x, y) => x.start - y.start);
  return { variant, title: a ? 'やわらかいピアノポップ（エレピ・ト長調）' : 'カリンバと手拍子（イ長調）', key: a ? 'G major' : 'A major', bpm: BPM, bars: BARS,
    chords: score.map(([name], n) => ({ at: n === score.length - 1 ? endAt : bar(n), name })), shapeCues: SHAPE_CUES, tapCues: TAP_CUES, events };
}

function randomFactory(seed) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}

function synthesize(arrangement) {
  const names = ['pad', 'lead', 'bass', 'drums', 'cue'];
  const buses = Object.fromEntries(names.map((name) => [name, makeBus()]));
  const random = randomFactory(arrangement.variant === 'a' ? 0x92a : 0x92b);
  for (const e of arrangement.events) {
    const busName = e.kind === 'pad' || e.kind === 'swell' ? 'pad' : e.kind === 'bass' || e.kind === 'pluckbass' ? 'bass'
      : ['kick', 'snap', 'clap', 'shaker', 'crash'].includes(e.kind) ? 'drums' : e.kind === 'kira' || e.kind === 'tap' ? 'cue' : 'lead';
    const bus = buses[busName];
    const gl = Math.cos((e.pan + 1) * Math.PI / 4), gr = Math.sin((e.pan + 1) * Math.PI / 4);
    const f = hz(e.midi);
    const first = Math.max(0, Math.round(e.start * SAMPLE_RATE)), last = Math.min(FRAMES, Math.round((e.start + e.duration) * SAMPLE_RATE));
    let hp = 0, low = 0, band = 0, phase = 0;
    // Per-note random detail (a clap's three slaps) is drawn once so both channels match.
    const slaps = e.kind === 'clap' ? [0, .009 + random() * .003, .019 + random() * .004] : null;
    for (let i = first; i < last; i++) {
      const t = (i - first) / SAMPLE_RATE, left = e.duration - t;
      const release = clamp(left / .03);
      let s = 0;
      switch (e.kind) {
        case 'epiano': {
          // Soft electric piano: a phase-modulated sine whose brightness fades quickly, a 2nd partial and a short tine.
          const index = 1.4 * Math.exp(-t * 7) + .22;
          s = Math.sin(TAU * f * t + index * Math.sin(TAU * f * t)) * Math.exp(-t * 2.1)
            + .22 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 4.5) + .07 * Math.sin(TAU * f * 7.1 * t) * Math.exp(-t * 34);
          s *= clamp(t / .002) * release * .62;
          break;
        }
        case 'kalimba': {
          // Kalimba tine: the fundamental rings, an inharmonic overtone (~5.4x) dies fast, a tiny click at the pluck.
          const n = random() * 2 - 1;
          hp = .6 * hp + .4 * n;
          s = Math.sin(TAU * f * t) * Math.exp(-t * 3.1) + .3 * Math.sin(TAU * f * 5.43 * t) * Math.exp(-t * 16)
            + .08 * Math.sin(TAU * f * 9.8 * t) * Math.exp(-t * 36) + (n - hp) * .18 * Math.exp(-t / .003);
          s *= clamp(t / .0012) * release * .66;
          break;
        }
        case 'bell': {
          const mod = Math.sin(TAU * f * 3.5 * t) * 2 * Math.exp(-t * 3);
          s = Math.sin(TAU * f * t + mod) * Math.exp(-t * 1.6) * clamp(t / .002) * release * .6;
          break;
        }
        case 'kira': {
          // A small bright chime: FM at ratio 2 (energy from about 2 to 6 kHz), very short, with a light shimmer of noise.
          const n = random() * 2 - 1;
          const fc = 2 * Math.sin(Math.PI * 6500 / SAMPLE_RATE);
          low += fc * band; const high = n - low - .8 * band; band += fc * high;
          s = Math.sin(TAU * f * t + 2.2 * Math.exp(-t * 9) * Math.sin(TAU * f * 2 * t)) * Math.exp(-t * 7.5)
            + .45 * Math.sin(TAU * f * 1.5 * t) * Math.exp(-t * 11) + band * .25 * Math.exp(-t / .03);
          s *= clamp(t / .0015) * release * .7;
          break;
        }
        case 'pad': {
          const soft = .62 * Math.sin(TAU * f * t + .3 * Math.sin(TAU * .35 * t)) + .25 * Math.sin(TAU * f * 2.003 * t) + .13 * Math.sin(TAU * f * .5 * t);
          s = soft * Math.sin(clamp(t / .5) * Math.PI / 2) * Math.sin(clamp(left / .45) * Math.PI / 2);
          break;
        }
        case 'bass': {
          const env = clamp(t / .006) * Math.exp(-t * 1.2) * release;
          s = (.85 * Math.sin(TAU * f * t) + .15 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 6)) * env;
          break;
        }
        case 'pluckbass': {
          const env = clamp(t / .004) * Math.exp(-t * 3.2) * release;
          s = (.8 * Math.sin(TAU * f * t) + .22 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 9) + .08 * Math.sin(TAU * f * 3 * t) * Math.exp(-t * 14)) * env;
          break;
        }
        case 'kick': {
          phase += (50 + 62 * Math.exp(-t / .02)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .11) * clamp(t / .002) * release;
          break;
        }
        case 'tap': {
          // A soft finger tap: a short high wooden click.
          phase += (1900 + 900 * Math.exp(-t / .004)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .012) * clamp(t / .0008) * release;
          break;
        }
        case 'snap': case 'clap': case 'shaker': case 'swell': case 'crash': {
          const n = random() * 2 - 1;
          // Band-passed noise (state-variable filter) with a per-kind centre and envelope.
          const centre = e.kind === 'swell' ? 600 * 2 ** (3 * t / e.duration) : e.kind === 'snap' ? 2100 : e.kind === 'clap' ? 1350 : e.kind === 'shaker' ? 7600 : 5200;
          const q = e.kind === 'clap' ? .9 : e.kind === 'snap' ? .55 : .7;
          const fc = 2 * Math.sin(Math.PI * Math.min(centre, 16000) / SAMPLE_RATE);
          low += fc * band; const high = n - low - q * band; band += fc * high;
          let env;
          if (e.kind === 'snap') env = Math.exp(-t / .028) * clamp(t / .0007) * release;
          else if (e.kind === 'clap') { env = 0; for (const at of slaps) { const d = t - at; if (d >= 0) env += Math.exp(-d / (at === slaps[2] ? .05 : .008)); } env *= clamp(t / .0007) * release * .8; }
          else if (e.kind === 'shaker') env = Math.sin(Math.PI * clamp(t / e.duration)) ** 3;
          else if (e.kind === 'swell') env = (t / e.duration) ** 2 * clamp(left / .05);
          else env = Math.exp(-t / .45) * clamp(t / .002) * release;
          s = band * env + (e.kind === 'snap' ? .35 * Math.sin(TAU * 215 * t) * Math.exp(-t / .012) : 0);
          break;
        }
        default: throw new Error(`unknown kind ${e.kind}`);
      }
      bus.l[i] += s * e.gain * gl;
      bus.r[i] += s * e.gain * gr;
    }
  }
  // Reverb (small Schroeder): pad, lead and a little of the cues.
  const wet = makeBus();
  for (const ch of ['l', 'r']) {
    const send = new Float32Array(FRAMES);
    for (let i = 0; i < FRAMES; i++) send[i] = buses.pad[ch][i] * .25 + buses.lead[ch][i] * .3 + buses.drums[ch][i] * .07 + buses.cue[ch][i] * .14;
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
      const raw = buses.pad[ch][i] + buses.lead[ch][i] + buses.bass[ch][i] + buses.drums[ch][i] + buses.cue[ch][i] + wet[ch][i] * .35;
      hpv = raw - prev + Math.exp(-TAU * 30 / SAMPLE_RATE) * hpv; prev = raw;
      // A gentle fade over the last seconds so the end chord settles exactly at 32.000 s (last sample 0).
      const left = FRAMES - 1 - i;
      const fade = left < fadeFrames ? Math.sin(clamp(left / fadeFrames) * Math.PI / 2) ** 2 : 1;
      // A 6 ms fade-in: the first note starts on sample 0 and would otherwise click.
      const fadeIn = Math.sin(clamp(i / (.006 * SAMPLE_RATE)) * Math.PI / 2) ** 2;
      mix[ch][i] = hpv * fade * fadeIn;
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
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-i', file, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
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
  // MP3 copy (192 kbps) for the shared drive.
  const mp3 = out.replace(/\.wav$/, '.mp3');
  const enc = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-nostdin', '-i', out, '-c:a', 'libmp3lame', '-b:a', '192k', '-map_metadata', '-1', mp3], { encoding: 'utf8' });
  if (enc.status !== 0) throw new Error(`mp3 に書き出せません: ${enc.stderr}`);
  console.log(`${arrangement.title} / ${arrangement.key} / ${BPM} BPM / ${DURATION_SECONDS}.000秒 -> ${out}`);
  console.log(JSON.stringify({ lufs: result.m.lufs, truePeak: result.m.truePeak, lra: result.m.lra, limiterActivePercent: +result.reducedPercent.toFixed(2), ceilingDb: +result.ceilingDb.toFixed(2) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
