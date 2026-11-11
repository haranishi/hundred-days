// 谷と湖の山の「岩の地形」を作る：設計したなめらかな面を、水の流れの浸食で刻む。
//
// なぜこの形か（2026-11-11）：
// - 式だけで形を描くと、櫛の歯の縞・板の岩壁・円錐になった（I15・I15b）。
// - 平らな面から隆起と浸食だけで育てると、配置を合わせる補正が形を壊し、ぼやけた塊になった（I15c）。
// - ここでは、配置は「谷の底の線」と「尾根の線」の 2 種類の折れ線で決め、そのあいだをなめらかな面でつなぐ（設計の面）。
//   細部は、その面を流れの浸食で刻んで作る：沢が枝分かれし、沢と沢のあいだが支尾根になる。
//   尾根は設計の高さへ引き戻し、谷の底の線は固定する。だから、配置は崩れず、時間をかけても平らにならない。
import { routeFlow, fillDepressions } from './drainage.js';
import { periodicNoise } from './noise.js';
import { hashString } from './rng.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** 水面の高さ（m） */
export const LAKE_LEVEL = 1180;
/** 湖：中心と半径（東西・南北）。岸は、角度でゆらして入り組ませる */
// 2026-11-11：東西 620 m から 470 m へ縮めた（参考画像の湖は、集落がその幅の 3 分の 1 に見える小ささ）
export const LAKE = { x: -70, z: 1518, rx: 262, rz: 172 };
/**
 * 湖の中心からの、岸を 1 とした距離。岸は、入り江と岬で大きく入り組ませる
 * （ゆらぎが 1 割ほどのときは、上空から「丸い小さな塊」に見えた：見た目の採点 2 周目）。
 * 北東の角（流れの口と橋のそば）は、ゆらぎを抑える：橋と山荘の位置が、岸の形に合うように。
 */
export function lakeRadius(x, z) {
  const a = Math.atan2((z - LAKE.z) / LAKE.rz, (x - LAKE.x) / LAKE.rx);
  const calm = Math.exp(-(((a + 0.72) / 0.5) ** 2)); // 北東（a ≈ −0.72）で 1
  const wobble = 1 + (1 - 0.8 * calm) * (0.15 * Math.sin(a * 2 + 0.9) + 0.13 * Math.sin(a * 3 + 2.6) + 0.1 * Math.sin(a * 5 + 2.1) + 0.06 * Math.sin(a * 8 + 0.3) + 0.035 * Math.sin(a * 13 + 1.7) + 0.02 * Math.sin(a * 21 + 0.5));
  return Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) / wobble;
}
export const lakeInside = (x, z) => lakeRadius(x, z) < 1;

