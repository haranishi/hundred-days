// 【見本の骨格】親が置いた代用品。担当A2が、同じ名前・同じ形で全面的に作り直す（8つの目的ぶんの本物のレシピ）。
import { GOALS, GOAL_LABEL, SCHEMA_VERSION, sanitizeProps } from './contract.js';

const SKELETON = [
  ['hero', 0, { title: '見出しをここに書く', lead: '説明をここに書く。', cta: '申し込む' }],
  ['cta', 0, { title: 'まずは気軽に', text: '説明をここに書く。', button: '申し込む' }],
  ['footer', 0, { name: 'サンプル' }],
];

/** 目的ごとの定義。question=入口の問い / summary=この目的で効く流れの説明 / siteName=見本のお店の名前 */
export const RECIPES = Object.fromEntries(GOALS.map((goal) => [goal, {
  goal, question: GOAL_LABEL[goal], summary: '（見本）', siteName: 'サンプル', theme: { preset: 'soft', accent: 0 },
  blocks: SKELETON.map(([type, variant, props]) => ({ type, variant, props: sanitizeProps(type, props) })),
}]));

/** 目的のレシピから、新しい状態（id は b1, b2, …）を作る。 */
export function buildFromRecipe(goal) {
  const r = RECIPES[goal];
  return {
    v: SCHEMA_VERSION, goal, site: { name: r.siteName }, theme: { ...r.theme },
    blocks: r.blocks.map((b, i) => ({ id: `b${i + 1}`, type: b.type, variant: b.variant, props: structuredClone(b.props) })),
  };
}

/** 言い換えの候補。key は 'title' など項目の名前。無ければ []。 */
export function suggestionsFor(goal, type, key) { return []; }
