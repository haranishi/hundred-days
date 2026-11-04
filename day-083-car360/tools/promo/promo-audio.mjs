/* Day083: 32秒・112.5 BPM・15小節の自作BGM。外部音源・依存パッケージなし。
 * 再生成（リポジトリのルートで実行）:
 *   node day-083-car360/tools/promo/promo-audio.mjs --variant a
 *   node day-083-car360/tools/promo/promo-audio.mjs --variant b
 *   node day-083-car360/tools/promo/verify-audio.mjs
 * output/Day083_car360_bgm_{a,b}.{wav,mp3} を出力。既定は a。
 * --out output/別名.wav も可。書き込み先は output/ 内だけに制限する。
 *
 * 仕様: 共有 timeline の場面・合図をそのまま使い、ドロップ前の最後の1拍を切る。
 * a: A minor / Am9–Fmaj7–Cmaj9–G6 / 鋸波ベース、ゲートパッド、16分アルペジオ。
 * b: F major / Fmaj9–Dm9–Gm9–C13 / FMエレピ、跳ねるベース、明るい主旋律。
 * 設計: Day062のバス別シーケンサ、FM、Schroeder残響、付点8分ディレイ、
 * キックのダッキング、PCM書き出しを再利用。鋸波はpolyBLEPで折り返しを抑える。
 * 検証: verify-audio.mjs が実PCMからLUFS・真のピーク・帯域・場面差を測定する。
 * 音はすべてJSで合成し、ffmpegは測定・MP3符号化にだけ使う。
 */
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BPM, BEAT, BAR, bar, DURATION_SECONDS, STORYBOARD, MUSIC_CUES } from './timeline.mjs';

export const SAMPLE_RATE = 48_000;
const FRAMES = Math.round(SAMPLE_RATE * DURATION_SECONDS);
const TAU = 2 * Math.PI;
const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, 'output');
const ffmpeg = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
const makeBus = () => ({ l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) });

