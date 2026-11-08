/* Day088 Bouquet Studio: deterministic, sample-free Node synthesis.
 * A: C major FM electric piano + strings; B: G major pluck + mallets + bells.
 * Score sections and all interaction/reveal times come from timeline.mjs.
 * ffmpeg only measures loudness and encodes; no source recordings are used.
 */
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BAR, BARS, BEAT, BPM, DURATION_SECONDS, MUSIC_CUES, STORYBOARD, TAP_CUES, bar } from './timeline.mjs';

export const SAMPLE_RATE = 48_000;
export const TARGET_LUFS = -16;
const FRAMES = Math.round(SAMPLE_RATE * DURATION_SECONDS);
const TAU = 2 * Math.PI;
// ffmpeg: FFMPEG, else the first one on PATH.
const ffmpeg = process.env.FFMPEG || spawnSync('/bin/sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' }).stdout.trim() || 'ffmpeg';
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const makeBus = () => ({ l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) });

// The score, shared by the synthesis and the report.
export function createArrangement(variant = 'a') {
  if (!['a', 'b'].includes(variant)) throw new Error('--variant は a または b');
  const a = variant === 'a';
  const chords = a ? [
    ['Cadd9', 36, [60, 64, 67, 74]], ['G6', 43, [59, 62, 67, 76]],
    ['C', 36, [60, 64, 67, 72]], ['Am7', 45, [60, 64, 67, 69]],
    ['Fadd9', 41, [57, 60, 65, 67]], ['C/E', 40, [60, 64, 67, 72]],
    ['Fmaj7', 41, [57, 60, 64, 65]], ['G6', 43, [59, 62, 67, 76]],
    ['Gsus4', 43, [60, 62, 67, 74]], ['Cadd9', 36, [60, 64, 67, 74]],
    ['F6', 41, [57, 60, 62, 65]], ['Cadd9', 36, [60, 64, 67, 74]],
  ] : [
    ['Gadd9', 43, [59, 62, 67, 69]], ['D6', 38, [57, 62, 66, 71]],
    ['G', 43, [59, 62, 67, 74]], ['Em7', 40, [55, 59, 62, 64]],
    ['Cadd9', 36, [55, 60, 62, 64]], ['G/B', 47, [59, 62, 67, 74]],
    ['Cmaj7', 36, [55, 59, 60, 64]], ['D6', 38, [57, 62, 66, 71]],
    ['Dsus4', 38, [57, 62, 67, 74]], ['Gadd9', 43, [59, 62, 67, 69]],
    ['C6', 36, [55, 60, 64, 69]], ['Gadd9', 43, [59, 62, 67, 69]],
  ];
  // Original six-note hooks; repeated with only a final-note answer.
  const motif = a ? [[0,76,.75],[1,79,.5],[1.5,74,.5],[2,76,.75],[3,72,.5],[3.5,74,.5]]
    : [[0,74,.5],[.65,71,.5],[1.5,76,.5],[2,74,.5],[2.65,79,.5],[3.5,78,.5]];
  const events = [];
  const add = (kind, start, duration, midi, gain, pan = 0) => events.push({ kind, start, duration, midi, gain, pan });
  let n = 0;
  // Scene starts take precedence over the nominal grid, including sub-frame cue adjustments.
  for (const scene of STORYBOARD) {
    for (let start = scene.start; start < scene.end - .01; start += BAR, n++) {
      const music = scene.music, end = music === 'resolve', hush = music === 'hush';
      const intro = music === 'intro', build = music === 'build', bloom = music === 'bloom';
      const chorus = music === 'chorus', lift = music === 'lift';
      const [name, bassMidi, tones] = chords[Math.min(n, chords.length - 1)];
      const span = Math.min(BAR, scene.end - start);
      const at = b => start + b * BEAT;
      const level = chorus ? 1.1 : bloom ? 1.22 : 1;
      for (const [v, midi] of tones.entries()) add('pad', start, span, midi,
        hush ? .095 : end ? .075 : .052, (v - 1.5) * .3);
      if (hush) continue;
      if (end) {
        tones.forEach((midi,v) => add(a ? 'ep' : 'pluck', start + v * .035, span - v * .035, midi, .2, (v-1.5)*.25));
        add('bass', start, span, bassMidi, a ? .19 : .14);
        add('bell', start, span, a ? 84 : 86, .045, .2);
        continue;
      }
      // Chord pulse for A; alternating strum for B. Nothing percussive during the build.
      if (!build) for (const b of intro ? [0,2] : [0,1.5,2.5,3.5]) {
        tones.forEach((midi,v) => add(a ? 'ep' : 'pluck', at(b) + (a ? 0 : v*.016),
          Math.min(a ? .95 : .7, scene.end - at(b)), midi, (intro ? .09 : .13)*level, (v-1.5)*.27));
      }
      if (intro) { add('bell', start, 1.5, a ? 79 : 86, .05, .25); continue; }
      if (build) continue;
      for (const [b,midi,len] of motif) add(a ? 'ep' : 'marimba', at(b),
        Math.min(len*BEAT + .2, scene.end-at(b)), midi + (n % 2 && b===3.5 ? (a ? -2 : -7) : 0),
        (chorus || bloom ? .28 : .15)*level, -.15);
      if (lift || chorus || bloom) for (const [k,b] of [.5,1.5,2.5,3.5].entries())
        add('bell', at(b), Math.min(.75,scene.end-at(b)), tones[k]+12, bloom ? .065 : .035, .4);
      for (const [b,interval] of [[0,0],[1.5,7],[2,0],[3.5,12]])
        add('bass', at(b), Math.min(BEAT*(b===0 || b===2 ? 1.3 : .4),scene.end-at(b)), bassMidi+interval,(a ? .23 : .17)*level);
      for (const b of [0,2]) add('kick', at(b), .32, 0, (a ? .28 : .24)*level);
      for (const b of [1,3]) add('swish', at(b), .18, 0, .11*level, -.1);
      for (let k=0;k<(lift || chorus || bloom ? 8 : 4);k++) {
        const b=k*(lift || chorus || bloom ? .5 : 1);
        add('tick', at(b + (!a && k%2 ? .12 : 0)), .05,0,(k%2 ? .046 : .032)*(a ? 3 : 2.3),k%2 ? .3 : -.3);
      }
    }
  }
  add('swell', MUSIC_CUES.buildAt, MUSIC_CUES.dropAt-MUSIC_CUES.buildAt, 0, .08);
  for (const cue of [MUSIC_CUES.dropAt, MUSIC_CUES.bloomAt]) {
    add('kick', cue, .38, 0, .25);
    add('crash', cue, 1.1, 0, .12);
    add('bass', cue, .45, a ? 36 : 43, a ? .1 : .06);
  }
  // One rising flourish at the opening, built from six tuned bell grains.
  for (const [k,midi] of (a ? [72,76,79,84,88,91] : [74,79,83,86,91,95]).entries())
    add('bell', MUSIC_CUES.bloomAt + k*.065, .6, midi,.075-k*.006,(k-2.5)*.13);
  for (const cue of TAP_CUES) add('tap',cue,.065,a ? 79 : 86,.045);
  events.sort((x,y)=>x.start-y.start);
  return { variant, title: a ? 'やさしいポップ' : 'はずむアコースティック', key: a ? 'C major' : 'G major',
    bpm: BPM, bars: BARS, chords: chords.map((c,i)=>({at:bar(i),name:c[0]})), tapCues:TAP_CUES, events };
}

