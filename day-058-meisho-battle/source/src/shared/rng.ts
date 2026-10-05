// 種つき乱数。同じ種なら、どの端末・サーバーでも同じ並びになる。
// 機能ごとに別の系列を使う（出題用・選択肢用・コンピューター用など）。系列は「元の種＋名前」から作るので、
// ある系列で乱数をいくつ使っても、ほかの系列の並びは変わらない。

/** 文字列から 32 ビットの数を作る（FNV-1a に murmur3 の仕上げを足して、似た文字列でも散らばるようにする） */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** mulberry32：0 以上 1 未満の数を返す関数を作る */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 種を 32 ビットの整数にそろえる（小数・負の数・大きすぎる数も受ける。数でなければ 0） */
export function toSeed(seed: number | string): number {
  if (typeof seed === 'string') return hashString(seed)
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0
}

/** 元の種と名前から、別の系列の種を作る（例：deriveSeed(seed, 'cpu', 3, 1)） */
export function deriveSeed(seed: number, ...labels: readonly (string | number)[]): number {
  return hashString(`${toSeed(seed)}|${labels.join('|')}`)
}

export interface Rng {
  /** この系列の種 */
  readonly seed: number
  /** 0 以上 1 未満 */
  next(): number
  /** 0 以上 maxExclusive 未満の整数 */
  int(maxExclusive: number): number
  /** min 以上 max 未満の小数 */
  range(min: number, max: number): number
  /** 確率 p で true */
  chance(p: number): boolean
  /** 1つ選ぶ（空の配列は誤り） */
  pick<T>(items: readonly T[]): T
  /** 混ぜた新しい配列を返す（元の配列は変えない） */
  shuffle<T>(items: readonly T[]): T[]
  /** 正規分布（平均・標準偏差）。いつも乱数を2つ使う */
  normal(mean: number, sd: number): number
  /** 名前つきの別の系列。この系列の使い具合に左右されない */
  fork(...labels: readonly (string | number)[]): Rng
}

export function createRng(seed: number | string): Rng {
  const base = toSeed(seed)
  const random = mulberry32(base)
  const rng: Rng = {
    seed: base,
    next: random,
    int(maxExclusive) {
      const max = Math.floor(maxExclusive)
      if (!(max >= 1)) return 0
      return Math.min(max - 1, Math.floor(random() * max))
    },
    range(min, max) {
      return min + (max - min) * random()
    },
    chance(p) {
      return random() < p
    },
    pick(items) {
      if (items.length === 0) throw new Error('rng.pick: 空の配列からは選べない')
      return items[rng.int(items.length)] as (typeof items)[number]
    },
    shuffle(items) {
      const out = items.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(i + 1)
        const tmp = out[i] as (typeof out)[number]
        out[i] = out[j] as (typeof out)[number]
        out[j] = tmp
      }
      return out
    },
    normal(mean, sd) {
      const u1 = 1 - random() // 0 を避ける（log(0) にしない）
      const u2 = random()
      return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    },
    fork(...labels) {
      return createRng(deriveSeed(base, ...labels))
    },
  }
  return rng
}
