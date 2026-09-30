// 答え合わせで視点を飛ばす先。物の正面側で、同じ部屋の歩ける場所から、物がよく見える位置を選ぶ。
import { HOUSE, roomAt } from './plan.js';
import { distToRect, wallRects } from './nav.js';

const RAD = Math.PI / 180;
let walls = null;

/** 視点から物まで、壁（出入口は抜いてある）を通らずに見通せるか。低い家具は視線をふさがないので数えない */
function seesPast(x, z, cx, cz) {
  walls ??= wallRects();
  const n = Math.ceil(Math.hypot(cx - x, cz - z) / 0.04);
  for (let i = 0; i <= n * 0.92; i++) {
    const t = i / n;
    const px = x + (cx - x) * t;
    const pz = z + (cz - z) * t;
    if (walls.some(w => distToRect(w, px, pz) < 0.01)) return false;
  }
  return true;
}

/**
 * center: 物の中心 [x, y, z]、facing: 物の正面の向き（度・0＝南）、size: 物の一番長い辺（m）
 * 戻り値: { x, z, yaw, pitch }（カメラの位置と向き）
 */
export function revealViewpoint(grid, center, facing, size, roomId, { pitchOffset = -9 } = {}) {
  const [cx, cy, cz] = center;
  // 物が画面の幅の3割ほどに写る距離（横の画角86度のとき）。小さな物ほど近くに寄る
  // （評価の2周目「棚の奥の小物が小さく映るだけ」、見た目の採点「消えた物に目が行かない」）
  const base = Math.max(0.85, Math.min(2.6, size * 2.2 + 0.3));
  const dists = [base, base + 0.4, base - 0.3, base + 0.9, 1.1];
  const angles = [0, 25, -25, 50, -50, 75, -75, 110, -110, 150, -150, 180];
  for (const d of dists) {
    for (const a of angles) {
      const dir = (facing + a) * RAD;
      // facing=0 は南（+z）
      const x = cx + Math.sin(dir) * d;
      const z = cz + Math.cos(dir) * d;
      if (!grid.isFree(x, z)) continue;
      const room = roomAt(x, z);
      if (roomId && room && room.id !== roomId && !(roomId === 'hall' && room.id === 'entrance')) continue;
      if (!seesPast(x, z, cx, cz)) continue;
      return lookFrom(x, z, center, pitchOffset);
    }
  }
  const p = grid.nearestFree(cx, cz, 3) || [HOUSE.start.x, HOUSE.start.z];
  return lookFrom(p[0], p[1], center, pitchOffset);
}

export function lookFrom(x, z, [cx, cy, cz], pitchOffset = -9) {
  const dx = cx - x;
  const dz = cz - z;
  const yaw = Math.atan2(-dx, -dz) / RAD;
  // 下の札に隠れないよう、物が画面の上寄りに来るように少し下を向く（縦長の画面ほど大きく）
  const pitch = Math.atan2(cy - HOUSE.eyeHeight, Math.hypot(dx, dz)) / RAD + pitchOffset;
  return { x, z, yaw, pitch: Math.max(-70, Math.min(40, pitch)) };
}
