// 相手探しの行列の組み合わせ。Cloudflare に依存しない純粋な関数（tests/unit/worker/lobby.test.ts で確かめる）。

export interface Waiter {
  /** 接続ごとの印 */
  key: string
  /** 行列に入った時刻 */
  joinedAt: number
}

/**
 * 待っている人を、来た順に2人ずつ組にする。余った1人は rest に残る。
 * 同じ時刻なら key の順（どの順で渡されても同じ組になるように）。
 */
export function pairWaiters<T extends Waiter>(waiters: readonly T[]): { pairs: [T, T][]; rest: T[] } {
  const sorted = [...waiters].sort((a, b) => a.joinedAt - b.joinedAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const pairs: [T, T][] = []
  for (let i = 0; i + 1 < sorted.length; i += 2) pairs.push([sorted[i] as T, sorted[i + 1] as T])
  return { pairs, rest: sorted.length % 2 === 1 ? [sorted[sorted.length - 1] as T] : [] }
}
