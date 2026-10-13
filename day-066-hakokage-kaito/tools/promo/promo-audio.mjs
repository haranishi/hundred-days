/* プロモ動画の音（BGM と効果音）。外部の音源・サンプル・ライブラリは使わず、固定シードの純JSで合成する。
   同じ入力なら必ず同じ WAV になる。長さと拍は timeline.mjs（32秒・120BPM・1小節2秒）。

   曲の作り（A案・B案とも同じ骨組み。調・音色・ノリを変える）：
     0–4秒   フック   ドラム無し。低い持続音と、時計のような刻み。4秒の頭へ向けて、ライザーとスネアの連打で引っ張る
     4–10秒  拍が入る  キック・ハット・パルスのベース・鍵盤のアルペジオ。4秒の頭（箱を押す所）で一発
     10–16秒 見せ場   主旋律（鍵盤の上の高い音）が入る。14秒の頭（警備員が引き返す所）に和音の一撃
     16–24秒 いちばん盛り上がる  16分のハット・クラップ・副旋律（高い返しの音）。成功の効果音（約23.4秒）で止めて息をつく
     24–28秒 約束（薄く）  ドラムを抜き、持続音と鍵盤だけ。28秒の頭の終止へ向けて、E7 から引っ張る
     28–32秒 終了カード  終止和音（A案は Am・B案は Em）を鳴らし切り、最後にフェード
   和音は Am | G | F | E7（i–VII–VI–V）の下りを土台に、場面の頭ごとに主和音へ着地する（先頭は F → E7 で 4秒の Am へ向かう）。

   効果音：timeline.mjs の deriveCues()（操作の列をアプリのルールで再生して得た出来事）が出す合図に合わせて重ねる。
   render-promo.mjs は、書き出した動画から「画が動いた時刻」を測って合図に渡す（--cues）。単独で動かしたときは、予定の時刻を使う。

   使い方:
     node promo-audio.mjs --variant a                 A案を output/bgm_a.wav へ
     node promo-audio.mjs --variant b --mp3 out.mp3   B案を書き出し、mp3 も作る
     node promo-audio.mjs --variant a --no-sfx        効果音なし（BGMだけを聴く）

   音量は、ITU-R BS.1770 の K 特性（このファイル内に実装）で測り、統合ラウドネスが目標（-17 LUFS）になるよう自動で合わせる。
   最後にルックアヘッドのリミッタで、トゥルーピークが -2.0 dBTP を超えないようにする（AAC にしたあとの上振れの余白）。 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, BEAT, DURATION_SECONDS, SECTIONS, deriveCues } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); const v = i >= 0 ? argv[i + 1] : undefined; return v && !v.startsWith('--') ? v : fallback; };
const VARIANT = String(arg('--variant', 'a')).toLowerCase();
if (VARIANT !== 'a' && VARIANT !== 'b') { console.error('--variant は a か b です。'); process.exit(1); }
const A = VARIANT === 'a';
const OUT = arg('--out', null) ? resolve(arg('--out')) : resolve(here, `output/bgm_${VARIANT}.wav`);
const MP3 = arg('--mp3', null);
const SFX_ON = !argv.includes('--no-sfx');
const CUES = arg('--cues', null) ? JSON.parse(readFileSync(resolve(arg('--cues')), 'utf8')) : deriveCues();

const SR = 48000;
const N = Math.round(DURATION_SECONDS * SR);
const TAU = Math.PI * 2;
const TARGET_LUFS = -17.0;
const CEILING_TP = -2.0;      // dBTP。AAC にした後の上振れの余白を見込む

// ── 土台 ──────────────────────────────────────────────────────────────────
let seed = (VARIANT === 'a' ? 0x9e3779b1 : 0x85ebca6b) >>> 0;
const random = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const noise = () => random() * 2 - 1;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const makeBus = () => ({ l: new Float32Array(N), r: new Float32Array(N) });
const pan = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];
const first = (t) => Math.max(0, Math.floor(t * SR));
const last = (t) => Math.min(N, Math.ceil(t * SR));

const buses = { pad: makeBus(), keys: makeBus(), lead: makeBus(), bass: makeBus(), kick: makeBus(), drums: makeBus(), fx: makeBus(), sfx: makeBus() };

/* 1つの音を、開始 t（秒）から len 秒＋しっぽ、サンプルごとに fn(time) を呼んで bus へ足す */
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
    else { this.b0 = alpha; this.b1 = 0; this.b2 = -alpha; }       // bp（ピークゲイン 0dB）
    this.a1 = -2 * c / a0; this.a2 = (1 - alpha) / a0; this.b0 /= a0; this.b1 /= a0; this.b2 /= a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}
const filt = (type, fc, q) => new Biquad().set(type, fc, q);

// PolyBLEP（エイリアスを抑えたのこぎり・矩形）
const blep = (t, dt) => { if (t < dt) { const x = t / dt; return x + x - x * x - 1; } if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; } return 0; };
const saw = (ph, dt) => 2 * ph - 1 - blep(ph, dt);
const pulse = (ph, dt, w) => (ph < w ? 1 : -1) + blep(ph, dt) - blep((ph + 1 - w) % 1, dt);
const tri = (ph) => 4 * Math.abs(ph - 0.5) - 1;

/* 立ち上がりと終わりを sin で丸めた長さの包絡 */
const swell = (t, len, a, r) => (t < 0 || t >= len ? 0 : Math.sin(Math.min(1, t / Math.max(a, 1e-4)) * Math.PI / 2) * Math.sin(Math.min(1, (len - t) / Math.max(r, 1e-4)) * Math.PI / 2));
/* 弾いた音の包絡：速い立ち上がり・指数の減衰・最後の短い消し込み */
const pluckEnv = (t, len, a, tau, r = 0.04) => (t < 0 || t >= len ? 0 : (1 - Math.exp(-t / a)) * Math.exp(-t / tau) * Math.min(1, (len - t) / r));

