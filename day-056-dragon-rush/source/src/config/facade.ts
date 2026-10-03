// OWNER: config
// 外壁の描き方の数値（r01-city）。窓の奥行き・部屋の明るさ・汚れの濃さなど、外壁のシェーダーが #define で読む。
// 寸法は日本の中層ビルの実物（外壁の厚み 25〜45cm、腰高 80〜90cm、天井高 2.5〜2.7m）から、明るさは撮影を見て決めた。
import type { FacadeStyle } from '../world/types';

/** 窓の開口の奥行き（壁の外面からガラスまで、m）。描き方ごとの基準で、建物ごとに ±20% 揺らす */
export const RECESS_DEPTH: Record<FacadeStyle, number> = {
  punched: 0.32,
  curtain: 0.1,
  ribbon: 0.18,
  corrugated: 0.08,
  siding: 0.12,
  // 集合住宅はバルコニーの奥行き（手すりの面から掃き出し窓まで）
  balcony: 1.25,
  stone: 0.45,
};

export const FACADE = {
  /** 部屋に入る空の光の強さ（空の放射輝度に対する割合）。窓際の値で、奥ほど FALLOFF で暗くなる */
  interiorAmbient: 0.42,
  /** 窓から奥へ、明るさが 1/e になる距離の逆数（1/m） */
  interiorFalloff: 0.3,
  /** 灯りの点いた部屋の明るさ（面の反射率に掛ける）と、天井の照明の明るさ */
  lampSurface: 0.9,
  lampPanel: 5.0,
  /** 店の中の明るさ（面の反射率に掛ける）。0.9 では店先のガラスが白く飛んだので下げた */
  shopLamp: 0.42,
  /** 灯りの点いている部屋の割合（事務所・住まい・店）。夕方なので事務所はまだ点いている所が多い */
  litOffice: 0.34,
  litHome: 0.14,
  litShop: 0.92,
  /** ガラスの透過（フレネルで反射した残りのうち、部屋から届く割合） */
  glassTransmit: 0.8,
  /** 反射膜付きのカーテンウォールの透過 */
  coatedTransmit: 0.3,
  /** 雨だれ（窓台の端から下へ）・上端の汚れ・根元の汚れの濃さ */
  rainStreak: 0.3,
  topStreak: 0.22,
  baseGrime: 0.26,
  /** 看板の帯の内照の明るさ（主役は炎の色なので控えめ） */
  signGlow: 0.18,
} as const;

/**
 * 店先の形（r01-city）：ひさしと袖看板。色は落ち着いた色を中心にする（赤いひさしを並べない。参照の写しを避ける）。
 */
export const SHOPFRONT = {
  /** ひさしを掛ける柱間の割合と、奥行き・下がり・前の垂れ（m） */
  awningChance: 0.42,
  awningDepth: 1.15,
  awningDrop: 0.42,
  valance: 0.24,
  /** ひさしの色（sRGB）と、縞にする割合 */
  awningColors: [0x2f4a3a, 0x26324a, 0x333538, 0x5a3f2c, 0xcdbf9f, 0x2c5256, 0x5a2e2a, 0x5b5a3a, 0x6f7a80] as readonly number[],
  awningStriped: 0.3,
  /** 袖看板を付ける割合（雑居ビル）と、幅（壁から突き出す長さ）・厚み（m） */
  bladeChance: 0.72,
  bladeWidth: [0.9, 1.35] as const,
  bladeThick: 0.32,
} as const;

/** GLSL の #define の並び（外壁のシェーダーの先頭に入れる）。 */
export function facadeDefines(): string {
  const f = (x: number): string => (Number.isInteger(x) ? `${x}.0` : `${x}`);
  return Object.entries(FACADE)
    .map(([k, v]) => `#define FAC_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()} ${f(v)}`)
    .join('\n');
}
