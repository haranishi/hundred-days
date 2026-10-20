/* プロモ動画の音（BGM と効果音）。外部の音源・サンプル・ライブラリは使わず、固定シードの純JSで合成する。
   同じ入力なら必ず同じ WAV になる。長さ・拍・場面は timeline.mjs（約33秒・96BPM・1小節2.5秒）。
   楽器の関数と仕上げ（リバーブ・ダッキング・K特性のラウドネス・トゥルーピークのリミッタ）は、Day066 の promo-audio.mjs から続くもの。

   曲：停電の夜・探偵の雰囲気。イ短調。フェルトピアノ風のプラック＋薄いパッド＋低い刻み（ピチカートのベース・時計の刻み）。
     hook   0〜7拍     Am → Am(maj7) → Am7 → Am6（内声が半音ずつ下がる）。刻みは4分。0秒から鳴る
     solve  7〜14拍    F → Dm9 → E7sus4 → E7。刻みが8分になり、心音のようなキック。成功（光る）へ引っ張る
     solved 14〜16拍   Am(add9)。ドラムを抜き、判子とチャイムを聞かせる
     deduce 16〜22拍   Dm7 → E7(b9) → Am。歩くピチカート・ブラシ。「解決」の判子が 20拍目の Am に着く
     night3 22〜38拍   Am → F → Dm9 → E7 → Am(add9)。いちばん厚い。成功で一度抜く
     night5 38〜44拍   F → Dm7 → E7sus4 → E7。薄く、終了カードへ引っ張る
     end    44〜53拍   Am(add9) の終止を鳴らし切り、最後にフェード
   効果音：timeline.mjs の deriveCues() が出す合図（render-promo.mjs が、書き出した動画から測った時刻を入れたもの）に合わせて重ねる。

   使い方:
     node promo-audio.mjs --out output/promo-audio.wav --cues output/cues.json
     node promo-audio.mjs --no-sfx        効果音なし（BGMだけを聴く）
   音量は ITU-R BS.1770 の K 特性（このファイル内に実装）で測り、統合ラウドネスを -17 LUFS に合わせる。
   最後にルックアヘッドのリミッタで、トゥルーピークが -2.9 dBTP を超えないようにする（AAC にしたあとの上振れの余白）。 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAT, DURATION_SECONDS, SECTIONS, deriveCues } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); const v = i >= 0 ? argv[i + 1] : undefined; return v && !v.startsWith('--') ? v : fallback; };
const OUT = resolve(arg('--out', resolve(here, 'output/promo-audio.wav')));
const SFX_ON = !argv.includes('--no-sfx');
const CUES = arg('--cues', null) ? JSON.parse(readFileSync(resolve(arg('--cues')), 'utf8')) : deriveCues();

const SR = 48000;
const N = Math.round(DURATION_SECONDS * SR);
const TAU = Math.PI * 2;
const TARGET_LUFS = -17.0;
const CEILING_TP = -2.9;      // WAV で -3.0 dBTP。AAC にした mp4 では -3.4〜-2.3 dBTP に揺れた（実測）。-2 dBTP 以下に収める余白

// ── 土台 ──────────────────────────────────────────────────────────────────
let seed = 0x71d7c3a5 >>> 0;
const random = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const noise = () => random() * 2 - 1;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const makeBus = () => ({ l: new Float32Array(N), r: new Float32Array(N) });
const pan = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];
const first = (t) => Math.max(0, Math.floor(t * SR));
const last = (t) => Math.min(N, Math.ceil(t * SR));
const B = (beat) => beat * BEAT;     // 拍 → 秒

const buses = { pad: makeBus(), keys: makeBus(), bass: makeBus(), kick: makeBus(), drums: makeBus(), fx: makeBus(), sfx: makeBus() };

function voice(bus, { t, len, pan: p = 0, gain = 1 }, fn) {
  const [gl, gr] = pan(p);
  const from = first(t); const to = last(t + len);
  for (let i = from; i < to; i += 1) {
    const s = fn(i / SR - t, i) * gain;
    bus.l[i] += s * gl; bus.r[i] += s * gr;
  }
}

class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  set(type, fc, q = Math.SQRT1_2) {
    const w = TAU * clamp(fc, 20, SR * 0.45) / SR; const c = Math.cos(w); const alpha = Math.sin(w) / (2 * q); const a0 = 1 + alpha;
    if (type === 'lp') { this.b0 = (1 - c) / 2; this.b1 = 1 - c; this.b2 = (1 - c) / 2; }
    else if (type === 'hp') { this.b0 = (1 + c) / 2; this.b1 = -(1 + c); this.b2 = (1 + c) / 2; }
    else { this.b0 = alpha; this.b1 = 0; this.b2 = -alpha; }
    this.a1 = -2 * c / a0; this.a2 = (1 - alpha) / a0; this.b0 /= a0; this.b1 /= a0; this.b2 /= a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}
const filt = (type, fc, q) => new Biquad().set(type, fc, q);
const blep = (t, dt) => { if (t < dt) { const x = t / dt; return x + x - x * x - 1; } if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; } return 0; };
const saw = (ph, dt) => 2 * ph - 1 - blep(ph, dt);
const tri = (ph) => 4 * Math.abs(ph - 0.5) - 1;
const swell = (t, len, a, r) => (t < 0 || t >= len ? 0 : Math.sin(Math.min(1, t / Math.max(a, 1e-4)) * Math.PI / 2) * Math.sin(Math.min(1, (len - t) / Math.max(r, 1e-4)) * Math.PI / 2));
const pluckEnv = (t, len, a, tau, r = 0.04) => (t < 0 || t >= len ? 0 : (1 - Math.exp(-t / a)) * Math.exp(-t / tau) * Math.min(1, (len - t) / r));

// ── 和音（MIDI）。pad は内声の並び、bass は根音 ──────────────────────────────
/* walk は歩くベースの音程（根音からの半音）。短和音は 1・♭3・5・♭7、属和音は 1・3・5・♭7 */
const MINOR = [0, 3, 7, 10]; const DOM = [0, 4, 7, 10];
const CH = {
  Am: { pad: [57, 60, 64], bass: 45, tones: [57, 60, 64], walk: MINOR },
  AmM7: { pad: [56, 60, 64], bass: 45, tones: [56, 60, 64], walk: [0, 3, 7, 11] },
  Am7: { pad: [55, 60, 64], bass: 45, tones: [55, 60, 64], walk: MINOR },
  Am6: { pad: [54, 60, 64], bass: 45, tones: [54, 60, 64], walk: [0, 3, 7, 9] },
  F: { pad: [53, 57, 60, 64], bass: 41, tones: [53, 57, 60, 64], walk: [0, 4, 7, 11] },
  Dm9: { pad: [50, 53, 57, 64], bass: 38, tones: [50, 53, 57, 64], walk: MINOR },
  Dm7: { pad: [50, 53, 57, 60], bass: 38, tones: [50, 53, 57, 60], walk: MINOR },
  E7s4: { pad: [52, 57, 59, 62], bass: 40, tones: [52, 57, 59, 62], walk: [0, 5, 7, 10] },
  E7: { pad: [52, 56, 59, 62], bass: 40, tones: [52, 56, 59, 62], walk: DOM },
  E7b9: { pad: [52, 56, 62, 65], bass: 40, tones: [52, 56, 59, 65], walk: DOM },
  Am9: { pad: [57, 59, 60, 64], bass: 45, tones: [57, 60, 64, 71], walk: MINOR },
};
/* [始まりの拍, 和音, 場面]。場面の頭（timeline.mjs の SECTIONS）で必ず和音が替わる */
const PLAN = [
  [0, 'Am', 'hook'], [2, 'AmM7', 'hook'], [4, 'Am7', 'hook'], [6, 'Am6', 'hook'],
  [7, 'F', 'solve'], [9, 'Dm9', 'solve'], [11, 'E7s4', 'solve'], [12, 'E7', 'solve'],
  [14, 'Am9', 'solved'],
  [16, 'Dm7', 'deduce'], [18, 'E7b9', 'deduce'], [20, 'Am', 'deduce'],
  [22, 'Am', 'night3'], [26, 'F', 'night3'], [30, 'Dm9', 'night3'], [33, 'E7', 'night3'], [35, 'Am9', 'night3'],
  [38, 'F', 'night5'], [40, 'Dm7', 'night5'], [42, 'E7s4', 'night5'], [43, 'E7', 'night5'],
  [44, 'Am9', 'end'],
];
// 場面の頭（timeline.mjs）と、和音の計画の場面の切れ目が一致しているか。ずれていたら止める（場面の頭で和音が替わらなくなる）
for (const [name, sec] of Object.entries(SECTIONS)) {
  const beat = sec.start / BEAT;
  const at = PLAN.find(([b]) => Math.abs(b - beat) < 1e-6);
  if (!at || at[2] !== name || PLAN.some(([b, , n]) => n === name && b < beat - 1e-6)) throw new Error(`和音の計画が、場面「${name}」の頭（${sec.start}秒＝${beat}拍）と合っていません`);
}
const TOTAL_BEATS = DURATION_SECONDS / BEAT;
const spans = PLAN.map(([beat, name, sec], i) => ({ beat, end: i + 1 < PLAN.length ? PLAN[i + 1][0] : TOTAL_BEATS, chord: CH[name], name, sec }));
const spanAt = (t) => spans.find((s) => t >= B(s.beat) - 1e-9 && t < B(s.end) - 1e-9) ?? spans[spans.length - 1];