// ── 調・和音 ──────────────────────────────────────────────────────────────
/* tonic は MIDI。和音は調の主音からの半音数で持つので、調を変えれば全部がそのまま移る */
const TONIC = A ? 57 : 52;                        // A案 A3（イ短調）／B案 E3（ホ短調）
const DEG = { i: { off: 0, third: 3, v: [0, 3, 7] }, VII: { off: -2, third: 4, v: [-2, 2, 5] }, VI: { off: -4, third: 4, v: [-4, 0, 3] },
  V: { off: -5, third: 4, v: [-5, -1, 2, 5] }, III: { off: 3, third: 4, v: [-2, 3, 7] } };
const PLAN = ['VI', 'V', 'i', 'VII', 'VI', 'i', 'VI', 'V', 'i', 'VI', 'VII', 'III', 'i', 'V', 'i', 'i'];
const barOf = (t) => clamp(Math.floor(t / BAR + 1e-9), 0, PLAN.length - 1);
const chordAt = (t) => DEG[PLAN[barOf(t)]];
const sectionOf = (b) => (b < 2 ? 'hook' : b < 5 ? 'solve' : b < 8 ? 'guard' : b < 12 ? 'vault' : b < 14 ? 'list' : 'end');

// ── 音色 ──────────────────────────────────────────────────────────────────

/* パッド：デチューンしたのこぎり3本＋1オクターブ下の三角。ローパスで丸める */
function padNote({ t, len, midi, gain, p = 0, cutoff = 1500, attack = 0.3, release = 0.8, spread = 7, bus = buses.pad }) {
  const f = mtof(midi); const dts = [-spread, 0, spread].map((c) => f * 2 ** (c / 1200) / SR);
  const ph = [random(), random(), random()]; const lp = filt('lp', cutoff, 0.8);
  voice(bus, { t, len: len + release, pan: p, gain }, (time) => {
    let s = 0;
    for (let k = 0; k < 3; k += 1) { ph[k] += dts[k]; if (ph[k] >= 1) ph[k] -= 1; s += saw(ph[k], dts[k]); }
    return lp.run(s / 3 * 0.9 + tri((time * f / 2) % 1) * 0.25) * swell(time, len + release, attack, release);
  });
}

/* A案の鍵盤：2オペレータのFMで、エレピ風（打鍵の芯つき） */
function epiano({ t, len, midi, gain, p = 0, bright = 1 }) {
  const f = mtof(midi); const hi = clamp((midi - 60) / 36, 0, 1); const tau = 1.1 - 0.6 * hi;
  voice(buses.keys, { t, len: len + 0.1, pan: p, gain }, (time) => {
    const c = TAU * f * time;
    const mod = Math.sin(c) * (1.6 + 1.6 * bright) * Math.exp(-time / 0.16);
    const tine = Math.sin(c * 7) * 0.09 * bright * Math.exp(-time / 0.03);
    return (Math.sin(c + mod) + tine) * pluckEnv(time, len, 0.004, tau, 0.06);
  });
}

/* B案の鍵盤：マリンバ風（基音＋4倍音＋10倍音が、それぞれ速く減衰） */
function marimba({ t, len, midi, gain, p = 0 }) {
  const f = mtof(midi); const k = clamp(1.25 - (midi - 55) / 60, 0.45, 1.3);
  voice(buses.keys, { t, len: len + 0.1, pan: p, gain }, (time) => {
    const c = TAU * f * time;
    const s = Math.sin(c) * Math.exp(-time / (0.42 * k)) + 0.34 * Math.sin(c * 4) * Math.exp(-time / (0.10 * k)) + 0.12 * Math.sin(c * 10) * Math.exp(-time / (0.035 * k));
    return s * Math.min(1, time / 0.0015) * Math.min(1, (len - time) / 0.04);
  });
}
const keyNote = (o) => (A ? epiano(o) : marimba(o));

/* ベル（FM）：宝のチャイム・終了の余韻・副旋律 */
function bell({ t, len = 1.2, midi, gain, p = 0, bus = buses.sfx }) {
  const f = mtof(midi);
  voice(bus, { t, len, pan: p, gain }, (time) => {
    const c = TAU * f * time;
    const mod = Math.sin(c * 3.5) * 2.2 * Math.exp(-time / 0.12);
    const body = Math.sin(c + mod) * 0.8 + Math.sin(c * 2.01) * 0.2 * Math.exp(-time / 0.3);
    const sparkle = Math.sin(c * 9.3) * 0.12 * Math.exp(-time / 0.03);
    return (body + sparkle) * pluckEnv(time, len, 0.003, 0.55, 0.12);
  });
}

/* 主旋律：A案は明るいパルス＋のこぎりのプラック（フィルタが閉じていく）、B案はホイッスル風（正弦＋息）。ビブラートつき */
function leadNote({ t, len, midi, gain, p = 0 }) {
  const f = mtof(midi);
  if (A) {
    const ph = [random(), random()]; const lp = filt('lp', 3200, 1.1); let cut = 0;
    voice(buses.lead, { t, len: len + 0.1, pan: p, gain }, (time) => {
      const vib = 1 + 0.004 * Math.sin(TAU * 5.4 * time) * Math.min(1, time / 0.2);
      const d0 = f * vib * 0.9965 / SR; const d1 = f * vib * 1.0035 / SR;
      ph[0] = (ph[0] + d0) % 1; ph[1] = (ph[1] + d1) % 1;
      if ((cut += 1) % 24 === 0) lp.set('lp', 900 + 3600 * Math.exp(-time / 0.22), 1.1);
      return lp.run(saw(ph[0], d0) * 0.5 + pulse(ph[1], d1, 0.35) * 0.35) * pluckEnv(time, len, 0.006, 0.55 + len * 0.3, 0.05);
    });
  } else {
    const br = filt('bp', f * 2.8, 2.0);
    voice(buses.lead, { t, len: len + 0.12, pan: p, gain }, (time) => {
      const vib = 1 + 0.006 * Math.sin(TAU * 5.6 * time) * Math.min(1, time / 0.25);
      const c = TAU * f * vib * time;
      return (Math.sin(c) + 0.14 * Math.sin(2 * c) + br.run(noise()) * 0.1) * swell(time, len + 0.12, 0.05, 0.12);
    });
  }
}

