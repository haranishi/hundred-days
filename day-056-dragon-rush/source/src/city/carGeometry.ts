// OWNER: city
// 車の形（r01-city）。メインループの所見「車が角ばった箱で玩具に見える」を受けて、箱の組み合わせから作り直した。
// 車体は、前後に並べた断面（肩の丸い輪）を連ねた滑らかな面で、横から見た線（ボンネット・腰の線・トランク）と
// タイヤの上の切り欠き（ホイールアーチ）を断面ごとの高さで作る。客室は窓の帯と柱（A・B・C）を四角形ごとに塗り分ける。
// タイヤは円柱とホイールの円板。実寸（m）で組んでから大きさ1にそろえ、インスタンスの行列で実寸へ伸ばす。
// 形の番号は config/streetLife.ts の CAR_TYPES の shape と同じ並び。
import type { BufferGeometry } from 'three';
import { LifeSoup, type V3 } from './lifeSoup';

const PAINT = 1;
const GLASS = 0x10151a;
const TIRE = 0x141414;
const WELL = 0x0b0b0c;
const RIM = 0x9a9ea2;
const TRIM = 0x1c1d1f;
const LIGHT_FRONT = 0xdcd8cc;
const LIGHT_REAR = 0x7a1410;
const PLATE = 0xd8d8cf;

/** 乗用車の形の数値（m）。z は前が +、車体の中心が 0。 */
interface CarForm {
  L: number;
  W: number;
  H: number;
  clearance: number;
  wheelR: number;
  wheelF: number;
  wheelB: number;
  /** ボンネットの先・腰の線（窓の下）・トランクの後ろの高さ */
  hoodY: number;
  beltY: number;
  deckY: number;
  /** 前の窓の付け根・屋根の前・屋根の後ろ・後ろの窓の付け根（z） */
  zWs: number;
  zRoofF: number;
  zRoofB: number;
  zRw: number;
  /** 屋根の幅（腰の幅に対する割合） */
  tumble: number;
  /** 前後の端を丸める長さ（m）と、上から見た角の丸め（m） */
  endRound: number;
  planRound: number;
  /** 後ろの横の窓がどこまで続くか（z）。セダンは太い C 柱、箱形は後ろまで窓 */
  sideGlassBack: number;
}

const SEDAN: CarForm = {
  L: 4.7, W: 1.79, H: 1.46, clearance: 0.16, wheelR: 0.32, wheelF: 1.38, wheelB: -1.36,
  hoodY: 0.8, beltY: 0.93, deckY: 0.98, zWs: 0.78, zRoofF: -0.02, zRoofB: -0.98, zRw: -1.58, tumble: 0.78,
  endRound: 0.42, planRound: 0.16, sideGlassBack: -0.92,
};
const HATCH: CarForm = {
  L: 4.1, W: 1.7, H: 1.52, clearance: 0.15, wheelR: 0.31, wheelF: 1.22, wheelB: -1.28,
  hoodY: 0.82, beltY: 0.95, deckY: 1.0, zWs: 0.92, zRoofF: 0.18, zRoofB: -1.55, zRw: -1.92, tumble: 0.8,
  endRound: 0.38, planRound: 0.16, sideGlassBack: -1.45,
};
const MINIVAN: CarForm = {
  L: 4.7, W: 1.78, H: 1.86, clearance: 0.16, wheelR: 0.33, wheelF: 1.48, wheelB: -1.38,
  hoodY: 0.92, beltY: 1.02, deckY: 1.02, zWs: 1.6, zRoofF: 0.85, zRoofB: -2.2, zRw: -2.33, tumble: 0.86,
  endRound: 0.36, planRound: 0.18, sideGlassBack: -2.12,
};
const KEI: CarForm = {
  L: 3.39, W: 1.475, H: 1.72, clearance: 0.15, wheelR: 0.28, wheelF: 1.12, wheelB: -1.12,
  hoodY: 0.86, beltY: 0.96, deckY: 0.96, zWs: 1.3, zRoofF: 0.72, zRoofB: -1.6, zRw: -1.69, tumble: 0.9,
  endRound: 0.26, planRound: 0.12, sideGlassBack: -1.5,
};
const TAXI: CarForm = { ...SEDAN, L: 4.65, W: 1.7, H: 1.52, hoodY: 0.84, beltY: 0.95, deckY: 0.98, tumble: 0.82, endRound: 0.3, planRound: 0.1 };

