// OWNER: audio-tools
// 怪獣の体の音：足音（前足・後ろ足）・羽ばたき・着地（軽い／重い）・爪と尾の振り・爪と尾の当たり。
// 巨体の重さは「雑音の打撃（30〜90Hz）＋頭だけの短い圧＋地面の砕ける音（250Hz〜2kHz）」を重ねて出す。
// 足音・羽ばたき・着地は怪獣の設定（monsters.mjs の feet・wings）から作るので、怪獣ごとに差し替えられる。
// r02-audio：指摘「足音5個の包絡の相関0.988、同じ音の雑音違い」 変化ごとに長さ（±25%）・胴の高さ（±15%）・粒の数・地面の素材を変え、
// 前足と後ろ足を別の作りにした。胴の低音は下降する正弦（キックの合成）から雑音の打撃へ替え、正弦は頭の数十ms の強調だけに残した。
import { SR, addMono, env, filt, len, mul, pink, softclip, stereo, sine, white } from '../lib/dsp.mjs';
import { reverbStereo } from '../lib/fft.mjs';
import { GROUND, chunkImpact, creak, grains, layers, noiseBurst, noiseThump, norm, panMove, pebbleRun, rockClack, rumble, snaps, subThump, toStereo, whoosh } from '../lib/sfxkit.mjs';
import { padTail } from './voice.mjs';

/** 変化の番号から地面の素材を選ぶ（同じ素材が続かない並び）。 */
const MATERIALS = ['asphalt', 'rubble', 'soil', 'concrete', 'asphalt'];
export const groundOf = (variant) => MATERIALS[variant % MATERIALS.length];

/**
 * 足音。foot は monsters.mjs の feet.hind か feet.front（重さ・高さ・爪・かかと・岩の皮など）。
 * 芯＝踏み砕く破裂と爪、胴＝雑音の打撃（とかかと→つま先の二度当たり）、尾＝散る破片と短い地鳴り。
 */
/**
 * 踏み方の型（変化の番号で必ず全部の型が出る）。後ろ足：かかと→つま先・べた踏み・引きずり・踏みしめ。
 * 前足：指を開いて置く・叩きつける・爪でこする・体重を預けて押し込む。翼の手首（雷翼の前足）は素材だけを変える。
 */
const HIND_CONTACTS = ['heelToe', 'flat', 'heelToeDrag', 'stomp', 'slip'];
const FRONT_CONTACTS = ['splay', 'slap', 'splayScrape', 'press', 'slip'];
/**
 * r06-audio：翼の手首（雷翼の前足）の突き方の型。指摘「雷翼の足音は包絡の相関が 0.836・0.873 まで揃った」（手首は素材しか変わらなかった）
 *   wrist＝一度突く、wristDouble＝手首の後に翼の指が遅れて当たる二度突き、wristDrag＝突いてから角質を引きずる、
 *   wristLight＝軽く触れて膜がはためく（短く静か）、wristSlam＝体重を預けて叩きつける（低く長い）
 */
const WRIST_CONTACTS = ['wrist', 'wristDouble', 'wristDrag', 'wristLight', 'wristSlam'];
const LONG = new Set(['stomp', 'press', 'wristSlam']);
const SHORT = new Set(['flat', 'slap', 'wristLight']);

