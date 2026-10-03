// OWNER: audio-tools
// 怪獣ごとの技の音（r02-audio で足した。遊びの側への組み込みは次の周）。docs/CHARACTERS.md の技の表に1つずつ対応する。
// 雷翼：雷の息（出始め・持続・終わり）と、当たったビルから近くのビルへ跳ねる音（arc）。
// 焔角：溶岩の礫を吐く音（spit）と着弾（lavaHit）、突進の地響き（繰り返し）、押し倒す音（shove）、前へ走る地割れ（fissure）。
// どれも「芯・胴・尾」の3層で作る（効果音の他の音と同じ）。
import { SR, addMono, brown, dcBlock, env, filt, len, mul, pink, softclip, stereo, wander, white } from '../lib/dsp.mjs';
import { reverbStereo } from '../lib/fft.mjs';
import { makeLoop } from '../lib/master.mjs';
import { chunkImpact, crackle, creak, grains, groan, layers, lowTones, noiseBurst, noiseThump, norm, rumble, snaps, subThump, whoosh } from '../lib/sfxkit.mjs';
import { thunderclap } from './body.mjs';
import { padTail } from './voice.mjs';

function addWet(audio, ir, w) {
  const wet = reverbStereo(audio, ir);
  for (let i = 0; i < audio.l.length; i++) {
    audio.l[i] += wet.l[i] * w;
    audio.r[i] += wet.r[i] * w;
  }
  return audio;
}

// ------------------------------------------------------------ 雷（雷翼）

/**
 * 放電のうなり（モノラル、最大値 1）：細いパルスの列（放電の周期）を、高さが揺れ、1周期ごとに強さがばらつく形で作る。
 * 電気のうなりの「ジー」。f は中心の高さ（Hz）、flicker は周期ごとのばらつき。
 */
function buzz(rng, dur, { f = 130, flicker = 0.6, bright = 1 } = {}) {
  const n = len(dur);
  const out = new Float32Array(n);
  const fw = wander(rng, n, 9, 0.8, 1.25);
  let ph = 0;
  let g = 1;
  for (let i = 0; i < n; i++) {
    ph += (f * fw[i]) / SR;
    if (ph >= 1) {
      ph -= 1;
      g = 1 - flicker * rng.next();
    }
    // 鋭い山（デューティ比 8%）を丸めて折り返しを抑える
    out[i] = ph < 0.08 ? Math.sin((Math.PI * ph) / 0.08) * g : 0;
  }
  filt(out, [['hp', 180, 0.7], ['peak', 2400 * bright, 1.1, 6], ['lp', 9000, 0.7]]);
  return norm(out);
}

/** 火花のはじけ（ステレオに足す）：ごく短い高い破裂の、密な不規則な列。 */
function sparks(rng, out, { start = 0, dur, rate, amp = 1, f = [2500, 9000], spread = 0.9 }) {
  crackle(rng, out, { start, dur, rate, amp, f, spread });
  return out;
}

/** 雷の息の出始め：芯＝空気が裂ける「バリッ」、胴＝立ち上がる放電のうなり、尾＝はじける火花。 */
export function zapStart(rng) {
  const k = rng.range(0.78, 1.25);
  const p = rng.range(0.88, 1.14);
  const total = 1.4 * k;
  const n = len(total);
  const core = stereo(n);
  snaps(rng, core, { start: 0, count: rng.int(18, 30), window: rng.range(0.025, 0.06), f: [2000, 9500], amp: 0.8, spread: 0.7, ring: [0.001, 0.004] });
  addMono(core, noiseBurst(rng, { dur: 0.2, attack: 0.001, decay: 0.03, filters: [['hp', 1200, 0.7]] }), 0, 0.8);
  addMono(core, noiseThump(rng, { dur: 0.5, f: [180, 80], attack: 0.002, decay: 0.08, hp: 30 }), 0, 0.5);
  const body = stereo(n);
  const bz = buzz(rng, total, { f: rng.range(110, 160) * p, flicker: 0.55 });
  mul(bz, env(n, [[0, 0], [0.03, 0.5], [0.25 * k, 1], [total * 0.8, 0.8], [total, 0]]));
  addMono(body, bz, 0, 0.7, rng.bi() * 0.2);
  const hiss = white(rng, n);
  filt(hiss, [['hp', 3500, 0.7]]);
  mul(hiss, wander(rng, n, 30, 0.2, 1));
  mul(hiss, env(n, [[0, 0], [0.05, 1], [total, 0.3]]));
  addMono(body, norm(hiss), 0, 0.3);
  const tail = stereo(n);
  sparks(rng, tail, { start: 0.02, dur: total - 0.05, rate: (u) => 160 * (1 - u) + 30, amp: 0.55 });
  return { audio: layers({ core, body, tail }, { core: -2, body: 0, tail: -5 }), layers: { core: 'air-tear-crack', body: 'rising-arc-buzz+hiss', tail: 'sparks' } };
}

