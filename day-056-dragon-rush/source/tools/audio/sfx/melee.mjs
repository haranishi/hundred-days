// OWNER: audio-tools
// 怪獣ごとの近い技の音（r05-audio）：右クリックの「近くの一撃」と Q の「周りを払う」の、振り（風切り）と当たり。
// 振りは振りかぶりの始まりから鳴らし、山を当たりの瞬間（その怪獣の振りかぶりの秒数＝monsters.mjs の melee.*.peak）に置く。
// 紅竜の爪と尾は body.mjs の swing・hit（r04 までの attack/ と同じ作り）。ここは雷翼と焔角の4つずつ。
//   雷翼：翼の打ち据え＝膜が張る破裂と風、尾の鞭＝細く速い風切りと鋭い破裂（翼竜は爪が弱い：当たりの胴は軽い）
//   焔角：角の突き上げ＝石の打撃と砕け（爪の引っかきは無い）、尾の鎚＝低く重い打撃（尾の先の岩）
// どれも「芯・胴・尾」の3層で作る。変化の番号で形の型（止める・引きずる・返す）が必ず全部出る。
import { SR, addMono, brown, env, filt, len, mul, softclip, stereo, wander } from '../lib/dsp.mjs';
import { chunkImpact, grains, layers, noiseBurst, noiseThump, norm, panMove, pebbleRun, rockClack, rumble, snaps, subThump, whoosh } from '../lib/sfxkit.mjs';

const SHAPES = ['stop', 'trail', 'stop-back', 'trail-back'];

/** 振りの包絡の折れ線：頭をわずかに鳴らし（振りかぶりの始まりから聞こえる）、山の時刻に 1、型で振り抜きを変える。 */
function swingPoints(rng, shape, peak, d) {
  const lead = [[0, rng.range(0.08, 0.3)], [peak * rng.range(0.45, 0.8), rng.range(0.3, 0.65)], [peak, 1]];
  return shape.startsWith('stop')
    ? [...lead, [peak + 0.05, rng.range(0.1, 0.22)], [d, 0.03], [d + 0.25, 0]]
    : [...lead, [peak + (d - peak) * rng.range(0.4, 0.7), rng.range(0.35, 0.6)], [d, 0.08], [d + 0.25, 0]];
}

/** 振り抜いた後の小さな返し（back の型）。main に足す。 */
function addBack(rng, main, at, top) {
  const back = whoosh(rng, { dur: 0.3, fPath: [[0, top * 0.6], [0.12, top * 0.8], [0.3, top * 0.35]], qPath: [[0, 1.4]], points: [[0, 0], [0.1, 1], [0.3, 0]], color: 'pink' });
  const g = rng.range(0.3, 0.6);
  const a0 = len(at);
  for (let i = 0; i < back.length && a0 + i < main.length; i++) main[a0 + i] += back[i] * g;
}

function addInto(out, s, g = 1) {
  for (let i = 0; i < s.l.length && i < out.l.length; i++) {
    out.l[i] += s.l[i] * g;
    out.r[i] += s.r[i] * g;
  }
}

// ------------------------------------------------------------ 雷翼