export function step(rng, foot, variant = 0) {
  // r05-audio：変化が 5 個を超える怪獣（焔角）は、6個目から踏み方と素材の組み合わせをずらす（同じ組を繰り返さない）
  const ground = groundOf(variant < 5 ? variant : variant + 2);
  const mat = GROUND[ground];
  const contact = foot.wrist ? WRIST_CONTACTS[variant % WRIST_CONTACTS.length] : foot.heelToe ? HIND_CONTACTS[variant % HIND_CONTACTS.length] : FRONT_CONTACTS[variant % FRONT_CONTACTS.length];
  const k = LONG.has(contact) ? rng.range(1.2, 1.32) : SHORT.has(contact) ? rng.range(0.68, 0.78) : rng.range(0.85, 1.15);
  const p = rng.range(0.86, 1.15);
  const n = len(1.8 * k * Math.max(1, foot.weight));
  const core = stereo(n);
  if (foot.wrist) {
    // 翼の手首が地面を突く：固い角質が舗装を打つ「コッ」と、短いこすれ
    const kg = contact === 'wristLight' ? 0.55 : contact === 'wristSlam' ? 1 : 1;
    const knock = noiseBurst(rng, { dur: 0.08, decay: 0.006 * k, filters: [['bp', rng.range(1700, 2600) * p * (contact === 'wristSlam' ? 0.7 : 1), 2.2], ['peak', 3800, 1, 5]] });
    addMono(core, knock, 0, kg, rng.bi() * 0.2);
    snaps(rng, core, { start: 0.002, count: rng.int(1, 3), window: 0.02, f: [2500, 6500], amp: 0.6 * kg, ring: [0.002, 0.006] });
    addMono(core, noiseBurst(rng, { dur: 0.2, attack: 0.01, decay: 0.05 * k, filters: [['bp', rng.range(2200, 3400), 1.2]] }), len(rng.range(0.02, 0.05)), 0.35 * kg, rng.bi() * 0.4);
    if (contact === 'wristDouble') {
      // 翼の指が遅れて当たる二度目の「コッ」（手首より高く小さい）
      const t2 = rng.range(0.06, 0.14);
      addMono(core, noiseBurst(rng, { dur: 0.07, decay: 0.005, filters: [['bp', rng.range(2600, 3600) * p, 2.4]] }), len(t2), rng.range(0.55, 0.8), rng.bi() * 0.4);
      snaps(rng, core, { start: t2 + 0.002, count: rng.int(1, 2), window: 0.015, f: [3000, 7000], amp: 0.5, ring: [0.002, 0.005] });
    } else if (contact === 'wristDrag') {
      // 突いた後に角質を舗装に引きずる（中高域の擦れが 0.15〜0.3 秒続く）
      const dl = rng.range(0.15, 0.3);
      const scrape = whoosh(rng, { dur: dl, fPath: [[0, rng.range(2800, 3600)], [dl, rng.range(1600, 2200)]], qPath: [[0, 3]], points: [[0, 0], [0.02, 1], [dl * 0.7, 0.6], [dl, 0]], color: 'white' });
      addMono(core, scrape, len(rng.range(0.03, 0.06)), 0.45, rng.bi() * 0.4);
    } else if (contact === 'wristSlam') {
      // 体重を預けて叩きつける：翼の付け根まで揺れる鈍い胴（足音の胴の下に、もう一段低い打撃）
      addMono(core, noiseThump(rng, { dur: 0.5, f: [foot.f0 * 1.6 * p, foot.f0 * 0.8 * p], attack: 0.002, decay: 0.09, hp: 30 }), 0, 0.7);
    }
  } else {
    addMono(core, noiseBurst(rng, { dur: 0.06, decay: 0.009, filters: [['hp', 1800, 0.7], ['peak', 3600, 1, 4]] }), 0, 0.45 * mat.grit, rng.bi() * 0.2);
  }
  const [c0, c1] = mat.crunch;
  addMono(core, noiseBurst(rng, { dur: 0.3 * k, decay: 0.05 * k, color: 'pink', filters: [['bp', rng.logRange(c0, c1), 0.7], ['lowShelf', 220, 3]] }), len(rng.range(0, 0.008)), 0.75 * foot.crunch);
  snaps(rng, core, { start: 0.003, count: Math.max(1, Math.round(rng.int(2, 6) * mat.grit * foot.crunch)), window: 0.09 * k, f: [700, 3800], amp: 0.4 * foot.crunch, spread: 0.6 });
  // 爪：前足は指が開いて数本が別々に当たり、後ろ足はかかとの後に1〜2本
  if (foot.claws > 0) snaps(rng, core, { start: rng.range(0, 0.015), count: foot.splay ? rng.int(2, 4) : rng.int(1, 2), window: foot.splay ? 0.05 : 0.03, f: [2600, 6800], amp: 0.35 * foot.claws, ring: [0.002, 0.006] });
  // r05-audio：紅竜の印＝爪の当たり。踏み方の型に関わらず、指の数だけ硬い爪が舗装を打つ「カチッ」が数十ms に並ぶ
  if (foot.clawTap > 0) snaps(rng, core, { start: rng.range(0.004, 0.012), count: rng.int(3, 4), window: rng.range(0.025, 0.06), f: [2400, 5600], amp: 0.55 * foot.clawTap, spread: 0.4, ring: [0.003, 0.008] });
  const body = stereo(n);
  const f0 = foot.f0 * p;
  // 雑音の打撃（胴の重さ）と、頭だけの短い圧
  addMono(body, noiseThump(rng, { dur: 0.9 * k, f: [f0 * 2.4, f0 * 1.05], attack: 0.002, decay: foot.decay * k * mat.thud, hp: 22 }), 0, 1);
  addMono(body, subThump(rng, { dur: 0.28, f0: f0 * 1.15, f1: f0 * 0.62, glide: 0.04, attack: 0.002, decay: 0.045 * foot.weight, drive: 1.6, punch: 0.6 }), 0, foot.sine);
  // かかと→つま先の二度当たり（後ろ足）
  if (contact.startsWith('heelToe')) {
    const gap = rng.range(0.05, 0.16) * k;
    addMono(body, noiseThump(rng, { dur: 0.5, f: [f0 * 3, f0 * 1.3], attack: 0.002, decay: foot.decay * 0.5 * k, hp: 30 }), len(gap), rng.range(0.3, 0.85));
    addMono(body, noiseBurst(rng, { dur: 0.2, decay: 0.03, color: 'pink', filters: [['bp', rng.logRange(c0, c1) * 1.2, 0.8]] }), len(gap), 0.4 * foot.crunch);
  }
  // 滑って踏み直す（slip）：足が少し滑り、0.18〜0.3 秒後にもう一度体重が乗る
  if (contact === 'slip') {
    const t2 = rng.range(0.18, 0.3) * k;
    addMono(body, noiseThump(rng, { dur: 0.7, f: [f0 * 2.2, f0], attack: 0.003, decay: foot.decay * 0.8 * k, hp: 22 }), len(t2), rng.range(0.55, 0.75));
    addMono(body, noiseBurst(rng, { dur: 0.3, decay: 0.05, color: 'pink', filters: [['bp', rng.logRange(c0, c1), 0.7]] }), len(t2), 0.5 * foot.crunch, rng.bi() * 0.4);
    addMono(body, whoosh(rng, { dur: t2, fPath: [[0, 900], [t2, 500]], qPath: [[0, 1.5]], points: [[0, 0], [t2 * 0.3, 1], [t2, 0.2]], color: 'pink' }), len(0.02), 0.25);
  }
  // 鈍い土の音（土の上は低く柔らかい）
  addMono(body, noiseBurst(rng, { dur: 0.4 * k, decay: 0.06 * k * mat.thud, color: 'pink', filters: [['lp', 380 * p, 0.9], ['lp', 460 * p, 0.7]] }), 0, 0.9 * mat.thud);
  // 瓦礫・コンクリートの上は、割れた塊が転がる
  const chunks = Math.round(mat.chunk * rng.range(0.5, 3.5));
  for (let c = 0; c < chunks; c++) addMono(body, chunkImpact(rng, { size: rng.range(0.1, 0.5), bounce: rng.chance(0.3) ? 0.3 : 0 }), len(rng.range(0.01, 0.25) * k), rng.range(0.2, 0.45), rng.bi() * 0.7);
  // 岩の皮（焔角）：体の板が揺れてぶつかる短い鳴り
  // r05-audio：雷翼の印＝たたんだ翼の膜の擦れ。踏むたびに体が揺れ、膜が短くはためく（中域の「ファサッ」）
  // r06-audio：軽く触れる手首（wristLight）は、膜のはためきが主役（長く強く）
  if (foot.rustle > 0) {
    const rl = rng.range(0.14, 0.26) * k * (contact === 'wristLight' ? 1.8 : 1);
    const rs = noiseBurst(rng, { dur: rl + 0.05, attack: rng.range(0.01, 0.03), decay: rl * 0.4, color: 'pink', filters: [['bp', rng.range(650, 1100) * p, 0.9]] });
    const fr = rng.range(28, 48);
    for (let i = 0; i < rs.length; i++) rs[i] *= 0.55 + 0.45 * Math.sin((2 * Math.PI * fr * i) / SR);
    addMono(body, norm(rs), len(rng.range(0.01, 0.06)), 0.4 * foot.rustle * (contact === 'wristLight' ? 1.6 : 1), rng.bi() * 0.4);
  }
  // r05-audio：焔角の印＝岩の皮の鳴りと、後から転がる礫。体の岩の板が2〜4枚ぶつかり、こぼれた石が少し遅れて落ちて跳ねる
  if (foot.rock > 0) {
    const plates = rng.int(1, 4);
    for (let c = 0; c < plates; c++) addMono(body, rockClack(rng, { size: rng.range(0.5, 0.9) }), len(rng.range(0.015, 0.12)), 0.5 * foot.rock * rng.range(0.6, 1), rng.bi() * 0.5);
    // 礫の数と落ちる時刻は変化ごとに大きく変える（包絡の形が揃わないように）
    pebbleRun(rng, body, { start: rng.range(0.08, 0.4) * k, window: rng.range(0.15, 0.5) * k, count: rng.int(2, 7), amp: 0.35 * foot.rock });
  }
  // 素材ごとの「後から起きること」（包絡の形を変化ごとに変える）：
  //   瓦礫＝踏んだ山が崩れて一塊こぼれる、コンクリート＝板が遅れて割れる、土＝土が沈んで落ち着く、舗装＝砂利が遅れて散る
  const late = rng.range(0.12, 0.38) * k;
  const matName = ground;
  if (matName === 'rubble') {
    grains(rng, body, { start: late, dur: rng.range(0.12, 0.3), rate: () => rng.range(250, 500), amp: () => 0.45, f: [300, 2500], tau: [0.004, 0.02], noisy: 0.9, spread: 0.8 });
    addMono(body, chunkImpact(rng, { size: rng.range(0.3, 0.7), bounce: 0.4 }), len(late + rng.range(0.05, 0.2)), 0.5, rng.bi() * 0.7);
  } else if (matName === 'concrete') {
    snaps(rng, body, { start: late * 0.5, count: rng.int(3, 7), window: 0.04, f: [900, 4500], amp: 0.55, spread: 0.5 });
    addMono(body, noiseThump(rng, { dur: 0.4, f: [240, 110], attack: 0.002, decay: 0.05, color: 'pink', hp: 60 }), len(late * 0.5), 0.45);
  } else if (matName === 'soil') {
    addMono(body, noiseBurst(rng, { dur: 0.35, attack: 0.03, decay: 0.08, color: 'pink', filters: [['lp', 700, 0.7], ['hp', 120, 0.7]] }), len(late * 0.6), 0.5);
  } else {
    grains(rng, body, { start: late * 0.7, dur: rng.range(0.1, 0.25), rate: () => rng.range(120, 260), amp: () => 0.3, f: [1200, 5000], tau: [0.002, 0.008], noisy: 0.9, spread: 1 });
  }
  // 爪を引きずる（後ろ足の半分ほど）
  if (contact === 'heelToeDrag' || contact === 'splayScrape') {
    const dragT = rng.range(0.06, 0.18) * k;
    const drag = whoosh(rng, { dur: rng.range(0.12, 0.3), fPath: [[0, rng.range(2400, 3400)], [0.3, rng.range(1500, 2200)]], qPath: [[0, 6]], points: [[0, 0], [0.02, 1], [0.2, 0.4], [0.3, 0]], color: 'white' });
    addMono(body, drag, len(dragT), 0.3 * foot.claws, rng.bi() * 0.5);
  }
  const tail = stereo(n);
  const [g0, g1] = mat.grains;
  const tailK = LONG.has(contact) ? rng.range(1.4, 1.7) : SHORT.has(contact) ? rng.range(0.35, 0.5) : rng.range(0.6, 1.3);
  const tailRate = rng.range(70, 170) * mat.grit;
  grains(rng, tail, { start: 0.02, dur: 1.1 * k * mat.tail * tailK, rate: (u) => tailRate * (1 - u) ** 2 + 4, amp: (u) => 0.42 * (1 - u) ** 1.4, f: [g0, g1], tau: [0.003, 0.012], spread: 0.9, noisy: 0.88 });
  if (foot.rumble > 0) addMono(tail, rumble(rng, { dur: 1.1 * k * foot.weight, cutoff: 100 * p, points: [[0, 0], [0.03, 0.6], [0.25 * k, 0.25], [1.1 * k * foot.weight, 0]], modRate: 4, modDepth: 0.4 }), 0, 0.45 * foot.rumble * (LONG.has(contact) ? 1.8 : SHORT.has(contact) ? 0.5 : 1));
  const kind = contact;
  // 踏んだ瞬間の山を柔らかく丸める（低い打撃の山が大きく、仕上げの制限器で数dB 沈んでいた。丸めると低音に倍音も付く）
  // 尾（散る破片と地鳴り）の強さも型で変える：踏みしめは長く残り、叩きつけやべた踏みはすぐ静まる
  const tailDb = LONG.has(contact) ? -1.5 : SHORT.has(contact) ? -11 : rng.range(-7, -3);
  const audio = layers({ core, body, tail }, { core: 0, body: 0, tail: tailDb });
  // r05-audio：怪獣ごとの声色（焔角は高域を落として岩の中域を、雷翼は低域を軽く、紅竜は爪の帯を前に）
  if (foot.eq) for (const ch of [audio.l, audio.r]) filt(ch, foot.eq);
  let pk = 0;
  for (const ch of [audio.l, audio.r]) for (let i = 0; i < ch.length; i++) pk = Math.max(pk, Math.abs(ch[i]));
  for (const ch of [audio.l, audio.r]) {
    for (let i = 0; i < ch.length; i++) ch[i] /= pk;
    softclip(ch, 1.7);
  }
  return {
    audio,
    layers: { core: `${kind}+${ground}-crunch`, body: `noise-thump ${Math.round(f0)}Hz×${Math.round(k * 100)}%${chunks ? `+${chunks}-chunks` : ''}`, tail: 'debris+short-rumble' },
  };
}

