// OWNER: config
// 雷翼と焔角の技の見た目（src/fx/creatureFx.ts）の数値（r03-roster）。色は線形（1 を超えるとブルームで光る）、長さは m、時間は秒。
// 紅竜の炎・煙・崩れの数値は config/fx.ts（炎と崩れ方の担当）にあり、ここは足した技の分だけを持つ。
import type { QualityName } from './quality';

/** 粒子の上限（画質ごと）と、雷の帯・地割れの筋の頂点の上限。紅竜で遊ぶ間は何も出さない（描画命令も増えない） */
export const CREATURE_FX_BUDGET: Record<QualityName, { additive: number; soft: number; ribbonVerts: number }> = {
  high: { additive: 1800, soft: 900, ribbonVerts: 9000 },
  medium: { additive: 1200, soft: 600, ribbonVerts: 6000 },
  low: { additive: 700, soft: 350, ribbonVerts: 4000 },
};

export const CREATURE_FX = {
  /**
   * 雷の筋：両端の間を segments 本の折れ線にし、横へ jitter × 長さ（最大 jitterMax m）だけ散らす。長い筋ほど枝（branches）を出す。
   * 芯は白に近い青、にじみ（halo）は太く青い。life 秒で消え、その間 flickerHz でまたたく
   */
  bolt: {
    segments: 14,
    jitter: 0.07,
    jitterMax: 9,
    branches: 2,
    branchLength: 0.35,
    core: { width: 0.9, color: [2.6, 3.4, 5.5] as const },
    halo: { width: 4.2, color: [0.35, 0.6, 1.8] as const },
    life: 0.22,
    flickerHz: 32,
  },
  /** 落雷の輪の1本：空の高さ skyHeight から地面へ。地面の閃光と、はじける土煙 */
  skyBolt: { skyHeight: 230, life: 0.3, flash: 16, dust: 10 },
  /** 当たった所の閃光（直径 m・明るさ）と、飛び散る火花の数 */
  hitFlash: { size: 9, intensity: 7, sparks: 10, color: [0.55, 0.75, 1.0] as const },
  /** 溶岩の礫：光る岩（半径 m・色）、尾の火の粉と煙（1秒あたり）、弾けた所の閃光・火の粉・煙 */
  lava: {
    radius: 3,
    color: [5.5, 1.5, 0.22] as const,
    trailSparks: 70,
    trailSmoke: 12,
    impactFlash: 12,
    impactSparks: 26,
    impactSmoke: 6,
    sparkColor: [1.0, 0.42, 0.08] as const,
    /** 見た目の口から遊びの側の弾道へ寄せる秒数（口の位置の差を隠す） */
    mouthBlend: 0.25,
  },
  /**
   * 地割れの筋：裂け目どうしを結ぶ赤く光る筋（glow）と、その下の黒い裂け目（gash）。grow 秒で伸び、life 秒で冷めて消える。
   * 裂け目ごとに土煙と火の粉を上げる
   */
  crack: {
    glow: { width: 2.2, color: [3.2, 0.55, 0.08] as const },
    gash: { width: 7.5, darkness: 0.62 },
    grow: 0.12,
    life: 9,
    hot: 1.6,
    lift: 0.35,
    dust: 7,
    sparks: 8,
    /** 裂け目から立つ赤い光の玉（直径 m・明るさ・秒・1つの裂け目あたりの数）。地面に寝た筋は瓦礫と土煙に隠れやすいので、上へも光を出す */
    vent: { size: 8, intensity: 2.2, life: 4, count: 3 },
  },
  /** 突進の土煙（1秒あたり、足もとから後ろへ） */
  charge: { dustPerSecond: 16 },
};