// ── 音色 ──────────────────────────────────────────────────────────────────

/* フェルトピアノ風：わずかに不協和な倍音（弦の硬さ）を足し、高い倍音ほど速く消える。打鍵の柔らかい雑音つき */
function piano({ t, len, midi, gain, p = 0, bright = 1, bus = buses.keys }) {
  const f = mtof(midi); const tau0 = clamp(1.6 - (midi - 60) / 40, 0.5, 2.2);
  const partials = [1, 2, 3, 4, 5, 6].map((n) => ({ n, f: n * f * Math.sqrt(1 + 0.00035 * n * n), a: (n === 1 ? 1 : 0.55 / n ** 1.15) * (n > 3 ? bright : 1), tau: tau0 / (1 + 0.55 * (n - 1)) }));
  const lp = filt('lp', 900 + 2200 * bright, 0.7); const hammer = filt('bp', 1400, 0.9);
  voice(bus, { t, len: len + 0.25, pan: p, gain }, (time) => {
    let s = 0;
    for (const q of partials) s += Math.sin(TAU * q.f * time) * q.a * Math.exp(-time / q.tau);
    const thump = hammer.run(noise()) * 0.12 * Math.exp(-time / 0.012);
    return lp.run(s * 0.5 + thump) * Math.min(1, time / 0.0025) * Math.min(1, (len + 0.25 - time) / 0.22);
  });
}

