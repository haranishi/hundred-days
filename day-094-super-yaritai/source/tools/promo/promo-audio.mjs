/* スーパーやりたい放題 プロモBGM合成（120 BPM・15小節・30.0秒・外部音源不使用）
 *   node tools/promo/promo-audio.mjs --variant a|b --out-dir <dir>
 * Variant A「特売エレクトロ・ポップ」: F major — キック/クラップ・プラックベース・シンセリード・ベル
 * Variant B「スーパー特売ブラス・ファンク」: G major — スラップベース・Karplus-Strongカッティング・ブラス・カウベル
 * 両案とも timeline.mjs のキュー（0.00s ピラミッド打撃 / 2.00s おねがい静音 / 4.00s ドロップ /
 * 10.00s ストライク打撃 / 16.00s ベル×3 / 18.00s 追走パルス / 20.80s 0.35s無音逮捕 / 26.00s 終止）に厳密同期。
 */
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BAR, BARS, BEAT, BPM, CARD_TIMES, DURATION_SECONDS, MUSIC_CUES, STORYBOARD, TAP_CUES, bar } from './timeline.mjs';

export const SAMPLE_RATE = 48_000;
export const TARGET_LUFS = -16;
const FRAMES = Math.round(SAMPLE_RATE * DURATION_SECONDS);
const TAU = 2 * Math.PI;
const ffmpeg = process.env.FFMPEG || spawnSync('/bin/sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' }).stdout.trim() || 'ffmpeg';
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const makeBus = () => ({ l: new Float32Array(FRAMES), r: new Float32Array(FRAMES) });

export const sectionAt = (t) => (STORYBOARD.find((s) => t >= s.start - 1e-9 && t < s.end - 1e-9) ?? STORYBOARD.at(-1)).music;

