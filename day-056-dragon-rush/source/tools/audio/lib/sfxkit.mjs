// OWNER: audio-tools
// 効果音の部品：重い衝撃の圧（下降する正弦）、雑音の塊、砕ける粒（粒状合成）、地鳴り、ひびの破裂、きしみ、炎のはぜ、風切り。
// r02-audio で足した部品：雑音の打撃（noiseThump）、ばらつく低い鳴り（lowTones）、コンクリートの塊（chunkImpact）、鉄骨のきしみ（creak）、地面の素材（GROUND）。
// 下降する正弦（subThump）は頭の数十ms の強調だけに使い、胴の低音は雑音で作る（低域が1本の音に寄るとシンセのキックに聞こえる）。
// 1つの効果音は「芯（立ち上がり）・胴（本体の低さと厚み）・尾（余韻）」の3層をこの部品で別々に作り、layers() で混ぜる。
import { Biquad, SR, TAU, brown, clamp, decayEnv, env, fadeEdges, filt, len, mul, pink, softclip, stereo, svf, sweepSine, wander, white } from './dsp.mjs';

/** 重い衝撃の圧：f0→f1 へ下がる正弦を柔らかく歪ませ、小さなスピーカーでも聞こえる倍音を足す。 */
export function subThump(rng, { dur, f0, f1, glide = 0.08, attack = 0.003, decay = 0.25, drive = 1.8, punch = 0.5 }) {
  const n = len(dur);
  const s = sweepSine(n, f0, f1, glide);
  mul(s, decayEnv(n, attack, decay));
  // 胴の「ドン」：2.4倍の高さで速く消える正弦。30〜60Hz の圧は小さなスピーカーでは出ないので、重さをこの帯域でも伝える
  if (punch > 0) {
    const p = sweepSine(n, f0 * 2.4, f1 * 2.2, glide * 0.8);
    mul(p, decayEnv(n, attack, decay * 0.4));
    for (let i = 0; i < n; i++) s[i] += p[i] * punch;
  }
  softclip(s, drive);
  return norm(fadeEdges(s, 0, 0.008));
}

/** 最大値を peak に揃える（部品どうしの音量を層の dB で決められるように）。 */
export function norm(buf, peak = 1) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
  if (p > 0) for (let i = 0; i < buf.length; i++) buf[i] *= peak / p;
  return buf;
}

/** 雑音の塊（最大値 1）。filters は dsp.filt の形。color は white・pink・brown。 */
export function noiseBurst(rng, { dur, attack = 0.001, decay = 0.05, hold = 0, color = 'white', filters = [] }) {
  const n = len(dur);
  const src = color === 'pink' ? pink(rng, n) : color === 'brown' ? brown(rng, n) : white(rng, n);
  filt(src, filters);
  mul(src, decayEnv(n, attack, decay, hold));
  return norm(fadeEdges(src, 0, 0.008));
}

/**
 * 砕ける粒：減衰する短い音（小石・破片・ガラス片）をポアソン過程で置く。
 * rate(u) と amp(u) は 0〜1 の進み u を受ける関数。partials は破片の倍音の比（ガラスは不協和な比）。
 */
export function grains(rng, out, { start = 0, dur, rate, amp, f, tau, spread = 0.8, noisy = 0.75, partials = [1, 2.7], partialGain = 0.35 }) {
  let t = 0;
  const total = out.l.length;
  let guard = 0;
  while (t < dur && guard++ < 200000) {
    const u = t / dur;
    const r = Math.max(0.01, rate(u));
    t += -Math.log(Math.max(1e-9, rng.next())) / r;
    if (t >= dur) break;
    const a = amp(t / dur) * rng.range(0.25, 1) ** 1.6;
    const freq = rng.logRange(f[0], f[1]);
    const tt = rng.logRange(tau[0], tau[1]);
    const m = Math.min(len(tt * 5), 12000);
    const at = Math.round((start + t) * SR);
    if (at >= total) break;
    const pan = rng.bi() * spread;
    const gl = Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((pan + 1) * Math.PI) / 4);
    const k = Math.exp(-1 / (tt * SR));
    if (rng.chance(noisy)) {
      // 砕ける音：短い雑音を帯域で絞る
      const bq = new Biquad().bp(freq, rng.range(1.5, 4));
      let e = 1;
      for (let i = 0; i < m && at + i < total; i++) {
        const v = bq.process(rng.bi()) * e * a * 2.2;
        e *= k;
        out.l[at + i] += v * gl;
        out.r[at + i] += v * gr;
      }
    } else {
      // 鳴る破片：減衰する正弦を数本
      const ph = partials.map(() => rng.next());
      // 高い倍音が標本化の上限（24kHz）を超えると低い音に折り返すので、18kHz より上の倍音は鳴らさない
      const rs = partials.map((p) => p * rng.range(0.94, 1.06)).map((r) => (freq * r < 18000 ? r : 0));
      let e = 1;
      for (let i = 0; i < m && at + i < total; i++) {
        let v = 0;
        for (let p = 0; p < rs.length; p++) if (rs[p] > 0) v += Math.sin(TAU * (ph[p] + (freq * rs[p] * i) / SR)) * (p === 0 ? 1 : partialGain / p) * (p === 0 ? 1 : e);
        v *= e * a;
        e *= k;
        out.l[at + i] += v * gl;
        out.r[at + i] += v * gr;
      }
    }
  }
  return out;
}

