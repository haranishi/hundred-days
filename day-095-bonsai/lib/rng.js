// 決まった種から、いつも同じ乱数の列を作る。盆栽の形・質感・葉の並びは、すべてこの乱数から決まる。
// 画面の見た目を決める所で Math.random を使わない（同じ種・同じ操作なら、同じ姿になるため）。

/** 文字列を32ビットの整数にする（FNV-1a）。 */
export function hashString(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32。状態は1つの32ビット整数。返す関数は [0,1) の小数を返す。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 乱数の道具。state() で状態（32ビット整数）を取り出し、setState で戻せる。
 * fork(label) は、親の状態に触れず、ラベルごとに独立した別の列を作る
 * （あとから機能を足しても、既存の機能の乱数の列は変わらない）。
 */
export function createRng(seed) {
  let s = seed >>> 0;
  const raw = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    seed: seed >>> 0,
    next: raw,
    range: (a, b) => a + (b - a) * raw(),
    int: (a, b) => a + Math.floor(raw() * (b - a + 1)),
    chance: (p) => raw() < p,
    pick: (list) => list[Math.floor(raw() * list.length)],
    /** 平均0・標準偏差1に近い値（Box-Muller）。 */
    normal: () => {
      const u = Math.max(raw(), 1e-12);
      const v = raw();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    state: () => s >>> 0,
    setState: (value) => { s = value >>> 0; },
    fork: (label) => createRng((hashString(label) ^ Math.imul(seed >>> 0, 0x9e3779b1)) >>> 0),
  };
  return rng;
}
