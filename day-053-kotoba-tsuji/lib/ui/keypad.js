// 五十音盤。列は右から あ・か・さ…わ。゛・゜・消すは最下段の横一列（かなのキーを広く取るため）
// 押すとキーの上に大きな字が0.12秒だけ浮く（指で隠れても何を押したか分かるように）
import { h } from './dom.js';
import { BOARD_COLUMNS } from '../kana.js';

export function createKeypad({ onKey }) {
  const el = h('div', { class: 'keypad', role: 'group', 'aria-label': '五十音盤' });
  BOARD_COLUMNS.forEach((col, ci) => {
    col.forEach((ch, ri) => {
      if (!ch) return;
      const b = h('button', { type: 'button', class: 'key', 'data-kana': ch }, ch);
      b.style.gridColumn = String(BOARD_COLUMNS.length - ci);
      b.style.gridRow = String(ri + 1);
      el.append(b);
    });
  });
  const fns = [
    { kp: 'dakuten', label: '゛', note: '濁り', aria: '濁点', col: '1 / span 3' },
    { kp: 'handakuten', label: '゜', note: '半濁り', aria: '半濁点', col: '4 / span 3' },
    { kp: 'erase', label: '消す', note: '', aria: '一字消す', col: '7 / span 4' },
  ];
  for (const f of fns) {
    const b = h('button', { type: 'button', class: `key key-fn key-${f.kp}`, 'data-kp': f.kp, 'aria-label': f.aria },
      h('span', { class: 'kp-lbl' }, f.label), f.note ? h('small', { 'aria-hidden': 'true' }, f.note) : null);
    b.style.gridColumn = f.col;
    b.style.gridRow = '6';
    el.append(b);
  }
  const pop = h('div', { class: 'key-pop', 'aria-hidden': 'true' });
  el.append(pop);
  let popTimer = 0;

  function showPop(b, label) {
    if (!label) return;
    pop.textContent = label;
    const r = b.getBoundingClientRect();
    const pr = el.getBoundingClientRect();
    // 端のキーでも盤の外へはみ出さないように寄せる
    const half = pop.offsetWidth / 2 || 25;
    const cx = Math.min(Math.max(r.left - pr.left + r.width / 2, half), pr.width - half);
    pop.style.left = `${cx}px`;
    pop.style.top = `${r.top - pr.top}px`;
    pop.classList.add('is-on');
    clearTimeout(popTimer);
    popTimer = setTimeout(() => pop.classList.remove('is-on'), 120);
  }

  // 押しても焦点を奪わない（直前の操作の対象を保つ）
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const shown = b.dataset.kana ? onKey({ type: 'kana', kana: b.dataset.kana }) : onKey({ type: b.dataset.kp });
    if (b.dataset.kp !== 'erase') showPop(b, typeof shown === 'string' ? shown : '');
  });

  return { el };
}