/** 羽ばたき：芯＝膜が張る破裂とはためき、胴＝押し出す空気の圧と風切り、尾＝残る乱流。変化ごとに長さ・高さ・はためきの数を変える。 */
/** 羽ばたきの形の型（変化の番号で必ず全部の型が出る）：snap＝鋭く張る、swell＝膜にためてふくらむ、double＝打ち下ろしと返しの二度押し */
const FLAP_SHAPES = ['snap', 'swell', 'double', 'swell-double'];

export function flap(rng, M, variant = 0) {
  const shape = FLAP_SHAPES[variant % FLAP_SHAPES.length];
  const W = M.wings;
  const k = rng.range(0.78, 1.25) * W.area ** 0.35;
  const p = rng.range(0.86, 1.15);
  const n = len(1.9 * k);
  const core = stereo(n);
  const snap = noiseBurst(rng, { dur: 0.22 * k, attack: 0.003, decay: 0.04 * k, color: 'pink', filters: [['bp', rng.range(380, 520) * p / W.area ** 0.25, 0.8], ['lowShelf', 160, 6]] });
  addMono(core, snap, 0, 0.9);
  // 膜の端がはためく：数（2〜6回）と速さを変える
  const flutterLen = len(rng.range(0.1, 0.24) * k);
  const flutter = white(rng, flutterLen);
  filt(flutter, [['bp', rng.range(700, 1300) * p, 1]]);
  const fr = rng.range(22, 48);
  for (let i = 0; i < flutter.length; i++) flutter[i] *= (0.5 + 0.5 * Math.sin((2 * Math.PI * fr * i) / 48000)) * (1 - i / flutter.length);
  addMono(core, norm(flutter), len(rng.range(0.005, 0.03)), rng.range(0.25, 0.5), rng.bi() * 0.3);
  // 翼の先が遅れて返る二度目の張り（半分ほどの変化で）
  if (rng.chance(0.5)) addMono(core, noiseBurst(rng, { dur: 0.15, attack: 0.002, decay: 0.03, color: 'pink', filters: [['bp', rng.range(600, 900) * p, 0.9]] }), len(rng.range(0.09, 0.2) * k), rng.range(0.3, 0.55), rng.bi() * 0.4);
  const body = stereo(n);
  addMono(body, noiseThump(rng, { dur: 0.7 * k, f: [W.pressure * 3.2 * p, W.pressure * 1.4 * p], attack: 0.012, decay: 0.12 * W.area * k, color: 'pink', hp: 25 }), 0, 0.85);
  addMono(body, subThump(rng, { dur: 0.3, f0: W.pressure * 1.25 * p, f1: W.pressure * 0.8 * p, glide: 0.05, attack: 0.01, decay: 0.05, drive: 1.3 }), 0, 0.35);
  const top = rng.range(750, 1100) * p;
  // 押し出す空気：すぐ抜ける（鋭い）か、膜にためてから抜ける（ふくらむ）か
  const swell = shape.startsWith('swell');
  const airPeak = swell ? rng.range(0.14, 0.26) * k : 0.025;
  const air = whoosh(rng, { dur: 0.9 * k, fPath: [[0, top], [0.12 * k, top * 0.42], [0.55 * k, top * 0.17]], qPath: [[0, rng.range(0.6, 1.1)]], points: [[0, 0], [airPeak, 1], [airPeak + rng.range(0.1, 0.3) * k, 0.5], [0.8 * k, 0]] });
  addMono(body, air, 0, 0.7, rng.bi() * 0.15);
  // 翼を返すときの二度目の押し（弱い）：半分ほどの変化で、来る時刻を変える
  if (shape.endsWith('double')) addMono(body, noiseThump(rng, { dur: 0.5, f: [W.pressure * 3 * p, W.pressure * 1.5 * p], attack: 0.02, decay: 0.08, color: 'pink', hp: 30 }), len(rng.range(0.2, 0.38) * k), rng.range(0.5, 0.8), rng.bi() * 0.3);
  const tailLen = rng.range(0.9, 1.9) * k;
  const tail = toStereo(whoosh(rng, { dur: tailLen, fPath: [[0, 420 * p], [tailLen, 130 * p]], qPath: [[0, 0.6]], points: [[0, 0], [rng.range(0.08, 0.3), rng.range(0.4, 0.8)], [tailLen * 0.4, 0.3], [tailLen, 0]], color: 'brown' }), rng.bi() * 0.3);
  return { audio: layers({ core, body, tail }, { core: shape === 'snap' ? 0 : -3, body: 0, tail: rng.range(-11, -6) }), layers: { core: 'membrane-snap+flutter', body: `air-pressure(noise)+whoosh(${shape})`, tail: 'turbulence' } };
}

