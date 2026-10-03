// OWNER: audio-tools
// 炎の音：ブレスの出始め・持続（繰り返し）・終わり、建物の着火と燃え広がり、燃える街の下地（近・遠の繰り返し）、空を飛ぶ風。
// 炎は「噴き出す流れ（動く帯域の雑音）＋低い唸り＋はぜ」の3つで作る。持続の音は makeLoop で終わりを頭へ重ね、継ぎ目を消す。
import { addMono, brown, dcBlock, env, filt, len, mul, pink, stereo, svf, wander } from '../lib/dsp.mjs';
import { makeLoop } from '../lib/master.mjs';
import { crackle, layers, noiseBurst, noiseThump, norm, snaps, subThump, toStereo, whoosh } from '../lib/sfxkit.mjs';

/** 噴き出す炎の流れ：3つの帯域の中心をゆっくり動かし、乱流で細かく揺らす（ステレオ）。 */
function jet(rng, seconds, { low = 1, bright = 1 } = {}) {
  const n = len(seconds);
  const out = stereo(n);
  const bands = [
    { lo: 170, hi: 330, q: 0.7, g: 1 * low },
    { lo: 480, hi: 1100, q: 0.9, g: 0.8 },
    { lo: 1400, hi: 3300, q: 1.1, g: 0.45 * bright },
  ];
  for (const side of ['l', 'r']) {
    for (const b of bands) {
      const src = pink(rng, n);
      const f = wander(rng, n, 0.8, b.lo, b.hi);
      const y = svf(src, f, b.q, 'bp');
      const turb = wander(rng, n, 13, 0.55, 1.2);
      for (let i = 0; i < n; i++) out[side][i] += y[i] * turb[i] * b.g;
    }
  }
  norm(out.l);
  norm(out.r);
  return out;
}

/** 低い唸り（炎の塊が空気を押す音）。 */
function lowRoar(rng, seconds, cutoff = 95) {
  const n = len(seconds);
  const s = brown(rng, n);
  filt(s, [['lp', cutoff, 0.8], ['hp', 25, 0.7]]);
  const am = wander(rng, n, 5, 0.5, 1.1);
  mul(s, am);
  return norm(s);
}

/**
 * ブレスの出始め：芯＝火が付く破裂と噴き出しの息、胴＝急に立ち上がる流れと低い圧、尾＝持続の音へ引き継ぐ。
 * r02-audio：指摘「出始めの変化どうしの包絡の相関0.992」 変化ごとに長さ（±25%）・圧の高さ（±15%）・立ち上がりの形・はぜの密度を変える。
 */
export function breathStart(rng, M) {
  const B = M.breath;
  const k = rng.range(0.76, 1.25);
  const p = rng.range(0.86, 1.15);
  const total = 1.6 * k;
  const n = len(total);
  const core = stereo(n);
  snaps(rng, core, { start: 0, count: rng.int(1, 4), window: rng.range(0.01, 0.05), f: [1800, 4200], amp: 0.8 });
  addMono(core, noiseBurst(rng, { dur: 0.25, attack: 0.004, decay: rng.range(0.04, 0.09), filters: [['hp', 2400 * p, 0.7]] }), 0, 0.5);
  const body = jet(rng, total, { low: B.low });
  // 立ち上がり：一気に噴く（速い）か、ためてから吹き出す（遅い）か
  const rise = rng.range(0.1, 0.3) * k;
  const e = env(n, [[0, 0], [0.04, rng.range(0.4, 0.7)], [rise, 1], [total * rng.range(0.6, 0.75), rng.range(0.6, 0.85)], [total, 0]]);
  const sweep = whoosh(rng, { dur: total, fPath: [[0, 250 * p], [rise + 0.04, rng.range(800, 1100) * p], [0.8 * k, 700 * p]], qPath: [[0, rng.range(0.55, 0.9)]], points: [[0, 0], [0.06, 1], [0.6 * k, 0.6], [total, 0]] });
  for (let i = 0; i < n; i++) {
    body.l[i] = body.l[i] * e[i] * B.jet + sweep[i] * 0.6;
    body.r[i] = body.r[i] * e[i] * B.jet + sweep[i] * 0.6;
  }
  addMono(body, noiseThump(rng, { dur: 0.8, f: [150 * p, 70 * p], attack: 0.004, decay: 0.18 * k, hp: 28 }), 0, 0.8 * B.low);
  addMono(body, subThump(rng, { dur: 0.3, f0: 64 * p, f1: 42 * p, glide: 0.05, attack: 0.004, decay: 0.06, drive: 1.6 }), 0, 0.35 * B.low);
  const tail = stereo(n);
  const dens = rng.range(0.6, 1.5);
  crackle(rng, tail, { start: 0.08, dur: total - 0.1, rate: (u) => (70 * (1 - u) + 10) * dens, amp: 0.5 * B.crackle });
  return { audio: layers({ core, body, tail }, { core: -4, body: 0, tail: -6 }), layers: { core: 'ignite-snap+hiss', body: `jet-rise(${Math.round(rise * 1000)}ms)+low-thump(noise)`, tail: 'crackle' } };
}