/** 地鳴り：ブラウン雑音を低域で絞り、ゆっくり揺らす。points は包絡の折れ線。 */
export function rumble(rng, { dur, cutoff = 110, points, modRate = 3, modDepth = 0.5, q = 0.9 }) {
  const n = len(dur);
  const s = brown(rng, n);
  filt(s, [['lp', cutoff, q], ['lp', cutoff * 1.4, 0.7], ['hp', 22, 0.7]]);
  let p = 0;
  for (let i = 0; i < n; i++) p = Math.max(p, Math.abs(s[i]));
  const mod = wander(rng, n, modRate, 1 - modDepth, 1 + modDepth);
  const e = env(n, points);
  for (let i = 0; i < n; i++) s[i] = (s[i] / (p || 1)) * mod[i] * e[i];
  return fadeEdges(s, 0, 0.008);
}

/** ひびの破裂：ごく短い雑音と、帯域の共鳴の鳴き（数ms〜十数ms）を窓の中にいくつか置く。 */
export function snaps(rng, out, { start = 0, count, window, f = [1500, 6000], amp = 1, spread = 0.5, ring = [0.003, 0.012] }) {
  for (let s = 0; s < count; s++) {
    const t = start + (s === 0 ? 0 : rng.range(0, window));
    const at = Math.round(t * SR);
    const tt = rng.logRange(ring[0], ring[1]);
    const m = len(tt * 6);
    const burst = new Float32Array(m);
    const clickLen = Math.round(rng.range(0.0004, 0.0018) * SR);
    for (let i = 0; i < clickLen; i++) burst[i] = rng.bi() * (1 - i / clickLen);
    const bq = new Biquad().bp(rng.logRange(f[0], f[1]), rng.range(6, 18));
    const k = Math.exp(-1 / (tt * SR));
    let e = 1;
    for (let i = 0; i < m; i++) {
      burst[i] = burst[i] * 0.6 + bq.process(burst[i]) * 3.5 * e;
      e *= k;
    }
    const a = amp * (s === 0 ? 1 : rng.range(0.35, 0.9));
    const pan = rng.bi() * spread;
    const gl = Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < m && at + i < out.l.length; i++) {
      out.l[at + i] += burst[i] * a * gl;
      out.r[at + i] += burst[i] * a * gr;
    }
  }
  return out;
}

/**
 * きしみ・うめき：金属やコンクリートの固有の鳴り（modes の周波数）を、摩擦（揺れる雑音＋ときどきの滑り）でこする。
 * drift は全体で下がる半音の量（傾いていく重さ）。
 */
export function groan(rng, { dur, modes, drift = -2, slips = 6, rough = 0.6, points }) {
  const n = len(dur);
  const ex = pink(rng, n);
  filt(ex, [['lp', 900, 0.7]]);
  const pressure = wander(rng, n, 2.5, 0.15, 1);
  for (let i = 0; i < n; i++) ex[i] *= pressure[i] * rough;
  for (let s = 0; s < slips; s++) {
    const at = rng.int(0, n - 1);
    const m = len(rng.range(0.004, 0.03));
    const a = rng.range(0.6, 2.2);
    for (let i = 0; i < m && at + i < n; i++) ex[at + i] += rng.bi() * a * (1 - i / m);
  }
  const out = new Float32Array(n);
  for (const md of modes) {
    const r = Math.exp(-1 / (md.tau * SR));
    let y1 = 0;
    let y2 = 0;
    const g = md.gain * (1 - r);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const f = md.f * 2 ** ((drift * u + 0.15 * Math.sin(TAU * u * md.wobble)) / 12);
      const c1 = 2 * r * Math.cos((TAU * f) / SR);
      const y = c1 * y1 - r * r * y2 + ex[i] * g;
      y2 = y1;
      y1 = y;
      out[i] += y;
    }
  }
  norm(out);
  softclip(out, 1.4);
  mul(out, env(n, points));
  return norm(out);
}

