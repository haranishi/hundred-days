// 直前のゲームで出た名所を端末に覚える（次のゲームでなるべく避けるため。docs/03「出題と選択肢」）。
// 覚え先は Settings（localStorage を try/catch で包んだもの）。使えない端末では、このタブの間だけ覚える。

import { isLandmarkId } from '../../shared/landmarks'
import type { Settings } from '../ui/app-context'

export interface RecentStore {
  load(): string[]
  save(ids: readonly string[]): void
}

const KEY = 'recentLandmarks'
/** 覚える数の上限（壊れた値で大きくならないように） */
const MAX = 16

export function settingsRecentStore(settings: Settings): RecentStore {
  return {
    load(): string[] {
      const raw = settings.get<unknown>(KEY, [])
      return Array.isArray(raw) ? raw.filter(isLandmarkId).slice(0, MAX) : []
    },
    save(ids: readonly string[]): void {
      settings.set(KEY, ids.filter(isLandmarkId).slice(0, MAX))
    },
  }
}

/** 覚えない（テストなどで使う） */
export function memoryRecentStore(): RecentStore {
  let ids: string[] = []
  return {
    load: () => [...ids],
    save: (next) => {
      ids = [...next]
    },
  }
}
