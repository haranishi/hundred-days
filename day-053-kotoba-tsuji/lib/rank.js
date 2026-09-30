// 番付。かかった時間（腕前ごとの目安 parSec との比）と助太刀の字数で決める。文は docs/COPY.md「結果」
// v2：助太刀の許容は、埋める字 b（level.blanks）に対する割合で決める。1字しかない盤で1字教われば大関ではない
import { getLevel } from './levels.js';

export const RANKS = Object.freeze([
  Object.freeze({ key: 'yokozuna', label: '横綱', line: '天下無双！ 江戸じゅうの評判でござる。' }),
  Object.freeze({ key: 'ozeki', label: '大関', line: '見事な腕前。横綱まであと一歩じゃ。' }),
  Object.freeze({ key: 'sekiwake', label: '関脇', line: 'なかなかの腕前でござる。' }),
  Object.freeze({ key: 'komusubi', label: '小結', line: 'よう粘った。次はもっと速く参ろう。' }),
  Object.freeze({ key: 'maegashira', label: '前頭', line: '解き切ったのが何より。精進あるのみ！' }),
]);

// 降参は位なし
export const MUNEN = Object.freeze({ key: 'munen', label: '無念', line: '無念…。されど、答えを知るのも修行のうち。' });

const byKey = (key) => RANKS.find((r) => r.key === key) ?? (key === MUNEN.key ? MUNEN : null);

export function rankOf(key) {
  return byKey(key);
}

// 位の高さ（横綱 0 が最上）。位でないもの（無念・未記録）は Infinity
export function rankOrder(key) {
  const i = RANKS.findIndex((r) => r.key === key);
  return i < 0 ? Infinity : i;
}

// 助太刀の許容（字数）：大関 floor(b×0.1)・関脇 floor(b×0.25)・小結 floor(b×0.5)
export function hintAllowance(levelId) {
  const lv = getLevel(levelId);
  const b = lv?.blanks > 0 ? lv.blanks : 1;
  return { ozeki: Math.floor(b * 0.1), sekiwake: Math.floor(b * 0.25), komusubi: Math.floor(b * 0.5) };
}

export function computeRank({ levelId, seconds, hintsLetters = 0, gaveUp = false }) {
  if (gaveUp) return { ...MUNEN };
  const lv = getLevel(levelId);
  const par = lv?.parSec > 0 ? lv.parSec : 1;
  const ratio = Math.max(0, Number(seconds) || 0) / par;
  const hints = Math.max(0, Number(hintsLetters) || 0);
  const allow = hintAllowance(levelId);
  let key = 'maegashira';
  if (hints === 0 && ratio <= 1) key = 'yokozuna';
  else if (hints <= allow.ozeki && ratio <= 1.5) key = 'ozeki';
  else if (hints <= allow.sekiwake && ratio <= 2.5) key = 'sekiwake';
  else if (hints <= allow.komusubi) key = 'komusubi';
  return { ...byKey(key) };
}
