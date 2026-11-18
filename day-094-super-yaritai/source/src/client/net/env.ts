// 端末側のネットの道具を1か所に集める。単体試験では偽物に、Node の試験では Node の WebSocket に差し替える。
import { isAppOrigin, isLocalHostname, WORKER_ORIGIN } from '../../shared/hosts'

/** WebSocket のうち、ここで使う部分だけ */
export interface SocketLike {
  readonly readyState: number
  binaryType: 'blob' | 'arraybuffer'
  send(data: string | ArrayBuffer | Uint8Array): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (ev: { data?: unknown; code?: number; reason?: string }) => void,
  ): void
}

export interface NetEnv {
  /** WebSocket を開く */
  openSocket(url: string): SocketLike
  /** 端末の時計（ミリ秒・戻らない） */
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
  /** ws://ホスト または wss://ホスト */
  wsBase: string
  /** http(s)://ホスト（部屋づくりの POST に使う） */
  httpBase: string
  fetch(input: string, init?: RequestInit): Promise<Response>
  /** 画面が裏から戻ったときに呼ぶ。戻り値で登録をやめる */
  onVisible(cb: () => void): () => void
  /** 通信が戻ったときに呼ぶ。戻り値で登録をやめる */
  onOnline(cb: () => void): () => void
}

export const SOCKET_OPEN = 1

export function resolveApiOrigin(loc: { origin: string; hostname: string; search: string }): string {
  if (isAppOrigin(loc.origin)) return WORKER_ORIGIN
  // 公開画面の接続先を問い合わせ文字列で変えられると、別のホストへ通信を誘導される。
  if (isLocalHostname(loc.hostname)) {
    const api = new URLSearchParams(loc.search).get('api')
    if (api) {
      try {
        const url = new URL(api)
        if ((url.protocol === 'http:' || url.protocol === 'https:') && isLocalHostname(url.hostname)) return url.origin
      } catch {
        // 手入力の壊れた URL で、通常の接続先まで使えなくしない。
      }
    }
  }
  return loc.origin
}

/** ブラウザで使う既定の道具 */
export function browserNetEnv(): NetEnv {
  const loc = globalThis.location
  const httpBase = loc ? resolveApiOrigin(loc) : 'http://localhost'
  return {
    openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    now: () => performance.now(),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
    wsBase: httpBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:'),
    httpBase,
    fetch: (input, init) => globalThis.fetch(input, init),
    onVisible(cb) {
      if (typeof document === 'undefined') return () => {}
      const handler = (): void => {
        if (document.visibilityState === 'visible') cb()
      }
      document.addEventListener('visibilitychange', handler)
      return () => document.removeEventListener('visibilitychange', handler)
    },
    onOnline(cb) {
      if (typeof window === 'undefined') return () => {}
      window.addEventListener('online', cb)
      return () => window.removeEventListener('online', cb)
    },
  }
}

export function resolveNetEnv(partial?: Partial<NetEnv>): NetEnv {
  return { ...browserNetEnv(), ...partial }
}

export function isSocketOpen(s: SocketLike | null): s is SocketLike {
  return s !== null && s.readyState === SOCKET_OPEN
}
