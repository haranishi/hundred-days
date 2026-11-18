/**
 * 決まった種から決まった並びを作る乱数（mulberry32）。
 * 機能ごとに別の系列（stream）を使う。あとから足した機能が乱数を引いても、既存の配置が変わらないようにするため（docs/06）。
 */

export interface Rng {
  /** 0 以上 1 未満 */
  next(): number;
  range(min: number, max: number): number;
  /** min 以上 max 以下の整数 */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

/** 文字列を32bitの値にする（FNV-1a）。系列の名前を種に混ぜるのに使う */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from empty list');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    chance: (p) => next() < p,
  };
}

/** 系列の名前。新しい機能は新しい名前を足す（既存の名前の並びは変えない） */
export type RngStream = 'props' | 'cpu' | 'clerks' | 'shoppers' | 'fx' | 'match' | (string & {});

export function streamRng(seed: number, stream: RngStream): Rng {
  return createRng((seed ^ hashString(stream)) >>> 0);
}
