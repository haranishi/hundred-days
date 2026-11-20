// Day095 promo score: 29.333 s (11 bars) at 90 BPM, 48 kHz stereo, synthesized in JS without samples.
// A uses yo-scale strings and wooden percussion. B uses marimba and bells in F major.
// ffmpeg measures and encodes the mix; gain and the look-ahead limiter are applied in JS.
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BAR, BARS, BEAT, BPM, DURATION_SECONDS, MUSIC_CUES, SEASON_CUES, SHUTTER_CUES, SNIP_CUES, STORYBOARD, TAP_CUES, UNDO_CUES, WIRE_CUES, bar } from './timeline.mjs';

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
export function createArrangement(variant = 'a') {
  if (!['a', 'b'].includes(variant)) throw new Error('--variant は a または b');
  const a = variant === 'a';
  // [name, bass midi, chord tones]
  const chords = a ? {
    D: ['Dsus2', 38, [57, 62, 64, 69]], G: ['G6', 43, [55, 59, 62, 64]], E: ['Em7', 40, [55, 59, 62, 67]],
    A: ['Asus4', 45, [57, 62, 64, 69]], Dend: ['D5(add9)', 38, [50, 57, 62, 64, 69]],
  } : {
    F: ['Fmaj7', 41, [57, 60, 64, 65]], D: ['Dm7', 38, [57, 60, 62, 65]], B: ['B♭maj7', 46, [57, 58, 62, 65]],
    C: ['C6', 36, [55, 60, 64, 69]], Fend: ['Fadd9', 41, [53, 57, 60, 65, 67, 72]],
  };
  const order = a ? ['D', 'G', 'E', 'A', 'D', 'G', 'E', 'A', 'G', 'A', 'Dend', 'Dend'] : ['F', 'D', 'B', 'C', 'F', 'D', 'B', 'C', 'B', 'C', 'Fend', 'Fend'];
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
    const end = music === 'resolve';
    if (end && start !== MUSIC_CUES.endChordAt) continue;
    const intro = music === 'intro', drop = music === 'drop', groove = music === 'groove', lift = music === 'lift';
    const chorus = music.startsWith('chorus'), counter = music === 'chorus2';
    const level = intro ? .58 : drop ? 1 : groove ? .9 : lift ? 1 : 1.12;
    const voice = a ? 'pluck' : 'marimba';
    const length = end ? DURATION_SECONDS - start : BAR + .25;
    for (const [v, midi] of tones.entries()) add('pad', start, length, midi, (end ? .082 : .051) * level, (v - (tones.length - 1) / 2) * .35);
    if (end) {
      // A single final chord at bar 10 carries through bar 11 and the fade.
      tones.forEach((midi, v) => add(voice, start + v * .045, length - v * .045, midi + 12, .20 - v * .015, (v - 2.5) * .22));
      add(a ? 'pluck' : 'bell', start + .23, 2.6, a ? 86 : 84, .09, .1);
      add('bass', start, length, bassMidi, .28, 0);
      continue;
    }
    const figure = intro
      ? (a ? [[0, 74, 1], [1.5, 69, .75], [2.75, 71, .75]] : [[0, 72, 1], [1.5, 77, .75], [2.75, 76, .75]])
      : figures[Math.floor(n / 2) % figures.length];
    for (const [b, midi, len] of figure) {
      if (drop && b >= 2.5) continue;
      add(voice, at(b), len * BEAT + .5, midi + (lift && b === 0 ? 12 : 0), (a ? .25 : .21) * level, -.15);
    }
    if (intro) {
      if (!a) add('bell', at(2), 1.2, 84, .033, .3);
      continue;
    }
    if (n % 2 || chorus) {
      const beats = drop ? [.5, 1.5] : [.5, 1.5, 2.5, 3.5];
      for (const [k, b] of beats.entries()) add(voice, at(b), .9, tones[k] + 12, .10 * level, .35);
    }
    if (counter) {
      for (const [b, k, len] of [[0, 3, 1], [1.5, 2, .5], [2.5, 1, 1]]) {
        add(a ? 'pluck' : 'bell', at(b), len * BEAT + .4, tones[k] + 24 - (a ? 12 : 0), .072, .4);
      }
    } else if (chorus || lift) {
      add(a ? 'pluck' : 'bell', at(0), 1.2, tones[2] + 24, .077, .4);
    }
    for (const [b, midi, len] of [[0, bassMidi, 1.3], [1.5, bassMidi + 7, .42], [2, bassMidi, 1.3], [3.5, bassMidi + 12, .42]]) {
      if (drop && b === 2) continue;
      add('bass', at(b), BEAT * len, midi, .22 * level);
    }
    for (const b of chorus ? [0, 1.5, 2, 3] : [0, 2]) {
      if (drop && b === 2) continue;
      add(a ? 'drum' : 'kick', at(b), .5, 0, (drop ? .47 : b === 0 ? .29 : .19) * level);
    }
    for (const b of drop ? [1] : chorus ? [1, 3, 3.5] : [1, 3]) {
      add(a ? 'pon' : 'swish', at(b), .3, 0, (a ? .13 : .08) * level, -.22);
    }
  }
  add('breath', 0, MUSIC_CUES.introEnd, 0, .09);
  add('swell', MUSIC_CUES.liftAt, MUSIC_CUES.chorusAt - MUSIC_CUES.liftAt, 0, .07);
  add('kick', MUSIC_CUES.dropAt, .32, 0, .18);
  for (const cue of SNIP_CUES) add('snip', cue, .125, 0, .58, .16);
  for (const cue of UNDO_CUES) add('undo', cue, .29, 0, .16, -.12);
  for (const cue of WIRE_CUES) add('pluck', cue, .15, 96, .36, .17);
  for (const cue of SEASON_CUES) {
    [74, 76, 81].forEach((midi, i) => add('bell', cue + i * .108, .58, midi, .11 - i * .009, -.2 + i * .2));
  }
  for (const cue of SHUTTER_CUES) add('shutter', cue, .14, 0, .65, -.1);
  for (const cue of TAP_CUES) add('tap', cue, .08, 0, .075);
  events.sort((x, y) => x.start - y.start);
  return { variant, title: a ? '和（弦をはじく音・陽旋法）' : 'やわらかいポップ（マリンバとベル）', key: a ? 'D yo scale' : 'F major', bpm: BPM, bars: BARS,
    chords: order.map((key, n) => ({ at: bar(n), name: chords[key][0] })), snipCues: SNIP_CUES, shutterCues: SHUTTER_CUES, tapCues: TAP_CUES, events };
}