/** 雷の息の持続（seconds 秒ちょうどの輪）：放電のうなり2本・はじける火花・ときどきの大きな放電。 */
export function zapLoop(rng, seconds = 5) {
  const extra = 0.6;
  const n = len(seconds + extra);
  const s = stereo(n);
  for (const side of ['l', 'r']) {
    const a = buzz(rng, seconds + extra, { f: rng.range(115, 150), flicker: 0.6 });
    const b = buzz(rng, seconds + extra, { f: rng.range(190, 260), flicker: 0.75, bright: 1.4 });
    const sw = wander(rng, n, 7, 0.45, 1);
    for (let i = 0; i < n; i++) s[side][i] += (a[i] * 0.7 + b[i] * 0.35) * sw[i];
  }
  sparks(rng, s, { start: 0, dur: seconds + extra, rate: 140, amp: 0.45 });
  // 大きな放電：ときどき、裂ける音の短い束
  const big = Math.round((seconds + extra) * rng.range(1.2, 2));
  for (let k = 0; k < big; k++) snaps(rng, s, { start: rng.range(0, seconds + extra - 0.1), count: rng.int(6, 14), window: rng.range(0.02, 0.05), f: [1800, 8000], amp: 0.5, spread: 0.9, ring: [0.001, 0.004] });
  const hiss = pink(rng, n);
  filt(hiss, [['hp', 3000, 0.7]]);
  mul(hiss, wander(rng, n, 12, 0.3, 1));
  addMono(s, norm(hiss), 0, 0.2);
  dcBlock(s.l);
  dcBlock(s.r);
  norm(s.l);
  norm(s.r);
  const audio = makeLoop({ l: s.l.subarray(0, n), r: s.r.subarray(0, n) }, seconds, extra * 0.9);
  return { audio, loop: true, layers: { core: 'sparks+discharges', body: 'arc-buzz×2', tail: 'ozone-hiss' } };
}

/** 雷の息の終わり：うなりが落ちて切れ、最後に1つはじけ、焦げたような細かな音が残る。 */
export function zapStop(rng) {
  const total = rng.range(1.2, 1.7);
  const n = len(total);
  const body = stereo(n);
  const bz = buzz(rng, 0.5, { f: rng.range(120, 150), flicker: 0.8 });
  const m = bz.length;
  // 高さが落ちていく（輪の周期を伸ばす代わりに、低い方へ滑らせた写しを重ねる）
  const low = buzz(rng, 0.5, { f: rng.range(60, 80), flicker: 0.9 });
  mul(bz, env(m, [[0, 1], [0.35, 0.2], [0.5, 0]]));
  mul(low, env(m, [[0, 0], [0.1, 0.6], [0.45, 0]]));
  addMono(body, bz, 0, 0.7);
  addMono(body, low, 0, 0.5);
  const core = stereo(n);
  snaps(rng, core, { start: rng.range(0.25, 0.45), count: rng.int(5, 10), window: 0.03, f: [2000, 8000], amp: 0.7, ring: [0.001, 0.004] });
  const tail = stereo(n);
  sparks(rng, tail, { start: 0.05, dur: total - 0.1, rate: (u) => 90 * (1 - u) ** 2 + 4, amp: 0.4 });
  return { audio: layers({ core, body, tail }, { core: -3, body: 0, tail: -4 }), layers: { core: 'last-snap', body: 'falling-buzz', tail: 'fizzle' } };
}

