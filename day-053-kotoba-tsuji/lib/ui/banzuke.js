// 番付。腕前ごとの解いた数・最速・最高位と、通算の解いた数
import { h, fuda } from './dom.js';
import { TEXT } from './copy.js';
import { LEVELS } from '../levels.js';
import { formatDuration } from '../share.js';
import { rankOf } from '../rank.js';
import { phrased } from './wrap.js';

const stat = (label, value) => h('div', { class: 'stat' }, h('dt', {}, label), h('dd', {}, value));

export function mountBanzuke(app) {
  const rec = app.store.getRecords();
  const solvedSum = LEVELS.reduce((n, lv) => n + (rec.levels[lv.id]?.solved ?? 0), 0);
  const el = h('section', { class: 'screen screen-banzuke', 'data-screen': 'banzuke', tabindex: '-1' });
  const body = h('div', { class: 'banzuke' });
  if (solvedSum === 0) {
    body.append(h('p', { class: 'bz-empty', 'data-empty': '' }, phrased(TEXT.banzuke.empty)));
  } else {
    for (const lv of LEVELS) {
      const r = rec.levels[lv.id];
      // 番付表の見立て：腕前の名は縦書きの木札、最高位は朱印で押す
      const best = r.bestRank ? rankOf(r.bestRank)?.label : null;
      body.append(h('div', { class: 'bz-row', 'data-level': lv.id },
        h('p', { class: 'bz-name' }, lv.name),
        h('dl', { class: 'bz-stats' },
          stat(TEXT.banzuke.solved, `${r.solved}局`),
          stat(TEXT.banzuke.best, r.bestSec !== null ? formatDuration(r.bestSec) : '—')),
        h('div', { class: 'bz-best' },
          h('span', { class: 'bz-cap' }, TEXT.banzuke.rank),
          best ? h('p', { class: 'bz-seal', 'data-rank': r.bestRank }, best) : h('p', { class: 'bz-seal is-empty' }, '—'))));
    }
    body.append(h('p', { class: 'bz-total' }, `${TEXT.banzuke.total}　`, h('b', {}, `${solvedSum}局`)));
  }
  el.append(h('div', { class: 'col' },
    h('h1', { class: 'screen-head' }, TEXT.banzuke.head),
    body,
    h('div', { class: 'back-row' }, fuda(TEXT.banzuke.back, { size: 'sm', act: 'back', onclick: () => app.go('title') }))));
  return { el };
}
