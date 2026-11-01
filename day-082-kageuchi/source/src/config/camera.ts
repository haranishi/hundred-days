// OWNER: core
// 肩越しの追従カメラの数値。角度は度、距離は m、時間は秒。
// ばねの時間（smooth）は「目標までのおよその秒数」（臨界減衰の SmoothDamp）。

export const CAMERA = {
  /** 遊ぶときの画角（度）。撮影の構図 courtyard・garden と同じ */
  fov: 50,
  /** 見下ろしの角（度）：既定・下限・上限 */
  pitch: 48,
  pitchMin: 25,
  pitchMax: 70,
  /** 注視点からの距離（m）：既定・下限・上限 */
  distance: 11,
  distanceMin: 6,
  distanceMax: 16,
  /** 注視点の高さ（足元から m） */
  targetHeight: 1.0,
  /** マウス 1px あたりの回転（ラジアン）。自動操作の look も同じ値を使う */
  lookSensitivity: 0.0025,
  /** ホイールの deltaY 1 あたりの距離の変化（m）。一段（約100）で 1.2m */
  wheelStep: 0.012,
  /** 注視点を追うばね（秒） */
  targetSmooth: 0.12,
  /** 距離のばね（秒） */
  distanceSmooth: 0.18,
  /** 狙い（Q）への移り変わりのばね（秒） */
  aimSmooth: 0.14,
  /** 狙いを始めたときの、プレイヤーから狙いまでの距離（m） */
  aimStart: 8,
  /** 狙っている間、マウス 1px で狙いが前後する距離（m） */
  aimPerPixel: 0.04,
  /** タイトルの、寺のまわりをゆっくり回る速さ（度/秒） */
  titleOrbitSpeed: 2.5,
  /** 演出で全景へ引くばね（秒） */
  finaleSmooth: 1.4,
} as const;