/** 着地。heavy で急降下の地響き（圧が深く、破片が多く、遠くまで抜ける）。ctx.ir は残響の素。M.land で怪獣ごとの足し物（雷・岩の板）。 */
export function land(rng, M, ctx, { heavy = false, variant = 0 } = {}) {
  const F = M.feet.hind;
  const L = M.land ?? {};
  const mat = GROUND[groundOf(variant + 1)];
  const k = rng.range(0.85, 1.18);
  const total = (heavy ? 5.2 : 3.6) * k * (L.length ?? 1);
  const n = len(total);
  const core = stereo(n);
  addMono(core, noiseBurst(rng, { dur: 0.1, decay: 0.014, filters: [['hp', 1400, 0.7]] }), 0, 0.6);
  addMono(core, noiseBurst(rng, { dur: 0.4, decay: heavy ? 0.1 : 0.07, color: 'pink', filters: [['bp', rng.logRange(mat.crunch[0] * 0.6, mat.crunch[1] * 0.6), 0.8], ['lowShelf', 180, 5]] }), 0, 0.9);
  snaps(rng, core, { start: 0.004, count: Math.round((heavy ? 12 : 7) * mat.grit + 2), window: heavy ? 0.2 : 0.13, f: [700, 5000], amp: 0.5, spread: 0.9 });
  const body = stereo(n);
  const f0 = (heavy ? 40 : 47) * (F.f0 / 54) * rng.range(0.9, 1.1);
  // 圧：頭だけ下降する正弦、あとは雑音の打撃
  addMono(body, subThump(rng, { dur: heavy ? 0.9 : 0.6, f0, f1: heavy ? 22 : 26, glide: heavy ? 0.12 : 0.09, attack: 0.003, decay: heavy ? 0.22 : 0.14, drive: heavy ? 2.4 : 2 }), 0, 0.75 * (L.low ?? 1));
  addMono(body, noiseThump(rng, { dur: heavy ? 2.4 : 1.6, f: [f0 * 3, f0 * 1.2], attack: 0.003, decay: heavy ? 0.5 : 0.3, hp: 20 }), 0, 0.9 * (L.low ?? 1));
  if (heavy) addMono(body, noiseThump(rng, { dur: 1.4, f: [f0 * 2, f0], attack: 0.01, decay: 0.35, hp: 20 }), len(rng.range(0.13, 0.19)), 0.55);
  addMono(body, rumble(rng, { dur: total, cutoff: 170, points: [[0, 0], [0.015, 1], [0.6, 0.45], [heavy ? 2.4 : 1.6, 0]], modRate: 5, modDepth: 0.5 }), 0, 0.6);
  grains(rng, body, { start: 0.01, dur: (heavy ? 1.6 : 1.1) * k, rate: (u) => (heavy ? 900 : 550) * mat.grit * (1 - u) ** 3 + 20, amp: (u) => 0.5 * (1 - u) ** 1.2, f: [280, 5000], tau: [0.003, 0.025], noisy: 0.85, spread: 1 });
  const chunks = Math.round((heavy ? 10 : 4) * (0.4 + mat.chunk));
  for (let c = 0; c < chunks; c++) addMono(body, chunkImpact(rng, { size: rng.range(0.3, 1), bounce: rng.chance(0.4) ? 0.35 : 0 }), len(0.03 + rng.next() ** 1.5 * (heavy ? 1.6 : 1)), rng.range(0.25, 0.55), rng.bi() * 0.8);
  // 岩の板が揺れてぶつかる（焔角）。r05-audio：石の「コッ」に替え、こぼれた礫が後から跳ねる
  if (L.rock) {
    for (let c = 0; c < (heavy ? 6 : 3); c++) addMono(body, rockClack(rng, { size: rng.range(0.6, 1) }), len(rng.range(0.02, 0.3)), 0.5 * L.rock, rng.bi() * 0.6);
    pebbleRun(rng, body, { start: rng.range(0.25, 0.45), window: heavy ? 1 : 0.6, count: heavy ? rng.int(6, 10) : rng.int(3, 5), amp: 0.4 * L.rock, size: [0.15, 0.45], spread: 1 });
  }
  // r05-audio：紅竜の印＝爪が地面に食い込んで擦れる（着地の勢いを爪で止める）
  if (L.claws) {
    const dig = whoosh(rng, { dur: 0.45, fPath: [[0, rng.range(3200, 4200)], [0.4, rng.range(1800, 2400)]], qPath: [[0, 5]], points: [[0, 0], [0.015, 1], [0.25, 0.45], [0.45, 0]], color: 'white' });
    addMono(core, dig, len(rng.range(0.01, 0.04)), 0.5 * L.claws, rng.bi() * 0.4);
    snaps(rng, core, { start: 0.006, count: rng.int(4, 7), window: 0.07, f: [2400, 5600], amp: 0.6 * L.claws, spread: 0.6, ring: [0.003, 0.008] });
  }
  // r05-audio：翼のある怪獣は、着地の瞬間に翼を広げて空気を受ける（膜が張る「バサッ」）
  if (L.wings) {
    const flare = noiseBurst(rng, { dur: 0.35, attack: 0.004, decay: 0.07, color: 'pink', filters: [['bp', rng.range(380, 560), 0.8], ['lowShelf', 160, 4]] });
    addMono(core, flare, len(rng.range(0.03, 0.08)), 0.7 * L.wings, rng.bi() * 0.3);
  }
  const tail = stereo(n);
  addMono(tail, rumble(rng, { dur: total, cutoff: 80, points: [[0, 0], [0.05, 0.7], [0.8, 0.5], [total, 0]], modRate: 2.5, modDepth: 0.45 }), 0, 0.8);
  grains(rng, tail, { start: 0.4, dur: total - 0.6, rate: (u) => 40 * (1 - u) ** 2 + 3, amp: (u) => 0.26 * (1 - u) ** 1.5, f: [600, 5000], tau: [0.003, 0.012], noisy: 0.88, spread: 1 });
  let audio = layers({ core, body, tail }, { core: -4, body: 0, tail: -6 });
  // r05-audio：怪獣ごとの声色（足音と同じ考え方）
  if (L.eq) for (const ch of [audio.l, audio.r]) filt(ch, L.eq);
  // 雷翼の重い着地：着地点に落ちる雷（裂ける音と、転がる雷鳴）
  if (heavy && L.thunder) {
    const th = thunderclap(rng, { dur: 4.5, near: true });
    audio = layers({ a: audio, b: th }, { a: 0, b: -1 });
  }
  // 尾：重い着地は街の向こうまで響かせる
  const ir = heavy ? ctx.ir.far : ctx.ir.mid;
  audio = padTail(audio, heavy ? 2.5 : 1.6);
  const wet = reverbStereo(audio, ir);
  const w = heavy ? 0.32 : 0.2;
  for (let i = 0; i < audio.l.length; i++) {
    audio.l[i] += wet.l[i] * w;
    audio.r[i] += wet.r[i] * w;
  }
  return { audio, layers: { core: `ground-crack+slam${L.claws ? '+claw-dig' : ''}${L.wings ? '+wing-flare' : ''}`, body: `head ${Math.round(f0)}Hz+noise-thump+rumble+${chunks}-chunks${L.rock ? '+rock-plates+pebbles' : ''}`, tail: `rumble+trickle+${heavy ? 'far' : 'mid'}-reverb${heavy && L.thunder ? '+thunder' : ''}` } };
}

