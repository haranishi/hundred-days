// OWNER: world-art
// 描画の調整値（空・霧・光・影・後処理・色）。値を直したら札（// r01-world-周N: 指摘「…」 旧→新）を残す。
// 色はすべて線形の RGB。空の色は「画面に出る空の明るさ」の単位で、環境光はそれに AMBIENT.envIntensity を掛けて使う。

export type RGB = [number, number, number];

/** 夜明け前の空。天頂は深い藍、東の地平だけが灰青から薄紫へわずかに白む。 */
export const SKY = {
  zenith: [0.0026, 0.0042, 0.0165] as RGB,
  /** 仰角 25° あたりの色（天頂と地平の間を2段で混ぜる） */
  // r01-world-周3: 指摘「夜の白砂が灰色がかった藤色で、青の夜に見えない」 中ほどと地平の赤みを減らす（赤 0.0072→0.0056、0.026→0.021）
  mid: [0.0056, 0.0102, 0.031] as RGB,
  // r01-world-周2: 指摘「遠景が霧で一様に沈み、空気遠近の段が出ない」 地平 0.025→0.033、明るみ 0.052→0.066（緑の値）
  horizon: [0.021, 0.032, 0.058] as RGB,
  /** 東の明るみ（地平線のすぐ上）。灰青 → 薄紫 */
  glow: [0.064, 0.066, 0.088] as RGB,
  glowLow: [0.056, 0.042, 0.062] as RGB,
  /** 明るみの中心の方角（ステージと同じ角度：0＝東、-90＝北）。旧暦六月の日の出は東北東 */
  glowDeg: -22,
  /** 明るみの方角の広がり（大きいほど狭い）と、仰角での減り方（ラジアン） */
  glowSharpness: 3.2,
  glowHeight: 0.16,
  /** 地平線より下（遠くの地面）の色。環境マップの下半分になり、軒裏や庇の裏を照らす */
  ground: [0.010, 0.011, 0.016] as RGB,
  // r03-fix-visual: 指摘「星と東山の稜線が、タイトルにも開始の画面にも出ていない」 明るさ 0.35→0.8（地平近くと東の白みでも少し残す：sky.ts）
  stars: { density: 0.06, brightness: 0.8, size: 1.3 },
  /**
   * 東山（stage.decor.mountainsDeg の範囲）とほかの山並みの稜線の高さ（ラジアン）と色。
   * r03-fix-visual: 東 0.052→0.1（稜線 約 3〜7°。四条から東山まで約 3.5km・高さ 200〜400m の見え方。通りの突き当たりの町屋 約 3° の上に出す）
   */
  mountains: { east: 0.1, other: 0.02, color: [0.0035, 0.0042, 0.008] as RGB, haze: 0.45 },
};

/** 空からの弱い冷たい主光（東寄りの高い所から）。色は空の関数の明るみから取る。 */
export const KEY = {
  azDeg: -30,
  elevDeg: 56,
  intensity: 0.32,
  /** 影：r186 の SunLight の2段の影。radius は 1 前後（広げるとざらつく） */
  shadow: { mapSize: 2048, radius: 1.15, bias: -0.0005, normalBias: 0.035, intensity: 0.8 },
  /** 影の届く距離＝注視点までの距離 × k ＋ add（下限・上限つき） */
  shadowRange: { k: 2.2, add: 18, min: 34, max: 170 },
};

/** 空の環境光。scene.environment（空の PMREM）と、照り返しの半球光。 */
export const AMBIENT = {
  envIntensity: 2.6,
  /** 半球光：空側は天頂の色、地側は白砂の照り返し（空の明るさ×白砂の反射率） */
  hemiIntensity: 0.55,
  hemiSkyGain: 1.0,
  // r02-fix-visual: 白砂の反射率を下げた（約 0.55→0.37）のに合わせて照り返しも少し下げる 0.55→0.46（人影の下側を沈めすぎない所まで）
  hemiGroundAlbedo: 0.46,
};

/**
 * 置いてある灯り。scene の強さ＝ゲームの intensity × gain。届く距離はゲームの radius と高さから
 * hypot(radius, height) にし、減衰はゲームと同じ (1−u²)² に差し替えてある（lightCurve.ts）。
 */
