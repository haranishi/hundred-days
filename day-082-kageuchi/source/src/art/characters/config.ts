// OWNER: chars-art
// 人物の調整する数値を、ここ1か所に集める（寸法・色・歩き方・混ぜる時間）。
// 歩調や歩幅は人の歩行のおおまかな傾向から自分で決めた値で、spiderbench の数値は使っていない。
import { Vector3 } from 'three';
import type { CharacterKind } from '../../contract/snapshot';
import type { Attach, Dims } from './rig';
import type { Key } from './anim/poses';

// ---------------------------------------------------------------- 寸法（七頭身前後。背丈はおよそ 1.62〜1.66m）

/** 提灯の竿の長さ（握りから竿の先まで。m）。骨の付け根と形の両方がこれを使う。 */
const POLE_LEN = 0.26;

const BASE_DIMS: Dims = {
  ankleY: 0.075,
  shin: 0.39,
  thigh: 0.41,
  hipX: 0.088,
  hipDrop: 0.06,
  spine: 0.085,
  chest: 0.18,
  neck: 0.205,
  head: 0.075,
  headCenterUp: 0.072,
  headCenterFwd: 0.014,
  clavX: 0.02,
  clavY: 0.155,
  clavZ: -0.012,
  armX: 0.155,
  upperArm: 0.285,
  foreArm: 0.245,
  gripDown: 0.082,
  gripIn: 0.014,
  heel: 0.06,
  toe: 0.165,
};

export const DIMS: Record<CharacterKind, Dims> = {
  // 細く、肩幅も狭い（輪郭は「低く細い黒い影」）
  player: { ...BASE_DIMS, armX: 0.138, clavX: 0.018, chest: 0.176 },
  ashigaru: { ...BASE_DIMS },
  // 張った肩：骨は少しだけ広く、肩幅の大半は袖（肩の板）が作る
  samurai: { ...BASE_DIMS, armX: 0.162, chest: 0.184 },
  // 若い小姓：わずかに小柄で細身
  ranmaru: {
    ...BASE_DIMS,
    shin: 0.38,
    thigh: 0.4,
    spine: 0.083,
    chest: 0.174,
    neck: 0.2,
    armX: 0.14,
    upperArm: 0.277,
    foreArm: 0.24,
  },
  nobunaga: { ...BASE_DIMS, shin: 0.395, thigh: 0.415, chest: 0.186, armX: 0.158, neck: 0.208 },
};

const BASE_ATTACH: Attach = {
  sheath: new Vector3(0.118, 0.035, 0.085),
  stool: new Vector3(0, 0, -0.06),
  tailA: new Vector3(0, 0.07, -0.095),
  tailLen: 0.12,
  cape: new Vector3(0, 0.15, -0.03),
  sleeve: new Vector3(0, -0.02, 0),
  sode: new Vector3(0.15, -0.005, 0),
  poleLen: POLE_LEN,
};

export const ATTACH: Record<CharacterKind, Attach> = {
  player: { ...BASE_ATTACH, sheath: new Vector3(0.108, 0.03, 0.07), tailA: new Vector3(0, 0.05, -0.1), tailLen: 0.13 },
  ashigaru: { ...BASE_ATTACH },
  samurai: { ...BASE_ATTACH, tailA: new Vector3(0, 0.075, -0.098), tailLen: 0.1 },
  ranmaru: { ...BASE_ATTACH, sheath: new Vector3(0.11, 0.03, 0.075), tailA: new Vector3(0, 0.06, -0.1), tailLen: 0.14 },
  nobunaga: { ...BASE_ATTACH, tailA: new Vector3(0, 0.155, -0.045), tailLen: 0.1 },
};

// ---------------------------------------------------------------- 色（sRGB の 16 進。頂点色に入れるときに線形へ直す）