/**
 * 跳ねる雷（当たったビルから近くのビルへ）：「ジジッ、バリッ」。1〜3回に分かれて跳ぶ変化がある。
 * 芯＝跳ぶ瞬間の裂ける音、胴＝短い放電のうなり、尾＝小さな雷鳴と火花。
 * r05-audio：指摘「跳ねる雷は模様の相関 0.96、3分で 130 回鳴る」 跳ぶ回数を 1〜4 回、うなりの長さ・裂ける音の数・雷鳴の尾の長さと強さ・残響の量を
 * 変化ごとに散らす（変化は 4→8 個）。型：近い一撃（尾が短く乾く）・遠く転がる（尾が長い）・連なる（3〜4 回）・弱い火花（うなり主体）
 */
const ARC_FORMS = ['near', 'roll', 'chain', 'fizz'];

export function arc(rng, ctx, variant = 0) {
  const form = ARC_FORMS[variant % ARC_FORMS.length];
  const jumps = form === 'chain' ? rng.int(3, 4) : form === 'fizz' ? 1 : rng.int(1, 2);
  const tailLen = form === 'roll' ? rng.range(1.8, 2.4) : form === 'near' ? rng.range(0.8, 1.1) : rng.range(1.1, 1.6);
  const total = tailLen + 0.25 * jumps;
  const n = len(total);
  const core = stereo(n);
  const body = stereo(n);
  let t = 0;
  for (let j = 0; j < jumps; j++) {
    const g = 1 - 0.2 * j;
    const pan = rng.bi() * 0.7;
    // ジジッ（立ち上がる放電）→ バリッ（跳ぶ）
    const pre = form === 'fizz' ? rng.range(0.15, 0.3) : rng.range(0.04, 0.14);
    const bz = buzz(rng, pre + 0.18, { f: rng.range(140, 220), flicker: 0.7, bright: 1.2 });
    mul(bz, env(bz.length, [[0, 0], [pre, 1], [pre + 0.18, 0]]));
    addMono(body, bz, len(t), (form === 'fizz' ? 0.9 : 0.6) * g, pan);
    snaps(rng, core, { start: t + pre, count: form === 'fizz' ? rng.int(4, 9) : rng.int(10, 24), window: rng.range(0.012, 0.045), f: [1800, 9500], amp: (form === 'fizz' ? 0.6 : 0.9) * g, spread: 0.5, ring: [0.001, 0.004] });
    addMono(core, noiseBurst(rng, { dur: 0.15, attack: 0.001, decay: rng.range(0.012, 0.03), filters: [['hp', 1500, 0.7]] }), len(t + pre), (form === 'fizz' ? 0.3 : 0.6) * g, pan);
    t += pre + rng.range(0.1, 0.28);
  }
  const tail = thunderclap(rng, { dur: total, near: form === 'near' });
  const tailDb = form === 'roll' ? rng.range(-6, -3) : form === 'fizz' ? rng.range(-14, -10) : rng.range(-9, -6);
  let audio = layers({ core, body, tail }, { core: 0, body: -2, tail: tailDb });
  const wet = form === 'roll' ? rng.range(0.25, 0.38) : form === 'near' ? rng.range(0.08, 0.16) : rng.range(0.14, 0.26);
  audio = addWet(padTail(audio, form === 'roll' ? 1.6 : 1), ctx.ir.mid, wet);
  return { audio, layers: { core: `${jumps}-jump-crack(${form})`, body: 'short-buzz', tail: `thunder ${tailDb.toFixed(0)}dB+mid-reverb ${wet.toFixed(2)}` } };
}

// ------------------------------------------------------------ 溶岩（焔角）

/** 吐き方の型（変化の番号で必ず全部の型が出る）：短く吐く・ためてから吐く・二つ続けて吐く・長く飛ばす */
const SPIT_SHAPES = ['hurk', 'heave', 'double', 'hurl'];

