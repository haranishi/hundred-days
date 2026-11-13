/**
 * 濁音・半濁音・促音・小さい字（拗音の ゃ・ゅ・ょ と、小さい ぁ・ぃ・ぅ・ぇ・ぉ）の「動き」を、元の文字の形に重ねる（sign-content が持ち主）。
 * 46文字×変化の組み合わせをデータで持たず、元の文字の SignSpec にこの動きを足して作る（design.md「濁音などの変化の扱い」）。
 *
 * 向きと大きさの根拠（調査 r1 と、照合に使った4つの指文字表）:
 *  - 濁音: 元の形のまま、表す人の右（相手から見て左＝場の −X）へ動かす。神奈川県の表「横へ10cmくらい」→ 手のひら1つぶん
 *  - 半濁音: 元の形のまま上（+Y）へ。神奈川県の表「10cmくらい上げます」
 *  - 促音・小さい字: 元の形（つ／や・ゆ・よ／あ・い・う・え・お）のまま、表す人の体の方（相手から遠ざかる＝ −Z）へ引く。距離は資料に無いので、ほかと同じ手のひら1つぶん
 *  - 長音は元の文字を動かす規則ではなく、人差し指で上から下へ書く独立した形（kana.ts の mod-chouon。ここでは合成しない）
 * 単位は手のひらの長さ（約10cm）＝1（hand-model の決まり）。
 */
import type { Keyframe, Position, SignSpec, Vec3 } from '../hand/types';

export type ModifierId = 'mod-dakuon' | 'mod-handakuon' | 'mod-sokuon' | 'mod-youon' | 'mod-chouon';
/** 元の文字に動きを重ねる変化（長音を除く） */
export type MovingModifier = Exclude<ModifierId, 'mod-chouon'>;

/** 表す人の体の方へ引く動き（促音・小さい字と、指文字の「を」） */
export const PULL_BACK: Vec3 = [0, 0, -1];

/** 変化ごとの動き（場の座標。+X＝相手から見て右、+Y＝上、+Z＝相手の方） */
export const MODIFIER_MOVES: Record<MovingModifier, Vec3> = {
  'mod-dakuon': [-1, 0, 0],
  'mod-handakuon': [0, 1, 0],
  'mod-sokuon': PULL_BACK,
  'mod-youon': PULL_BACK,
};

/** 形を見せてから動き出すまでの間と、動いている時間（秒） */
export const MODIFIER_HOLD = 0.25;
export const MODIFIER_MOVE = 0.55;

export function isMovingModifier(id: string): id is MovingModifier {
  return id in MODIFIER_MOVES;
}

/** 位置に場の座標のずれを足す（名前の位置なら offset に足す） */
export function shiftPosition(pos: Position | undefined, d: Vec3): Position {
  if (!pos) return { at: 'neutral', offset: [d[0], d[1], d[2]] };
  if (Array.isArray(pos)) return [pos[0] + d[0], pos[1] + d[1], pos[2] + d[2]];
  const o = pos.offset ?? [0, 0, 0];
  return { at: pos.at, offset: [o[0] + d[0], o[1] + d[1], o[2] + d[2]] };
}

/** 元の文字の動きが終わる時刻（動きのない形なら 0） */
function endTime(spec: SignSpec): number {
  const ts = spec.hands.dominant.keyframes.map((k) => k.t);
  return Math.max(0, ...ts, spec.trace?.tEnd ?? 0, spec.duration ?? 0);
}

/**
 * 元の文字の形のまま、変化の動きを足した SignSpec を返す。元の SignSpec は変えない。
 * 元の文字に動きがある場合は、その動きが終わってから変化の動きを足す
 * （ただし trace のある文字は、跡の終点に手が留まる仕組みのため動きが出ない。濁音などの元になる文字に trace のある文字は無い）。
 */
export function composeModifier(base: SignSpec, modifier: MovingModifier): SignSpec {
  return appendMove(base, MODIFIER_MOVES[modifier]);
}

/** 形を見せてから、手全体を delta だけ動かす（形・向きは変えない） */
export function appendMove(base: SignSpec, delta: Vec3): SignSpec {
  const sorted = [...base.hands.dominant.keyframes].sort((a, b) => a.t - b.t);
  // Keyframe は省略した値を前の Keyframe から引き継ぐので、最後の時点の形・向き・位置を集める
  let shape: Keyframe['shape'];
  let orient: Keyframe['orient'];
  let pos: Keyframe['pos'];
  for (const k of sorted) {
    if (k.shape) shape = k.shape;
    if (k.orient) orient = k.orient;
    if (k.pos) pos = k.pos;
  }
  const from: Position = pos ?? { at: 'neutral' };
  const to = shiftPosition(from, delta);
  const isStatic = sorted.length <= 1 && !base.trace;
  const t0 = isStatic ? 0 : endTime(base);
  const head: Keyframe[] = isStatic ? [{ t: 0, shape, orient, pos: from }] : sorted;
  const keyframes: Keyframe[] = [
    ...head,
    { t: t0 + MODIFIER_HOLD, pos: from },
    { t: t0 + MODIFIER_HOLD + MODIFIER_MOVE, pos: to, ease: 'inOut' },
  ];
  const out: SignSpec = { ...base, hands: { ...base.hands, dominant: { keyframes } } };
  delete out.duration;
  return out;
}
