/**
 * 手だけを描くとき（上半身なし）の、前腕の向き（手首からひじへ。three.js に依存しない）。
 *
 * 体を描かなくても、手は体の前の決まった位置（体の位置の名前）にあるので、上半身つきと同じ肩→ひじの逆運動学（elbowPosition・armPoleFor）で
 * ひじの位置を求め、手首からひじへの向きを、手首の曲がる範囲に収める。
 * 以前は「手首をまっすぐ」を基本に、指先が下を向く形だけ体の中心の側・上・奥へ折っていた。右腕なのに袖が体の中心の側（相手から見て右上の奥）へ
 * 伸びたため、指先が下を向く文字（す・な・ね・ふ・へ・ま）は自分から見ると袖の切り口が手の甲にかぶり、そ・は・ぱ は袖が手の手前に来て
 * 手が隠れた（hand-r2 で直した。別の確認者の照合と、データを作った担当の報告による）。
 * いまは前腕が表す人の右下・後ろ（ひじの方）へ向かい、指先が下を向く形では手首を曲げた分だけ上へ回る（相手から見て左上に袖の切り口が来る。
 * 神奈川県の指文字表の図と同じ）。
 */
import type { Vec3 } from '../types';
import { BODY, armPoleFor, elbowPosition, type Side } from './body';
import { clamp, colX, colY, colZ, dot, normalize, scale, sub, add } from './math';
import type { HandState } from './timeline';

const DEG = Math.PI / 180;

/**
 * 手首の曲がる範囲（度）。人の手首の動く範囲（手のひら側へ約80°・甲の側へ約70°・親指の側へ約20°・小指の側へ約30〜35°）より少し狭くし、
 * 無理に曲げた手首に見えないようにした
 */
export const WRIST_LIMITS = { flexion: 70, extension: 60, radial: 20, ulnar: 35 } as const;

/**
 * 楕円 (x/ax)²+(z/az)²=1 の上で、点 (px, pz) にいちばん近い点（同じ象限の中で探す）。
 * 手首の曲げの「手のひら側／甲の側」と「親指の側／小指の側」の量を、範囲の縁へ寄せるのに使う
 */
function closestOnEllipse(px: number, pz: number, ax: number, az: number): [number, number] {
  const sx = px < 0 ? -1 : 1, sz = pz < 0 ? -1 : 1;
  const x = Math.abs(px), z = Math.abs(pz);
  // 角度 φ（x = ax·cosφ, z = az·sinφ）を 0〜90° で粗く探し、黄金分割で詰める
  const d2 = (phi: number) => (ax * Math.cos(phi) - x) ** 2 + (az * Math.sin(phi) - z) ** 2;
  let best = 0, bestD = Infinity;
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const phi = (i / N) * (Math.PI / 2);
    const v = d2(phi);
    if (v < bestD) {
      bestD = v;
      best = phi;
    }
  }
  let lo = Math.max(0, best - Math.PI / 2 / N), hi = Math.min(Math.PI / 2, best + Math.PI / 2 / N);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 24; k++) {
    const a = hi - g * (hi - lo), b = lo + g * (hi - lo);
    if (d2(a) < d2(b)) hi = b;
    else lo = a;
  }
  const phi = (lo + hi) / 2;
  return [sx * ax * Math.cos(phi), sz * az * Math.sin(phi)];
}

/**
 * 手首を、向き d（場の座標・手首からひじへ）にできるだけ近い向きへ曲げたときの前腕の向き。
 * 手の座標で、まっすぐの前腕は −Y。手のひら側へ曲げると前腕は +Z（手のひらの面の外向き）の側へ、親指の側へ曲げると +X（親指の側）へ傾く。
 * mirrored＝左手として描く手（手の座標の X が反転しているので、親指の側は −X）
 */
export function bendWrist(h: Pick<HandState, 'rot'>, d: Vec3, mirrored: boolean): Vec3 {
  const Y = colY(h.rot), Z = colZ(h.rot);
  const X = mirrored ? scale(colX(h.rot), -1) : colX(h.rot);
  const n = normalize(d);
  const dx = dot(n, X), dy = dot(n, Y), dz = dot(n, Z);
  // まっすぐの前腕（−Y）から d への曲げ: 角度 α と、手の X–Z の面での向き
  const alpha = Math.acos(clamp(-dy, -1, 1));
  const side = Math.hypot(dx, dz);
  if (alpha < 1e-6 || side < 1e-9) return scale(Y, -1);
  let bx = (alpha * dx) / side, bz = (alpha * dz) / side;
  const ax = (bx >= 0 ? WRIST_LIMITS.radial : WRIST_LIMITS.ulnar) * DEG;
  const az = (bz >= 0 ? WRIST_LIMITS.flexion : WRIST_LIMITS.extension) * DEG;
  if ((bx / ax) ** 2 + (bz / az) ** 2 > 1) [bx, bz] = closestOnEllipse(bx, bz, ax, az);
  const a = Math.hypot(bx, bz);
  if (a < 1e-9) return scale(Y, -1);
  const toward = add(scale(X, bx / a), scale(Z, bz / a));
  return normalize(add(scale(Y, -Math.cos(a)), scale(toward, Math.sin(a))));
}

/** 手だけを描くときの前腕の向き（場の座標・右利きのデータのまま）。side は描く手（dominant＝右手） */
export function forearmDirection(h: Pick<HandState, 'rot' | 'wrist'>, side: Side): Vec3 {
  const shoulder = side === 'dominant' ? BODY.shoulderR : BODY.shoulderL;
  const elbow = elbowPosition(shoulder, h.wrist, armPoleFor(side, h.wrist), BODY.upperArm, BODY.forearm);
  return bendWrist(h, sub(elbow, h.wrist), side === 'nonDominant');
}
