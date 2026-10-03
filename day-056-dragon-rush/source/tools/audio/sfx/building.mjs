// OWNER: audio-tools
// 建物の壊れ方の音：ひび・剥がれ・傾き・崩落（近・遠）・ガラス。壊れ方の4段階（docs/GAME-DESIGN.md）に1つずつ対応する。
// 崩落の3層：芯＝破断の高い雑音の立ち上がり、胴＝雑音の地鳴りと不協和な低い鳴りと 250Hz〜2kHz の砕ける層、尾＝遠くへ抜ける2〜4秒の残響。
// r02-audio：指摘「胴の低音が下降する正弦（キックの合成）で、低域の53〜93%が1本の音に集まる」 80→40Hz の正弦 3.4秒→頭の0.4秒の強調だけ。
import { addMono, filt, len, softclip, stereo, wander } from '../lib/dsp.mjs';
import { reverbStereo } from '../lib/fft.mjs';
import { chunkImpact, creak, grains, groan, layers, lowTones, noiseBurst, noiseThump, norm, rumble, snaps, subThump } from '../lib/sfxkit.mjs';
import { padTail } from './voice.mjs';

function addWet(audio, ir, w) {
  const wet = reverbStereo(audio, ir);
  for (let i = 0; i < audio.l.length; i++) {
    audio.l[i] += wet.l[i] * w;
    audio.r[i] += wet.r[i] * w;
  }
  return audio;
}

/**
 * ひび：芯＝乾いた破裂が続けて走る、胴＝鈍い音と短いきしみ、尾＝こぼれる小さな破片。
 * r02-audio：指摘「ひびの素材は -20〜-24 LUFS で目標の -15 に届かない（鋭い破裂を制限器で潰さない決まりのため）」
 * 最初の破裂の頭を柔らかく丸め、0.3秒の中に破裂を続けて走らせて（パキパキ）、同じピークでも大きく聞こえるようにした。
 * r05-audio：指摘「ひびがかえって揃った（模様の相関 0.94）。3分で 78〜200 回鳴る」 走り方の型を4つにし（長く走る・短く一度・二度に分かれる・まばら）、
 * 破裂の列の長さを 0.1〜0.6 秒、数を 3〜20 に広げ、うめきの有無・擦れの長さ・こぼれる破片の量を変化ごとに変える（変化は 5→8 個）。
 */
const CRACK_FORMS = ['run', 'short', 'split', 'sparse'];

export function crack(rng, variant = 0) {
  const form = CRACK_FORMS[variant % CRACK_FORMS.length];
  const n = len(1.9);
  const core = stereo(n);
  snaps(rng, core, { start: 0, count: 1, window: 0, f: [1800, 3800], amp: 1.2, ring: [0.006, 0.014] });
  const first = rng.range(0.01, 0.04);
  if (form === 'run') snaps(rng, core, { start: first, count: rng.int(14, 20), window: rng.range(0.35, 0.6), f: [900, 5000], amp: 0.75, spread: 0.8, ring: [0.004, 0.016] });
  else if (form === 'short') snaps(rng, core, { start: first, count: rng.int(3, 8), window: rng.range(0.1, 0.18), f: [1100, 5200], amp: 0.8, spread: 0.6, ring: [0.004, 0.014] });
  else if (form === 'split') {
    snaps(rng, core, { start: first, count: rng.int(6, 10), window: rng.range(0.12, 0.2), f: [900, 5000], amp: 0.75, spread: 0.7, ring: [0.004, 0.016] });
    snaps(rng, core, { start: first + rng.range(0.3, 0.5), count: rng.int(4, 8), window: rng.range(0.1, 0.25), f: [700, 4200], amp: 0.6, spread: 0.9, ring: [0.005, 0.018] });
  } else snaps(rng, core, { start: first, count: rng.int(3, 6), window: rng.range(0.3, 0.6), f: [800, 4800], amp: 0.85, spread: 0.9, ring: [0.006, 0.02] });
  // 破裂の頭を丸める（ピークを削り、実効値はそのまま）
  softclip(core.l, 2.6);
  softclip(core.r, 2.6);
  const body = stereo(n);
  addMono(body, noiseThump(rng, { dur: 0.45, f: [240, 110], attack: 0.001, decay: rng.range(0.05, 0.1), color: 'pink', hp: 50 }), 0, rng.range(0.35, 0.55));
  // うめき（固い骨組みが短く鳴る）：長く走る型と二度に分かれる型は必ず、ほかは半分ほど
  if (form === 'run' || form === 'split' || rng.chance(0.5)) {
    addMono(body, groan(rng, { dur: 0.5, modes: [{ f: rng.range(150, 190), tau: 0.15, gain: 1, wobble: 1.3 }, { f: rng.range(240, 290), tau: 0.11, gain: 0.7, wobble: 2 }, { f: rng.range(380, 450), tau: 0.08, gain: 0.5, wobble: 2.6 }], drift: -1.2, slips: 4, rough: 0.5, points: [[0, 0], [0.015, 1], [0.15, 0.5], [0.35, 0.15], [0.5, 0]] }), len(rng.range(0.01, 0.2)), rng.range(0.2, 0.4));
  }
  // 割れ目がこすれる細かな砕け（600Hz〜3kHz）。長さと強さを型で変える
  const gl = form === 'short' ? rng.range(0.25, 0.4) : form === 'run' ? rng.range(0.6, 0.9) : rng.range(0.4, 0.7);
  const grind = noiseBurst(rng, { dur: gl, attack: 0.004, decay: gl * 0.27, hold: 0.05, color: 'pink', filters: [['bp', rng.range(900, 1600), 0.7], ['lowShelf', 500, -6]] });
  const jag = wander(rng, grind.length, rng.range(40, 80), 0.2, 1);
  for (let i = 0; i < grind.length; i++) grind[i] *= jag[i];
  addMono(body, norm(grind), 0, rng.range(0.55, 0.85), rng.bi() * 0.3);
  const tail = stereo(n);
  const td = rng.range(0.6, 1.6);
  const tr = rng.range(30, 80);
  grains(rng, tail, { start: 0.05, dur: td, rate: (u) => tr * (1 - u) ** 1.5 + 3, amp: (u) => 0.26 * (1 - u), f: [700, 5200], tau: [0.003, 0.012], noisy: 0.85, spread: 0.9 });
  return { audio: layers({ core, body, tail }, { core: -1, body: 0, tail: rng.range(-7, -2) }), layers: { core: `rounded-snap-${form}`, body: 'noise-thunk+groan?+grind', tail: `dribble ${td.toFixed(1)}s` } };
}

