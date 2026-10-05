// 端末に覚える設定（app-context.ts の Settings）。localStorage は使えない端末（プライベートモード・
// 容量切れ・アプリの中の表示など）があるので、読み書きはすべて try/catch で包み、だめならその場の記憶だけで動かす。

import type { Settings } from './app-context'

const PREFIX = 'mmb.'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function createSettings(): Settings {
  const memory = new Map<string, unknown>()
  return {
    get<T>(key: string, fallback: T): T {
      if (memory.has(key)) return memory.get(key) as T
      try {
        const raw = storage()?.getItem(PREFIX + key)
        if (raw === null || raw === undefined) return fallback
        const value = JSON.parse(raw) as T
        memory.set(key, value)
        return value
      } catch {
        return fallback
      }
    },
    set<T>(key: string, value: T): void {
      memory.set(key, value)
      try {
        storage()?.setItem(PREFIX + key, JSON.stringify(value))
      } catch {
        // 覚えられない端末では、このタブの間だけ覚える
      }
    },
  }
}

/** 選んだ値が決まった候補の中にあるときだけ使う（壊れた値や古い値を読まない） */
export function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}