/* ベース：A案は幅の狭いパルス＋サブの正弦（フィルタが閉じる）、B案はピチカート風（正弦＋2倍音の速い減衰） */
function bassNote({ t, len, midi, gain, hop = 0 }) {
  const f = mtof(midi + hop);
  if (A) {
    let ph = random(); const lp = filt('lp', 600, 1.2); let n = 0;
    voice(buses.bass, { t, len: len + 0.05, gain }, (time) => {
      const d = f / SR; ph = (ph + d) % 1;
      if ((n += 1) % 16 === 0) lp.set('lp', 170 + 750 * Math.exp(-time / 0.07), 1.2);
      const sub = Math.sin(TAU * f * time) * 0.8;
      return (lp.run(pulse(ph, d, 0.3)) * 0.55 + sub) * pluckEnv(time, len, 0.004, len * 0.9, 0.03);
    });
  } else {
    voice(buses.bass, { t, len: len + 0.05, gain }, (time) => {
      const c = TAU * f * time;
      return (Math.sin(c) + 0.35 * Math.sin(2 * c) * Math.exp(-time / 0.05) + 0.12 * Math.sin(3 * c) * Math.exp(-time / 0.03)) * pluckEnv(time, len, 0.003, 0.2, 0.03);
    });
  }
}

/* 持続するサブ（フック・約束の部分のベース） */
function subDrone({ t, len, midi, gain }) {
  const f = mtof(midi);
  voice(buses.bass, { t, len, gain }, (time) => (Math.sin(TAU * f * time) + 0.25 * Math.sin(TAU * f * 2 * time)) * swell(time, len, 0.5, 0.8));
}

// ── ドラム ────────────────────────────────────────────────────────────────
function kick(t, vel = 1) {
  let ph = 0;
  voice(buses.kick, { t, len: 0.45, gain: vel }, (time) => {
    const f = 44 + (A ? 100 : 62) * Math.exp(-time / 0.03);
    ph += TAU * f / SR;
    return (Math.sin(ph) * Math.exp(-time / (A ? 0.17 : 0.13)) + noise() * 0.1 * Math.exp(-time / 0.004)) * Math.min(1, time / 0.0012, (0.45 - time) / 0.04);
  });
}
function snare(t, vel = 1, brush = false) {
  const bp = filt('bp', brush ? 3800 : 1900, brush ? 0.6 : 0.8); const hp = filt('hp', 250, 0.7);
  voice(buses.drums, { t, len: 0.3, gain: vel, pan: 0.05 }, (time) => {
    const body = brush ? 0 : Math.sin(TAU * 185 * time) * 0.35 * Math.exp(-time / 0.045);
    const n = bp.run(hp.run(noise())) * Math.exp(-time / (brush ? 0.13 : 0.075)) * (brush ? Math.min(1, time / 0.01) : 1);
    return (n * 1.5 + body) * 0.8;
  });
}
function clap(t, vel = 1) {
  const bp = filt('bp', 1500, 1.0);
  voice(buses.drums, { t, len: 0.22, gain: vel, pan: -0.05 }, (time) => {
    const bursts = [0, 0.011, 0.022].reduce((s, d) => s + (time >= d ? Math.exp(-(time - d) / 0.006) : 0), 0);
    return bp.run(noise()) * (bursts * 0.5 + Math.exp(-time / 0.07) * 0.8) * 1.4;
  });
}
function rim(t, vel = 1) {
  const bp = filt('bp', 3200, 1.2);
  voice(buses.drums, { t, len: 0.1, gain: vel, pan: 0.1 }, (time) => (Math.sin(TAU * (A ? 470 : 1050) * time) * 0.7 + bp.run(noise()) * 0.8) * Math.exp(-time / 0.013));
}
function hat(t, vel = 1, open = false, p = 0.15) {
  const hp = filt('hp', 7200, 0.8);
  voice(buses.drums, { t, len: open ? 0.3 : 0.09, gain: vel, pan: p }, (time) => hp.run(noise()) * Math.exp(-time / (open ? 0.11 : 0.016)) * Math.min(1, time / 0.0008, ((open ? 0.3 : 0.09) - time) / 0.02));
}
function shaker(t, vel = 1, p = -0.25) {
  const bp = filt('bp', 6200, 1.4);
  voice(buses.drums, { t, len: 0.08, gain: vel, pan: p }, (time) => bp.run(noise()) * Math.min(1, time / 0.006) * Math.exp(-time / 0.022));
}
function tick(t, vel = 1) {     // 時計の針のような刻み
  const bp = filt('bp', 2600, 3);
  voice(buses.drums, { t, len: 0.06, gain: vel, pan: 0.2 }, (time) => (Math.sin(TAU * 2300 * time) * 0.5 + bp.run(noise()) * 0.6) * Math.exp(-time / 0.007));
}

