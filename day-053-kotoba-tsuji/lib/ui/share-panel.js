// 結果の画面の果たし状（同じ盤を友に出すリンク）の共有：Xの投稿画面・LINE・端末の共有（あるときだけ）・リンクのコピー。URL と文は lib/share.js
// タイトルの「このアプリを共有する」は全アプリ共通の部品（shared/share.js）。その .share とぶつからないよう、ここは hatashi-* の名前にしている
import { h, fuda } from './dom.js';
import { TEXT } from './copy.js';
import { phrased } from './wrap.js';
import { xIntentUrl, lineIntentUrl } from '../share.js';

// 公開URLは <link rel="canonical">。無ければ今いるURL（hash は外す）
export function shareBase() {
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  return canonical || location.href.split('#')[0];
}

// 果たし状・返し状のリンクの土台。受け取った人が同じ置き場所で開けるように、今いるページの URL を使う
// （srcdoc などで origin が無い環境だけ canonical に戻す）
export function pageBase() {
  try {
    const { protocol, origin, pathname } = location;
    if ((protocol === 'http:' || protocol === 'https:') && origin && origin !== 'null') return origin + pathname;
  } catch {
    /* 下へ */
  }
  return shareBase();
}

export function sharePanel({ id, head, sub, lead, text, url, say }) {
  const sec = h('section', { class: 'hatashi', 'aria-labelledby': id });
  sec.append(h('h2', { class: 'hatashi-head', id }, head, sub ? h('small', {}, sub) : null));
  if (lead) sec.append(h('p', { class: 'hatashi-lead' }, phrased(lead)));
  const native = typeof navigator.share === 'function';
  const grid = h('div', { class: `hatashi-btns${native ? ' has-native' : ''}` });
  grid.append(
    fuda(TEXT.shareButtons.x, { size: 'share', href: xIntentUrl(text, url), 'data-share': 'x' }),
    fuda(TEXT.shareButtons.line, { size: 'share', href: lineIntentUrl(url), 'data-share': 'line' }),
  );
  if (native) {
    grid.append(
      fuda(TEXT.shareButtons.native, {
        size: 'share',
        'data-share': 'native',
        onclick: async () => {
          try {
            await navigator.share({ title: 'ことば辻', text, url });
          } catch {
            /* 閉じられたときは何もしない */
          }
        },
      }),
    );
  }
  const fallback = h('input', { class: 'hatashi-url', type: 'text', readonly: true, value: url, hidden: true, 'aria-label': 'リンク' });
  grid.append(
    fuda(TEXT.shareButtons.copy, {
      size: 'share',
      'data-share': 'copy',
      onclick: async () => {
        if (await copyText(url)) say?.(TEXT.copied);
        else {
          fallback.hidden = false;
          fallback.select();
          say?.(TEXT.copyFailed);
        }
      },
    }),
  );
  sec.append(grid, fallback, h('p', { class: 'hatashi-note', 'data-share-note': '' }, phrased(native ? TEXT.shareNote : TEXT.shareNoteNoNative)));
  return sec;
}

async function copyText(s) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch {
    /* 下の方法で試す */
  }
  try {
    const ta = h('textarea', { readonly: true, style: { position: 'fixed', opacity: '0', top: '0' } });
    ta.value = s;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