function smooth01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** 並びに値を足して、昇順に並べ、近すぎる値をまとめる。 */
function samples(values: number[], minGap: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || v - out[out.length - 1] > minGap) out.push(v);
  return out;
}

/** 車体の上の線（ボンネット・腰の線・トランク）と、前後の端の丸め。 */
function bodyTop(f: CarForm, z: number): number {
  const nose = f.L / 2;
  let y: number;
  if (z > f.zWs) y = f.hoodY + (f.beltY - f.hoodY) * smooth01((nose - z) / (nose - f.zWs));
  else if (z < f.zRw) y = f.beltY + (f.deckY - f.beltY) * smooth01((f.zRw - z) / Math.max(0.2, f.zRw + nose));
  else y = f.beltY;
  const e = endFactor(f, z);
  return y - 0.1 * e;
}

/** 端からの近さ（0：端から endRound より内側、1：端）。円弧で丸める。 */
function endFactor(f: CarForm, z: number): number {
  const d = f.L / 2 - Math.abs(z);
  if (d >= f.endRound) return 0;
  const t = 1 - d / f.endRound;
  return 1 - Math.sqrt(Math.max(0, 1 - t * t));
}

/** 車体の下の線：地上高、タイヤの上は切り欠き、端はバンパーの下が少し上がる。 */
function bodyBottom(f: CarForm, z: number, top: number): number {
  let y = f.clearance + 0.1 * endFactor(f, z);
  const ra = f.wheelR + 0.06;
  for (const wz of [f.wheelF, f.wheelB]) {
    const dz = Math.abs(z - wz);
    if (dz < ra) y = Math.max(y, f.wheelR + Math.sqrt(ra * ra - dz * dz));
  }
  return Math.min(y, top - 0.2);
}

function halfWidth(f: CarForm, z: number): number {
  return f.W / 2 - f.planRound * endFactor(f, z) - 0.02 * Math.max(0, (z - f.zWs) / (f.L / 2 - f.zWs));
}

/** 車体の断面（左の下から、肩を回って右の下まで）。detail 0 は中景用に点を減らす。 */
function bodyRing(hw: number, yb: number, yt: number, detail: 0 | 1): V3[] {
  const rc = Math.min(0.13, (yt - yb) * 0.45);
  const c45 = 0.29 * rc;
  const left: [number, number][] = detail
    ? [
        [-hw, yb],
        [-hw - 0.012, yb + 0.45 * (yt - yb - rc)],
        [-hw, yt - rc],
        [-hw + c45, yt - c45],
        [-hw + rc, yt],
      ]
    : [
        [-hw, yb],
        [-hw, yt - rc],
        [-hw + rc, yt],
      ];
  const pts: [number, number][] = [...left, [0, yt + 0.016], ...left.reverse().map(([x, y]) => [-x, y] as [number, number])];
  return pts.map(([x, y]) => [x, y, 0] as V3);
}

function wheel(s: LifeSoup, x: number, z: number, r: number, width: number, sides: number, outward: number, rim: boolean): void {
  // タイヤの踏み面（x 軸の円柱。肩を少し丸める）とタイヤの側面、ホイールの円板
  const ringAt = (xx: number, rr: number): V3[] => {
    const ring: V3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      ring.push([xx, r + Math.sin(a) * rr, z + Math.cos(a) * rr]);
    }
    return ring;
  };
  const xi = x - (outward * width) / 2;
  const xo = x + (outward * width) / 2;
  s.set(TIRE, 0, 0.92);
  const tread = rim ? [ringAt(xi, r * 0.97), ringAt(x, r), ringAt(xo, r * 0.97)] : [ringAt(xi, r), ringAt(xo, r)];
  s.grid(tread, true, () => [x, r, z]);
  s.cap(tread[tread.length - 1], [outward, 0, 0]);
  if (rim) {
    s.set(RIM, 0, 0.35, 0.6);
    s.cap(ringAt(xo + outward * 0.004, r * 0.6), [outward, 0, 0]);
  }
}