/**
 * 剥がれ：芯＝外壁が裂ける音、胴＝落ちた塊が次々に当たる、尾＝ぱらぱらと続く破片と粉。
 * r02-audio：指摘「落ちる塊（110〜190→60〜90Hz の下降音が3〜6発）が電子のキックに聞こえうる」 下降する正弦→雑音の打撃と塊の短い鳴り。
 */
export function peel(rng) {
  const total = 3;
  const n = len(total);
  const core = stereo(n);
  const tear = noiseBurst(rng, { dur: 0.4, attack: 0.012, decay: 0.12, filters: [['bp', rng.range(900, 1500), 0.7]] });
  const rough = wander(rng, tear.length, 90, 0.2, 1);
  for (let i = 0; i < tear.length; i++) tear[i] *= rough[i];
  addMono(core, norm(tear), 0, 0.8, rng.bi() * 0.3);
  snaps(rng, core, { start: 0.01, count: 5, window: 0.25, f: [900, 4500], amp: 0.5, spread: 0.8 });
  const body = stereo(n);
  const chunks = rng.int(4, 8);
  for (let k = 0; k < chunks; k++) {
    const t = rng.range(0.28, 1.5);
    const size = rng.range(0.2, 1);
    const pan = rng.bi() * 0.6;
    const g = rng.range(0.45, 1) * (0.6 + 0.4 * size);
    addMono(body, chunkImpact(rng, { size, bounce: rng.chance(0.45) ? rng.range(0.25, 0.5) : 0 }), len(t), g, pan);
    // 大きな塊だけ、地面を揺らす鈍い雑音の打撃（正弦は使わない）
    if (size > 0.6) addMono(body, noiseThump(rng, { dur: 0.5, f: [110, 70], attack: 0.002, decay: 0.07 + 0.05 * size, hp: 28 }), len(t), g * 0.8, pan * 0.5);
  }
  const tail = stereo(n);
  grains(rng, tail, { start: 0.2, dur: total - 0.3, rate: (u) => 90 * Math.exp(-3 * u) + 4, amp: (u) => 0.25 * (1 - u) ** 1.2, f: [500, 5000], tau: [0.003, 0.014], noisy: 0.85, spread: 1 });
  const dust = noiseBurst(rng, { dur: total, attack: 0.3, decay: 0.8, color: 'pink', filters: [['hp', 1800, 0.7]] });
  addMono(tail, dust, 0, 0.12);
  return { audio: layers({ core, body, tail }, { core: -2, body: 0, tail: -5 }), layers: { core: 'tear+snaps', body: `${chunks}-chunk-noise-impacts`, tail: 'trickle+dust' } };
}