function padNote({ t, len, midi, gain, p = 0, cutoff = 1300, attack = 0.25, release = 0.8, spread = 6, bus = buses.pad }) {
  const f = mtof(midi); const dts = [-spread, 0, spread].map((c) => f * 2 ** (c / 1200) / SR);
  const ph = [random(), random(), random()]; const lp = filt('lp', cutoff, 0.7);
  voice(bus, { t, len: len + release, pan: p, gain }, (time) => {
    let s = 0;
    for (let k = 0; k < 3; k += 1) { ph[k] += dts[k]; if (ph[k] >= 1) ph[k] -= 1; s += saw(ph[k], dts[k]); }
    return lp.run(s / 3 * 0.8 + tri((time * f / 2) % 1) * 0.3) * swell(time, len + release, attack, release);
  });
}

/* ピチカートのベース（低い刻み）：正弦＋速く消える2倍音・3倍音 */
function pizz({ t, len = BEAT * 0.45, midi, gain }) {
  const f = mtof(midi);
  voice(buses.bass, { t, len: len + 0.05, gain }, (time) => {
    const c = TAU * f * time;
    return (Math.sin(c) + 0.38 * Math.sin(2 * c) * Math.exp(-time / 0.05) + 0.14 * Math.sin(3 * c) * Math.exp(-time / 0.03)) * pluckEnv(time, len + 0.05, 0.003, 0.22, 0.04);
  });
}
function drone({ t, len, midi, gain }) {
  const f = mtof(midi);
  voice(buses.bass, { t, len, gain }, (time) => (Math.sin(TAU * f * time) + 0.2 * Math.sin(TAU * f * 2 * time)) * swell(time, len, 0.06, 1.0));
}

function bell({ t, len = 1.2, midi, gain, p = 0, bus = buses.sfx }) {
  const f = mtof(midi);
  voice(bus, { t, len, pan: p, gain }, (time) => {
    const c = TAU * f * time;
    const mod = Math.sin(c * 3.5) * 2.0 * Math.exp(-time / 0.12);
    const body = Math.sin(c + mod) * 0.8 + Math.sin(c * 2.01) * 0.2 * Math.exp(-time / 0.3);
    return (body + Math.sin(c * 9.3) * 0.1 * Math.exp(-time / 0.03)) * pluckEnv(time, len, 0.003, 0.6, 0.12);
  });
}

// ── 打楽器（静かに） ───────────────────────────────────────────────────────
function kick(t, vel = 1) {
  let ph = 0;
  voice(buses.kick, { t, len: 0.4, gain: vel }, (time) => {
    ph += TAU * (46 + 70 * Math.exp(-time / 0.025)) / SR;
    return Math.sin(ph) * Math.exp(-time / 0.14) * Math.min(1, time / 0.0015, (0.4 - time) / 0.04);
  });
}
function brush(t, vel = 1) {
  const bp = filt('bp', 3600, 0.6); const hp = filt('hp', 300, 0.7);
  voice(buses.drums, { t, len: 0.3, gain: vel, pan: 0.08 }, (time) => bp.run(hp.run(noise())) * Math.exp(-time / 0.12) * Math.min(1, time / 0.012) * 1.2);
}
function tick(t, vel = 1) {     // 時計の刻み
  const bp = filt('bp', 2400, 3);
  voice(buses.drums, { t, len: 0.05, gain: vel, pan: 0.22 }, (time) => (Math.sin(TAU * 2100 * time) * 0.45 + bp.run(noise()) * 0.6) * Math.exp(-time / 0.006));
}
function hat(t, vel = 1) {
  const hp = filt('hp', 7500, 0.8);
  voice(buses.drums, { t, len: 0.07, gain: vel, pan: -0.15 }, (time) => hp.run(noise()) * Math.exp(-time / 0.014) * Math.min(1, time / 0.0008));
}
function rim(t, vel = 1) {
  const bp = filt('bp', 2800, 1.4);
  voice(buses.drums, { t, len: 0.08, gain: vel, pan: 0.1 }, (time) => (Math.sin(TAU * 520 * time) * 0.6 + bp.run(noise()) * 0.7) * Math.exp(-time / 0.012));
}
function riser(t, len, gain) {
  const bp = filt('bp', 300, 1.3); let n = 0;
  voice(buses.fx, { t, len, gain }, (time) => {
    const r = time / len;
    if ((n += 1) % 16 === 0) bp.set('bp', 300 + 5200 * r * r, 1.3);
    return bp.run(noise()) * r * r * 1.6 * Math.min(1, (len - time) / 0.015);
  });
}
function boom(t, gain = 1) {
  let ph = 0;
  voice(buses.fx, { t, len: 1.4, gain }, (time) => { ph += TAU * (38 + 34 * Math.exp(-time / 0.09)) / SR; return Math.sin(ph) * Math.exp(-time / 0.35) * Math.min(1, time / 0.003); });
}

