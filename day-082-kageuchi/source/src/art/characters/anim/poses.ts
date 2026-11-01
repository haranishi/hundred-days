// OWNER: chars-art
// 決まった姿勢（座る・居眠り・倒れ）と、動作（当て身・討ち取り・投げ・突き・倒れる）のキー。
// キーは「t（0→1）ごとの骨の回転（度）・腰の位置・手の行き先・槍の置き場所・刀の抜き具合」で書き、
// 各値を Catmull-Rom で補間する（速さも連続）。角度の向き（rig.ts の決まり）：
//   手足（XZY）：x 負＝前へ振る（股関節・肩の屈曲）、膝 x 正＝曲げる、肘 x 負＝曲げる、z は左で正＝外へ開く（右は負）
//   体幹と頭（YXZ）：x 正＝前へ傾く、y 正＝左を向く、z 正＝右へ傾く
// 腰（hips）の位置は base から見た絶対の値（m）。
import type { ActionKind } from '../../../contract/snapshot';
import { MELEE_KEYS, STAGGER_KEYS, STAGGER_FALL_KEYS, STAGGER_SETTLE_T } from '../config';
import { BONE_COUNT, BONE_NAMES } from '../rig';
import { sampleKeys } from '../util/math';

export type V3 = [number, number, number];
type BoneName = (typeof BONE_NAMES)[number];

/** 手の行き先。種類ごとの重みを持ち、混ぜて使う（例：鞘の柄から抜いて、空中の点へ振る）。 */
export interface HandKey {
  /** 空中の点（base から見た位置）。 */
  point?: V3;
  pointW?: number;
  /** 握りの軸（拳を通る棒の向き。指定なしなら自然な向きのまま）。 */
  axis?: V3;
  /** 槍の柄の、石突からの距離 s（m）を握る。 */
  spear?: number;
  spearW?: number;
  /** 腰の鞘に納まった柄を握る。 */
  hiltW?: number;
  /** 鞘の口を押さえる（左手）。 */
  sayaW?: number;
  /** 抜いた刀の柄を両手で握る（左手が右手の下）。 */
  tsukaW?: number;
  /** 膝に置く。 */
  kneeW?: number;
}

export interface Key {
  t: number;
  b?: Partial<Record<BoneName, V3>>;
  hips?: V3;
  hipsR?: V3;
  R?: HandKey;
  L?: HandKey;
  /** 槍の置き場所（石突の位置・穂先への向き）と、その重み。 */
  spear?: { butt: V3; dir: V3; w: number };
  /** 刀を抜いている度合い 0→1、逆手 0→1、小石を持っている 0/1、足を地面に留める 0→1、光の弧 0→1。 */
  draw?: number;
  rev?: number;
  pebble?: number;
  plant?: number;
  arc?: number;
}

/** 補間の用意をした動作：チャンネル名 → キーの t と値。 */
export interface Track {
  channels: Map<string, { ts: number[]; vs: number[] }>;
  /** 回転を持つ骨（チャンネルが1つでもある骨）。 */
  bones: number[];
  boneIdx: Map<string, number>;
}

const HAND_FIELDS = ['pointW', 'spearW', 'hiltW', 'sayaW', 'tsukaW', 'kneeW'] as const;

function push(ch: Map<string, { ts: number[]; vs: number[] }>, name: string, t: number, v: number): void {
  let c = ch.get(name);
  if (!c) {
    c = { ts: [], vs: [] };
    ch.set(name, c);
  }
  c.ts.push(t);
  c.vs.push(v);
}

export function compile(keys: readonly Key[]): Track {
  const ch = new Map<string, { ts: number[]; vs: number[] }>();
  const bones = new Set<number>();
  for (const k of keys) {
    if (k.b) {
      for (const [name, v] of Object.entries(k.b) as [BoneName, V3][]) {
        const idx = BONE_NAMES.indexOf(name);
        bones.add(idx);
        push(ch, `${name}.x`, k.t, v[0]);
        push(ch, `${name}.y`, k.t, v[1]);
        push(ch, `${name}.z`, k.t, v[2]);
      }
    }
    if (k.hips) k.hips.forEach((v, i) => push(ch, `hips.p${i}`, k.t, v));
    if (k.hipsR) k.hipsR.forEach((v, i) => push(ch, `hips.r${i}`, k.t, v));
    for (const side of ['R', 'L'] as const) {
      const h = k[side];
      if (!h) continue;
      // 指定の無い種類の重みは 0（行き先を切り替えたら、前の行き先の重みが残らないように）
      for (const f of HAND_FIELDS) push(ch, `${side}.${f}`, k.t, h[f] ?? (f === 'pointW' && h.point ? 1 : f === 'spearW' && h.spear !== undefined ? 1 : 0));
      if (h.point) h.point.forEach((v, i) => push(ch, `${side}.p${i}`, k.t, v));
      if (h.axis) h.axis.forEach((v, i) => push(ch, `${side}.a${i}`, k.t, v));
      if (h.spear !== undefined) push(ch, `${side}.s`, k.t, h.spear);
    }
    if (k.spear) {
      k.spear.butt.forEach((v, i) => push(ch, `spear.b${i}`, k.t, v));
      k.spear.dir.forEach((v, i) => push(ch, `spear.d${i}`, k.t, v));
      push(ch, 'spear.w', k.t, k.spear.w);
    }
    for (const f of ['draw', 'rev', 'pebble', 'plant', 'arc'] as const) if (k[f] !== undefined) push(ch, f, k.t, k[f] as number);
  }
  const boneIdx = new Map<string, number>();
  BONE_NAMES.forEach((n, i) => boneIdx.set(n, i));
  return { channels: ch, bones: [...bones].sort((a, b) => a - b), boneIdx };
}