/**
 * 雷鳴（ステレオ）：裂ける音（ごく短い破裂の連なり）→ 近いほど鋭い「バリッ」→ 低く転がる雷鳴。
 * 雷翼の重い着地と雷の息の跳ねに使う。near で近い（高域が残り、転がりが短い）。
 */
export function thunderclap(rng, { dur = 4, near = true } = {}) {
  const n = len(dur);
  const out = stereo(n);
  // 裂ける音：20〜60ms の間に破裂が数十
  snaps(rng, out, { start: 0, count: near ? rng.int(24, 40) : rng.int(8, 14), window: rng.range(0.03, 0.07), f: near ? [1800, 9000] : [600, 2500], amp: 0.8, spread: 0.8, ring: [0.001, 0.004] });
  addMono(out, noiseBurst(rng, { dur: 0.35, attack: 0.001, decay: near ? 0.04 : 0.08, filters: [['hp', near ? 700 : 200, 0.7]] }), 0, near ? 0.9 : 0.5);
  // 雷鳴：ピンク雑音を低く絞り、ばらばらの塊で転がす
  const roll = pink(rng, n);
  filt(roll, [['lp', near ? 900 : 400, 0.7], ['hp', 30, 0.7]]);
  const am = new Float32Array(n);
  let t = rng.range(0.05, 0.12);
  while (t < dur - 0.3) {
    const a = Math.round(t * SR);
    const L = len(rng.range(0.15, 0.6));
    const g = rng.range(0.4, 1) * Math.exp(-t / (dur * 0.4));
    for (let i = 0; i < L && a + i < n; i++) am[a + i] = Math.max(am[a + i], g * Math.sin((Math.PI * i) / L));
    t += rng.range(0.12, 0.45);
  }
  const e = env(n, [[0, 0], [0.02, 0.4], [0.2, 1], [dur * 0.5, 0.5], [dur, 0]]);
  for (let i = 0; i < n; i++) roll[i] *= (0.35 + 0.65 * am[i]) * e[i];
  norm(roll);
  addMono(out, roll, len(0.01), near ? 0.8 : 1, rng.bi() * 0.3);
  addMono(out, noiseThump(rng, { dur: 1.2, f: [110, 45], attack: 0.004, decay: 0.3, hp: 24 }), len(0.015), near ? 0.7 : 0.5);
  return out;
}