// ── 効果音 ────────────────────────────────────────────────────────────────
const sfx = buses.sfx;
const SFX = {
  lamp(t, o) {      // 灯りを動かす弱い音：高さ（30〜165cm）を E4〜E6 の音程にして、その時の和音のいちばん近い音に寄せる。上げると上がる
    const want = 64 + (o.height - 30) / 135 * 24;
    const pcs = spanAt(t).chord.tones.map((m) => m % 12);
    let midi = Math.round(want);
    for (let d = 0; d <= 6; d += 1) { if (pcs.includes((Math.round(want) + d) % 12)) { midi = Math.round(want) + d; break; } if (pcs.includes(((Math.round(want) - d) % 12 + 12) % 12)) { midi = Math.round(want) - d; break; } }
    const f = mtof(midi);
    voice(sfx, { t, len: 0.09, pan: 0.18, gain: 0.3 }, (time) => (Math.sin(TAU * f * time) + 0.3 * Math.sin(TAU * f * 2 * time) * Math.exp(-time / 0.015)) * pluckEnv(time, 0.09, 0.002, 0.03, 0.02));
  },
  slide(t, o) {     // 道具をすべらせる：紙と板がこすれる音。動きの速さ（つかんで、すべって、止まる）に合わせて膨らむ
    const bp = filt('bp', 1900, 0.8); const lp = filt('lp', 4200, 0.7); const len = o.len;
    voice(sfx, { t, len, pan: -0.1, gain: 0.85 }, (time) => {
      const u = clamp(time / len, 0, 1);
      const speed = Math.sin(Math.PI * u) ** 1.4;
      return lp.run(bp.run(noise())) * speed * (0.75 + 0.25 * Math.sin(TAU * 23 * time));
    });
    voice(sfx, { t, len: 0.05, gain: 0.32 }, (time) => Math.sin(TAU * 320 * time) * Math.exp(-time / 0.012));     // つかむ「こつ」
  },
  meter(t, o) {     // 近さの目盛りが増える：小さな「ぴ」。段が上がるほど高い
    const midi = { 2: 81, 3: 84, 4: 88 }[o.step] ?? 81;
    bell({ t, len: 0.5, midi, gain: 0.38, p: 0.25 });
    bell({ t: t + 0.04, len: 0.4, midi: midi + 12, gain: 0.12, p: 0.3 });
  },
  snap(t) {         // そろって吸い付く：0.4秒で吸い込むように高くなり、最後に小さく「かちっ」
    const bp = filt('bp', 500, 1.1); let n = 0;
    voice(sfx, { t, len: 0.42, gain: 0.85 }, (time) => {
      const u = clamp(time / 0.4, 0, 1);
      if ((n += 1) % 16 === 0) bp.set('bp', 500 + 3600 * u * u, 1.1);
      return bp.run(noise()) * u * u * Math.min(1, (0.42 - time) / 0.02);
    });
    const hp = filt('hp', 2500, 0.7);
    voice(sfx, { t: t + 0.4, len: 0.05, gain: 0.8 }, (time) => (hp.run(noise()) * 0.8 + Math.sin(TAU * 1800 * time) * 0.5) * Math.exp(-time / 0.008));
  },
  chime(t) {        // 光る（成功）：その時の和音で、上がっていくチャイム
    const c = spanAt(t + 0.01).chord;
    const tones = [...c.tones.map((m) => m + 12), c.tones[0] + 24];
    tones.forEach((m, k) => bell({ t: t + k * 0.055, len: 1.6, midi: m, gain: 0.32 * (1 - k * 0.06), p: (k - 2) * 0.22 }));
    const hp = filt('hp', 6500, 0.8);
    voice(sfx, { t, len: 0.4, gain: 0.2 }, (time) => hp.run(noise()) * Math.exp(-time / 0.09));
  },
  stamp(t) {        // 判子：紙に押す低い「ドン」。紙を打つ音（高い成分）で立ち上がり、低い胴鳴りが続く
    let ph = 0; const hp = filt('hp', 1800, 0.7); const bp = filt('bp', 320, 1.2);
    voice(sfx, { t, len: 0.5, gain: 1.25 }, (time) => {
      ph += TAU * (52 + 60 * Math.exp(-time / 0.03)) / SR;
      const thud = Math.sin(ph) * Math.exp(-time / 0.16) * 1.1;
      const knock = bp.run(noise()) * Math.exp(-time / 0.03) * 1.4;
      const slap = hp.run(noise()) * Math.exp(-time / 0.012) * 1.6;
      return (thud + knock + slap) * Math.min(1, time / 0.0006);
    });
  },
  tap(t) {          // ボタン：小さな「こつ」
    voice(sfx, { t, len: 0.06, gain: 0.55 }, (time) => (Math.sin(TAU * 1250 * time) * 0.6 + Math.sin(TAU * 2500 * time) * 0.2) * Math.exp(-time / 0.014));
  },
  cross(t) {        // 外す：鉛筆で線を引く「しゅっ」
    const bp = filt('bp', 3800, 1.1);
    voice(sfx, { t, len: 0.16, gain: 0.6, pan: 0.15 }, (time) => bp.run(noise()) * swell(time, 0.16, 0.02, 0.08));
    SFX.tap(t);
  },
  cut(t) {          // 場面の切れ目：切れ目へ向けて大きくなる風切り音と、小さな一撃
    const bp = filt('bp', 400, 1.2); let n = 0;
    voice(sfx, { t: t - 0.4, len: 0.48, gain: 0.7 }, (time) => {
      if ((n += 1) % 16 === 0) bp.set('bp', 350 + 4000 * clamp(time / 0.4, 0, 1) ** 2, 1.2);
      return bp.run(noise()) * (time < 0.4 ? (time / 0.4) ** 2 : Math.exp(-(time - 0.4) / 0.03)) * Math.min(1, (0.48 - time) / 0.03);
    });
    boom(t, 0.35);
  },
  end(t) {          // 終了カード：低い一撃とベルの和音
    boom(t, 0.4);
    [69, 76, 81, 83].forEach((m, k) => bell({ t: t + 0.05 + k * 0.08, len: 2.6, midi: m, gain: 0.24, p: (k - 1.5) * 0.3 }));
  },
  rise(t) {         // 終了カードの影が上がる
    const bp = filt('bp', 300, 1.2); let n = 0; const len = 0.6;
    voice(sfx, { t, len, gain: 0.22 }, (time) => { const u = time / len; if ((n += 1) % 16 === 0) bp.set('bp', 300 + 1800 * u, 1.2); return bp.run(noise()) * swell(time, len, 0.25, 0.12); });
  },
  land(t) {         // 影が収まる：小さな吸い付く音とチャイム
    const hp = filt('hp', 2500, 0.7);
    voice(sfx, { t, len: 0.05, gain: 0.35 }, (time) => (hp.run(noise()) * 0.8 + Math.sin(TAU * 1800 * time) * 0.4) * Math.exp(-time / 0.008));
    [81, 88, 93].forEach((m, k) => bell({ t: t + 0.03 + k * 0.06, len: 1.8, midi: m, gain: 0.16, p: (k - 1) * 0.3 }));
  },
};

