import type { CharacterAsset, CharacterSlot } from '../types/character'
import { toCharacterAsset } from './imageLoader'

const SAMPLE_SPRITES: ReadonlyArray<readonly [CharacterSlot, string]> = [
  ['mouthClosed', 'mouth-closed.png'],
  ['mouthSmall', 'mouth-small.png'],
  ['mouthOpen', 'mouth-open.png'],
  ['blink', 'blink.png'],
]

async function sampleFile(name: string, type: string, displayName = name): Promise<File> {
  const response = await fetch(`${import.meta.env.BASE_URL}sample/${name}`)
  if (!response.ok) throw new Error('サンプルを読み込めませんでした。再読み込みしてお試しください。')
  return new File([await response.blob()], displayName, { type })
}

export async function loadSampleCharacter(): Promise<CharacterAsset[]> {
  const loaded = await Promise.allSettled(SAMPLE_SPRITES.map(async ([slot, name]) =>
    toCharacterAsset(slot, await sampleFile(name, 'image/png')),
  ))
  const failed = loaded.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') {
    for (const result of loaded) {
      if (result.status === 'fulfilled') URL.revokeObjectURL(result.value.objectUrl)
    }
    throw new Error('サンプルのキャラクターを読み込めませんでした。再読み込みしてお試しください。')
  }
  return loaded.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
}

export function loadSampleAudioFile(): Promise<File> {
  return sampleFile('demo-tone.wav', 'audio/wav', '動作確認用テスト音.wav')
}