export const POINT = {
  gain: { brazier: 5.2, stoneLantern: 3.4, shoji: 3.2, window: 3.0, andon: 3.0, lantern: 4.2 },
  /** 揺らぎの強さ（0..1）と速さ */
  flicker: { brazier: 0.16, stoneLantern: 0.05, shoji: 0.02, window: 0.03, andon: 0.06, lantern: 0.08 },
};

/** 炎上の光（3つの枠）。setFire の進みで強さを上げる。 */
export const FIRE_LIGHT = {
  color: [1.0, 0.45, 0.14] as RGB,
  /** 光の届く距離（m）と、進み 1 のときの強さ */
  radius: 34,
  // r01-world-周2: 指摘「炎上で画面の 15% が白飛び」 26→20
  intensity: 20,
  /** 明滅の深さ（±の割合）と速さ。r02-fix-visual: 指摘「炎のそばの屋根や地面が照らされず、明滅もしない」 0.18・1.3→0.34・1.9 */
  flicker: 0.34,
  flickerSpeed: 1.9,
};

/** 霧：高さで薄くなる霧（解析的に積分）と、地面を這う薄い靄（時間で流れる）。色は空の関数から取る。 */
export const FOG = {
  // r01-world-周2: 遠景の霧を少し濃く 0.0042→0.0052
  density: 0.0052,
  heightFalloff: 0.055,
  start: 10,
  /** 霧の色＝地平の空の色 × gain */
  gain: 1.0,
  // r02-fix-visual: 指摘「東の白みが遊ぶ画面に出ない」 靄は東ほど濃く（×2.6）白む（色×2.4＋東の明るみ）。east.x1 は東の端の x（m）
  mist: { density: 0.0018, height: 1.6, scale: 0.035, speed: 0.12, east: { density: 1.6, color: 1.4, glow: 0.6, x1: 70 } },
  /** 霧に滲む灯りの濃さ（灯りの強さに掛ける）。篝火・灯籠・行灯・炎上の光 */
  // r01-world-周3: 指摘「篝火の光が空気に滲まず、点で終わる」 篝火 0.0055→0.0078
  // r02-fix-visual: 炎上の空が照らされず、黒い煤煙が夜空に溶けて見えない 炎上 0.004→0.007
  air: { brazier: 0.0078, stoneLantern: 0.0032, andon: 0.003, fire: 0.007 },
};

/** 色の仕上げ（GradeEffect）。 */
export const GRADE = {
  exposure: 1.0,
  /** 暗部の足の持ち上げ（曲線と直線のなめらかな最大値）。夜は画のほとんどが足に入る */
  // r01-world-周2: 指摘「暗い所が沈みすぎて、闇の中の形が読めない」 0.062→0.07
  toeLift: 0.07,
  saturation: 0.96,
  contrast: 1.04,
  /** 影は青、光は橙（輝度は保つ） */
  // r01-world-周3: 影の色調を青へ 0.88,0.97,1.16 → 0.84,0.97,1.2
  shadowTint: [0.84, 0.97, 1.2] as RGB,
  highlightTint: [1.12, 0.99, 0.84] as RGB,
  vignette: 0.42,
  grain: 0.018,
  /** setAlert の赤み、setFinale の色抜き・暖色・周辺減光 */
  // r01-world-周3: 指摘「発見の赤みが青い夜と混ざって紫になる」 青をもっと抜く 0.68→0.45、緑 0.72→0.6
  // r02-fix-visual: 赤みを縁の帯へ寄せたので、縁に足す赤い光（edgeGlow、トーンマップ後の値）を足した。周辺減光 0.55→0.5
  alert: { tint: [1.4, 0.6, 0.45] as RGB, vignette: 0.5, edgeGlow: [0.06, 0.004, 0.002] as RGB },
  finale: { desaturate: 0.72, warm: [1.14, 0.96, 0.78] as RGB, vignette: 0.9, contrast: 1.12 },
};

export const BLOOM = { threshold: 0.85, smoothing: 0.35, intensity: 0.85, radius: 0.72, levels: 6 };

/** AO（接地の暗がり）。N8AO。 */
export const AO = { radius: 1.6, distanceFalloff: 1.0, intensity: 2.6, samples: 12, denoiseSamples: 8, halfRes: true };

/** 画素比の上限（Retina の 2 倍は重いので抑える） */
export const MAX_PIXEL_RATIO = 1.5;
