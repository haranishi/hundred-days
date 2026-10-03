// OWNER: audio-tools
// 怪獣の声（咆哮）。1匹の喉に聞こえるよう、声の元 → 口と喉の共鳴 → 歪み、の順で作る（電子音の「ビー」にしない）。
// 声の元：のこぎり波（声帯）＋声の周期でふくらむ息の雑音（かすれ）＋細かな揺れ（ゆらぎ・震え）。高さの列は1本だけで、全部がそれに従う。
// 周期の倍化：叫びが割れる瞬間だけ、1周期おきに声門の打ちを強弱させる（1オクターブ下が本体と同じ位相で出る）。0.2〜0.5秒の塊で出し入れする。
// 共鳴：母音の共鳴（フォルマント）4本を、口の開き（F1）と舌の位置（F2）の道のりで ±40〜60% 動かす。巨体なので声の通り道の長さで全体を下げる。
// 胸の鳴り：声の包絡に沿って、声の高さの帯（30〜70Hz、倍化の間はその半分）を足す。
// r02-audio：指摘「1オクターブ下の声が別の voice() で本体と別々に揺れ、1.3kHz と 2.7kHz を固定で持ち上げて共鳴が止まり、120Hz 未満が4.5%」
// 芯＝吠え始めの破裂、胴＝1つの喉（共鳴・倍化・胸の鳴り）、尾＝吐き出す息と、湾の向こうへ抜ける遠い響き。
import { SR, TAU, Biquad, addMono, dcBlock, env, filt, len, mul, pink, softclip, stereo, svf, wander, white } from '../lib/dsp.mjs';
import { reverbStereo } from '../lib/fft.mjs';
import { layers, noiseBurst, toStereo } from '../lib/sfxkit.mjs';

// 口を開いた「あ」の共鳴（大人の男性、Hz。一般の音声学の代表値）と、各帯の強さと幅
const BASE = [730, 1090, 2440, 3350];
const FORMANT_DB = [0, -3, -9, -15];
const FORMANT_BW = [90, 110, 170, 260];

/**
 * 声の本体（モノラル）。plan の pitch は半音の折れ線（f0 基準）、mouth・tongue は F1・F2 の倍率の折れ線、
 * growl・rasp は 0〜1 の折れ線、pd は周期の倍化の深さの折れ線（塊）。
 */