export function createArrangement(variant = 'a') {
  if (!['a', 'b'].includes(variant)) throw new Error('--variant は a または b');
  const a = variant === 'a';
  // A: F major (F-C-Dm-Bb 進行) / B: G major (G-D-Em-C 進行)
  const chords = a ? [
    ['F', 41, [65, 69, 72, 77]], ['Csus4', 36, [65, 67, 72, 79]],
    ['F', 41, [65, 69, 72, 77]], ['C/E', 40, [64, 67, 72, 79]],
    ['Dm7', 38, [65, 69, 72, 76]], ['Bbmaj7', 34, [65, 69, 70, 74]],
    ['F', 41, [65, 69, 72, 77]], ['C', 36, [64, 67, 72, 79]],
    ['Bbmaj7', 34, [65, 69, 70, 74]], ['Dm7', 38, [65, 69, 72, 76]],
    ['Gm7', 43, [65, 67, 70, 74]], ['F/A', 45, [65, 69, 72, 77]],
    ['Bb', 34, [65, 70, 74, 77]], ['F', 41, [65, 69, 72, 77]], ['F', 41, [65, 69, 72, 81]],
  ] : [
    ['G', 43, [55, 59, 62, 67]], ['Dsus4', 38, [55, 57, 62, 69]],
    ['G', 43, [55, 59, 62, 67]], ['D/F#', 42, [54, 57, 62, 69]],
    ['Em7', 40, [55, 59, 62, 67]], ['Cadd9', 36, [55, 60, 64, 67]],
    ['G', 43, [55, 59, 62, 67]], ['D', 38, [54, 57, 62, 69]],
    ['Cadd9', 36, [55, 60, 64, 67]], ['Em7', 40, [55, 59, 62, 67]],
    ['Am7', 45, [55, 57, 60, 64]], ['G/B', 47, [55, 59, 62, 67]],
    ['C', 36, [55, 60, 64, 67]], ['G', 43, [55, 59, 62, 67]], ['G', 43, [55, 59, 62, 71]],
  ];

  // キャッチーなオリジナル6音フレーズ
  const motif = a
    ? [[0, 77, .45], [.5, 81, .45], [1, 84, .5], [2, 81, .45], [2.5, 79, .45], [3, 77, .85]]
    : [[0, 79, .45], [.5, 83, .45], [1, 86, .5], [2, 83, .45], [2.5, 81, .45], [3, 79, .85]];

  const events = [];
  const add = (kind, start, duration, midi, gain, pan = 0, extra = {}) => {
    if (start < DURATION_SECONDS && duration > 0) {
      events.push({ kind, start: +start.toFixed(6), duration: Math.min(duration, DURATION_SECONDS - start), midi, gain, pan, ...extra });
    }
  };

  for (let n = 0; n < BARS; n++) {
    const start = bar(n);
    const [, bassMidi, tones] = chords[n];
    const at = (b) => start + b * BEAT;
    const s0 = sectionAt(start);

    // エンドセクション（14〜15小節）
    if (n >= 13) {
      if (n === 13) {
        tones.forEach((m, v) => add(a ? 'pluck' : 'brass', start + v * .025, 3.6, m, a ? .12 : .11, (v - 1.5) * .25));
        add('pad', start, 3.8, tones[0], .08);
        add('bass', start, 2.2, bassMidi, .11);
        add('kick', start, .4, 0, .34);
        add('crash', start, 1.8, 0, .035);
        add('bell', start, 2.0, a ? 89 : 91, .09, .2);
      } else {
        // 最後の小節も鳴り続けて余韻フェード
        tones.forEach((m, v) => add('pad', start, 2.0, m, .055, (v - 1.5) * .2));
        add('bell', start, 1.5, a ? 84 : 86, .06, -.2);
      }
      continue;
    }

    // パッド層（捕獲無音区間 20.80–21.15s を除く）
    if (s0 !== 'caught') {
      for (const [v, midi] of tones.entries()) {
        const len = n === 10 ? 20.78 - start : BAR + 0.04;
        if (len > 0) add('pad', start, len, midi, s0 === 'build' ? .04 : .045, (v - 1.5) * .24);
      }
    }

    for (let k = 0; k < 16; k++) {
      const t = start + k * BEAT / 4;
      const s = sectionAt(t);
      // 捕獲のドラマ無音谷 (20.80 - 21.15s) は一切音を置かない
      if (t >= MUSIC_CUES.caughtAt - 1e-6 && t < MUSIC_CUES.caughtResumeAt - 1e-6) continue;

      const highEnergy = ['drop', 'groove', 'chorus', 'peak', 'results'].includes(s);
      const lift = s === 'peak' ? 1.18 : s === 'chorus' ? 1.08 : 1;

      if (s === 'intro') {
        if ((k === 0 && (n > 0 || MUSIC_CUES.kickImpactAt >= 0.05)) || k === 8) add('kick', t, .35, 0, .24);
        if (k === 4 || k === 12) add('clap', t, .25, 0, .18);
        if (k % 2 === 0) add(a ? 'pluck' : 'string', t, BEAT * .4, tones[k % tones.length] + 12, .085, k % 4 ? .25 : -.25);
        continue;
      }

      if (s === 'build') {
        // キックなし、タイトなスネア/ハイハットがテンションを上げる
        if (k >= 8 || k % 2 === 0) add('snare', t, .15, 0, .04 + .12 * (k / 16), 0);
        if (k % 4 === 0) add('pluck', t, BEAT * .35, tones[(k / 4) % tones.length] + 12, .06);
        continue;
      }

      if (s === 'chase') {
        // 追走：重いキックを抜き、16分パルスと緊張スネアで切迫感を出す
        if (k % 2 === 0) add('bass', t, BEAT * .35, bassMidi + (k % 4 === 2 ? 12 : 0), .09);
        if (k === 4 || k === 12 || (t >= 19.5 && k % 4 === 2)) add('snare', t, .2, 0, .22);
        add('hat', t, .04, 0, k % 2 ? .012 : .02, k % 2 ? .3 : -.3);
        continue;
      }

      if (s === 'caught') {
        // 21.15s 復帰スラム以降
        if (Math.abs(t - 21.25) < 0.07) {
          add('snare', t, .25, 0, .24);
          add('bell', t, .3, a ? 72 : 74, .08);
        }
        continue;
      }

      // 通常グルーヴ〜ピーク〜結果
      if (highEnergy || s === 'approach') {
        if (a) {
          add('pluck', t, BEAT * .4, tones[[0, 1, 2, 3, 1, 2, 3, 2][k % 8] % tones.length] + 12, .095 * lift, k % 2 ? .28 : -.28);
        } else {
          const pattern = { 0: 'down', 3: 'up', 6: 'down', 8: 'down', 11: 'up', 14: 'down' };
          if (pattern[k]) {
            tones.slice(0, 3).forEach((m, j) => add('string', t + j * .007, .28, m + 12, .17 * lift, (j - 1) * .22));
          }
        }
        if (k % 2 === 0) add('bass', t, BEAT * (k % 4 === 0 ? .8 : .4), bassMidi + (k === 14 ? 12 : 0), (a ? .1 : .076) * lift);
      }

      // ドラム（アプローチの8.50s〜10.00sスロー区間はハーフタイム＋上昇スネア）
      if (highEnergy) {
        const kicks = a ? [0, 4, 8, 12] : [0, 3, 8, 10];
        if (kicks.includes(k)) add('kick', t, .35, 0, (a ? .28 : .21) * lift);
        if (k === 4 || k === 12) add(a ? 'clap' : 'snare', t, .28, 0, (a ? .22 : .27) * lift);
        if (k % 2 === 0 || s === 'peak') add('hat', t, .04, 0, (k % 2 ? .012 : .022) * lift, k % 2 ? .3 : -.3);
        if (!a && (k === 2 || k === 10)) add('cowbell', t, .1, 0, .065, .2);
      } else if (s === 'approach') {
        if (k === 0) add('kick', t, .4, 0, .26);
        if (k >= 8 || k % 2 === 0) add('snare', t, .18, 0, .07 + .16 * ((t - bar(4)) / BAR));
      }
    }

    // 主旋律モチーフ（Drop・Chorus・Peak・Results）
    for (const [b, midi, len] of motif) {
      const t = at(b);
      const s = sectionAt(t);
      if (!['drop', 'groove', 'chorus', 'peak', 'results'].includes(s)) continue;
      if (t >= bar(5) - 1e-6 && t < bar(5) + 0.1) continue; // ストライク打撃音と分離
      const ans = n % 2 && b === motif.at(-1)[0] ? (a ? -3 : -2) : 0;
      add(a ? 'lead' : 'brass', t, len * BEAT + .12, midi + ans, s === 'peak' ? .14 : .115, -.1);
    }
  }

  // キュー同期インパクトと効果音
  add('kick', MUSIC_CUES.kickImpactAt, .4, 0, .38);
  add('crash', MUSIC_CUES.kickImpactAt, 1.0, 0, .03);
  add('sub', MUSIC_CUES.kickImpactAt, .7, 0, .14);

  add('riser', MUSIC_CUES.buildAt + 0.1, MUSIC_CUES.dropAt - MUSIC_CUES.buildAt - 0.12, 0, .08);
  for (const at of CARD_TIMES) add('pon', at, .12, a ? 77 : 79, .09, 0);
  add('kick', MUSIC_CUES.stampAt, .35, 0, .3);
  add('snare', MUSIC_CUES.stampAt, .25, 0, .28);

  // 4.00s ドロップ ＆ 10.00s ストライク大打撃
  for (const cue of [MUSIC_CUES.dropAt, MUSIC_CUES.impactAt]) {
    add('kick', cue, .45, 0, .42);
    add('crash', cue, 1.5, 0, .038);
    add('sub', cue, .85, 0, .16);
  }
  add('whoosh', MUSIC_CUES.throwAt, MUSIC_CUES.impactAt - MUSIC_CUES.throwAt, 0, .075);

  // 16.00s ベル×3連打アクセント
  for (let i = 0; i < 3; i++) add('bell', MUSIC_CUES.bellAt + i * 0.25, .45, a ? 89 + i * 2 : 91 + i * 2, .11, .15);
  // 20.80s 捕獲直前のアラート音（20.80で完全停止）→ 21.15s 再開打撃
  add('bell', MUSIC_CUES.caughtAt - 0.22, .18, 84, .11);
  add('kick', MUSIC_CUES.caughtResumeAt, .35, 0, .34);
  add('crash', MUSIC_CUES.caughtResumeAt, .8, 0, .025);
  // 22.00s 結果ファンファーレ
  add('bell', MUSIC_CUES.resultsAt, .8, a ? 89 : 91, .1, 0);
  for (const cue of TAP_CUES) add('pon', cue, .09, a ? 89 : 91, .08);

  events.sort((x, y) => x.start - y.start || x.kind.localeCompare(y.kind));
  return {
    variant,
    title: a ? '特売エレクトロ・ポップ' : '特売ブラス・ファンク',
    key: a ? 'F major' : 'G major',
    bpm: BPM,
    bars: BARS,
    chords: chords.map((c, i) => ({ at: bar(i), name: c[0] })),
    events,
  };
}