/** 炎のはぜ：小さな破裂音（多くは小さく、まれに大きい）を左右に散らして置く。 */
export function crackle(rng, out, { start = 0, dur, rate, amp = 1, f = [900, 5000], spread = 0.8 }) {
  let t = 0;
  let guard = 0;
  while (t < dur && guard++ < 100000) {
    const r = Math.max(0.05, typeof rate === 'number' ? rate : rate(t / dur));
    t += -Math.log(Math.max(1e-9, rng.next())) / r;
    if (t >= dur) break;
    const at = Math.round((start + t) * SR);
    const big = rng.chance(0.08);
    const m = len(big ? rng.range(0.004, 0.012) : rng.range(0.0005, 0.003));
    const a = amp * (big ? rng.range(0.6, 1) : rng.range(0.05, 0.4)) * (typeof rate === 'number' ? 1 : 1);
    const bq = new Biquad().hp(rng.logRange(f[0], f[1]), 0.8);
    const pan = rng.bi() * spread;
    const gl = Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < m && at + i < out.l.length; i++) {
      const v = bq.process(rng.bi()) * a * (1 - i / m) ** 2;
      out.l[at + i] += v * gl;
      out.r[at + i] += v * gr;
    }
  }
  return out;
}

/** 風切り・噴き出し：雑音を、動く帯域通過（fPath）に通す。qPath と points も折れ線。 */
export function whoosh(rng, { dur, fPath, qPath = [[0, 1.2]], points, color = 'pink' }) {
  const n = len(dur);
  const src = color === 'white' ? white(rng, n) : color === 'brown' ? brown(rng, n) : pink(rng, n);
  const f = env(n, fPath, 'exp');
  const q = env(n, qPath);
  const y = svf(src, f, q, 'bp');
  mul(y, env(n, points));
  return norm(y);
}

/** 3層を混ぜる。layers は { core, body, tail }（それぞれステレオか null）、gains は dB。長さは一番長い層に合わせる。 */
export function layers(parts, gains = {}) {
  const n = Math.max(...Object.values(parts).filter(Boolean).map((p) => p.l.length));
  const out = stereo(n);
  for (const [name, p] of Object.entries(parts)) {
    if (!p) continue;
    const g = 10 ** ((gains[name] ?? 0) / 20);
    for (let i = 0; i < p.l.length; i++) {
      out.l[i] += p.l[i] * g;
      out.r[i] += p.r[i] * g;
    }
  }
  return out;
}

/** モノラルをステレオへ（左右に少しだけ違う遅れで広げる）。 */
export function widen(m, rng, spread = 0.3) {
  const s = stereo(m.length);
  const d = Math.round(rng.range(0.0003, 0.0011) * SR * spread * 3);
  for (let i = 0; i < m.length; i++) {
    s.l[i] = m[i];
    s.r[i] = i >= d ? m[i - d] * 0.97 + m[i] * 0.03 : m[i] * 0.03;
  }
  return s;
}

export const toStereo = (m, pan = 0) => {
  const s = stereo(m.length);
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * Math.SQRT2;
  const gr = Math.sin(a) * Math.SQRT2;
  for (let i = 0; i < m.length; i++) {
    s.l[i] = m[i] * gl;
    s.r[i] = m[i] * gr;
  }
  return s;
};

/** モノラルを、時間で動く定位（panPath の折れ線、-1〜1）でステレオにする。振りの向きを出すのに使う。 */
export function panMove(m, panPath) {
  const s = stereo(m.length);
  const p = env(m.length, panPath);
  for (let i = 0; i < m.length; i++) {
    const a = ((clamp(p[i], -1, 1) + 1) * Math.PI) / 4;
    s.l[i] = m[i] * Math.cos(a) * Math.SQRT2;
    s.r[i] = m[i] * Math.sin(a) * Math.SQRT2;
  }
  return s;
}