/** 溶岩の礫を吐く：芯＝喉の奥から押し出す「グォッ」、胴＝粘る塊がちぎれる音、尾＝飛んでいく礫の風切りとはぜ。 */
export function spit(rng, variant = 0) {
  const shape = SPIT_SHAPES[variant % SPIT_SHAPES.length];
  const k = shape === 'hurk' ? rng.range(0.75, 0.85) : shape === 'hurl' ? rng.range(1.2, 1.3) : rng.range(0.95, 1.1);
  const p = rng.range(0.88, 1.14);
  const total = 1.8 * k;
  const n = len(total);
  const core = stereo(n);
  // ためる型は、喉の押し出しそのものが遅れて来る（その前は喉の奥の低いうなりだけ）
  const lag = shape === 'heave' ? rng.range(0.2, 0.3) : 0;
  // 喉の押し出し：低い雑音の塊と、喉の短いうなり
  addMono(core, noiseThump(rng, { dur: 0.6, f: [260 * p, 110 * p], attack: 0.01, decay: 0.12 * k, color: 'pink', hp: 35 }), len(lag), 1);
  if (shape === 'double') addMono(core, noiseThump(rng, { dur: 0.6, f: [240 * p, 100 * p], attack: 0.01, decay: 0.1 * k, color: 'pink', hp: 35 }), len(rng.range(0.35, 0.5)), 0.8);
  const grunt = new Float32Array(len(0.35 * k));
  let ph = 0;
  const gf = rng.range(38, 55) * p;
  for (let i = 0; i < grunt.length; i++) {
    ph += gf / SR;
    grunt[i] = (ph % 1) * 2 - 1;
  }
  filt(grunt, [['bp', 320 * p, 1.2], ['lp', 1200, 0.7]]);
  mul(grunt, env(grunt.length, [[0, 0], [0.03, 1], [0.35 * k, 0]]));
  softclip(norm(grunt), 2);
  addMono(core, grunt, len(0.01 + lag * 0.3), shape === 'heave' ? 0.8 : 0.5);
  const body = stereo(n);
  // 粘る塊がちぎれる：帯域が上がる濡れた雑音と、泡のはじけ。ためる型は少し遅れて、二つの型は二度
  const globs = shape === 'double' ? [0.03, rng.range(0.35, 0.5)] : [lag + 0.03];
  for (const [g, at] of globs.map((t, j) => [j === 0 ? 1 : 0.75, t])) {
    const shlorp = whoosh(rng, { dur: 0.6 * k, fPath: [[0, 160 * p], [0.25 * k, 850 * p], [0.6 * k, 500 * p]], qPath: [[0, 2.2]], points: [[0, 0], [0.04, 1], [0.3 * k, 0.5], [0.6 * k, 0]], color: 'pink' });
    addMono(body, shlorp, len(at), 0.8 * g, rng.bi() * 0.2);
  }
  if (shape === 'heave') addMono(body, noiseThump(rng, { dur: 0.5, f: [200 * p, 90 * p], attack: 0.03, decay: 0.1, color: 'pink', hp: 35 }), 0, 0.7);
  grains(rng, body, { start: 0.05, dur: 0.6 * k, rate: (u) => 120 * (1 - u) + 10, amp: (u) => 0.4 * (1 - u), f: [250, 1400], tau: [0.004, 0.02], noisy: 0.5, spread: 0.6, partials: [1, 1.5] });
  const tail = stereo(n);
  const fly = whoosh(rng, { dur: total - 0.1, fPath: [[0, 900 * p], [total - 0.1, 280 * p]], qPath: [[0, 1]], points: [[0, 0], [0.12, 1], [total * 0.6, 0.4], [total - 0.1, 0]] });
  addMono(tail, fly, len(0.1), 0.6, rng.bi() * 0.3);
  crackle(rng, tail, { start: 0.1, dur: total - 0.2, rate: (u) => 60 * (1 - u) + 5, amp: 0.45 });
  return { audio: layers({ core, body, tail }, { core: 0, body: -2, tail: shape === 'hurl' ? -3 : -6 }), layers: { core: 'throat-heave+grunt', body: `viscous-tear(${shape})+bubbles`, tail: 'flying-glob+crackle' } };
}

/**
 * 溶岩の着弾：芯＝重く濡れた「ベシャッ」、胴＝鈍い圧と飛び散る岩、尾＝じゅうじゅうと焼ける音とはぜ。
 * r05-audio：指摘「溶岩の着弾は模様の相関 0.95」 型を4つにし（べしゃっと潰れる・重く沈む・飛び散る・長く焼ける）、
 * 岩の数（2〜10）・焼ける尾の長さ・残響の量を変化ごとに散らす（変化は 4→8 個）。
 */