// ── 編曲 ──────────────────────────────────────────────────────────────────
const kickTimes = [];
function arrange() {
  for (const s of spans) {
    const t0 = B(s.beat); const len = B(s.end - s.beat); const c = s.chord;
    // パッド：場面ごとの厚さ。hook と end は少し前へ
    const padGain = { hook: 0.34, solve: 0.26, solved: 0.32, deduce: 0.24, night3: 0.24, night5: 0.3, end: 0.32 }[s.sec];
    const release = s.sec === 'end' ? 2.2 : 0.5;
    c.pad.forEach((m, k) => padNote({ t: t0, len, midi: m, gain: padGain * (k === 0 ? 0.6 : 1), p: (k - (c.pad.length - 1) / 2) * 0.32, cutoff: s.sec === 'hook' ? 1000 : 1500, attack: t0 === 0 ? 0.05 : 0.18, release }));
    // 低い刻み
    for (let b = s.beat; b < s.end - 1e-9; b += 0.5) {
      const onBeat = Math.abs(b - Math.round(b)) < 1e-9; const t = B(b);
      if (s.sec === 'hook' && onBeat) pizz({ t, midi: c.bass, gain: 0.5 });
      if ((s.sec === 'solve' || s.sec === 'night3') && !(s.sec === 'night3' && b >= 35 && b < 36)) pizz({ t, midi: c.bass + (onBeat ? 0 : 12), gain: onBeat ? 0.55 : 0.32 });
      if (s.sec === 'deduce' && onBeat) pizz({ t, midi: c.bass + c.walk[Math.round(b - s.beat) % 4], gain: 0.5 });
      if (s.sec === 'night5' && onBeat) pizz({ t, midi: c.bass, gain: 0.48 });
    }
    if (s.sec === 'solved') drone({ t: t0, len: len + 0.3, midi: c.bass, gain: 0.3 });
    if (s.sec === 'end') drone({ t: t0, len: len, midi: c.bass, gain: 0.18 });
    // 鍵盤（フェルトピアノ）
    const tones = [...c.tones, c.tones[1] + 12, c.tones[2] + 12];
    if (s.sec === 'hook') {
      // 上は和音の音で E5 – E5 – D5 – C5 と留まって下りる。内声（A → G# → G → F#）が半音ずつ下がるのと重ねて、不穏さを出す
      const motif = { 0: 76, 2: 76, 4: 74, 6: 72 }[s.beat];
      piano({ t: t0, len: B(1.8), midi: motif, gain: 0.3, p: 0.1 });
      piano({ t: t0, len: B(1.6), midi: c.pad[0], gain: 0.22, p: -0.25, bright: 0.6 });
      if (s.end - s.beat >= 2) piano({ t: B(s.beat + 1), len: B(0.8), midi: c.pad[2], gain: 0.16, p: 0.3, bright: 0.6 });
    } else if (s.sec === 'solve' || s.sec === 'night3') {
      const order = [0, 2, 1, 3, 2, 4, 3, 1];
      let k = 0;
      for (let b = s.beat; b < s.end - 1e-9; b += 0.5, k += 1) {
        if (s.sec === 'night3' && b >= 35 && b < 36.5) continue;       // 成功の瞬間は、鍵盤を抜く
        piano({ t: B(b) + (random() - 0.5) * 0.006, len: B(0.7), midi: tones[order[k % order.length]], gain: 0.2 * (b % 1 === 0 ? 1 : 0.8), p: (random() * 2 - 1) * 0.4, bright: 0.8 });
      }
    } else if (s.sec === 'deduce') {
      for (let b = s.beat + 0.5; b < s.end - 1e-9; b += 1) c.tones.slice(1).forEach((m, k) => piano({ t: B(b) + k * 0.012, len: B(0.35), midi: m + 12, gain: 0.12, p: (k - 1) * 0.3, bright: 0.7 }));
    } else if (s.sec === 'solved' || s.sec === 'end') {
      tones.forEach((m, k) => piano({ t: t0 + k * 0.09, len: B(3), midi: m, gain: 0.2 - k * 0.015, p: (k - 2) * 0.25, bright: 0.7 }));
      if (s.sec === 'end') [[1.5, 88], [2.5, 84], [3.5, 83], [4.5, 81]].forEach(([b, m]) => piano({ t: t0 + B(b), len: B(2.5), midi: m, gain: 0.17, p: 0.15 }));
    } else if (s.sec === 'night5') {
      for (let b = s.beat; b < s.end - 1e-9; b += 1) piano({ t: B(b), len: B(0.9), midi: tones[(b - s.beat) % tones.length] + 12, gain: 0.14, p: 0.2, bright: 0.6 });
    }
    // 打楽器
    for (let b = s.beat; b < s.end - 1e-9; b += 0.5) {
      const t = B(b); const onBeat = Math.abs(b - Math.round(b)) < 1e-9; const beatInBar = Math.round(b) % 4;
      if (s.sec === 'hook' || s.sec === 'night5') tick(t, onBeat ? 0.32 : 0.2);
      if (s.sec === 'solve') { if (onBeat && (beatInBar === 0 || beatInBar === 2)) { kick(t, 0.55); kickTimes.push(t); } if (!onBeat) hat(t, 0.22); }
      if (s.sec === 'deduce') { if (onBeat && beatInBar % 2 === 1) brush(t, 0.4); if (!onBeat) tick(t, 0.16); }
      if (s.sec === 'night3' && !(b >= 35 && b < 36.5)) {
        if (onBeat && beatInBar === 0) { kick(t, 0.62); kickTimes.push(t); }
        if (!onBeat && beatInBar === 1) { kick(t, 0.42); kickTimes.push(t); }
        if (onBeat && beatInBar === 2) rim(t, 0.42);
        hat(t, onBeat ? 0.24 : 0.15);
      }
    }
  }
  // 引っ張り：成功の前・場面の切れ目の前・終了カードの前
  riser(B(10.5), B(2.6), 0.12);
  riser(B(32.5), B(2.4), 0.12);
  riser(B(41.5), B(2.5), 0.14);
}

