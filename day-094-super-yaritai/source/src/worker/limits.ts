// あいことばの取り直し。Cloudflare に依存しない純粋な関数（tests/unit/worker/limits.test.ts で確かめる）。

/** あいことばを作り直す回数の上限。31^4 ≒ 92万通りなので、ふつうは1回目で決まる */
export const MAX_CODE_TRIES = 12

/**
 * あいことばを決める。pick で候補を作り、tryReserve（部屋に「使用中でなければ確保」を頼む）が true を返したら決まり。
 * 使用中なら作り直す。上限まで決まらなければ null。
 */
export async function allocateRoomCode(
  pick: () => string,
  tryReserve: (code: string) => Promise<boolean>,
  maxTries: number = MAX_CODE_TRIES,
): Promise<string | null> {
  const tried = new Set<string>()
  for (let i = 0; i < maxTries; i++) {
    const code = pick()
    if (tried.has(code)) continue
    tried.add(code)
    if (await tryReserve(code)) return code
  }
  return null
}