// ------------------------------------------------------------ r02-audio：胴の低音を正弦の下降から雑音の打撃と地鳴りへ

/**
 * 雑音の打撃（最大値 1）：ブラウン雑音を f Hz で絞った短い塊。下降する正弦（シンセのキック）と違い、低域が1本の音に寄らない。
 * f は遮断周波数（数か [始め, 終わり] の組。組なら時間で下がる）、decay は時定数（秒）。
 */
export function noiseThump(rng, { dur, f = 90, attack = 0.003, decay = 0.15, hold = 0, color = 'brown', q = 0.8, hp = 22 }) {
  const n = len(dur);
  const src = color === 'pink' ? pink(rng, n) : brown(rng, n);
  const [fa, fb] = Array.isArray(f) ? f : [f, f];
  const fPath = new Float32Array(n);
  for (let i = 0; i < n; i++) fPath[i] = fb + (fa - fb) * Math.exp(-i / (0.08 * SR));
  const y = svf(src, fPath, q, 'lp');
  filt(y, [['lp', Math.max(fa, fb) * 1.6, 0.7], ['hp', hp, 0.7]]);
  mul(y, decayEnv(n, attack, decay, hold));
  return norm(fadeEdges(y, 0, 0.008));
}

/**
 * 不協和な低い鳴りを数本（最大値 1）：雑音で共鳴をたたき、それぞれがゆっくり下がってばらつく。崩れ続けるうなり。
 * 1本ごとに始まり・長さ・下がり幅・揺れが違うので、低域のエネルギーが1つの周波数に集まらない。
 */
export function lowTones(rng, { dur, count = 4, fLo = 34, fHi = 110, drift = [-2, -6], q = [5, 9], start = [0, 0.9], length = [0.9, 2.6] }) {
  const n = len(dur);
  const out = new Float32Array(n);
  for (let k = 0; k < count; k++) {
    const f0 = rng.logRange(fLo, fHi);
    const t0 = rng.range(start[0], start[1]);
    const L = rng.range(length[0], length[1]);
    const d = rng.range(drift[1], drift[0]);
    const a = Math.round(t0 * SR);
    const m = Math.min(n - a, len(L));
    if (m <= 0) continue;
    const ex = pink(rng, m);
    const wob = wander(rng, m, rng.range(1.5, 4), -0.35, 0.35);
    const fq = new Float32Array(m);
    for (let i = 0; i < m; i++) fq[i] = f0 * 2 ** ((d * (i / m) + wob[i]) / 12);
    const y = svf(ex, fq, rng.range(q[0], q[1]), 'bp');
    const e = env(m, [[0, 0], [Math.min(0.12, L * 0.2), 1], [L * rng.range(0.45, 0.7), rng.range(0.5, 0.85)], [L, 0]]);
    const g = rng.range(0.5, 1);
    for (let i = 0; i < m; i++) out[a + i] += y[i] * e[i] * g;
  }
  return norm(fadeEdges(out, 0, 0.01));
}

/**
 * コンクリートの塊が当たる音（最大値 1）：鈍い雑音の打撃と、固い塊の短い鳴り（150〜900Hz の不協和な3つ）。
 * size は 0〜1（大きいほど低く長い）。bounce があれば 60〜150ms 後に小さく跳ねる。
 */
export function chunkImpact(rng, { size = 0.5, bounce = 0 } = {}) {
  const dur = 0.35 + 0.35 * size;
  const n = len(dur);
  const out = new Float32Array(n);
  const hit = (at, g) => {
    const base = rng.range(180, 420) * (1.25 - 0.55 * size);
    const burst = new Float32Array(n - at);
    const clickLen = Math.max(8, Math.round(rng.range(0.0008, 0.003) * SR));
    for (let i = 0; i < clickLen && i < burst.length; i++) burst[i] = rng.bi() * (1 - i / clickLen);
    const ring = modalRing(burst, [
      { f: base, tau: rng.range(0.018, 0.04) * (0.8 + 0.6 * size), gain: 1 },
      { f: base * rng.range(1.52, 1.78), tau: rng.range(0.012, 0.03), gain: 0.7 },
      { f: base * rng.range(2.3, 2.9), tau: rng.range(0.008, 0.02), gain: 0.45 },
    ]);
    const body = noiseThump(rng, { dur: Math.min(dur, 0.4), f: [260 * (1.2 - 0.6 * size), 120], attack: 0.001, decay: 0.03 + 0.05 * size, color: 'pink', hp: 60 });
    const grit = noiseBurst(rng, { dur: 0.12, decay: 0.012 + 0.012 * size, filters: [['bp', rng.range(700, 1600), 0.9]] });
    norm(ring);
    for (let i = 0; i < ring.length && at + i < n; i++) out[at + i] += ring[i] * 0.6 * g;
    for (let i = 0; i < body.length && at + i < n; i++) out[at + i] += body[i] * 0.9 * g;
    for (let i = 0; i < grit.length && at + i < n; i++) out[at + i] += grit[i] * 0.35 * g;
  };
  hit(0, 1);
  if (bounce > 0) hit(len(rng.range(0.06, 0.15)), bounce);
  return norm(fadeEdges(out, 0, 0.01));
}

