// 指南書。遊び方を5つと、PCで遊ぶ人への一言
import { h, fuda } from './dom.js';
import { TEXT } from './copy.js';
import { kanjiNumeral } from '../kana.js';
import { phrased } from './wrap.js';

// 「きゅうり → きゆうり」を小さなマスで見せる
const cells = (s) => h('span', { class: 'mini-cells', 'aria-hidden': 'true' }, [...s].map((c) => h('span', { class: 'mini-cell' }, c)));

export function mountHowto(app) {
  const el = h('section', { class: 'screen screen-howto', 'data-screen': 'howto', tabindex: '-1' });
  const ol = h('ol', { class: 'howto-list' });
  TEXT.howto.items.forEach((text, i) => {
    ol.append(h('li', { class: 'howto-item' },
      h('span', { class: 'howto-no', 'aria-hidden': 'true' }, `其の${kanjiNumeral(i + 1)}`),
      h('p', {}, phrased(text), i === 2 ? h('span', { class: 'howto-ex' }, cells('きゆうり'), cells('きつて')) : null)));
  });
  el.append(h('div', { class: 'col' },
    h('h1', { class: 'screen-head' }, TEXT.howto.head),
    h('div', { class: 'makimono' }, ol,
      h('div', { class: 'howto-pc' }, h('h2', {}, TEXT.howto.pcHead), h('p', {}, phrased(TEXT.howto.pc)))),
    h('div', { class: 'back-row' }, fuda(TEXT.howto.back, { size: 'sm', act: 'back', onclick: () => app.go('title') }))));
  // PC の Esc でも閉じる（しつらえと同じ）
  const onKey = (e) => {
    if (e.key === 'Escape') app.go('title');
  };
  return {
    el,
    show: () => document.addEventListener('keydown', onKey),
    destroy: () => document.removeEventListener('keydown', onKey),
  };
}