// ── 効果音を置く ───────────────────────────────────────────────────────────
const sfxDuck = [];
function placeSfx() {
  if (!SFX_ON) return;
  for (const cue of CUES) {
    const f = SFX[cue.kind]; if (!f) continue;
    f(cue.at, cue);
    const depth = { stamp: 0.5, chime: 0.3, snap: 0.15, meter: 0.1, slide: 0.1, cut: 0.12, end: 0.2, land: 0.15, tap: 0.05, cross: 0.1 }[cue.kind];
    if (depth) sfxDuck.push({ at: cue.at, depth, len: cue.kind === 'slide' ? cue.len : cue.kind === 'chime' ? 0.9 : cue.kind === 'stamp' ? 0.45 : 0.25 });
  }
}

// ── 仕上げ（リバーブ・ダッキング・ミックス・ラウドネス・リミッタ） ─────────────────
function reverbOf(inputs) {
  const send = { l: new Float32Array(N), r: new Float32Array(N) };
  for (const [bus, amount] of inputs) for (let i = 0; i < N; i += 1) { send.l[i] += bus.l[i] * amount; send.r[i] += bus.r[i] * amount; }
  const hp = [filt('hp', 220, 0.7), filt('hp', 220, 0.7)]; const lp = [filt('lp', 5000, 0.7), filt('lp', 5000, 0.7)];
  const out = { l: new Float32Array(N), r: new Float32Array(N) };
  const decay = 2.0; const combs = [1557, 1617, 1491, 1422]; const allpass = [556, 441];
  ['l', 'r'].forEach((ch, ci) => {
    const input = new Float32Array(N); const off = ci === 0 ? 0 : 29;
    for (let i = 0; i < N; i += 1) input[i] = lp[ci].run(hp[ci].run(send[ch][i]));
    const acc = new Float32Array(N);
    for (const size of combs) {
      const len = size + off; const line = new Float32Array(len); const g = 10 ** (-3 * (len / SR) / decay); let cur = 0; let damp = 0;
      for (let i = 0; i < N; i += 1) { const v = line[cur]; acc[i] += v * 0.25; damp += (v - damp) * 0.35; line[cur] = input[i] + damp * g; cur = (cur + 1) % len; }
    }
    let stage = acc;
    for (const size of allpass) {
      const len = size + off; const line = new Float32Array(len); const next = new Float32Array(N); let cur = 0;
      for (let i = 0; i < N; i += 1) { const d = line[cur]; const v = stage[i]; next[i] = d - v; line[cur] = v + d * 0.5; cur = (cur + 1) % len; }
      stage = next;
    }
    out[ch] = stage;
  });
  return out;
}