export function voice(rng, V, plan) {
  const { dur, f0, pitch, mouth, tongue, growl, rasp, amp, pd } = plan;
  const tract = V.tract;
  const n = len(dur);
  const semi = env(n, pitch);
  const jitter = wander(rng, n, 22, -(V.jitter ?? 0.2), V.jitter ?? 0.2);
  const drift = wander(rng, n, 3, -0.4, 0.4);
  const tremRate = rng.range(6.5, 9);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = f0 * 2 ** ((semi[i] + jitter[i] + drift[i] + 0.22 * Math.sin((TAU * tremRate * i) / SR)) / 12);
  const gr = env(n, growl);
  const rs = env(n, rasp);
  const a = env(n, amp);
  const dbl = env(n, pd);
  const noise = white(rng, n);
  filt(noise, [['hp', 500, 0.7], ['lp', 5200, 0.7]]);
  const fryRate = rng.range(26, 38);
  const fryWander = wander(rng, n, 6, -1, 1);
  // 1本の位相：本体ののこぎり波も、倍化の強弱も、半分の高さの胸の鳴りも、同じ周期を数える
  const ex = new Float32Array(n);
  const puff = new Float32Array(n);
  const half = new Float32Array(n);
  let ph = rng.next();
  let cyc = 0;
  for (let i = 0; i < n; i++) {
    const dt = f[i] / SR;
    // のこぎり波（PolyBLEP で折り返しを抑える）
    let saw = 2 * ph - 1;
    if (ph < dt) {
      const x = ph / dt;
      saw -= x + x - x * x - 1;
    } else if (ph > 1 - dt) {
      const x = (ph - 1) / dt;
      saw -= x * x + x + x + 1;
    }
    const odd = cyc & 1 ? -1 : 1;
    // 周期の倍化：1周期おきに打ちを強弱させ、わずかに閉じ方を変える
    const pdGain = 1 + 0.6 * dbl[i] * odd;
    const pulseShape = ph < 0.35 ? 1 : 0.25;
    const fry = 1 - 0.32 * gr[i] * (0.5 + 0.5 * Math.sin(TAU * ((fryRate * i) / SR) + fryWander[i] * 2));
    puff[i] = pulseShape * fry;
    ex[i] = (saw * 0.8 * pdGain + noise[i] * rs[i] * (0.35 + 0.9 * pulseShape)) * fry;
    // 半分の高さ（位相は本体の2周期で1周）
    half[i] = Math.sin(Math.PI * (cyc + ph));
    ph += dt;
    if (ph >= 1) {
      ph -= 1;
      cyc++;
    }
  }
  new Biquad().lp(4200, 0.6).run(ex);
  // 口と喉の共鳴：4本の帯域。F1 は口の開き、F2 は舌の位置、F3・F4 は口の開きに少しだけ連れて動く
  const out = new Float32Array(n);
  const mo = env(n, mouth, 'exp');
  const to = env(n, tongue, 'exp');
  const jaw = wander(rng, n, 2.4, -1, 1);
  for (let k = 0; k < 4; k++) {
    const fk = new Float32Array(n);
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const m = k === 0 ? mo[i] : k === 1 ? to[i] : 1 + (k === 2 ? 0.28 : 0.16) * (mo[i] - 1);
      fk[i] = (BASE[k] / tract) * m * (1 + [0.05, 0.04, 0.03, 0.02][k] * jaw[i]);
      q[i] = fk[i] / ((FORMANT_BW[k] / Math.sqrt(tract)) * (1 + 0.35 * Math.max(0, mo[i] - 1)));
    }
    const y = svf(ex, fk, q, 'bp');
    const g = 10 ** ((FORMANT_DB[k] + (k >= 2 ? V.shriek ?? 0 : 0)) / 20);
    for (let i = 0; i < n; i++) out[i] += y[i] * g;
  }
  // 喉のざらつき：声の周期でふくらむ息を、共鳴の F3 の少し上に足す（吠え声の「ガー」という擦れ。帯は F3 に連れて動く）
  const hissF = new Float32Array(n);
  for (let i = 0; i < n; i++) hissF[i] = Math.min(6000, ((BASE[2] * 1.3) / tract) * (1 + 0.28 * (mo[i] - 1)) * 1.6);
  const hiss = svf(white(rng, n), hissF, 0.8, 'bp');
  let hp = 0;
  for (let i = 0; i < n; i++) hp = Math.max(hp, Math.abs(hiss[i]));
  for (let i = 0; i < n; i++) out[i] = (out[i] + (hiss[i] / (hp || 1)) * rs[i] * (0.25 + 0.75 * puff[i]) * 0.09) * a[i];
  filt(out, [['hp', 70, 0.7]]);
  softclip(out, V.drive);
  filt(out, [['hp', 40, 0.7], ['lp', 9000, 0.7]]);
  // 胸の鳴り：声の元の一番下（声の高さ）と、倍化の間だけの半分の高さ。歪ませずに、声の包絡に沿って足す
  const chestF = new Float32Array(n);
  for (let i = 0; i < n; i++) chestF[i] = 1.7 * f[i];
  const chest = svf(ex, chestF, 0.9, 'lp');
  filt(chest, [['hp', 26, 0.7]]);
  let cp = 0;
  for (let i = 0; i < n; i++) cp = Math.max(cp, Math.abs(chest[i]));
  let op = 0;
  for (let i = 0; i < n; i++) op = Math.max(op, Math.abs(out[i]));
  const cg = (V.chest ?? 0.5) * (op / (cp || 1));
  for (let i = 0; i < n; i++) out[i] += (chest[i] * cg * (0.75 + 0.25 * gr[i]) + half[i] * dbl[i] * 0.35 * (V.chest ?? 0.5) * op) * a[i];
  dcBlock(out);
  return out;
}

