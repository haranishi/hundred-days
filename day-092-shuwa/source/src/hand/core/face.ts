/**
 * 顔（表情とうなずき）の時刻ごとの状態（three.js に依存しない。上半身の描画 render/body-rig.ts が使う）。
 * うなずきは頭を前へ1回傾けて戻す動き（一礼）。表情は口と眉の形。
 */
import type { FaceExpression, SignSpec } from '../types';

/** 口と眉の形（うなずきは頭の傾きで別に持つ） */
export type FaceShape = Exclude<FaceExpression, 'nod'>;

export interface FaceState {
  shape: FaceShape;
  /** 頭を前へ傾ける量（0〜1。うなずきの途中で 1 になる） */
  nod: number;
}

/** うなずき1回の長さ（秒） */
export const NOD_SECONDS = 0.7;

const shapeOf = (f: FaceExpression | undefined): FaceShape => (f === undefined || f === 'nod' ? 'neutral' : f);
const nodAmount = (since: number) => (since < 0 || since > NOD_SECONDS ? 0 : Math.sin((Math.PI * since) / NOD_SECONDS));

/**
 * 時刻 t（秒）の顔。faceTimeline が無ければ face のまま（'nod' は再生の始めに1回うなずく。今までの動き）。
 * faceTimeline があれば、t までの最後の項目の表情（最初の項目より前は face。'nod' ならふつうの顔）で、
 * うなずきは t までの最後の 'nod' の項目の時刻から始まる。
 */
export function faceAt(spec: Pick<SignSpec, 'face' | 'faceTimeline'>, t: number): FaceState {
  const timeline = spec.faceTimeline;
  if (!timeline || timeline.length === 0) {
    return { shape: shapeOf(spec.face), nod: spec.face === 'nod' ? nodAmount(t) : 0 };
  }
  let shape = shapeOf(spec.face);
  let nodStart: number | null = null;
  // 同じ時刻の項目は書いた順（安定な並べ替え）
  for (const e of [...timeline].sort((a, b) => a.t - b.t)) {
    if (e.t > t) break;
    if (e.face === 'nod') nodStart = e.t;
    else shape = e.face;
  }
  return { shape, nod: nodStart === null ? 0 : nodAmount(t - nodStart) };
}