/**
 * 傾き：芯＝骨組みの深い割れ、胴＝鉄骨とコンクリートのうめき（下がっていく）と、鉄骨のきしみ（400Hz〜3kHz）、尾＝きしみの名残。
 * r02-audio：指摘「250Hz より上が K 特性で -20dB 以下しかなく、低いオルガンの和音に聞こえうる」 きしみ（引っかかって滑る打の列）と擦れる砕けを足した。
 */
export function tilt(rng, ctx) {
  const total = 4;
  const n = len(total);
  const core = stereo(n);
  addMono(core, subThump(rng, { dur: 0.45, f0: rng.range(55, 68), f1: rng.range(38, 44), glide: 0.06, attack: 0.002, decay: 0.09, drive: 1.8, punch: 0.3 }), 0, 0.55);
  addMono(core, noiseThump(rng, { dur: 0.9, f: [150, 75], attack: 0.002, decay: 0.2, hp: 26 }), 0, 0.8);
  snaps(rng, core, { start: 0, count: 5, window: 0.1, f: [500, 2400], amp: 0.6, ring: [0.008, 0.02] });
  const body = stereo(n);
  const base = rng.range(55, 70);
  // うめきの固有の鳴りは減衰を短くして帯域を広げ（止まった低い和音に聞こえないように）、一番低い鳴りを弱める
  const modes = [1, 1.57, 2.28, 3.71, 6.02].map((r, k) => ({ f: base * r * rng.range(0.97, 1.03), tau: 0.3 / (1 + k * 0.45), gain: (k === 0 ? 0.55 : 1) / (1 + k * 0.4), wobble: rng.range(0.5, 1.8) }));
  const g = groan(rng, { dur: 3.4, modes, drift: -rng.range(2, 4), slips: rng.int(8, 13), rough: 0.7, points: [[0, 0], [0.25, 1], [2.6, 0.8], [3.4, 0]] });
  addMono(body, g, len(0.05), 0.5, rng.bi() * 0.25);
  // 建物の重さがずれていく低い地鳴り（雑音）
  addMono(body, rumble(rng, { dur: total, cutoff: 120, points: [[0, 0], [0.3, 0.8], [2.8, 0.6], [total, 0]], modRate: 2.5, modDepth: 0.5 }), 0, 0.6);
  // 鉄骨のきしみ：高い金属の鳴りを、揺れる打の列でこする（向きは少し散らす）
  const cr = creak(rng, { dur: 3.5, episodes: rng.int(4, 7), base: [rng.range(420, 520), rng.range(560, 760)], rate: [16, 64], slide: [-3.5, 1.5], len: [0.25, 1.0] });
  addMono(body, cr, len(0.2), 0.55, rng.bi() * 0.4);
  // コンクリートが擦れて崩れる中域（300Hz〜1.5kHz）
  const grind = rumble(rng, { dur: total, cutoff: 320, points: [[0, 0], [0.4, 0.6], [2.8, 0.5], [total, 0]], modRate: 11, modDepth: 0.7 });
  addMono(body, grind, 0, 0.4);
  grains(rng, body, { start: 0.1, dur: 3.3, rate: (u) => 60 * (1 - u) + 10, amp: (u) => 0.3 * (1 - u * 0.6), f: [300, 1500], tau: [0.004, 0.02], noisy: 0.95, spread: 0.8 });
  const tail = stereo(n);
  grains(rng, tail, { start: 0.3, dur: 3.2, rate: () => 14, amp: (u) => 0.16 * (1 - u), f: [500, 4000], tau: [0.003, 0.014], noisy: 0.85, spread: 1 });
  let audio = layers({ core, body, tail }, { core: -3, body: 0, tail: -6 });
  audio = addWet(padTail(audio, 1.2), ctx.ir.mid, 0.15);
  return { audio, layers: { core: 'deep-crack(noise)', body: `groan ${Math.round(base)}Hz↓+steel-creak+grind`, tail: 'creak+mid-reverb' } };
}

/**
 * 崩落。far で遠い崩落（高域を落とし、地鳴りと遠い反射を長くする）。
 * 胴：頭の 0.4 秒だけ下降する正弦で「ドン」を強調し、あとは雑音の地鳴りと、ゆっくり下がってばらつく不協和な低い鳴り数本。
 * 小さなスピーカーでも崩れる音として残るよう、250Hz〜2kHz の砕ける層（細かな瓦礫・落ちる塊・擦れる砕け）を厚くした。
 * r06-audio：近い崩落は崩れ方の型を4つにした（collapseForm）。遠い崩落はこの作りのまま（乱数の引き方も同じなので同じ音）。
 */