/** 乗用車（セダン・ハッチバック・箱形・軽・タクシー）。detail 0 で中景用に軽くする。 */
function passengerCar(f: CarForm, detail: 0 | 1, withSign: boolean): BufferGeometry {
  const s = new LifeSoup();
  const nose = f.L / 2;
  const tail = -f.L / 2;
  const step = detail ? 0.36 : 0.75;
  const zs: number[] = [];
  for (let z = tail; z < nose; z += step) zs.push(z);
  zs.push(nose);
  const endK = detail ? [0.03, 0.12, 0.28] : [0.1];
  for (const k of endK) zs.push(nose - k * f.endRound * 2.2, tail + k * f.endRound * 2.2);
  const ra = f.wheelR + 0.06;
  for (const wz of [f.wheelF, f.wheelB]) for (const k of detail ? [-1.02, -0.72, 0, 0.72, 1.02] : [-1, 0, 1]) zs.push(wz + k * ra);
  zs.push(f.zWs, f.zRw);
  const Z = samples(zs.filter((z) => z >= tail && z <= nose), detail ? 0.05 : 0.12);
  // 車体
  s.set(0xffffff, PAINT, 0.3, 0.35);
  const rings: V3[][] = Z.map((z) => {
    const yt = bodyTop(f, z);
    return bodyRing(halfWidth(f, z), bodyBottom(f, z, yt), yt, detail).map(([x, y]) => [x, y, z] as V3);
  });
  s.grid(rings, false, (i) => [0, (bodyTop(f, Z[i]) + f.clearance) / 2, Z[i]]);
  s.cap(rings[rings.length - 1], [0, 0, 1]);
  s.cap(rings[0], [0, 0, -1]);
  // 客室：窓の帯（横・前・後ろ）と柱・屋根を塗り分ける
  const cz: number[] = [];
  const cStep = detail ? 0.26 : 0.6;
  for (let z = f.zRw; z < f.zWs; z += cStep) cz.push(z);
  const zB = (f.zRoofF + f.zRoofB) / 2 + 0.12;
  // 窓の端と柱の境目に断面を置く（四角形ごとに塗るので、境目が断面の間に落ちると柱が消える）
  cz.push(f.zWs, f.zRoofF, f.zRoofB, f.zRoofF + 0.06, f.zRoofB - 0.06, zB - 0.05, zB + 0.05, f.zWs - 0.1, f.sideGlassBack);
  const CZ = samples(cz.filter((z) => z >= f.zRw && z <= f.zWs), detail ? 0.03 : 0.1);
  const roofH = f.H - f.beltY;
  const cabinH = (z: number): number => {
    if (z > f.zRoofF) return roofH * Math.sqrt(smooth01((f.zWs - z) / (f.zWs - f.zRoofF)));
    if (z < f.zRoofB) return roofH * Math.sqrt(smooth01((z - f.zRw) / Math.max(0.05, f.zRoofB - f.zRw)));
    return roofH;
  };
  const cabin: V3[][] = CZ.map((z) => {
    const h = Math.max(0.004, cabinH(z));
    const hwb = halfWidth(f, z) - 0.05;
    const hwt = hwb * f.tumble;
    const yb = bodyTop(f, z) - 0.05;
    const yr = yb + h;
    const sh = Math.min(1, h / 0.3);
    const left: [number, number][] = detail
      ? [
          [-hwb, yb],
          [-(hwb + hwt) / 2 - 0.01, yb + 0.55 * h],
          [-hwt, yr - 0.07 * sh],
          [-hwt * 0.55, yr - 0.008 * sh],
        ]
      : [
          [-hwb, yb],
          [-hwt, yr - 0.07 * sh],
        ];
    const pts: [number, number][] = [...left, [0, yr], ...left.reverse().map(([x, y]) => [-x, y] as [number, number])];
    return pts.map(([x, y]) => [x, y, z] as V3);
  });
  // 客室の内側の点は腰の線より十分下に置く（前後の窓の付け根では輪がほぼ平らで、腰の線の高さを内側にすると法線が下を向き、
  // 三角形が裏返って後ろの窓がぎざぎざに抜けた）
  s.grid(
    cabin,
    false,
    (i) => [0, bodyTop(f, CZ[i]) - 0.35, CZ[i]],
    (i, j) => {
      const zm = (CZ[i] + CZ[i + 1]) / 2;
      const sideSegs = detail ? 2 : 1;
      const side = j < sideSegs || j >= cabin[0].length - 1 - sideSegs;
      let glass: boolean;
      if (side) glass = zm < f.zWs - 0.1 && zm > f.sideGlassBack && Math.abs(zm - zB) > 0.05;
      else glass = zm > f.zRoofF + 0.02 || zm < f.zRoofB - 0.02;
      if (glass) s.set(GLASS, 0, 0.06, 0.25);
      else s.set(0xffffff, PAINT, 0.3, 0.35);
    },
  );
  // タイヤと、タイヤの奥の暗い泥よけ
  const sides = detail ? 10 : 6;
  const tw = Math.min(0.24, f.W * 0.12);
  for (const wz of [f.wheelF, f.wheelB]) {
    const hw = halfWidth(f, wz);
    s.set(WELL, 0, 0.95);
    s.box([-hw + 0.04 + tw, f.wheelR * 0.6, wz - ra * 0.95], [hw - 0.04 - tw, bodyTop(f, wz) - 0.16, wz + ra * 0.95]);
    for (const side of [-1, 1]) wheel(s, side * (hw - 0.03 - tw / 2), wz, f.wheelR, tw, sides, side, detail === 1);
  }
  // 床下（低い視点で車の下を透かさない）
  s.set(WELL, 0, 0.95);
  s.box([-halfWidth(f, 0) + 0.08, f.clearance, f.wheelB], [halfWidth(f, 0) - 0.08, f.clearance + 0.04, f.wheelF]);
  // 灯火・格子・番号板（前が +z）
  const yn = bodyTop(f, nose - 0.02);
  const hwn = halfWidth(f, nose - 0.05);
  const yl = yn - 0.14;
  s.set(LIGHT_FRONT, 0, 0.25, 0, 0.15);
  for (const x of [-1, 1]) s.box([x * hwn * 0.55 - 0.17, yl, nose - 0.04], [x * hwn * 0.55 + 0.17, yl + 0.09, nose + 0.006]);
  s.set(TRIM, 0, 0.5, 0.3);
  s.box([-hwn * 0.34, yl - 0.1, nose - 0.04], [hwn * 0.34, yl + 0.02, nose + 0.004]);
  const yd = bodyTop(f, tail + 0.02);
  const hwt2 = halfWidth(f, tail + 0.05);
  s.set(LIGHT_REAR, 0, 0.3, 0, 0.25);
  for (const x of [-1, 1]) s.box([x * hwt2 * 0.7 - 0.16, yd - 0.2, tail - 0.006], [x * hwt2 * 0.7 + 0.16, yd - 0.08, tail + 0.05]);
  if (detail) {
    s.set(PLATE, 0, 0.5, 0.1);
    s.box([-0.17, yl - 0.36, nose - 0.04], [0.17, yl - 0.2, nose + 0.01]);
    s.box([-0.17, yd - 0.42, tail - 0.01], [0.17, yd - 0.26, tail + 0.05]);
    // ドアミラー（客室の横の面に付ける。浮いて見えないよう、根元を客室の中へ入れる）
    s.set(0xffffff, PAINT, 0.3, 0.35);
    for (const x of [-1, 1]) {
      const hwm = halfWidth(f, f.zWs - 0.12) - 0.05;
      s.box([x > 0 ? hwm - 0.06 : -hwm - 0.09, f.beltY + 0.04, f.zWs - 0.2], [x > 0 ? hwm + 0.09 : -hwm + 0.06, f.beltY + 0.13, f.zWs - 0.1]);
    }
  }
  if (withSign) {
    s.set(0xe8d7a0, 0, 0.4, 0, 0.6);
    const zc = (f.zRoofF + f.zRoofB) / 2;
    s.box([-0.2, f.H - 0.01, zc - 0.12], [0.2, f.H + 0.13, zc + 0.12]);
  }
  return s.normalizeTo(f.W, f.H, f.L).geometry();
}

