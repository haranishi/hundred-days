/**
 * 体の寸法と、体の位置の名前→場の座標。表す人は x=0 に立ち、+Z（見る人の方）を向く。表す人の右＝−X。
 * 単位は手のひらの長さ（約10cm）。データは右利き（利き手=右手）で書き、左利きの表示は場全体を X で反転する。
 *
 * 位置の決まり: `pos` が指すのは「手のひらの中心」（手首から中指の付け根へ 0.52）の位置。
 * 名前の位置は、その部位の表面から外向きに 0.9（手のひら1つ弱）離れた点。触れる形はデータ側で offset で寄せる。
 */
import type { BodyLocation, Position, Vec3 } from '../types';
import { add, clamp, dot, madd, normalize, scale, sub } from './math';

export const BODY = {
  headCenter: [0, 3.1, 0.15] as Vec3,
  headRadius: [0.8, 1.05, 0.9] as Vec3,
  neckTop: [0, 2.2, 0] as Vec3,
  neckBottom: [0, 1.45, 0] as Vec3,
  /** 肩の関節（右肩＝−X） */
  shoulderR: [-1.75, 1.2, 0] as Vec3,
  shoulderL: [1.75, 1.2, 0] as Vec3,
  upperArm: 2.8,
  forearm: 2.55,
  torsoTop: 1.45,
  torsoBottom: -2.6,
};

interface Spot {
  /** 表面の点（右側にある部位は右側の点） */
  at: Vec3;
  /** 外向き */
  out: Vec3;
  /** 左右のある部位か（利き手でない手は左右を反対にとる） */
  lateral: boolean;
}

const SPOTS: Record<Exclude<BodyLocation, 'neutral'>, Spot> = {
  forehead: { at: [0, 3.75, 0.92], out: [0, 0.15, 1], lateral: false },
  temple: { at: [-0.8, 3.4, 0.4], out: [-1, 0, 0.35], lateral: true },
  eye: { at: [-0.32, 3.25, 0.98], out: [0, 0, 1], lateral: true },
  nose: { at: [0, 2.95, 1.12], out: [0, 0, 1], lateral: false },
  mouth: { at: [0, 2.6, 1.0], out: [0, 0, 1], lateral: false },
  chin: { at: [0, 2.22, 0.82], out: [0, -0.3, 1], lateral: false },
  cheek: { at: [-0.62, 2.85, 0.72], out: [-0.6, 0, 0.8], lateral: true },
  chest: { at: [0, 0.3, 1.0], out: [0, 0, 1], lateral: false },
  belly: { at: [0, -1.3, 1.05], out: [0, 0, 1], lateral: false },
  shoulder: { at: [-1.75, 1.5, 0.35], out: [-0.25, 0.15, 1], lateral: true },
};

/** 利き手側の胸の前（指文字を表す基準の位置。肩の高さ・体の前 約26cm） */
export const NEUTRAL_ANCHOR: Vec3 = [-1.25, 0.9, 2.6];
const ANCHOR_DISTANCE = 0.9;

export type Side = 'dominant' | 'nonDominant';

/** 体の位置の名前の点（手のひらの中心を置く点。場の座標・右利き） */
export function locationAnchor(at: BodyLocation, side: Side = 'dominant'): Vec3 {
  let p: Vec3;
  let lateral = true;
  if (at === 'neutral') {
    p = NEUTRAL_ANCHOR;
  } else {
    const s = SPOTS[at];
    p = madd(s.at, normalize(s.out), ANCHOR_DISTANCE);
    lateral = s.lateral;
  }
  return side === 'nonDominant' && lateral ? [0 - p[0], p[1], p[2]] : p;
}

/** 位置の指定 → 手のひらの中心の場の座標 */
export function resolvePosition(pos: Position | undefined, side: Side = 'dominant'): Vec3 {
  if (!pos) return locationAnchor('neutral', side);
  if (Array.isArray(pos)) return [pos[0], pos[1], pos[2]];
  const base = locationAnchor(pos.at, side);
  const o = pos.offset ?? [0, 0, 0];
  return [base[0] + o[0], base[1] + o[1], base[2] + o[2]];
}

