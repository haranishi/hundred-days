// 腕前選び。いちばん大きな数字は「埋める字」。言葉と辻の数を小さく添える（盤の大きさは実物と合わないので出さない。値の正本は lib/levels.js）
import { h, fuda } from './dom.js';
import { TEXT } from './copy.js';
import { phrased } from './wrap.js';
import { LEVELS } from '../levels.js';
import { formatDuration } from '../share.js';
import { rankOf } from '../rank.js';

export function mountSelect(app) {
  const rec = app.store.getRecords();
  const el = h('section', { class: 'screen screen-select', 'data-screen': 'select', tabindex: '-1' });
  const list = h('div', { class: 'level-list' });
  for (const lv of LEVELS) {
    const r = rec.levels[lv.id];
    const recParts = [];
    if (r?.bestSec !== null && r?.bestSec !== undefined) recParts.push(`最速 ${formatDuration(r.bestSec)}`);
    if (r?.bestRank) recParts.push(`最高位 ${rankOf(r.bestRank)?.label ?? ''}`);
    list.append(h('button', { type: 'button', class: 'fuda level-card', 'data-level': lv.id, onclick: () => app.pickLevel(lv.id) },
      h('span', { class: 'lc-name' },
        h('span', { class: 'lc-seals', role: 'img', 'aria-label': `段位 ${lv.id}` }, Array.from({ length: lv.id }, () => h('i', { class: 'lc-seal' }))),
        lv.name, h('small', { class: 'lc-reading' }, lv.reading)),
      h('span', { class: 'lc-nums' },
        // 朱の点線の小さな枠は、盤の「空いた辻」と同じ印
        h('span', { class: 'lc-blanks' }, h('i', { class: 'lc-aki', 'aria-hidden': 'true' }), TEXT.select.blanks, h('b', {}, lv.blanks)),
        h('span', { class: 'lc-counts' }, `言葉 ${lv.words}・辻 ${lv.crossings}`)),
      h('span', { class: 'lc-line' }, phrased(TEXT.select.lines[lv.id])),
      recParts.length ? h('span', { class: 'lc-rec' }, recParts.join('・')) : null));
  }
  el.append(h('div', { class: 'col' },
    h('h1', { class: 'screen-head' }, TEXT.select.head),
    h('p', { class: 'screen-lead' }, phrased(TEXT.select.lead)),
    list,
    h('p', { class: 'note' }, phrased(TEXT.select.about)),
    h('div', { class: 'back-row' }, fuda(TEXT.select.back, { size: 'sm', act: 'back', onclick: () => app.go('title') }))));
  return { el };
}
