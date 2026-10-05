// メニュー系の画面（遊び方・設定・クレジットなど）の共通の枠：後ろにタイトルの島、真ん中にカード1枚、最後に「もどる」。

import type { AppContext, Screen, ScreenFactory } from '../app-context'
import { showTitleBackdrop } from '../backdrop'
import { focusHeading, h } from '../dom'

export interface MenuOptions {
  /** 見た目と自動テストの印（screen-◯◯） */
  name: string
  title: string
  lead?: string
  /** 「もどる」の行き先（既定はタイトル） */
  back?: string
  wide?: boolean
  /** カードの中身を作る。戻り値の関数は片付けのときに呼ぶ */
  build(card: HTMLElement, ctx: AppContext): void | (() => void)
}

export function menuScreen(opts: MenuOptions): ScreenFactory {
  return (ctx) => {
    let section: HTMLElement | null = null
    let cleanup: (() => void) | void
    const screen: Screen = {
      mount(root) {
        showTitleBackdrop(ctx)
        const card = h('div', { class: `card${opts.wide ? ' card-wide' : ''}` }, h('h1', null, opts.title))
        if (opts.lead) card.appendChild(h('p', { class: 'lead' }, opts.lead))
        section = h('section', { class: `screen menu screen-${opts.name}` }, card)
        cleanup = opts.build(card, ctx)
        card.appendChild(backButton(ctx, opts.back ?? 'title'))
        root.appendChild(section)
        focusHeading(section)
      },
      unmount() {
        if (typeof cleanup === 'function') cleanup()
        section?.remove()
        section = null
      },
    }
    return screen
  }
}

export function backButton(ctx: AppContext, to: string): HTMLButtonElement {
  return h(
    'button',
    {
      type: 'button',
      class: 'btn btn-ghost btn-block btn-back',
      'data-action': 'back',
      on: {
        click: () => {
          ctx.audio.play('tap')
          ctx.go(to)
        },
      },
    },
    'もどる',
  )
}

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  /** 2行目の説明 */
  sub?: string
}

let groupSeq = 0

/**
 * ラジオボタンの組（見た目は横並びの切り替え、または縦のカード）。
 * 選んだら onChange。キーボードの矢印でも選べる（ラジオボタンそのものの動き）
 */
export function radioGroup<T extends string>(
  legend: string,
  options: readonly ChoiceOption<T>[],
  value: T,
  onChange: (v: T) => void,
  variant: 'seg' | 'cards' = 'seg',
): HTMLFieldSetElement {
  const name = `rg-${++groupSeq}`
  return h(
    'fieldset',
    { class: `choice-group ${variant}` },
    h('legend', null, legend),
    h(
      'div',
      { class: 'choice-group-items' },
      ...options.map((o) =>
        h(
          'label',
          { class: 'choice-item' },
          h('input', {
            type: 'radio',
            name,
            value: o.value,
            checked: o.value === value,
            on: { change: () => onChange(o.value) },
          }),
          h('span', { class: 'choice-item-box' }, h('span', { class: 'choice-item-label' }, o.label), o.sub ? h('small', null, o.sub) : null),
        ),
      ),
    ),
  )
}
