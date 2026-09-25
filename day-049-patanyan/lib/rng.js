// mulberry32。状態が32bit整数1つなので、同じシードなら端末やブラウザが違っても同じ列になる
export function mulberry32(seed) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(random = Math.random) {
  return Math.floor(random() * 4294967296) >>> 0;
}