const LAVA_FORMS = ['splat', 'thud', 'spray', 'sizzle'];

export function lavaHit(rng, ctx, variant = 0) {
  const form = LAVA_FORMS[variant % LAVA_FORMS.length];
  const k = rng.range(0.82, 1.2);
  const total = (form === 'sizzle' ? rng.range(3.6, 4.4) : form === 'thud' ? rng.range(2.2, 2.8) : rng.range(2.6, 3.4)) * k;
  const n = len(total);
  const core = stereo(n);
  addMono(core, noiseBurst(rng, { dur: 0.3, attack: 0.001, decay: form === 'splat' ? rng.range(0.06, 0.09) : rng.range(0.035, 0.06), color: 'pink', filters: [['bp', rng.range(350, 700), 0.8], ['lowShelf', 200, 4]] }), 0, form === 'thud' ? 0.7 : 1);
  snaps(rng, core, { start: 0, count: form === 'spray' ? rng.int(10, 16) : rng.int(4, 10), window: rng.range(0.05, 0.12), f: [900, 5000], amp: 0.5, spread: 0.8 });
  const body = stereo(n);
  addMono(body, noiseThump(rng, { dur: 1.2, f: form === 'thud' ? [160, 55] : [200, 70], attack: 0.002, decay: (form === 'thud' ? 0.28 : 0.2) * k, hp: 26 }), 0, 1);
  addMono(body, subThump(rng, { dur: 0.3, f0: 80, f1: 48, glide: 0.04, attack: 0.002, decay: 0.05, drive: 1.8 }), 0, form === 'thud' ? 0.55 : 0.4);
  const chunks = form === 'spray' ? rng.int(7, 10) : form === 'thud' ? rng.int(2, 4) : rng.int(3, 7);
  for (let c = 0; c < chunks; c++) addMono(body, chunkImpact(rng, { size: rng.range(0.3, 0.9), bounce: rng.chance(0.4) ? 0.4 : 0 }), len(rng.range(0.02, form === 'spray' ? 0.8 : 0.5)), rng.range(0.3, 0.6), rng.bi() * 0.9);
  // 泡がはじける濡れた音（溶岩の表面）
  const br = form === 'splat' ? rng.range(60, 90) : rng.range(25, 55);
  grains(rng, body, { start: 0.05, dur: 1.5 * k, rate: (u) => br * (1 - u) + 6, amp: (u) => 0.35 * (1 - u), f: [180, 900], tau: [0.01, 0.04], noisy: 0.3, spread: 0.7, partials: [1, 1.4] });
  const tail = stereo(n);
  // じゅうじゅう焼ける：高い雑音がゆっくり弱まる（長く焼ける型は強く長い）
  const sizzle = white(rng, n);
  filt(sizzle, [['hp', 3200, 0.7], ['lp', 11000, 0.7]]);
  mul(sizzle, wander(rng, n, 18, 0.35, 1));
  mul(sizzle, env(n, [[0, 0], [0.08, 1], [total * (form === 'sizzle' ? 0.7 : 0.45), 0.45], [total, 0]]));
  addMono(tail, norm(sizzle), 0, form === 'sizzle' ? 0.5 : 0.3, rng.bi() * 0.3);
  const cr = rng.range(45, 90);
  crackle(rng, tail, { start: 0.1, dur: total - 0.2, rate: (u) => cr * (1 - u) + 6, amp: 0.5 });
  let audio = layers({ core, body, tail }, { core: -1, body: 0, tail: form === 'sizzle' ? -1 : rng.range(-5, -2) });
  const wet = rng.range(0.08, 0.3);
  audio = addWet(padTail(audio, 1.4), ctx.ir.mid, wet);
  return { audio, layers: { core: `wet-splat(${form})`, body: `noise-thump+${chunks}-rocks+bubbles`, tail: `sizzle+crackle+mid-reverb ${wet.toFixed(2)}` } };
}

