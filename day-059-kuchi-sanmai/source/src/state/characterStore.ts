import { create } from 'zustand'
import { isCharacterReady, type CharacterAsset, type CharacterAssets, type CharacterSlot, type CharacterState } from '../types/character'

interface CharacterStore extends CharacterState {
  setAsset: (asset: CharacterAsset) => void
  removeAsset: (slot: CharacterSlot) => void
  clear: () => void
}

function revoke(asset: CharacterAsset | undefined) {
  if (asset && typeof URL !== 'undefined' && asset.objectUrl.startsWith('blob:')) {
    URL.revokeObjectURL(asset.objectUrl)
  }
}

export const useCharacterStore = create<CharacterStore>()((set) => ({
  assets: {},
  setAsset: (asset) =>
    set((s) => {
      const prev = s.assets[asset.slot]
      if (prev && prev.objectUrl !== asset.objectUrl) revoke(prev)
      return { assets: { ...s.assets, [asset.slot]: asset } }
    }),
  removeAsset: (slot) =>
    set((s) => {
      revoke(s.assets[slot])
      const next: CharacterAssets = { ...s.assets }
      delete next[slot]
      return { assets: next }
    }),
  clear: () =>
    set((s) => {
      for (const asset of Object.values(s.assets)) revoke(asset)
      return { assets: {} }
    }),
}))

export const selectIsCharacterReady = (s: CharacterStore) => isCharacterReady(s.assets)
export const selectHasBlink = (s: CharacterStore) => Boolean(s.assets.blink)
