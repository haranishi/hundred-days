import { STAGES } from './lib/stages.js';
import { createState, legalMoves, applyMove } from './lib/rules.js';
import { createSolver } from './lib/solver.js';
import { chooseCpuMove } from './lib/cpu.js';
import { describeLoss, describeWin } from './lib/review.js';
import { loadProgress, saveProgress } from './lib/storage.js';
import { createAudio } from './lib/audio.js';
import { createRandom } from './lib/random.js';

const $ = id => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const JOIN = String.fromCharCode(0x2060); // 語結合子。数字と「・」の間では折らない
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const audio = createAudio();
// All mutable game/UI state lives here. DOM nodes are projections of this state.
const model = { phase: 'ready', game: null, solver: null, hints: 0, progress: loadProgress(), timer: null,
  random: createRandom(location.search), help: false, suspended: document.hidden, saved: true, fresh: false };
audio.setEnabled(model.progress.sound);
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function svgNode(tag, attributes) {
  const el = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, String(value));
  return el;
}
function unlocked(id) { return id === 1 || model.progress.cleared.includes(id - 1) || model.progress.cleared.includes(id); }
// 続きから：まだクリアしていない最初の面。全部クリア済みなら1面。
function firstOpenStage() { return STAGES.find(s => !model.progress.cleared.includes(s.id))?.id ?? 1; }
// 1・2・3 はそのまま、4つ以上の連番は 1〜5 のように短くする。
function describeMoves(moves) {
  const run = moves.length >= 4 && moves.every((n, i) => !i || n === moves[i - 1] + 1);
  return run ? `${moves[0]}〜${moves.at(-1)}` : moves.join(`${JOIN}・${JOIN}`);
}
// 文ごとに1つのかたまり（inline-block）にして、行が折れるときは文の切れ目で折れるようにする。
function setSentences(id, parts) {
  $(id).replaceChildren(...parts.filter(Boolean).map(text => node('span', text)));
}
// 説明文：1行（1段落）ずつ、さらに文ごとのかたまりにする。
function setReview(lines) {
  $('review').replaceChildren(...lines.map(line => {
    const paragraph = node('span', undefined, 'review-line');
    for (const sentence of line.match(/[^。]+。?/g) ?? []) paragraph.append(node('span', sentence));
    return paragraph;
  }));
}
const coarsePointer = () => matchMedia('(pointer: coarse)').matches;
// 終わったとき、結果（全面クリアなら皆伝）が画面に入るようにする。
function showResult() {
  const target = $('all-clear').hidden ? $('result') : $('all-clear');
  target.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
}
// スマホでは面の一覧が盤の下にある。面を選んだら、盤の先頭が見える位置へ戻す。
function showBoard() {
  const board = document.querySelector('.board');
  const top = board.getBoundingClientRect().top;
  if (top < 0 || top > innerHeight * .5) board.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
}
function cancelCpu() { clearTimeout(model.timer); model.timer = null; }
function persist() { model.saved = saveProgress(model.progress); }
function initialize(id, focus = false) {
  if (!unlocked(id)) return;
  cancelCpu();
  model.phase = 'ready';
  model.game = createState(STAGES[id - 1]);
  model.solver = createSolver(model.game.stage);
  model.hints = 0;
  model.fresh = false;
  $('moves').replaceChildren(...model.game.stage.moves.map(n => {
    const button = node('button', String(n));
    button.dataset.move = n;
    button.setAttribute('aria-label', `${n}を足す`);
    button.setAttribute('aria-describedby', 'move-reason');
    button.addEventListener('click', () => play(n));
    return button;
  }));
  $('moves').style.setProperty('--cols', String(Math.min(5, model.game.stage.moves.length)));
  transition();
  if (focus) $('moves').querySelector('button:enabled')?.focus();
}
function transition() {
  const game = model.game;
  model.phase = game.winner ? 'finished' : game.turn === 'human' ? 'humanTurn' : 'cpuTurn';
  render();
  if (model.phase === 'cpuTurn' && !model.suspended) {
    cancelCpu();
    model.timer = setTimeout(() => {
      model.timer = null;
      if (model.phase !== 'cpuTurn' || model.suspended) return;
      commit(chooseCpuMove(model.solver, model.game, model.random, model.game.stage.cpuError));
    }, reduced() ? 150 : 700);
  }
}
function commit(n) {
  const by = model.game.turn;
  model.game = applyMove(model.game, n);
  model.fresh = true;
  audio.play(by);
  if (model.game.winner) {
    if (model.game.winner === 'human') {
      const id = model.game.stage.id;
      if (!model.progress.cleared.includes(id)) model.progress.cleared.push(id);
      if (!model.hints && !model.progress.noHint.includes(id)) model.progress.noHint.push(id);
      persist();
    }
    audio.play(model.game.winner === 'human' ? 'win' : 'lose');
  }
  transition();
  if (model.game.winner) showResult();
}
function play(n) {
  if (model.phase !== 'humanTurn' || !legalMoves(model.game).includes(n)) return;
  audio.unlock();
  commit(n);
}
// 番と結果の一文（文の配列）。足せる数がなくなって終わったときは、その理由を言う。
function turnParts(game, phase, win) {
  const stage = game.stage;
  if (phase === 'finished') {
    const stuck = game.total < stage.target;
    if (win) return stuck ? ['あいては足せる数がありません。', 'あなたの勝ち！'] : ['あなたの勝ち！'];
    return stuck ? [`あなたは足せる数がありません（残り${stage.target - game.total}）。`, 'あいての勝ち。'] : ['あいての勝ち。', 'もう一度、考えてみよう。'];
  }
  return phase === 'humanTurn' ? ['あなたの番です。', '数字をひとつ選ぼう。'] : ['あいてが考えています…'];
}
function render() {
  const { game, solver, phase, progress, hints } = model;
  const stage = game.stage, finished = phase === 'finished', win = game.winner === 'human';
  const stuck = finished && game.total < stage.target;
  $('target').textContent = stage.target;
  $('total').textContent = game.total;
  $('chapter').textContent = stage.chapter;
  $('stage-title').textContent = `第${stage.id}面`;
  $('board-stage').textContent = `第${stage.id}面`;
  $('board-chapter').textContent = stage.chapter;
  const ruleLine = [`ちょうど${stage.target}にした人の${stage.misere ? '負け（さかさま）' : '勝ち'}。`, `足せる数は ${describeMoves(stage.moves)}。`];
  if (Math.min(...stage.moves) > 1) ruleLine.push('足せる数がなくなった人も負け。');
  setSentences('rule-line', ruleLine);
  if (stage.misere) $('rule-line').dataset.misere = ''; else $('rule-line').removeAttribute('data-misere');
  $('allowed').textContent = describeMoves(stage.moves);
  $('rule').textContent = stage.misere ? 'ちょうどで負け' : 'ちょうどで勝ち';
  $('first').textContent = stage.first === 'human' ? 'あなたから' : 'あいてから';
  $('progress').textContent = `${progress.cleared.length} / 12 クリア`;
  $('remaining').textContent = `目標 ${stage.target} まで、あと ${stage.target - game.total}`;
  $('intro').hidden = stage.id !== 1;
  setSentences('turn', turnParts(game, phase, win));
  $('turn').dataset.turn = finished ? 'finished' : game.turn;
  $('turn').dataset.outcome = finished ? (win ? 'win' : 'lose') : '';
  for (const button of $('stage-nav').children) {
    const id = Number(button.dataset.stage);
    button.disabled = !unlocked(id);
    if (id === stage.id) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    const record = progress.noHint.includes(id) ? '◎' : progress.cleared.includes(id) ? '✓' : '';
    button.lastChild.textContent = record;
    button.setAttribute('aria-label', `第${id}面${record === '◎' ? ' ヒントなしでクリア' : record ? ' クリア' : !unlocked(id) ? ' まだ選べません' : ''}`);
  }

  // 終わったあとの説明（勝ち筋を外した手があれば、盤にも印を付ける）
  const summary = finished ? (win ? describeWin(stage, game.history) : describeLoss(stage, game.history)) : null;
  const mistakes = summary?.mistakes ?? [];
  const mistakeIndexes = new Set(mistakes.map(m => m.index));

  const rects = game.history.map(step => svgNode('rect', {
    x: (step.total - step.n) / stage.target * 1000, width: step.n / stage.target * 1000, y: 0, height: 64, class: step.by,
  }));
  for (const index of mistakeIndexes) rects[index].setAttribute('class', `${rects[index].getAttribute('class')} mistake`);
  const marks = hints >= 1 && !finished
    ? solver.winningTotals.filter(t => t < stage.target).map(t => svgNode('line', { x1: t / stage.target * 1000, x2: t / stage.target * 1000, y1: 0, y2: 64, class: 'mark' }))
    : [];
  // 外した手は、隣の積み木に隠れないよう、いちばん手前に描く
  const ordered = [...rects.filter((_, i) => !mistakeIndexes.has(i)), ...marks, ...rects.filter((_, i) => mistakeIndexes.has(i))];
  $('bar').replaceChildren(...ordered);
  const frames = mistakes.map(m => {
    const step = game.history[m.index];
    const frame = node('span', undefined, 'mistake-frame');
    frame.style.left = `${(step.total - step.n) / stage.target * 100}%`;
    frame.style.width = `${step.n / stage.target * 100}%`;
    return frame;
  });
  $('bar-wrap').replaceChildren($('bar'), ...frames);
  $('bar-wrap').classList.toggle('has-mistake', frames.length > 0);
  if (model.fresh && rects.length && !mistakeIndexes.has(rects.length - 1)) rects.at(-1).classList.add('fresh');
  model.fresh = false;
  $('bar').setAttribute('aria-label', `目標${stage.target}、いま${game.total}。朱があなた、藍があいて。${mistakes.length ? `金の枠は、勝ち筋を外したあなたの手（${mistakes.length}回）。` : ''}`);
  $('bar-caption').textContent = `${game.total} / ${stage.target}`;
  const lastStep = game.history.at(-1);
  $('last-move').textContent = lastStep ? `${lastStep.by === 'human' ? 'あなた' : 'あいて'}は ${lastStep.n} を足しました（合計 ${lastStep.total}）` : `はじめは、${stage.first === 'human' ? 'あなた' : 'あいて'}の番です。`;
  $('bar-legend').hidden = !mistakes.length;

  const start = Math.max(0, game.history.length - 6);
  $('history').replaceChildren(...game.history.slice(start).map((step, k) => ({ step, index: start + k })).reverse().map(({ step, index }) => {
    const li = node('li', undefined, `${step.by}${mistakeIndexes.has(index) ? ' mistake' : ''}`);
    li.append(node('span', `${step.by === 'human' ? 'あなた' : 'あいて'} ＋${step.n}`), node('strong', `→ ${step.total}`));
    if (mistakeIndexes.has(index)) li.append(node('em', 'ここ'));
    return li;
  }));
  if (!game.history.length) $('history').append(node('li', 'まだ、まっさらな盤です。', 'empty'));

  const wins = solver.winningMoves(game.total);
  const recommended = wins.length ? wins : finished ? [] : solver.trapMoves(game.total);
  const legal = legalMoves(game);
  for (const button of $('moves').children) {
    const n = Number(button.dataset.move);
    button.disabled = phase !== 'humanTurn' || !legal.includes(n);
    button.classList.toggle('recommended', hints >= 2 && !finished && recommended.includes(n));
  }
  $('key-notice').textContent = '';
  $('move-area').hidden = finished;
  $('move-reason').textContent = phase === 'cpuTurn' ? 'あいての番は、数字を選べません。' : stage.moves.includes(10) && !coarsePointer() ? '目標を超える数は選べません。0キーは10です。' : '目標を超える数は選べません。';

  // ヒント：数字ボタンの下に出す（出ても、数字ボタンは動かない）
  const next = solver.winningTotals.find(t => t > game.total);
  $('hint-box').hidden = finished || hints === 0;
  $('markers').replaceChildren(...(hints ? solver.winningTotals.map(t => node('span', String(t), t === next ? 'next' : t < game.total ? 'past' : '')) : []));
  setSentences('hint-text', !hints ? [] : hints === 1
    ? (next === undefined ? ['もう勝ちの合計は残っていません。'] : [`次に目指す合計は ${next}。`, '自分の手で、この数に乗せよう。'])
    : wins.length ? [`いまは ${wins.join(`${JOIN}・${JOIN}`)} を足すと、`, '勝ちをつなげます。'] : ['いまは勝ちきれる手がありません。', `${recommended.join(`${JOIN}・${JOIN}`)} を足して、あいての間違いを待とう。`]);
  $('hint-button').hidden = finished;
  $('hint-button').disabled = hints >= 2;
  $('hint-button').textContent = hints === 0 ? 'ヒントを見る' : hints === 1 ? 'おすすめの数も見る' : 'ヒントを表示中';
  $('retry-button').classList.toggle('primary', finished && !win);
  $('sound-button').setAttribute('aria-pressed', String(progress.sound));
  $('sound-button').textContent = progress.sound ? '音：あり' : '音：なし';
  $('help-panel').hidden = !model.help;
  $('help-button').setAttribute('aria-expanded', String(model.help));

  $('result').hidden = !finished;
  $('result').removeAttribute('data-result');
  $('stamp').hidden = !win;
  if (finished) {
    $('result').dataset.result = win ? 'win' : 'lose';
    const clean = win && summary.clean;
    $('result-label').textContent = win ? (clean ? '見つけた、その一手。' : 'あいてのミスにも、助けられた。') : '勝ちへの、分かれ目';
    setSentences('result-title', win ? (clean ? ['お見事。', 'あなたの勝ち。'] : ['ナイスファイト。', 'あなたの勝ち。']) : ['次は、ここを', '変えてみよう。']);
    const lines = [...summary.lines];
    if (stuck && !win) lines.unshift('このゲームは、足せる数がなくなった人の負けです。');
    if (!model.saved) lines.push('この端末では記録を保存できません。ページを開いている間は続けて遊べます。');
    setReview(lines);
  }
  // 勝てば次の面へ。負けても、次の面がすでに開いている（前にクリア済み）なら進める。
  $('next-button').hidden = !finished || stage.id === 12 || !(win || unlocked(stage.id + 1));
  $('all-clear').hidden = progress.cleared.length !== 12;
}
for (const stage of STAGES) {
  const button = node('button', String(stage.id)); button.dataset.stage = stage.id;
  button.append(node('span', '', 'record'));
  button.addEventListener('click', () => { audio.unlock(); initialize(stage.id); showBoard(); });
  $('stage-nav').append(button);
}
$('retry-button').addEventListener('click', () => { audio.unlock(); initialize(model.game.stage.id, true); });
$('next-button').addEventListener('click', () => { initialize(model.game.stage.id + 1, true); showBoard(); });
$('hint-button').addEventListener('click', () => {
  model.hints = Math.min(2, model.hints + 1); render();
  if ($('hint-box').getBoundingClientRect().top > innerHeight - 40) $('hint-box').scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
});
$('sound-button').addEventListener('click', () => {
  model.progress.sound = !model.progress.sound; audio.setEnabled(model.progress.sound); audio.unlock(); persist(); render();
});
function toggleHelp(show) { model.help = show; render(); if (!show) $('help-button').focus(); }
$('help-button').addEventListener('click', () => toggleHelp(!model.help));
$('help-close').addEventListener('click', () => toggleHelp(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && model.help) { toggleHelp(false); return; }
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    const n = event.key === '0' ? 10 : Number(event.key);
    // 足せない数のキーを押したときは、その理由を数字ボタンの下に出す
    if (model.phase === 'humanTurn' && !legalMoves(model.game).includes(n)) {
      const notice = `${n}は足せません。足せる数は ${describeMoves(legalMoves(model.game))} です。`;
      $('move-reason').textContent = notice;
      $('key-notice').textContent = notice; // 読み上げ用（画面には出さない）
      return;
    }
    play(n);
  }
});
document.addEventListener('pointerdown', () => audio.unlock());
document.addEventListener('keydown', () => audio.unlock());
// ページを離れる・タブを隠すと、待ち中のあいての手を取り消す。戻ったら、その番を一度だけ予約し直す。
function suspend() { model.suspended = true; cancelCpu(); }
function resume() { if (model.suspended) { model.suspended = false; transition(); } }
window.addEventListener('pagehide', suspend);
window.addEventListener('pageshow', resume);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else resume(); });
initialize(firstOpenStage());
