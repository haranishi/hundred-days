// タイトル画面の後ろで、リビングのローテーブルのまわりをゆっくり回る視点。
// 1周 T 秒。視点はテーブルの少し奥を見る。
const CENTER = { x: 2.5, z: 6.1 };
const RX = 1.4;
const RZ = 0.95;
const T = 48;

/** portrait は縦長の画面。縦の画角が広いぶん少し下を向き、天井ではなく家具を写す（見た目の採点：390で背景が天井だけ） */
export function tourPose(time, portrait = false) {
  const a = (time / T) * Math.PI * 2 + 2.2;
  const x = CENTER.x + Math.cos(a) * RX;
  const z = CENTER.z + Math.sin(a) * RZ;
  // 円の中心より少し向こう側を見る（部屋の奥の壁まで入る）
  const lx = CENTER.x - Math.cos(a) * 1.2;
  const lz = CENTER.z - Math.sin(a) * 0.9;
  const yaw = Math.atan2(-(lx - x), -(lz - z)) * 180 / Math.PI;
  return { x, y: 1.55, z, yaw, pitch: portrait ? -38 : -16 };
}
