// 果たし状（#c-<腕前>-<seed>[-<秒>] のリンクで来た人）。受けて立つと同じ seed の盤が出る
import { h, fuda, mark } from './dom.js';
import { TEXT, fill } from './copy.js';
import { getLevel } from '../levels.js';
import { formatDuration } from '../share.js';
import { phrased } from './wrap.js';

export function mountChallenge(app, { level, seed, seconds }) {
  const lv = getLevel(level);
  let puzzle = null;
  try {
    puzzle = app.generate(lv.id, seed);
  } catch {
    puzzle = null;
  }
  // 埋める字は、受けて立ったときに出る盤（同じ seed）の空きの数
  const el = h('section', { class: 'screen screen-challenge', 'data-screen': 'challenge', tabindex: '-1' });
  el.append(h('div', { class: 'col' },
    // リンクから初めて来た人にも何の遊びか分かるように、書状の上に小さく題字
    h('p', { class: 'ch-brand' }, h('span', { class: 'ch-title' }, TEXT.title.main), h('span', { class: 'ch-sub' }, TEXT.title.sub)),
    h('article', { class: 'letter' },
      h('p', { class: 'letter-cover', 'aria-hidden': 'true' }, '果たし状'),
      h('div', { class: 'letter-body' },
        h('h1', { class: 'letter-head' }, TEXT.challenge.head),
        h('p', { class: 'letter-text' }, phrased(fill(TEXT.challenge.body, { level: lv.name, b: puzzle?.blanks?.length || lv.blanks }))),
        seconds ? h('p', { class: 'letter-time' }, fill(TEXT.challenge.time, { time: formatDuration(seconds) })) : null),
      h('div', { class: 'letter-seal' }, mark({ size: 46, color: 'var(--shu)', solid: true }))),
    h('div', { class: 'title-actions' },
      fuda(TEXT.challenge.accept, {
        primary: true,
        size: 'lg',
        act: 'accept',
        onclick: () => {
          app.clearHash();
          app.pickLevel(lv.id, { seed, puzzle, source: 'challenge', duel: seconds ? { theirs: seconds } : null });
        },
      }),
      fuda(TEXT.challenge.decline, {
        act: 'decline',
        onclick: () => {
          app.clearHash();
          app.go('title');
        },
      }))));
  return { el };
}