// ---- 配置の線（x, z, 高さ）。北が −Z・東が +X ----
/** 中央の谷の底（上から下へ）。山頂の下の盆から、湖の北東の角の流れの口まで */
// 谷の底は、左右へ 70〜100 m ずつ蛇行させる（ほぼまっすぐだと、森を切り開いた滑走ルートが、定規で引いた道に見えた：2026-11-11）
export const VALLEY = [
  [60, -1280, 2130], [70, -1130, 2030], [20, -990, 1945], [95, -820, 1870], [-5, -640, 1795], [-105, -450, 1715], [-25, -260, 1640],
  [-120, -60, 1575], [-95, 130, 1515], [15, 300, 1465], [-45, 480, 1410], [75, 660, 1360], [30, 840, 1310], [125, 1010, 1255],
  [165, 1180, 1212], [197, 1290, 1190], [160, 1345, 1184.3], [118, 1396, LAKE_LEVEL + 1],
];
/** 尾根（主な 3 本と、山を囲む低い尾根）。width は、尾根の「肩」の広さの目安 */
export const RIDGES = [
  // 主な尾根は、大きく曲げる。地図の縁に平行なまっすぐな尾根にすると、上空から、箱の縁に見えた（見た目の採点 2 周目）。
  // 縁からは 300 m 以上離す（近すぎると、縁へ落ちる壁が 60° を超える）。
  // 山頂は、両脇 200 m で 200 m 下がる、とがった峰にする（点が粗いと、台形の平らな頂になった：見た目の採点 1 周目）
  { id: 'north', points: [[-1480, -1500, 2500], [-1200, -1700, 2470], [-800, -1560, 2520], [-420, -1740, 2540], [-150, -1640, 2580], [40, -1660, 2770], [230, -1600, 2580], [520, -1750, 2520], [860, -1560, 2470], [1180, -1690, 2420], [1500, -1380, 2330]] },
  { id: 'west', points: [[-1480, -1500, 2500], [-1580, -1150, 2450], [-1300, -760, 2360], [-1440, -360, 2240], [-1180, 20, 2150], [-1330, 430, 2040], [-1080, 860, 1900], [-1190, 1230, 1650], [-900, 1560, 1420], [-760, 1850, 1300]] },
  { id: 'east', points: [[1500, -1380, 2330], [1750, -1040, 2250], [1570, -640, 2170], [1740, -200, 2060], [1540, 260, 1930], [1700, 700, 1750], [1440, 1150, 1500], [1250, 1560, 1340], [900, 1860, 1280]] },
  // 湖の南の低い丘（氷河が残した堤）：湖を囲んで、南の縁へ下る
  { id: 'south', points: [[-760, 1850, 1300], [-420, 1900, 1258], [-60, 1890, 1240], [330, 1890, 1248], [620, 1880, 1262], [900, 1860, 1280]] },
  // 山頂から南東へ下る支尾根（上の盆と、東のゲレンデを分ける）
  { id: 'spur-east', points: [[230, -1600, 2580], [430, -1430, 2390], [600, -1230, 2220], [710, -1010, 2080], [760, -860, 1990]] },
  // 山頂から南西へ下る支尾根（山頂の下の盆と、氷河の谷を分ける）
  { id: 'spur-sw', points: [[40, -1660, 2770], [-70, -1500, 2560], [-200, -1340, 2400], [-330, -1200, 2270], [-420, -1090, 2170]] },
  // 西の尾根から谷へ張り出す支尾根（西の岩壁を、いくつかの入り江に分ける）
  { id: 'spur-west', points: [[-1300, -760, 2360], [-1060, -660, 2210], [-800, -560, 2040], [-560, -470, 1900]] },
  { id: 'spur-w2', points: [[-1180, 20, 2150], [-980, 80, 1990], [-770, 160, 1820], [-580, 210, 1690]] },
  { id: 'spur-w3', points: [[-1330, 430, 2040], [-1060, 540, 1870], [-820, 630, 1700], [-640, 700, 1570]] },
  // 東の尾根から下る支尾根（東の斜面を、北の広いゲレンデと、南の森の斜面に分ける）
  { id: 'spur-e3', points: [[1540, 260, 1930], [1330, 420, 1790], [1140, 540, 1640]] },
];
/** 氷河の谷の底（上から下へ）。北西の盆から、中央の谷へ下る曲がった谷 */
// 中心の線は、S 字に曲げる（ほぼまっすぐだと、上空から、定規で引いた帯に見えた：見た目の採点 2 周目）
export const GLACIER = [[-1190, -1290, 2440], [-1010, -1250, 2350], [-890, -1100, 2245], [-715, -1040, 2125], [-610, -890, 2015], [-430, -850, 1935], [-255, -735, 1862], [-40, -640, 1795]];
/** 地図の縁の高さ（尾根の外側は、隣の谷へ下る）。南は低い */
export function edgeHeight(x, z, half) {
  const south = smooth(half * 0.25, half, z), north = smooth(half * 0.25, half, -z);
  const west = smooth(half * 0.4, half, -x), east = smooth(half * 0.4, half, x);
  const upper = 1720 + 330 * north + 120 * west + 20 * east; // 北と西が高い（尾根の外側の壁を、急にしすぎない）
  return lerp(upper, 1165, south);
}

function nearestOnPolyline(points, x, z) {
  let best = Infinity, height = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, az, ah] = points[i - 1], [bx, bz, bh] = points[i];
    const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; height = ah + (bh - ah) * t; }
  }
  return { d: best, h: height };
}
/**
 * いくつもの線までの「なめらかな近さ」と、そこでの高さ。
 * いちばん近い線だけを使うと、近い線が入れ替わる所で面が折れ、しわくちゃの紙に見えた（最初の版）。
 * すべての線分を、距離の逆数の 4 乗で重み付けして混ぜる（近い線が主になるが、入れ替わりはなめらか）。
 */
function accumulate(acc, points, x, z) {
  for (let i = 1; i < points.length; i++) {
    const [ax, az, ah] = points[i - 1], [bx, bz, bh] = points[i];
    const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t) + 4, w = 1 / (d * d * d * d);
    acc.w += w; acc.h += w * (ah + (bh - ah) * t);
  }
}
const addPoint = (acc, d, h) => { const q = d + 4, w = 1 / (q * q * q * q); acc.w += w; acc.h += w * h; };
const finish = (acc) => ({ h: acc.h / acc.w, d: Math.max(0, Math.pow(acc.w, -0.25) - 4) });

/**
 * 設計の面と、浸食に使う地図を作る。
 * @param {{grid:number, cell:number, size:number}} c
 * @param {string} seed
 * @returns {{target:Float32Array, fixed:Uint8Array, hard:Float32Array, repose:Float32Array, creep:Float32Array, glacier:Float32Array, incise:Float32Array, budget:Float32Array}}
 *   target：設計の面（m）。fixed：高さを固定する点（1＝谷の底の線・湖・縁）。hard：岩の硬さ（0＝軟らかい・1＝硬い）。
 *   repose：崩れる傾き（tan）。creep：斜面の這いの強さ（0〜1）。glacier：氷河の谷の中か（0〜1）。
 *   incise：流れの浸食の効き（0〜1）。budget：設計の面から掘り下げてよい深さ（m）
 */