// 共通の楽譜を合成とレポートの両方から参照する。時刻は小節頭ごとにtimelineへ揃える。
export function createArrangement(variant = 'a') {
  if (!['a', 'b'].includes(variant)) throw new Error('--variant は a または b');
  const a = variant === 'a';
  const harmony = a ? [
    ['Am9', 45, [57, 60, 64, 71]], ['Fmaj7', 41, [57, 60, 64, 69]],
    ['Cmaj9', 36, [55, 59, 62, 64]], ['G6', 43, [55, 59, 62, 64]],
    ['Am9', 45, [57, 60, 64, 71]], ['Fmaj9', 41, [57, 60, 64, 67]],
    ['E7', 40, [56, 59, 62, 64]],
  ] : [
    ['Fmaj9', 41, [57, 60, 64, 67]], ['Dm9', 38, [53, 57, 60, 64]],
    ['Gm9', 43, [55, 58, 62, 65]], ['C13', 36, [58, 62, 64, 69]],
    ['Fmaj9', 41, [57, 60, 64, 67]], ['Bbmaj9', 46, [57, 60, 62, 65]],
    ['C13', 36, [58, 62, 64, 69]],
  ];
  const sequence = [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 3, 0];
  const motifs = a ? [
    [[0, 76, .65], [1, 79, .5], [1.75, 81, .95], [3, 79, .7]],
    [[0, 76, 1], [1.5, 72, .45], [2.25, 69, 1.4]],
    [[0, 76, .65], [1, 79, .5], [2, 83, .65], [3, 81, .7]],
    [[0, 79, 1], [1.5, 81, .45], [2.25, 74, 1.4]],
  ] : [
    [[0, 77, .7], [1, 81, .5], [1.75, 79, .9], [3, 76, .7]],
    [[0, 77, 1], [1.5, 76, .45], [2.25, 72, 1.4]],
    [[0, 79, .7], [1, 82, .5], [1.75, 81, .9], [3, 77, .7]],
    [[0, 76, 1], [1.5, 74, .45], [2.25, 72, 1.4]],
  ];
  const events = [];
  const add = (kind, start, duration, midi, gain, pan = 0, extra = {}) => {
    events.push({ kind, start, duration, midi, gain, pan, ...extra });
  };
  const breakStart = MUSIC_CUES.dropAt - BEAT;
  for (let n = 0; n < 15; n++) {
    const start = bar(n);
    const scene = STORYBOARD.find((s) => start >= s.start && start < s.end);
    const intro = scene.music === 'intro';
    const drop = scene.music === 'drop';
    const breakdown = scene.music === 'breakdown';
    const ending = scene.music === 'resolve';
    const riser = scene.music === 'riser';
    const chord = harmony[sequence[n]];
    const beat = (x) => start + x * BEAT;
    const padGain = intro ? .19 : drop ? .17 : breakdown ? .09 : .15;
    for (const [voice, midi] of chord[2].entries()) {
      add('pad', start, ending ? DURATION_SECONDS - start : BAR + .14,
        midi, (ending ? .17 : padGain) * (voice === 0 ? .8 : 1), (voice - 1.5) * .42,
        { attack: intro ? .012 : ending ? .025 : .07, gated: a && !ending });
      if (!a && !riser) {
        for (const pos of ending ? [0] : intro ? [0, 2.5] : breakdown ? [.5, 2.75] : [0, 1.5, 2.75]) {
          add('keys', beat(pos) + voice * .006, ending ? 1.9 : .9, midi + 12,
            (intro ? .17 : breakdown ? .105 : .12), (voice - 1.5) * .25);
        }
      }
    }
    if (ending) {
      add('lead', start, 1.75, a ? 81 : 77, .18, -.08);
      add('keys', start + .006, 1.85, a ? 76 : 84, .08, .24);
      continue;
    }
    // 16分を骨格にする。Bは拍頭を抜き、裏のコード打鍵と噛み合わせる。
    for (let step = 0; step < 16; step++) {
      const at = beat(step / 4);
      if (at >= breakStart && at < MUSIC_CUES.dropAt) continue;
      if ((!a && step % 4 === 0) || (breakdown && step % 4 !== 2)) continue;
      const index = [0, 2, 1, 3, 2, 0, 3, 1][step % 8];
      add(a ? 'arp' : 'keys', at, a ? .24 : .37, chord[2][index] + 12,
        (intro ? .15 : drop ? .125 : breakdown ? .08 : .105) * (step % 4 === 0 ? 1 : .72),
        (step % 2 ? .48 : -.48));
    }
    // 2小節の呼びかけと返事を、フック、走行、ブレイクダウンで再提示する。
    if (intro || drop || breakdown) {
      const mi = intro ? n : drop ? (n - 7) % 4 : n === 12 ? 0 : 3;
      for (const [at, midi, length] of motifs[mi % 4]) {
        add('lead', beat(at), length * BEAT, midi,
          intro ? .17 : breakdown ? .245 : .205, -.08);
      }
    }
    if (!intro || n === 1) {
      const bassLevel = (intro ? .16 : drop ? .23 : breakdown ? .10 : .20) * (a ? 1 : 1.4);
      const pattern = a ? [[0, 0, .38], [.5, 12, .32], [1, 0, .38], [1.5, 0, .32],
        [2, 0, .38], [2.5, 12, .32], [3, 7, .32], [3.5, 0, .36]]
        : [[0, 0, .62], [.75, 12, .35], [1.5, 0, .42], [2, 0, .62],
          [2.75, 7, .38], [3.5, 12, .35], [3.75, 7, .18]];
      for (const [at, interval, length] of pattern) {
        if (riser && at >= 3) continue;
        if (breakdown && at % 2 !== 0) continue;
        add('bass', beat(at), BEAT * length, chord[1] + interval, bassLevel);
      }
      for (const at of breakdown ? (n === 13 ? [2] : []) : [0, 1, 2, 3]) {
        if (riser && at >= 3) continue;
        add('kick', beat(at), .28, 0, (intro ? .20 : a ? .29 : .265) * (a ? 1 : 1.6));
      }
      if (!intro) {
        for (const at of breakdown ? (n === 13 ? [3] : []) : [1, 3]) {
          if (riser && at >= 3) continue;
          add('snare', beat(at), .24, 0, breakdown ? .11 : a ? .21 : .18);
        }
      }
      const dense = scene.music === 'lift' || riser;
      for (let step = 0; step < (dense ? 16 : 8); step++) {
        const at = beat(step / (dense ? 4 : 2));
        if (riser && at >= breakStart) continue;
        if (breakdown && step % 2 === 0) continue;
        add('hat', at, step % 2 ? .12 : .055, 0,
          (breakdown ? .055 : .105) * (a ? 1 : 3.6) * (step % 2 ? 1 : .65), step % 2 ? .35 : -.24);
        if (!a && step % 2) add('shaker', at + BEAT / 4, .055, 0, .045, -.4);
      }
    }
  }
  for (const at of [bar(3), bar(4), MUSIC_CUES.dropAt]) {
    add('crash', at, .75, 0, at === MUSIC_CUES.dropAt ? .16 : .075, .05);
    if (at !== MUSIC_CUES.dropAt) {
      add('riser', at - BEAT / 2, BEAT / 2, 0, .07);
      add('snare', at - BEAT / 4, .12, 0, .08, -.16);
    }
  }
  add('riser', MUSIC_CUES.riser.start, breakStart - MUSIC_CUES.riser.start, 0, .21);
  for (let step = 0; step < 18; step++) {
    // 前半は8分、後半は細かいロールへ密度を上げる。
    const pos = step < 4 ? step * .5 : 2 + (step - 4) / 14;
    add('snare', MUSIC_CUES.riser.start + pos * BEAT, .10, 0, .065 + step * .005);
  }
  // 後半の色変化（20.267秒）から、副旋律を追加する。
  const counter = a ? [84, 83, 79, 76, 79, 81, 83, 79, 81, 76, 79, 81]
    : [86, 84, 82, 81, 79, 76, 74, 72, 77, 79, 81, 84];
  for (let i = 0; bar(9.5) + i * BEAT < MUSIC_CUES.breakdown.start; i++) {
    add('counter', bar(9.5) + i * BEAT, BEAT * .65, counter[i % counter.length], .09, .43);
  }
  add('engine', MUSIC_CUES.dropAt, MUSIC_CUES.breakdown.start - MUSIC_CUES.dropAt, 0, .036, -.02);
  events.sort((x, y) => x.start - y.start);
  return { variant, title: a ? '夜の首都高' : '夕暮れの湾岸', key: a ? 'A minor' : 'F major',
    bpm: BPM, bars: 15, breakStart, counterAt: bar(9.5), fadeStart: DURATION_SECONDS - .8,
    chords: sequence.map((index, n) => ({ at: bar(n), name: harmony[index][0] })), events };
}