/** 翼の打ち据えの振り：大きな膜の翼が空気を押しのける太い風切りと、膜の縁のはためき、山で押し出す空気の圧。 */
export function wingSwing(rng, { peak = 0.26, variant = 0 } = {}) {
  const shape = SHAPES[variant % SHAPES.length];
  const k = rng.range(0.7, 1.35);
  const p = rng.range(0.88, 1.13);
  const d = peak + 0.55 * k;
  const top = rng.range(560, 760) * p;
  const main = whoosh(rng, { dur: d + 0.3, fPath: [[0, 210 * p], [peak, top], [d, 260 * p]], qPath: [[0, rng.range(0.7, 1)], [peak, rng.range(1, 1.4)], [d, 0.8]], points: swingPoints(rng, shape, peak, d), color: 'pink' });
  if (shape.endsWith('back')) addBack(rng, main, peak + rng.range(0.1, 0.28) * k, top);
  const width = rng.range(0.35, 0.6);
  const out = panMove(main, [[0, -width], [d, width]]);
  // 引きずる型は、打ち下ろす前に翼を持ち上げる小さな風から入る（頭の形を変化ごとに変える）
  if (shape.startsWith('trail')) addMono(out, whoosh(rng, { dur: peak * 0.7, fPath: [[0, 380 * p], [peak * 0.7, 240 * p]], qPath: [[0, 1]], points: [[0, 0], [peak * 0.2, 1], [peak * 0.7, 0]], color: 'pink' }), 0, rng.range(0.35, 0.6), -width);
  // 膜の縁のはためき（山の少し前から、22〜45 回／秒）
  const fl = noiseBurst(rng, { dur: peak * 0.6 + 0.25, attack: peak * 0.35, decay: 0.08, color: 'pink', filters: [['bp', rng.range(750, 1250) * p, 1]] });
  const fr = rng.range(22, 45);
  for (let i = 0; i < fl.length; i++) fl[i] *= 0.5 + 0.5 * Math.sin((2 * Math.PI * fr * i) / SR);
  addMono(out, norm(fl), len(peak * rng.range(0.3, 0.6)), rng.range(0.2, 0.55), rng.bi() * 0.3);
  // 山で押し出す空気の圧（羽ばたきの胴と同じ作り）
  addMono(out, noiseThump(rng, { dur: 0.6, f: [120 * p, 55 * p], attack: 0.012, decay: 0.1 * k, color: 'pink', hp: 25 }), len(Math.max(0, peak - 0.03)), 0.55);
  return { audio: out, layers: { core: 'membrane-flutter', body: 'broad-wing-whoosh+air-push', tail: `${shape}×${Math.round(k * 100)}%` } };
}

/** 翼の打ち据えの当たり：膜が張って弾ける「パンッ」と、押し寄せる風。翼は軽いので胴の打撃は弱く、外壁の砕けも少ない。 */
export function wingHit(rng) {
  const k = rng.range(0.85, 1.2);
  const p = rng.range(0.88, 1.12);
  const n = len(2.2 * k);
  const core = stereo(n);
  addMono(core, noiseBurst(rng, { dur: 0.25, attack: 0.0015, decay: rng.range(0.022, 0.035), color: 'pink', filters: [['bp', rng.range(420, 620) * p, 0.8], ['lowShelf', 160, 5]] }), 0, 1, rng.bi() * 0.2);
  // 膜の張りの二度目（翼の先が遅れて当たる）
  const echoes = rng.int(0, 2);
  for (let e = 0; e < echoes; e++) addMono(core, noiseBurst(rng, { dur: 0.15, attack: 0.002, decay: 0.02, color: 'pink', filters: [['bp', rng.range(650, 950) * p, 0.9]] }), len(rng.range(0.03, 0.14)), rng.range(0.35, 0.65), rng.bi() * 0.5);
  snaps(rng, core, { start: 0.003, count: rng.int(3, 9), window: rng.range(0.03, 0.1), f: [1200, 5000], amp: 0.5, spread: 0.8 });
  const body = stereo(n);
  // 押し寄せる風（当たった後に膜が押しのけた空気）。長さと山の位置を変化ごとに変える
  const gl = rng.range(0.4, 1) * k;
  const gust = whoosh(rng, { dur: gl, fPath: [[0, rng.range(900, 1300) * p], [gl * 0.85, 320 * p]], qPath: [[0, 0.8]], points: [[0, 0], [rng.range(0.03, 0.12), 1], [gl * rng.range(0.3, 0.55), 0.45], [gl, 0]], color: 'pink' });
  addMono(body, gust, len(rng.range(0.005, 0.04)), rng.range(0.5, 0.85), rng.bi() * 0.3);
  addMono(body, noiseThump(rng, { dur: 0.5, f: [220 * p, 95 * p], attack: 0.002, decay: 0.07 * k, color: 'pink', hp: 40 }), 0, 0.55);
  for (let c = 0; c < rng.int(1, 3); c++) addMono(body, chunkImpact(rng, { size: rng.range(0.15, 0.45), bounce: rng.chance(0.4) ? 0.3 : 0 }), len(rng.range(0.03, 0.2)), rng.range(0.25, 0.45), rng.bi() * 0.8);
  const tail = stereo(n);
  grains(rng, tail, { start: 0.04, dur: 1.1 * k, rate: (u) => 150 * (1 - u) ** 2.5 + 6, amp: (u) => 0.26 * (1 - u) ** 1.3, f: [600, 6000], tau: [0.003, 0.014], noisy: 0.85, spread: 1 });
  return { audio: layers({ core, body, tail }, { core: 0, body: -2, tail: -5 }), layers: { core: 'membrane-snap×2+snaps', body: 'gust+light-thud', tail: 'light-debris' } };
}