export function designAlpine(c, seed) {
  const n = c.grid, half = c.size / 2, s0 = hashString(`${seed}:alpine`);
  const target = new Float32Array(n * n), fixed = new Uint8Array(n * n), hard = new Float32Array(n * n), repose = new Float32Array(n * n), creep = new Float32Array(n * n), glacier = new Float32Array(n * n);
  const incise = new Float32Array(n * n), budget = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = (i + 0.5) * c.cell - half, z = (j + 0.5) * c.cell - half;
    // ゆっくりしたゆがみ：線までの距離をゆらして、等高線がまっすぐ・平行にならないようにする。
    // 谷の底の線のそばでは、ゆがめない：ゆがめると、設計の谷と、固定する線がずれて、線が高い所を切る細い溝になった（最初の版）
    const onValley = nearestOnPolyline(VALLEY, x, z);
    const bend = smooth(50, 420, onValley.d);
    const wx = x + bend * (120 * periodicNoise(x / 900, z / 900, 65536, s0 + 11) + 40 * periodicNoise(x / 310, z / 310, 65536, s0 + 12));
    const wz = z + bend * (120 * periodicNoise(x / 900, z / 900, 65536, s0 + 13) + 40 * periodicNoise(x / 310, z / 310, 65536, s0 + 14));
    // 谷の側：中央の谷・氷河の谷・湖・地図の縁を、近さで混ぜる
    const lowAcc = { w: 0, h: 0 };
    accumulate(lowAcc, VALLEY, wx, wz);
    // 氷河の谷は、幅のある底を持つ（底が丸い谷）。線からの距離を、幅のぶんだけ縮めて数える
    const gl = glacierCoord(wx, wz), glLine = nearestOnPolyline(GLACIER, wx, wz);
    addPoint(lowAcc, Math.max(0, Math.abs(gl.t) - 0.75 * glacierHalfWidth(gl.s)), glLine.h);
    const lakeD = Math.max(0, lakeRadius(wx, wz) - 1) * Math.min(LAKE.rx, LAKE.rz);
    addPoint(lowAcc, lakeD, LAKE_LEVEL);
    const border = half - Math.max(Math.abs(x), Math.abs(z)), edge = edgeHeight(x, z, half);
    addPoint(lowAcc, border, edge);
    const low = finish(lowAcc);
    // 尾根の側
    const highAcc = { w: 0, h: 0 };
    for (const r of RIDGES) accumulate(highAcc, r.points, wx, wz);
    const high = finish(highAcc);
    // 尾根の線に沿って、峰と鞍部を付ける（300〜600 m の波長）
    // 峰は、尾根型の雑音でとがらせる（なめらかな波だけだと、稜線がゆるい丘の連なりに見えた）
    const horn = 1 - Math.abs(periodicNoise(x / 560, z / 560, 65536, s0 + 23));
    const crest = high.h + 150 * (horn * horn - 0.42) + 60 * periodicNoise(x / 430, z / 430, 65536, s0 + 21) + 30 * periodicNoise(x / 170, z / 170, 65536, s0 + 22);
    const u = low.d / Math.max(1e-6, low.d + high.d);
    // 横断の形：西と北は、下がゆるく上が急（岩壁）。東は、ほぼ一様な斜面（ゲレンデ）
    // 場所の区分（東のゲレンデ・西と北の岩・南の低地）の境目は、ゆがめた座標で決める。
    // まっすぐな境目のままだと、浸食の効きが直線で切り替わり、上空から、四角い区画が見えた（見た目の採点 1 周目）
    const mx = x + 190 * periodicNoise(x / 560, z / 560, 65536, s0 + 61) + 60 * periodicNoise(x / 170, z / 170, 65536, s0 + 63);
    const mz = z + 190 * periodicNoise(x / 560, z / 560, 65536, s0 + 62) + 60 * periodicNoise(x / 170, z / 170, 65536, s0 + 64);
    const eastness = smooth(150, 700, mx) * smooth(-1450, -1000, mz) * (1 - smooth(1500, 1800, mx)); // 東の斜面で 1
    // 西と北は、下の半分をゆるく（森と、滑れる斜面）、上を急な岩壁にする
    const power = lerp(1.6, 1.15, eastness);
    let h = low.h + Math.max(0, crest - low.h) * Math.pow(u, power);
    // 起伏の種：流れが集まる向きを決めるきっかけ。小さすぎると、沢がまっすぐ平行に並ぶ（筋を引いた面になる）。
    // 600 m ほどの大きなうねり（小さな盆と張り出し）を入れると、沢が合流して枝分かれする。東のゲレンデでは控えめに
    // 東のゲレンデと、山頂の下の盆にも、起伏を残す（なだらかにしすぎると、上空から、のっぺりした白い面に見えた）。滑る帯は、後で横にならす
    // 2026-11-11：尾根型の雑音（背がとがる）を、3 つの大きさで重ねる：支尾根（500 m）・小さな尾根（200 m）・岩の出っぱり（80 m）。
    // なめらかな波だけだと、丸い雪のふくらみが並ぶ台地に見えた（見た目の採点 2 周目）。参考画像は、どこを切っても、とがった尾根と岩の出っぱりがある。
    // 小さな尾根は、大きな尾根の背の近くほど強くする（背から枝分かれして見える）。東のゲレンデでは弱める（なだらかな斜面を残す）
    const rough = smooth(0, 180, low.d) * (1 - 0.68 * eastness);
    const ridged = (wave, id) => { const v = 1 - Math.abs(periodicNoise(wx / wave, wz / wave, 65536, s0 + id)); return v * v; };
    const rA = ridged(520, 30), rB = ridged(205, 31), rC = ridged(82, 32);
    h += (92 * (rA - 0.38) + 44 * (rB - 0.38) * (0.35 + 0.65 * rA) + 15 * (rC - 0.38) * (0.3 + 0.7 * rB) + 4 * periodicNoise(x / 31, z / 31, 65536, s0 + 33)) * rough;
    // 谷の底の線のそばは、線より低くしない（線が堤になって、手前に水がたまる）。底は浅い皿にし、幅を場所でゆらす
    // （幅が一定だと、谷の底が、定規で引いた道のように見えた）
    const floorHalf = 18 + 22 * (0.5 + 0.5 * periodicNoise(x / 330, z / 330, 65536, s0 + 35));
    h = Math.max(h, onValley.h + 0.9 + 0.035 * Math.max(0, onValley.d - floorHalf));
    // 崖の帯と棚：硬い岩の斜面（西と北の上部）を、地層に沿った段にする。急な崖（60° 前後）と、雪の乗る棚が交互に出る。
    // なめらかな斜面のままだと、一様な傾きの岩の板になった（2026-11-11 の見比べ）。段の厚みは不ぞろいにし、地層は少し傾けてゆがめる
    const wallness = clamp(Math.max(smooth(-200, -900, mx), smooth(-900, -1500, mz)) - eastness, 0, 1) * smooth(0.5, 0.75, u) * (1 - smooth(0.93, 1, u));
    if (wallness > 0) {
      const strata = h + 0.2 * x - 0.14 * z + 70 * periodicNoise(x / 520, z / 520, 65536, s0 + 43);
      const T = 58, q = strata / T + 0.38 * periodicNoise(strata / (T * 2.7), 0.37, 65536, s0 + 44);
      const f = q - Math.floor(q), step = smooth(0.55, 1, f); // 棚（下の 5 割半は平ら＝雪が乗る）→ 崖
      h += T * (step - f) * 0.72 * wallness;
    }
    target[k] = h;
    // 固定する点：湖・谷の底の線（幅 1 目）・縁
    if (i === 0 || j === 0 || i === n - 1 || j === n - 1) { fixed[k] = 1; target[k] = edge; }
    else if (lakeInside(x, z)) { fixed[k] = 1; target[k] = LAKE_LEVEL; }
    else if (onValley.d < c.cell * 0.75) { fixed[k] = 1; target[k] = onValley.h; }
    // 岩の硬さ：西と北で硬く、東で軟らかい。斜めの地層の帯でゆらす
    const west = smooth(-200, -900, mx), northness = smooth(-900, -1500, mz);
    // 地層の帯は弱く・広く・大きくゆがめる（強くすると、岩壁いちめんに等間隔の段が並んだ）
    const band = Math.sin((0.55 * x - 0.35 * z + 0.9 * h + 520 * periodicNoise(x / 800, z / 800, 65536, s0 + 41)) / 340 * Math.PI * 2);
    const regional = clamp(0.25 + 0.55 * Math.max(west, northness) - 0.3 * eastness, 0, 1);
    hard[k] = clamp(regional + 0.09 * band + 0.2 * periodicNoise(x / 350, z / 350, 65536, s0 + 42), 0, 1);
    // 崩れる傾き：軟らかい所 33°、硬い所 58°
    repose[k] = Math.tan(lerp(33, 58, hard[k]) * Math.PI / 180);
    // 這い：東のゲレンデと、山頂の下の盆・谷の底で強い
    const valleyD = onValley.d, glacierD = nearestOnPolyline(GLACIER, x, z).d;
    const bowl = Math.exp(-(((x - 60) / 520) ** 2 + ((z + 1150) / 420) ** 2));
    creep[k] = clamp(0.12 + 0.6 * eastness + 0.45 * bowl + 0.5 * (1 - smooth(40, 160, valleyD)), 0, 1);
    void glacierD;
    const gHere = glacierCoord(x, z);
    glacier[k] = (1 - smooth(0.85, 1.15, glacierD / glacierHalfWidth(gHere.s))) * smooth(-40, 40, gHere.s) * (1 - smooth(gHere.L - 200, gHere.L, gHere.s));
    // 浸食の効きと、掘り下げてよい深さ：西と北の岩の面・尾根の外側は深く刻む。東のゲレンデ・山頂の下の盆・湖のまわりは浅く。
    // 深さに上限を置かないと、沢が尾根の背まで食い込み、山ぜんたいが 200 m 低くなった（最初の版）。尾根の背と谷の底では、上限を小さくする
    const southLow = smooth(1150, 1500, mz);
    const calm = Math.max(eastness * 0.8, bowl * 0.6, southLow * 0.85, glacier[k]);
    incise[k] = clamp(1 - 0.75 * calm, 0.12, 1);
    // 深さの上限は、斜面の上寄り（谷から尾根への 3 分の 2）で最大。下の斜面は浅く刻む（森と、滑れる斜面を残す）
    budget[k] = lerp(88, 30, calm) * (0.14 + 0.86 * 6.75 * u * u * (1 - u)) * smooth(floorHalf * 0.6, floorHalf + 90 + 70 * periodicNoise(x / 240, z / 240, 65536, s0 + 36), valleyD);
  }
  return { target, fixed, hard, repose, creep, glacier, incise, budget };
}