function randomFactory(seed) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
function polyBlep(t, dt) {
  if (t < dt) { const x = t / dt; return 2 * x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + 2 * x + 1; }
  return 0;
}
const saw = (p, dt) => 2 * p - 1 - polyBlep(p, dt);
const triangle = (p) => 1 - 4 * Math.abs(p - .5);

function synthesize(arrangement) {
  const buses = Object.fromEntries(['pad', 'keys', 'arp', 'lead', 'counter', 'bass', 'drums', 'snare', 'fx', 'engine']
    .map((name) => [name, makeBus()]));
  const random = randomFactory(arrangement.variant === 'a' ? 0x8300a : 0x8300b);
  const a = arrangement.variant === 'a';
  for (const e of arrangement.events) {
    const busName = ['kick', 'hat', 'shaker'].includes(e.kind) ? 'drums'
      : ['riser', 'crash'].includes(e.kind) ? 'fx' : e.kind;
    const bus = buses[busName];
    const l = Math.cos((e.pan + 1) * Math.PI / 4);
    const r = Math.sin((e.pan + 1) * Math.PI / 4);
    let p = e.kind === 'pad' ? .18 : 0;
    let p2 = .31;
    let lp = 0;
    let lp2 = 0;
    let slow = 0;
    let band = 0;
    const base = hz(e.midi);
    const first = Math.max(0, Math.round(e.start * SAMPLE_RATE));
    const last = Math.min(FRAMES, Math.round((e.start + e.duration) * SAMPLE_RATE));
    for (let index = first; index < last; index++) {
      const t = (index - first) / SAMPLE_RATE;
      const u = t / e.duration;
      let sample;
      if (['pad', 'arp', 'lead', 'counter', 'bass', 'keys'].includes(e.kind)) {
        const bass = e.kind === 'bass';
        const frequency = base * (bass ? 1 + .018 * Math.exp(-t / .02) : 1 + .0016 * Math.sin(TAU * 5.1 * t));
        const dt = frequency / SAMPLE_RATE;
        p = (p + dt) % 1;
        p2 = (p2 + dt * 1.004) % 1;
        let wave;
        let cutoff;
        let envelope;
        if (e.kind === 'pad') {
          wave = a ? .50 * saw(p, dt) + .32 * saw(p2, dt * 1.004) + .18 * triangle(p)
            : .7 * Math.sin(TAU * p) + .3 * triangle(p2);
          const opening = clamp((index / SAMPLE_RATE) / bar(2));
          cutoff = a ? 650 + 2400 * opening : 900 + 1700 * opening;
          const gate = e.gated ? .40 + .60 * Math.sin(Math.PI * clamp((t % (BEAT / 2)) / (BEAT / 2))) ** 2 : 1;
          envelope = Math.sin(clamp(t / e.attack) * Math.PI / 2)
            * Math.sin(clamp((e.duration - t) / .23) * Math.PI / 2) * gate;
        } else if (e.kind === 'keys') {
          const c = TAU * base * t;
          wave = Math.sin(c + Math.sin(c) * 2.1 * Math.exp(-t / .11))
            + .09 * Math.sin(c * 6) * Math.exp(-t / .028);
          cutoff = 7400;
          envelope = (1 - Math.exp(-t / .0025)) * Math.exp(-t / .52) * clamp((e.duration - t) / .04);
        } else if (bass) {
          wave = a ? .66 * saw(p, dt) + .48 * Math.sin(TAU * p)
            : .72 * Math.sin(TAU * p + .45 * Math.sin(TAU * p * 2) * Math.exp(-t / .055)) + .28 * triangle(p);
          cutoff = a ? 900 + 1300 * Math.exp(-t / .045) : 1600;
          envelope = (1 - Math.exp(-t / .002)) * Math.exp(-t / .25) * clamp((e.duration - t) / .026);
        } else {
          const bright = e.kind === 'counter';
          wave = a ? .53 * saw(p, dt) + .22 * saw(p2, dt * 1.004) + .25 * triangle(p)
            : .76 * triangle(p) + .24 * Math.sin(TAU * p + .5 * Math.sin(TAU * p * 2));
          if (bright) wave = .8 * Math.sin(TAU * p) + .2 * Math.sin(TAU * p * 2);
          cutoff = e.kind === 'arp' ? 2400 + 1800 * Math.exp(-t / .04) : 4100;
          envelope = (1 - Math.exp(-t / .002)) * Math.exp(-t / (e.kind === 'arp' ? .10 : .55))
            * clamp((e.duration - t) / .035);
        }
        const alpha = 1 - Math.exp(-TAU * cutoff / SAMPLE_RATE);
        lp += alpha * (wave - lp);
        lp2 += alpha * (lp - lp2);
        sample = lp2 * envelope;
      } else if (e.kind === 'kick') {
        p += (47 + 100 * Math.exp(-t / .018)) / SAMPLE_RATE;
        sample = (Math.sin(TAU * p) * Math.exp(-t / .095)
          + .17 * Math.sin(TAU * 1250 * t) * Math.exp(-t / .004))
          * clamp(t / .001) * clamp((e.duration - t) / .012);
      } else if (e.kind === 'engine') {
        const absolute = e.start + t;
        let frequency = 60 + 120 * clamp((absolute - e.start) / (24 - e.start));
        for (const shift of [17.0, 19.8, 22.4]) {
          if (absolute >= shift) frequency -= 12 * Math.exp(-(absolute - shift) / .32);
        }
        const dt = frequency / SAMPLE_RATE;
        p = (p + dt) % 1;
        const alpha = 1 - Math.exp(-TAU * (420 + 600 * clamp(t / 9)) / SAMPLE_RATE);
        lp += (saw(p, dt) - lp) * alpha;
        lp2 += (lp - lp2) * alpha;
        sample = lp2 * clamp(t / .2) * clamp((e.duration - t) / .55)
          * (.85 + .15 * Math.sin(TAU * 9 * t));
      } else {
        const noise = random() * 2 - 1;
        if (e.kind === 'snare') {
          lp += (noise - lp) * (1 - Math.exp(-TAU * 6100 / SAMPLE_RATE));
          slow += (lp - slow) * (1 - Math.exp(-TAU * 950 / SAMPLE_RATE));
          const clap = a ? 1 + .24 * Math.sin(TAU * 75 * t) * Math.exp(-t / .045) : 1;
          sample = ((lp - slow) * clap * Math.exp(-t / .047)
            + .25 * Math.sin(TAU * 185 * t) * Math.exp(-t / .033))
            * clamp(t / .0007) * clamp((e.duration - t) / .01);
        } else if (e.kind === 'riser') {
          const cutoff = 380 * 2 ** (4.05 * u);
          const alpha = 1 - Math.exp(-TAU * cutoff / SAMPLE_RATE);
          // 状態変数BPF。ノイズの中心帯域が約380→6300Hzへ上昇する。
          const f = 2 * Math.sin(Math.PI * cutoff / SAMPLE_RATE);
          lp += f * band;
          const high = noise - lp - .65 * band;
          band += f * high;
          slow += (band - slow) * alpha;
          p += (230 * 2 ** (2 * u)) / SAMPLE_RATE;
          sample = (slow * .72 + Math.sin(TAU * p) * .18) * (.08 + .92 * u ** 1.5)
            * clamp(t / .01) * clamp((e.duration - t) / .015);
        } else {
          const cutoff = e.kind === 'crash' ? 3200 : 6400;
          lp += (noise - lp) * (1 - Math.exp(-TAU * cutoff / SAMPLE_RATE));
          const tau = e.kind === 'crash' ? .19 : e.kind === 'shaker' ? .014 : e.duration * .24;
          sample = (noise - lp) * Math.exp(-t / tau) * clamp(t / .0005)
            * clamp((e.duration - t) / .01);
        }
      }
      bus.l[index] += sample * e.gain * l;
      bus.r[index] += sample * e.gain * r;
    }
  }

  // Day062の付点8分ピンポン。返りは減衰させて主旋律の輪郭を残す。
  for (const name of ['arp', 'keys', 'lead', 'counter']) {
    const bus = buses[name];
    const delay = Math.round(BEAT * .75 * SAMPLE_RATE);
    const lineL = new Float32Array(delay);
    const lineR = new Float32Array(delay);
    let dampL = 0;
    let dampR = 0;
    for (let i = 0; i < FRAMES; i++) {
      const pos = i % delay;
      const tapL = lineL[pos];
      const tapR = lineR[pos];
      dampL += (tapL - dampL) * .28;
      dampR += (tapR - dampR) * .28;
      lineL[pos] = bus.r[i] * .15 + dampR * .28;
      lineR[pos] = bus.l[i] * .15 + dampL * .28;
      bus.l[i] += tapL;
      bus.r[i] += tapR;
    }
  }

  const wet = makeBus();
  for (const channel of ['l', 'r']) {
    const send = new Float32Array(FRAMES);
    for (let i = 0; i < FRAMES; i++) {
      send[i] = buses.pad[channel][i] * .18 + buses.keys[channel][i] * .2
        + buses.lead[channel][i] * .22 + buses.arp[channel][i] * .10
        + buses.counter[channel][i] * .20 + buses.snare[channel][i] * .15;
    }
    let stage = new Float32Array(FRAMES);
    for (const size of [1215, 1390, 1548, 1760]) {
      const length = size + (channel === 'r' ? 23 : 0);
      const line = new Float32Array(length);
      const feedback = 10 ** (-3 * length / SAMPLE_RATE / 1.3);
      let damp = 0;
      for (let i = 0; i < FRAMES; i++) {
        const pos = i % length;
        const value = line[pos];
        stage[i] += value * .25;
        damp += (value - damp) * .30;
        line[pos] = send[i] + damp * feedback;
      }
    }
    for (const size of [245, 605]) {
      const length = size + (channel === 'r' ? 23 : 0);
      const line = new Float32Array(length);
      const next = new Float32Array(FRAMES);
      for (let i = 0; i < FRAMES; i++) {
        const pos = i % length;
        next[i] = line[pos] - stage[i];
        line[pos] = stage[i] + line[pos] * .5;
      }
      stage = next;
    }
    wet[channel] = stage;
  }

  const duck = new Float32Array(FRAMES);
  for (const e of arrangement.events.filter((event) => event.kind === 'kick')) {
    const first = Math.round(e.start * SAMPLE_RATE);
    for (let j = 0; j < Math.round(.40 * SAMPLE_RATE) && first + j < FRAMES; j++) {
      duck[first + j] = Math.max(duck[first + j], Math.exp(-j / SAMPLE_RATE / .125));
    }
  }
  const mix = makeBus();
  for (const channel of ['l', 'r']) {
    let previous = 0;
    let highpass = 0;
    let shelf = 0;
    for (let i = 0; i < FRAMES; i++) {
      const time = i / SAMPLE_RATE;
      const pumping = 1 - (time >= MUSIC_CUES.dropAt && time < MUSIC_CUES.breakdown.start ? .52 : .25) * duck[i];
      const raw = (buses.pad[channel][i] + buses.keys[channel][i] + buses.arp[channel][i]
        + buses.lead[channel][i] + buses.counter[channel][i] + wet[channel][i] * .32) * pumping
        + buses.bass[channel][i] * (1 - .18 * duck[i]) + buses.drums[channel][i]
        + buses.snare[channel][i] + buses.fx[channel][i] + buses.engine[channel][i];
      highpass = raw - previous + Math.exp(-TAU * 25 / SAMPLE_RATE) * highpass;
      previous = raw;
      shelf += (highpass - shelf) * (1 - Math.exp(-TAU * 6500 / SAMPLE_RATE));
      // 緩いハイシェルフで耳に刺さる倍音を整える。
      const shaped = shelf + (highpass - shelf) * .82;
      let gap = 1;
      if (time >= arrangement.breakStart && time < MUSIC_CUES.dropAt) {
        gap = 1 - clamp((time - arrangement.breakStart) / .012);
      }
      const fade = Math.sin(clamp((FRAMES - 1 - i) / SAMPLE_RATE / .8) * Math.PI / 2) ** 2;
      mix[channel][i] = Math.tanh(shaped * 1.25) / 1.25 * gap * fade;
    }
  }
  return mix;
}

