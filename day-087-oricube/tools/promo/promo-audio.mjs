/* Day087 "OriCube" promo BGM: 32 s, 90 BPM, 12 bars, 48 kHz stereo. Pure JS synthesis, no samples, no packages.
 * Usage (from the repository root):
 *   node day-087-oricube/tools/promo/promo-audio.mjs --variant a --out-dir <dir>   -> <dir>/bgm_a.wav (and bgm_a.mp3, 192 kbps)
 *   node day-087-oricube/tools/promo/promo-audio.mjs --variant b --out-dir <dir>   -> <dir>/bgm_b.wav
 * (--out-dir may also come from PROMO_OUT_DIR.) Then check with verify-audio.mjs.
 * a "和": plucked strings (koto-like additive partials, a buzzier shamisen-like voice for accents), a soft pad,
 *    a short yo-scale (D E G A B) figure repeated with small changes, soft low drum and a wood "pon".
 * b "やわらかいポップ": marimba and bell figures in F major, round bass, brush swishes and ticks.
 * Both follow the storyboard: no drums under the hook, drums out and a rising swell under "a diagram does not move",
 * the drop (kick, bass, a soft crash) exactly when the paper starts to move, more weight for stop/turn/spread,
 * the chorus for the works, a counter-melody under the crane, and a final chord with a fade.
 * Both: a quiet paper "pasa" (short filtered noise) on every fold landing (PAPER_CUES) and a soft tick on every tap (TAP_CUES).
 * Loudness: ffmpeg loudnorm only measures; the gain and a look-ahead peak limiter are applied here (target -16 LUFS, TP <= -1.5 dBTP).
 */
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BAR, BARS, BEAT, BPM, DURATION_SECONDS, MUSIC_CUES, PAPER_CUES, STORYBOARD, TAP_CUES, bar } from './timeline.mjs';

export const SAMPLE_RATE = 48_000;
export const TARGET_LUFS = -16;
const FRAMES = Math.round(SAMPLE_RATE * DURATION_SECONDS);
const TAU = 2 * Math.PI;
const ffmpeg = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const makeBus = () => ({ l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) });
const sceneAt = (time) => STORYBOARD.findLast((s) => time >= s.start - 1e-6) ?? STORYBOARD[0];