export function collapse(rng, ctx, { far = false, variant = null } = {}) {
  if (!far && variant !== null) return collapseForm(rng, ctx, COLLAPSE_FORMS[variant % COLLAPSE_FORMS.length]);
  return collapseClassic(rng, ctx, { far });
}

/**
 * r06-audio：指摘「崩落は5変化の模様が 0.961 似たまま、落ちなくなったぶん3分で 72〜132 回そのまま聞こえる」 近い崩落の崩れ方の型（変化は 5→8 個、型ごとに2個）。
 *   crumble＝すぐに全体が崩れ落ちる（r05 までの形）、topple＝骨組みがきしんで折れてから、上の塊が倒れて落ちる（0.5〜0.85 秒遅れの一撃）、
 *   pancake＝階が上から次々に潰れる（4〜6回の床の打撃が間を詰めながら強くなる）、split＝一度崩れかけて止まり、1.1〜1.7 秒後に本体が崩れる。
 * 崩れの瞬間ごとに芯（破断の破裂）と胴（頭の強調・砕ける中域）を置き、地鳴り・低い鳴り・塊・擦れる砕け・尾は一番強い瞬間から数える。
 */
const COLLAPSE_FORMS = ['crumble', 'topple', 'pancake', 'split'];

function collapseForm(rng, ctx, form) {
  const total = form === 'split' ? rng.range(7.2, 7.8) : form === 'pancake' ? rng.range(5.4, 6.2) : form === 'topple' ? rng.range(6.6, 7.2) : rng.range(5.8, 6.6);
  const n = len(total);
  const core = stereo(n);
  const body = stereo(n);
  const tail = stereo(n);
  // 崩れの瞬間（at 秒・強さ g）。最後の瞬間が一番強い
  let hits;
  if (form === 'topple') hits = [{ at: rng.range(0.5, 0.85), g: 1 }];
  else if (form === 'pancake') {
    const count = rng.int(4, 6);
    hits = [];
    let t = 0;
    let gap = rng.range(0.3, 0.42);
    for (let k = 0; k < count; k++) {
      hits.push({ at: t, g: 0.5 + (0.5 * k) / (count - 1) });
      t += gap;
      gap *= rng.range(0.7, 0.85);
    }
  } else if (form === 'split') hits = [{ at: 0, g: 0.6 }, { at: rng.range(1.1, 1.7), g: 1 }];
  else hits = [{ at: 0, g: 1 }];
  const main = hits[hits.length - 1].at;
  // 倒れる前（topple）：骨組みが折れていくうめきと鉄骨のきしみ、ぱらぱら落ちる破片
  if (form === 'topple') {
    const base = rng.range(60, 75);
    const modes = [1, 1.57, 2.28, 3.71].map((r, k) => ({ f: base * r * rng.range(0.97, 1.03), tau: 0.25 / (1 + k * 0.45), gain: 1 / (1 + k * 0.4), wobble: rng.range(0.5, 1.8) }));
    addMono(body, groan(rng, { dur: main + 0.5, modes, drift: -rng.range(2, 4), slips: rng.int(5, 9), rough: 0.7, points: [[0, 0], [0.12, 0.7], [main, 1], [main + 0.5, 0]] }), 0, 0.45, rng.bi() * 0.2);
    addMono(body, creak(rng, { dur: main + 0.3, episodes: rng.int(2, 4), base: [rng.range(420, 520), rng.range(560, 760)], rate: [16, 60], slide: [-3, 1], len: [0.15, 0.5] }), 0, 0.4, rng.bi() * 0.4);
    snaps(rng, core, { start: 0, count: 6, window: main * 0.8, f: [900, 5000], amp: 0.5, spread: 0.8 });
    grains(rng, body, { start: 0.05, dur: main, rate: () => 60, amp: (u) => 0.18 + 0.15 * u, f: [500, 3000], tau: [0.003, 0.012], noisy: 0.9, spread: 0.9 });
  }
  const pile = stereo(n);
  for (const h of hits) {
    const a = len(h.at);
    // 芯：破断の破裂
    snaps(rng, core, { start: h.at, count: Math.max(4, Math.round(16 * h.g)), window: 0.28, f: [1500, 8000], amp: h.g, spread: 0.9 });
    addMono(core, noiseBurst(rng, { dur: 0.3, decay: 0.045, filters: [['hp', 900, 0.7]] }), a, 0.8 * h.g);
    // 胴：頭の強調（下がる正弦は 0.45 秒だけ）。階が落ちる型は、床が当たる鈍い雑音の打撃も
    addMono(body, subThump(rng, { dur: 0.45, f0: rng.range(72, 86), f1: rng.range(42, 50), glide: 0.12, attack: 0.003, decay: 0.12, drive: 1.8, punch: 0.25 }), a + len(0.02), 0.7 * h.g);
    if (form === 'pancake' || form === 'split') addMono(body, noiseThump(rng, { dur: 0.8, f: [140, 60], attack: 0.003, decay: 0.16, hp: 24 }), a, 0.85 * h.g);
    // 250Hz〜2kHz の砕ける層と高い粒（崩れの瞬間ごとに。階が次々に潰れる型は短く）
    const dd = (form === 'pancake' ? 1.3 : 3.4) * (0.6 + 0.4 * h.g);
    grains(rng, body, { start: h.at + 0.02, dur: dd, rate: (u) => (u < 0.1 ? 1300 * (u / 0.1) : 1300 * Math.exp(-(u - 0.1) * 4)) * h.g + 30, amp: (u) => 0.55 * (1 - u) ** 0.7 * h.g, f: [250, 2000], tau: [0.004, 0.028], noisy: 0.9, spread: 1 });
    grains(rng, body, { start: h.at + 0.02, dur: dd * 0.88, rate: (u) => 500 * Math.exp(-u * 3.5) * h.g + 20, amp: (u) => 0.4 * (1 - u) ** 0.8 * h.g, f: [1500, 5000], tau: [0.003, 0.015], noisy: 0.85, spread: 1 });
    // 落ちてくる塊
    const chunks = Math.round(rng.int(16, 26) * h.g * (form === 'pancake' ? 0.45 : 1));
    for (let k = 0; k < chunks; k++) {
      const t = h.at + 0.08 + (form === 'pancake' ? 1.2 : 2.8) * rng.next() ** 1.4;
      if (t >= total - 0.3) continue;
      const size = rng.range(0.25, 1);
      addMono(pile, chunkImpact(rng, { size, bounce: rng.chance(0.35) ? rng.range(0.2, 0.5) : 0 }), len(t), rng.range(0.35, 0.8) * (1 - 0.5 * Math.min(1, (t - h.at) / 3)), rng.bi() * 0.9);
    }
  }
  softclip(pile.l, 1.8);
  softclip(pile.r, 1.8);
  for (let i = 0; i < n; i++) {
    body.l[i] += pile.l[i] * 0.55;
    body.r[i] += pile.r[i] * 0.55;
  }
  // 雑音の地鳴り（25〜130Hz）：型ごとの膨らみ。一番強い瞬間の 0.5 秒後に山
  const last = hits[hits.length - 1].at;
  const rp =
    form === 'topple'
      ? [[0, 0], [main * 0.5, 0.12], [main, 0.25], [main + 0.12, 0.85], [main + 0.6, 1], [main + 2.6, 0.7], [main + 4.6, 0.2], [total, 0]]
      : form === 'pancake'
        ? [[0, 0], [0.1, 0.45], [last, 0.85], [last + 0.4, 1], [last + 2.2, 0.6], [last + 3.6, 0.2], [total, 0]]
        : form === 'split'
          ? [[0, 0], [0.1, 0.55], [0.5, 0.6], [main - 0.1, 0.3], [main + 0.12, 0.9], [main + 0.6, 1], [main + 2.6, 0.6], [main + 4.4, 0.15], [total, 0]]
          : [[0, 0], [0.12, 0.8], [0.6, 1], [2.8, 0.75], [5, 0.25], [total, 0]];
  addMono(body, rumble(rng, { dur: total, cutoff: 130, points: rp, modRate: 3.5, modDepth: 0.55 }), 0, 1);
  // 不協和な低い鳴り：一番強い瞬間から
  addMono(body, lowTones(rng, { dur: Math.min(4.2, total - main - 0.05), count: rng.int(3, 5), fLo: 34, fHi: 105, drift: [-2, -7], start: [0.05, 1.2], length: [1.0, 2.8] }), len(main + 0.05), 0.55, rng.bi() * 0.2);
  // 擦れて崩れる中域の砕け
  const gd = Math.min(3.6, total - main - 0.1) * (form === 'pancake' ? rng.range(0.6, 0.8) : 1);
  const grind = noiseBurst(rng, { dur: gd, attack: 0.08, decay: gd * 0.25, hold: 0.6, color: 'pink', filters: [['bp', rng.range(420, 700), 0.6], ['lp', 1600, 0.7]] });
  const jag = wander(rng, grind.length, 26, 0.15, 1);
  for (let i = 0; i < grind.length; i++) grind[i] *= jag[i];
  addMono(body, norm(grind), len(main + 0.04), 0.45, rng.bi() * 0.3);
  addMono(tail, rumble(rng, { dur: total, cutoff: 85, points: [[0, 0], [main + 1, 0.6], [main + 3.5, 0.45], [total, 0]], modRate: 1.8, modDepth: 0.5 }), 0, 0.75);
  grains(rng, tail, { start: main + 1.5, dur: total - main - 1.6, rate: (u) => 34 * (1 - u) ** 1.8 + 3, amp: (u) => 0.28 * (1 - u) ** 1.5, f: [400, 4500], tau: [0.003, 0.014], noisy: 0.85, spread: 1 });
  let audio = layers({ core, body, tail }, { core: -4, body: 0, tail: -5 });
  const wet = { crumble: 0.28, topple: 0.32, pancake: 0.24, split: 0.3 }[form];
  audio = addWet(padTail(audio, 2.6), ctx.ir.far, wet);
  return { audio, layers: { core: `fracture-burst×${hits.length}`, body: `${form}: hits ${hits.map((h) => h.at.toFixed(2)).join('/')}s+noise-rumble+low-tones+mid-debris+chunks+grind`, tail: 'rumble+trickle+far-reverb' } };
}

