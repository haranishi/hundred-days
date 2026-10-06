// キャラクター素材（スプライト方式）の型契約。
// 口3枚（必須）＋まばたき1枚（任意）。全画像は同じキャンバス・同じ位置で描かれている前提だが、
// 多少サイズが違っても「中央揃え・同じ表示高さ」で描くので破綻しない（→ lib/render）。

export type MouthState = 'closed' | 'small' | 'open'

export type CharacterSlot = 'mouthClosed' | 'mouthSmall' | 'mouthOpen' | 'blink'

export const CHARACTER_SLOTS: readonly CharacterSlot[] = ['mouthClosed', 'mouthSmall', 'mouthOpen', 'blink']

export const REQUIRED_SLOTS: readonly CharacterSlot[] = ['mouthClosed', 'mouthSmall', 'mouthOpen']

export const MOUTH_SLOT: Readonly<Record<MouthState, CharacterSlot>> = {
  closed: 'mouthClosed',
  small: 'mouthSmall',
  open: 'mouthOpen',
}

export const SLOT_LABEL: Readonly<Record<CharacterSlot, { ja: string; en: string; required: boolean }>> = {
  mouthClosed: { ja: '口を閉じた画像', en: 'Closed Mouth', required: true },
  mouthSmall: { ja: '少し開けた画像', en: 'Small Mouth', required: true },
  mouthOpen: { ja: '大きく開けた画像', en: 'Open Mouth', required: true },
  blink: { ja: '目を閉じた画像', en: 'Blink', required: false },
}

/** 読み込み済みの1枚。image は decode 済みで即 drawImage できる状態。 */
export interface CharacterAsset {
  slot: CharacterSlot
  fileName: string
  /** URL.createObjectURL(file)。差し替え・削除時に revoke する（所有者は characterStore）。 */
  objectUrl: string
  image: HTMLImageElement
  width: number
  height: number
}

export type CharacterAssets = Partial<Record<CharacterSlot, CharacterAsset>>

export interface CharacterState {
  assets: CharacterAssets
}

export function isCharacterReady(assets: CharacterAssets): boolean {
  return REQUIRED_SLOTS.every((slot) => Boolean(assets[slot]))
}