// ── 効果 ──────────────────────────────────────────────────────────────────
function riser(t, len, gain) {          // 帯域を上げていくノイズ。終わりへ向けて大きくなる
  const bp = filt('bp', 300, 1.4); let n = 0;
  voice(buses.fx, { t, len, gain }, (time) => {
    const r = time / len;
    if ((n += 1) % 16 === 0) bp.set('bp', 300 + 6200 * r * r, 1.4);
    return bp.run(noise()) * r * r * 1.8 * Math.min(1, (len - time) / 0.012);
  });
}
function boom(t, gain = 1, crash = 0.5) {   // 場面の頭の一撃：沈むサブ＋ノイズの余韻
  let ph = 0; const hp = filt('hp', 2500, 0.7);
  voice(buses.fx, { t, len: 1.6, gain }, (time) => {
    ph += TAU * (36 + 40 * Math.exp(-time / 0.09)) / SR;
    return Math.sin(ph) * Math.exp(-time / 0.38) * 0.9 + hp.run(noise()) * Math.exp(-time / 0.5) * 0.18 * crash * Math.min(1, time / 0.004);
  });
}
function snareRoll(t0, t1, vel) {       // 16分の連打を、だんだん強く
  const step = BEAT / 4;
  for (let t = t0, k = 0; t < t1 - 1e-6; t += step, k += 1) snare(t, vel * (0.35 + 0.65 * (k / Math.round((t1 - t0) / step))), !A);
}

// ── 効果音 ────────────────────────────────────────────────────────────────
const sfxBus = () => buses.sfx;
const SFX = {
  step(t, o) {      // 足音。左右の足で少し変える
    const left = (o.n % 2) === 0; const f = left ? 210 : 188; const bp = filt('bp', 1500, 1.4);
    voice(sfxBus(), { t, len: 0.07, pan: left ? -0.12 : 0.12, gain: 0.7 * o.g }, (time) => (Math.sin(TAU * f * (1 - time * 2.4) * time) * Math.exp(-time / 0.022) * 0.9 + bp.run(noise()) * Math.exp(-time / 0.01) * 0.5));
  },
  push(t, o) {      // 箱を押す鈍い音：低い打撃＋中域の「こつん」（小さなスピーカーでも聞こえる）＋こすれる音
    const bp = filt('bp', 650, 1.1); let ph = 0; let kn = 0;
    voice(sfxBus(), { t, len: 0.3, gain: 1.0 * o.g }, (time) => {
      ph += TAU * (62 + 80 * Math.exp(-time / 0.05)) / SR;
      kn += TAU * (230 - 90 * Math.min(1, time / 0.06)) / SR;
      const thud = Math.sin(ph) * Math.exp(-time / 0.075) * 1.0 + tri((time * 130) % 1) * 0.2 * Math.exp(-time / 0.04);
      const knock = (Math.sin(kn) + 0.5 * Math.sin(kn * 2.1)) * Math.exp(-time / 0.035) * 0.55;
      const scrape = bp.run(noise()) * Math.exp(-time / 0.07) * Math.min(1, time / 0.01) * 0.7;
      return thud + knock + scrape;
    });
  },
  shadow(t, o) {    // 光が止まって影ができる：暗くなる低い「ふっ」
    const lp = filt('lp', 1600, 0.9); let n = 0; let ph = 0;
    voice(sfxBus(), { t, len: 0.45, gain: 0.7 * o.g }, (time) => {
      if ((n += 1) % 16 === 0) lp.set('lp', 220 + 1500 * Math.exp(-time / 0.1), 0.9);
      ph += TAU * (110 + 150 * Math.exp(-time / 0.1)) / SR;
      return lp.run(noise()) * Math.min(1, time / 0.03) * Math.exp(-time / 0.12) * 0.9 + Math.sin(ph) * Math.exp(-time / 0.16) * 0.35;
    });
  },
  caught(t, o) {    // 警報：2音の矩形を3回、重い一撃つき
    const hi = 988; const lo = 740; const lp = filt('lp', 3000, 0.8); let ph = 0;
    voice(sfxBus(), { t, len: 0.6, gain: 0.55 * o.g }, (time) => {
      const k = Math.floor(time / 0.1); const on = k < 3 && (time % 0.1) < 0.085;
      const f = k % 2 === 0 ? hi : lo; ph = (ph + f / SR) % 1;
      const env = on ? Math.min(1, (time % 0.1) / 0.004) * Math.min(1, (0.085 - (time % 0.1)) / 0.012) : 0;
      return Math.tanh(lp.run(pulse(ph, f / SR, 0.5)) * 1.4) * env;
    });
    let ph2 = 0;
    voice(sfxBus(), { t, len: 0.6, gain: 0.9 * o.g }, (time) => { ph2 += TAU * (46 + 60 * Math.exp(-time / 0.07)) / SR; return Math.sin(ph2) * Math.exp(-time / 0.2) * Math.min(1, (0.6 - time) / 0.05); });
  },
  treasure(t, o) {  // 宝：その時の和音の音で、きらめくチャイム
    const c = chordAt(t); const root = TONIC + 12 + c.off; const tones = [root, root + c.third, root + 7, root + 12, root + 12 + c.third];
    tones.forEach((m, k) => bell({ t: t + k * 0.055, len: 1.4, midi: m, gain: 0.34 * o.g * (1 - k * 0.07), p: (k - 2) * 0.22 }));
    const hp = filt('hp', 6500, 0.8);
    voice(sfxBus(), { t, len: 0.25, gain: 0.35 * o.g }, (time) => hp.run(noise()) * Math.exp(-time / 0.05));
  },
  exit(t, o) {      // 出口が開く：錠の2つのカチッ＋昇る音
    const bp = filt('bp', 3200, 2); let ph = 0;
    for (const d of [0, 0.07]) voice(sfxBus(), { t: t + d, len: 0.04, gain: 0.7 * o.g }, (time) => bp.run(noise()) * Math.exp(-time / 0.006));
    voice(sfxBus(), { t: t + 0.1, len: 0.32, gain: 0.3 * o.g }, (time) => {
      ph += TAU * (520 + 1700 * (time / 0.22)) / SR;
      return Math.sin(ph) * swell(time, 0.32, 0.03, 0.14);
    });
  },
  turn(t, o) {      // 警備員が箱の前で引き返す：ぼん・ぼん
    for (const [d, f] of [[0, 250], [0.085, 190]]) {
      let ph = 0; const bp = filt('bp', 900, 1.5);
      voice(sfxBus(), { t: t + d, len: 0.16, gain: 0.55 * o.g, pan: 0.1 }, (time) => { ph += TAU * f * (1 - time * 1.5) / SR; return Math.sin(ph) * Math.exp(-time / 0.05) + bp.run(noise()) * Math.exp(-time / 0.012) * 0.3; });
    }
  },
  clear(t, o) {     // 成功：その時の和音で、上がっていく短いファンファーレ
    const c = chordAt(t); const root = TONIC + 12 + c.off;
    const run = [root, root + c.third, root + 7, root + 12];
    run.forEach((m, k) => {
      const f = mtof(m); const lp = filt('lp', 3800, 0.9); const ph = [random(), random()];
      voice(sfxBus(), { t: t + k * 0.06, len: 0.5, pan: (k - 1.5) * 0.18, gain: 0.3 * o.g }, (time) => {
        const d = f / SR; ph[0] = (ph[0] + d * 0.997) % 1; ph[1] = (ph[1] + d * 1.003) % 1;
        return lp.run(saw(ph[0], d) + saw(ph[1], d)) * pluckEnv(time, 0.5, 0.008, 0.28, 0.08);
      });
    });
    [root + 12, root + 12 + c.third, root + 19].forEach((m, k) => bell({ t: t + 0.26 + k * 0.05, len: 1.6, midi: m, gain: 0.3 * o.g, p: (k - 1) * 0.25 }));
    padNote({ t: t + 0.24, len: 0.9, midi: root, gain: 0.16 * o.g, cutoff: 2600, attack: 0.05, release: 0.6, bus: sfxBus() });
  },
  undo(t, o) {      // ひとつ戻す：下がる短い音
    let ph = 0;
    voice(sfxBus(), { t, len: 0.18, gain: 0.45 * o.g }, (time) => { ph += TAU * (780 - 480 * (time / 0.14)) / SR; return Math.sin(ph) * swell(time, 0.16, 0.01, 0.06); });
  },
  open(t, o) {      // 面の一覧が開く：軽い2音
    [[0, 880], [0.045, 1320]].forEach(([d, f]) => voice(sfxBus(), { t: t + d, len: 0.12, gain: 0.35 * o.g }, (time) => Math.sin(TAU * f * time) * pluckEnv(time, 0.12, 0.002, 0.03, 0.02)));
  },
  cut(t, o) {       // 場面の切れ目：切れ目へ向けて大きくなる風切り音と、小さな一撃
    const bp = filt('bp', 400, 1.2); let n = 0;
    voice(sfxBus(), { t: t - 0.42, len: 0.5, gain: 0.8 * o.g }, (time) => {
      if ((n += 1) % 16 === 0) bp.set('bp', 350 + 4200 * clamp(time / 0.42, 0, 1) ** 2, 1.2);
      return bp.run(noise()) * (time < 0.42 ? (time / 0.42) ** 2 : Math.exp(-(time - 0.42) / 0.03)) * 1.4 * Math.min(1, (0.5 - time) / 0.03);
    });
  },
  end(t, o) {       // 終了カード：ベルの余韻
    const c = DEG.i; const root = TONIC + 12 + c.off;
    [root + 12, root + 19, root + 24, root + 26].forEach((m, k) => bell({ t: t + 0.04 + k * 0.09, len: 2.6, midi: m, gain: 0.26 * o.g, p: (k - 1.5) * 0.3 }));
  },
};