/** r05 までの崩落（遠い崩落は今もこれ）。 */
function collapseClassic(rng, ctx, { far = false } = {}) {
  const total = far ? 7.5 : 6.5;
  const n = len(total);
  const core = stereo(n);
  snaps(rng, core, { start: 0, count: far ? 6 : 16, window: 0.28, f: [1500, 8000], amp: 1, spread: 0.9 });
  addMono(core, noiseBurst(rng, { dur: 0.3, decay: 0.045, filters: [['hp', 900, 0.7]] }), 0, 0.8);
  // 遠い崩落は高い破裂が空気に吸われるので、崩れ始めの鈍い「ドン」（雑音の打撃）を芯にする
  if (far) addMono(core, noiseThump(rng, { dur: 1.2, f: [130, 70], attack: 0.004, decay: 0.3, hp: 26 }), 0, 1.2);
  const body = stereo(n);
  // 頭の強調：80Hz 付近から下がる正弦を 0.4 秒だけ
  const top = rng.range(72, 86);
  const bottom = rng.range(42, 50);
  addMono(body, subThump(rng, { dur: 0.45, f0: top, f1: bottom, glide: 0.12, attack: 0.003, decay: 0.12, drive: 1.8, punch: 0.25 }), len(0.02), 0.7);
  // 雑音の地鳴り（25〜130Hz）：崩れている間ずっと、揺れながら
  addMono(body, rumble(rng, { dur: total, cutoff: far ? 110 : 130, points: [[0, 0], [0.12, 0.8], [0.6, 1], [2.8, 0.75], [5, 0.25], [total, 0]], modRate: 3.5, modDepth: 0.55 }), 0, 1);
  // 不協和な低い鳴り：数本が別々に始まり、ゆっくり下がってばらつく
  addMono(body, lowTones(rng, { dur: 4.2, count: rng.int(3, 5), fLo: 34, fHi: 105, drift: [-2, -7], start: [0.05, 1.2], length: [1.0, 2.8] }), len(0.05), 0.55, rng.bi() * 0.2);
  // 250Hz〜2kHz の砕ける層：崩れ始めに密に、だんだん疎らに
  grains(rng, body, { start: 0.02, dur: 3.4, rate: (u) => (u < 0.1 ? 1300 * (u / 0.1) : 1300 * Math.exp(-(u - 0.1) * 4)) + 30, amp: (u) => 0.55 * (1 - u) ** 0.7, f: [250, 2000], tau: [0.004, 0.028], noisy: 0.9, spread: 1 });
  grains(rng, body, { start: 0.02, dur: 3.0, rate: (u) => 500 * Math.exp(-u * 3.5) + 20, amp: (u) => 0.4 * (1 - u) ** 0.8, f: [1500, 5000], tau: [0.003, 0.015], noisy: 0.85, spread: 1 });
  // 落ちてくるコンクリートの塊（雑音の打撃と塊の鳴り）
  // 重なった塊の山は柔らかく丸める（崩落の「量」を保ったまま、仕上げの制限器で潰さずに済むように）
  const chunks = far ? rng.int(8, 12) : rng.int(16, 26);
  const pile = stereo(n);
  for (let k = 0; k < chunks; k++) {
    const t = 0.08 + 2.8 * rng.next() ** 1.4;
    const size = rng.range(0.25, 1);
    addMono(pile, chunkImpact(rng, { size, bounce: rng.chance(0.35) ? rng.range(0.2, 0.5) : 0 }), len(t), rng.range(0.35, 0.8) * (1 - 0.5 * (t / 3)), rng.bi() * 0.9);
  }
  softclip(pile.l, 1.8);
  softclip(pile.r, 1.8);
  for (let i = 0; i < n; i++) {
    body.l[i] += pile.l[i] * 0.55;
    body.r[i] += pile.r[i] * 0.55;
  }
  // 擦れて崩れる中域の砕け（300Hz〜1.2kHz の雑音を細かく揺らす）
  const grind = noiseBurst(rng, { dur: 3.6, attack: 0.08, decay: 0.9, hold: 0.6, color: 'pink', filters: [['bp', rng.range(420, 700), 0.6], ['lp', 1600, 0.7]] });
  const jag = wander(rng, grind.length, 26, 0.15, 1);
  for (let i = 0; i < grind.length; i++) grind[i] *= jag[i];
  addMono(body, norm(grind), len(0.04), 0.45, rng.bi() * 0.3);
  const tail = stereo(n);
  addMono(tail, rumble(rng, { dur: total, cutoff: 85, points: [[0, 0], [1, 0.6], [3.5, 0.45], [total, 0]], modRate: 1.8, modDepth: 0.5 }), 0, 0.75);
  grains(rng, tail, { start: 1.5, dur: total - 1.6, rate: (u) => 34 * (1 - u) ** 1.8 + 3, amp: (u) => 0.28 * (1 - u) ** 1.5, f: [400, 4500], tau: [0.003, 0.014], noisy: 0.85, spread: 1 });
  // 遠い崩落も芯は残す（-14dB では立ち上がりが 40ms 遅れて聞こえた）。高域は後で落とす
  let audio = layers({ core, body, tail }, far ? { core: -8, body: 0, tail: -2 } : { core: -4, body: 0, tail: -5 });
  if (far) {
    filt(audio.l, [['lp', 1900, 0.7], ['lp', 2600, 0.7]]);
    filt(audio.r, [['lp', 1900, 0.7], ['lp', 2600, 0.7]]);
  }
  audio = addWet(padTail(audio, far ? 3.4 : 2.6), ctx.ir.far, far ? 0.55 : 0.28);
  return { audio, layers: { core: 'fracture-burst', body: `head ${Math.round(top)}→${Math.round(bottom)}Hz(0.4s)+noise-rumble+low-tones+mid-debris+${chunks}-chunks+grind`, tail: `rumble+trickle+far-reverb${far ? '(lp)' : ''}` } };
}