/** 突進の地響き（seconds 秒ちょうどの輪）：転がる地鳴り、途切れない瓦礫の飛沫、ときどき揺れる岩の皮。 */
export function chargeLoop(rng, seconds = 4) {
  const extra = 0.6;
  const n = len(seconds + extra);
  const s = stereo(n);
  const roll = brown(rng, n);
  filt(roll, [['lp', 95, 0.8], ['lp', 130, 0.7], ['hp', 24, 0.7]]);
  mul(roll, wander(rng, n, 2.2, 0.55, 1));
  addMono(s, norm(roll), 0, 0.9);
  grains(rng, s, { start: 0, dur: seconds + extra, rate: () => 180, amp: () => 0.3, f: [300, 3200], tau: [0.003, 0.016], noisy: 0.9, spread: 1 });
  const rattle = Math.round((seconds + extra) * 2.5);
  for (let k = 0; k < rattle; k++) addMono(s, chunkImpact(rng, { size: rng.range(0.5, 0.9), bounce: 0.4 }), len(rng.range(0, seconds + extra - 0.4)), rng.range(0.2, 0.4), rng.bi() * 0.7);
  const dust = pink(rng, n);
  filt(dust, [['hp', 1500, 0.7]]);
  mul(dust, wander(rng, n, 1.5, 0.4, 1));
  addMono(s, norm(dust), 0, 0.12);
  dcBlock(s.l);
  dcBlock(s.r);
  const audio = makeLoop(s, seconds, extra * 0.9);
  return { audio, loop: true, layers: { core: 'rock-rattle', body: 'rolling-rumble+debris-spray', tail: 'dust' } };
}

/** 押し倒す音：芯＝角と肩がビルに当たる砕け、胴＝コンクリートが潰れる中域と鉄骨のうめき・きしみ・割れるガラス、尾＝傾き始めの地鳴り。 */
export function shove(rng, ctx) {
  const total = rng.range(3.4, 4.2);
  const n = len(total);
  const core = stereo(n);
  snaps(rng, core, { start: 0, count: rng.int(14, 22), window: 0.12, f: [1200, 7000], amp: 0.9, spread: 0.8 });
  addMono(core, noiseThump(rng, { dur: 0.8, f: [220, 80], attack: 0.002, decay: 0.16, hp: 26 }), 0, 1);
  for (let c = 0; c < 6; c++) addMono(core, chunkImpact(rng, { size: rng.range(0.4, 1), bounce: 0.3 }), len(rng.range(0, 0.25)), rng.range(0.4, 0.7), rng.bi() * 0.8);
  const body = stereo(n);
  const crush = noiseBurst(rng, { dur: total, attack: 0.03, decay: 0.9, hold: 0.8, color: 'pink', filters: [['bp', rng.range(450, 800), 0.6], ['lp', 1800, 0.7]] });
  const jag = wander(rng, crush.length, 28, 0.15, 1);
  for (let i = 0; i < crush.length; i++) crush[i] *= jag[i];
  addMono(body, norm(crush), 0, 0.6, rng.bi() * 0.2);
  const base = rng.range(50, 64);
  addMono(body, groan(rng, { dur: total - 0.2, modes: [1, 1.6, 2.4, 3.8].map((r, k) => ({ f: base * r, tau: 0.35 / (1 + k * 0.4), gain: 1 / (1 + k * 0.4), wobble: rng.range(0.6, 1.6) })), drift: -3, slips: 10, rough: 0.7, points: [[0, 0], [0.3, 1], [total * 0.7, 0.7], [total - 0.2, 0]] }), len(0.1), 0.45);
  addMono(body, creak(rng, { dur: total - 0.3, episodes: rng.int(4, 6), base: [430, 700] }), len(0.2), 0.5, rng.bi() * 0.4);
  grains(rng, body, { start: 0.05, dur: 1.4, rate: (u) => 600 * (1 - u) ** 2 + 10, amp: (u) => 0.3 * (1 - u), f: [2200, 9000], tau: [0.012, 0.08], partials: [1, 2.32, 4.25], partialGain: 0.6, noisy: 0.2, spread: 1 });
  const tail = stereo(n);
  addMono(tail, rumble(rng, { dur: total, cutoff: 110, points: [[0, 0], [0.2, 0.8], [total * 0.6, 0.7], [total, 0]], modRate: 3, modDepth: 0.5 }), 0, 0.9);
  addMono(tail, lowTones(rng, { dur: total, count: 3, fLo: 36, fHi: 90, start: [0.2, 1.2], length: [1, 2.4] }), 0, 0.4);
  let audio = layers({ core, body, tail }, { core: -2, body: 0, tail: -3 });
  audio = addWet(padTail(audio, 2), ctx.ir.mid, 0.2);
  return { audio, layers: { core: 'horn-impact+chunks', body: 'concrete-crush+steel-groan+creak+glass', tail: 'lean-rumble+mid-reverb' } };
}