// ── 編曲 ──────────────────────────────────────────────────────────────────
const T = (bar, step) => bar * BAR + step * BAR / 16;      // 小節 bar の16分音符 step の時刻
const leadRoot = (c) => TONIC + 12 + c.off;                 // 主旋律・鍵盤の和音の根音（A案なら Am は A4）
const bassRoot = (c) => TONIC - 12 + c.off;                 // ベースの根音（A案なら Am は A2）
const kickTimes = [];
const GAP = [23.7, 24.0];                                   // 成功の効果音のあと、ドラムとベースが息をつく所
const inGap = (t) => t >= GAP[0] && t < GAP[1];

function layerPad(bar, c, sec) {
  if (sec === 'end' && bar === 15) return;                  // 終止の和音は、28秒の頭から2小節ぶんを鳴らし切る
  const t0 = bar * BAR; const len = sec === 'end' ? BAR * 2 : BAR; const release = sec === 'end' ? 1.8 : 0.7;
  const level = { hook: 0.62, solve: 0.34, guard: 0.34, vault: 0.38, list: 0.42, end: 0.5 }[sec];
  const cutoff = { hook: 900 + 450 * (bar % 2), solve: 1300, guard: 1500, vault: 2100, list: 1700, end: 1900 }[sec];
  c.v.forEach((off, k) => padNote({ t: t0, len, midi: TONIC + off, gain: level * (k === 0 ? 0.55 : 1), p: (k - (c.v.length - 1) / 2) * 0.3, cutoff, attack: sec === 'hook' ? 0.5 : 0.25, release }));
  if (sec === 'vault' || sec === 'end') padNote({ t: t0, len, midi: TONIC + 12 + c.v[1], gain: level * 0.4, p: 0.35, cutoff: cutoff * 1.4, attack: 0.4, release });
}

function layerBass(bar, c, sec) {
  const root = bassRoot(c); const t0 = bar * BAR;
  if (sec === 'hook') subDrone({ t: t0, len: BAR + 0.3, midi: root, gain: 0.34 });
  if (sec === 'list') subDrone({ t: t0, len: BAR + 0.3, midi: root, gain: 0.28 });
  if (sec === 'end' && bar === 14) subDrone({ t: t0, len: BAR * 2, midi: root, gain: 0.3 });
  if (sec !== 'solve' && sec !== 'guard' && sec !== 'vault') return;
  const level = sec === 'vault' ? 0.88 : 0.8;
  const pattern = A ? [[0, 0], [2, 0], [4, 0], [6, 12], [8, 0], [10, 0], [12, 0], [14, 12]] : [[0, 0], [3, 12], [6, 7], [8, 0], [11, 12], [14, 7]];
  for (const [s, hop] of pattern) {
    const t = T(bar, s); if (inGap(t)) continue;
    bassNote({ t, len: BEAT * (A ? 0.42 : 0.4), midi: root, gain: level * (s % 8 === 0 ? 1 : 0.8), hop });
  }
}