/** 周期の倍化の塊（0.2〜0.5 秒）を count 個、声の強いところに置く折れ線。 */
function doublingPath(rng, dur, count, depth) {
  const pts = [[0, 0]];
  const slots = [];
  for (let c = 0; c < count; c++) {
    const L = rng.range(0.2, 0.5);
    const t = rng.range(0.25, Math.max(0.3, dur * 0.85 - L));
    if (slots.some(([a, b]) => t < b + 0.1 && t + L > a - 0.1)) continue;
    slots.push([t, t + L]);
  }
  slots.sort((x, y) => x[0] - y[0]);
  for (const [t0, t1] of slots) {
    const d = depth * rng.range(0.7, 1);
    pts.push([t0, 0], [t0 + 0.05, d], [t1 - 0.05, d * rng.range(0.7, 1)], [t1, 0]);
  }
  pts.push([dur, 0]);
  return { path: pts, chunks: slots.length };
}

/** 咆哮1本分の筋書き（変化ごとに高さ・長さ・口の動き・倍化の塊を散らす）。 */
function roarPlan(rng, V, short) {
  const [d0, d1] = short ? V.shortDur ?? [1.5, 2.1] : V.dur ?? [3.0, 3.9];
  const dur = rng.range(d0, d1);
  const f0 = V.f0 * (1 + rng.bi() * V.f0Spread) * (short ? 1.12 : 1);
  const peak = dur * rng.range(0.28, 0.42);
  const fall = rng.range(4, 7);
  const lift = V.lift ?? 0;
  const pitch = [
    [0, -8],
    [0.1, -1.5],
    [peak, rng.range(1.5, 3) + lift],
    [dur * 0.72, rng.range(-0.8, 0.6)],
    [dur, -fall],
  ];
  // 口：閉→開→閉。舌：前（F2 高い）→ 奥 → 前 → 奥。振れ幅は怪獣ごとの mouthSwing で広げる
  const sw = V.mouthSwing ?? 1;
  const dev = (x) => 1 + (x - 1) * sw;
  const mouth = [
    [0, dev(0.62)],
    [0.08, dev(0.82)],
    [peak * rng.range(0.6, 0.9), dev(rng.range(1.38, 1.6))],
    [dur * rng.range(0.55, 0.65), dev(rng.range(1.1, 1.32))],
    [dur * 0.84, dev(rng.range(0.74, 0.9))],
    [dur, dev(0.58)],
  ];
  const tongue = [
    [0, dev(rng.range(1.3, 1.5))],
    [peak * 0.5, dev(0.95)],
    [peak * rng.range(1.1, 1.4), dev(rng.range(1.22, 1.45))],
    [dur * rng.range(0.66, 0.76), dev(rng.range(0.7, 0.84))],
    [dur, dev(0.6)],
  ];
  const growl = [
    [0, 0.4],
    [peak, V.growl * rng.range(0.6, 1)],
    [dur * 0.8, V.growl * rng.range(0.9, 1.3)],
    [dur, 1],
  ];
  const rasp = [
    [0, 0.9],
    [0.25, V.rasp * 0.7],
    [dur * 0.75, V.rasp],
    [dur, 1],
  ];
  const amp = [
    [0, 0],
    [0.05, 0.9],
    [peak, 1],
    [dur * 0.78, 0.8],
    [dur * 0.9, 0.4],
    [dur * 0.97, 0.1],
    [dur, 0],
  ];
  const [c0, c1] = V.pdChunks ?? [2, 4];
  const pd = doublingPath(rng, dur, short ? Math.max(1, c0 - 1) : rng.int(c0, c1), V.pdDepth ?? 0.5);
  return { dur, f0, pitch, mouth, tongue, growl, rasp, amp, pd: pd.path, pdChunks: pd.chunks };
}