// The score, shared by the synthesis and the report.
export function createArrangement(variant = 'a') {
  if (!['a', 'b'].includes(variant)) throw new Error('--variant は a または b');
  const a = variant === 'a';
  // [name, bass midi, chord tones]
  const chords = a ? {
    D: ['Dsus2', 38, [57, 62, 64, 69]], G: ['G6', 43, [55, 59, 62, 64]], E: ['Em7', 40, [55, 59, 62, 67]],
    A: ['Asus4', 45, [57, 62, 64, 69]], Dend: ['Dadd9', 38, [50, 57, 62, 64, 66, 69]],
  } : {
    F: ['Fmaj7', 41, [57, 60, 64, 65]], D: ['Dm7', 38, [57, 60, 62, 65]], B: ['B♭maj7', 46, [57, 58, 62, 65]],
    C: ['C6', 36, [55, 60, 64, 69]], Fend: ['Fadd9', 41, [53, 57, 60, 65, 67, 72]],
  };
  const order = a ? ['D', 'G', 'E', 'A', 'D', 'G', 'E', 'A', 'G', 'A', 'E', 'Dend'] : ['F', 'D', 'B', 'C', 'F', 'D', 'B', 'C', 'B', 'C', 'D', 'Fend'];
  // Two-bar figures (beat, midi, length in beats). Yo scale for a; F major pentatonic-ish for b.
  const figures = a ? [
    [[0, 74, 1], [1, 71, .5], [1.5, 69, .5], [2, 71, 1], [3, 76, 1]],
    [[0, 74, .5], [.5, 76, .5], [1, 79, 1.5], [2.5, 76, .5], [3, 74, 1]],
    [[0, 69, 1], [1, 71, .5], [1.5, 74, .5], [2, 76, 1], [3, 71, 1]],
    [[0, 69, 1.5], [1.5, 67, .5], [2, 69, 2]],
  ] : [
    [[0, 72, .5], [.5, 77, .5], [1, 76, 1], [2, 72, .5], [2.5, 74, .5], [3, 69, 1]],
    [[0, 70, .5], [.5, 74, .5], [1, 72, 1.5], [2.5, 70, .5], [3, 69, 1]],
    [[0, 72, .5], [.5, 77, .5], [1, 79, 1], [2, 77, .5], [2.5, 76, .5], [3, 74, 1]],
    [[0, 72, 1], [1, 70, .5], [1.5, 69, .5], [2, 67, 2]],
  ];
  const events = [];
  const add = (kind, start, duration, midi, gain, pan = 0) => events.push({ kind, start, duration, midi, gain, pan });
  for (let n = 0; n < BARS; n++) {
    const start = bar(n), scene = sceneAt(start + 1e-3), music = scene.music;
    const [, bassMidi, tones] = chords[order[n]];
    const at = (b) => start + b * BEAT;
    const intro = music === 'intro', build = music === 'build', drop = music === 'drop', groove = music === 'groove', lift = music === 'lift';
    const chorus = music === 'chorus' || music === 'chorus2', counter = music === 'chorus2', end = music === 'resolve';
    const quiet = intro || build;   // no drums before the drop
    const level = intro ? .8 : build ? .62 : drop ? 1.08 : groove ? 1 : lift ? 1.05 : chorus ? 1.05 : 1;
    // Pad: whole bar, the last one rings into the fade. Under the build it holds back, then the drop opens it.
    for (const [v, midi] of tones.entries()) add('pad', start, end ? DURATION_SECONDS - start : BAR + .25, midi, (end ? .07 : build ? .045 : .055) * level, (v - (tones.length - 1) / 2) * .35);
    if (end) {
      // Final chord: a slow upward strum (a) / mallet roll (b), then only the decay.
      tones.forEach((midi, v) => add(a ? 'pluck' : 'marimba', start + v * .045, DURATION_SECONDS - start - v * .045, midi + 12, .2 - v * .015, (v - 2.5) * .22));
      add(a ? 'pluck' : 'bell', start, DURATION_SECONDS - start, a ? 74 + 12 : 84, .09, .1);
      add(a ? 'pon' : 'swish', start, .8, 0, a ? .16 : .05, 0);
      add('bass', start, DURATION_SECONDS - start, bassMidi, a ? .26 : .28, 0);
      continue;
    }
    // Lead figure: two bars per figure, a different one every second figure; the lift bar plays it an octave up.
    // Under the build only its first and middle notes sound (held back, waiting for the drop).
    const figure = figures[Math.floor(n / 2) % 4], half = n % 2;
    for (const [b, midi, len] of figure) {
      if (build && b !== 0 && b !== 2) continue;
      add(a ? 'pluck' : 'marimba', at(b), len * BEAT + .6, midi + (lift ? 12 : 0), (a ? .27 : .25) * level, a ? -.15 : -.1);
    }
    // Answer: the chord tones broken upward on the off-beats (second bar of each pair, and every chorus bar).
    if (!build && (half === 1 || chorus || drop)) {
      for (const [k, b] of [.5, 1.5, 2.5, 3.5].entries()) add(a ? 'pluck' : 'marimba', at(b), .9, tones[k % tones.length] + 12, (a ? .12 : .11) * level, a ? .35 : .3);
    }
    // Counter-melody under the crane: long chord tones high above the lead.
    if (counter) for (const [b, k, len] of [[0, 3, 1.5], [1.5, 2, .5], [2, 1, 2]]) add(a ? 'shamisen' : 'bell', at(b), len * BEAT + .5, tones[k] + 24 - (a ? 12 : 0), a ? .1 : .06, a ? .45 : .4);
    // Accent voice: shamisen-like (a) or bell (b) on the first beat of a figure, from the drop on.
    if (!quiet && half === 0) add(a ? 'shamisen' : 'bell', at(0), 1.2, (a ? 74 : 81) + (chorus ? 0 : -12), a ? .12 : .07, a ? .4 : .35);
    // Bass: one held note under the hook and the build, the walking figure from the drop on.
    if (!quiet) {
      for (const [b, interval] of [[0, 0], [1.5, 7], [2, 0], [3.5, 12]]) add('bass', at(b), BEAT * (b === 0 || b === 2 ? 1.4 : .45), bassMidi + interval, (a ? .22 : .24) * level, 0);
    } else {
      add('bass', at(0), BAR, bassMidi, build ? .12 : .16, 0);
    }
    if (quiet) continue;   // no drums under the hook and the build
    if (drop) { add('kick', at(0), .4, 0, .42, 0); add('crash', at(0), 1.6, 0, .07, 0); }
    if (a) {
      for (const b of chorus ? [0, 1.5, 2, 3] : [0, 2]) add('drum', at(b), .5, 0, (b === 0 ? .3 : .22) * level, 0);
      for (const b of chorus ? [1, 3, 3.5] : [3]) add('pon', at(b), .35, 0, .16 * level, b === 3.5 ? .3 : -.2);
    } else {
      for (const b of [1, 3]) add('swish', at(b) - .06, .42, 0, .085 * level, 0);
      for (let k = 0; k < 8; k++) add('tick', at(k / 2 + .5) - .25, .06, 0, (k % 2 ? .05 : .032) * level, k % 2 ? .3 : -.3);
      for (const b of [0, 2]) add('kick', at(b), .3, 0, .3 * level, 0);
    }
  }
  // Build: a swell that rises through the bar and stops right at the drop.
  add('swell', MUSIC_CUES.buildAt, MUSIC_CUES.dropAt - MUSIC_CUES.buildAt, 0, .12, 0);
  // Lift: a softer swell into the chorus.
  add('swell', MUSIC_CUES.liftAt, MUSIC_CUES.chorusAt - MUSIC_CUES.liftAt, 0, .08, 0);
  // Paper: a quiet "pasa" on every fold landing; a soft tick on every tap.
  for (const cue of PAPER_CUES) add('paper', cue - .004, .16, 0, .3, (cue * 7.3 % 1) * .6 - .3);
  for (const cue of TAP_CUES) add('tap', cue, .08, 0, .1, 0);
  events.sort((x, y) => x.start - y.start);
  return { variant, title: a ? '和（弦をはじく音・陽旋法）' : 'やわらかいポップ（マリンバとベル）', key: a ? 'D yo scale' : 'F major', bpm: BPM, bars: BARS,
    chords: order.map((key, n) => ({ at: bar(n), name: chords[key][0] })), paperCues: PAPER_CUES, tapCues: TAP_CUES, events };
}