/** 減衰する共鳴の束（励振で鳴らす）。dsp.modal と同じ形の小さな写し（sfxkit の中で完結させる）。 */
function modalRing(ex, modes) {
  const out = new Float32Array(ex.length);
  for (const m of modes) {
    const r = Math.exp(-1 / (m.tau * SR));
    const c1 = 2 * r * Math.cos((TAU * m.f) / SR);
    const c2 = -r * r;
    const g = m.gain * (1 - r);
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < ex.length; i++) {
      const y = c1 * y1 + c2 * y2 + ex[i] * g;
      y2 = y1;
      y1 = y;
      out[i] += y;
    }
  }
  return out;
}

/**
 * 鉄骨のきしみ（最大値 1）：こすれの「引っかかって滑る」（stick-slip）の打の列で、400Hz〜3kHz の金属の固有の鳴りをたたく。
 * 打の速さ（rate Hz）が揺れ、鳴りの高さがずるっと滑る（slide 半音）。episodes 回のきしみを dur 秒の中に置く。
 */
export function creak(rng, { dur, episodes = 5, base = [450, 700], rate = [18, 70], slide = [-3, 2], len: epLen = [0.2, 0.9] }) {
  const n = len(dur);
  const out = new Float32Array(n);
  for (let k = 0; k < episodes; k++) {
    const L = rng.range(epLen[0], epLen[1]);
    const t0 = rng.range(0, Math.max(0.01, dur - L));
    const a = Math.round(t0 * SR);
    const m = Math.min(n - a, len(L));
    if (m <= 0) continue;
    const ex = new Float32Array(m);
    const r0 = rng.range(rate[0], rate[1]);
    const rw = wander(rng, m, rng.range(3, 8), 0.6, 1.5);
    const e = env(m, [[0, 0], [L * 0.15, 1], [L * 0.7, rng.range(0.6, 1)], [L, 0]]);
    let ph = 0;
    for (let i = 0; i < m; i++) {
      ph += (r0 * rw[i]) / SR;
      if (ph >= 1) {
        ph -= 1;
        const amp = e[i] * rng.range(0.4, 1);
        const w = Math.round(rng.range(0.0003, 0.0012) * SR);
        for (let j = 0; j < w && i + j < m; j++) ex[i + j] += rng.bi() * amp * (1 - j / w);
      }
    }
    const b = rng.range(base[0], base[1]);
    const s = rng.range(slide[0], slide[1]);
    const ratios = [1, rng.range(1.55, 1.7), rng.range(2.35, 2.55), rng.range(3.3, 3.7), rng.range(4.6, 5.2)];
    const y = new Float32Array(m);
    ratios.forEach((ratio, j) => {
      const fq = new Float32Array(m);
      const wob = wander(rng, m, rng.range(4, 9), -0.25, 0.25);
      for (let i = 0; i < m; i++) fq[i] = Math.min(3400, b * ratio * 2 ** ((s * (i / m) + wob[i]) / 12));
      const band = svf(ex, fq, rng.range(18, 40), 'bp');
      const g = 1 / (1 + j * 0.45);
      for (let i = 0; i < m; i++) y[i] += band[i] * g;
    });
    const g = rng.range(0.55, 1);
    for (let i = 0; i < m; i++) out[a + i] += y[i] * g;
  }
  softclip(norm(out), 1.3);
  return norm(fadeEdges(out, 0, 0.01));
}

