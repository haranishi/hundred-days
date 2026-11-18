// 試合の上や画面のあいだに出すもの：接続中・エラー（理由と戻り道）・一時停止（やめるは確認を1回）・トースト。

import type { ScreensAPI } from '../../contracts';
import { button, focusEl, h, phraseBreaks, setText } from './dom';
import { icon } from './looks';

type PauseHandlers = Parameters<ScreensAPI['showPause']>[0];

export function connectingScreen(text: string, onCancel?: () => void): { el: HTMLElement; focus: HTMLElement | null; escape?: () => void } {
  const cancel = onCancel ? button('やめる', { cls: 'sy-btn--plain', a: 'cancel', onClick: onCancel }) : null;
  const el = h(
    'div',
    { class: 'sy-layer sy-layer--status', 'data-screen': 'connecting' },
    h(
      'section',
      { class: 'sy-card sy-status', role: 'status', 'aria-live': 'polite' },
      h('span', { class: 'sy-spinner', 'aria-hidden': 'true' }),
      h('h1', { class: 'sy-h2 sy-status-title' }, text || 'つないでいます…'),
      cancel ? h('div', { class: 'sy-actions' }, cancel) : null,
    ),
  );
  return { el, focus: cancel, escape: onCancel };
}

export function errorScreen(text: string, onBack: () => void): { el: HTMLElement; focus: HTMLElement; escape: () => void } {
  const back = button([icon('back', 20), 'もどる'], { cls: 'sy-btn--red sy-btn--big', a: 'back', onClick: onBack });
  const el = h(
    'div',
    { class: 'sy-layer sy-layer--status', 'data-screen': 'error' },
    h(
      'section',
      { class: 'sy-card sy-status sy-status--error', role: 'alertdialog', 'aria-labelledby': 'sy-err-h', 'aria-describedby': 'sy-err-p' },
      h('span', { class: 'sy-status-icon', 'aria-hidden': 'true' }, icon('alert', 40)),
      h('h1', { class: 'sy-h2 sy-status-title', id: 'sy-err-h' }, 'うまくいきませんでした'),
      h('p', { class: 'sy-status-text', id: 'sy-err-p' }, text),
      h('div', { class: 'sy-actions' }, back),
    ),
  );
  return { el, focus: back, escape: onBack };
}

/**
 * 一時停止。「やめる」は1回だけ確かめる（押しまちがいで試合を失わない）。
 * live（ネット対戦）では試合は止まらないので、そう書き、後ろの店が見えるよう幕を薄くする
 */
export function pauseScreen(hd: PauseHandlers): { el: HTMLElement; focus: HTMLElement; escape: () => void } {
  const live = hd.live === true;
  const title = h('h1', { class: 'sy-h1 sy-pause-title', id: 'sy-pause-h' });
  const text = h('p', { class: 'sy-status-text', id: 'sy-pause-p' });
  const resume = button([icon('play', 22), live ? '試合にもどる' : 'つづける'], { cls: 'sy-btn--red sy-btn--big', a: 'resume', onClick: hd.onResume });
  const quit = button(live ? 'ぬける' : 'やめる', { cls: 'sy-btn--plain', a: 'quit', onClick: () => setMode('confirm') });
  const quitYes = button(live ? 'ぬける' : 'やめる', { cls: 'sy-btn--danger', a: 'quit-yes', onClick: hd.onQuit });
  const quitNo = button(live ? '試合にもどる' : 'つづける', { cls: 'sy-btn--plain', a: 'quit-no', onClick: () => setMode('menu') });
  const actions = h('div', { class: 'sy-actions sy-actions--stack' });
  let mode: 'menu' | 'confirm' = 'menu';

  const setMode = (next: 'menu' | 'confirm'): void => {
    mode = next;
    card.dataset.mode = next;
    if (next === 'menu') {
      setText(title, live ? 'メニュー' : '一時停止');
      setText(text, live ? 'ネット対戦なので、試合は止まりません。' : '試合は止まっています。');
      actions.replaceChildren(resume, quit);
      focusEl(resume);
    } else {
      setText(title, live ? '試合からぬけますか？' : '試合をやめますか？');
      setText(text, live ? 'ぬけると、この試合にはもどれません。' : 'タイトルにもどります。この試合の点数は残りません。');
      actions.replaceChildren(quitYes, quitNo);
      focusEl(quitNo);
    }
  };

  const card = h(
    'section',
    { class: 'sy-card sy-status sy-pause', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sy-pause-h', 'aria-describedby': 'sy-pause-p' },
    h('span', { class: 'sy-status-icon sy-status-icon--pause', 'aria-hidden': 'true' }, icon(live ? 'alert' : 'pause', 36)),
    title,
    text,
    actions,
  );
  const el = h('div', { class: `sy-layer sy-layer--overlay${live ? ' is-live' : ''}`, 'data-screen': 'pause' }, card);
  setMode('menu');
  // Esc：確認中なら確認を閉じる、ほかは「つづける」
  const escape = (): void => {
    if (mode === 'confirm') setMode('menu');
    else hd.onResume();
  };
  return { el, focus: resume, escape };
}

/** トースト。画面を出していなくても（試合中でも）出る。読み上げにも伝える */
export function createToasts(): { el: HTMLElement; show(text: string): void } {
  const el = h('div', { class: 'sy-toasts', role: 'status', 'aria-live': 'polite' });
  return {
    el,
    show(text: string) {
      const item = h('p', { class: 'sy-toast' }, ...phraseBreaks(text));
      el.appendChild(item);
      // 3つより多くは積まない（古いものから消す）
      while (el.children.length > 3) el.firstElementChild?.remove();
      setTimeout(() => item.classList.add('is-leaving'), 2600);
      setTimeout(() => item.remove(), 3000);
    },
  };
}
