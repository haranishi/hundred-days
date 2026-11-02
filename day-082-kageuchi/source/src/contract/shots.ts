// OWNER: contract（固定の構図。ゲームの ?shot= と、世界の見た目の確認ページ art.html が同じ構図で撮る）
// three を import しない。カメラの位置は注視点・向き・見下ろしの角・距離から決める。

export interface ShotDef {
  name: string;
  /** 注視点（x, 高さ, z）。 */
  target: [number, number, number];
  /** カメラが向く方角（度）。0＝東、90＝南、180＝西、270＝北。 */
  yawDeg: number;
  /** 見下ろしの角（度）。0 は水平。 */
  pitchDeg: number;
  distance: number;
  fov: number;
  /** 撮る瞬間のゲーム内時刻（炎・旗・霧の位相をそろえる）。 */
  t: number;
  /** 何を見る構図か。 */
  note: string;
}

export const SHOTS: ShotDef[] = [
  // r03-design: world の依頼「画面の上の端でも水平より下を向くので空が映らない」 旧 target[0,2,-4] yaw300 pitch28 dist70
  { name: 'title', target: [0, 6, -4], yawDeg: 290, pitchDeg: 8, distance: 95, fov: 38, t: 12, note: '寺の全景と夜明け前の空・東山の稜線。タイトルの背景' },
  // r01-design: core の指摘「カメラが町屋の壁（z=39.5〜40.5・高さ5.5m）の裏に入って画面が塞がる」
  // start 旧 target[-13,1.2,33] yaw285 pitch22 dist9 → 通りの西から東を見る構図へ。gate 旧 dist13 pitch14 → dist10 pitch12（カメラを通りの中へ）
  { name: 'start', target: [-6, 1.5, 32], yawDeg: 346, pitchDeg: 10, distance: 16.5, fov: 50, t: 3, note: '開始地点の西から東を見る。暗い南の通りと土塀、遠くに表門の篝火' },
  { name: 'gate', target: [0, 2.0, 28.5], yawDeg: 270, pitchDeg: 12, distance: 10, fov: 45, t: 5, note: '表門を外から。篝火と番兵2人' },
  { name: 'courtyard', target: [-6, 0.9, 17], yawDeg: 270, pitchDeg: 48, distance: 11, fov: 50, t: 8, note: '遊ぶときの角度。本堂の前の白砂と篝火' },
  { name: 'bamboo', target: [-32.5, 0.9, -9], yawDeg: 270, pitchDeg: 40, distance: 9, fov: 50, t: 10, note: '遊ぶときの角度。竹林の獣道と板塀の切れ目' },
  { name: 'garden', target: [3, 0.9, -16.5], yawDeg: 250, pitchDeg: 48, distance: 12, fov: 50, t: 14, note: '遊ぶときの角度。奥庭・池・信長・蘭丸・書院の障子' },
  { name: 'nobunaga', target: [1.8, 0.9, -18.8], yawDeg: 160, pitchDeg: 18, distance: 5, fov: 45, t: 16, note: '信長の背後から池の方を見る。行灯と障子の明かり' },
  { name: 'fire', target: [0, 4, -16], yawDeg: 235, pitchDeg: 24, distance: 42, fov: 40, t: 20, note: '炎上（setFire 0.8）。書院から本堂へ' },
];

export function getShot(name: string): ShotDef | undefined {
  return SHOTS.find((s) => s.name === name);
}

/** カメラの位置（x, y, z）。向きの前方は (cos yaw, sin yaw) で、カメラは注視点からその逆へ下がる。 */
export function shotCameraPosition(s: ShotDef): [number, number, number] {
  const yaw = (s.yawDeg * Math.PI) / 180;
  const pitch = (s.pitchDeg * Math.PI) / 180;
  const flat = Math.cos(pitch) * s.distance;
  return [s.target[0] - Math.cos(yaw) * flat, s.target[1] + Math.sin(pitch) * s.distance, s.target[2] - Math.sin(yaw) * flat];
}
