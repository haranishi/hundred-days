// 画面に出す数と状態の書き方を1か所にそろえる（UI採点 M9）。
// 時間は「0:00」、大きさは「1,080 × 1,920」、倍率は「1.00×」、レベルは小数2桁。

export function formatClock(seconds: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export const formatDimensions = (width: number, height: number): string =>
  `${width.toLocaleString('ja-JP')} × ${height.toLocaleString('ja-JP')}`

export const formatTimes = (value: number): string => `${value.toFixed(2)}×`

export const formatLevel = (value: number): string => value.toFixed(2)

/** 口の状態は、素材の名前（口とじ・口・小・口・大）に合わせて短く出す。内部の値（closed など）は変えない */
export const MOUTH_TEXT = { closed: 'とじ', small: '小', open: '大' } as const