function duckCurve() {
  const duck = new Float32Array(N).fill(1);
  for (const t of kickTimes) {
    const from = first(t);
    for (let k = 0; k < Math.floor(0.2 * SR) && from + k < N; k += 1) { const tt = k / SR; const v = 1 - 0.22 * (tt < 0.006 ? tt / 0.006 : Math.exp(-(tt - 0.006) / 0.07)); if (v < duck[from + k]) duck[from + k] = v; }
  }
  for (const d of sfxDuck) {
    const from = first(d.at - 0.03);
    for (let k = 0; k < Math.floor((d.len + 0.5) * SR) && from + k < N; k += 1) { const tt = k / SR - 0.03; const v = 1 - d.depth * (tt < 0 ? (tt + 0.03) / 0.03 : tt < d.len ? 1 : Math.exp(-(tt - d.len) / 0.18)); if (v < duck[from + k]) duck[from + k] = v; }
  }
  return duck;
}

/* ITU-R BS.1770-4：K特性（高域シェルフ＋RLBハイパス、48kHz の係数）→ 400ms ブロック（75%重ね）→ 絶対ゲート -70・相対ゲート -10 */
function kWeight(x) {
  const s1 = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [1, -1.69065929318241, 0.73248077421585] };
  const s2 = { b: [1, -2, 1], a: [1, -1.99004745483398, 0.99007225036621] };
  const pass = (inp, f) => { const out = new Float32Array(inp.length); let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0; for (let i = 0; i < inp.length; i += 1) { const v = inp[i]; const y = f.b[0] * v + f.b[1] * x1 + f.b[2] * x2 - f.a[1] * y1 - f.a[2] * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; out[i] = y; } return out; };
  return pass(pass(x, s1), s2);
}
function lufs(l, r, from = 0, to = N) {
  const kl = kWeight(l); const kr = kWeight(r);
  const block = Math.round(0.4 * SR); const hop = Math.round(0.1 * SR); const powers = [];
  for (let s = from; s + block <= to; s += hop) { let sum = 0; for (let i = s; i < s + block; i += 1) sum += kl[i] * kl[i] + kr[i] * kr[i]; powers.push(sum / block); }
  const lk = (p) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => lk(p) > -70);
  if (!abs.length) return -Infinity;
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const kept = abs.filter((p) => lk(p) > rel);
  return lk(kept.reduce((a, b) => a + b, 0) / kept.length);
}
function truePeakDb(l, r) {
  const taps = 12; const phases = [0.25, 0.5, 0.75];
  const kernels = phases.map((ph) => Array.from({ length: taps * 2 }, (_, k) => { const x = k - taps + 1 - ph; const w = 0.5 + 0.5 * Math.cos(Math.PI * x / taps); return (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * w; }));
  let peak = 0;
  for (const ch of [l, r]) {
    for (let i = taps; i < N - taps; i += 1) {
      const a = Math.abs(ch[i]); if (a > peak) peak = a;
      if (a < peak * 0.5) continue;
      for (const kern of kernels) { let s = 0; for (let k = 0; k < kern.length; k += 1) s += kern[k] * ch[i - taps + 1 + k]; if (Math.abs(s) > peak) peak = Math.abs(s); }
    }
  }
  return 20 * Math.log10(peak);
}
/* ルックアヘッド・リミッタ（前後 3ms の窓で必要なゲインの最小値を取り、窓の平均でならす。リリース 90ms） */
function limiter(l, r, ceilingDb) {
  const ceil = 10 ** (ceilingDb / 20); const look = Math.round(0.003 * SR);
  const need = new Float32Array(N);
  for (let i = 0; i < N; i += 1) { const p = Math.max(Math.abs(l[i]), Math.abs(r[i])); need[i] = p > ceil ? ceil / p : 1; }
  const minw = new Float32Array(N); const dq = [];
  for (let i = 0; i < N + look; i += 1) {
    if (i < N) { while (dq.length && need[dq[dq.length - 1]] >= need[i]) dq.pop(); dq.push(i); }
    const c = i - look; if (c < 0) continue;
    while (dq.length && dq[0] < c - look) dq.shift();
    minw[c] = need[dq[0]];
  }
  const pre = new Float64Array(N + 1); for (let i = 0; i < N; i += 1) pre[i + 1] = pre[i] + minw[i];
  const ol = new Float32Array(N); const or = new Float32Array(N); const rel = Math.exp(-1 / (0.09 * SR)); let g = 1;
  for (let i = 0; i < N; i += 1) {
    const lo = Math.max(0, i - look); const hi = Math.min(N - 1, i + look);
    const target = (pre[hi + 1] - pre[lo]) / (hi - lo + 1);
    g = target < g ? target : target + (g - target) * rel;
    ol[i] = l[i] * g; or[i] = r[i] * g;
  }
  return { l: ol, r: or };
}

function master() {
  const rev = reverbOf([[buses.pad, 0.45], [buses.keys, 0.6], [buses.drums, 0.2], [buses.fx, 0.4], [buses.sfx, 0.35]]);
  const duck = duckCurve();
  const L = new Float32Array(N); const Rr = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    const d = duck[i];
    L[i] = (buses.pad.l[i] + buses.keys.l[i] + buses.fx.l[i] + buses.bass.l[i] * 0.9 + rev.l[i] * 0.55) * d + buses.kick.l[i] + buses.drums.l[i] + buses.sfx.l[i];
    Rr[i] = (buses.pad.r[i] + buses.keys.r[i] + buses.fx.r[i] + buses.bass.r[i] * 0.9 + rev.r[i] * 0.55) * d + buses.kick.r[i] + buses.drums.r[i] + buses.sfx.r[i];
  }
  // 25Hz の1次ハイパスと、頭の 4ms・終わりのフェード（1.3秒）
  const pole = 1 - TAU * 25 / SR; let x1l = 0; let y1l = 0; let x1r = 0; let y1r = 0;
  const fadeStart = DURATION_SECONDS - 1.3;
  for (let i = 0; i < N; i += 1) {
    const yl = L[i] - x1l + pole * y1l; x1l = L[i]; y1l = yl; const yr = Rr[i] - x1r + pole * y1r; x1r = Rr[i]; y1r = yr;
    const t = i / SR; const fin = Math.min(1, t / 0.004); const fout = t > fadeStart ? Math.cos(Math.min(1, (t - fadeStart) / 1.3) * Math.PI / 2) ** 1.6 : 1;
    L[i] = yl * fin * fout; Rr[i] = yr * fin * fout;
  }
  // ラウドネスを目標へ（リミッタを通した結果で測り、ゲインを追い込む）。トゥルーピークが超えるなら、上限を下げてやり直す
  let ceiling = CEILING_TP - 0.4; let gain = 0.3; let out = null; let measured = -99;
  for (let round = 0; round < 3; round += 1) {
    for (let iter = 0; iter < 8; iter += 1) {
      out = limiter(L.map((v) => v * gain), Rr.map((v) => v * gain), ceiling);
      measured = lufs(out.l, out.r);
      if (Math.abs(measured - TARGET_LUFS) < 0.03) break;
      gain *= 10 ** ((TARGET_LUFS - measured) / 20);
    }
    const tp = truePeakDb(out.l, out.r);
    if (tp <= CEILING_TP + 0.05) break;
    ceiling -= tp - CEILING_TP + 0.1;
  }
  return out;
}