function randomFactory(seed) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}

function synthesize(arrangement) {
  const names = ['pad', 'lead', 'bass', 'drums', 'fx'];
  const buses = Object.fromEntries(names.map((name) => [name, makeBus()]));
  const random = randomFactory(arrangement.variant === 'a' ? 0x88a : 0x88b);
  for (const e of arrangement.events) {
    const busName = e.kind === 'pad' || e.kind === 'swell' ? 'pad' : e.kind === 'bass' ? 'bass'
      : ['drum', 'pon', 'swish', 'tick', 'kick', 'crash'].includes(e.kind) ? 'drums' : e.kind === 'tap' ? 'fx' : 'lead';
    const bus = buses[busName];
    const gl = Math.cos((e.pan + 1) * Math.PI / 4), gr = Math.sin((e.pan + 1) * Math.PI / 4);
    const f = hz(e.midi);
    const first = Math.max(0, Math.round(e.start * SAMPLE_RATE)), last = Math.min(FRAMES, Math.round((e.start + e.duration) * SAMPLE_RATE));
    let lp = 0, lp2 = 0, hp = 0, band = 0, low = 0, phase = 0;
    // The seeded noise stream is shared by both channels.

    for (let i = first; i < last; i++) {
      const t = (i - first) / SAMPLE_RATE, left = e.duration - t;
      const release = clamp(left / .03);
      let s = 0;
      switch (e.kind) {
        case 'ep': {
          const mod = 1.35 * Math.sin(TAU*f*2*t) * Math.exp(-t*5);
          s = (Math.sin(TAU*f*t+mod) + .16*Math.sin(TAU*f*2*t)*Math.exp(-t*3))
            * Math.exp(-t*2.3) * clamp(t/.003) * release * .72;
          break;
        }
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
          phase += (f + f * .12 * Math.exp(-t / .004)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .012) * clamp(t / .0008) * release;
          break;
        }
        case 'pon': {
          phase += (420 + 260 * Math.exp(-t / .012)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .045) * clamp(t / .001) * release;
          break;
        }
        case 'swish': case 'tick': case 'swell': case 'crash': {
          const n = random() * 2 - 1;
          // Band-passed noise (state-variable filter) with a per-kind centre and envelope.
          const centre = e.kind === 'swell' ? 600 * 2 ** (3 * t / e.duration) : e.kind === 'tick' ? 7000 : e.kind === 'crash' ? 5200 : 2600;
          const q = .7;
          const fc = 2 * Math.sin(Math.PI * Math.min(centre, 16000) / SAMPLE_RATE);
          low += fc * band; const high = n - low - q * band; band += fc * high;
          let env;
          if (e.kind === 'swish') env = Math.sin(Math.PI * clamp(t / e.duration)) ** 2;
          else if (e.kind === 'tick') env = Math.exp(-t / .012) * clamp(t / .0008);
          else if (e.kind === 'swell') env = (t / e.duration) ** 2 * clamp(left / .05);
          else if (e.kind === 'crash') env = Math.exp(-t / .45) * clamp(t / .002) * release;

          s = band * env;
          break;
        }
        default: throw new Error(`unknown kind ${e.kind}`);
      }
      bus.l[i] += s * e.gain * gl;
      bus.r[i] += s * e.gain * gr;
    }
  }
  // Reverb (small Schroeder): pad, lead and quiet interaction ticks.
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
      const hush = t >= MUSIC_CUES.hushAt && t < MUSIC_CUES.bloomAt;
      const toHush = clamp((MUSIC_CUES.hushAt-t)/.025);
      const foreground = hush ? 0 : (t < MUSIC_CUES.hushAt ? toHush : 1);
      const raw = buses.pad[ch][i] + foreground * (buses.lead[ch][i] + buses.bass[ch][i]
        + buses.drums[ch][i] + buses.fx[ch][i] + wet[ch][i]*.35);
      const build = t >= MUSIC_CUES.buildAt && t < MUSIC_CUES.dropAt;
      const sectionGain = build ? (arrangement.variant === 'a' ? .8 : .75) : hush ? .65 : 1;
      hpv = raw - prev + Math.exp(-TAU * 30 / SAMPLE_RATE) * hpv; prev = raw;
      // A gentle fade over the last seconds so the end chord settles exactly at 32.000 s (last sample 0).
      const left = FRAMES - 1 - i;
      const fade = left < fadeFrames ? Math.sin(clamp(left / fadeFrames) * Math.PI / 2) ** 2 : 1;
      // A 6 ms fade-in: the first pluck starts on sample 0, and its pick noise would otherwise click.
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
  // MP3 copy (192 kbps), for muxing into the video and for listening.
  const mp3 = out.replace(/\.wav$/, '.mp3');
  const enc = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-nostdin', '-i', out, '-c:a', 'libmp3lame', '-b:a', '192k', '-map_metadata', '-1', mp3], { encoding: 'utf8', timeout: 60000 });
  if (enc.status !== 0) throw new Error(`mp3 に書き出せません: ${enc.stderr}`);
  console.log(`${arrangement.title} / ${arrangement.key} / ${BPM} BPM / ${DURATION_SECONDS}.000秒 -> ${out}`);
  console.log(JSON.stringify({ lufs: result.m.lufs, truePeak: result.m.truePeak, lra: result.m.lra, limiterActivePercent: +result.reducedPercent.toFixed(2), ceilingDb: +result.ceilingDb.toFixed(2) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