/**
 * 設計の面を、流れの浸食で刻む。
 * 1 回ごとに：流れの向き（下り勾配に比例した確率で受け手を選ぶ）→ 流域の面積 → 尾根を設計の高さへ引き戻す → 流れの力の浸食（陰解法）
 * → 崩れる傾きを超えた所を削る → 這い。
 * @param {{target:Float32Array, fixed:Uint8Array, hard:Float32Array, repose:Float32Array, creep:Float32Array}} design
 * @param {{grid:number, cell:number, size:number}} c
 * @param {{iterations?:number, K?:number, m?:number, restore?:number, start?:Float32Array, seed?:number, onStep?:Function}} options
 */
export function carveAlpine(design, c, options = {}) {
  const { target, fixed, hard, repose, creep, incise, budget } = design;
  const n = c.grid, cell = c.cell, count = n * n;
  const iterations = options.iterations ?? 120, K = options.K ?? 0.012, m = options.m ?? 0.4, restore = options.restore ?? 0.08, seed = options.seed ?? 1;
  const h = options.start ? Float32Array.from(options.start) : Float32Array.from(target);
  const next = new Float32Array(count);
  for (let step = 0; step < iterations; step++) {
    for (let k = 0; k < count; k++) if (fixed[k]) h[k] = target[k];
    const flow = routeFlow(h, c, { outletMask: fixed, randomSeed: (seed * 7919 + step * 104729) | 0 });
    const a = flow.height; // くぼみを埋めた面（流れが必ず出口へ届く）
    // 下流から上流へ：受け手の新しい高さを使って、自分の高さを解く
    for (let t = flow.order.length - 1; t >= 0; t--) {
      const k = flow.order[t], r = flow.receiver[k];
      if (fixed[k] || r < 0) { a[k] = fixed[k] ? target[k] : a[k]; continue; }
      // 尾根を設計の高さへ引き戻す力（流れの少ない所ほど効く。沢では浸食が勝つ）
      const lift = restore * Math.max(0, target[k] - a[k]);
      const erod = K * incise[k] * (1 - 0.5 * hard[k]) * Math.pow(flow.area[k], m) / flow.distance[k];
      let v = (a[k] + lift + erod * a[r]) / (1 + erod);
      // 崩れる傾きを超えない。設計の面から、決めた深さより下へは掘らない。受け手より低くもしない（流れが逆になる）
      const limit = a[r] + repose[k] * flow.distance[k];
      if (v > limit) v = limit;
      const floor = target[k] - budget[k];
      if (v < floor) v = floor;
      if (v < a[r] + 0.01) v = a[r] + 0.01;
      a[k] = v;
    }
    // 横の斜面も、崩れる傾きまで削る（流れの線に沿った制限だけでは、沢と沢のあいだに壁が残る）
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
        const k = j * n + i; if (fixed[k]) continue;
        let low = Infinity;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const q = k + dz * n + dx, d = cell * (dx && dz ? Math.SQRT2 : 1), cap = a[q] + repose[k] * d;
          if (cap < low) low = cap;
        }
        if (a[k] > low) a[k] = low + (a[k] - low) * 0.35;
      }
    }
    // 這い：なめらかにする（東のゲレンデと盆で強い）
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const k = j * n + i;
      next[k] = fixed[k] ? a[k] : a[k] + 0.2 * creep[k] * (a[k - 1] + a[k + 1] + a[k - n] + a[k + n] - 4 * a[k]) * 0.25 * 4 / 4;
    }
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) h[j * n + i] = next[j * n + i];
    for (let i = 0; i < n; i++) { h[i] = a[i]; h[(n - 1) * n + i] = a[(n - 1) * n + i]; h[i * n] = a[i * n]; h[i * n + n - 1] = a[i * n + n - 1]; }
    options.onStep?.(step, h, flow);
  }
  for (let k = 0; k < count; k++) if (fixed[k]) h[k] = target[k];
  return h;
}

