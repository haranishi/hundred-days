// OWNER: city
// 人の形（r01-city）。メインループの所見「人が四角い頭と胴の玩具に見える」を受けて、箱の組み合わせから作り直した。
// 頭は楕円の回転体、胴は楕円の断面を連ねた面（肩・胸・腰のくびれ）、手足はすぼまる管で、法線は滑らかにつなぐ。
// 身長 1.70m の実寸で組んで身長で割り、インスタンスで各人の背の高さに伸ばす。
// 型は4つ（ズボンと短い髪・スカートと肩までの髪・長い上着・背負いかばん）× 姿勢2つ（立つ・歩く）。添字は 姿勢×4＋型。
// 塗り：aPaint 1 = 上着（インスタンスの色）、2 = 下の服（上着の色から決める）。肌・髪・靴は形の色。
import type { BufferGeometry } from 'three';
import { LifeSoup, type V3 } from './lifeSoup';

const HEIGHT = 1.7;
const TOP = 1;
const BOTTOM = 2;
const SKINS = [0xd2ae92, 0xc49c80, 0xb88e72] as const;
const HAIRS = [0x1b1816, 0x2a2119, 0x151414, 0x4a3a2c] as const;
const SHOES = 0x1b1b1c;
const BAG = 0x2a2624;

export const PERSON_VARIANTS = 4;

interface Pose {
  /** 脚：左右それぞれの 腰・膝・足首 の z（前が +） */
  legs: [number, number, number][];
  /** 足首の高さ（後ろ足のかかとが上がる） */
  ankleY: [number, number];
  /** 腕：左右それぞれの 肘・手首 の z */
  arms: [number, number][];
}

const STAND: Pose = { legs: [[0, 0.01, 0], [0, 0.01, 0]], ankleY: [0.09, 0.09], arms: [[-0.01, 0.02], [-0.01, 0.02]] };
const WALK: Pose = { legs: [[0.02, 0.13, 0.2], [-0.02, -0.05, -0.2]], ankleY: [0.09, 0.14], arms: [[-0.08, -0.12], [0.1, 0.19]] };

function torso(s: LifeSoup, bottomY: number, flare: number): void {
  // 腰から肩まで：楕円の断面（半幅 hx・半奥行き hz）
  const rows: [number, number, number][] = [
    [bottomY, 0.165 + flare, 0.1 + flare * 0.6],
    [0.96, 0.158, 0.094],
    [1.05, 0.145, 0.088],
    [1.18, 0.162, 0.1],
    [1.3, 0.18, 0.104],
    [1.375, 0.188, 0.094],
    [1.42, 0.15, 0.074],
    [1.45, 0.068, 0.05],
  ];
  const sides = 10;
  const P: V3[][] = rows.map(([y, hx, hz]) => {
    const ring: V3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      ring.push([Math.cos(a) * hx, y, Math.sin(a) * hz]);
    }
    return ring;
  });
  // 腰（1.0m より下）はズボンの色、上は上着の色（長い上着は裾まで上着の色）
  const coat = bottomY < 0.8;
  s.grid(P, true, (i) => [0, rows[i][0], 0], (i) => {
    const ym = (rows[i][0] + rows[i + 1][0]) / 2;
    s.set(0xffffff, ym < 1.0 && !coat ? BOTTOM : TOP, 0.85);
  });
  s.set(0xffffff, coat ? TOP : BOTTOM, 0.85);
  s.cap(P[0], [0, -1, 0]);
}

/** 頭の回転体の輪郭（半径, 高さ）。髪はこの外側に沿わせる。 */
const HEAD_PROFILE: [number, number][] = [
  [0, 1.462],
  [0.036, 1.468],
  [0.06, 1.5],
  [0.075, 1.55],
  [0.078, 1.6],
  [0.07, 1.65],
  [0.048, 1.686],
  [0, 1.7],
];