/** 素材ごとの足もとの砕け方（足音と着地の変化に使う）。f は砕ける帯域、grit は細かな粒の量、thud は鈍さ。 */
export const GROUND = {
  asphalt: { crunch: [480, 900], grit: 1, grains: [700, 5000], chunk: 0.35, thud: 0.8, tail: 1 },
  // r05-audio：土だけ暗すぎ、同じ怪獣の変化どうしの差（平均スペクトル）の半分を作っていた。260〜520Hz・粒 0.45 → 380〜800Hz・0.7（固い土の道）
  soil: { crunch: [380, 800], grit: 0.7, grains: [700, 3800], chunk: 0.2, thud: 1.05, tail: 0.85 },
  rubble: { crunch: [350, 1300], grit: 0.8, grains: [300, 3800], chunk: 1, thud: 0.9, tail: 1.5 },
  concrete: { crunch: [600, 1400], grit: 0.7, grains: [900, 5500], chunk: 0.55, thud: 0.7, tail: 0.9 },
};

// ------------------------------------------------------------ r05-audio：怪獣ごとの足音の印（岩の皮・転がる礫）

/**
 * 岩どうしが当たる「コッ」（最大値 1）：減衰の速い石の固有の鳴り（不協和な4つ）と、短い当たりの雑音、鈍い胴。
 * size は 0〜1（大きいほど低く長い）。コンクリートの塊（chunkImpact）より高く硬い。焔角の岩の皮と、転がる礫に使う。
 */
export function rockClack(rng, { size = 0.5 } = {}) {
  const dur = 0.18 + 0.3 * size;
  const n = len(dur);
  const base = rng.range(380, 820) * (1.3 - 0.75 * size);
  const ex = new Float32Array(n);
  const clickLen = Math.max(6, Math.round(rng.range(0.0004, 0.0016) * SR));
  for (let i = 0; i < clickLen; i++) ex[i] = rng.bi() * (1 - i / clickLen);
  const ring = modalRing(ex, [
    { f: base, tau: rng.range(0.014, 0.03) * (0.8 + 0.8 * size), gain: 1 },
    { f: base * rng.range(1.55, 1.7), tau: rng.range(0.01, 0.022), gain: 0.75 },
    { f: base * rng.range(2.15, 2.4), tau: rng.range(0.008, 0.016), gain: 0.5 },
    { f: base * rng.range(2.9, 3.3), tau: rng.range(0.005, 0.012), gain: 0.35 },
  ]);
  norm(ring);
  const tick = noiseBurst(rng, { dur: 0.05, decay: 0.004 + 0.004 * size, filters: [['bp', rng.range(1100, 2200), 1.1]] });
  const thud = noiseThump(rng, { dur: Math.min(dur, 0.3), f: [320 * (1.2 - 0.5 * size), 140], attack: 0.001, decay: 0.02 + 0.04 * size, color: 'pink', hp: 70 });
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = ring[i] * 0.75 + (tick[i] ?? 0) * 0.3 + (thud[i] ?? 0) * 0.55 * size;
  return norm(fadeEdges(out, 0, 0.01));
}

/**
 * 後から転がる礫（ステレオに足す）：体や地面からこぼれた石が、少し遅れて落ち、間を詰めながら跳ねて止まる。
 * count 個の石が start〜start+window 秒に落ち始める。1つの石は 2〜4 回跳ね、跳ねるたびに間が 0.6 倍・大きさが半分になる。
 */
export function pebbleRun(rng, out, { start, window = 0.3, count = 4, amp = 0.3, size = [0.1, 0.35], spread = 0.8 }) {
  for (let k = 0; k < count; k++) {
    let t = start + rng.range(0, window);
    let gap = rng.range(0.08, 0.15);
    let g = amp * rng.range(0.6, 1);
    const pan = rng.bi() * spread;
    const s = rng.range(size[0], size[1]);
    const bounces = rng.int(2, 4);
    for (let b = 0; b < bounces; b++) {
      const hit = rockClack(rng, { size: s * (1 - 0.15 * b) });
      const a = Math.round(t * SR);
      const [gl, gr] = [Math.cos(((pan + 1) * Math.PI) / 4) * g, Math.sin(((pan + 1) * Math.PI) / 4) * g];
      for (let i = 0; i < hit.length && a + i < out.l.length; i++) {
        out.l[a + i] += hit[i] * gl;
        out.r[a + i] += hit[i] * gr;
      }
      t += gap;
      gap *= rng.range(0.5, 0.7);
      g *= rng.range(0.4, 0.6);
    }
  }
  return out;
}