/** ひじを逃がす向き（下・外・少し後ろ）。右腕は −X が外 */
export const ARM_POLE_R: Vec3 = [-0.45, -1, -0.35];
export const ARM_POLE_L: Vec3 = [0.45, -1, -0.35];

/*
 * （sign-content の数字・単語の担当が追加・2026-11-13）手首の位置に合わせた、ひじを逃がす向き。上半身の描画（body-rig.ts）が使う。
 * 追加の理由: 向きが ARM_POLE_R/L で固定だと、
 *  - 手を顔の高さへ上げた形（こめかみ・額・鼻・眉間）では、肩→手首の向きが逃がす向きとほぼ逆になり、ひじの位置が定まらない。
 *    おはようの「朝」（こぶしをこめかみへ）では、ひじが頭の後ろの反対側（表す人の左）へ回った
 *  - 手を胸に当てる形（わかる・大丈夫）では、ひじが体の後ろへ回り、前腕が胴を突き抜けた
 *  - 手を体の中心の前へ寄せる形（大丈夫で胸の左から右へ移る途中・ありがとう・お疲れさま）でも、前腕が胴を突き抜けた
 * そこで、手首が肩より上にあるときは「前・外・少し下」へ、胸の近く（前後の位置が体に近い）か体の中心の前へ寄せたときは
 * 「外・少し前」へ逃がす。胸の前の基準の位置（指文字を表す位置）では ARM_POLE_R/L のまま（今までの見た目を変えない）。
 * 手首の位置で連続に変えるので、動きの途中でひじが跳ばない。framing.ts の枠は ARM_POLE_R/L のひじで計算しているが、余白（0.6）の中に収まる。
 */
const POLE_RAISED_R: Vec3 = [-0.5, -0.45, 0.85];
const POLE_NEAR_BODY_R: Vec3 = [-0.8, -0.7, 0.3];

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 手首の位置（場の座標・右利き）に合わせた、ひじを逃がす向き。side は描く腕（dominant＝右腕） */
export function armPoleFor(side: Side, wrist: Vec3): Vec3 {
  const up = smoothstep(BODY.shoulderR[1] - 0.3, BODY.shoulderR[1] + 1.0, wrist[1]);
  const near = 1 - smoothstep(1.2, 2.3, wrist[2]);
  // 体の中心の側へどれだけ寄せたか（右腕にそろえた横の位置。中心の側が＋）。体から遠く前へ出した手では効かせない
  const medial = side === 'dominant' ? wrist[0] : 0 - wrist[0];
  const cross = smoothstep(-1.0, 0.5, medial) * (1 - smoothstep(2.4, 3.2, wrist[2]));
  const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const p = lerp3(lerp3(ARM_POLE_R, POLE_NEAR_BODY_R, Math.max(near, cross)), POLE_RAISED_R, up);
  return side === 'dominant' ? p : [0 - p[0], p[1], p[2]];
}

/**
 * 肩→手首の2つの骨（上腕・前腕）の逆運動学。ひじの位置を返す。
 * ひじは pole の向き（下・外・少し後ろ）へ逃がす。手首が届かない位置なら、腕を伸ばし切った向きでひじを置く。
 */
export function elbowPosition(shoulder: Vec3, wrist: Vec3, pole: Vec3, l1: number, l2: number): Vec3 {
  const sw = sub(wrist, shoulder);
  const dRaw = Math.hypot(sw[0], sw[1], sw[2]);
  const u: Vec3 = dRaw > 1e-6 ? scale(sw, 1 / dRaw) : [0, -1, 0];
  const d = clamp(dRaw, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  let v = sub(pole, scale(u, dot(pole, u)));
  if (Math.hypot(v[0], v[1], v[2]) < 1e-6) v = [0, -1, 0];
  v = normalize(v);
  return add(shoulder, add(scale(u, l1 * Math.cos(a)), scale(v, l1 * Math.sin(a))));
}
