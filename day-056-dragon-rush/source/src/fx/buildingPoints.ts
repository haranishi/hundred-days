// OWNER: fx
// 建物の外壁の上の点。炎・煙・破片・ガラス片を「壁から」出すために使う。
// 傾いたり崩れたりした建物では、外壁のシェーダー（city/damageGlsl.ts の dmgMove）と同じ式で点を動かす。
import type { Rng } from '../core/rng';
import { collapseHinge, collapsePose, movePiece, poseZero, slabIndexAt, type CollapseShapes } from '../city/collapsePose';
import type { DamageVisualSource } from '../city/damageTexture';
import type { Building } from '../world/types';

const POSE = poseZero();

export interface WallPoint {
  x: number;
  y: number;
  z: number;
  /** 外向きの法線（水平） */
  nx: number;
  nz: number;
}

export const wallPointZero = (): WallPoint => ({ x: 0, y: 0, z: 0, nx: 1, nz: 0 });

/** 高さ yLo〜yHi の範囲の、外壁の上のでたらめな点。 */
export function randomWallPoint(b: Building, rng: Rng, yLo: number, yHi: number, out: WallPoint): WallPoint {
  const y = rng.range(Math.min(yLo, yHi), Math.max(yLo, yHi));
  let m = b.masses[0];
  for (const mm of b.masses) if (y >= mm.y0 && y <= mm.y1) m = mm;
  const r = m.rect;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  let s = rng.range(0, 2 * (w + d));
  if (s < w) setPoint(out, r.x0 + s, r.z0, 0, -1);
  else if ((s -= w) < d) setPoint(out, r.x1, r.z0 + s, 1, 0);
  else if ((s -= d) < w) setPoint(out, r.x1 - s, r.z1, 0, 1);
  else setPoint(out, r.x0, r.z1 - (s - w), -1, 0);
  out.y = Math.min(y, m.y1);
  return out;
}

/** (x, z) に最も近い外壁の点（その向きの法線）。中にいれば最も近い辺。 */
export function nearestWallPoint(b: Building, x: number, z: number, y: number, out: WallPoint): WallPoint {
  const f = b.footprint;
  const cx = Math.min(f.x1, Math.max(f.x0, x));
  const cz = Math.min(f.z1, Math.max(f.z0, z));
  const inside = cx === x && cz === z;
  const dists: [number, number, number, number, number][] = [
    [Math.abs(cx - f.x0), f.x0, cz, -1, 0],
    [Math.abs(f.x1 - cx), f.x1, cz, 1, 0],
    [Math.abs(cz - f.z0), cx, f.z0, 0, -1],
    [Math.abs(f.z1 - cz), cx, f.z1, 0, 1],
  ];
  if (inside) {
    dists.sort((a, c) => a[0] - c[0]);
    setPoint(out, dists[0][1], dists[0][2], dists[0][3], dists[0][4]);
  } else {
    const dx = x - cx;
    const dz = z - cz;
    const l = Math.hypot(dx, dz) || 1;
    setPoint(out, cx, cz, dx / l, dz / l);
  }
  out.y = Math.min(y, b.height);
  return out;
}

function setPoint(out: WallPoint, x: number, z: number, nx: number, nz: number): void {
  out.x = x;
  out.z = z;
  out.nx = nx;
  out.nz = nz;
}

/**
 * 傾き（根元の辺を支点）と崩落（沈みと押しつぶれ）で点を動かす。dmgMove と同じ式。
 * r04-fx2：割れる建物の寸法（上の塊の板・倒れる先の隣）は shapes から引く（描画の表と同じ決め方）。
 */
export function displacePoint(p: WallPoint, id: number, d: DamageVisualSource, b: Building, shapes: CollapseShapes): WallPoint {
  const baseY = b.masses[0].y0;
  const tilt = d.tilt[id];
  // r03-fx：割れる高さが決まった建物は、割れ目より上を倒し、下の階を潰す形（city/collapsePose.ts・外壁の dmgMovePiece）
  const split = d.splitY[id];
  if (split > 0 && (tilt > 0 || d.collapse[id] > 0)) {
    const shape = shapes.get(b, split, d.dirX[id], d.dirZ[id]);
    collapsePose(tilt, d.collapse[id], shape, POSE);
    // r04-fx2（引き継ぎ）：倒れる向きは見た目の向き（前が塞がっていれば替えた向き。外壁のシェーダーと同じ）
    movePiece(p, slabIndexAt(shape, p.y), POSE, collapseHinge(b, shape.dirX, shape.dirZ, split), shape, shape.dirX, shape.dirZ);
    return p;
  }
  if (tilt > 0) {
    const ax = d.dirZ[id];
    const az = -d.dirX[id];
    const al = Math.hypot(ax, az) || 1;
    const kx = ax / al;
    const kz = az / al;
    const vx = p.x - d.pivotX[id];
    const vy = p.y - baseY;
    const vz = p.z - d.pivotZ[id];
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    // ロドリゲスの回転（軸は水平 (kx, 0, kz)）
    const cx = -kz * vy;
    const cy = kz * vx - kx * vz;
    const cz = kx * vy;
    const dot = kx * vx + kz * vz;
    p.x = d.pivotX[id] + vx * c + cx * s + kx * dot * (1 - c);
    p.y = baseY + vy * c + cy * s - d.reach[id] * s;
    p.z = d.pivotZ[id] + vz * c + cz * s + kz * dot * (1 - c);
  }
  const col = d.collapse[id];
  if (col > 0) p.y = baseY + Math.max(p.y - baseY, 0) * (1 - 0.3 * col) - col * col * (b.height + 8);
  return p;
}