/** 尾の鞭の振り：細い尾の先が速く空気を切る高い風切り（2本）と、山で先が空気を打つ小さな「ピッ」。 */
export function whipSwing(rng, { peak = 0.24, variant = 0 } = {}) {
  const shape = SHAPES[variant % SHAPES.length];
  const k = rng.range(0.75, 1.25);
  const p = rng.range(0.88, 1.13);
  const d = peak + 0.22 * k;
  const n = len(d + 0.25);
  const top = rng.range(4000, 5600) * p;
  const pts = shape.startsWith('stop')
    ? [[0, rng.range(0.04, 0.12)], [peak * 0.7, rng.range(0.15, 0.3)], [peak, 1], [peak + 0.03, 0.15], [d, 0.02], [d + 0.2, 0]]
    : [[0, rng.range(0.04, 0.12)], [peak * 0.7, rng.range(0.15, 0.3)], [peak, 1], [peak + 0.08 * k, 0.45], [d, 0.06], [d + 0.2, 0]];
  const main = whoosh(rng, { dur: d + 0.25, fPath: [[0, 900 * p], [peak, top], [d, 1800 * p]], qPath: [[0, rng.range(4, 6)], [peak, rng.range(6, 9)], [d, 4]], points: pts, color: 'white' });
  if (shape.endsWith('back')) addBack(rng, main, peak + rng.range(0.06, 0.16) * k, top * 0.5);
  const out = panMove(main, [[0, 0.5], [d, -0.5]]);
  // 先の細い線（少し遅れて、もっと高く）
  const tip = whoosh(rng, { dur: d, fPath: [[0, 1800 * p], [peak, top * 1.4], [d, 3000 * p]], qPath: [[0, 8]], points: [[0, 0], [peak * 0.8, 0], [peak * 1.04, 1], [peak * 1.4, 0]], color: 'white' });
  addInto(out, panMove(tip, [[0, 0.3], [d, -0.6]]), rng.range(0.25, 0.4));
  const crackAt = len(peak + rng.range(-0.005, 0.012));
  const pish = noiseBurst(rng, { dur: 0.05, attack: 0.0005, decay: 0.004, filters: [['hp', 2500, 0.7], ['peak', rng.range(3500, 5000), 1.2, 6]] });
  addMono(out, pish, crackAt, rng.range(0.3, 0.5), rng.bi() * 0.3);
  return { audio: out, layers: { core: 'tip-pish', body: 'thin-fast-whoosh×2', tail: `${shape}×${Math.round(k * 100)}%` } };
}