export const COLOR = {
  skin: 0xc89a78,
  skinDark: 0xa87a5c,
  hair: 0x0c0b0b,
  lacquer: 0x0f0e0d,
  gold: 0xc9a75b,
  steel: 0xa7aeb6,
  iron: 0x34353a,
  brass: 0x9a7b45,
  wood: 0x2b1e15,
  bamboo: 0x6e5a3a,
  straw: 0x8f7d57,
  rope: 0x5b4a35,
  // 光秀（忍びの姿）：墨色。真っ黒だと形が消えるので、わずかに青みのある炭色にする
  sumi: 0x1c1e24,
  sumiLight: 0x272a32,
  sumiLacquer: 0x111215,
  kikyo: 0x74bde6,
  // 足軽
  ashiCloth: 0x2c2a2a,
  ashiUnder: 0x3a3127,
  navy: 0x2c4180,
  tabiNavy: 0x1d2236,
  // 番兵（侍）
  samuLacquer: 0x1c1512,
  maroon: 0x5c2125,
  sodeRed: 0x8a2c2e,
  samuHakama: 0x3a342d,
  hachimaki: 0xd9d2c3,
  // 蘭丸
  purple: 0x5d2f86,
  ranHakama: 0x6f7891,
  white: 0xefe8d8,
  // 信長
  nightRobe: 0xe8e3d6,
  haori: 0x141415,
  seat: 0x5e2c1f,
  // 提灯の紙（内から光る）
  paper: 0xf6e2b8,
} as const;

/** 材質の性質（粗さ・金属らしさ）。頂点ごとに持たせ、1つの材質で全部を描く。 */
export const SURF = {
  cloth: { r: 0.92, m: 0, detail: 1 },
  clothSoft: { r: 0.85, m: 0, detail: 1 },
  silk: { r: 0.62, m: 0, detail: 1 },
  lacquer: { r: 0.3, m: 0, detail: 2 },
  lacquerMatte: { r: 0.48, m: 0, detail: 2 },
  skin: { r: 0.62, m: 0 },
  hair: { r: 0.45, m: 0 },
  steel: { r: 0.24, m: 1, detail: 3 },
  iron: { r: 0.55, m: 0.85, detail: 3 },
  brass: { r: 0.4, m: 0.9, detail: 3 },
  wood: { r: 0.6, m: 0 },
  straw: { r: 0.95, m: 0 },
  paper: { r: 0.8, m: 0 },
  gold: { r: 0.38, m: 0 },
} as const;

// r07-chars: 色だけでは布・漆・金属が同じ滑らかな塊に見える。休みの座標に貼り付く実寸の
// 織り目／塗膜／研磨を追加する。画素より細かい模様は微分で消し、遠景のちらつきを防ぐ。
export const MATERIAL_DETAIL = {
  clothPitch: 0.0032, grainPitch: 0.0024, dyePitch: 0.16,
  filter: [0.7, 2.8], openingBlend: [0.95, 1.05], clothBump: 0.00014, lacquerBump: 0.000035, metalBump: 0.000012,
  clothDye: 0.075, clothRough: 0.045, lacquerRough: 0.045, metalRough: 0.035,
};

// r07-chars: 棒状の腕と一枚の漆胴を、小袖の余裕・合わせ・帯・脚絆へ読み分ける。
// 骨の寸法は変えず、装具は腰／腕／脛に追従させる。黒い潜入者と背の桔梗は保持。
export const PLAYER_OUTFIT = {
  sleeve: { top: 0.061, end: 0.048, to: 0.35, shoulderRise: 0.015, underRise: 0.008, underInset: 0.03, color: 0x30333b },
  belt: { y: 0.987, h: 0.07, rx: 0.162, rz: 0.128, color: 0x36383e },
  knot: { at: [-0.09, 0.989, 0.117], r: 0.0038, tail: 0.09, color: 0x525157 },
  armor: { r: 0.51, rows: [1.08, 1.19, 1.295], cordR: 0.0024, cordLift: 0.005, arc: 1.2, samples: 18, color: 0x393237 },
  pouch: { at: [-0.19, 0.95, 0.025], h: 0.11, rx: 0.042, rz: 0.027, color: 0x3a3330 },
  cuff: { h: 0.022, rx: 0.049, rz: 0.047 },
  legTies: { belowKnee: [0.085, 0.16, 0.235], r: 0.052, h: 0.01, color: 0x45434a },
  rivet: { r: 0.0032, x: 0.12, forward: 0.11, y: [1.12, 1.245] },
  pleats: { count: 5, amp: 0.004 },
  // 材質の織り目は皮膚の開口部では消す。眼は丸い黒点から、細い瞼と暗い虹彩へ。
  eyes: { openingW: 0.34, openingH: 0.06, space: 0.15, halfW: 0.065, halfH: 0.015, irisR: 0.018, pupilR: 0.009, lidW: 0.007 },
};
export const PLAYER_ARMOR_SECTIONS = [[0.98, 0.158, 0.122, 0], [1.06, 0.152, 0.118, 0.006], [1.15, 0.16, 0.124, 0.01], [1.24, 0.172, 0.128, 0.01], [1.3, 0.172, 0.12, 0.002]] as const;

