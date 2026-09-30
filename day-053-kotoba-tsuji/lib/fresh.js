// 新しい局の seed 選び（v2-r3）。同じ端末で最近出た答え（recent）と重ならない盤を選ぶ。
// 盤そのものは seed だけで決まる（果たし状は同じ盤のまま）。recent は「候補のどの seed を選ぶか」にだけ効く。
import { generatePuzzle } from './generator.js';

// 盤の答え（Word.answer）を並べる。storage の pushRecent に渡す形
export function answersOf(puzzle) {
  return Array.isArray(puzzle?.words) ? puzzle.words.map((w) => w.answer) : [];
}

/**
 * 候補の seed のうち、盤の答えと recent の重なりが最も少ない seed を返す（同点は先の候補）。候補が無ければ null。
 * 純粋関数：同じ引数なら同じ結果。recent が空なら盤を組まずに先頭の候補を返す
 */
export function pickFreshSeed({ level, words, seeds, recent = [] } = {}) {
  if (!Array.isArray(seeds) || seeds.length === 0) return null;
  const seen = new Set(Array.isArray(recent) ? recent.filter((a) => typeof a === 'string' && a) : []);
  if (seen.size === 0) return seeds[0];
  let best = seeds[0];
  let bestOverlap = Infinity;
  for (const seed of seeds) {
    let overlap = 0;
    for (const answer of answersOf(generatePuzzle({ level, seed, words }))) if (seen.has(answer)) overlap++;
    if (overlap < bestOverlap) {
      best = seed;
      bestOverlap = overlap;
      if (overlap === 0) break;
    }
  }
  return best;
}
