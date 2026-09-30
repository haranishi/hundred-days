// 腕前。v2 は難しさを「埋める字」（blanks＝空いた辻の数）で約束する。盤の組み方は words・crossings で決める。
// blanks ≦ crossings を保つ（免許皆伝は辻をすべて空ける）。parSec は v2 の仮の値（体験評価で見直す）。

function level(def) {
  return Object.freeze({ ...def, tiers: Object.freeze([...def.tiers]), tierWeights: Object.freeze({ ...def.tierWeights }) });
}

export const LEVELS = Object.freeze([
  level({
    id: 1, key: 'tenarai', name: '手習い', reading: 'てならい',
    words: 5, crossings: 4, blanks: 1, maxW: 7, maxH: 7,
    tiers: [1], tierWeights: { 1: 1 },
    minLen: 2, maxLen: 5, maxTwoLetter: 1, parSec: 30,
  }),
  level({
    id: 2, key: 'ichininmae', name: '一人前', reading: 'いちにんまえ',
    words: 8, crossings: 9, blanks: 7, maxW: 9, maxH: 9,
    tiers: [1, 2], tierWeights: { 1: 2, 2: 1 },
    minLen: 2, maxLen: 6, maxTwoLetter: 2, parSec: 150,
  }),
  level({
    id: 3, key: 'menkyokaiden', name: '免許皆伝', reading: 'めんきょかいでん',
    words: 12, crossings: 15, blanks: 15, maxW: 11, maxH: 11,
    tiers: [1, 2, 3], tierWeights: { 1: 1, 2: 2, 3: 2 },
    minLen: 2, maxLen: 7, maxTwoLetter: 3, parSec: 360,
  }),
]);

// id（数か数字の文字列）か LEVELS の要素を受け取り、要素を返す。見つからなければ null
export function getLevel(idOrLevel) {
  if (idOrLevel && typeof idOrLevel === 'object') return idOrLevel;
  const id = Number(idOrLevel);
  return LEVELS.find((lv) => lv.id === id) ?? null;
}
