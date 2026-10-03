// OWNER: fx
// 瓦礫の山の色の決め方（純データ・three を読まない）。r04-fx2：指摘「瓦礫の山は崩れたビルの外壁の色と関係の無い灰茶の迷彩模様の丘」。
// 山は崩れたビルのかけらでできている、という見立てで、外壁のかけら・コンクリの躯体・ガラスの3色と、その割合を建物から取る。
// 割合は破片と同じ（DEBRIS.kindMix。ガラスの高層はガラスが多い）ので、降ってきた破片と積もった山の色がそろう。
import { DEBRIS, RUBBLE } from '../config/fx';
import { BUILDING_RULES } from '../config/gameplay';
import type { Building } from '../world/types';

export type Rgb = [number, number, number];

export interface RubblePalette {
  /** 外壁のかけら・コンクリ・ガラスの色（線形） */
  facade: Rgb;
  concrete: Rgb;
  glass: Rgb;
  /** 塊がどの種類になるかの割合（外壁・コンクリ・ガラス、和が 1） */
  weights: Rgb;
  /** 焦げの色へ寄せる割合（0〜1。焦げの量 char から） */
  soot: number;
}

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** 外壁の色（線形）：塊ごとの体積で重みを付けた平均。高層の基壇と塔で色が違う建物は混ざる。 */
export function wallLinear(b: Building): Rgb {
  const out: Rgb = [0, 0, 0];
  let total = 0;
  for (const m of b.masses) {
    const v = Math.max(1, (m.rect.x1 - m.rect.x0) * (m.rect.z1 - m.rect.z0) * (m.y1 - m.y0));
    for (let k = 0; k < 3; k++) out[k] += lin(m.wallColor[k]) * v;
    total += v;
  }
  return [out[0] / total, out[1] / total, out[2] / total];
}

/** 建物 b が崩れた瓦礫の山の色。char は焦げの量（0〜1、遊びの DamageState.char）。 */
export function rubblePalette(b: Building, char: number): RubblePalette {
  const R = RUBBLE;
  const w = wallLinear(b);
  const facade: Rgb = [0, 0, 0];
  for (let k = 0; k < 3; k++) facade[k] = w[k] * R.facadeShade * (1 - R.dustMix) + R.dust[k] * R.dustMix;
  const g = b.facade.glassColor;
  const glass: Rgb = [lin(g[0]) * R.glassShade, lin(g[1]) * R.glassShade, lin(g[2]) * R.glassShade];
  // kindMix の並びはコンクリ・外壁・ガラス。塊の割合は外壁・コンクリ・ガラスの順に並べ直す
  const [c, f, gl] = DEBRIS.kindMix[BUILDING_RULES[b.kind].material];
  const sum = c + f + gl;
  return {
    facade,
    concrete: [R.concrete[0], R.concrete[1], R.concrete[2]],
    glass,
    weights: [f / sum, c / sum, gl / sum],
    soot: Math.min(1, Math.max(0, char)) * R.sootMix,
  };
}
