// 【見本の骨格】親が置いた代用品。担当A2が、同じ名前・同じ形で全面的に作り直す。
import { BLOCK_SCHEMA, blankProps } from './contract.js';

/** 部品ごとの説明（画面の「なぜ」に出す）。role=役割 / place=置く場所のコツ / mistake=よくある失敗。各1文。 */
export const BLOCK_INFO = Object.fromEntries(Object.keys(BLOCK_SCHEMA).map((type) => [type, { role: '（見本）', place: '（見本）', mistake: '（見本）' }]));

/** 目的に合う見本の文章が入った新しい部品を作る。 */
export function makeBlock(goal, type, id) {
  return { id, type, variant: 0, props: blankProps(type) };
}
