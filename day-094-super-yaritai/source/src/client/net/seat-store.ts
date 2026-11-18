// 再接続の札を、端末のタブの中だけに覚える（docs/05「切断」）。sessionStorage を使う。
// 読み込み直したタブで同じ部屋に戻るために使う。使えない端末（プライベートモードなど）では覚えないだけ。

import { TOKEN_PATTERN } from '../../shared/protocol/messages'
import { isValidRoomCode } from '../../shared/roomcode'

export interface SeatRecord {
  code: string
  token: string
}

export interface SeatStore {
  load(): SeatRecord | null
  save(seat: SeatRecord): void
  clear(): void
}

const KEY = 'sy.online.seat'

export function sessionSeatStore(): SeatStore {
  return {
    load() {
      try {
        const raw = globalThis.sessionStorage?.getItem(KEY)
        if (!raw) return null
        const v: unknown = JSON.parse(raw)
        if (!v || typeof v !== 'object') return null
        const { code, token } = v as Record<string, unknown>
        return isValidRoomCode(code) && typeof token === 'string' && TOKEN_PATTERN.test(token) ? { code, token } : null
      } catch {
        return null
      }
    },
    save(seat) {
      try {
        globalThis.sessionStorage?.setItem(KEY, JSON.stringify({ code: seat.code, token: seat.token }))
      } catch {
        // 覚えられなくても遊べる（読み込み直したときに戻れないだけ）
      }
    },
    clear() {
      try {
        globalThis.sessionStorage?.removeItem(KEY)
      } catch {
        // 何もしない
      }
    },
  }
}

/** 覚えない（相手探しの部屋など、読み込み直して戻る必要が薄いとき・試験） */
export function memorySeatStore(): SeatStore {
  let seat: SeatRecord | null = null
  return {
    load: () => seat,
    save: (s) => {
      seat = { ...s }
    },
    clear: () => {
      seat = null
    },
  }
}
