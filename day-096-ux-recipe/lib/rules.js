// 【見本の骨格】親が置いた代用品。担当A2が、同じ名前・同じ形で全面的に作り直す（本物の診断ルールと、「なおす」操作つき）。
import { BLOCK_SCHEMA, STAGES, STAGE_LABEL } from './contract.js';

/** 流れの網羅（気づく→わかる→信じる→動く→安心）。 */
export function stageCoverage(state) {
  return STAGES.map((key) => {
    const count = state.blocks.filter((b) => BLOCK_SCHEMA[b.type].stage === key).length;
    return { key, label: STAGE_LABEL[key], count, ok: count > 0 };
  });
}

/** 診断。items は { id, level, ok, title, why, blockId?, fix?:{label, action} }。 */
export function diagnose(state) {
  const stages = stageCoverage(state);
  const passed = stages.filter((s) => s.ok).length;
  return { score: Math.round((100 * passed) / stages.length), passed, total: stages.length, items: [], stages };
}