/**
 * 地割れ：前へ走っていく裂け目。裂ける区切りが次々に遠ざかり、遠いほど小さく・こもり・遅れて聞こえる。
 * 芯＝足もとで裂ける破裂、胴＝走る裂け目（区切りごとの砕けと、移っていく裂ける雑音）、尾＝深い地鳴りと遠い響き。
 */
export function fissure(rng, ctx) {
  const total = rng.range(3.4, 4.2);
  const n = len(total);
  const core = stereo(n);
  snaps(rng, core, { start: 0, count: rng.int(10, 16), window: 0.1, f: [900, 6000], amp: 1, spread: 0.6 });
  addMono(core, noiseThump(rng, { dur: 0.9, f: [180, 60], attack: 0.002, decay: 0.2, hp: 24 }), 0, 1);
  const body = stereo(n);
  // 区切り：だんだん間があき、遠ざかる
  const segs = rng.int(9, 14);
  let t = 0.06;
  for (let s = 0; s < segs && t < total - 0.6; s++) {
    const u = s / segs;
    const g = (1 - 0.75 * u) ** 1.3;
    const seg = stereo(len(0.6));
    snaps(rng, seg, { start: 0, count: rng.int(4, 9), window: 0.05, f: [700, 5000 * (1 - 0.6 * u)], amp: 0.8, spread: 0.3 });
    addMono(seg, noiseBurst(rng, { dur: 0.4, decay: 0.06, color: 'pink', filters: [['bp', rng.range(400, 900) * (1 - 0.4 * u), 0.8]] }), 0, 0.7);
    addMono(seg, noiseThump(rng, { dur: 0.5, f: [150, 60], attack: 0.003, decay: 0.1, hp: 25 }), 0, 0.6);
    // 遠いほど高域が吸われる
    const cut = 9000 * (1 - 0.8 * u) + 800;
    filt(seg.l, [['lp', cut, 0.7]]);
    filt(seg.r, [['lp', cut, 0.7]]);
    const at = len(t);
    for (let i = 0; i < seg.l.length && at + i < n; i++) {
      body.l[at + i] += seg.l[i] * g;
      body.r[at + i] += seg.r[i] * g;
    }
    t += 0.12 + 0.3 * u * rng.range(0.7, 1.3);
  }
  // 移っていく裂ける雑音（帯域が下がり、弱まる）
  const tear = whoosh(rng, { dur: total, fPath: [[0, 1400], [total * 0.7, 380], [total, 250]], qPath: [[0, 1.4]], points: [[0, 0], [0.05, 1], [total * 0.6, 0.35], [total, 0]], color: 'pink' });
  const jag = wander(rng, tear.length, 35, 0.2, 1);
  for (let i = 0; i < tear.length; i++) tear[i] *= jag[i];
  addMono(body, norm(tear), 0, 0.45);
  grains(rng, body, { start: 0.05, dur: total * 0.8, rate: (u) => 300 * (1 - u) ** 1.5 + 10, amp: (u) => 0.3 * (1 - u), f: [250, 2000], tau: [0.004, 0.02], noisy: 0.9, spread: 0.6 });
  const tail = stereo(n);
  addMono(tail, rumble(rng, { dur: total, cutoff: 90, points: [[0, 0], [0.1, 1], [total * 0.7, 0.6], [total, 0]], modRate: 2.5, modDepth: 0.5 }), 0, 1);
  let audio = layers({ core, body, tail }, { core: -1, body: 0, tail: -2 });
  audio = addWet(padTail(audio, 2.2), ctx.ir.far, 0.3);
  return { audio, layers: { core: 'underfoot-rupture', body: `${segs}-receding-segments+moving-tear`, tail: 'deep-rumble+far-reverb' } };
}
