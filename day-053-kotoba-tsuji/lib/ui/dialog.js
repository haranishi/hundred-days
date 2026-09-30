// 札（画面の中の確認ダイアログ）。alert / confirm / prompt は使わない
import { h, fuda } from './dom.js';
import { phrased } from './wrap.js';

let current = null;

export const isDialogOpen = () => Boolean(current);

// buttons: [{ label, value, primary }]、extra: 札の下に小さく置く1つ（{ label, value }）
// extras / extra：札の下に小さな文字で置く選択肢（取りやめ・降参など、選択肢の札と重さを分ける）
export function openDialog({ text, sub = '', buttons = [], cancel = null, extra = null, extras = [], name = '' } = {}) {
  if (current) current.close(current.cancel);
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const id = `dlg-${Math.random().toString(36).slice(2, 8)}`;
    const box = h('div', { class: 'kosatsu', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, 'data-dialog': name });
    box.append(h('p', { class: 'kosatsu-text', id }, phrased(text)));
    if (sub) box.append(h('p', { class: 'kosatsu-sub' }, sub));
    const row = h('div', { class: 'kosatsu-btns' });
    for (const b of buttons) {
      row.append(fuda(b.label, { primary: b.primary, 'data-value': b.value, onclick: () => done(b.value) }));
    }
    box.append(row);
    const smalls = [...extras, ...(extra ? [extra] : [])];
    if (smalls.length) {
      box.append(h('div', { class: 'kosatsu-extras' },
        smalls.map((x) => h('button', { class: 'kosatsu-extra', type: 'button', 'data-value': x.value, onclick: () => done(x.value) }, x.label))));
    }
    const back = h('div', { class: 'dlg-back' }, box);
    back.addEventListener('click', (e) => {
      if (e.target === back) done(cancel);
    });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(cancel);
      } else if (e.key === 'Tab') {
        const list = [...box.querySelectorAll('button')];
        const i = list.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          list[list.length - 1].focus();
        } else if (!e.shiftKey && i === list.length - 1) {
          e.preventDefault();
          list[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.append(back);
    const self = { cancel, close: (v) => done(v) };
    current = self;

    function done(value) {
      if (current !== self) return;
      current = null;
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      try {
        if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
      } catch {
        /* 戻す先が無ければそのまま */
      }
      resolve(value);
    }

    // 取り消せない操作の札では、止めるほう（focus: true）に最初の焦点を置く
    const first = buttons.findIndex((b) => b.focus);
    const target = first >= 0 ? row.children[first] : box.querySelector('.is-primary') ?? box.querySelector('button');
    target?.focus({ preventScroll: true });
  });
}
