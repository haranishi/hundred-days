// OWNER: audio-tools
// 音の生成の乱数。音ごと・変化ごとに別の系列を作るので、1つの音の作り方を変えても他の音は同じ出力のまま残る。
// 仕組みは src/core/rng.ts と同じ考え方（sfc32 と文字列のハッシュ）だが、Node の道具だけで完結させるため写しを持たない小さな実装にした。

/** 文字列の 32bit ハッシュ（FNV-1a）。 */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) | 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    for (let i = 0; i < 12; i++) this.uint();
  }

  uint() {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** [0,1) */
  next() {
    return this.uint() / 4294967296;
  }

  /** [lo,hi) */
  range(lo, hi) {
    return lo + (hi - lo) * this.next();
  }

  /** 両端を含む整数 */
  int(lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** [-1,1) の一様乱数 */
  bi() {
    return this.next() * 2 - 1;
  }

  chance(p) {
    return this.next() < p;
  }

  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }

  /** 平均 0・標準偏差 1 の正規乱数（Box–Muller） */
  gauss() {
    const u = Math.max(1e-12, this.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }

  /** 対数で一様（周波数や時間の散らしに使う） */
  logRange(lo, hi) {
    return lo * (hi / lo) ** this.next();
  }
}

/** 音の名前と変化の番号から系列を作る。seed は build.mjs の --seed（既定 20260930）。 */
export function rngFor(seed, name, variant = 0) {
  return new Rng((hashString(name) ^ Math.imul(seed | 0, 0x2c1b3c6d) ^ Math.imul(variant + 1, 0x297a2d39)) >>> 0);
}