// r07-chars: 主役は潜入。刀を振り回さず、肩を引く短い溜め→t=.3で前腕／肘→回収。
// 尺はmainの更新値に連番を合わせるだけ。実動作は契約の正規化tで進む。刃・一閃・流血は出さない。
export const CLOSE_COMBAT = {
  duration: 0.6, hitT: 0.3, staggerDuration: 0.85,
  elbowPole: [-0.55, -0.12, 0.85] as const,
  fall: [0.65, 0.95] as const,
};
export const MELEE_KEYS: Key[] = [
  { t: 0, hips: [0, 0.86, 0], hipsR: [2, -6, 0], b: { spine: [5, 0, 0], chest: [4, -8, 0], neck: [-3, 0, 0], head: [-2, 0, 0] }, R: { point: [-0.17, 1.18, 0.16] }, L: { point: [0.13, 1.23, 0.2] }, plant: 1, draw: 0, arc: 0 },
  { t: 0.18, hips: [0, 0.845, -0.015], hipsR: [3, -12, 0], b: { chest: [3, -15, -2] }, R: { point: [-0.2, 1.29, 0.16] }, L: { point: [0.11, 1.25, 0.24] } },
  { t: 0.3, hips: [0, 0.85, 0.065], hipsR: [6, 15, 0], b: { spine: [6, 4, 0], chest: [5, 18, 1], neck: [-5, -7, 0], head: [-3, -5, 0] }, R: { point: [0.005, 1.4, 0.22] }, L: { point: [0.13, 1.23, 0.24] } },
  { t: 0.42, hips: [0, 0.85, 0.06], hipsR: [6, 12, 0], b: { chest: [5, 13, 0] }, R: { point: [0.01, 1.37, 0.22] } },
  { t: 0.72, hips: [0, 0.86, 0.015], hipsR: [3, 1, 0], b: { spine: [5, 0, 0], chest: [4, 0, 0], neck: [-3, 0, 0], head: [-2, 0, 0] }, R: { point: [-0.17, 1.23, 0.18] }, L: { point: [0.13, 1.23, 0.2] } },
  { t: 1, hips: [0, 0.86, 0], hipsR: [2, 0, 0], b: { chest: [4, 0, 0] }, R: { point: [-0.19, 1.08, 0.15] }, L: { point: [0.19, 1.08, 0.15] } },
];

