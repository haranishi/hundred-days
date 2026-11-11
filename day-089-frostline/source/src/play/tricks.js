import { RULES } from './rules.js';
const finite = v => Number.isFinite(v) ? v : 0;
/** つかみの技の名前（道具ごと）。番号は物理の決まり（1〜3）で、同じ */
export const GRAB_NAMES = Object.freeze({ board: ['', 'インディ', 'ミュート', 'テール'], ski: ['', 'セーフティ', 'ミュート', 'テール'] });
export function scoreTrick(event = {}, gear = 'board') {
  // 物理は、離したときに板を着地の向きへそろえる（窓は 45°）。そろえた先は「進む向き」で、空中でも少し動くので、
  // 回った量がちょうど 360° にならない（357° など）。切り捨てで数えると 360 が 180 になる。窓の幅だけ足してから数える
  const halfTurns = Math.floor((Math.abs(finite(event.spin)) + RULES.spinWindow) / Math.PI);
  const flips = Math.floor((Math.abs(finite(event.flip)) + RULES.flipWindow) / (2*Math.PI));
  const grab = [1,2,3].includes(event.grab) ? event.grab : 0;
  const air = Math.max(0, finite(event.air)), grabTime = Math.max(0, finite(event.grabTime));
  if (!halfTurns && !flips && !grab && air < 1) return null;
  const name = [event.switchIn ? 'スイッチ' : '', (GRAB_NAMES[gear] ?? GRAB_NAMES.board)[grab],
    flips ? `${flips > 1 ? `${flips}回 ` : ''}${event.flip > 0 ? 'フロントフリップ' : 'バックフリップ'}` : '', halfTurns ? String(halfTurns*180) : ''].filter(Boolean).join(' ') || '大きなジャンプ';
  let score = (RULES.spinPoints[halfTurns] ?? 1500+(halfTurns-6)*400) + (RULES.flipPoints[flips] ?? 2700+(flips-3)*1200)
    + (grab ? 100+Math.min(2,grabTime)*200 : 0) + Math.max(0,air-.5)*100;
  if (halfTurns && flips) score *= 1.3;
  if ((halfTurns || flips) && grab) score *= 1.2;
  if (event.switchIn) score *= 1.1;
  if (event.switchOut) score *= 1.1;
  score *= ({heavy:.8,sketchy:.4,rough:.4,crash:0})[event.quality] ?? 1;
  return { name, score:Math.round(score), spin:halfTurns*180, flip:flips, grab, grabTime, air,
    drop:Math.max(0,finite(event.drop)), pop:event.pop === true, switchIn:event.switchIn === true,
    switchOut:event.switchOut === true, quality:event.quality ?? 'clean' };
}
