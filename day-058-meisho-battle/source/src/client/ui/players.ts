// プレイヤーの見分け方（docs/02 ⑤）：1P朱●・2P青緑▲・3Pからし■・4P藍◆。
// 色だけに頼らず、形と番号でも区別する。

import type { PlayerSlot, PlayerState } from '../../shared/types'
import { s } from './dom'

export interface PlayerLook {
  color: string
  /** 色の上に載せる文字の色（からしは明るいので紺） */
  ink: string
  shape: 'circle' | 'triangle' | 'square' | 'diamond'
  /** 読み上げ用の形の名前 */
  shapeName: string
}

export const PLAYER_LOOKS: readonly PlayerLook[] = [
  { color: '#E2483D', ink: '#FFFFFF', shape: 'circle', shapeName: 'まる' },
  { color: '#1E9A8A', ink: '#FFFFFF', shape: 'triangle', shapeName: 'さんかく' },
  { color: '#F2B544', ink: '#1F2A44', shape: 'square', shapeName: 'しかく' },
  { color: '#4B5BD7', ink: '#FFFFFF', shape: 'diamond', shapeName: 'ひしがた' },
]

export function lookOf(slot: PlayerSlot | number): PlayerLook {
  return PLAYER_LOOKS[slot] ?? (PLAYER_LOOKS[0] as PlayerLook)
}

/** 「1P」の形の番号 */
export function slotLabel(slot: number): string {
  return `${slot + 1}P`
}

/** 形の印（SVG）。fill は色、stroke は縁。読み上げでは番号と名前を別に読むので隠す */
export function shapeIcon(slot: number, size = 18, color?: string): SVGSVGElement {
  const look = lookOf(slot)
  const fill = color ?? look.color
  const shape = (() => {
    switch (look.shape) {
      case 'circle':
        return s('circle', { cx: 10, cy: 10, r: 8 })
      case 'triangle':
        return s('path', { d: 'M10 1.8 18.6 17.4H1.4Z' })
      case 'square':
        return s('rect', { x: 2.5, y: 2.5, width: 15, height: 15, rx: 1.5 })
      case 'diamond':
        return s('path', { d: 'M10 1 19 10 10 19 1 10Z' })
    }
  })()
  shape.setAttribute('fill', fill)
  shape.setAttribute('stroke', '#FFFFFF')
  shape.setAttribute('stroke-width', '1.6')
  shape.setAttribute('stroke-linejoin', 'round')
  return s('svg', { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': 'true', focusable: 'false', class: 'shape-icon' }, shape)
}

/** 画面に出す名前。ネットでは自分に「あなた」を添える */
export function displayName(p: PlayerState, selfId: string | null): string {
  if (selfId !== null && p.id === selfId) return p.name ? `${p.name}（あなた）` : 'あなた'
  return p.name || slotLabel(p.slot)
}

/** 読み上げ用の呼び名（例：1P あなた） */
export function spokenName(p: PlayerState, selfId: string | null): string {
  const name = displayName(p, selfId)
  return name === slotLabel(p.slot) ? name : `${slotLabel(p.slot)} ${name}`
}
