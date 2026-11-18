// 部屋の「あいことば」（docs/05「部屋の決まり」）。4文字。
// 読み違えやすい文字（0・O・1・I・L）を除いた英大文字と数字から作る。名所バトルの roomcode.ts を写して、
// 乱数の受け取り方だけを「0以上 max 未満の整数を返す関数」に変えた（rng.ts はゲームの芯の担当なので頼らない）。

export const ROOM_CODE_LENGTH = 4
/** 使う文字：英大文字23字（I・L・O を除く）＋数字8字（0・1 を除く）＝31字 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const VALID = /^[A-HJKMNP-Z2-9]{4}$/

/** 0 以上 maxExclusive 未満の整数を返す乱数 */
export type RandomInt = (maxExclusive: number) => number

/** あいことばを作る（使用中なら、呼ぶ側が作り直す） */
export function generateRoomCode(randomInt: RandomInt): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)] ?? 'A'
  return code
}

/** 入力をそろえる：全角→半角、小文字→大文字、空白とハイフンを除く。文字列でなければ空文字 */
export function normalizeRoomCode(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.normalize('NFKC').replace(/[\s\-‐－ー]+/gu, '').toUpperCase()
}

/** そろえた後の形として正しいか（4文字・使う文字だけ） */
export function isValidRoomCode(code: unknown): code is string {
  return typeof code === 'string' && VALID.test(code)
}