// r07-chars: 1撃目は胸・頭が遅れて反り、膝で受けて立ち直る。2撃目だけ同じ初動から崩す。
export const STAGGER_KEYS: Key[] = [
  { t: 0, hips: [0, 0.875, 0], hipsR: [0, 0, 0], b: {
    spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    shoulderR: [0, 0, 0], shoulderL: [0, 0, 0], upperArmR: [-8, 0, -4], upperArmL: [-8, 0, 4],
    foreArmR: [-12, 0, 0], foreArmL: [-12, 0, 0], handR: [0, 0, 0], handL: [0, 0, 0],
    thighL: [0, 0, 0], thighR: [0, 0, 0], shinL: [0, 0, 0], shinR: [0, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0],
  }, R: { point: [-0.2, 1.06, 0.24] }, L: { point: [0.18, 1.08, 0.18] }, spear: { butt: [-0.23, 0.02, 0.16], dir: [0.03, 1, 0.08], w: 1 }, plant: 1, draw: 0, arc: 0 },
  { t: 0.13, hips: [0, 0.865, -0.03], hipsR: [-6, 0, 2], b: { spine: [-7, 0, 0], chest: [-12, -3, 0], neck: [-8, 0, 0], head: [-7, 0, 2] }, R: { point: [-0.22, 1.12, 0.15] }, L: { point: [0.2, 1.22, 0.2] }, spear: { butt: [-0.24, 0.02, 0.18], dir: [0.03, 1, -0.02], w: 1 } },
  { t: 0.32, hips: [0.015, 0.815, -0.045], hipsR: [-2, 0, 5], b: { spine: [7, 0, 2], chest: [-4, -3, 0], neck: [-13, 0, 0], head: [-10, 0, 4] }, R: { point: [-0.24, 1.05, 0.18] }, L: { point: [0.12, 1.18, 0.3] } },
  { t: 0.62, hips: [0.008, 0.845, -0.015], hipsR: [2, 0, 2], b: { spine: [6, 0, 0], chest: [7, 0, 0], neck: [3, 0, 0], head: [5, 0, 0] }, R: { point: [-0.22, 1.06, 0.22] }, L: { point: [0.14, 1.14, 0.26] } },
  { t: 1, hips: [0, 0.875, 0], hipsR: [0, 0, 0], R: { point: [-0.2, 1.06, 0.24] }, L: { point: [0.18, 1.08, 0.18] } },
];
export const STAGGER_FALL_KEYS: Key[] = [
  { t: 0.56, hips: [0.03, 0.57, -0.06], hipsR: [4, 0, 24], b: { spine: [15, 0, -2], chest: [10, 0, -2], neck: [12, 0, 4], head: [16, 0, 6], thighL: [-48, 6, -6], thighR: [-38, -4, 4], shinL: [84, 0, 0], shinR: [76, 0, 0], upperArmL: [-36, 0, 12], upperArmR: [-40, 0, -10], foreArmL: [-32, 0, 0], foreArmR: [-26, 0, 0] }, R: { pointW: 0 }, L: { pointW: 0 }, plant: 0.25, spear: { butt: [0.36, 0.015, -0.4], dir: [-0.5, 0.4, 1], w: 1 } },
];
export const STAGGER_SETTLE_T = 0.9;

// r07-chars: 正面の打点・1撃目の回復・2撃目の倒れが同一カメラで比較できる連番。
export const COMBAT_REVIEW = {
  lead: 0.2, starts: [0.5, 1.7] as const, separation: 0.7,
  camera: [0.1, 1.25, 2.8] as const, target: [0, 0.82, 0] as const, fov: 38,
  guardsX: [-0.65, 0.65] as const,
};

// r06-chars: 全員同じ卵形の顔から、若い小姓の細い顎・侍の張った頬・信長の長めの鼻へ。
// 頭頂と耳の位置は保ち、頭巾・髷・鉢巻との接続を変えない。
export const HEAD = { rx: 0.08, ry: 0.104, rz: 0.094 };
export interface FaceShape {
  cheek: number;
  jaw: number;
  chinForward: number;
  nose: readonly [number, number, number];
  noseY: number;
}
export const FACE_SHAPE: Record<CharacterKind, FaceShape> = {
  player: { cheek: 0, jaw: 0.18, chinForward: 0.04, nose: [0.011, 0.02, 0.016], noseY: -0.024 },
  ashigaru: { cheek: 0.02, jaw: 0.2, chinForward: 0.04, nose: [0.01, 0.019, 0.015], noseY: -0.024 },
  samurai: { cheek: 0.08, jaw: 0.08, chinForward: 0.075, nose: [0.011, 0.022, 0.018], noseY: -0.022 },
  ranmaru: { cheek: 0.035, jaw: 0.36, chinForward: 0.025, nose: [0.008, 0.017, 0.012], noseY: -0.024 },
  nobunaga: { cheek: 0.015, jaw: 0.23, chinForward: 0.09, nose: [0.01, 0.026, 0.019], noseY: -0.018 },
};
export const FACE_CONTOUR = { cheekY: -0.2, cheekSpan: 0.48, napeInset: 0.22, noseForward: 0.93 };

// r06-chars: 16分割で7〜10本のひだを描くと折り目が潰れる。各ひだを8分割し、腰でなだらかに消す。
export const HAKAMA_PLEATS = {
  samples: 8,
  waistFade: 0.3,
  defaultAmp: 0.006,
  // r06-chars: 深い10本の波は蛇腹に見えるため、片脚6本・10mmの広い折り目にする。
  ranmaru: { count: 6, amp: 0.01 },
};

