// シェアの4点セット：①端末の共有シート（navigator.share があるときだけ）②X の投稿画面 ③LINE ④リンクのコピー。
// Instagram と YouTube には Web から投稿画面を開く公式の仕組みが無い（押してもアプリのトップが開くだけでリンクは渡らない）。
// なのでボタンは作らず、「共有」か「リンクをコピー」から送れると1行書く。
// 上半分は純粋な関数（単体試験で URL の組み立てを確かめる）。下半分が DOM の部品。

import { HASHTAG, SITE_NAME, SITE_URL } from '../site';
import { formatPoints, h, s } from './screens/dom';

// ───────── 純粋な部分 ─────────

export function xIntentUrl(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

/** LINE の共有は URL だけを渡す（文は LINE 側が URL の OGP から作る） */
export function lineShareUrl(url: string): string {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`;
}

/** 招待の URL（?room=CODE）。base に別の問い合わせがあっても壊さず、room だけを置き換える */
export function inviteUrl(code: string, base: string = SITE_URL): string {
  try {
    const u = new URL(base);
    u.searchParams.set('room', code);
    u.hash = '';
    return u.toString();
  } catch {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}room=${encodeURIComponent(code)}`;
  }
}

/** 結果の文（URL は含めない） */
export function resultShareText(score: number, title: string): string {
  return `${SITE_NAME}で荒らし度${formatPoints(score)}点！称号『${title}』 #${HASHTAG}`;
}

/** 招待の文（URL は含めない） */
export function inviteShareText(code: string): string {
  return `${SITE_NAME}で勝負しよう！あいことば ${code}`;
}

/** コピーするときの中身。文の次の行に URL（貼った先でリンクとして押せるように） */
export function copyPayload(text: string, url: string): string {
  return `${text}\n${url}`;
}

// ───────── DOM の部品 ─────────

/** クリップボードへ写す。だめなら隠した入力欄から写す。どちらもだめなら false */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 下の方法を試す
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
  document.body.appendChild(area);
  let ok = false;
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export interface ShareContent {
  /** 投稿の文（URL は含めない） */
  text: string;
  url: string;
  /** 欄の見出し（「結果を送る」「招待を送る」） */
  heading: string;
}

function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

function icon(path: string): SVGSVGElement {
  return s(
    'svg',
    { viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': 'true', focusable: 'false', class: 'sy-share-icon' },
    s('path', { d: path, fill: 'currentColor' }),
  );
}

const ICON_SHARE = 'M16 5.5 12 1.5 8 5.5l1.4 1.4L11 5.3V15h2V5.3l1.6 1.6zM5 10h3v2H6v8h12v-8h-2v-2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1z';
const ICON_X = 'M17.8 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.3L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z';
// LINE はロゴを描かず、ふつうの吹き出しにする（ロゴの形を借りない）
const ICON_LINE = 'M12 3C6.5 3 2 6.6 2 11c0 2.6 1.6 4.9 4 6.4V22l4.2-3.1c.6.1 1.2.1 1.8.1 5.5 0 10-3.6 10-8s-4.5-8-10-8z';
const ICON_COPY = 'M8 3h11a2 2 0 0 1 2 2v11h-2V5H8zM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v10h10V9z';

/** シェアの欄。結果の画面と待合室が置く */
export function createShareBlock(content: ShareContent): HTMLElement {
  const native = canNativeShare();
  const payload = copyPayload(content.text, content.url);
  const said = h('p', { class: 'sy-share-said', role: 'status', 'aria-live': 'polite' });
  // コピーに失敗したときに出す欄（長押しや選択で写してもらう）
  const fallback = h('textarea', {
    class: 'sy-share-fallback',
    readonly: true,
    rows: 3,
    'aria-label': '送る文とリンク（選んでコピーしてください）',
    hidden: true,
  });
  const headingId = `sy-share-${Math.random().toString(36).slice(2, 8)}`;

  const items: HTMLElement[] = [];
  if (native) {
    items.push(
      h(
        'button',
        {
          type: 'button',
          class: 'sy-btn sy-share-btn sy-share-native',
          'data-share': 'native',
          on: {
            click: () => {
              navigator.share({ title: SITE_NAME, text: content.text, url: content.url }).catch(() => {
                // 閉じただけなら何もしない
              });
            },
          },
        },
        icon(ICON_SHARE),
        '共有',
      ),
    );
  }
  items.push(
    h(
      'a',
      {
        class: 'sy-btn sy-share-btn sy-share-x',
        'data-share': 'x',
        href: xIntentUrl(content.text, content.url),
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      icon(ICON_X),
      'Xで投稿',
    ),
    h(
      'a',
      {
        class: 'sy-btn sy-share-btn sy-share-line',
        'data-share': 'line',
        href: lineShareUrl(content.url),
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      icon(ICON_LINE),
      'LINEで送る',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'sy-btn sy-share-btn sy-share-copy',
        'data-share': 'copy',
        on: {
          click: async () => {
            const ok = await copyText(payload);
            if (ok) {
              fallback.hidden = true;
              said.textContent = 'コピーしました';
            } else {
              fallback.value = payload;
              fallback.hidden = false;
              fallback.focus();
              fallback.select();
              said.textContent = 'コピーできませんでした。下の欄を選んでコピーしてください';
            }
          },
        },
      },
      icon(ICON_COPY),
      'リンクをコピー',
    ),
  );

  return h(
    'section',
    { class: 'sy-share', 'aria-labelledby': headingId },
    h('h2', { class: 'sy-share-heading', id: headingId }, content.heading),
    h('div', { class: `sy-share-row${native ? ' has-native' : ''}` }, ...items),
    said,
    fallback,
    // 文節で折る（画面を出すときに phraseify が分ける。『リンクをコピー』は途中で切れない）
    h(
      'p',
      { class: 'sy-share-note' },
      native ? 'Instagram・YouTubeへは『共有』か『リンクをコピー』から' : 'Instagram・YouTubeへは『リンクをコピー』から',
    ),
  );
}