function layerDrums(bar, sec) {
  if (sec === 'hook') { for (let s = 0; s < 16; s += 4) tick(T(bar, s), s === 0 ? 0.6 : 0.5); return; }
  if (sec === 'list') {
    for (let s = 2; s < 16; s += 4) shaker(T(bar, s), 0.22);
    if (bar === 13) for (let s = 0; s < 16; s += 4) hat(T(bar, s), 0.28, false, 0.2);
    return;
  }
  if (sec === 'end') return;
  const kicks = sec === 'vault' ? [0, 3, 6, 8, 11, 14] : A ? [0, 6, 8, 14] : [0, 8, 10];
  for (const s of kicks) { const t = T(bar, s); if (inGap(t)) continue; kick(t, (sec === 'solve' ? 0.78 : 0.88) * (s === 0 ? 1 : 0.8)); kickTimes.push(t); }
  for (const s of [4, 12]) {
    const t = T(bar, s); if (inGap(t)) continue;
    if (sec === 'solve') rim(t, 0.8);
    else { snare(t, A ? 0.9 : 0.7, !A); if (sec === 'vault') clap(t, 0.65); else if (A) rim(t, 0.4); }
  }
  for (let s = 0; s < 16; s += sec === 'vault' ? 1 : 2) {
    const t = T(bar, s); if (inGap(t)) continue;
    const accent = s % 4 === 0 ? 1 : s % 2 === 0 ? 0.72 : 0.42;
    hat(t, 0.5 * accent * (sec === 'solve' ? 0.8 : 1) * (A ? 1 : 0.8), bar % 2 === 1 && s === 14 && sec !== 'solve', s % 2 ? 0.2 : 0.1);
  }
  if (sec !== 'solve') for (let s = 1; s < 16; s += 2) { const t = T(bar, s); if (!inGap(t)) shaker(t, 0.32 * (A ? 1 : 1.2)); }
}

function layerKeys(bar, c, sec) {
  const R = leadRoot(c); const tones = [R, R + c.third, R + 7, R + 12, R + 12 + c.third, R + 19];
  const pattern = {
    hook: bar === 0 ? [[0, 2, 0.8], [8, 1, 0.65]] : [[0, 2, 0.8], [6, 1, 0.65], [8, 0, 0.6], [12, 2, 0.7]],
    solve: [[0, 2, 1], [6, 3, 0.85], [8, 2, 0.9], [14, 1, 0.7]],
    guard: [[0, 2, 1], [3, 3, 0.8], [6, 4, 0.85], [8, 3, 0.9], [11, 2, 0.75], [14, 1, 0.7]],
    vault: [[0, 2, 1], [2, 3, 0.7], [3, 4, 0.85], [5, 3, 0.7], [6, 2, 0.8], [8, 3, 0.95], [10, 4, 0.7], [11, 5, 0.8], [13, 4, 0.7], [14, 3, 0.8]],
    list: [[0, 2, 0.8], [4, 3, 0.7], [8, 4, 0.8], [12, 3, 0.7]],
    end: bar === 14 ? [[0, 3, 0.8], [4, 4, 0.7], [8, 3, 0.7], [12, 2, 0.65]] : [],
  }[sec];
  const gain = { hook: 0.34, solve: 0.4, guard: 0.4, vault: 0.38, list: 0.34, end: 0.32 }[sec] * (A ? 1 : 1.15);
  for (const [s, idx, v] of pattern) {
    const t = T(bar, s) + (random() - 0.5) * 0.008; if (inGap(t)) continue;
    keyNote({ t, len: BEAT * (sec === 'vault' ? 0.9 : 1.6), midi: tones[idx] - (sec === 'hook' ? 12 : 0), gain: gain * v, p: (random() * 2 - 1) * 0.45 });
  }
  if (sec === 'vault') {      // 副旋律：1オクターブ上の返しの音
    for (const [s, idx] of [[2, 3], [7, 4], [10, 5], [15, 3]]) { const t = T(bar, s); if (!inGap(t)) bell({ t, len: 0.9, midi: tones[idx], gain: 0.1, p: 0.4, bus: buses.keys }); }
  }
}

/* 主旋律：和音の5度（長く）→3度→根音→3度。8分音符の格子（slot 0〜7）。E7 の小節は、次の頭（主和音の5度）へ駆け上がる */
function layerLead(bar, c, sec) {
  const mel = sec === 'guard' || sec === 'vault' ? 1 : sec === 'list' && bar === 12 ? 0.6 : 0;
  if (!mel) return;
  const R = leadRoot(c); const t0 = bar * BAR;
  const notes = bar === 7
    ? [[0, R + 7, 3], [3, R, 1], [4, R + c.third, 1], [5, R + 7, 1], [6, R + 10, 1], [7, R + 12, 1]]
    : [[0, R + 7, 3], [3, R + c.third, 1], [4, R, 2], [6, R + c.third, 2]];
  const gain = (sec === 'vault' ? 0.34 : sec === 'guard' ? 0.26 : 0.2) * (A ? 2.4 : 1.1) * mel;
  for (const [slot, midi, len] of notes) {
    const t = t0 + slot * BEAT / 2; if (inGap(t)) continue;
    leadNote({ t, len: len * BEAT / 2 + 0.12, midi, gain, p: -0.12 });
  }
}

