import { EXAMPLES, normalizeInput, type ManualInput } from '../domain/manual'
import { decodeShare } from './sharing'

export const STORAGE_KEY = 'day061:manual-spec:v1'
export type SavedPlan = { version: 1; values: ManualInput; color: 'white' | 'black' }
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function readPlan(storage: StorageLike | null, hash = ''): { plan: SavedPlan; notice: string; imported: boolean } {
  const fallback: SavedPlan = { version: 1, values: { ...EXAMPLES[0]!.values }, color: 'white' }
  let plan = fallback
  let notice = ''
  try {
    const text = storage?.getItem(STORAGE_KEY)
    if (text && text.length <= 24000) {
      const parsed = JSON.parse(text)
      const values = normalizeInput(parsed?.values)
      if (parsed?.version === 1 && values && ['white', 'black'].includes(parsed.color)) plan = { version: 1, values, color: parsed.color }
      else notice = '保存データを読み直せなかったため、架空の作例を開きました。'
    } else if (text) notice = '保存データを読み直せなかったため、架空の作例を開きました。'
  } catch { notice = '端末の保存データを読み込めませんでした。この画面で入力とメモ保存はできます。' }
  if (hash.startsWith('#spec')) {
    const values = decodeShare(hash)
    if (values) return { plan: { version: 1, values, color: 'white' }, notice: '共有された仕様を読み込みました。価格は共有URLに含まれていません。', imported: true }
    notice = '共有リンクを読み込めませんでした。保存した構成、または架空の作例を表示しています。'
  }
  return { plan, notice, imported: false }
}
export function writePlan(storage: StorageLike | null, plan: SavedPlan): boolean {
  try { if (!storage) return false; storage.setItem(STORAGE_KEY, JSON.stringify(plan)); return true } catch { return false }
}
export function browserStorage(): StorageLike | null {
  try { return window.localStorage } catch { return null }
}