function writeWav(path, l, r) {
  const pcm = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i += 1) { pcm.writeInt16LE(Math.round(clamp(l[i], -1, 1) * 32767), i * 4); pcm.writeInt16LE(Math.round(clamp(r[i], -1, 1) * 32767), i * 4 + 2); }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8); head.write('fmt ', 12); head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([head, pcm]));
}

arrange();
placeSfx();
if (argv.includes('--debug')) {     // 効果音が曲に対してどれだけ前に出ているか（合図の後 0.25 秒の RMS 比・dB）
  const rms = (get, a, b) => { let sum = 0; let n = 0; for (let i = first(a); i < last(b); i += 1) { const v = get(i); sum += v * v; n += 1; } return Math.sqrt(sum / Math.max(1, n)); };
  const music = (i) => { let v = 0; for (const k of ['pad', 'keys', 'bass', 'kick', 'drums', 'fx']) v += buses[k].l[i] + buses[k].r[i]; return v / 2; };
  const fx = (i) => (buses.sfx.l[i] + buses.sfx.r[i]) / 2;
  const by = {};
  for (const c of CUES) { const len = c.kind === 'slide' ? c.len : 0.25; (by[c.kind] ??= []).push(20 * Math.log10(Math.max(rms(fx, c.at, c.at + len), 1e-9) / Math.max(rms(music, c.at, c.at + len), 1e-9))); }
  console.log('  効果音/曲（dB）:', Object.entries(by).map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join(' / '));
}
const mixed = master();
writeWav(OUT, mixed.l, mixed.r);
console.log(`音を書き出しました: ${OUT.split('/').slice(-2).join('/')}`);
console.log(`  イ短調・96BPM・${DURATION_SECONDS}秒・${SR}Hz・16bit・stereo・効果音 ${SFX_ON ? `${CUES.length}個` : 'なし'}`);
console.log(`  統合ラウドネス ${lufs(mixed.l, mixed.r).toFixed(2)} LUFS / トゥルーピーク(推定) ${truePeakDb(mixed.l, mixed.r).toFixed(2)} dBTP`);
