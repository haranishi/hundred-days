// 推測されてはいけない値（札・あいことば・試合の種）を作る。Web Crypto の getRandomValues を使う（Workers・Node のどちらにもある）。

import { generateRoomCode } from '../shared/roomcode'

/** 0 以上 maxExclusive 未満の整数（偏りが出ないよう、端数の範囲は引き直す） */
export function randomInt(maxExclusive: number): number {
  const max = Math.floor(maxExclusive)
  if (!(max >= 1)) return 0
  const limit = Math.floor(0x100000000 / max) * max
  const a = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(a)
    const v = a[0] ?? 0
    if (v < limit) return v % max
  }
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** バイト列を base64url（= で埋めない）にする */
export function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += B64URL[b0 >> 2]
    out += B64URL[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    if (b1 !== undefined) out += B64URL[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    if (b2 !== undefined) out += B64URL[b2 & 63]
  }
  return out
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return bytes
}

/** 再接続の札・相手探しの札。24バイト（192ビット）＝32文字。protocol の TOKEN_PATTERN に合う */
export function randomToken(): string {
  return toBase64Url(randomBytes(24))
}

/** 接続ごとの印（置き換えの見分けに使う） */
export function randomConnId(): string {
  return toBase64Url(randomBytes(9))
}

/** 32ビットの乱数（試合の種） */
export function randomUint32(): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0] ?? 0
}

/** あいことばの候補を1つ作る（使用中かどうかは部屋に聞く） */
export function randomRoomCode(): string {
  return generateRoomCode(randomInt)
}
