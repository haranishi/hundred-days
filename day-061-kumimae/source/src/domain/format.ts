/** 表示用の数字の書式（画面と判定の文で共通に使う） */
import { COLOR_LABELS } from './types'

/** 色の表示名（types.ts の COLOR_LABELS）。「black/silver」は1色ずつ訳して「/」でつなぐ。知らない色はそのまま出す */
export function colorName(color: string): string {
  return color
    .split('/')
    .map((c) => COLOR_LABELS[c.trim().toLowerCase()] ?? c.trim())
    .join('/')
}

/** mm。整数ならそのまま、そうでなければ小数1桁（-0 は 0） */
export function formatMm(mm: number): string {
  const r = Math.round(mm * 10) / 10
  return (Object.is(r, -0) ? 0 : r).toString()
}

export function formatW(watts: number): string {
  return `${Math.round(watts)}W`
}

const yen = new Intl.NumberFormat('ja-JP')

/** 123456 → 「123,456円」 */
export function formatYen(value: number): string {
  return `${yen.format(Math.round(value))}円`
}

/** 0.314 → 「31%」（割合は 0〜1 で受け取る） */
export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`
}