/** 尾の鞭の当たり：鋭く乾いた「パシッ」（細かな破裂の密な束）と、外壁を細く切り裂く擦れ。胴は軽い。 */
export function whipHit(rng, variant = 0) {
  const k = rng.range(0.8, 1.25);
  const n = len(1.9 * k);
  const core = stereo(n);
  // 打ち方の型：一度で鋭く・二度打ち（先が跳ねてもう一度当たる）・擦りながら・向かいの壁から跳ね返る
  const form = ['clean', 'double', 'drag', 'echo'][variant % 4];
  const crack = (at, g) => {
    const c = stereo(n);
    snaps(rng, c, { start: 0, count: rng.int(8, 16), window: rng.range(0.008, 0.026), f: [2200, 9000], amp: 1, spread: 0.4, ring: [0.001, 0.004] });
    addMono(c, noiseBurst(rng, { dur: 0.06, attack: 0.0004, decay: 0.006, filters: [['hp', 1800, 0.7], ['peak', rng.range(3000, 4500), 1, 4]] }), 0, 0.9, rng.bi() * 0.2);
    for (const ch of [c.l, c.r]) softclip(ch, 2.2);
    const a = len(at);
    for (let i = 0; i + a < n; i++) {
      core.l[a + i] += c.l[i] * g;
      core.r[a + i] += c.r[i] * g;
    }
  };
  crack(0, 1);
  if (form === 'double') crack(rng.range(0.05, 0.11), rng.range(0.45, 0.7));
  if (form === 'echo') crack(rng.range(0.07, 0.14), rng.range(0.2, 0.32));
  // 細い尾が外壁を打つ中域の「パン」（同じピークのまま大きく聞こえる）
  addMono(core, noiseBurst(rng, { dur: 0.12, attack: 0.001, decay: rng.range(0.014, 0.03), color: 'pink', filters: [['bp', rng.range(800, 1300), 0.8]] }), 0, 0.75);
  const body = stereo(n);
  const sl = (form === 'drag' ? rng.range(0.35, 0.5) : rng.range(0.14, 0.26)) * k;
  const slit = whoosh(rng, { dur: sl, fPath: [[0, rng.range(3200, 4200)], [sl * 0.9, rng.range(1400, 2000)]], qPath: [[0, 7]], points: [[0, 0], [0.008, 1], [sl * 0.55, 0.45], [sl, 0]], color: 'white' });
  addMono(body, slit, len(0.004), form === 'drag' ? 0.85 : 0.65, rng.bi() * 0.4);
  addMono(body, noiseThump(rng, { dur: 0.4, f: [280, 130], attack: 0.0015, decay: 0.045 * k, color: 'pink', hp: 60 }), 0, 0.5);
  for (let c = 0; c < rng.int(1, 4); c++) addMono(body, chunkImpact(rng, { size: rng.range(0.1, 0.35), bounce: 0 }), len(rng.range(0.02, 0.3)), rng.range(0.2, 0.4), rng.bi() * 0.8);
  const tail = stereo(n);
  const tr = rng.range(160, 280);
  grains(rng, tail, { start: 0.02, dur: rng.range(0.6, 1.2) * k, rate: (u) => tr * (1 - u) ** 2.8 + 5, amp: (u) => 0.26 * (1 - u) ** 1.2, f: [1200, 7000], tau: [0.002, 0.01], noisy: 0.85, spread: 1 });
  return { audio: layers({ core, body, tail }, { core: 0, body: -3, tail: rng.range(-7, -4) }), layers: { core: `whip-crack(${form})`, body: 'facade-slit+light-thud', tail: 'fine-debris' } };
}

// ------------------------------------------------------------ 焔角

/** 低い塊の唸り（モノラル、最大値 1）：ブラウン雑音を低く絞り、山の時刻へ向けてふくらませる（重い体の部位が動く）。 */
function massHum(rng, dur, peak, cutoff) {
  const n = len(dur);
  const s = brown(rng, n);
  filt(s, [['lp', cutoff, 0.9], ['lp', cutoff * 1.4, 0.7], ['hp', 30, 0.7]]);
  mul(s, env(n, [[0, 0.05], [peak * 0.9, 1], [peak + 0.12, 0.4], [dur, 0]]));
  return norm(s);
}

/** 角の突き上げの振り：重い頭が下から上へ振り上がる低い風切りと、動く首の岩の皮のこすれ・当たり。 */
export function hornSwing(rng, { peak = 0.3, variant = 0 } = {}) {
  const shape = SHAPES[variant % SHAPES.length];
  const k = rng.range(0.8, 1.25);
  const p = rng.range(0.88, 1.13);
  const d = peak + 0.5 * k;
  const top = rng.range(360, 480) * p;
  const main = whoosh(rng, { dur: d + 0.3, fPath: [[0, 140 * p], [peak, top], [d, 160 * p]], qPath: [[0, rng.range(1, 1.3)], [peak, rng.range(1.3, 1.8)], [d, 1]], points: swingPoints(rng, shape, peak, d), color: 'brown' });
  if (shape.endsWith('back')) addBack(rng, main, peak + rng.range(0.12, 0.3) * k, top);
  const out = panMove(main, [[0, -0.15], [d, 0.25]]);
  addMono(out, massHum(rng, d + 0.3, peak, 110 * p), 0, 0.45);
  // 首の岩の板がずれて当たる（振りかぶりの間に2〜4回）
  for (let c = 0; c < rng.int(2, 4); c++) addMono(out, rockClack(rng, { size: rng.range(0.45, 0.8) }), len(rng.range(0.02, peak)), rng.range(0.18, 0.32), rng.bi() * 0.5);
  return { audio: out, layers: { core: 'rock-skin-clacks', body: 'low-head-whoosh+mass-hum', tail: `${shape}×${Math.round(k * 100)}%` } };
}