/** チャンネルの値（無ければ fallback）。 */
export function sample(tr: Track, name: string, t: number, fallback: number): number {
  const c = tr.channels.get(name);
  if (!c) return fallback;
  return sampleKeys(c.ts, c.vs, t);
}

export function has(tr: Track, name: string): boolean {
  return tr.channels.has(name);
}

// ---------------------------------------------------------------- 決まった姿勢

/** 信長：床几に座り、手は膝（手は IK で膝へ置く）。 */
export const SIT: Key = {
  t: 0,
  hips: [0, 0.53, -0.05],
  hipsR: [4, 0, 0],
  b: {
    spine: [2, 0, 0],
    chest: [-3, 0, 0],
    neck: [6, 0, 0],
    head: [1, 0, 0],
    thighL: [-88, 8, 9],
    thighR: [-88, -8, -9],
    shinL: [86, 0, 0],
    shinR: [86, 0, 0],
    footL: [2, 0, 0],
    footR: [2, 0, 0],
    shoulderL: [0, 0, -2],
    shoulderR: [0, 0, 2],
    upperArmL: [-26, 0, 10],
    upperArmR: [-26, 0, -10],
    foreArmL: [-40, 0, 0],
    foreArmR: [-40, 0, 0],
  },
  R: { kneeW: 1 },
  L: { kneeW: 1 },
  plant: 0,
};

/** 居眠り：地べたに座り、膝を立てて槍を抱える（頭のこくりは動きの側で足す）。 */
export const DOZE: Key = {
  t: 0,
  hips: [0, 0.165, -0.14],
  hipsR: [-10, 0, 0],
  b: {
    spine: [24, 0, 0],
    chest: [16, 0, 0],
    neck: [16, 0, 0],
    head: [12, 0, 0],
    thighL: [-102, 14, 13],
    thighR: [-102, -14, -13],
    shinL: [128, 0, 0],
    shinR: [128, 0, 0],
    footL: [-18, 0, 0],
    footR: [-18, 0, 0],
    upperArmL: [-38, 0, 14],
    upperArmR: [-40, 0, -14],
    foreArmL: [-70, 0, 0],
    foreArmR: [-70, 0, 0],
  },
  spear: { butt: [-0.02, 0.0, 0.34], dir: [-0.12, 1, -0.3], w: 1 },
  R: { spear: 0.66, spearW: 1, axis: [-0.12, 1, -0.3] },
  L: { spear: 0.56, spearW: 1, axis: [-0.12, 1, -0.3] },
  plant: 0,
};

/** 倒れ：右を下にして横向きに倒れたまま（気絶）。頭は体の右（-X）の向き。 */
export const DOWN: Key = {
  t: 0,
  hips: [0.05, 0.14, -0.02],
  hipsR: [0, 0, 86],
  b: {
    spine: [14, 0, -4],
    chest: [10, 0, -3],
    neck: [6, 0, 14],
    head: [8, 0, 12],
    thighL: [-58, 6, -6],
    thighR: [-38, -4, 4],
    shinL: [78, 0, 0],
    shinR: [64, 0, 0],
    footL: [24, 0, 0],
    footR: [20, 0, 0],
    shoulderR: [0, 0, 8],
    upperArmR: [-86, 0, -8],
    foreArmR: [-28, 0, 0],
    handR: [10, 0, 0],
    upperArmL: [-44, 0, -2],
    foreArmL: [-50, 0, 0],
    handL: [20, 0, 0],
  },
  spear: { butt: [0.55, 0.016, -0.55], dir: [-0.55, 0, 1], w: 1 },
  R: { pointW: 0 },
  L: { pointW: 0 },
  plant: 0,
};