function headRadius(y: number): number {
  const P = HEAD_PROFILE;
  if (y <= P[0][1] || y >= P[P.length - 1][1]) return 0;
  for (let i = 0; i + 1 < P.length; i++) {
    const [r0, y0] = P[i];
    const [r1, y1] = P[i + 1];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

function head(s: LifeSoup, skin: number, hair: number, longHair: boolean): void {
  s.set(skin, 0, 0.7);
  // 首と頭（奥行きのある楕円の回転体。顔の側を少し前へ）
  s.tube([[0, 1.4, 0.0], [0, 1.5, 0.012]], [0.05, 0.046], 6);
  s.lathe(HEAD_PROFILE, 8, [0, 0, 0.012], 1, 1.2);
  // 髪：頭の外側に沿う帽子の形。下の縁は前（額）で高く、後ろで低い。肩までの髪は、頭のいちばん広い所から下へまっすぐ垂らす
  s.set(hair, 0, 0.8);
  const sides = 8;
  const back = longHair ? 1.4 : 1.545;
  const front = 1.625;
  const rowsT = [0, 0.3, 0.55, 0.8, 1];
  const P: V3[][] = rowsT.map((t) => {
    const ring: V3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      // sin が +1 で前（顔）、-1 で後ろ
      const bottom = back + (front - back) * (0.5 + 0.5 * sn);
      const y = bottom + (1.708 - bottom) * t;
      const r = t >= 1 ? 0.004 : (y < 1.6 ? 0.078 : headRadius(y)) + 0.009;
      ring.push([c * r, y, 0.012 + sn * r * 1.2]);
    }
    return ring;
  });
  s.grid(P, true, (i) => [0, 1.56 + 0.12 * rowsT[i], 0.012]);
}

function limbs(s: LifeSoup, pose: Pose, skin: number, skirt: boolean): void {
  // 脚：腰・膝・足首（スカートの型は膝から下が肌に近い色のストッキング）
  for (let side = 0; side < 2; side++) {
    const x = side === 0 ? -0.085 : 0.085;
    const [zh, zk, za] = pose.legs[side];
    s.set(skirt ? 0x3a3033 : 0xffffff, skirt ? 0 : BOTTOM, 0.85);
    s.tube(
      [
        [x, 0.92, zh],
        [x * 1.02, 0.5, zk],
        [x * 0.98, pose.ankleY[side], za],
      ],
      [0.074, 0.054, 0.042],
      6,
    );
    s.set(SHOES, 0, 0.55);
    const ay = pose.ankleY[side] - 0.05;
    s.box([x - 0.048, Math.max(0, ay - 0.03), za - 0.07], [x + 0.048, ay + 0.06, za + 0.17]);
  }
  // 腕：肩・肘・手首と手（上着の袖）
  for (let side = 0; side < 2; side++) {
    const sx = side === 0 ? -1 : 1;
    const [ze, zw] = pose.arms[side];
    s.set(0xffffff, TOP, 0.85);
    s.tube(
      [
        [sx * 0.2, 1.37, 0.0],
        [sx * 0.225, 1.1, ze],
        [sx * 0.215, 0.86, zw],
      ],
      [0.05, 0.041, 0.034],
      6,
    );
    s.set(skin, 0, 0.7);
    s.tube(
      [
        [sx * 0.214, 0.85, zw + 0.004],
        [sx * 0.21, 0.74, zw + 0.012],
      ],
      [0.032, 0.026],
      5,
    );
  }
}

/** 人の近景の形。variant：0 ズボン・1 スカート・2 長い上着・3 背負いかばん。 */
function person(pose: Pose, variant: number): BufferGeometry {
  const s = new LifeSoup();
  const skin = SKINS[variant % SKINS.length];
  const hair = HAIRS[(variant * 3 + 1) % HAIRS.length];
  const skirt = variant === 1;
  const coat = variant === 2;
  limbs(s, pose, skin, skirt);
  torso(s, coat ? 0.66 : 0.88, coat ? 0.03 : 0);
  if (skirt) {
    // 膝丈のスカート（腰から裾へ少し広がる）
    s.set(0xffffff, BOTTOM, 0.85);
    s.lathe(
      [
        [0.15, 0.6],
        [0.158, 0.66],
        [0.15, 0.85],
        [0.14, 1.02],
        [0.0, 1.03],
      ],
      10,
      [0, 0, 0],
      1.1,
      0.72,
    );
  }
  if (variant === 3) {
    // 背負いかばん（背中の丸い箱）
    s.set(BAG, 0, 0.7);
    s.tube(
      [
        [0, 1.0, -0.17],
        [0, 1.36, -0.16],
      ],
      [0.13, 0.12],
      6,
    );
  }
  head(s, skin, hair, skirt);
  return s.normalizeTo(HEIGHT, HEIGHT, HEIGHT).geometry();
}

/** 人の近景の形（添字は 姿勢×4＋型）。 */
export function personShapes(): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (const pose of [STAND, WALK]) for (let v = 0; v < PERSON_VARIANTS; v++) out.push(person(pose, v));
  return out;
}

/** 人の遠景の形：足から頭までを6角の回転体1つで（下の服・上着・肌・髪を高さで塗り分ける）。 */
export function personFarShapes(): BufferGeometry[] {
  const make = (skirt: boolean): BufferGeometry => {
    const s = new LifeSoup();
    const rows: [number, number, number, number][] = [
      // 半径（横）、高さ、塗り（0 形の色・1 上着・2 下の服）、色
      [0.1, 0, 0, SHOES],
      [0.11, 0.06, 2, 0xffffff],
      [skirt ? 0.13 : 0.115, 0.52, 2, 0xffffff],
      [0.15, 0.6, 1, 0xffffff],
      [0.19, 0.8, 1, 0xffffff],
      [0.12, 0.845, 1, 0xffffff],
      [0.07, 0.87, 0, SKINS[0]],
      [0.085, 0.93, 0, HAIRS[0]],
      [0.07, 0.985, 0, HAIRS[0]],
      [0.0, 1.0, 0, HAIRS[0]],
    ];
    const sides = 6;
    const P: V3[][] = rows.map(([r, y]) => {
      const ring: V3[] = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        ring.push([Math.cos(a) * r, y, Math.sin(a) * r * 0.62]);
      }
      return ring;
    });
    s.grid(P, true, (i) => [0, rows[i][1], 0], (i) => {
      const [, , paint, color] = rows[i];
      s.set(color, paint, 0.85);
    });
    return s.geometry();
  };
  const a = make(false);
  const b = make(true);
  const out: BufferGeometry[] = [];
  for (let p = 0; p < 2; p++) for (let v = 0; v < PERSON_VARIANTS; v++) out.push(v === 1 ? b : a);
  return out;
}