/** ブレスの持続（seconds 秒ちょうどの輪）。 */
export function breathLoop(rng, M, seconds = 6) {
  const B = M.breath;
  const extra = 0.6;
  const n = len(seconds + extra);
  const s = jet(rng, seconds + extra, { low: B.low });
  addMono(s, lowRoar(rng, seconds + extra), 0, 0.55 * B.low);
  crackle(rng, s, { start: 0, dur: seconds + extra, rate: 48, amp: 0.45 * B.crackle });
  dcBlock(s.l);
  dcBlock(s.r);
  const audio = makeLoop({ l: s.l.subarray(0, n), r: s.r.subarray(0, n) }, seconds, extra * 0.9);
  return { audio, loop: true, layers: { core: 'crackle', body: 'jet(3 moving bands)', tail: 'low-roar' } };
}

/** ブレスの終わり：流れがしぼみ、炎がはためいて消え、はぜが残る。 */
export function breathStop(rng, M) {
  const B = M.breath;
  const total = 2;
  const n = len(total);
  const body = jet(rng, total, { low: B.low * 0.8, bright: 0.7 });
  const e = env(n, [[0, 0.9], [0.5, 0.35], [1.2, 0.08], [total, 0]]);
  const flutter = wander(rng, n, 24, 0.4, 1);
  for (let i = 0; i < n; i++) {
    body.l[i] *= e[i] * flutter[i];
    body.r[i] *= e[i] * flutter[i];
  }
  const core = toStereo(whoosh(rng, { dur: 0.7, fPath: [[0, 800], [0.6, 260]], qPath: [[0, 0.8]], points: [[0, 1], [0.6, 0]] }));
  const tail = stereo(n);
  crackle(rng, tail, { start: 0.1, dur: total - 0.15, rate: (u) => 40 * (1 - u) ** 2 + 2, amp: 0.5 * B.crackle });
  return { audio: layers({ core, body, tail }, { core: -6, body: 0, tail: -4 }), layers: { core: 'collapse-whoosh', body: 'fading-jet+flutter', tail: 'crackle' } };
}

/**
 * 着火（建物に火が付く）：芯＝燃料が一気に燃える鈍い「ボッ」、胴＝立ち上がる炎、尾＝はぜ。spread で燃え広がり（軽い）。
 * r02-audio：変化ごとに長さ（±25%）・「ボッ」の高さ（±15%）・炎の立ち上がりの速さ・二度目の火の手の有無を変える。
 */
/** 着火の形の型（変化の番号で必ず全部の型が出る）：flash＝一気に燃えてすぐ落ち着く、build＝じわじわ燃え上がる、double＝二度燃え上がる */
const IGNITE_SHAPES = ['flash', 'build', 'double', 'build-long'];

