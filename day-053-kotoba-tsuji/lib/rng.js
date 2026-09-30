// 乱数と seed。生成器は mulberry32 と hashSeed だけを使い、同じ seed から必ず同じ盤を出す。

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

// FNV-1a（32bit）。1字違いの seed でも別の盤になるよう、最後に攪拌して下位ビットの偏りを消す
export function hashSeed(str) {
  const s = String(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function shuffle(arr, rand) {
  const a = Array.from(arr);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

// 新しい盤の seed（base36・6〜8字）。果たし状の書式 [0-9a-z]{4,12} に収まる。生成器の中では使わない
export function randomSeed() {
  const vals = new Uint32Array(9);
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(vals);
  } else {
    for (let i = 0; i < vals.length; i++) vals[i] = Math.floor(Math.random() * 4294967296);
  }
  const len = 6 + (vals[0] % 3);
  let s = '';
  for (let i = 0; i < len; i++) s += B36[vals[i + 1] % 36];
  return s;
}
