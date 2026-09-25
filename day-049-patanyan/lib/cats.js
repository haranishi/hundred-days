// 魚の合計で順に仲間になる。最初の1匹だけは最初から選べる
export const CATS = Object.freeze([
  { id: 'chatora', name: '茶トラ', need: 0 },
  { id: 'hachiware', name: 'ハチワレ', need: 3 },
  { id: 'kuro', name: '黒', need: 8 },
  { id: 'shiro', name: '白', need: 15 },
  { id: 'sabatora', name: 'サバトラ', need: 25 },
  { id: 'mike', name: '三毛', need: 40 },
]);

export function catById(id) {
  return CATS.find((c) => c.id === id) || CATS[0];
}

export function isUnlocked(id, fishTotal) {
  const cat = CATS.find((c) => c.id === id);
  return !!cat && fishTotal >= cat.need;
}

export function unlockedIds(fishTotal) {
  return CATS.filter((c) => fishTotal >= c.need).map((c) => c.id);
}

export function nextUnlock(fishTotal) {
  const cat = CATS.find((c) => fishTotal < c.need);
  return cat ? { cat, remaining: cat.need - fishTotal } : null;
}

export function newlyUnlocked(before, after) {
  return CATS.filter((c) => before < c.need && after >= c.need);
}