/** 路線バス：角の丸い箱。窓の帯・前の大きな窓・腰の帯・行き先の表示。 */
function bus(detail: 0 | 1): BufferGeometry {
  const L = 10.6;
  const W = 2.49;
  const H = 3.1;
  const s = new LifeSoup();
  const zs: number[] = [];
  const step = detail ? 0.9 : 2.1;
  for (let z = -L / 2; z < L / 2; z += step) zs.push(z);
  zs.push(L / 2, L / 2 - 0.08, L / 2 - 0.25, -L / 2 + 0.08, -L / 2 + 0.25);
  const wheelR = 0.48;
  const wF = L / 2 - 2.35;
  const wB = -L / 2 + 2.9;
  for (const wz of [wF, wB]) for (const k of detail ? [-1.02, -0.72, 0, 0.72, 1.02] : [-1, 0, 1]) zs.push(wz + k * (wheelR + 0.07));
  const Z = samples(zs.filter((z) => z >= -L / 2 && z <= L / 2), 0.02);
  const ring = (z: number): V3[] => {
    const e = Math.max(0, Math.abs(z) - (L / 2 - 0.25)) / 0.25;
    const hw = W / 2 - 0.1 * (1 - Math.sqrt(Math.max(0, 1 - e * e)));
    let yb = 0.3;
    for (const wz of [wF, wB]) {
      const dz = Math.abs(z - wz);
      const ra = wheelR + 0.07;
      if (dz < ra) yb = Math.max(yb, wheelR + 0.04 + Math.sqrt(ra * ra - dz * dz));
    }
    const yt = H - 0.04 * e;
    const rc = 0.22;
    // 横の面は、色の帯（腰の緑 0.85〜1.05m、窓 1.25〜2.55m）の境目に点を置く（四角形ごとに塗るため）
    const band = (y: number): number => Math.max(y, yb + 0.01);
    const left: [number, number][] = [
      [-hw, yb],
      [-hw, band(0.85)],
      [-hw, band(1.05)],
      [-hw, band(1.25)],
      [-hw, 2.55],
      ...(detail
        ? ([
            [-hw, yt - rc],
            [-hw + rc * 0.29, yt - rc * 0.29],
          ] as [number, number][])
        : []),
      [-hw + rc, yt],
    ];
    const pts: [number, number][] = [...left, [0, yt + 0.02], ...left.reverse().map(([x, y]) => [-x, y] as [number, number])];
    return pts.map(([x, y]) => [x, y, z] as V3);
  };
  const rings = Z.map(ring);
  const m = rings[0].length - 1;
  s.grid(
    rings,
    false,
    (i) => [0, 1.6, Z[i]],
    (i, j) => {
      const zm = (Z[i] + Z[i + 1]) / 2;
      // 左の面は 0〜4 番、右の面は鏡に映した m-1〜m-5 番の四角形
      const k = j < m / 2 ? j : m - 1 - j;
      const glass = k === 3 && zm < L / 2 - 0.5 && zm > -L / 2 + 0.3;
      if (glass) s.set(GLASS, 0, 0.06, 0.25);
      else if (k === 1) s.set(0x2f6b4f, 0, 0.45, 0.1);
      else s.set(0xffffff, PAINT, 0.4, 0.2);
    },
  );
  s.set(0xffffff, PAINT, 0.4, 0.2);
  s.cap(rings[0], [0, 0, -1]);
  s.set(GLASS, 0, 0.06, 0.25);
  s.cap(rings[rings.length - 1], [0, 0, 1]);
  // 前：窓の下の白い面と行き先の表示（前の窓は ふた に描いた濃い面）
  s.set(0xffffff, PAINT, 0.4, 0.2);
  s.box([-W / 2 + 0.06, 0.3, L / 2 - 0.02], [W / 2 - 0.06, 1.15, L / 2 + 0.01]);
  s.set(0xd8a33a, 0, 0.4, 0, 0.5);
  s.box([-0.8, H - 0.42, L / 2 - 0.03], [0.8, H - 0.18, L / 2 + 0.012]);
  s.set(LIGHT_FRONT, 0, 0.3, 0, 0.15);
  for (const x of [-1, 1]) s.box([x * 0.95 - 0.16, 0.5, L / 2 - 0.02], [x * 0.95 + 0.16, 0.62, L / 2 + 0.02]);
  s.set(LIGHT_REAR, 0, 0.3, 0, 0.25);
  for (const x of [-1, 1]) s.box([x * 1.0 - 0.1, 0.8, -L / 2 - 0.02], [x * 1.0 + 0.1, 1.2, -L / 2 + 0.02]);
  for (const wz of [wF, wB]) {
    s.set(WELL, 0, 0.95);
    s.box([-W / 2 + 0.38, wheelR * 0.6, wz - wheelR - 0.05], [W / 2 - 0.38, wheelR * 2 + 0.1, wz + wheelR + 0.05]);
    for (const side of [-1, 1]) wheel(s, side * (W / 2 - 0.2), wz, wheelR, 0.3, detail ? 10 : 6, side, detail === 1);
  }
  return s.normalizeTo(W, H, L).geometry();
}