/**
 * 振り（爪・尾）：動く帯域の風切り。heavy で尾（遅く、低く、長い）。向きは左から右へ流す。
 * 山の時刻は当たりの瞬間（爪 0.198 秒・尾 0.31 秒）に固定し、変化ごとに山の後の長さ（±25%）・高さ（±15%）・細い風切りの数を変える。
 */
/** 振りの形の型（変化の番号で必ず全部の型が出る）：stop＝ぴたりと止める、trail＝長く空気を引きずる、back＝振り抜いた後に小さく返す */
const SWING_SHAPES = ['stop', 'trail', 'stop-back', 'trail-back'];

export function swing(rng, { heavy = false, variant = 0 } = {}) {
  const shape = SWING_SHAPES[variant % SWING_SHAPES.length];
  // 山（振りかぶりの始まりから）：爪は振りかぶり 0.2 秒、尾は 0.3 秒（config/attacks.ts）
  const peakT = heavy ? 0.31 : 0.198;
  const k = rng.range(0.7, 1.35);
  const p = rng.range(0.86, 1.15);
  const d = peakT + (heavy ? 0.55 : 0.352) * k;
  const n = len(d + 0.3);
  const top = (heavy ? rng.range(600, 800) : rng.range(1300, 1800)) * p;
  const start = (heavy ? 170 : 330) * p * rng.range(0.85, 1.15);
  const main = whoosh(rng, {
    dur: d + 0.3,
    fPath: [[0, start], [peakT, top], [d, (heavy ? 240 : 520) * p]],
    qPath: [[0, rng.range(1.1, 1.7)], [peakT, (heavy ? 2.2 : 3) * rng.range(0.8, 1.25)], [d, 1.3]],
    // 振りかぶりの始まりから聞こえるよう、頭をわずかに鳴らしておく（0 から始めると立ち上がりが 20ms 遅れて聞こえた）
    // 振り抜き：ぴたりと止める（山の直後に落ちる）か、長く空気を引きずるか
    points: shape.startsWith('stop')
      ? [[0, rng.range(0.1, 0.35)], [peakT * rng.range(0.45, 0.8), rng.range(0.3, 0.7)], [peakT, 1], [peakT + 0.06, rng.range(0.12, 0.25)], [d, 0.04], [d + 0.3, 0]]
      : [[0, rng.range(0.1, 0.35)], [peakT * rng.range(0.45, 0.8), rng.range(0.3, 0.7)], [peakT, 1], [peakT + (d - peakT) * rng.range(0.4, 0.7), rng.range(0.35, 0.6)], [d, 0.1], [d + 0.3, 0]],
    color: heavy ? 'pink' : rng.chance(0.5) ? 'white' : 'pink',
  });
  // 振り抜いた後の返し（半分ほどの変化で、山の後に小さな二つ目の風切り）
  if (shape.endsWith('back')) {
    const t2 = peakT + rng.range(0.08, 0.3) * k;
    const back = whoosh(rng, { dur: 0.3, fPath: [[0, top * 0.6], [0.12, top * 0.8], [0.3, top * 0.35]], qPath: [[0, 1.6]], points: [[0, 0], [0.1, 1], [0.3, 0]], color: 'pink' });
    const g = rng.range(0.3, 0.7);
    const a0 = len(t2);
    for (let i = 0; i < back.length && a0 + i < main.length; i++) main[a0 + i] += back[i] * g;
  }
  const width = rng.range(0.3, 0.6);
  const out = panMove(main, [[0, -width], [d, width]]);
  if (!heavy) {
    // 爪の細い風切り（2〜4本、ずれ方を変える）
    const fines = rng.int(2, 4);
    for (let c = 0; c < fines; c++) {
      const lag = rng.range(0.004, 0.02) * c;
      const fine = whoosh(rng, { dur: d, fPath: [[0, (1500 + 500 * c) * p], [peakT, (4200 + 700 * c) * p], [d, 2000 * p]], qPath: [[0, rng.range(4, 7)]], points: [[0, 0], [peakT * 0.83 + lag, 0], [peakT * 1.05 + lag, 1], [peakT * 1.65 + lag, 0]], color: 'white' });
      const s = panMove(fine, [[0, -0.3], [d, 0.5]]);
      const g = rng.range(0.16, 0.26);
      for (let i = 0; i < s.l.length; i++) {
        out.l[i] += s.l[i] * g;
        out.r[i] += s.r[i] * g;
      }
    }
  } else {
    // 尾の先が空気を打つ「ピシッ」（止める型だけ）
    if (shape.startsWith('stop')) {
      const whip = noiseBurst(rng, { dur: 0.08, attack: 0.001, decay: 0.008, filters: [['hp', 1500, 0.7], ['peak', rng.range(2500, 4000), 1.2, 5]] });
      const a0 = len(peakT + rng.range(-0.01, 0.02));
      for (let i = 0; i < whip.length && a0 + i < main.length; i++) main[a0 + i] += whip[i] * rng.range(0.5, 0.8);
    }
    // 尾の太い胴の唸り（雑音を低く絞る）
    const hum = noiseThump(rng, { dur: d + 0.2, f: [120 * p, 70 * p], attack: peakT * 0.9, decay: (shape.startsWith('stop') ? 0.07 : 0.3) * k, color: 'pink', hp: 30 });
    addMono(out, hum, 0, shape.startsWith('stop') ? 0.35 : 0.6);
    if (rng.chance(0.5)) {
      const s = sine(n, rng.range(48, 60) * p);
      mul(s, env(n, [[0, 0], [peakT * 0.9, 0.2], [peakT * 1.3, 1], [d * 0.9, 0]]));
      addMono(out, softclip(s, 1.5), 0, 0.25);
    }
  }
  return { audio: out, layers: { core: 'whoosh-peak', body: heavy ? 'broad-whoosh+noise-hum' : 'whoosh+claw-fines', tail: `${shape}×${Math.round(k * 100)}%` } };
}

