/* 絵（SVG）の部品。三角（前の面・次の面）と星は、文字でなく SVG で描く：iPhone で一部の記号が絵文字の見た目に化けるのと、端末ごとの字形の差を避けるため。
   絵の形は index.html 先頭の sprite（<symbol>）にあり、ここは <use> で呼ぶだけ。結果の共有文の星だけは文字のまま（投稿の文なので）。 */
import { s } from './dom.js';
import { starsLabel } from './phrase.js';

// 星の列（塗りと輪郭の形でも見分けられる）。読み上げの名前は「星3つ中2つ」
export function starRow(count, { total = 3, label } = {}) {
  const uses = [];
  for (let i = 0; i < total; i++) {
    uses.push(s('use', { href: i < count ? '#ic-star-on' : '#ic-star-off', x: i * 24, y: 0, width: 24, height: 24, class: i < count ? 'star star--on' : 'star star--off' }));
  }
  return s('svg', {
    class: 'stars',
    viewBox: `0 0 ${total * 24} 24`,
    role: 'img',
    'aria-label': label ?? starsLabel(count),
    focusable: 'false',
    'data-count': count,
  }, ...uses);
}