// r06-chars: 襟元が筒に見えるため、胴の表面に沿う左前の合わせを加える。寸法は休みの姿勢のm。
export const KIMONO_COLLAR = {
  path: [[0.035, 1.408], [0.068, 1.36], [0.04, 1.31], [0, 1.25], [-0.084, 1.12], [-0.118, 1.055]] as const,
  segments: 20,
  across: 4,
  surfaceLift: 0.003,
  overlapLift: 0.003,
  edgeRoll: 0.0015,
  skinSharp: 3,
  ranmaru: { innerWidth: 0.046, innerEndY: 1.25, width: 0.032 },
  nobunaga: { innerWidth: 0.05, innerEndY: 1.25, width: 0.041, color: 0xd3cbbb },
  // r07-chars: 墨の小袖の合わせは漆胴の上だけに見せる。r06の蘭丸／信長の襟は変更しない。
  player: { innerWidth: 0.026, innerEndY: 1.31, outerEndY: 1.31, width: 0.021, innerColor: 0x45464d },
};

/** 提灯の紙の光り方（頂点の発光の係数。後処理の光のにじみで拾われる強さ）。 */
// r00-shape: 指摘「紙が白く飛んで紋が見えない」 2.4 → 1.15
export const LANTERN_GLOW = 1.15;

/**
 * プレイヤーだけの縁の光（r02-fix-visual：指摘「暗い所でプレイヤーが地面と同じ暗さになって消える」）。
 * 輪郭の細い帯に、空からの寒色の光を足す（布の色を掛けない＝墨の布でも縁が読める）。灯りの中では弱め、闇ほど強める。
 * color は線形の放射（後処理の前の値）、width は輪郭の帯の太さ（1−n·v の始まり）、lit は「灯りの中」とみなす照度の範囲。
 */
export const RIM = {
  color: [0.095, 0.14, 0.24] as const,
  width: 0.45,
  /** 灯りの中の残り（0..1） */
  inLight: 0.3,
  lit: [0.06, 0.3] as const,
  /** 当て身を受けている番兵の縁の光の強さ（0..1）と、点く・消える速さ（毎秒）。r03-fix-visual 追加 */
  victim: 0.85,
  victimRise: 6,
  victimFall: 1.4,
};

// ---------------------------------------------------------------- 手提灯（RULES.md：番兵の前 0.35m・右 0.2m・高さ 0.9m）

export const LANTERN = {
  /** 明かりの中心（体の前・右・高さ）。描く提灯の紙の中心もここに合わせる。 */
  center: new Vector3(-0.2, 0.9, 0.35),
  /** 竿の長さと、手から竿の先までの向き（上向きの角・度）。 */
  poleLen: POLE_LEN,
  poleUpDeg: 24,
  /** 竿の先から紙の中心まで（吊り紐＋紙の半径）。 */
  hang: 0.19,
  paperR: 0.13,
  paperH: 0.25,
};

// ---------------------------------------------------------------- 歩き方（足運び）

