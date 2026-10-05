// 確認の窓（「やめる」の確認など）。window.confirm は止まってしまい見た目も合わないので、画面の中に出す。
// 開いている間は焦点を窓の中に閉じ込め、Esc で閉じる。閉じたら元の場所へ焦点を戻す。

import { h } from './dom'

export interface ConfirmOptions {
  title: string
  body: string
  okLabel: string
  cancelLabel: string
  /** ok を目立つ色（朱）にする */
  danger?: boolean
}

export interface ConfirmHandle {
  close(): void
  readonly open: boolean
}

export function openConfirm(
  host: HTMLElement,
  opts: ConfirmOptions,
  onResult: (ok: boolean) => void,
): ConfirmHandle {
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
  let isOpen = true
  const titleId = `confirm-title-${Math.random().toString(36).slice(2, 8)}`
  const ok = h('button', { type: 'button', class: `btn ${opts.danger ? 'btn-primary' : 'btn-secondary'}`, 'data-confirm': 'ok' }, opts.okLabel)
  const cancel = h('button', { type: 'button', class: 'btn btn-secondary', 'data-confirm': 'cancel' }, opts.cancelLabel)
  const box = h(
    'div',
    { class: 'confirm', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('h2', { id: titleId, class: 'confirm-title' }, opts.title),
    h('p', { class: 'confirm-body' }, opts.body),
    h('div', { class: 'confirm-actions' }, cancel, ok),
  )
  const layer = h('div', { class: 'confirm-layer' }, box)

  const finish = (result: boolean): void => {
    if (!isOpen) return
    isOpen = false
    document.removeEventListener('keydown', onKey, true)
    layer.remove()
    try {
      before?.focus({ preventScroll: true })
    } catch {
      // 元の場所が無くなっていれば何もしない
    }
    onResult(result)
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finish(false)
      return
    }
    if (e.key === 'Tab') {
      // 焦点を2つのボタンの間だけで回す
      e.preventDefault()
      const next = document.activeElement === ok ? cancel : ok
      next.focus()
      return
    }
    // ゲームの操作（Space・F・J・1〜4）を窓の後ろへ通さない。ボタンの Enter・Space はそのまま効かせる
    const onButton = document.activeElement === ok || document.activeElement === cancel
    if (!(onButton && (e.key === 'Enter' || e.key === ' '))) e.stopPropagation()
  }
  ok.addEventListener('click', () => finish(true))
  cancel.addEventListener('click', () => finish(false))
  layer.addEventListener('click', (e) => {
    if (e.target === layer) finish(false)
  })
  document.addEventListener('keydown', onKey, true)
  host.appendChild(layer)
  cancel.focus({ preventScroll: true })

  return {
    close: () => finish(false),
    get open() {
      return isOpen
    },
  }
}