export function ignite(rng, { spread = false, variant = 0 } = {}) {
  const shape = IGNITE_SHAPES[variant % IGNITE_SHAPES.length];
  const k = shape === 'build-long' ? rng.range(1.15, 1.3) : shape === 'flash' ? rng.range(0.72, 0.9) : rng.range(0.85, 1.15);
  const p = rng.range(0.86, 1.15);
  const total = (spread ? 2.2 : 2.6) * k;
  const n = len(total);
  const core = stereo(n);
  if (!spread) addMono(core, noiseThump(rng, { dur: 0.7, f: [rng.range(160, 220) * p, 80 * p], attack: 0.003, decay: 0.11 * k, hp: 30 }), 0, 0.9);
  addMono(core, noiseBurst(rng, { dur: 0.25, attack: 0.002, decay: 0.035, color: 'pink', filters: [['lp', 900 * p, 0.7]] }), 0, 0.8);
  const riseT = (spread ? 0.35 : 0.5) * k * (shape === 'flash' ? rng.range(0.25, 0.4) : shape.startsWith('build') ? rng.range(1.3, 1.7) : rng.range(0.5, 0.8));
  const body = toStereo(
    whoosh(rng, {
      dur: total,
      fPath: [[0, (spread ? 300 : 200) * p], [riseT, rng.range(1000, 1500) * p], [total, 500 * p]],
      qPath: [[0, rng.range(0.55, 0.9)]],
      points: shape === 'flash' ? [[0, 0], [0.05, 0.8], [riseT, 1], [riseT + 0.35, 0.3], [total, 0]] : [[0, 0], [0.08, rng.range(0.3, 0.5)], [riseT, 1], [riseT + (total - riseT) * rng.range(0.3, 0.7), rng.range(0.4, 0.7)], [total, 0]],
    }),
    rng.bi() * 0.3,
  );
  // 二度目の火の手（窓の奥の燃料に燃え移る）：来る時刻と強さを変化ごとに変える
  const flares = shape === 'double' ? 2 : shape === 'flash' ? 0 : rng.int(0, 1);
  for (let f = 0; f < flares; f++) {
    const t2 = (shape === 'double' ? [0.55, 1.1][f] + rng.range(-0.1, 0.1) : rng.range(0.3, 1.4)) * k;
    addMono(body, noiseBurst(rng, { dur: 0.6, attack: 0.02, decay: rng.range(0.1, 0.25), color: 'pink', filters: [['bp', rng.range(300, 700) * p, 0.7]] }), len(t2), shape === 'double' ? rng.range(0.8, 1.1) : rng.range(0.4, 0.8), rng.bi() * 0.4);
  }
  const tail = stereo(n);
  // はぜ：燃え上がって増えていく（grow）か、すぐ落ち着く（settle）か
  const grow = shape.startsWith('build');
  const cr = (spread ? 60 : 85) * rng.range(0.6, 1.4);
  crackle(rng, tail, { start: 0.15, dur: total - 0.2, rate: (u) => (grow ? cr * Math.sin(Math.PI * Math.min(1, u * 1.3)) : cr * (1 - u) ** 2) + 6, amp: 0.55 });
  return { audio: layers({ core, body, tail }, { core: spread ? -8 : -2, body: 0, tail: rng.range(-6, -2) }), layers: { core: spread ? 'pop' : 'whump(noise)+pop', body: `${shape}-flame(${Math.round(riseT * 1000)}ms)+${flares}-flares`, tail: grow ? 'crackle(grow)' : 'crackle(settle)' } };
}

/** 燃える街の下地（繰り返し）。far で遠い（低く暗い唸りだけ）。 */
export function fireBed(rng, { far = false, seconds = 8 } = {}) {
  const extra = 0.8;
  const n = len(seconds + extra);
  const s = stereo(n);
  if (!far) {
    crackle(rng, s, { start: 0, dur: seconds + extra, rate: 26, amp: 0.55 });
    const hiss = pink(rng, n);
    filt(hiss, [['hp', 1500, 0.7]]);
    mul(hiss, wander(rng, n, 0.6, 0.3, 1));
    addMono(s, norm(hiss), 0, 0.12);
  }
  const roar = pink(rng, n);
  filt(roar, far ? [['lp', 320, 0.7], ['lp', 420, 0.7]] : [['bp', 420, 0.7]]);
  mul(roar, wander(rng, n, far ? 0.5 : 1.4, 0.45, 1));
  addMono(s, norm(roar), 0, far ? 0.8 : 0.45);
  addMono(s, lowRoar(rng, seconds + extra, far ? 70 : 90), 0, far ? 0.6 : 0.3);
  dcBlock(s.l);
  dcBlock(s.r);
  const audio = makeLoop(s, seconds, extra * 0.9);
  return { audio, loop: true, layers: { core: far ? 'none' : 'crackle', body: 'roar', tail: 'low-roar' } };
}

/** 空の風（繰り返し）：流れる帯域と突風、かすかな笛のような鳴り。飛ぶ速さで音量が変わる。 */
export function wind(rng, { seconds = 10 } = {}) {
  const extra = 1;
  const n = len(seconds + extra);
  const s = stereo(n);
  for (const side of ['l', 'r']) {
    const a = pink(rng, n);
    const y1 = svf(a, wander(rng, n, 0.35, 250, 620), 0.8, 'bp');
    const b = pink(rng, n);
    const y2 = svf(b, wander(rng, n, 0.25, 700, 1300), 1.2, 'bp');
    const gust = wander(rng, n, 0.22, 0.35, 1);
    const w = pink(rng, n);
    const y3 = svf(w, wander(rng, n, 0.15, 900, 1500), 26, 'bp');
    for (let i = 0; i < n; i++) s[side][i] = (y1[i] + y2[i] * 0.6) * gust[i] + y3[i] * 0.35 * gust[i];
    norm(s[side]);
  }
  dcBlock(s.l);
  dcBlock(s.r);
  const audio = makeLoop(s, seconds, extra * 0.9);
  return { audio, loop: true, layers: { core: 'none', body: 'moving-bands+gusts', tail: 'whistle' } };
}