export const GAIT = {
  /** 歩きの歩調（歩/秒）＝ a + b × 速さ。 */
  walkCadence: [1.25, 0.6] as const,
  /** 走りの歩調。 */
  // r01-chars-周1: 指摘「走りで腰が 40cm 上下する（体の大きさに対して歩幅が長い）」 2.6+0.12v → 3.0+0.12v（5.2 m/s で歩幅 1.61→1.44m）
  runCadence: [3.0, 0.12] as const,
  /** しゃがみ歩きの歩調。 */
  // r01-chars-周1: 指摘「しゃがみ歩きで後ろ脚の膝が地面すれすれまで落ちる」 1.75+0.58v → 2.3+0.6v（1.5 m/s で歩幅 0.57→0.47m）
  crouchCadence: [2.3, 0.6] as const,
  /** 足が地面に着いている割合（1周期に対して）。歩き（遅い→速い）・走り・しゃがみ。 */
  walkDuty: [0.62, 0.57] as const,
  // r01-chars-周1: 指摘「走りの着地で腰が深く沈み、大股の踏み込みに見える」 接地の割合 0.36→0.31（着地点は gait.ts で 0.4→0.3）
  runDuty: 0.26,
  // r02-chars-周2: 指摘「しゃがんで歩き出す一歩目が深い踏み込みになる」 0.62→0.56（後ろ足を早く抜く）
  crouchDuty: 0.56,
  /** 歩きと走りを混ぜ始める速さと、走りになりきる速さ（m/s）。 */
  runBlend: [3.0, 3.9] as const,
  /** 振り出す足の高さ（m）。歩き（遅い→速い）・走り・しゃがみ。 */
  walkLift: [0.055, 0.09] as const,
  runLift: 0.26,
  crouchLift: 0.06,
  /** かかとから着く角と、つま先で蹴る角（度）。 */
  heelStrikeDeg: 14,
  toeOffDeg: [22, 48] as const,
  /** 足が地面に着いている間のうち、かかとで転がる割合と、つま先で転がる割合。 */
  heelRock: 0.14,
  toeRock: 0.24,
  /** 止まっていると見なす速さ（m/s）。 */
  stopSpeed: 0.12,
  /** 止まった後、足が休みの位置からこれ以上ずれていたら一歩で直す（m・度）。 */
  settleDist: 0.09,
  settleYawDeg: 28,
  settleTime: 0.3,
  settleLift: 0.045,
  /** これより大きく1コマで動いたら、瞬間移動として足運びを最初からやり直す（m）。 */
  teleport: 1.2,
};

/** 構え（立つ・しゃがむ）ごとの腰の高さ（骨盤の中心の、休みの高さからの差。m）と前傾（度）。 */
export const POSTURE = {
  standDrop: 0.012,
  walkDropFast: 0.035,
  runDrop: 0.06,
  runFlightRise: 0.035,
  crouchHipY: 0.6,
  leanWalk: [2.5, 6] as const,
  leanRun: 17,
  leanCrouch: 30,
};

// ---------------------------------------------------------------- 混ぜる時間（秒）

export const BLEND = {
  stance: 0.3,
  awareness: 0.3,
  actionIn: 0.14,
  actionOut: 0.25,
  weapon: 0.28,
  /** 見た目の向きが、ゲームの向きに追いつく時間（秒）と角速度の上限（rad/s）。 */
  // r02-chars-周2: 指摘「その場で向きを変えると、体が速く回りすぎて提灯が胸の高さまで振り上がる」
  //   動いている時 0.085→0.09 秒、止まっている時は 0.22 秒・毎秒 6 rad まで
  yawTime: 0.09,
  yawMaxSpeed: 14,
  yawTimeStill: 0.18,
  yawMaxSpeedStill: 7,
  /** 頭の向き（headYaw）の追従。 */
  headTime: 0.12,
};

// ---------------------------------------------------------------- 構え（歩き・止まりの層の姿勢。度と m）

export interface Posture {
  /** 腰を下げる量（m）。 */
  drop: number;
  /** 上体の前傾（腹と胸に分ける）。 */
  lean: number;
  /** 首の前への傾き（頭を突き出す）。 */
  neck: number;
  /** 目線の下向き（世界から見た頭の傾き）。 */
  gaze: number;
  /** 半身（体を右へひねる。左の肩が前へ出る）。 */
  hanmi: number;
  /** 足の横の広がり（片側に足す）と、前後（左・右）、つま先の開き。 */
  latW: number;
  fwdL: number;
  fwdR: number;
  out: number;
  /** 空いた腕の構え：外への開き・前への上げ・肘の曲げ。 */
  armAbd: number;
  armFwd: number;
  elbow: number;
}