/** 小型トラック：前の平らな運転台（車体の色、丸い肩）と、後ろの銀色の荷箱。 */
function truck(detail: 0 | 1): BufferGeometry {
  const L = 6.2;
  const W = 2.0;
  const H = 2.75;
  const s = new LifeSoup();
  const cabL = 1.75;
  const nose = L / 2;
  const cabBack = nose - cabL;
  const wheelR = 0.36;
  const wF = nose - 0.95;
  const wB = -L / 2 + 1.35;
  const zs: number[] = [];
  for (let z = cabBack; z < nose; z += detail ? 0.2 : 0.5) zs.push(z);
  zs.push(nose, nose - 0.06, nose - 0.18, cabBack + 0.05);
  for (const k of detail ? [-1.02, -0.8, -0.45, 0, 0.45, 0.8, 1.02] : [-1, 0, 1]) zs.push(wF + k * (wheelR + 0.06));
  const Z = samples(zs.filter((z) => z >= cabBack && z <= nose), 0.02);
  const cabH = 2.15;
  const ring = (z: number): V3[] => {
    const e = Math.max(0, z - (nose - 0.18)) / 0.18;
    const hw = W / 2 - 0.06 * (1 - Math.sqrt(Math.max(0, 1 - e * e)));
    let yb = 0.45;
    const dz = Math.abs(z - wF);
    const ra = wheelR + 0.06;
    if (dz < ra) yb = Math.max(yb, wheelR + Math.sqrt(ra * ra - dz * dz));
    // 前へ行くほど屋根が少し下がる（運転台の前の窓の傾き）
    const yt = cabH - 0.12 * smooth01((z - (nose - 0.6)) / 0.6);
    const rc = 0.18;
    const left: [number, number][] = [
      [-hw, yb],
      [-hw, (yb + yt) / 2],
      [-hw, yt - rc],
      [-hw + rc * 0.29, yt - rc * 0.29],
      [-hw + rc, yt],
    ];
    const pts: [number, number][] = [...left, [0, yt + 0.015], ...left.reverse().map(([x, y]) => [-x, y] as [number, number])];
    return pts.map(([x, y]) => [x, y, z] as V3);
  };
  const rings = Z.map(ring);
  s.grid(
    rings,
    false,
    (i) => [0, 1.2, Z[i]],
    (i, j) => {
      const zm = (Z[i] + Z[i + 1]) / 2;
      const ym = (rings[i][j][1] + rings[i][j + 1][1]) / 2;
      const sideJ = j <= 1 || j >= 8;
      const glass = sideJ && ym > 1.35 && ym < 2.0 && zm > cabBack + 0.35 && zm < nose - 0.15;
      if (glass) s.set(GLASS, 0, 0.06, 0.25);
      else s.set(0xffffff, PAINT, 0.35, 0.3);
    },
  );
  s.set(0xffffff, PAINT, 0.35, 0.3);
  s.cap(rings[0], [0, 0, -1]);
  // 前の面：下は車体の色、上は大きな窓
  s.cap(rings[rings.length - 1], [0, 0, 1]);
  s.set(GLASS, 0, 0.06, 0.25);
  s.box([-W / 2 + 0.12, 1.3, nose - 0.02], [W / 2 - 0.12, cabH - 0.2, nose + 0.012]);
  s.set(TRIM, 0, 0.5, 0.3);
  s.box([-W / 2 + 0.25, 0.6, nose - 0.02], [W / 2 - 0.25, 0.9, nose + 0.01]);
  s.set(LIGHT_FRONT, 0, 0.3, 0, 0.15);
  for (const x of [-1, 1]) s.box([x * 0.72 - 0.14, 0.55, nose - 0.02], [x * 0.72 + 0.14, 0.68, nose + 0.02]);
  // 荷箱（銀色の箱。角に細い枠）
  const boxFront = cabBack - 0.08;
  s.set(0xb9bcbe, 0, 0.42, 0.45);
  s.box([-W / 2 + 0.02, 0.55, -L / 2], [W / 2 - 0.02, H, boxFront], true);
  s.set(0x8c8f92, 0, 0.45, 0.45);
  s.box([-W / 2, H - 0.08, -L / 2 - 0.01], [W / 2, H + 0.01, boxFront + 0.01]);
  s.box([-W / 2, 0.5, -L / 2 - 0.01], [W / 2, 0.62, boxFront + 0.01]);
  s.set(LIGHT_REAR, 0, 0.3, 0, 0.25);
  for (const x of [-1, 1]) s.box([x * 0.8 - 0.12, 0.62, -L / 2 - 0.03], [x * 0.8 + 0.12, 0.76, -L / 2]);
  for (const wz of [wF, wB]) {
    s.set(WELL, 0, 0.95);
    s.box([-W / 2 + 0.33, wheelR * 0.6, wz - wheelR - 0.05], [W / 2 - 0.33, wheelR * 2 + 0.1, wz + wheelR + 0.05]);
    for (const side of [-1, 1]) wheel(s, side * (W / 2 - 0.18), wz, wheelR, 0.24, detail ? 12 : 8, side, detail === 1);
  }
  return s.normalizeTo(W, H, L).geometry();
}

/** 車の近景の形（添字は CAR_TYPES の shape：0 セダン・1 箱形・2 タクシー・3 バス・4 トラック・5 ハッチバック・6 軽）。 */
export function carShapes(): BufferGeometry[] {
  return [passengerCar(SEDAN, 1, false), passengerCar(MINIVAN, 1, false), passengerCar(TAXI, 1, true), bus(1), truck(1), passengerCar(HATCH, 1, false), passengerCar(KEI, 1, false)];
}

/**
 * 車の中景の形（70〜240m）：同じ輪郭を粗い断面で（ミラー・番号板を省く）。
 * セダン・タクシー・ハッチバックはセダンの、箱形・軽は箱形の形を共有する（同じ物を渡すと lodPool.ts が1つにまとめ、描画命令が減る）
 */
export function carMidShapes(): BufferGeometry[] {
  const sedan = passengerCar(SEDAN, 0, false);
  const box = passengerCar(MINIVAN, 0, false);
  return [sedan, box, sedan, bus(0), truck(0), sedan, box];
}