/** 当たり（爪・尾）：芯＝割れる破裂、胴＝雑音の打撃と砕ける塊（爪は壁を引っかく）、尾＝落ちる破片と塊。 */
export function hit(rng, { heavy = false } = {}) {
  const k = rng.range(0.85, 1.2);
  const p = rng.range(0.88, 1.12);
  const n = len((heavy ? 2.6 : 2.0) * k);
  const core = stereo(n);
  snaps(rng, core, { start: 0, count: rng.int(heavy ? 6 : 7, heavy ? 10 : 12), window: rng.range(0.035, 0.07), f: [1400, 7000], amp: 0.9, spread: 0.7 });
  addMono(core, noiseBurst(rng, { dur: 0.12, decay: 0.02, filters: [['hp', 800, 0.7]] }), 0, 0.6);
  const body = stereo(n);
  // 頭の短い圧（正弦は 0.25 秒だけ）と、雑音の打撃
  addMono(body, subThump(rng, { dur: 0.25, f0: (heavy ? 72 : 88) * p, f1: (heavy ? 44 : 54) * p, glide: 0.04, attack: 0.002, decay: heavy ? 0.06 : 0.04, drive: 2 }), 0, 0.45);
  addMono(body, noiseThump(rng, { dur: 0.9 * k, f: [(heavy ? 170 : 220) * p, (heavy ? 65 : 85) * p], attack: 0.002, decay: (heavy ? 0.2 : 0.13) * k, hp: 26 }), 0, 1);
  addMono(body, noiseBurst(rng, { dur: 0.5, decay: (heavy ? 0.13 : 0.1) * k, color: 'pink', filters: [['bp', rng.range(550, 900), 0.6]] }), 0, 0.75);
  // 壁から剥がれる塊
  const chunks = rng.int(heavy ? 3 : 2, heavy ? 6 : 4);
  for (let c = 0; c < chunks; c++) addMono(body, chunkImpact(rng, { size: rng.range(0.3, heavy ? 1 : 0.7), bounce: rng.chance(0.4) ? 0.35 : 0 }), len(rng.range(0.005, 0.12)), rng.range(0.3, 0.6), rng.bi() * 0.7);
  if (!heavy) {
    // 爪が壁を引っかく：高い共鳴が下がりながらざらつく
    const scr = whoosh(rng, { dur: 0.4 * k, fPath: [[0, rng.range(2600, 3200)], [0.35 * k, rng.range(1500, 1900)]], qPath: [[0, 9]], points: [[0, 0], [0.02, 1], [0.3 * k, 0.5], [0.4 * k, 0]], color: 'white' });
    const jag = rng.range(50, 75);
    for (let i = 0; i < scr.length; i++) scr[i] *= 0.6 + 0.4 * Math.sin((2 * Math.PI * jag * i) / 48000);
    addMono(body, scr, len(0.01), 0.35, 0.2);
  } else if (rng.chance(0.5)) {
    // 尾の当たりで鉄骨がきしむ
    addMono(body, creak(rng, { dur: 0.9, episodes: 2, base: [500, 800], len: [0.15, 0.4] }), len(0.05), 0.25, rng.bi() * 0.4);
  }
  const tail = stereo(n);
  grains(rng, tail, { start: 0.02, dur: (heavy ? 1.8 : 1.4) * k, rate: (u) => 260 * (1 - u) ** 2.5 + 8, amp: (u) => 0.3 * (1 - u) ** 1.3, f: [350, 5500], tau: [0.003, 0.02], noisy: 0.85, spread: 1 });
  grains(rng, tail, { start: 0.12, dur: (heavy ? 1.2 : 0.9) * k, rate: () => (heavy ? 11 : 7), amp: (u) => 0.45 * (1 - u), f: [110, 360], tau: [0.025, 0.06], noisy: 0.7, spread: 0.8 });
  return { audio: layers({ core, body, tail }, { core: -3, body: 0, tail: -4 }), layers: { core: 'fracture-snaps', body: `${heavy ? 'thud' : 'thud+scrape'}(noise)+${chunks}-chunks`, tail: 'debris+chunks' } };
}

/** 急降下の叫びなどに使う、ゆっくり膨らむ風（着地の直前の前触れ）。 */
export function diveWind(rng) {
  const n = len(2.4);
  const w = whoosh(rng, { dur: 2.4, fPath: [[0, 300], [2.0, 1400], [2.4, 900]], qPath: [[0, 0.9]], points: [[0, 0], [1.8, 1], [2.4, 0]], color: 'pink' });
  const s = stereo(n);
  const w2 = pink(rng, n);
  filt(w2, [['hp', 2500, 0.7]]);
  mul(w2, env(n, [[0, 0], [2.0, 0.25], [2.4, 0]]));
  addMono(s, w, 0, 1);
  addMono(s, norm(w2), 0, 0.3, 0.2);
  return { audio: s, layers: { core: 'none', body: 'rising-whoosh', tail: 'hiss' } };
}