/** 角の突き上げの当たり：石の角がコンクリートを打つ硬く重い「ガゴッ」と、砕けて上へ跳ね、少し後に降ってくる塊。引っかきは無い。 */
export function hornHit(rng) {
  const k = rng.range(0.85, 1.2);
  const p = rng.range(0.9, 1.1);
  const n = len(2.6 * k);
  const core = stereo(n);
  addMono(core, rockClack(rng, { size: rng.range(0.85, 1) }), 0, 1, rng.bi() * 0.15);
  addMono(core, rockClack(rng, { size: rng.range(0.7, 0.95) }), len(rng.range(0.008, 0.022)), rng.range(0.5, 0.8), rng.bi() * 0.3);
  snaps(rng, core, { start: 0.002, count: rng.int(6, 10), window: rng.range(0.04, 0.08), f: [900, 4200], amp: 0.6, spread: 0.6 });
  // 石の当たりの山を丸める（頭が尖りすぎ、同じピークでは重い一撃が小さく聞こえた）
  for (const ch of [core.l, core.r]) softclip(ch, 2.4);
  const body = stereo(n);
  addMono(body, noiseThump(rng, { dur: 1.2, f: [190 * p, 72 * p], attack: 0.002, decay: 0.22 * k, hp: 26 }), 0, 1);
  addMono(body, subThump(rng, { dur: 0.28, f0: 72 * p, f1: 44 * p, glide: 0.04, attack: 0.002, decay: 0.05, drive: 2 }), 0, 0.4);
  addMono(body, noiseBurst(rng, { dur: 0.7, decay: 0.2 * k, color: 'pink', filters: [['bp', rng.range(480, 820), 0.6]] }), len(0.005), 0.8);
  // 割れたコンクリートが擦れて崩れる（中域を細かく揺らす）
  const grind = noiseBurst(rng, { dur: 0.9 * k, attack: 0.02, decay: 0.25 * k, color: 'pink', filters: [['bp', rng.range(380, 700), 0.6], ['lp', 1800, 0.7]] });
  const jag = wander(rng, grind.length, 30, 0.15, 1);
  for (let i = 0; i < grind.length; i++) grind[i] *= jag[i];
  addMono(body, norm(grind), len(0.02), 0.5, rng.bi() * 0.3);
  // 砕けて上へ跳ねた塊が、少し遅れて降ってくる
  for (let c = 0; c < rng.int(3, 6); c++) addMono(body, chunkImpact(rng, { size: rng.range(0.35, 0.9), bounce: rng.chance(0.5) ? 0.35 : 0 }), len(rng.range(0.18, 0.75) * k), rng.range(0.3, 0.55), rng.bi() * 0.8);
  const tail = stereo(n);
  grains(rng, tail, { start: 0.02, dur: 1.6 * k, rate: (u) => 240 * (1 - u) ** 2.4 + 8, amp: (u) => 0.28 * (1 - u) ** 1.3, f: [300, 3800], tau: [0.003, 0.02], noisy: 0.88, spread: 1 });
  pebbleRun(rng, tail, { start: rng.range(0.35, 0.6), window: 0.6, count: rng.int(3, 5), amp: 0.3, size: [0.15, 0.4] });
  return { audio: layers({ core, body, tail }, { core: -1, body: 0, tail: -4 }), layers: { core: 'stone-horn-clack×2+fracture', body: 'heavy-thud+crumble+falling-chunks', tail: 'debris+pebbles' } };
}

