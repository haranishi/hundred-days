// OWNER: core
// 乱数は機能ごとに別の系列にする。ある機能が引く回数を変えても、
// 別の機能の結果（例：建物の並び）が組み変わらないようにするため。

/** 文字列の 32bit ハッシュ（FNV-1a）。系列の名前から種を作るのに使う。 */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 整数の並びを 32bit に混ぜる（murmur3 の仕上げ関数を順に通す）。 */
export function hashInts(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const value of values) {
    let k = Math.imul(value | 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= values.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 整数の並びから [0,1) の値を作る。系列を持たない一回きりの判断に使う。 */
export function hash01(...values: number[]): number {
  return hashInts(...values) / 4294967296;
}

/** sfc32 による疑似乱数。状態は4つの 32bit 整数。 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    // splitmix32 で種を4つに広げる
    let s = seed >>> 0;
    const next = (): number => {
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
    for (let i = 0; i < 12; i++) this.nextUint();
  }

  nextUint(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** [0,1) */
  next(): number {
    return this.nextUint() / 4294967296;
  }

  /** [min,max) */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** [min,max] の整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: 空の配列');
    return items[Math.floor(this.next() * items.length)];
  }

  /** 重み付きの選択。weights と items は同じ長さ。 */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return items[0];
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }
}

/**
 * 機能ごとの乱数系列を作る。name は「city.lots」のような機能名、keys は区画 id など。
 * 同じ (seed, name, keys) なら必ず同じ系列になり、ほかの系列を引いても影響を受けない。
 */
export function stream(seed: number, name: string, ...keys: number[]): Rng {
  return new Rng(hashInts(seed, hashString(name), ...keys));
}