function layerFx() {
  boom(SECTIONS.solve.start, 1.0, 0.7);
  boom(SECTIONS.guard.start, 0.7, 0.5);
  boom(SECTIONS.vault.start, 1.0, 0.8);
  boom(SECTIONS.end.start, 0.55, 0.4);
  riser(2.2, 1.8, 0.2);        snareRoll(3.5, 4.0, 0.55);
  riser(8.9, 1.1, 0.14);       snareRoll(9.5, 10.0, 0.5);
  riser(14.9, 1.1, 0.14);      snareRoll(15.5, 16.0, 0.55);
  riser(26.9, 1.1, 0.16);
  // 14秒の頭（警備員が引き返す所）の和音の一撃
  chordAt(14.0).v.forEach((off, k) => padNote({ t: 14.0, len: 0.28, midi: TONIC + off + 12, gain: 0.36 * (k === 0 ? 0.6 : 1), p: (k - 1) * 0.3, cutoff: 3000, attack: 0.004, release: 0.3 }));
  // 終止：最後の和音（主和音）の上で、ゆっくり下りるベルの旋律を鳴らし切る
  const endC = DEG.i; const R = leadRoot(endC);
  [[28.5, R + 19, 0.2], [29.1, R + 12 + endC.third, 0.17], [29.7, R + 19, 0.15], [30.3, R + 12, 0.14]].forEach(([t, m, g]) => bell({ t, len: 2.4, midi: m, gain: g, p: 0.1, bus: buses.keys }));
}

function arrange() {
  for (let bar = 0; bar < PLAN.length; bar += 1) {
    const c = DEG[PLAN[bar]]; const sec = sectionOf(bar);
    layerPad(bar, c, sec); layerBass(bar, c, sec); layerDrums(bar, sec); layerKeys(bar, c, sec); layerLead(bar, c, sec);
  }
  layerFx();
}

// ── 効果音を置く ───────────────────────────────────────────────────────────
const sfxDuck = [];
function placeSfx() {
  if (!SFX_ON) return;
  let n = 0;
  for (const cue of CUES) {
    const f = SFX[cue.kind]; if (!f) continue;
    const soft = cue.soft ? 0.6 : 1;
    const dense = cue.kind === 'step' && CUES.filter((x) => x.kind === 'step' && Math.abs(x.at - cue.at) < 0.3).length > 2 ? 0.7 : 1;   // 早送りの足音は小さく
    f(cue.at, { g: soft * dense, n: n += 1 });
    const depth = { caught: 0.45, clear: 0.4, treasure: 0.2, push: 0.12, exit: 0.15, turn: 0.1, cut: 0.15, end: 0.2 }[cue.kind];
    if (depth) sfxDuck.push({ at: cue.at, depth: depth * soft, len: cue.kind === 'clear' ? 0.9 : cue.kind === 'caught' ? 0.5 : 0.28 });
  }
}

// ── 仕上げ（リバーブ・ダッキング・ミックス・ラウドネス・リミッタ） ─────────────────
function reverbOf(inputs) {
  const send = { l: new Float32Array(N), r: new Float32Array(N) };
  for (const [bus, amount] of inputs) for (let i = 0; i < N; i += 1) { send.l[i] += bus.l[i] * amount; send.r[i] += bus.r[i] * amount; }
  const hp = [filt('hp', 220, 0.7), filt('hp', 220, 0.7)]; const lp = [filt('lp', 5200, 0.7), filt('lp', 5200, 0.7)];
  const out = { l: new Float32Array(N), r: new Float32Array(N) };
  const decay = 1.7; const combs = [1557, 1617, 1491, 1422]; const allpass = [556, 441];
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
    for (let k = 0; k < Math.floor(0.2 * SR) && from + k < N; k += 1) { const tt = k / SR; const v = 1 - 0.28 * (tt < 0.006 ? tt / 0.006 : Math.exp(-(tt - 0.006) / 0.07)); if (v < duck[from + k]) duck[from + k] = v; }
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
  const run = (inp, f) => { const out = new Float32Array(inp.length); let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0; for (let i = 0; i < inp.length; i += 1) { const v = inp[i]; const y = f.b[0] * v + f.b[1] * x1 + f.b[2] * x2 - f.a[1] * y1 - f.a[2] * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; out[i] = y; } return out; };
  return run(run(x, s1), s2);
}
function lufs(l, r, from = 0, to = N) {
  const kl = kWeight(l); const kr = kWeight(r);
  const block = Math.round(0.4 * SR); const hop = Math.round(0.1 * SR); const powers = [];
  for (let s = from; s + block <= to; s += hop) {
    let sum = 0; for (let i = s; i < s + block; i += 1) sum += kl[i] * kl[i] + kr[i] * kr[i];
    powers.push(sum / block);
  }
  const lk = (p) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => lk(p) > -70);
  if (!abs.length) return -Infinity;
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const kept = abs.filter((p) => lk(p) > rel);
  return lk(kept.reduce((a, b) => a + b, 0) / kept.length);
}