/**
 * ガラス：芯＝割れる瞬間の高い破裂、胴＝飛び散る破片（不協和な倍音）、尾＝地面に落ちて鳴る細かな音。
 * r05-audio：指摘「ガラスは模様の相関 0.91 のまま、3分で 127〜450 回鳴る」 割れ方の型を4つにし（大きな一枚・小窓・二枚続けて・遅れて降る）、
 * 破片の数・尾の長さ・残響（中くらいの響き）の量を変化ごとに散らす（変化は 5→8 個）。
 * r06-audio：指摘「ガラスは模様の相関が 0.855 から下がっていない」 型の差を広げた。大きな一枚（burst）は低めの破片が多く長く、
 * 板が砕ける重い中域と鈍い当たりを足して残響も多く。細かい小窓（tinkle）は高い破片だけが短く散り、破裂の雑音も残響も無い。
 */
const GLASS_FORMS = ['burst', 'tinkle', 'double', 'cascade'];

export function glass(rng, ctx, variant = 0) {
  const form = GLASS_FORMS[variant % GLASS_FORMS.length];
  const total = form === 'cascade' ? rng.range(2.8, 3.4) : form === 'tinkle' ? rng.range(0.9, 1.3) : form === 'burst' ? rng.range(2.8, 3.4) : rng.range(2.2, 3);
  const n = len(total);
  const core = stereo(n);
  const body = stereo(n);
  // 1枚が割れる：鋭い破裂と、飛び散る破片の雨。shards は破片の多さ、g は強さ。f は破片の高さの幅、burst は破裂の雑音の量、crash は板が砕ける重さ
  const pane = (at, g, shards, dur, { f = [2200, 9500], burst = 1, crash = 0 } = {}) => {
    const a = len(at);
    const c = stereo(n);
    if (burst > 0) addMono(c, noiseBurst(rng, { dur: 0.12, decay: rng.range(0.01, 0.02), filters: [['hp', 3400, 0.7], ['peak', rng.range(5500, 7500), 1, 4]] }), 0, 0.7 * burst, rng.bi() * 0.2);
    snaps(rng, c, { start: 0, count: rng.int(2, 6), window: rng.range(0.015, 0.04), f: [Math.max(3800, f[0]), Math.max(9500, f[1])], amp: 0.8, ring: [0.002, 0.008] });
    const b = stereo(n);
    grains(rng, b, { start: 0.003, dur, rate: (u) => shards * (1 - u) ** 2.2 + 20, amp: (u) => 0.32 * (1 - u) ** 0.8, f, tau: [0.012, 0.09], partials: [1, 2.32, 4.25], partialGain: 0.6, noisy: rng.range(0.1, 0.45), spread: 1 });
    if (burst > 0) addMono(b, noiseBurst(rng, { dur: 0.25, decay: rng.range(0.03, 0.09), filters: [['bp', rng.range(2500, 4000), 0.9]] }), 0, rng.range(0.2, 0.55) * burst);
    if (crash > 0) {
      // 大きな板が砕ける重さ：中域の砕けの塊と、窓枠に当たる鈍い音
      addMono(b, noiseBurst(rng, { dur: 0.6, attack: 0.002, decay: rng.range(0.12, 0.2), color: 'pink', filters: [['bp', rng.range(700, 1200), 0.8], ['lowShelf', 300, 3]] }), 0, 0.6 * crash, rng.bi() * 0.3);
      addMono(b, noiseThump(rng, { dur: 0.4, f: [320, 130], attack: 0.002, decay: 0.05, color: 'pink', hp: 60 }), 0, 0.5 * crash);
    }
    for (let i = 0; i + a < n; i++) {
      core.l[a + i] += c.l[i] * g;
      core.r[a + i] += c.r[i] * g;
      body.l[a + i] += b.l[i] * g;
      body.r[a + i] += b.r[i] * g;
    }
  };
  if (form === 'burst') pane(0, 1, rng.range(1300, 1700), rng.range(1.1, 1.5), { f: [1400, 8000], crash: 1 });
  else if (form === 'tinkle') pane(0, 0.6, rng.range(120, 240), rng.range(0.25, 0.45), { f: [4200, 11000], burst: 0 });
  else if (form === 'double') {
    pane(0, 1, rng.range(500, 800), rng.range(0.5, 0.8));
    pane(rng.range(0.09, 0.26), rng.range(0.55, 0.85), rng.range(400, 700), rng.range(0.5, 0.8));
  } else {
    pane(0, 0.9, rng.range(450, 700), rng.range(0.6, 0.9));
    // 遅れて降る：上の階の窓から、少し遅れて破片の二の波が降ってくる
    grains(rng, body, { start: rng.range(0.3, 0.75), dur: rng.range(0.7, 1.1), rate: (u) => 480 * (1 - u) ** 2 + 15, amp: (u) => 0.3 * (1 - u), f: [2400, 9000], tau: [0.012, 0.08], partials: [1, 2.32, 4.25], partialGain: 0.6, noisy: 0.15, spread: 1 });
  }
  const tail = stereo(n);
  const tl = total - 0.4;
  const tr = form === 'tinkle' ? rng.range(10, 20) : form === 'burst' ? rng.range(30, 50) : rng.range(16, 40);
  const tf = form === 'tinkle' ? [4500, 10000] : form === 'burst' ? [1800, 7500] : [2500, 8500];
  grains(rng, tail, { start: form === 'tinkle' ? rng.range(0.08, 0.18) : rng.range(0.2, 0.45), dur: tl, rate: (u) => tr * (1 - u) ** 1.5 + 2, amp: (u) => 0.14 * (1 - u), f: tf, tau: [0.02, 0.12], partials: [1, 2.76, 5.4], partialGain: 0.5, noisy: 0.05, spread: 1 });
  let audio = layers({ core, body, tail }, { core: -3, body: 0, tail: form === 'tinkle' ? rng.range(-10, -6) : rng.range(-8, -2) });
  // 残響の量も変える（通りの奥へ抜ける割れと、すぐ止む割れ）。大きな一枚は多く、小窓は無し
  const wet = form === 'tinkle' ? 0 : form === 'burst' ? rng.range(0.16, 0.3) : rng.range(0, 0.22);
  if (wet > 0.04 && ctx?.ir?.mid) audio = addWet(padTail(audio, 0.6), ctx.ir.mid, wet);
  return { audio, layers: { core: `shatter(${form})`, body: `shards(inharmonic)${form === 'burst' ? '+pane-crash' : ''}+crunch`, tail: `tinkle ${tl.toFixed(1)}s+wet ${wet.toFixed(2)}` } };
}
