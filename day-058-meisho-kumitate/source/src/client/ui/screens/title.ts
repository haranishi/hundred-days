// タイトル：後ろで 'title' の島がゆっくり回る。遊び方は2つ（ひとりで・ふたりで）。
// 迷わないよう、ボタンには「だれと遊ぶか」を1行添える（docs/02 ③）。
// 100日チャレンジ版（Day58）は、上の帯に一覧へ戻るリンクと、このアプリの共有を置く。
// 共有の欄は index.html の <dialog id="share-dialog"> にあり、共通部品（shared/share.js）が中身を据え付ける。

import type { AppContext, Screen } from '../app-context'
import { showTitleBackdrop } from '../backdrop'
import { focusHeading, h } from '../dom'
import { DAY_LABEL, SITE_NAME } from '../../site'

export function createTitleScreen(ctx: AppContext): Screen {
  let section: HTMLElement | null = null
  const go = (name: string) => () => {
    ctx.audio.play('tap')
    ctx.go(name)
  }
  const openShare = (): void => {
    ctx.audio.play('tap')
    const dialog = document.getElementById('share-dialog')
    if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal()
  }
  const bigButton = (name: string, label: string, sub: string, primary: boolean): HTMLButtonElement =>
    h(
      'button',
      { type: 'button', class: `btn btn-block btn-mode ${primary ? 'btn-primary' : 'btn-secondary'}`, 'data-action': name, on: { click: go(name) } },
      h('span', { class: 'btn-mode-label' }, label),
      h('small', null, sub),
    )

  return {
    mount(root) {
      showTitleBackdrop(ctx)
      section = h(
        'section',
        { class: 'screen screen-title' },
        h(
          'header',
          { class: 'title-head' },
          h(
            'div',
            { class: 'title-day-bar' },
            h('a', { class: 'title-day-link', href: '../', 'data-action': 'day-index' }, DAY_LABEL),
            h(
              'button',
              { type: 'button', class: 'title-day-link', 'data-action': 'share-app', 'aria-label': 'このアプリを共有する', on: { click: openShare } },
              '共有する',
            ),
          ),
          h('p', { class: 'title-kicker' }, 'ミニチュアの早押しクイズ'),
          h('h1', { class: 'title-logo', 'aria-label': SITE_NAME }, h('span', null, '名所'), h('span', null, 'くみたて早押し')),
          h('p', { class: 'title-lead' }, '組み上がる模型を見て、早押しで名所を当てよう'),
        ),
        h(
          'nav',
          { class: 'title-menu card', 'aria-label': '遊び方を選ぶ' },
          bigButton('solo', 'ひとりで', 'ガイドさんと対戦', true),
          bigButton('duo', 'ふたりで', '1台を2人で囲んで早押し', false),
          h(
            'div',
            { class: 'title-links' },
            h('button', { type: 'button', class: 'btn btn-ghost', 'data-action': 'howto', on: { click: go('howto') } }, '遊び方'),
            h('button', { type: 'button', class: 'btn btn-ghost', 'data-action': 'settings', on: { click: go('settings') } }, '設定'),
            h('button', { type: 'button', class: 'btn btn-ghost', 'data-action': 'credits', on: { click: go('credits') } }, 'クレジット'),
          ),
        ),
      )
      root.appendChild(section)
      focusHeading(section)
    },
    unmount() {
      section?.remove()
      section = null
    },
  }
}
