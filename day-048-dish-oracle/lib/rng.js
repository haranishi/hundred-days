// 決定的な乱数。同じ種・同じ手数なら同じ質問になるので、「ひとつ戻る」で質問がすり替わらない。
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

// 種と手数を混ぜて、その局面だけの乱数を作る
export function rngFor(seed, ...parts) {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (const part of parts) {
    h = Math.imul(h ^ (part >>> 0), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
  }
  return mulberry32(h);
}