function randomFactory(seed) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
const polyblep = (t, dt) => (t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0);

export function synthesize(arrangement) {
  const a = arrangement.variant === 'a';
  const names = ['pad', 'lead', 'bass', 'drums', 'fx'];
  const buses = Object.fromEntries(names.map((n) => [n, makeBus()]));
  const random = randomFactory(a ? 0x94a : 0x94b);
  const kicks = [];

  for (const e of arrangement.events) {
    const busName = e.kind === 'pad' ? 'pad'
      : ['bass', 'sub'].includes(e.kind) ? 'bass'
      : ['kick', 'snare', 'clap', 'hat', 'crash', 'cowbell'].includes(e.kind) ? 'drums'
      : ['riser', 'whoosh', 'pon'].includes(e.kind) ? 'fx'
      : 'lead';
    if (e.kind === 'kick') kicks.push(e.start);
    const bus = buses[busName];
    const gl = Math.cos((e.pan + 1) * Math.PI / 4);
    const gr = Math.sin((e.pan + 1) * Math.PI / 4);
    const f = hz(e.midi || 60);
    const first = Math.max(0, Math.round(e.start * SAMPLE_RATE));
    const last = Math.min(FRAMES, Math.round((e.start + e.duration) * SAMPLE_RATE));
    const ph = [random(), random(), random()];
    let low = 0, band = 0, phase = 0, lp = 0;
    let ks = null, ksIdx = 0;
    if (e.kind === 'string') {
      const n = Math.max(2, Math.round(SAMPLE_RATE / f - .5));
      ks = new Float32Array(n);
      let s = 0;
      for (let i = 0; i < n; i++) { s += ((random() * 2 - 1) - s) * .2; ks[i] = s; }
    }
    for (let i = first; i < last; i++) {
      const t = (i - first) / SAMPLE_RATE;
      const left = e.duration - t;
      const rel = clamp(left / .018);
      let s = 0;
      switch (e.kind) {
        case 'pad': {
          s = (.55 * Math.sin(TAU * f * t) + .25 * Math.sin(TAU * f * 2 * t) + .12 * Math.sin(TAU * f * 3 * t))
            * Math.sin(clamp(t / .05) * Math.PI / 2) * Math.sin(clamp(left / .1) * Math.PI / 2);
          break;
        }
        case 'pluck': {
          const idx = 2.0 * Math.exp(-t / .06);
          s = Math.sin(TAU * f * t + idx * Math.sin(TAU * f * 2 * t)) * Math.exp(-t / .2) * clamp(t / .002) * rel;
          break;
        }
        case 'lead': case 'brass': {
          const vib = e.kind === 'lead' ? 1 + .004 * Math.sin(TAU * 6 * t) * clamp((t - .12) / .15) : 1;
          for (let v = 0; v < 2; v++) {
            const inc = f * vib * (v ? 1.005 : 1) / SAMPLE_RATE;
            ph[v] += inc; if (ph[v] >= 1) ph[v] -= 1;
            s += (2 * ph[v] - 1 - polyblep(ph[v], inc)) / 2;
          }
          const cut = e.kind === 'brass' ? 1600 + 2200 * clamp(t / .04) * Math.exp(-t / .25) : 2200 + 2400 * Math.exp(-t / .12);
          const fc = 2 * Math.sin(Math.PI * Math.min(7000, cut) / SAMPLE_RATE);
          low += fc * band; const high = s - low - .85 * band; band += fc * high;
          s = low * clamp(t / .012) * Math.exp(-t / 1.1) * rel;
          break;
        }
        case 'string': {
          const n = ks.length, j = ksIdx % n, nx = (ksIdx + 1) % n;
          s = ks[j]; ks[j] = (ks[j] + ks[nx]) * .496; ksIdx++;
          lp += (s - lp) * .45; s = lp * clamp(left / .03);
          break;
        }
        case 'bell': {
          s = (Math.sin(TAU * f * t) * Math.exp(-t * 2.2) + .35 * Math.sin(TAU * f * 2.75 * t) * Math.exp(-t * 4.5))
            * clamp(t / .002) * rel * .65;
          break;
        }
        case 'pon': {
          phase += (f * (1 + .35 * Math.exp(-t / .015))) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .035) * clamp(t / .001) * rel;
          break;
        }
        case 'bass': {
          const env = clamp(t / .004) * Math.exp(-t * (a ? 2.4 : 3.2)) * rel;
          s = Math.tanh(1.5 * (Math.sin(TAU * f * t) + .5 * Math.sin(TAU * f * 2 * t))) * env * .85;
          break;
        }
        case 'sub': {
          phase += (34 + 38 * Math.exp(-t / .18)) / SAMPLE_RATE;
          s = Math.sin(TAU * phase) * Math.exp(-t / .35) * clamp(t / .003) * rel;
          break;
        }
        case 'kick': {
          phase += (56 + 125 * Math.exp(-t / .024)) / SAMPLE_RATE;
          const click = (random() * 2 - 1) * Math.exp(-t / .002) * .35;
          s = (Math.sin(TAU * phase) * Math.exp(-t / .105) + click) * clamp(t / .001) * rel;
          break;
        }
        case 'snare': {
          const n = random() * 2 - 1;
          const fc = 2 * Math.sin(Math.PI * 1900 / SAMPLE_RATE);
          low += fc * band; const high = n - low - .9 * band; band += fc * high;
          lp += (band - lp) * .42;
          s = (.65 * Math.sin(TAU * 185 * t) * Math.exp(-t / .065) + lp * 1.55 * Math.exp(-t / .11)) * clamp(t / .001) * rel;
          break;
        }
        case 'clap': {
          const n = random() * 2 - 1;
          const fc = 2 * Math.sin(Math.PI * 1500 / SAMPLE_RATE);
          low += fc * band; const high = n - low - .9 * band; band += fc * high;
          const b = [0, .01, .02].reduce((m, p) => m + (t >= p ? Math.exp(-(t - p) / .006) : 0), 0) * .6 + Math.exp(-t / .11) * (t > .02 ? 1 : 0);
          s = band * 2.1 * b * rel;
          break;
        }
        case 'cowbell': {
          s = (Math.sin(TAU * 540 * t) + .7 * Math.sin(TAU * 800 * t)) * Math.exp(-t / .045) * clamp(t / .001) * .5;
          break;
        }
        case 'hat': case 'crash': case 'riser': case 'whoosh': {
          const n = random() * 2 - 1;
          const u = clamp(t / e.duration);
          const centre = e.kind === 'riser' ? 500 * 2 ** (3.5 * u) : e.kind === 'whoosh' ? 350 * 2 ** (3.8 * u) : e.kind === 'crash' ? 5500 : 8500;
          const fc = 2 * Math.sin(Math.PI * Math.min(centre, 11000) / SAMPLE_RATE);
          low += fc * band; const high = n - low - .8 * band; band += fc * high;
          const v = e.kind === 'hat' || e.kind === 'crash' ? high : band;
          const env = e.kind === 'hat' ? Math.exp(-t / .032) * clamp(t / .0007)
            : e.kind === 'crash' ? Math.exp(-t / .52) * clamp(t / .002) * rel
            : e.kind === 'riser' ? u * u * clamp(left / .03)
            : (.25 + .75 * u * u) * clamp(t / .12) * clamp(left / .03);
          s = v * env;
          break;
        }
      }
      bus.l[i] += s * e.gain * gl;
      bus.r[i] += s * e.gain * gr;
    }
  }

  const duck = new Float32Array(FRAMES).fill(1);
  for (const k of kicks) {
    const i0 = Math.round(k * SAMPLE_RATE);
    for (let i = i0; i < Math.min(FRAMES, i0 + Math.round(.26 * SAMPLE_RATE)); i++) {
      duck[i] = Math.min(duck[i], 1 - .42 * Math.exp(-(i - i0) / SAMPLE_RATE / .08));
    }
  }

  const wet = makeBus();
  for (const ch of ['l', 'r']) {
    const send = new Float32Array(FRAMES);
    for (let i = 0; i < FRAMES; i++) send[i] = buses.pad[ch][i] * .28 + buses.lead[ch][i] * .25 + buses.drums[ch][i] * .05;
    let st = new Float32Array(FRAMES);
    for (const sz of [1381, 1499, 1621, 1777]) {
      const len = sz + (ch === 'r' ? 29 : 0), line = new Float32Array(len);
      const fb = 10 ** (-3 * len / SAMPLE_RATE / 1.6);
      let damp = 0;
      for (let i = 0; i < FRAMES; i++) { const pos = i % len, v = line[pos]; st[i] += v * .24; damp += (v - damp) * .4; line[pos] = send[i] + damp * fb; }
    }
    wet[ch] = st;
  }

  const mix = makeBus();
  const fadeFrames = Math.round(MUSIC_CUES.fadeSeconds * SAMPLE_RATE);
  const c0 = Math.round(MUSIC_CUES.caughtAt * SAMPLE_RATE);
  const c1 = Math.round(MUSIC_CUES.caughtResumeAt * SAMPLE_RATE);
  for (const ch of ['l', 'r']) {
    let prev = 0, hpv = 0;
    for (let i = 0; i < FRAMES; i++) {
      // 捕獲のドラマ無音谷を完全に 0 で切る（残響の尾も消す）
      let gate = 1;
      if (i >= c0 - 240 && i < c0) gate = (c0 - i) / 240;
      else if (i >= c0 && i < c1) gate = 0;
      else if (i >= c1 && i < c1 + 240) gate = (i - c1) / 240;

      const d = duck[i];
      const raw = ((buses.pad[ch][i] + buses.bass[ch][i]) * d + buses.lead[ch][i] * (.6 + .4 * d) + buses.drums[ch][i] + buses.fx[ch][i] + wet[ch][i] * .35) * gate;
      hpv = raw - prev + Math.exp(-TAU * 28 / SAMPLE_RATE) * hpv;
      prev = raw;
      const left = FRAMES - 1 - i;
      const fade = left < fadeFrames ? Math.sin(clamp(left / fadeFrames) * Math.PI / 2) ** 2 : 1;
      const fadeIn = Math.sin(clamp(i / (.012 * SAMPLE_RATE)) * Math.PI / 2) ** 2;
      mix[ch][i] = hpv * fade * fadeIn;
    }
  }
  return mix;
}

