// OWNER: city
// 外壁・屋根・地面の描き方の番号。頂点属性に入れ、シェーダーはこの番号で分岐する。
import type { FacadeStyle } from '../world/types';

export const FACADE_STYLE_ID: Record<FacadeStyle, number> = {
  punched: 0,
  curtain: 1,
  ribbon: 2,
  corrugated: 3,
  siding: 4,
  balcony: 5,
  stone: 6,
};

export const SURFACE_STYLE = {
  roofFlat: 10,
  roofTile: 11,
  roofMetal: 12,
  // r01-city：店先のひさし（布）と、袖看板・屋上の看板（意味を持たない字）
  awning: 13,
  sign: 14,
  // r03-fx：崩れる建物の割れ目の床（荒いコンクリートとひび・鉄筋）
  broken: 15,
  plain: 20,
} as const;

export const GROUND_STYLE = {
  asphalt: 0,
  intersection: 1,
  sidewalk: 2,
  plaza: 3,
  garden: 4,
  wharf: 5,
  parking: 6,
  curb: 7,
  seawall: 8,
  outskirts: 9,
  // r01-city：街路樹の植え枡と、中庭の小さな公園
  treePit: 10,
  park: 11,
} as const;

/** GLSL に渡す #define の並び。 */
export function styleDefines(): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(FACADE_STYLE_ID)) lines.push(`#define FS_${k.toUpperCase()} ${v}.0`);
  for (const [k, v] of Object.entries(SURFACE_STYLE)) lines.push(`#define SS_${k.toUpperCase()} ${v}.0`);
  for (const [k, v] of Object.entries(GROUND_STYLE)) lines.push(`#define GS_${k.toUpperCase()} ${v}.0`);
  return lines.join('\n');
}