/** 突かれて倒れたプレイヤー（左を下にした横向き）。 */
export const FALLEN: Key = {
  t: 0,
  hips: [-0.05, 0.14, -0.05],
  hipsR: [0, 0, -86],
  b: {
    spine: [16, 0, 4],
    chest: [10, 0, 3],
    neck: [8, 0, -14],
    head: [10, 0, -12],
    thighL: [-36, 4, -4],
    thighR: [-60, -6, 6],
    shinL: [60, 0, 0],
    shinR: [82, 0, 0],
    footL: [20, 0, 0],
    footR: [24, 0, 0],
    upperArmL: [-84, 0, 8],
    foreArmL: [-24, 0, 0],
    upperArmR: [-40, 0, 2],
    foreArmR: [-56, 0, 0],
  },
  plant: 0,
};

/**
 * 討たれた信長：床几から前のめりに崩れ、床几の前で右を下にして横たわったまま（assassinateVictim の t=1 と同じ）。
 * r01-chars-周1: 指摘「最後の姿が、脚を床几に乗せた橋のような形」 うつ伏せに伸びた姿 → 膝をついて前へ崩れ伏す姿
 * r02-fix-visual: 指摘「討たれた後にお辞儀の形で止まる」 膝をついて上体を折った姿 → 床几の前（+Z 0.5m）で横向きに横たわる姿。
 *   体の軸は左右（頭は右の -X）。腰を前へ回して頭を前へ向けると、腰に付いた裾が後ろの床几の上に乗る（周1の橋の再発）ので、
 *   横に倒す。胸は少し地面へ向け（前のめり）、膝は前へ曲げる
 */
export const NOBU_DOWN: Key = {
  t: 0,
  hips: [-0.06, 0.17, 0.5],
  hipsR: [18, 0, 86],
  b: {
    spine: [12, 0, -4],
    chest: [8, 0, -3],
    neck: [6, 0, 14],
    head: [8, 0, 12],
    thighL: [-58, 6, -6],
    thighR: [-40, -4, 4],
    shinL: [80, 0, 0],
    shinR: [66, 0, 0],
    footL: [22, 0, 0],
    footR: [20, 0, 0],
    shoulderR: [0, 0, 8],
    upperArmR: [-92, 0, -8],
    foreArmR: [-24, 0, 0],
    upperArmL: [-46, 0, -2],
    foreArmL: [-46, 0, 0],
  },
  R: { pointW: 0 },
  L: { pointW: 0 },
  plant: 0,
};

// ---------------------------------------------------------------- 動作

/** キーの一部を書き換えた複製（倒れの終わりを、決まった姿勢とぴったり同じにするため）。 */
function at(t: number, k: Key, more: Partial<Key> = {}): Key {
  return { ...k, ...more, t };
}

/** 立った足軽の、平常の構え（当て身を受ける直前）。 */
const VICTIM_STAND: Key = {
  t: 0,
  hips: [0, 0.922, 0],
  hipsR: [0, 0, 0],
  b: {
    spine: [2, 0, 0],
    chest: [0, 0, 0],
    neck: [0, 0, 0],
    head: [2, 0, 0],
    thighL: [0, 4, 3],
    thighR: [0, -4, -3],
    shinL: [3, 0, 0],
    shinR: [3, 0, 0],
    footL: [-3, 0, 0],
    footR: [-3, 0, 0],
    upperArmL: [2, 0, 9],
    upperArmR: [-14, 0, -12],
    foreArmL: [-12, 0, 0],
    foreArmR: [-60, 0, 0],
  },
  spear: { butt: [-0.25, 0.006, 0.14], dir: [0.02, 1, 0.1], w: 1 },
  R: { spear: 1.04, spearW: 1, axis: [0.02, 1, 0.1] },
  L: { pointW: 0 },
  plant: 1,
};