/* 4倍オーバーサンプルのトゥルーピーク推定（窓つき sinc の補間） */
function truePeakDb(l, r) {
  const taps = 12; const phases = [0.25, 0.5, 0.75];
  const kernels = phases.map((ph) => Array.from({ length: taps * 2 }, (_, k) => { const x = k - taps + 1 - ph; const w = 0.5 + 0.5 * Math.cos(Math.PI * x / taps); return (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * w; }));
  let peak = 0;
  for (const ch of [l, r]) {
    for (let i = taps; i < N - taps; i += 1) {
      const a = Math.abs(ch[i]); if (a > peak) peak = a;
      if (a < peak * 0.5) continue;      // 小さい所は、ピークを超えないので飛ばす
      for (const kern of kernels) { let s = 0; for (let k = 0; k < kern.length; k += 1) s += kern[k] * ch[i - taps + 1 + k]; if (Math.abs(s) > peak) peak = Math.abs(s); }
    }
  }
  return 20 * Math.log10(peak);
}

/* ルックアヘッド・リミッタ：必要なゲインの最小値を前後 3ms の窓で取り、その窓の平均でならす。
   ならした値は、窓内のどの山が要求するゲインより必ず小さいので、ceiling を超えさせない（リリースは 90ms） */
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
  const rev = reverbOf([[buses.pad, 0.5], [buses.keys, 0.7], [buses.lead, 0.7], [buses.drums, 0.25], [buses.fx, 0.5], [buses.sfx, 0.5]]);
  const duck = duckCurve();
  const wet = A ? 0.5 : 0.62;
  const L = new Float32Array(N); const Rr = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    const d = duck[i];
    L[i] = (buses.pad.l[i] + buses.keys.l[i] + buses.lead.l[i] + buses.fx.l[i] + rev.l[i] * wet) * d + buses.bass.l[i] + buses.kick.l[i] + buses.drums.l[i] + buses.sfx.l[i];
    Rr[i] = (buses.pad.r[i] + buses.keys.r[i] + buses.lead.r[i] + buses.fx.r[i] + rev.r[i] * wet) * d + buses.bass.r[i] + buses.kick.r[i] + buses.drums.r[i] + buses.sfx.r[i];
  }
  // 25Hz の1次ハイパス（DC・超低域のうねりを落とす）と、頭の 5ms・終わりのフェード
  const pole = 1 - TAU * 25 / SR; let x1l = 0; let y1l = 0; let x1r = 0; let y1r = 0;
  const fadeStart = DURATION_SECONDS - 1.5;
  for (let i = 0; i < N; i += 1) {
    const yl = L[i] - x1l + pole * y1l; x1l = L[i]; y1l = yl; const yr = Rr[i] - x1r + pole * y1r; x1r = Rr[i]; y1r = yr;
    const t = i / SR; const fin = Math.min(1, t / 0.005); const fout = t > fadeStart ? Math.cos(Math.min(1, (t - fadeStart) / 1.5) * Math.PI / 2) ** 2 : 1;
    L[i] = yl * fin * fout; Rr[i] = yr * fin * fout;
  }
  // ラウドネスを目標へ（リミッタを通した結果で測り、ゲインを追い込む）。トゥルーピークが超えるなら、上限を下げてやり直す
  let ceiling = CEILING_TP - 0.4; let gain = 0.2; let out = null; let measured = -99;
  for (let round = 0; round < 3; round += 1) {
    for (let iter = 0; iter < 7; iter += 1) {
      const l = L.map((v) => v * gain); const r = Rr.map((v) => v * gain);
      out = limiter(l, r, ceiling);
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

// ── 書き出し ──────────────────────────────────────────────────────────────
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
if (argv.includes('--debug')) {     // 効果音が曲に対してどれだけ前に出ているか（合図の後 0.3 秒の RMS 比）と、各バスのピーク
  const rms = (get, a, b) => { let sum = 0; let n = 0; for (let i = first(a); i < last(b); i += 1) { const v = get(i); sum += v * v; n += 1; } return Math.sqrt(sum / Math.max(1, n)); };
  const music = (i) => { let l = 0; for (const k of ['pad', 'keys', 'lead', 'bass', 'kick', 'drums', 'fx']) l += buses[k].l[i] + buses[k].r[i]; return l / 2; };
  const sfxv = (i) => (buses.sfx.l[i] + buses.sfx.r[i]) / 2;
  const by = {};
  for (const c of CUES) { if (c.soft) continue; const m = rms(music, c.at, c.at + 0.3); const f = rms(sfxv, c.at, c.at + 0.3); (by[c.kind] ??= []).push(20 * Math.log10(Math.max(f, 1e-9) / Math.max(m, 1e-9))); }
  console.log('  効果音/曲の RMS 比（dB・合図後0.3秒・平均）:', Object.entries(by).map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join(' / '));
  const peakOf = (b) => { let m = 0; for (let i = 0; i < N; i += 1) m = Math.max(m, Math.abs(b.l[i]), Math.abs(b.r[i])); return m; };
  const busRms = (b, a0, a1) => { let sum = 0; for (let i = first(a0); i < last(a1); i += 1) sum += b.l[i] ** 2 + b.r[i] ** 2; return 10 * Math.log10(sum / 2 / (last(a1) - first(a0)) + 1e-12); };
  console.log('  バスの RMS(4〜24秒, dB):', Object.entries(buses).map(([k, b]) => `${k} ${busRms(b, 4, 24).toFixed(1)}`).join(' / '));
  console.log('  バスのピーク:', Object.entries(buses).map(([k, b]) => `${k} ${peakOf(b).toFixed(2)}`).join(' / '));
}
const mixed = master();
writeWav(OUT, mixed.l, mixed.r);
if (MP3) { mkdirSync(dirname(resolve(MP3)), { recursive: true }); execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', OUT, '-c:a', 'libmp3lame', '-b:a', '192k', '-map_metadata', '-1', resolve(MP3)]); }

const hookLufs = lufs(mixed.l, mixed.r, 0, Math.round(4 * SR));
const bodyLufs = lufs(mixed.l, mixed.r, Math.round(4 * SR), N);
console.log(`音を書き出しました: ${OUT}`);
console.log(`  ${A ? 'A案（イ短調・FMエレピ＋パルスベース）' : 'B案（ホ短調・マリンバ＋ピチカート）'} / 120BPM / ${DURATION_SECONDS}秒 / ${SR}Hz / 16bit / stereo / 効果音 ${SFX_ON ? `${CUES.length}個` : 'なし'}`);
console.log(`  統合ラウドネス ${lufs(mixed.l, mixed.r).toFixed(2)} LUFS / トゥルーピーク(推定) ${truePeakDb(mixed.l, mixed.r).toFixed(2)} dBTP / フック ${hookLufs.toFixed(1)} LUFS・本編 ${bodyLufs.toFixed(1)} LUFS`);
