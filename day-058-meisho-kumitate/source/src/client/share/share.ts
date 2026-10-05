// 結果のシェア（4点セット）：端末の共有シート（あるときだけ）・X の投稿画面・LINE・リンクのコピー。
// Instagram と YouTube には Web から投稿画面を開く仕組みが無い（押してもアプリのトップが開くだけで、リンクは渡らない）。
// なのでボタンは作らず、「端末の共有かリンクのコピーで送れます」と1行書く。
// 外へのリンクは投稿画面だけ。課金や外部の販売ページへは誘導しない（iPhone アプリに包むときの決まり）。

import { h } from '../ui/dom'

export interface ShareContent {
  /** 投稿の文（URL は含めない） */
  text: string
  /** 共有する URL（公開先。src/client/site.ts） */
  url: string
  /** 端末の共有シートの見出し */
  title: string
}

export function xIntentUrl(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
}

export function lineShareUrl(url: string): string {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`
}

/** クリップボードへ写す。だめなら隠した入力欄から写す。どちらもだめなら false */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 下の方法を試す
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0'
  document.body.appendChild(area)
  let ok = false
  try {
    area.select()
    area.setSelectionRange(0, text.length)
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}

/** シェアの欄。どこに置いてもよい（結果の画面が置く） */
export function createShareBlock(content: ShareContent): HTMLElement {
  const said = h('p', { class: 'share-said', role: 'status', 'aria-live': 'polite' })
  // コピーに失敗したときに出す欄（長押しや選択で写してもらう）
  const fallback = h('textarea', {
    class: 'share-fallback',
    readonly: true,
    rows: 3,
    'aria-label': '共有する文とリンク（選んでコピーしてください）',
    hidden: true,
  })
  const fullText = `${content.text}\n${content.url}`

  const buttons: HTMLElement[] = []
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  if (canNativeShare) {
    buttons.push(
      h(
        'button',
        {
          type: 'button',
          class: 'btn share-btn share-native',
          'data-share': 'native',
          on: {
            click: () => {
              navigator.share({ title: content.title, text: content.text, url: content.url }).catch(() => {
                // 閉じただけなら何もしない
              })
            },
          },
        },
        '端末の共有',
      ),
    )
  }
  buttons.push(
    h(
      'a',
      {
        class: 'btn share-btn share-x',
        'data-share': 'x',
        href: xIntentUrl(content.text, content.url),
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      'Xで投稿',
    ),
    h(
      'a',
      {
        class: 'btn share-btn share-line',
        'data-share': 'line',
        href: lineShareUrl(content.url),
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      'LINEで送る',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'btn share-btn share-copy',
        'data-share': 'copy',
        on: {
          click: async () => {
            const ok = await copyText(fullText)
            if (ok) {
              fallback.hidden = true
              said.textContent = 'コピーしました'
            } else {
              fallback.value = fullText
              fallback.hidden = false
              fallback.focus()
              fallback.select()
              said.textContent = 'コピーできませんでした。下の欄を選んでコピーしてください'
            }
          },
        },
      },
      'リンクをコピー',
    ),
  )

  return h(
    'section',
    { class: 'result-share', 'aria-labelledby': 'share-heading' },
    h('h2', { class: 'share-heading', id: 'share-heading' }, '結果を送る'),
    h('div', { class: 'share-row' }, ...buttons),
    said,
    fallback,
    h(
      'p',
      { class: 'share-note' },
      canNativeShare
        ? 'Instagram と YouTube には Web から投稿画面を開く仕組みが無いため、端末の共有かリンクのコピーで送れます。'
        : 'Instagram と YouTube には Web から投稿画面を開く仕組みが無いため、リンクのコピーで送れます。',
    ),
  )
}