const KEYS: Record<ActionKind, Key[]> = {
  melee: MELEE_KEYS,
  stagger: STAGGER_KEYS.map((k) => ({ ...STAGGER_KEYS[0], ...k, b: { ...STAGGER_KEYS[0].b, ...k.b } })),
  // 当て身を受ける番兵：首を押さえられてのけぞり、柄頭を受けて頭が前へ落ち、膝から崩れて右へ倒れる
  takedownVictim: [
    VICTIM_STAND,
    at(0.16, VICTIM_STAND, {
      b: { ...VICTIM_STAND.b, chest: [-6, 0, 0], neck: [-16, 0, 0], head: [-12, 0, 0], upperArmL: [-30, 0, 18], foreArmL: [-50, 0, 0] },
      hips: [0, 0.93, -0.02],
    }),
    at(0.44, VICTIM_STAND, {
      b: { ...VICTIM_STAND.b, chest: [-8, 0, 0], neck: [-18, 0, 0], head: [-10, 0, 0], upperArmL: [-42, 0, 22], foreArmL: [-64, 0, 0] },
      hips: [0, 0.93, -0.03],
    }),
    at(0.53, VICTIM_STAND, {
      b: { ...VICTIM_STAND.b, spine: [10, 0, 0], chest: [10, 0, 0], neck: [18, 0, 0], head: [26, 0, 0], upperArmL: [-8, 0, 10], foreArmL: [-20, 0, 0] },
      hips: [0, 0.9, 0.0],
      R: { spear: 1.04, spearW: 1, axis: [0.02, 1, 0.1] },
    }),
    {
      t: 0.66,
      hips: [0, 0.66, 0.02],
      hipsR: [6, 0, 2],
      b: {
        spine: [18, 0, 0],
        chest: [14, 0, 2],
        neck: [20, 0, 0],
        head: [30, 0, 4],
        thighL: [-42, 6, 6],
        thighR: [-40, -6, -6],
        shinL: [84, 0, 0],
        shinR: [84, 0, 0],
        footL: [-30, 0, 0],
        footR: [-30, 0, 0],
        upperArmL: [8, 0, 8],
        upperArmR: [8, 0, -8],
        foreArmL: [-14, 0, 0],
        foreArmR: [-16, 0, 0],
      },
      // r02-fix-visual: 指摘「槍が1コマで斜めに跳ねる」 手を離れた槍が 0.12 秒で倒れきっていた → 0.66〜1 でゆっくり倒す
      spear: { butt: [-0.27, 0.006, 0.14], dir: [-0.25, 1, 0.3], w: 1 },
      R: { pointW: 0 },
      plant: 0.35,
    },
    {
      t: 0.78,
      hips: [0, 0.5, -0.08],
      hipsR: [10, 0, 4],
      b: {
        spine: [22, 0, 2],
        chest: [16, 0, 4],
        neck: [22, 0, 4],
        head: [26, 0, 8],
        thighL: [-12, 6, 6],
        thighR: [-12, -6, -6],
        shinL: [104, 0, 0],
        shinR: [104, 0, 0],
        footL: [40, 0, 0],
        footR: [40, 0, 0],
        upperArmL: [12, 0, 6],
        upperArmR: [12, 0, -6],
        foreArmL: [-10, 0, 0],
        foreArmR: [-10, 0, 0],
      },
      spear: { butt: [-0.24, 0.012, 0.1], dir: [-0.5, 0.78, 0.55], w: 1 },
      plant: 0,
    },
    {
      t: 0.9,
      hips: [-0.06, 0.3, -0.06],
      hipsR: [8, 0, 46],
      b: {
        spine: [20, 0, 0],
        chest: [14, 0, 0],
        neck: [14, 0, 8],
        head: [16, 0, 10],
        thighL: [-34, 6, -2],
        thighR: [-28, -4, 2],
        shinL: [92, 0, 0],
        shinR: [84, 0, 0],
        footL: [30, 0, 0],
        footR: [26, 0, 0],
        shoulderR: [0, 0, 4],
        upperArmR: [-50, 0, -10],
        foreArmR: [-20, 0, 0],
        handR: [6, 0, 0],
        upperArmL: [-20, 0, 2],
        foreArmL: [-30, 0, 0],
        handL: [10, 0, 0],
      },
      spear: { butt: [0.22, 0.016, -0.22], dir: [-0.55, 0.32, 0.92], w: 1 },
      plant: 0,
    },
    at(1, DOWN),
  ],

  // 当て身（光秀）：背後から左手で首と肩を押さえ、右の手刀で首の後ろを短く打ち、崩れる体を支えて下ろす（刃は抜かない）
  // r02-fix-visual: 指摘「当て身で刀を頭上へ振りかぶるので、斬ったように見える」
  //   旧：脇差を逆手に抜き（draw 1）、手を頭の上 1.6m へ振りかぶってから打つ　新：抜かずに、耳の横 1.48m から首へ打つ手刀
  takedown: [
    {
      t: 0,
      hips: [0, 0.8, 0],
      hipsR: [10, 0, 0],
      b: { spine: [10, 0, 0], chest: [6, 0, 0], neck: [-4, 0, 0], head: [-6, 0, 0], upperArmL: [-20, 0, 12], upperArmR: [-14, 0, -12], foreArmL: [-40, 0, 0], foreArmR: [-40, 0, 0] },
      R: { pointW: 0 },
      L: { pointW: 0 },
      draw: 0,
      rev: 0,
      plant: 1,
    },
    {
      t: 0.16,
      hips: [0, 0.86, 0.1],
      hipsR: [12, 0, 0],
      b: { spine: [10, 0, 0], chest: [4, 0, 0], neck: [-6, 0, 0], head: [-8, 0, 0] },
      L: { point: [0.04, 1.37, 0.6], axis: [1, 0.1, 0.2] },
      R: { point: [-0.2, 1.2, 0.14], axis: [0.25, 0.85, 0.45] },
    },
    {
      t: 0.32,
      hips: [0, 0.87, 0.08],
      b: { spine: [8, -10, 0], chest: [2, -10, 0] },
      L: { point: [0.02, 1.35, 0.56], axis: [1, 0.1, 0.2] },
      R: { point: [-0.26, 1.48, 0.17], axis: [0.2, 0.55, 0.8] },
    },
    {
      t: 0.44,
      hips: [0, 0.86, 0.12],
      b: { spine: [14, 6, 0], chest: [10, 6, 0] },
      L: { point: [0.02, 1.34, 0.56], axis: [1, 0.1, 0.2] },
      R: { point: [-0.04, 1.4, 0.52], axis: [0.9, -0.15, 0.4] },
    },
    {
      t: 0.52,
      hips: [0, 0.85, 0.12],
      b: { spine: [15, 7, 0], chest: [11, 6, 0] },
      L: { point: [0.02, 1.32, 0.57], axis: [1, 0.1, 0.2] },
      R: { point: [0.04, 1.33, 0.55], axis: [0.9, -0.25, 0.35] },
    },
    {
      t: 0.64,
      hips: [0, 0.8, 0.12],
      b: { spine: [18, 2, 0], chest: [12, 0, 0] },
      L: { point: [0.02, 1.18, 0.6], axis: [1, 0.1, 0.2] },
      R: { point: [-0.08, 1.12, 0.48], axis: [0.1, -0.2, 1] },
    },
    {
      t: 0.8,
      hips: [0, 0.66, 0.08],
      hipsR: [16, 0, 0],
      b: { spine: [26, 0, 0], chest: [16, 0, 0], neck: [-6, 0, 0] },
      L: { point: [0.0, 0.84, 0.62], axis: [1, 0.1, 0.2] },
      R: { point: [-0.14, 0.9, 0.34], axis: [0.1, -0.2, 1] },
    },
    {
      t: 1,
      hips: [0, 0.62, 0.0],
      hipsR: [12, 0, 0],
      b: { spine: [18, 0, 0], chest: [10, 0, 0], neck: [-10, 0, 0], head: [-10, 0, 0], upperArmL: [-24, 0, 14], upperArmR: [-24, 0, -14], foreArmL: [-44, 0, 0], foreArmR: [-44, 0, 0] },
      R: { pointW: 0 },
      L: { pointW: 0 },
      draw: 0,
    },
  ],

  // 討ち取り（光秀）：鞘に手をかけ、抜き打ちに横へ一閃（刃の軌跡に細い光の弧）、残心のあと静かに納める
  assassinate: [
    {
      t: 0,
      hips: [0, 0.72, 0],
      hipsR: [14, 0, 0],
      b: { spine: [14, 0, 0], chest: [6, 0, 0], neck: [-6, 0, 0], head: [-6, 0, 0], upperArmL: [-20, 0, 12], upperArmR: [-16, 0, -12], foreArmL: [-40, 0, 0], foreArmR: [-40, 0, 0] },
      R: { pointW: 0 },
      L: { pointW: 0 },
      draw: 0,
      rev: 0,
      plant: 1,
      arc: 0,
    },
    {
      t: 0.14,
      hips: [0, 0.8, 0.0],
      hipsR: [10, 22, 0],
      b: { spine: [10, 14, 0], chest: [4, 10, 0], neck: [-4, -14, 0], head: [-4, -14, 0] },
      R: { hiltW: 1 },
      L: { sayaW: 1 },
      draw: 0,
    },
    {
      t: 0.24,
      hips: [0, 0.82, 0.04],
      hipsR: [8, 24, 0],
      b: { spine: [8, 14, 0], chest: [2, 10, 0], neck: [-4, -16, 0], head: [-4, -16, 0] },
      R: { point: [0.16, 1.02, 0.3], axis: [0.75, 0.05, 0.66] },
      L: { sayaW: 1 },
      draw: 1,
      arc: 0,
    },
    {
      t: 0.3,
      hips: [0, 0.84, 0.1],
      hipsR: [10, 0, 0],
      b: { spine: [10, -4, 0], chest: [4, -6, 0], neck: [-4, 6, 0], head: [-4, 6, 0] },
      R: { point: [0.0, 1.08, 0.62], axis: [-0.15, 0.02, 1] },
      L: { sayaW: 1 },
      arc: 1,
    },
    {
      t: 0.38,
      hips: [0, 0.83, 0.08],
      hipsR: [10, -30, 0],
      b: { spine: [10, -22, 0], chest: [4, -16, 0], neck: [-4, 24, 0], head: [-4, 20, 0] },
      R: { point: [-0.5, 1.08, 0.36], axis: [-0.95, -0.05, -0.2] },
      L: { point: [0.22, 0.98, 0.12], axis: [0, 1, 0.4] },
      arc: 1,
    },
    {
      t: 0.5,
      hips: [0, 0.8, 0.06],
      hipsR: [12, -34, 0],
      b: { spine: [12, -24, 0], chest: [6, -18, 0], neck: [-2, 26, 0], head: [-2, 22, 0] },
      R: { point: [-0.56, 1.02, 0.18], axis: [-0.9, -0.25, -0.35] },
      L: { point: [0.22, 0.98, 0.1], axis: [0, 1, 0.4] },
      arc: 0,
    },
    {
      t: 0.7,
      hips: [0, 0.8, 0.04],
      hipsR: [12, -20, 0],
      b: { spine: [12, -14, 0], chest: [6, -10, 0], neck: [-4, 16, 0], head: [-2, 14, 0] },
      R: { point: [-0.36, 1.0, 0.34], axis: [-0.5, 0.1, 0.86] },
      L: { sayaW: 1 },
    },
    {
      t: 0.84,
      hips: [0, 0.78, 0.0],
      hipsR: [12, 6, 0],
      b: { spine: [12, 4, 0], chest: [6, 2, 0], neck: [-6, 0, 0], head: [-6, 0, 0] },
      R: { hiltW: 1 },
      L: { sayaW: 1 },
      draw: 1,
    },
    {
      t: 0.95,
      R: { hiltW: 1 },
      L: { sayaW: 1 },
      draw: 0,
    },
    {
      t: 1,
      hips: [0, 0.74, 0],
      hipsR: [14, 0, 0],
      b: { spine: [14, 0, 0], chest: [6, 0, 0], neck: [-6, 0, 0], head: [-6, 0, 0] },
      R: { pointW: 0 },
      L: { pointW: 0 },
      draw: 0,
    },
  ],

  // 討たれる信長：はっと顔を上げ、ゆっくり前へ崩れ、床几から膝をつき、前へ倒れ伏す（血は描かない）
  assassinateVictim: [
    at(0, SIT),
    at(0.16, SIT, {
      b: { ...SIT.b, chest: [-8, 0, 0], neck: [-6, 0, 0], head: [-14, 0, 0] },
      R: { kneeW: 0.6 },
      L: { kneeW: 0.6 },
    }),
    at(0.4, SIT, {
      hips: [0, 0.53, -0.03],
      b: { ...SIT.b, spine: [16, 0, 0], chest: [14, 0, 0], neck: [16, 0, 0], head: [22, 0, 0], upperArmL: [-10, 0, 8], upperArmR: [-10, 0, -8], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0] },
      R: { kneeW: 0 },
      L: { kneeW: 0 },
    }),
    {
      t: 0.62,
      hips: [0, 0.46, 0.2],
      hipsR: [26, 0, 0],
      b: {
        spine: [22, 0, 0],
        chest: [18, 0, 0],
        neck: [18, 0, 0],
        head: [22, 0, 0],
        thighL: [-34, 6, 8],
        thighR: [-34, -6, -8],
        shinL: [96, 0, 0],
        shinR: [96, 0, 0],
        footL: [34, 0, 0],
        footR: [34, 0, 0],
        upperArmL: [-14, 0, 10],
        upperArmR: [-20, 0, -10],
        foreArmL: [-16, 0, 0],
        foreArmR: [-16, 0, 0],
      },
      R: { pointW: 0 },
      L: { pointW: 0 },
      plant: 0,
    },
    // 膝をついたまま前へ傾き、右へ倒れ始める（r02-fix-visual：お辞儀で止めず、横たわるまで崩す）
    {
      t: 0.8,
      hips: [-0.03, 0.3, 0.44],
      hipsR: [30, 0, 46],
      b: {
        spine: [16, 0, -2],
        chest: [12, 0, -2],
        neck: [10, 0, 6],
        head: [10, 0, 6],
        thighL: [-48, 6, -2],
        thighR: [-40, -4, 0],
        shinL: [88, 0, 0],
        shinR: [80, 0, 0],
        footL: [30, 0, 0],
        footR: [26, 0, 0],
        shoulderR: [0, 0, 4],
        upperArmR: [-70, 0, -8],
        foreArmR: [-24, 0, 0],
        upperArmL: [-30, 0, 4],
        foreArmL: [-34, 0, 0],
      },
    },
    at(1, NOBU_DOWN),
  ],

  // 小石を投げる（光秀）：腕を後ろへ引き、下手から前へ放る（離すのは t=0.5）。上半身だけ（足は今の構えのまま）
  throw: [
    {
      t: 0,
      b: { spine: [10, 0, 0], chest: [4, 0, 0], neck: [-4, 0, 0], head: [-4, 0, 0], upperArmR: [-10, 0, -12], foreArmR: [-30, 0, 0], upperArmL: [-10, 0, 12], foreArmL: [-30, 0, 0] },
      pebble: 1,
    },
    {
      t: 0.32,
      b: { spine: [18, 14, 0], chest: [8, 10, 0], neck: [-8, -16, 0], head: [-8, -12, 0], upperArmR: [48, 0, -16], foreArmR: [-14, 0, 0], upperArmL: [-46, 0, 16], foreArmL: [-30, 0, 0] },
      pebble: 1,
    },
    {
      t: 0.5,
      b: { spine: [12, -8, 0], chest: [6, -6, 0], neck: [-6, 8, 0], head: [-6, 8, 0], upperArmR: [-58, 0, -8], foreArmR: [-20, 0, 0], upperArmL: [-14, 0, 20], foreArmL: [-34, 0, 0] },
      pebble: 1,
    },
    { t: 0.52, pebble: 0 },
    {
      t: 0.7,
      b: { spine: [8, -12, 0], chest: [4, -8, 0], neck: [-4, 10, 0], head: [-4, 10, 0], upperArmR: [-84, 0, -6], foreArmR: [-16, 0, 0], upperArmL: [-6, 0, 18], foreArmL: [-30, 0, 0] },
    },
    {
      t: 1,
      b: { spine: [10, 0, 0], chest: [4, 0, 0], neck: [-4, 0, 0], head: [-4, 0, 0], upperArmR: [-14, 0, -12], foreArmR: [-34, 0, 0], upperArmL: [-12, 0, 12], foreArmL: [-32, 0, 0] },
      pebble: 0,
    },
  ],

  // 槍で突く（番兵）：引いてから、腰を入れて前へ突き出す
  strike: [
    {
      t: 0,
      hips: [0, 0.81, 0.0],
      hipsR: [8, 18, 0],
      b: { spine: [8, -8, 0], chest: [2, -8, 0], neck: [-2, -4, 0], head: [-4, -4, 0] },
      spear: { butt: [-0.32, 0.86, -0.62], dir: [0.12, 0.08, 1], w: 1 },
      R: { spear: 0.66, axis: [0.12, 0.08, 1] },
      L: { spear: 1.28, axis: [0.12, 0.08, 1] },
      plant: 1,
    },
    {
      t: 0.3,
      hips: [0, 0.8, -0.1],
      hipsR: [6, 26, 0],
      b: { spine: [4, -12, 0], chest: [0, -10, 0], neck: [0, -6, 0], head: [-2, -6, 0] },
      spear: { butt: [-0.36, 0.86, -0.92], dir: [0.12, 0.1, 1], w: 1 },
    },
    {
      t: 0.44,
      hips: [0, 0.78, 0.26],
      hipsR: [16, 8, 0],
      b: { spine: [14, -4, 0], chest: [8, -4, 0], neck: [-6, -2, 0], head: [-8, -2, 0] },
      spear: { butt: [-0.2, 0.96, -0.12], dir: [0.06, 0.02, 1], w: 1 },
    },
    {
      t: 0.62,
      hips: [0, 0.78, 0.24],
      spear: { butt: [-0.2, 0.95, -0.14], dir: [0.06, 0.02, 1], w: 1 },
    },
    {
      t: 1,
      hips: [0, 0.81, 0.02],
      hipsR: [8, 18, 0],
      b: { spine: [8, -8, 0], chest: [2, -8, 0], neck: [-2, -4, 0], head: [-4, -4, 0] },
      spear: { butt: [-0.32, 0.86, -0.62], dir: [0.12, 0.08, 1], w: 1 },
    },
  ],

  // 突かれて倒れるプレイヤー：のけぞり、膝が抜け、左へ倒れる
  struck: [
    {
      t: 0,
      hips: [0, 0.84, 0],
      hipsR: [6, 0, 0],
      b: { spine: [8, 0, 0], chest: [4, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], thighL: [-10, 4, 4], thighR: [-6, -4, -4], shinL: [20, 0, 0], shinR: [16, 0, 0], footL: [-10, 0, 0], footR: [-10, 0, 0], upperArmL: [-10, 0, 10], upperArmR: [-10, 0, -10], foreArmL: [-30, 0, 0], foreArmR: [-30, 0, 0] },
      plant: 1,
    },
    {
      t: 0.14,
      hips: [0, 0.88, -0.06],
      hipsR: [-8, 0, 0],
      b: { spine: [-14, 0, 0], chest: [-10, 0, 0], neck: [-14, 0, 0], head: [-20, 0, 0], upperArmL: [-40, 0, 30], upperArmR: [-46, 0, -30], foreArmL: [-50, 0, 0], foreArmR: [-50, 0, 0] },
      plant: 1,
    },
    {
      t: 0.36,
      hips: [0, 0.6, -0.1],
      hipsR: [10, 0, -6],
      b: { spine: [16, 0, 0], chest: [12, 0, 0], neck: [16, 0, 0], head: [20, 0, 0], thighL: [-30, 4, 4], thighR: [-36, -4, -4], shinL: [80, 0, 0], shinR: [86, 0, 0], footL: [-30, 0, 0], footR: [-30, 0, 0], upperArmL: [6, 0, 10], upperArmR: [6, 0, -10], foreArmL: [-14, 0, 0], foreArmR: [-14, 0, 0] },
      plant: 0.2,
    },
    {
      t: 0.62,
      hips: [0.04, 0.32, -0.08],
      hipsR: [6, 0, -46],
      b: { spine: [16, 0, 4], chest: [10, 0, 2], neck: [10, 0, -8], head: [12, 0, -10], thighL: [-30, 4, -4], thighR: [-48, -6, 6], shinL: [70, 0, 0], shinR: [86, 0, 0], footL: [20, 0, 0], footR: [24, 0, 0], upperArmL: [-50, 0, 10], foreArmL: [-20, 0, 0], upperArmR: [-20, 0, 0], foreArmR: [-40, 0, 0] },
      plant: 0,
    },
    at(1, FALLEN),
  ],
};