/** 尾の鎚の振り：短く太い尾の先の岩が回る、ごく低い風切りと塊の唸り。 */
export function hammerSwing(rng, { peak = 0.38, variant = 0 } = {}) {
  const shape = SHAPES[variant % SHAPES.length];
  const k = rng.range(0.8, 1.25);
  const p = rng.range(0.88, 1.13);
  const d = peak + 0.6 * k;
  const top = rng.range(220, 300) * p;
  const main = whoosh(rng, { dur: d + 0.3, fPath: [[0, 90 * p], [peak, top], [d, 110 * p]], qPath: [[0, 0.9], [peak, rng.range(1.1, 1.5)], [d, 0.9]], points: swingPoints(rng, shape, peak, d), color: 'brown' });
  if (shape.endsWith('back')) addBack(rng, main, peak + rng.range(0.15, 0.35) * k, top);
  const out = panMove(main, [[0, 0.6], [d, -0.6]]);
  addMono(out, massHum(rng, d + 0.3, peak, 85 * p), 0, 0.6);
  for (let c = 0; c < rng.int(1, 3); c++) addMono(out, rockClack(rng, { size: rng.range(0.7, 1) }), len(rng.range(0.05, peak * 0.9)), rng.range(0.15, 0.28), rng.bi() * 0.6);
  return { audio: out, layers: { core: 'club-rock-clacks', body: 'very-low-whoosh+mass-hum', tail: `${shape}×${Math.round(k * 100)}%` } };
}

/** 尾の鎚の当たり：低く重い「ドゴン」。深い打撃と頭の短い圧、岩の鎚の鳴り、大きな塊と長めの地鳴り。 */
export function hammerHit(rng) {
  const k = rng.range(0.85, 1.2);
  const p = rng.range(0.9, 1.1);
  const n = len(3 * k);
  const core = stereo(n);
  snaps(rng, core, { start: 0, count: rng.int(5, 8), window: rng.range(0.05, 0.1), f: [600, 3000], amp: 0.6, spread: 0.7 });
  addMono(core, rockClack(rng, { size: 1 }), 0, 0.7, rng.bi() * 0.2);
  addMono(core, noiseBurst(rng, { dur: 0.3, decay: 0.05, color: 'pink', filters: [['bp', rng.range(380, 560), 0.7]] }), 0, 0.7);
  for (const ch of [core.l, core.r]) softclip(ch, 2.2);
  const body = stereo(n);
  addMono(body, noiseThump(rng, { dur: 1.4, f: [130 * p, 48 * p], attack: 0.003, decay: 0.3 * k, hp: 22 }), 0, 1);
  addMono(body, noiseBurst(rng, { dur: 0.8, decay: 0.18 * k, color: 'pink', filters: [['bp', rng.range(300, 520), 0.6]] }), len(0.01), 0.6);
  addMono(body, subThump(rng, { dur: 0.4, f0: 56 * p, f1: 34 * p, glide: 0.06, attack: 0.003, decay: 0.09, drive: 2.2, punch: 0.5 }), 0, 0.55);
  for (let c = 0; c < rng.int(4, 7); c++) addMono(body, chunkImpact(rng, { size: rng.range(0.6, 1), bounce: rng.chance(0.4) ? 0.4 : 0 }), len(rng.range(0.01, 0.35) * k), rng.range(0.35, 0.6), rng.bi() * 0.8);
  const tail = stereo(n);
  addMono(tail, rumble(rng, { dur: 2.2 * k, cutoff: 110, points: [[0, 0], [0.03, 0.9], [0.6 * k, 0.45], [2.2 * k, 0]], modRate: 4, modDepth: 0.45 }), 0, 0.8);
  grains(rng, tail, { start: 0.03, dur: 1.8 * k, rate: (u) => 260 * (1 - u) ** 2.2 + 8, amp: (u) => 0.3 * (1 - u) ** 1.3, f: [250, 3200], tau: [0.004, 0.022], noisy: 0.88, spread: 1 });
  const audio = layers({ core, body, tail }, { core: -2, body: 0, tail: -3 });
  // 焔角の声色（足音と同じく高域を落とす）：岩の鎚は重く鈍い
  for (const ch of [audio.l, audio.r]) filt(ch, [['highShelf', 2500, -6]]);
  return { audio, layers: { core: 'low-crack+rock-club', body: 'deep-thud+head-push+big-chunks', tail: 'rumble+debris' } };
}
