// OWNER: core
// 種つきの乱数（mulberry32）。機能ごとに別の系列を作る。
// 系列を分けるのは、ある機能で乱数を引く回数が変わっても、ほかの機能の並びがずれないようにするため。

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) の一様乱数。 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

/** 種と系列の名前から、その系列の種を作る（FNV-1a で名前を混ぜる）。 */
export function streamSeed(seed: number, name: string): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

export function rngStream(seed: number, name: string): Rng {
  return new Rng(streamSeed(seed, name));
}