function randomFactory(seed) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}

function synthesize(arrangement) {
  const names = ['pad', 'lead', 'bass', 'drums', 'effects'];
  const buses = Object.fromEntries(names.map((name) => [name, makeBus()]));
  const random = randomFactory(arrangement.variant === 'a' ? 0x95a : 0x95b);
  for (const e of arrangement.events) {
    const busName = ['pad', 'swell', 'breath'].includes(e.kind) ? 'pad' : e.kind === 'bass' ? 'bass'
      : ['drum', 'pon', 'swish', 'kick'].includes(e.kind) ? 'drums'
      : ['snip', 'shutter', 'undo', 'tap'].includes(e.kind) ? 'effects' : 'lead';
    const bus = buses[busName];
    const gl = Math.cos((e.pan + 1) * Math.PI / 4), gr = Math.sin((e.pan + 1) * Math.PI / 4);
    const f = hz(e.midi);
    const first = Math.max(0, Math.round(e.start * SAMPLE_RATE)), last = Math.min(FRAMES, Math.round((e.start + e.duration) * SAMPLE_RATE));
    let lp = 0, band = 0, low = 0, phase = 0, stringAt = 0;
    // Tune the feedback loop with a fractional delay, including the half-sample averaging loss.
    const period = SAMPLE_RATE / f - .5;
    const string = e.kind === 'pluck' ? new Float32Array(Math.ceil(period) + 1) : null;
    if (string) {
      for (let i = 0; i < string.length; i++) {
        const n = 2 * random() - 1;
        string[i] = n * .7 + .3 * Math.sin(TAU * i / period);
      }
    }
    for (let i = first; i < last; i++) {
      const t = (i - first) / SAMPLE_RATE, left = e.duration - t;
      const release = clamp(left / .03);
      let s = 0;
      switch (e.kind) {
        case 'pluck': {
          // Karplus–Strong: a noisy pluck, averaged on each circulation to soften the harmonics.
          const read = stringAt + string.length - period, j = Math.floor(read), frac = read - j;
          const sound = string[j % string.length] * (1 - frac) + string[(j + 1) % string.length] * frac;
          string[stringAt] = (sound + lp) * .5 * Math.exp(-1.7 / f);
          lp = sound;
          stringAt = (stringAt + 1) % string.length;
          s = sound * 1.22 * clamp(t / .0015) * release;
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
        case 'snip': {
          const noise = 2 * random() - 1;
          lp += (noise - lp) * .34;
          const click = (noise - lp) * Math.exp(-t / .013);
          const ring = (.38 * Math.sin(TAU * 3450 * t) + .24 * Math.sin(TAU * 5260 * t)) * Math.exp(-t / .033);
          s = (click + ring) * clamp(t / .001) * release;
          break;
        }
        case 'shutter': {
          const pulse = (age, decay) => age >= 0 ? clamp(age / .001) * Math.exp(-age / decay) : 0;
          const n = 2 * random() - 1;
          lp += (n - lp) * .23;
          const open = (n - lp + .32 * Math.sin(TAU * 1200 * t)) * pulse(t, .018);
          const close = (n - lp + .5 * Math.sin(TAU * 870 * t)) * pulse(t - .044, .023);
          s = (open + .8 * close) * release;
          break;
        }
        case 'swish': case 'swell': case 'breath': case 'undo': {
          const n = random() * 2 - 1, u = t / e.duration;
          const centre = e.kind === 'undo' ? 500 * 2 ** (3.8 * u) : e.kind === 'swell' ? 600 * 2 ** (3 * u) : e.kind === 'breath' ? 620 : 2600;
          const fc = 2 * Math.sin(Math.PI * centre / SAMPLE_RATE);
          low += fc * band;
          band += fc * (n - low - .7 * band);
          const env = e.kind === 'undo' || e.kind === 'swell'
            ? u ** 2 * clamp(left / .035) : Math.sin(Math.PI * clamp(u)) ** 2;
          s = band * env;
          break;
        }
        default: throw new Error(`unknown kind ${e.kind}`);
      }
      bus.l[i] += s * e.gain * gl;
      bus.r[i] += s * e.gain * gr;
    }
  }
  // Reverb (small Schroeder): pad, lead and a little of the effects.
  const wet = makeBus();
  for (const ch of ['l', 'r']) {
    const send = new Float32Array(FRAMES);
    for (let i = 0; i < FRAMES; i++) send[i] = buses.pad[ch][i] * .25 + buses.lead[ch][i] * .3 + buses.drums[ch][i] * .08 + buses.effects[ch][i] * .1;
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
  const shutterFrames = SHUTTER_CUES.map((cue) => Math.round(cue * SAMPLE_RATE));
  const dcLeak = Math.exp(-TAU * 30 / SAMPLE_RATE);
  for (const ch of ['l', 'r']) {
    let prev = 0, hpv = 0;
    for (let i = 0; i < FRAMES; i++) {
      // A short dip in the accompaniment leaves space for the shutter without amplifying its peaks.
      let dip = 0;
      for (const cue of shutterFrames) {
        const t = (i - cue) / SAMPLE_RATE;
        dip = Math.max(dip, Math.min(clamp((t + .16) / .06), clamp((.085 - t) / .085)));
      }
      const music = buses.pad[ch][i] + buses.lead[ch][i] + buses.bass[ch][i] + buses.drums[ch][i] + wet[ch][i] * .35;
      const raw = music * (1 - .40 * dip) + buses.effects[ch][i];
      hpv = raw - prev + dcLeak * hpv;
      prev = raw;
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
  console.log(`${arrangement.title} / ${arrangement.key} / ${BPM} BPM / ${DURATION_SECONDS.toFixed(3)}秒 -> ${out}`);
  console.log(JSON.stringify({ lufs: result.m.lufs, truePeak: result.m.truePeak, lra: result.m.lra, limiterActivePercent: +result.reducedPercent.toFixed(2), ceilingDb: +result.ceilingDb.toFixed(2) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