/** 双三次（Catmull-Rom）で、格子を細かくする */
export function refineGrid(source, from, to) {
  const out = new Float32Array(to * to), scale = from / to;
  const at = (i, j) => source[clamp(j, 0, from - 1) * from + clamp(i, 0, from - 1)];
  const w = (t) => [(-t * t * t + 2 * t * t - t) / 2, (3 * t * t * t - 5 * t * t + 2) / 2, (-3 * t * t * t + 4 * t * t + t) / 2, (t * t * t - t * t) / 2];
  for (let j = 0; j < to; j++) {
    const fz = (j + 0.5) * scale - 0.5, jz = Math.floor(fz), wz = w(fz - jz);
    for (let i = 0; i < to; i++) {
      const fx = (i + 0.5) * scale - 0.5, ix = Math.floor(fx), wx = w(fx - ix);
      let v = 0;
      for (let b = 0; b < 4; b++) { let row = 0; for (let a = 0; a < 4; a++) row += wx[a] * at(ix - 1 + a, jz - 1 + b); v += wz[b] * row; }
      out[j * to + i] = v;
    }
  }
  return out;
}

/** 箱のぼかし（縦横に分けて 2 回）。radius は目の数 */
export function boxBlur(source, n, radius) {
  const tmp = new Float32Array(source.length), out = new Float32Array(source.length), w = radius * 2 + 1;
  for (let pass = 0; pass < 2; pass++) {
    const src = pass ? out : source;
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let i = -radius; i <= radius; i++) sum += src[j * n + clamp(i, 0, n - 1)];
      for (let i = 0; i < n; i++) { tmp[j * n + i] = sum / w; sum += src[j * n + clamp(i + radius + 1, 0, n - 1)] - src[j * n + clamp(i - radius, 0, n - 1)]; }
    }
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = -radius; j <= radius; j++) sum += tmp[clamp(j, 0, n - 1) * n + i];
      for (let j = 0; j < n; j++) { out[j * n + i] = sum / w; sum += tmp[clamp(j + radius + 1, 0, n - 1) * n + i] - tmp[clamp(j - radius, 0, n - 1) * n + i]; }
    }
  }
  return out;
}

