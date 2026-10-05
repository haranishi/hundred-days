// ひとりで・ふたりでの設定。選んだ値は端末に覚え、次に開いたときの初めの値にする。

import { CPU_LEVEL_NAMES, CPU_LEVEL_ORDER } from '../../../shared/cpu'
import type { CpuLevel, Scope } from '../../../shared/types'
import type { AppContext } from '../app-context'
import { h } from '../dom'
import { lookOf, shapeIcon } from '../players'
import { pick } from '../settings-store'
import { menuScreen, radioGroup, type ChoiceOption } from './menu'

export const SCOPES: readonly Scope[] = ['japan', 'world', 'all']

export const SCOPE_OPTIONS: readonly ChoiceOption<Scope>[] = [
  { value: 'japan', label: '日本' },
  { value: 'world', label: '世界' },
  { value: 'all', label: 'ぜんぶ' },
]

const LEVEL_SUB: Readonly<Record<CpuLevel, string>> = {
  minarai: 'のんびり押す。初めての人に',
  veteran: '色が付く前に押してくる',
  densetsu: '白い模型のうちに当ててくる',
}

function startButton(onStart: () => void): HTMLButtonElement {
  return h('button', { type: 'button', class: 'btn btn-primary btn-block btn-start', 'data-action': 'start', on: { click: onStart } }, 'はじめる')
}

export const createSoloScreen = menuScreen({
  name: 'solo',
  title: 'ひとりで',
  lead: 'コンピューターのガイドさんと早押しで対戦します。',
  build(card, ctx: AppContext) {
    let level = pick(ctx.settings.get<unknown>('solo.level', 'minarai'), CPU_LEVEL_ORDER, 'minarai')
    let scope = pick(ctx.settings.get<unknown>('solo.scope', 'japan'), SCOPES, 'japan')
    card.append(
      radioGroup(
        '相手の強さ',
        CPU_LEVEL_ORDER.map((v) => ({ value: v, label: CPU_LEVEL_NAMES[v], sub: LEVEL_SUB[v] })),
        level,
        (v) => {
          level = v
          ctx.settings.set('solo.level', v)
        },
        'cards',
      ),
      radioGroup('出題の範囲', SCOPE_OPTIONS, scope, (v) => {
        scope = v
        ctx.settings.set('solo.scope', v)
      }),
      startButton(() => {
        ctx.audio.play('tap')
        ctx.startLocalGame({ mode: 'solo', scope, level })
      }),
    )
  },
})

export const createDuoScreen = menuScreen({
  name: 'duo',
  title: 'ふたりで',
  lead: '1台の画面を2人で囲んで、早押しで勝負します。',
  build(card, ctx: AppContext) {
    let scope = pick(ctx.settings.get<unknown>('duo.scope', 'japan'), SCOPES, 'japan')
    const side = (slot: 0 | 1, sideLabel: string, key: string): HTMLElement =>
      h(
        'div',
        { class: 'duo-side', style: `--pc:${lookOf(slot).color};--pc-ink:${lookOf(slot).ink}` },
        h('span', { class: 'duo-dot' }, shapeIcon(slot, 26, lookOf(slot).ink)),
        h('b', null, `${slot + 1}P`),
        h('span', null, sideLabel),
        h('kbd', null, key),
      )
    card.append(
      h(
        'div',
        { class: 'duo-keys', role: 'group', 'aria-label': '左が1P＝Fキー、右が2P＝Jキー' },
        side(0, '左', 'F'),
        side(1, '右', 'J'),
      ),
      h('p', { class: 'duo-note' }, '左が1P＝Fキー、右が2P＝Jキー。スマホやタブレットでは、画面の左下と右下のボタンを押します。'),
      radioGroup('出題の範囲', SCOPE_OPTIONS, scope, (v) => {
        scope = v
        ctx.settings.set('duo.scope', v)
      }),
      startButton(() => {
        ctx.audio.play('tap')
        ctx.startLocalGame({ mode: 'duo', scope })
      }),
    )
  },
})