/**
 * 刀を持つ番兵（侍・蘭丸）の strike：中段から振りかぶり、斜めに斬り下ろす。両手は抜いた刀の柄（右手は点、左手は柄の下）。
 * r02-chars-周2: 指摘「刀の番兵が strike を受けると、槍の動作のキーしか無く腕が垂れたままになる」 槍の突きだけ → 刀の斬り下ろしを足す
 */
const STRIKE_KATANA_KEYS: Key[] = [
  {
    t: 0,
    hips: [0, 0.82, 0.0],
    hipsR: [8, 16, 0],
    b: { spine: [8, -6, 0], chest: [2, -6, 0], neck: [-2, -2, 0], head: [-4, -2, 0] },
    R: { point: [-0.04, 1.02, 0.34], axis: [0.04, 0.45, 0.89] },
    L: { tsukaW: 1 },
    draw: 1,
    plant: 1,
  },
  {
    t: 0.3,
    hips: [0, 0.84, -0.06],
    hipsR: [2, 18, 0],
    b: { spine: [-4, -8, 0], chest: [-6, -6, 0], neck: [0, -2, 0], head: [-2, -2, 0] },
    R: { point: [-0.03, 1.62, 0.04], axis: [0.06, 0.6, -0.8] },
    L: { tsukaW: 1 },
    draw: 1,
  },
  {
    t: 0.46,
    hips: [0, 0.78, 0.22],
    hipsR: [16, -6, 0],
    b: { spine: [16, 6, 0], chest: [10, 4, 0], neck: [-6, -2, 0], head: [-8, -2, 0] },
    R: { point: [0.16, 0.96, 0.48], axis: [0.35, -0.45, 0.82] },
    L: { tsukaW: 1 },
  },
  { t: 0.64, hips: [0, 0.78, 0.2], R: { point: [0.16, 0.95, 0.46], axis: [0.35, -0.45, 0.82] }, L: { tsukaW: 1 } },
  {
    t: 1,
    hips: [0, 0.82, 0.02],
    hipsR: [8, 16, 0],
    b: { spine: [8, -6, 0], chest: [2, -6, 0], neck: [-2, -2, 0], head: [-4, -2, 0] },
    R: { point: [-0.04, 1.02, 0.34], axis: [0.04, 0.45, 0.89] },
    L: { tsukaW: 1 },
    draw: 1,
  },
];
export const STRIKE_KATANA = compile(STRIKE_KATANA_KEYS);

