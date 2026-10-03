// OWNER: audio-tools
// 画面の操作と知らせの音。和の打ち物（拍子木・大太鼓・銅鑼・りん）でそろえ、曲の響きと喧嘩しない高さにする。
// click＝拍子木の「カン」、start＝大太鼓と拍子木の二つ打ち、pause／resume＝低い木の音、result＝銅鑼と大太鼓（resultGong＝曲の最後の大太鼓に重ねる銅鑼だけ）、
// rage＝金管のふくらみとりん、combo＝りん。
import { addMono, SR, len, stereo } from '../lib/dsp.mjs';
import { reverbStereo } from '../lib/fft.mjs';
import { layers, norm, toStereo } from '../lib/sfxkit.mjs';
import { brass, drum, gong, rin } from '../music/instruments.mjs';
import { padTail } from './voice.mjs';

/** 拍子木（2本の堅い木を打ち合わせる）：木の固有振動の短い鳴り。pitch は倍率。 */
function hyoshigi(rng, pitch = 1, vel = 1) {
  const n = len(0.35);
  const ex = new Float32Array(n);
  const clickLen = Math.round(0.0008 * SR);
  for (let i = 0; i < clickLen; i++) ex[i] = rng.bi() * (1 - i / clickLen);
  const out = new Float32Array(n);
  const modes = [
    [1180, 0.055, 1],
    [2710, 0.032, 0.6],
    [3960, 0.02, 0.35],
    [5600, 0.012, 0.2],
  ];
  for (const [f0, tau, g] of modes) {
    const f = f0 * pitch * rng.range(0.99, 1.01);
    const r = Math.exp(-1 / (tau * SR));
    const c1 = 2 * r * Math.cos((2 * Math.PI * f) / SR);
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < n; i++) {
      const y = c1 * y1 - r * r * y2 + ex[i] * g;
      y2 = y1;
      y1 = y;
      out[i] += y;
    }
  }
  for (let i = 0; i < clickLen; i++) out[i] += ex[i] * 0.15;
  return norm(out, vel);
}

function withSpace(audio, ctx, wet) {
  const a = padTail(audio, 1.2);
  const w = reverbStereo(a, ctx.ir.near);
  for (let i = 0; i < a.l.length; i++) {
    a.l[i] += w.l[i] * wet;
    a.r[i] += w.r[i] * wet;
  }
  return a;
}

export function click(rng, ctx, variant) {
  const pitch = [1, 1.07, 0.94][variant % 3];
  const a = toStereo(hyoshigi(rng, pitch, 1));
  return { audio: withSpace(a, ctx, 0.12), layers: { core: 'hyoshigi', body: 'wood-modes', tail: 'near-room' } };
}

export function start(rng, ctx) {
  const n = len(3);
  const out = stereo(n);
  addMono(out, drum(rng, 'odaiko', 1, 1), 0, 0.9);
  addMono(out, hyoshigi(rng, 1, 0.7), 0, 0.5, -0.2);
  addMono(out, hyoshigi(rng, 1.02, 0.8), len(0.16), 0.55, 0.2);
  return { audio: withSpace(out, ctx, 0.2), layers: { core: 'hyoshigi', body: 'odaiko', tail: 'near-room' } };
}

export function pause(rng, ctx, variant) {
  const pitch = variant === 0 ? 0.62 : 0.7;
  const out = stereo(len(0.8));
  addMono(out, hyoshigi(rng, pitch, 0.8), 0, 0.8);
  if (variant === 1) addMono(out, hyoshigi(rng, pitch * 1.12, 0.7), len(0.09), 0.6);
  return { audio: withSpace(out, ctx, 0.15), layers: { core: 'low-wood', body: 'wood-modes', tail: 'near-room' } };
}

export function result(rng, ctx) {
  const n = len(7);
  const out = stereo(n);
  addMono(out, gong(rng, 98, 6.8, 1), 0, 0.75);
  addMono(out, drum(rng, 'odaiko', 1, 0.92), 0, 0.9);
  addMono(out, drum(rng, 'odaiko', 0.8, 0.92), len(0.625), 0.7);
  return { audio: withSpace(out, ctx, 0.25), layers: { core: 'odaiko', body: 'gong', tail: 'gong-bloom+room' } };
}

/**
 * r06-audio：時間切れの結果の音を、曲の最後の大太鼓に重ねて鳴らす版。大太鼓は曲が鳴らすので抜き、銅鑼だけにする
 * （指摘「結果の音の大太鼓2打と曲の最後の大太鼓が 0.2 秒ずれて重なり、ドドンと二度打ちに聞こえる」）。
 * 銅鑼の高さは曲の最後の和音（D）に合わせて D2（73.4Hz）。前の 98Hz（G）は、D の和音の上で4度の響きが立った。
 * 曲と合わせられないとき（src/audio/musicEnd.ts の resultCue が full のとき）は、前の result（銅鑼と大太鼓2打）を鳴らす。
 */
export function resultGong(rng, ctx) {
  const n = len(7.5);
  const out = stereo(n);
  addMono(out, gong(rng, 73.42, 7.2, 1), 0, 0.85);
  return { audio: withSpace(out, ctx, 0.25), layers: { core: 'gong-strike', body: 'gong D2', tail: 'gong-bloom+room' } };
}

export function rage(rng, ctx) {
  // りんは頭で鳴らし（満タンの瞬間が分かる）、金管がその下でふくらむ
  const body = brass(rng, 73.42, { dur: 1.3, vel: 0.9, attack: 0.35, release: 0.6, voices: 3 });
  const low = brass(rng, 36.71, { dur: 1.3, vel: 0.8, attack: 0.4, release: 0.6, voices: 2 });
  const bell = rin(rng, 587.33, 3.4, 1);
  const n = Math.max(body.l.length, bell.length);
  const out = stereo(n);
  for (let i = 0; i < body.l.length; i++) {
    out.l[i] += body.l[i] * 0.8 + low.l[i] * 0.6;
    out.r[i] += body.r[i] * 0.8 + low.r[i] * 0.6;
  }
  addMono(out, bell, 0, 0.55);
  return { audio: withSpace(out, ctx, 0.25), layers: { core: 'rin', body: 'brass-swell', tail: 'rin-ring' } };
}

/**
 * 連鎖の節目のりん。曲の五音（D・E♭・G・A・B♭）から選ぶ：10＝A5、25＝D6、50 と 100＝D6 と A6 の二つ打ち。
 * r02-audio：指摘「連鎖25のりん（B5＝987.8Hz）が曲の B♭ と半音でぶつかる」 B5→D6（主音。曲のどの和音ともぶつかりにくい）。
 */
export function combo(rng, ctx, variant) {
  const notes = [[880], [1174.66], [1174.66, 1760]][variant % 3];
  const n = len(2.8);
  const out = stereo(n);
  notes.forEach((f, k) => addMono(out, rin(rng, f, 2.6, 1), len(k * 0.07), k === 0 ? 1 : 0.7, k === 0 ? -0.1 : 0.25));
  return { audio: withSpace(layers({ body: out }), ctx, 0.2), layers: { core: 'strike', body: `rin ${notes.map((f) => Math.round(f)).join('+')}Hz`, tail: 'ring' } };
}