function wavBuffer(bus, gain = 1) {
  const buffer = Buffer.alloc(44 + FRAMES * 4);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22); buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 4, 28); buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(FRAMES * 4, 40);
  for (let i = 0; i < FRAMES; i++) {
    for (const [ch, channel] of ['l', 'r'].entries()) {
      const value = bus[channel][i] * gain;
      if (!Number.isFinite(value) || Math.abs(value) >= 1) throw new Error(`PCM overflow at frame ${i}`);
      buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 4 + ch * 2);
    }
  }
  return buffer;
}

function run(args) {
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
  return result;
}

function main() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    if (!['--variant', '--out'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error('使い方: promo-audio.mjs [--variant a|b] [--out output/name.wav]');
    }
  }
  const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const variant = value('--variant', 'a');
  const arrangement = createArrangement(variant);
  const out = resolve(here, value('--out', `output/Day083_car360_bgm_${variant}.wav`));
  if (!out.startsWith(output + sep) || !out.endsWith('.wav')) throw new Error('--out は output/ 内の .wav に限定');
  mkdirSync(dirname(out), { recursive: true });
  const mix = synthesize(arrangement);
  let peak = 0;
  for (let i = 0; i < FRAMES; i++) peak = Math.max(peak, Math.abs(mix.l[i]), Math.abs(mix.r[i]));
  const preGain = peak > .7 ? .7 / peak : 1;
  // ffmpeg loudnorm の input_i / input_tp だけを使う。音量変更はJS側の一定ゲイン。
  const scratch = resolve(output, `.measure-${variant}-${process.pid}.wav`);
  let measured;
  try {
    writeFileSync(scratch, wavBuffer(mix, preGain));
    const result = run(['-hide_banner', '-nostdin', '-i', scratch, '-af',
      'loudnorm=I=-17:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
    const match = result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
    if (!match) throw new Error('LUFSを読み取れません');
    measured = JSON.parse(match[0]);
  } finally {
    try { unlinkSync(scratch); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const wantedDb = -17 - Number(measured.input_i);
  const availableDb = -1.8 - Number(measured.input_tp);
  const appliedDb = Math.min(wantedDb, availableDb);
  const gain = preGain * 10 ** (appliedDb / 20);
  writeFileSync(out, wavBuffer(mix, gain));
  run(['-y', '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', out,
    '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', String(SAMPLE_RATE), out.replace(/\.wav$/, '.mp3')]);
  console.log(`${arrangement.title} / ${arrangement.key} / ${BPM} BPM / 32.000秒`);
  console.log(`${out.slice(here.length + 1)} と MP3 を生成。sample peak ${db(peak * gain).toFixed(2)} dBFS`);
  if (wantedDb > availableDb) console.log('true peakの余裕を優先。最終LUFSはverify-audio.mjsで確認してください。');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