// r07-chars: downはmainが2撃目に立てる。同じ怯み初動から崩し、終端を既存DOWNと一致させる。
// 最初からDOWNの脚角度が混ざらないよう、全身のチャンネルに立位の開始キーを持たせる。
export const STAGGER_DOWN_TRACK = compile([
  ...STAGGER_KEYS.slice(0, 3), ...STAGGER_FALL_KEYS,
  { ...DOWN, t: STAGGER_SETTLE_T }, { ...DOWN, t: 1 },
].map((k) => ({ ...STAGGER_KEYS[0], ...k, b: { ...STAGGER_KEYS[0].b, ...k.b } })));

export const TRACKS: Record<ActionKind, Track> = Object.fromEntries(Object.entries(KEYS).map(([k, keys]) => [k, compile(keys)])) as Record<ActionKind, Track>;
export const SIT_TRACK = compile([SIT]);
export const DOZE_TRACK = compile([DOZE]);
export const DOWN_TRACK = compile([DOWN]);
export const FALLEN_TRACK = compile([FALLEN]);
export const NOBU_DOWN_TRACK = compile([NOBU_DOWN]);

/** 動作ごとの、上半身だけに効かせるか（足は今の構えと IK のまま）。 */
export const UPPER_ONLY: Record<ActionKind, boolean> = {
  // r07統合: 踏み込みの腰・脚は足運びへ残し、肘打ちを上半身だけ重ねる。
  melee: true,
  stagger: false,
  takedown: false,
  takedownVictim: false,
  assassinate: false,
  assassinateVictim: false,
  throw: true,
  strike: false,
  struck: false,
};

/** 上半身だけの層で使う、骨ごとの重み（脚と腰は0）。 */
export function upperMask(): Float32Array {
  const m = new Float32Array(BONE_COUNT).fill(1);
  for (const n of ['base', 'hips', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'stool', 'lantern', 'spear', 'sheath', 'hilt', 'hat']) m[BONE_NAMES.indexOf(n)] = 0;
  return m;
}