/**
 * 地図の縁をならす：縁から band（m）の帯は、細かな起伏を消して、縁の高さへなめらかにつなぐ。
 * 縁に崖や額縁のような段を残さない（描画の側で、遠くの山並みへつなぐ）。
 */
export function softenEdges(h, c, band = 260) {
  const n = c.grid, half = c.size / 2, blurred = boxBlur(h, n, Math.max(2, Math.round(70 / c.cell)));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = (i + 0.5) * c.cell - half, z = (j + 0.5) * c.cell - half;
    const border = half - Math.max(Math.abs(x), Math.abs(z));
    if (border >= band * 1.5) continue;
    // 帯の幅を場所でゆらす（一定の幅だと、縁に沿ったまっすぐな枠が、上空から見えた）
    const t = smooth(0, band * (0.55 + 0.9 * (0.5 + 0.5 * periodicNoise(x / 260, z / 260, 65536, 977))), border);
    h[k] = lerp(blurred[k], h[k], t * t);
  }
  return h;
}

/** 氷河の谷に沿った座標：s＝線に沿った距離、t＝線からの横の距離、L＝線の長さ */
export function glacierCoord(x, z) {
  let best = Infinity, s = 0, t = 0, total = 0, side = 1;
  for (let i = 1; i < GLACIER.length; i++) {
    const [ax, az] = GLACIER[i - 1], [bx, bz] = GLACIER[i];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), u = clamp(((x - ax) * dx + (z - az) * dz) / (len * len), 0, 1);
    const d = Math.hypot(x - ax - dx * u, z - az - dz * u);
    if (d < best) { best = d; s = total + len * u; t = d; side = Math.sign((x - ax) * dz - (z - az) * dx) || 1; }
    total += len;
  }
  return { s, t: t * side, L: total };
}
/** 氷河の幅の半分（m）。上で広く、下で細い。場所でゆらす */
export const glacierHalfWidth = (s) => 172 + 58 * Math.sin(s / 205 + 0.8) + 26 * Math.sin(s / 83 + 2.1) - 62 * smooth(850, 1450, s);

/**
 * 雪と氷を積む：岩の地形の上に、滑る面を作る。
 * - 雪：細い沢は埋まり、広い面はなめらかになり、急な面（50° 前後より急）と、とがった背には付かない。
 *   「雪の面 ← max(岩, ぼかした雪の面)」をくり返し、厚みに上限を置く（上限は、東のゲレンデと盆・谷の底で厚く、西の岩壁で薄い）。
 * - 氷河：谷に沿って、中央が高い氷の面を重ねる。縦には、不ぞろいの段（氷の滝）を付ける。
 * @returns {{surface:Float32Array, depth:Float32Array, ice:Float32Array}} surface：滑る面。depth：雪の厚み（m）。ice：氷の面か（0〜1。段の正面で 1）
 */