export const POSE_TABLE: Record<'calm' | 'suspicious' | 'alert' | 'playerStand' | 'crouch' | 'nobuStand', Posture> = {
  calm: { drop: 0.012, lean: 2, neck: 2, gaze: 6, hanmi: 0, latW: 0.015, fwdL: 0.02, fwdR: -0.02, out: 9, armAbd: 9, armFwd: 4, elbow: 14 },
  // 前のめりで頭を突き出す
  suspicious: { drop: 0.05, lean: 13, neck: 16, gaze: 2, hanmi: 6, latW: 0.05, fwdL: 0.12, fwdR: -0.08, out: 12, armAbd: 12, armFwd: 12, elbow: 34 },
  // 腰を落として半身に構える
  alert: { drop: 0.13, lean: 10, neck: 6, gaze: 2, hanmi: 22, latW: 0.1, fwdL: 0.2, fwdR: -0.18, out: 16, armAbd: 16, armFwd: 16, elbow: 46 },
  // 光秀の立ち姿は、膝を少し曲げた低い構え
  // r01-chars-周1: 指摘「遊ぶ角度で光秀と侍がどちらも暗い人影で見分けにくい」 光秀は低く前へ：腰 0.045→0.075、前傾 9→13
  playerStand: { drop: 0.075, lean: 13, neck: 4, gaze: 8, hanmi: 0, latW: 0.035, fwdL: 0.04, fwdR: -0.04, out: 10, armAbd: 11, armFwd: 14, elbow: 32 },
  // r01-chars-周1: 指摘「しゃがみ歩きが背を立てた屈伸に見える」 前傾 30→40、首 -6→-12、腰の落とし 0.33→0.31
  crouch: { drop: 0.27, lean: 40, neck: -12, gaze: 14, hanmi: 0, latW: 0.07, fwdL: 0.1, fwdR: -0.1, out: 14, armAbd: 16, armFwd: 30, elbow: 46 },
  nobuStand: { drop: 0.01, lean: 0, neck: 2, gaze: 4, hanmi: 0, latW: 0.03, fwdL: 0.02, fwdR: -0.02, out: 10, armAbd: 8, armFwd: 2, elbow: 10 },
};

/** 歩きの体の揺れ（度・m）：骨盤のひねり、骨盤の傾き、横の揺れ、腕の振り。 */
export const SWAY = {
  pelvisYawWalk: 5,
  pelvisYawRun: 9,
  pelvisRoll: 2.6,
  latSway: 0.018,
  armSwingWalk: [12, 26] as const,
  armSwingRun: 42,
  runElbow: 72,
  /** 走りの前傾を加速度から足すばね（周波数 Hz・減衰比・1 m/s² あたりの度）。 */
  accelLeanHz: 2.2,
  accelLeanZeta: 0.75,
  accelLeanDeg: 1.4,
  /** 曲がるときの体の傾き（向きの角速度 1 rad/s あたりの度・速さで掛ける）。 */
  turnRollDeg: 4,
};

/** 槍の持ち方（腰からの位置。m）。both は両手、right/left は片手。dir は片手のときの穂先への向き。s は主の手の、石突からの距離。 */
export interface SpearCarry {
  R?: [number, number, number];
  L?: [number, number, number];
  dir?: [number, number, number];
  s: number;
}

export const SPEAR_CARRY = {
  // 槍を立てて楽に（止まっていれば石突は地面）
  calm: { R: [-0.23, 0.112, 0.24], dir: [0.02, 1, 0.1], s: 1.04 } as SpearCarry,
  calmWalk: { R: [-0.23, 0.19, 0.22], dir: [0.03, 1, 0.14], s: 1.04 } as SpearCarry,
  // 少し寝かせて両手で
  suspicious: { R: [-0.21, 0.055, 0.06], L: [-0.12, 0.415, 0.4], s: 0.72 } as SpearCarry,
  // 水平に構える（右手は腰、左手は前）
  alert: { R: [-0.2, 0.095, 0.0], L: [-0.15, 0.175, 0.38], s: 0.7 } as SpearCarry,
  // 提灯持ちは左手で槍を持つ
  calmLeft: { L: [0.23, 0.112, 0.2], dir: [0.0, 1, 0.08], s: 1.04 } as SpearCarry,
  calmLeftWalk: { L: [0.23, 0.19, 0.2], dir: [0.0, 1, 0.12], s: 1.04 } as SpearCarry,
  suspiciousLeft: { L: [0.22, 0.09, 0.26], dir: [-0.05, 0.85, 0.5], s: 0.9 } as SpearCarry,
  alertLeft: { L: [0.16, 0.1, 0.12], dir: [-0.08, 0.15, 1], s: 0.75 } as SpearCarry,
};
