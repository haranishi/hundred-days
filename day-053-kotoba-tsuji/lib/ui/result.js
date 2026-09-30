// 結果。朱印「天晴」が落ちて止まり、背景に花火。番付と、同じ盤を送る果たし状
// 秒の付いた果たし状から受けて立った局は、差出人との決着と「返し状を送る」を出す
import { h, fuda } from './dom.js';
import { TEXT, fill, pick, duelOutcome, returnShareText } from './copy.js';
import { getLevel } from '../levels.js';
import { formatDuration, resultShareText, challengeHash } from '../share.js';
import { sharePanel, pageBase } from './share-panel.js';
import { hanabi } from './fireworks.js';
import { phrased } from './wrap.js';

const stat = (label, value, key) => h('div', { class: 'stat', 'data-stat': key }, h('dt', {}, label), h('dd', {}, value));
// 言葉の書き方：うし（牛）
const writing = (w) => (w.kanji && w.kanji !== w.reading ? `${w.reading}（${w.kanji}）` : w.reading);

export function mountResult(app, params) {
  const { puzzle, game, levelId, seed, seconds, gaveUp, rank, newBestSec, duel = null, again = false, streak = 0 } = params;
  const lv = getLevel(levelId);
  const calm = again || app.reduced();
  // 「埋めた字 4/5」＝自分で埋めた字／埋める字（この盤の空きの数）。助太刀で明かした字は数えない。
  // 解けたときは助太刀で明かした字を除いた数、降参したときは明かされる前に正しく書けていた字の数
  const holes = Array.isArray(puzzle.blanks) ? puzzle.blanks : [];
  const blanks = holes.length || lv.blanks;
  const filled = gaveUp
    ? holes.filter(({ x, y }) => !game.revealed[y][x]).length
    : Math.max(0, blanks - game.hintsLetters);
  const el = h('section', { class: `screen screen-result${gaveUp ? ' is-lose' : ''}`, 'data-screen': 'result', tabindex: '-1' });
  const canvas = gaveUp || calm ? null : h('canvas', { class: 'hanabi', 'aria-hidden': 'true' });
  const sealText = gaveUp ? TEXT.result.sealLose : TEXT.result.sealWin;
  const seal = h('div', { class: `seal ${gaveUp ? 'seal-sumi' : 'seal-shu'}${calm ? '' : ' is-drop'}`, role: 'img', 'aria-label': `印「${sealText}」`, 'data-seal': gaveUp ? 'munen' : 'appare' },
    h('span', { class: 'seal-ch' }, sealText));

  // 解いた言葉を漢字つきで載せる（v2-r2 は手習い、v2-r3 で全腕前。3語まで出し、残りは「ほか{n}語」）。
  // 手習いを同じページで3局続けて解いたら、一人前へ誘う（その札を主にする）
  const tenarai = levelId === 1 && !gaveUp;
  const solvedList = gaveUp ? [] : puzzle.words.filter((w) => game.blanksOf(w.id).length > 0);
  const solvedWords = solvedList.length
    ? solvedList.slice(0, 3).map(writing).join('・') + (solvedList.length > 3 ? fill(TEXT.result.moreWords, { n: solvedList.length - 3 }) : '')
    : '';
  const graduate = tenarai && streak >= 3;
  // 番付の一言は候補から毎回選ぶ（同じ一言が2回続かない）。見返しから戻ったときは同じ一言のまま
  if (rank && !gaveUp && !params.rankLine) params.rankLine = pick(`rank_${rank.key}`) || rank.line;
  const rankLine = params.rankLine && !params.rankLine.startsWith('rank_') ? params.rankLine : rank?.line;

  const outcome = duel ? duelOutcome({ mine: seconds, theirs: duel.theirs, gaveUp }) : null;
  const returning = Boolean(outcome) && !gaveUp;
  // 果たし状・返し状のリンクは同じ盤。解けたときは自分の秒を付ける
  const hash = challengeHash({ level: levelId, seed, seconds: gaveUp ? undefined : seconds });
  const url = pageBase() + (hash ?? '');
  const share = sharePanel({
    id: 'share-result',
    head: returning ? TEXT.duel.shareHead : TEXT.result.shareHead,
    sub: returning ? TEXT.duel.shareSub : TEXT.result.shareSub,
    lead: returning ? null : TEXT.result.shareLead,
    text: returning ? returnShareText({ mine: seconds, theirs: duel.theirs }) : resultShareText({ levelId, seconds, blanks, gaveUp }),
    url,
    say: app.annai.say,
  });

  // canvas が無いときに append(null) すると「null」の字が出るので、h() で包んで null を捨てる
  el.append(...[canvas].filter(Boolean), h('div', { class: 'col result-col' },
    h('div', { class: 'result-top' },
      seal,
      h('h1', { class: 'result-head' }, phrased(gaveUp ? TEXT.result.headLose : TEXT.result.headWin)),
      solvedWords ? h('p', { class: 'solved-words' }, h('span', { class: 'sw-label' }, TEXT.result.solvedWords), phrased(solvedWords)) : null),
    outcome ? h('p', { class: 'duel', 'data-duel': outcome.key }, phrased(outcome.text)) : null,
    h('dl', { class: 'stats' },
      stat(TEXT.result.time, formatDuration(seconds), 'time'),
      stat(TEXT.result.hints, `${game.hintsLetters}字`, 'hints'),
      stat(TEXT.result.blanks, `${filled}/${blanks}`, 'blanks')),
    gaveUp ? null : h('div', { class: 'rank', 'data-rank': rank.key },
      h('p', { class: 'rank-head' }, TEXT.result.rankHead),
      h('p', { class: 'rank-label' }, rank.label),
      h('p', { class: 'rank-line' }, phrased(rankLine))),
    newBestSec && !gaveUp ? h('p', { class: 'new-best' }, phrased(fill(TEXT.result.newBest, { level: lv.name }))) : null,
    graduate ? h('div', { class: 'graduate' },
      h('p', { class: 'graduate-text' }, phrased(TEXT.result.graduate)),
      fuda(TEXT.result.graduateGo, { primary: true, size: 'lg', act: 'graduate', onclick: () => app.pickLevel(2) })) : null,
    h('div', { class: 'title-actions' },
      fuda(TEXT.result.again, { primary: !graduate, size: graduate ? undefined : 'lg', act: 'again', onclick: () => app.startNew(levelId) }),
      h('div', { class: 'btn-row' },
        fuda(TEXT.result.change, { size: 'sm', act: 'change', onclick: () => app.go('select') }),
        fuda(TEXT.result.review, { size: 'sm', act: 'review', onclick: () => app.go('play', { game, puzzle, levelId, seed, review: params }) }))),
    share));

  let stop = null;
  return {
    el,
    show() {
      if (canvas) setTimeout(() => {
        if (canvas.isConnected) stop = hanabi(canvas);
      }, 120);
    },
    destroy() {
      stop?.();
    },
  };
}