export function coverSnow(rock, c, design, seed) {
  const n = c.grid, cell = c.cell, half = c.size / 2, s0 = hashString(`${seed}:snow`);
  const limit = new Float32Array(n * n), stick = new Float32Array(n * n);
  // 傾きは、ならした面（7 m ほど）から取る。細かな凹凸の傾きまで使うと、雪の付く・付かないが 1 目ごとに入れ替わり、岩の面に白い斑点を撒いた見え方になった（見た目の採点 2 周目）
  const even = boxBlur(rock, n, Math.max(1, Math.round(7 / cell)));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
    const hx = (even[j * n + i1] - even[j * n + i0]) / ((i1 - i0) * cell), hz = (even[j1 * n + i] - even[j0 * n + i]) / ((j1 - j0) * cell);
    const slope = Math.atan(Math.hypot(hx, hz)) * 180 / Math.PI;
    // 雪の付きやすさ：40° までは付く。52° より急な面には付かない（岩が出る）
    stick[k] = 1 - smooth(40, 52, slope);
    limit[k] = (4.5 + 9 * (design.creep[k] ?? 0.3)) * stick[k];
  }
  // 基本の厚み：急すぎない面には、どこにも雪が積もる（2〜3 m）。風の当たるとがった背では、飛ばされて薄い
  const wide = boxBlur(rock, n, Math.max(2, Math.round(26 / cell)));
  const surface = new Float32Array(n * n);
  for (let k = 0; k < surface.length; k++) {
    const convex = rock[k] - wide[k]; // 背で正、くぼみで負
    const base = (2.1 + 0.9 * (design.creep[k] ?? 0.3)) * stick[k] * (1 - smooth(2.5, 8, convex));
    surface[k] = rock[k] + base;
    limit[k] += base;
  }
  // 吹きだまり：細い沢やくぼみを埋めて、面をなめらかにする
  const radius = Math.max(1, Math.round(9 / cell));
  for (let pass = 0; pass < 7; pass++) {
    const blurred = boxBlur(surface, n, radius);
    for (let k = 0; k < surface.length; k++) surface[k] = Math.min(rock[k] + limit[k], Math.max(surface[k], blurred[k] * stick[k] + surface[k] * (1 - stick[k])));
  }
  // 氷河
  const ice = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = (i + 0.5) * cell - half, z = (j + 0.5) * cell - half;
    if (x > 60 || z > -350 || x < -1500) continue;
    const g = glacierCoord(x, z), w = glacierHalfWidth(g.s), cross = Math.abs(g.t) / w;
    const inside = (1 - smooth(0.82, 1.0, cross)) * smooth(-20, 60, g.s) * (1 - smooth(g.L - 260, g.L - 40, g.s));
    if (inside <= 0) continue;
    // 線の高さ（谷の底）に、中央で厚い氷を足す
    const line = nearestOnPolyline(GLACIER, x, z).h, bulge = 12 * (1 - cross * cross);
    // 段（氷の滝）：流れに直角の弧（縁が遅れる）。間隔と高さを不ぞろいにする
    // 段は、流れの向きへ大きく弓なりにする（中央が先へ進み、縁が 150 m 遅れる）。まっすぐ横切ると、上空から、四角い区画に見えた
    const arc = g.s + 95 * cross * cross + 70 * periodicNoise(x / 190, z / 190, 65536, s0 + 3) + 18 * periodicNoise(x / 47, z / 47, 65536, s0 + 7);
    // 段は 150 m ごと・高さ 22〜36 m（低い段がまばらだと、平らな雪の上の水色の帯にしか見えなかった：見た目の採点 1 周目）
    const period = 150, phase = arc / period + 0.42 * periodicNoise(arc / 520, 0.3, 65536, s0 + 4);
    const frac = phase - Math.floor(phase), drop = 29 + 7 * periodicNoise(Math.floor(phase) * 0.37, 1.7, 65536, s0 + 5);
    // 段の上は、谷の底の線よりゆるく下り、端の 16 m ほどで、ためたぶんを一気に落ちる（氷の滝）
    const lip = 1 - 16 / period, fall = smooth(lip, 1, frac);
    const stair = drop * (frac - 0.5) - drop * fall;
    const top = line + bulge + stair * (1 - smooth(0.7, 1, cross));
    // 氷の面で、雪の面を置き換える（持ち上げるだけにすると、段の下半分が雪に埋まって、段が半分の高さになった）。氷の下の岩も、氷の面より下へ下げる
    // 氷の滝：段の正面と、そのすぐ上は、割れた氷のかたまり（8〜20 m）にする。平らな壁のままだと、ケーキの層に見えた
    const broken = smooth(lip - 0.2, lip, frac) * (1 - smooth(0.97, 1, frac)) + 0.35 * fall;
    const block = 1 - Math.abs(periodicNoise(x / 15, z / 15, 65536, s0 + 8)), chunk = periodicNoise(x / 6.5, z / 6.5, 65536, s0 + 9);
    surface[k] = lerp(surface[k], top + broken * (7 * (block * block - 0.45) + 2.2 * chunk), inside);
    if (rock[k] > surface[k] - 2 * inside) rock[k] = surface[k] - 2 * inside;
    // 段の正面は氷が出る。段のすぐ上には、割れ目が入る
    const face = fall > 0.02 && fall < 0.98 ? 1 : 0;
    // 割れ目（クレバス）：段の手前に、流れに直角の細い溝が何本か入る。溝は、形としても 2〜4 m 掘る
    const groove = Math.max(0, 1 - Math.abs(((arc / 13) % 1 + 1) % 1 - 0.5) * 7) * smooth(0.45, 0.6, frac) * (1 - smooth(lip - 0.03, lip, frac))
      * smooth(0.35, 0.6, periodicNoise(arc / 13, g.t / 55, 65536, s0 + 6) * 0.5 + 0.5) * (1 - smooth(0.6, 0.9, cross));
    surface[k] -= 3.5 * groove * inside;
    // 氷の出方を、場所でむらにする（どの段も端から端まで同じ太さの青い弧だと、上から、的の輪に見えた）
    const patchy = smooth(-0.35, 0.25, periodicNoise(x / 64, z / 64, 65536, s0 + 10));
    ice[k] = inside * Math.max(face * (0.45 + 0.55 * patchy), groove, 0.9 * smooth(0.25, 0.7, broken) * patchy);
  }
  const depth = new Float32Array(n * n);
  for (let k = 0; k < depth.length; k++) depth[k] = surface[k] - rock[k];
  return { surface, depth, ice };
}