/**
 * r06-audio：短い声の型（怪獣の voice.shortTypes に書いた怪獣だけ。焔角）。指摘「焔角の短い咆哮は3変化の模様が 0.965 似ていて、3分に11回鳴る」
 *   growl＝うなり（低く口を閉じたまま喉を鳴らす）、snort＝鼻息（声の無い「フンッ」を1〜2回と、短い胸のうなり）、bark＝短い吠え（r05 までの短い咆哮）。
 */
function growlPlan(rng, V) {
  const dur = rng.range(2.0, 2.8);
  const f0 = V.f0 * rng.range(0.76, 0.88);
  const sw = (V.mouthSwing ?? 1) * 0.6;
  const dev = (x) => 1 + (x - 1) * sw;
  const mid = dur * rng.range(0.4, 0.6);
  return {
    dur,
    f0,
    pitch: [[0, -4], [0.25, -1], [mid, rng.range(-0.5, 1)], [dur * 0.8, rng.range(-1.5, 0)], [dur, -3]],
    mouth: [[0, dev(0.55)], [0.3, dev(rng.range(0.66, 0.78))], [mid, dev(rng.range(0.72, 0.85))], [dur, dev(0.55)]],
    tongue: [[0, dev(0.85)], [mid, dev(rng.range(0.7, 0.8))], [dur, dev(0.65)]],
    growl: [[0, 0.7], [mid, Math.min(1, V.growl * 1.3)], [dur, 1]],
    rasp: [[0, 0.5], [mid, V.rasp * 1.2], [dur, 0.9]],
    amp: [[0, 0], [0.3, 0.75], [mid, 1], [dur * 0.85, 0.65], [dur, 0]],
    pd: doublingPath(rng, dur, rng.int(1, 2), Math.min(1, (V.pdDepth ?? 0.5) * 1.3)).path,
  };
}

function shortVoice(rng, M, ctx, type) {
  const V = M.voice;
  if (type === 'growl') {
    const plan = growlPlan(rng, V);
    const bodyMono = voice(rng, V, plan);
    const body = stereo(bodyMono.length);
    for (let i = 0; i < bodyMono.length; i++) body.l[i] = body.r[i] = bodyMono[i];
    const breathLen = len(plan.dur + 0.8);
    const exhale = pink(rng, breathLen);
    filt(exhale, [['bp', 420 * (V.barkPitch ?? 1), 0.7], ['lp', 1800, 0.7]]);
    mul(exhale, env(breathLen, [[0, 0], [plan.dur * 0.85, 0], [plan.dur, 0.25], [plan.dur + 0.8, 0]]));
    const dry = layers({ body, tail: toStereo(exhale) }, { body: 0, tail: -14 });
    const out = padTail(dry, 2.4);
    const wet = reverbStereo(out, ctx.ir.far);
    for (let i = 0; i < out.l.length; i++) {
      out.l[i] += wet.l[i] * 0.2;
      out.r[i] += wet.r[i] * 0.2;
    }
    return { audio: out, layers: { core: 'none', body: `growl f0 ${Math.round(plan.f0)}Hz(closed mouth)`, tail: 'exhale+far-reverb' } };
  }
  // snort：鼻から吹き出す息の塊（声は無い）を1〜2回、頭に短い胸のうなり
  const puffs = rng.chance(0.5) ? 2 : 1;
  const total = 1.4;
  const n = len(total);
  const core = stereo(n);
  const nasal = rng.range(260, 420) * (V.barkPitch ?? 1);
  let at = 0;
  for (let k = 0; k < puffs; k++) {
    const d = rng.range(0.22, 0.38) * (k === 0 ? 1 : 0.7);
    const puff = noiseBurst(rng, { dur: d + 0.25, attack: 0.012, decay: d * 0.45, color: 'pink', filters: [['bp', nasal * rng.range(0.9, 1.1), 0.9], ['peak', nasal * 2.6, 1.2, 4], ['lowShelf', 160, 5]] });
    addMono(core, puff, len(at), k === 0 ? 1 : rng.range(0.55, 0.75), rng.bi() * 0.15);
    at += d + rng.range(0.08, 0.2);
  }
  const grunt = voice(rng, V, { dur: 0.4, f0: V.f0 * 0.9, pitch: [[0, -2], [0.1, 0], [0.4, -4]], mouth: [[0, 0.6], [0.4, 0.55]], tongue: [[0, 0.8], [0.4, 0.7]], growl: [[0, 0.9], [0.4, 1]], rasp: [[0, 0.6], [0.4, 0.8]], amp: [[0, 0], [0.04, 1], [0.25, 0.6], [0.4, 0]], pd: [[0, 0], [0.4, 0]] });
  addMono(core, grunt, len(rng.range(0, 0.03)), 0.6);
  const out = padTail(core, 1.6);
  const wet = reverbStereo(out, ctx.ir.far);
  for (let i = 0; i < out.l.length; i++) {
    out.l[i] += wet.l[i] * 0.16;
    out.r[i] += wet.r[i] * 0.16;
  }
  return { audio: out, layers: { core: `snort×${puffs}`, body: 'chest-grunt', tail: 'far-reverb' } };
}