function randomFactory(seed) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}

function synthesize(arrangement) {
  const names = ['pad', 'lead', 'bass', 'drums', 'paper'];
  const buses = Object.fromEntries(names.map((name) => [name, makeBus()]));
  const random = randomFactory(arrangement.variant === 'a' ? 0x87a : 0x87b);
  for (const e of arrangement.events) {
    const busName = e.kind === 'pad' || e.kind === 'swell' ? 'pad' : e.kind === 'bass' ? 'bass'
      : ['drum', 'pon', 'swish', 'tick', 'kick', 'crash'].includes(e.kind) ? 'drums' : e.kind === 'paper' || e.kind === 'tap' ? 'paper' : 'lead';
    const bus = buses[busName];
    const gl = Math.cos((e.pan + 1) * Math.PI / 4), gr = Math.sin((e.pan + 1) * Math.PI / 4);
    const f = hz(e.midi);
    const first = Math.max(0, Math.round(e.start * SAMPLE_RATE)), last = Math.min(FRAMES, Math.round((e.start + e.duration) * SAMPLE_RATE));
    let lp = 0, lp2 = 0, hp = 0, band = 0, low = 0, phase = 0;
    // Per-note random detail (pluck noise, paper crackle) is drawn once so both channels match.
    const crackle = e.kind === 'paper' ? Array.from({ length: 9 }, () => [random() * .1, .3 + random() * .7]) : null;
    for (let i = first; i < last; i++) {
      const t = (i - first) / SAMPLE_RATE, left = e.duration - t;
      const release = clamp(left / .03);
      let s = 0;
      switch (e.kind) {
        case 'pluck': case 'shamisen': {
          // Additive plucked string: slightly stretched partials, higher ones die faster; a short noise for the pick.
          const buzz = e.kind === 'shamisen';
          for (let k = 1; k <= (buzz ? 10 : 7); k++) {
            const amp = Math.abs(Math.sin(k * Math.PI * (buzz ? .12 : .23))) / k ** (buzz ? .8 : 1.15);
            s += amp * Math.sin(TAU * f * k * (1 + .0007 * k * k) * t) * Math.exp(-t * (buzz ? 2.4 + 1.4 * k : 1.3 + .9 * k));
          }
          const n = random() * 2 - 1;
          hp = .5 * hp + .5 * n;
          s = s * .55 + (n - hp) * .25 * Math.exp(-t / .004);
          s *= clamp(t / .0015) * release;
          break;
        }
        case 'marimba': {
          // Marimba-like: fundamental + 4th partial (~3.9x), quick decays; a soft mallet thump.
          s = Math.sin(TAU * f * t) * Math.exp(-t * 3.2) + .35 * Math.sin(TAU * f * 3.93 * t) * Math.exp(-t * 11)
            + .08 * Math.sin(TAU * f * 9.2 * t) * Math.exp(-t * 30) + .18 * Math.sin(TAU * 110 * t) * Math.exp(-t / .008);
          s *= clamp(t / .002) * release * .7;
          break;
        }
        case 'bell': {
          const mod = Math.sin(TAU * f * 3.5 * t) * 2.2 * Math.exp(-t * 3);
          s = Math.sin(TAU * f * t + mod) * Math.exp(-t * 1.6) * clamp(t / .002) * release * .6;
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
        case 'drum': {
          // Soft low drum: falling sine and a little skin noise.
          phase += (58 + 70 * Math.exp(-t / .03)) / SAMPLE_RATE;
          const n = random() * 2 - 1; lp += (n - lp) * .08;
          s = (Math.sin(TAU * phase) * Math.exp(-t / .16) + lp * .6 * Math.exp(-t / .03)) * clamp(t / .002) * release;
          break;
        }
        case 'kick': {
          phase += (52 + 60 * Math.exp(-t / .02)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .11) * clamp(t / .002) * release;
          break;
        }
        case 'tap': {
          // A soft finger tap: a short high wooden click.
          phase += (1900 + 900 * Math.exp(-t / .004)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .012) * clamp(t / .0008) * release;
          break;
        }
        case 'pon': {
          phase += (420 + 260 * Math.exp(-t / .012)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .045) * clamp(t / .001) * release;
          break;
        }
        case 'swish': case 'tick': case 'swell': case 'paper': case 'crash': {
          const n = random() * 2 - 1;
          // Band-passed noise (state-variable filter) with a per-kind centre and envelope.
          const centre = e.kind === 'swell' ? 600 * 2 ** (3 * t / e.duration) : e.kind === 'paper' ? 3400 : e.kind === 'tick' ? 7000 : e.kind === 'crash' ? 5200 : 2600;
          const q = e.kind === 'paper' ? .9 : .7;
          const fc = 2 * Math.sin(Math.PI * Math.min(centre, 16000) / SAMPLE_RATE);
          low += fc * band; const high = n - low - q * band; band += fc * high;
          let env;
          if (e.kind === 'swish') env = Math.sin(Math.PI * clamp(t / e.duration)) ** 2;
          else if (e.kind === 'tick') env = Math.exp(-t / .012) * clamp(t / .0008);
          else if (e.kind === 'swell') env = (t / e.duration) ** 2 * clamp(left / .05);
          else if (e.kind === 'crash') env = Math.exp(-t / .45) * clamp(t / .002) * release;
          else {
            // Paper: a quick crumple (a few crackles) over a short hiss.
            env = Math.exp(-t / .035) * clamp(t / .002);
            for (const [at, amp] of crackle) { const d = t - at; if (d >= 0) env += amp * .7 * Math.exp(-d / .006); }
            env *= clamp(left / .02);
          }
          s = band * env;
          break;
        }
        default: throw new Error(`unknown kind ${e.kind}`);
      }
      bus.l[i] += s * e.gain * gl;
      bus.r[i] += s * e.gain * gr;
    }
  }
  // Reverb (small Schroeder): pad, lead and a little paper.
  const wet = makeBus();
  for (const ch of ['l', 'r']) {
    const send = new Float32Array(FRAMES);
    for (let i = 0; i < FRAMES; i++) send[i] = buses.pad[ch][i] * .25 + buses.lead[ch][i] * .3 + buses.drums[ch][i] * .08 + buses.paper[ch][i] * .1;
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
      const raw = buses.pad[ch][i] + buses.lead[ch][i] + buses.bass[ch][i] + buses.drums[ch][i] + buses.paper[ch][i] + wet[ch][i] * .35;
      hpv = raw - prev + Math.exp(-TAU * 30 / SAMPLE_RATE) * hpv; prev = raw;
      // A gentle fade over the last seconds so the end chord settles exactly at 32.000 s (last sample 0).
      const left = FRAMES - 1 - i;
      const fade = left < fadeFrames ? Math.sin(clamp(left / fadeFrames) * Math.PI / 2) ** 2 : 1;
      // A 6 ms fade-in: the first pluck starts on sample 0, and its pick noise would otherwise click.
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
  // Running maximum over the look-ahead window.
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