/** 氷河の帯の中か（0〜1）。縁でなめらかに 0 になる */
export function glacierBand(x, z) {
  if (x > 60 || z > -350 || x < -1500) return 0;
  const g = glacierCoord(x, z), cross = Math.abs(g.t) / glacierHalfWidth(g.s);
  return (1 - smooth(0.82, 1.0, cross)) * smooth(-20, 60, g.s) * (1 - smooth(g.L - 260, g.L - 40, g.s));
}

function bilinear(source, from, to) {
  const out = new Float32Array(to * to), scale = from / to;
  for (let j = 0; j < to; j++) {
    const fz = clamp((j + 0.5) * scale - 0.5, 0, from - 1), j0 = Math.floor(fz), j1 = Math.min(from - 1, j0 + 1), tz = fz - j0;
    for (let i = 0; i < to; i++) {
      const fx = clamp((i + 0.5) * scale - 0.5, 0, from - 1), i0 = Math.floor(fx), i1 = Math.min(from - 1, i0 + 1), tx = fx - i0;
      out[j * to + i] = lerp(lerp(source[j0 * from + i0], source[j0 * from + i1], tx), lerp(source[j1 * from + i0], source[j1 * from + i1], tx), tz);
    }
  }
  return out;
}

/**
 * 岩の地形 → 雪と氷を積んだ滑る面、までを通して作る。
 * 粗い格子（8 m）で大きな沢を刻み、4 m で細い沢を足し、最後の細かさ（2 m）へ広げて、急な岩の面に細かな凹凸を足す。
 * @param {{grid:number, cell:number, size:number}} c 最後の細かさ
 * @param {string} seed
 * @param {{quick?:boolean, onStage?:(name:string)=>void}} options quick：試験用の軽い版（形は粗い）
 * @returns {{height:Float32Array, rock:Float32Array, depth:Float32Array, ice:Float32Array, glacier:Float32Array}}
 */
export function buildAlpine(c, seed, { quick = false, onStage } = {}) {
  const K = 0.1, restore = 0.03, m = 0.4;
  const n0 = quick ? Math.min(c.grid, 128) : 512, c0 = { grid: n0, cell: c.size / n0, size: c.size };
  const d0 = designAlpine(c0, seed);
  let h = carveAlpine(d0, c0, { iterations: quick ? 40 : 150, K, restore, m }), n = n0, design = d0;
  onStage?.('carve-coarse');
  if (!quick && c.grid >= 1024) {
    const c1 = { grid: 1024, cell: c.size / 1024, size: c.size }, d1 = designAlpine(c1, seed);
    h = carveAlpine(d1, c1, { iterations: 40, K, restore, m, start: refineGrid(h, n, 1024), seed: 2 });
    n = 1024; design = d1;
    onStage?.('carve-fine');
  }
  const rock = n === c.grid ? h : refineGrid(h, n, c.grid);
  const creep = n === c.grid ? design.creep : bilinear(design.creep, n, c.grid);
  // 急な岩の面に、細かな凹凸（尾根型の雑音。1〜3 m）を足す。ゆるい面には足さない（雪の下に隠れる）
  const N = c.grid, cell = c.cell, half = c.size / 2, s0 = hashString(`${seed}:rock-detail`);
  if (!quick) {
    const base = Float32Array.from(rock);
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const k = j * N + i, slope = Math.hypot(base[k + 1] - base[k - 1], base[k + N] - base[k - N]) / (2 * cell);
      const steep = smooth(0.62, 0.95, slope); if (steep <= 0) continue;
      const x = (i + 0.5) * cell - half, z = (j + 0.5) * cell - half;
      rock[k] += steep * (1.7 * (0.5 - Math.abs(periodicNoise(x / 17, z / 17, 65536, s0 + 1))) + 0.7 * periodicNoise(x / 6.5, z / 6.5, 65536, s0 + 2));
    }
  }
  softenEdges(rock, c);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (lakeInside((i + 0.5) * cell - half, (j + 0.5) * cell - half)) rock[j * N + i] = LAKE_LEVEL;
  const snow = coverSnow(rock, c, { creep }, seed);
  // 雪を積んだ後に残る小さなくぼみを、雪で埋める（どこから滑っても、谷をたどれば湖か地図の縁へ着くように。くぼみの底では、止まって動けなくなる）
  const filled = fillDepressions(snow.surface, c, { outlet: lakeInside }).height;
  for (let k = 0; k < filled.length; k++) if (filled[k] > snow.surface[k]) { snow.depth[k] += filled[k] - snow.surface[k]; snow.surface[k] = filled[k]; }
  const glacier = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = (i + 0.5) * cell - half, z = (j + 0.5) * cell - half;
    glacier[k] = glacierBand(x, z);
    if (lakeInside(x, z)) { snow.surface[k] = LAKE_LEVEL; snow.depth[k] = 0; }
  }
  onStage?.('snow');
  return { height: snow.surface, rock, depth: snow.depth, ice: snow.ice, glacier };
}