/** 咆哮（short で急降下の短い叫び）。ctx.ir.far は遠い響きのインパルス応答。variant は短い声の型を選ぶ（voice.shortTypes のある怪獣だけ）。 */
export function roar(rng, M, ctx, { short = false, variant = 0 } = {}) {
  const V = M.voice;
  const type = short && V.shortTypes ? V.shortTypes[variant % V.shortTypes.length] : 'bark';
  if (type !== 'bark') return shortVoice(rng, M, ctx, type);
  const plan = roarPlan(rng, V, short);
  // 胴：1つの喉（共鳴・倍化・胸の鳴り）
  const bodyMono = voice(rng, V, plan);
  const body = stereo(bodyMono.length);
  const d = Math.round(0.0007 * SR);
  for (let i = 0; i < bodyMono.length; i++) {
    body.l[i] = bodyMono[i];
    body.r[i] = i >= d ? bodyMono[i] * 0.85 + bodyMono[i - d] * 0.15 : bodyMono[i];
  }
  // 芯：吠え始めの破裂（喉が開く瞬間の息の塊）
  const bark = noiseBurst(rng, { dur: 0.25, attack: 0.002, decay: 0.07, color: 'pink', filters: [['bp', rng.range(700, 1100) * (V.barkPitch ?? 1), 0.8], ['lowShelf', 200, 6]] });
  softclip(bark, 2);
  const core = toStereo(bark);
  // 尾：吐き出す息（声のあと）と、湾の向こうへ抜ける遠い響き
  const breathLen = len(plan.dur + 1.4);
  const exhale = pink(rng, breathLen);
  filt(exhale, [['bp', 650 * (V.barkPitch ?? 1), 0.7], ['lp', 2500, 0.7]]);
  mul(exhale, env(breathLen, [[0, 0], [plan.dur * 0.8, 0], [plan.dur, 0.3], [plan.dur + 1.4, 0]]));
  const dry = layers({ core, body, tail: toStereo(exhale) }, { core: -8, body: 0, tail: -12 });
  const wet = reverbStereo(padTail(dry, 3.2), ctx.ir.far);
  const out = padTail(dry, 3.2);
  for (let i = 0; i < out.l.length; i++) {
    out.l[i] += wet.l[i] * 0.3;
    out.r[i] += wet.r[i] * 0.3;
  }
  return { audio: out, layers: { core: 'bark', body: `one-throat f0 ${Math.round(plan.f0)}Hz+doubling×${plan.pdChunks}+chest`, tail: 'exhale+far-reverb' } };
}

/** 終わりに無音を足して、残響の尾が切れないようにする。 */
export function padTail(s, seconds) {
  const extra = len(seconds);
  const out = stereo(s.l.length + extra);
  out.l.set(s.l);
  out.r.set(s.r);
  return out;
}
