// 8問の合計点で決まる称号（docs/03「称号」）。

export interface TitleRank {
  /** この点以上でこの称号 */
  min: number
  title: string
}

/** 点の高い順 */
export const TITLES: readonly TitleRank[] = [
  { min: 6000, title: '世界の名所マスター' },
  { min: 4000, title: 'ベテラン旅人' },
  { min: 2000, title: '名所ハンター' },
  { min: -Infinity, title: '観光見習い' },
]

/** 合計点の称号。マイナスや数でない値は「観光見習い」 */
export function titleFor(score: number): string {
  if (!Number.isFinite(score)) return '観光見習い'
  return TITLES.find((t) => score >= t.min)?.title ?? '観光見習い'
}