function limit(bus, gain, ceiling) {
  const look = Math.round(.005 * SAMPLE_RATE), rel = Math.exp(-1 / (.08 * SAMPLE_RATE));
  const out = makeBus(), peak = new Float32Array(FRAMES), need = new Float32Array(FRAMES);
  for (let i = 0; i < FRAMES; i++) peak[i] = Math.max(Math.abs(bus.l[i]), Math.abs(bus.r[i])) * gain;
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
    out.l[i] = bus.l[i] * gain * g;
    out.r[i] = bus.r[i] * gain * g;
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
  let gain = .32 / Math.max(1e-6, peak), ceiling = 10 ** (-2.0 / 20), result = null;
  const scratch = join(dirname(out), `.measure-${variant}-${process.pid}.wav`);
  try {
    for (let pass = 0; pass < 10; pass++) {
      const { out: limited, reducedPercent } = limit(mix, gain, ceiling);
      writeFileSync(scratch, wavBuffer(limited));
      const m = measure(scratch);
      result = { limited, m, reducedPercent, gain, ceilingDb: 20 * Math.log10(ceiling) };
      if (Math.abs(m.lufs - TARGET_LUFS) <= .3 && m.truePeak <= -1.6) break;
      if (m.truePeak > -1.6) ceiling *= 10 ** ((-1.7 - m.truePeak) / 20);
      if (Math.abs(m.lufs - TARGET_LUFS) > .3) gain *= 10 ** ((TARGET_LUFS - m.lufs) / 20);
    }
  } finally { try { unlinkSync(scratch); } catch { /* ignore */ } }
  writeFileSync(out, wavBuffer(result.limited));
  const mp3 = out.replace(/\.wav$/, '.mp3');
  const enc = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-nostdin', '-i', out, '-c:a', 'libmp3lame', '-b:a', '192k', '-map_metadata', '-1', mp3], { encoding: 'utf8', timeout: 60000 });
  if (enc.status !== 0) throw new Error(`mp3 failed: ${enc.stderr}`);
  console.log(`${arrangement.title} / ${arrangement.key} / ${BPM} BPM / ${DURATION_SECONDS}.000秒 -> ${out}`);
  console.log(JSON.stringify({ lufs: result.m.lufs, truePeak: result.m.truePeak, lra: result.m.lra, limiterActivePercent: +result.reducedPercent.toFixed(2), events: arrangement.events.length }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
