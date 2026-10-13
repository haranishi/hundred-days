/* 箱影の怪盗：画面の状態と入力。
   ルールは lib/sim.js だけが決める。ここは act() の結果を画面に反映し、描くのは scene() の結果だけ（光・影・判定・予告を計算し直さない）。
   1手：act() を同期で進めて状態を確定 → 怪盗・箱・警備員を150msで動かす → 動きの終わり（タイマー。rAF には頼らない）に盤を描き直し、結果の欄を出す。
   動きの途中で次の入力が来たら、今の動きを終わりの位置へ飛ばしてから進める（入力を捨てない・ためない）。 */
import { LEVELS } from './lib/levels-data.js';
import { loadLevel, initialState, act, canWin, starsFor, guardPose, same, DIRS } from './lib/sim.js';
import { layoutMode, cellSize, SIZES, gutter } from './lib/layout.js';
import { drawBoard, movePieces, bumpPlayer } from './lib/render.js';
import { boardLines } from './lib/board-text.js';
import { createAudio } from './lib/audio.js';
import { loadProgress, saveProgress, levelRecord, recordClear, withMuted, withLetterKeys, firstOpenIndex, allCleared, totalStars } from './lib/progress.js';
import * as T from './lib/phrase.js';
import { starRow } from './lib/icons.js';
import { h, fill, phrased, phrasedAt } from './lib/dom.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const el = {
  app: $('app'), band: $('band'), titlebar: $('titlebar'), titlebarText: $('titlebar-text'), title: $('app-title'), tools: $('tools'), share: $('btn-share'),
  howto: $('btn-howto'), howtoDialog: $('howto-dialog'), howtoClose: $('btn-howto-close'), letterKeys: $('opt-letter-keys'), sound: $('btn-sound'),
  levelbar: $('levelbar'), prev: $('btn-prev'), nextLevel: $('btn-next-level'), levelsBtn: $('btn-levels'), levelNo: $('level-no'), levelStars: $('level-stars'), levelName: $('level-name'),
  levelwrap: $('levelwrap'), hintBtn: $('btn-hint'), hintline: $('hintline'), hint: $('hint'), hintClose: $('btn-hint-close'), levelTitle: $('level-title'),
  boardWrap: $('board-wrap'), board: $('board'), toast: $('toast'), boardText: $('board-text'), boardLines: $('board-lines'),
  dock: $('dock'), status: $('status'), statusMain: $('status-main'), statusDemo: $('status-demo'), steps: $('steps'), par: $('par'), treasureState: $('treasure-state'),
  demoBtn: $('btn-demo'), demoStop: $('btn-demo-stop'), demoProgress: $('demo-progress'),
  controls: $('controls'), undo: $('btn-undo'), restart: $('btn-restart'), wait: $('btn-wait'),
  panelCaught: $('panel-caught'), caughtTitle: $('caught-title-text'), caughtText: $('caught-text'), caughtUndo: $('btn-caught-undo'), caughtRestart: $('btn-caught-restart'), caughtDemo: $('btn-caught-demo'),
  panelDead: $('panel-dead'), deadTitle: $('dead-title-text'), deadText: $('dead-text'), deadUndo: $('btn-dead-undo'), deadRestart: $('btn-dead-restart'), deadDemo: $('btn-dead-demo'),
  panelClear: $('panel-clear'), clearTitle: $('clear-title-text'), clearStars: $('clear-stars'), clearStarsText: $('clear-stars-text'), clearSteps: $('clear-steps'), clearNote: $('clear-note'),
  next: $('btn-next'), again: $('btn-again'), shareX: $('share-x'), shareLine: $('share-line'), shareCopy: $('share-copy'), shareNative: $('share-native'), shareSaid: $('share-said'), shareRow: $('share-row'),
  levelDialog: $('level-dialog'), levelList: $('level-list'), levelsClose: $('btn-levels-close'),
  shareDialog: $('share-dialog'), shareClose: $('btn-share-close'), live: $('live'), keyHelp: $('keyhelp'), howtoKeys: $('howto-keys'),
};
const pads = [...el.controls.querySelectorAll('.pad')];

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
let progress = loadProgress(storage);
const audio = createAudio({ muted: progress.muted });

const DEMO_STEP_MS = 700; // お手本の1手。400msでは速くて目で追えなかった（体験評価）
const BUMP_MS = 120;

// 画面の今。history は state の配列（最後が今）。status は play・caught・dead・escaped・demo
const game = { index: 0, data: LEVELS[0], level: null, history: [], status: 'play', fails: 0, markBox: null, cell: 56 };
const view = { motion: null, demo: null, hintOpen: false, toastTimer: 0, toastSeq: 0, liveTimer: 0, copyTimer: 0, pendingLayout: false, opener: null };

const cur = () => game.history[game.history.length - 1];

// CSS のトークン（--dur-move など）を ms で読む。動きを減らす設定では 0ms になる
function cssMs(name) {
  const v = getComputedStyle(root).getPropertyValue(name).trim();
  if (v.endsWith('ms')) return parseFloat(v);
  if (v.endsWith('s')) return parseFloat(v) * 1000;
  return 0;
}

// ---------------------------------------------------------------- 一言と読み上げ

function clearToast() {
  view.toastSeq += 1;
  clearTimeout(view.toastTimer);
  el.toast.classList.remove('is-on', 'is-off');
  el.toast.textContent = '';
}

// long：長い文を数秒出す（お手本の終わりの文）。一言は #toast（読み上げには出さない）と announce（読み上げ）を組で使う
function toast(text, { long = false } = {}) {
  clearToast();
  const seq = view.toastSeq;
  el.toast.textContent = text;
  el.toast.classList.add('is-on');
  view.toastTimer = setTimeout(() => {
    if (seq !== view.toastSeq) return;
    el.toast.classList.replace('is-on', 'is-off');
    view.toastTimer = setTimeout(() => {
      if (seq === view.toastSeq) clearToast();
    }, cssMs('--dur-out'));
  }, cssMs(long ? '--dur-toast-long' : '--dur-toast'));
}

// 同じ文が続いても読み上げられるよう、いったん空にしてから入れる
function announce(text) {
  clearTimeout(view.liveTimer);
  el.live.textContent = '';
  view.liveTimer = setTimeout(() => {
    el.live.textContent = text;
  }, 50);
}

// ---------------------------------------------------------------- 画面の型と盤のマス

function placeTools(mode) {
  const inBand = mode === 'tiny' || mode === 'short';
  const focused = document.activeElement;
  if (inBand && el.tools.parentElement !== el.band) {
    el.band.insertBefore(el.title, el.share);
    el.band.insertBefore(el.tools, el.share);
  } else if (!inBand && el.tools.parentElement !== el.titlebar) {
    el.titlebarText.prepend(el.title);
    el.titlebar.append(el.tools);
  }
  if (focused && focused !== document.body && document.activeElement !== focused && focused.isConnected) focused.focus({ preventScroll: true });
}

/* ヒントと一言（#hintline）を置く場所。tall・short・wide は面の帯の下（ヒントは常に出る）。
   compact・tiny は状態の行（手数・最少・宝）と同じ場所に重ねる（盤の外。ヒントを開いても閉じても、行の高さは同じなので盤は動かない）。 */
function placeHint(mode) {
  const inStatus = mode === 'compact' || mode === 'tiny';
  const host = inStatus ? el.status : el.levelwrap;
  if (el.hintline.parentElement === host) return;
  const focused = document.activeElement;
  if (inStatus) el.status.prepend(el.hintline);
  else el.levelwrap.append(el.hintline);
  if (focused && focused !== document.body && document.activeElement !== focused && focused.isConnected) focused.focus({ preventScroll: true });
}

// compact・tiny では、ヒントを切替で開く（状態の行に差し替える）。ほかの型では、ヒントは常に出ている
function applyHint(mode) {
  const popover = mode === 'compact' || mode === 'tiny';
  const open = popover && view.hintOpen;
  el.hintBtn.hidden = !popover;
  el.hintBtn.setAttribute('aria-expanded', String(open));
  el.hintClose.hidden = !open;
  el.hintline.dataset.open = popover && !open ? '0' : '1';
  el.status.dataset.hint = open ? '1' : '0'; // 開いている間は、同じ場所の「手数・最少・宝」を隠す
}

// 手を動かす・やり直す・面を変えると、ヒントは自動で閉じる（閉じるボタンに焦点があったときは、開いたボタンへ戻す）
function closeHint() {
  if (!view.hintOpen) return;
  view.hintOpen = false;
  const hadFocus = document.activeElement === el.hintClose;
  applyHint(root.dataset.layout);
  if (hadFocus) el.hintBtn.focus({ preventScroll: true });
}

// 実際に描いた帯・題字・面の帯・ヒント・状態・操作の高さを測る（盤を除いた合計）。文字だけの拡大でも、盤が操作の下にもぐらない。
// dock は状態の行と操作（play のときの下の固定帯）の高さ
function measureLayout(mode) {
  const parts = [el.status, el.controls, el.panelCaught, el.panelDead, el.panelClear, el.statusMain, el.statusDemo];
  const saved = parts.map((n) => n.hidden);
  root.classList.add('is-measuring');
  el.status.hidden = false;
  el.controls.hidden = false;
  el.statusMain.hidden = false;
  el.statusDemo.hidden = true;
  el.panelCaught.hidden = true;
  el.panelDead.hidden = true;
  el.panelClear.hidden = true;
  let reserve;
  let dock = 0;
  if (mode === 'short' || mode === 'wide') {
    reserve = el.boardWrap.getBoundingClientRect().top + window.scrollY + SIZES[mode].bottom;
  } else {
    const bottom = el.controls.getBoundingClientRect().bottom + window.scrollY;
    reserve = bottom - el.boardWrap.getBoundingClientRect().height + SIZES[mode].bottom;
    dock = bottom - (el.status.getBoundingClientRect().top + window.scrollY);
  }
  parts.forEach((n, i) => {
    n.hidden = saved[i];
  });
  root.classList.remove('is-measuring');
  return { reserve, dock };
}

function applyLayout({ force = false } = {}) {
  view.pendingLayout = false;
  const vw = root.clientWidth;
  const vh = window.innerHeight;
  const mode = layoutMode(vw, vh);
  const S = SIZES[mode];
  root.dataset.layout = mode;
  const set = (name, value) => root.style.setProperty(name, value);
  set('--h-band', `${S.band}px`);
  set('--h-title', `${S.title}px`);
  set('--h-levelbar', `${S.levelBar}px`);
  set('--h-hint', `${S.hint}px`);
  set('--h-status', `${S.status}px`);
  set('--pad', `${S.pad}px`);
  set('--pad-gap', `${S.padGap}px`);
  set('--gap', `${S.padGap}px`);
  set('--gutter', `${gutter(vw)}px`);
  set('--bottom', `${S.bottom}px`);
  placeTools(mode);
  placeHint(mode);
  applyHint(mode);
  const { reserve, dock } = measureLayout(mode);
  // 操作が画面の半分を超えるほど小さい画面（拡大の倍率が大きいとき）は、固定すると盤が隠れるので、固定をやめて普通にスクロールさせる
  root.classList.toggle('is-dock-free', dock > vh * 0.5);
  const cell = cellSize({ vw, vh, cols: game.level.w, rows: game.level.h, reserve });
  const changed = cell !== game.cell;
  game.cell = cell;
  set('--cell', `${cell}px`);
  if (changed || force) redraw(); // 大きさが同じなら描き直さない（見つかった印の点滅などをやり直さないため）
}

// 動きの途中で盤の大きさが変わるときは、先に終わりの位置へ飛ばす
function relayout() {
  if (view.motion || view.demo) {
    view.pendingLayout = true;
    return;
  }
  applyLayout();
}

// ---------------------------------------------------------------- 描画

function drawStatus() {
  // お手本の最後の1手で出口に着いたときは、怪盗が扉へ消えた絵にする（結果の欄は出さない）
  return game.status === 'demo' && cur().status === 'escaped' ? 'escaped' : game.status;
}

function redraw() {
  const s = cur();
  const status = drawStatus();
  drawBoard(el.board, game.level, s, { cell: game.cell, status, markBox: game.markBox });
  el.board.setAttribute('aria-label', T.boardLabel({ no: game.data.no, cols: game.level.w, rows: game.level.h, x: s.player[0], y: s.player[1], treasure: s.treasure }));
  fill(el.boardLines, ...boardLines(game.level, s, { showNext: status === 'play' || status === 'demo' }).map((line) => h('li', null, ...phrased(line))));
}

function renderChrome() {
  const L = game.data;
  const rec = levelRecord(progress, L.id);
  el.app.dataset.level = L.id;
  el.levelNo.textContent = T.levelNo(L.no);
  fill(el.levelStars, starRow(rec.stars));
  el.levelName.textContent = L.name;
  el.levelsBtn.setAttribute('aria-label', T.levelButtonLabel(L.no, L.name, rec.stars));
  el.prev.setAttribute('aria-disabled', String(game.index === 0));
  el.nextLevel.setAttribute('aria-disabled', String(game.index === LEVELS.length - 1));
  fill(el.hint, ...phrased(L.hint));
  el.levelTitle.textContent = T.levelHeading(L.no, L.name);
}

// 状態の行・属性・ボタンの有無。入力の瞬間に更新する（欄は動きの終わりに出す）
function renderStatus() {
  const s = cur();
  el.app.dataset.status = game.status;
  el.app.dataset.steps = String(s.steps);
  el.app.dataset.treasure = s.treasure ? '1' : '0';
  el.app.dataset.fails = String(game.fails);
  el.steps.textContent = String(s.steps);
  el.par.textContent = String(game.data.par);
  el.treasureState.textContent = T.treasureWord(s.treasure);
  const demo = game.status === 'demo';
  el.undo.setAttribute('aria-disabled', String(demo || game.history.length <= 1));
  el.restart.setAttribute('aria-disabled', String(demo || s.steps === 0));
  for (const b of pads) if (b !== el.undo && b !== el.restart) b.setAttribute('aria-disabled', String(demo));
}

// 結果の欄（見つかった・詰み・成功）は操作の場所に差し替えて出す。窓にはしない
function renderDock() {
  const st = game.status;
  const play = st === 'play' || st === 'demo';
  const hadButton = el.status.classList.contains('has-button');
  el.status.hidden = !play;
  el.controls.hidden = !play;
  el.statusMain.hidden = st === 'demo';
  el.statusDemo.hidden = st !== 'demo';
  el.demoBtn.hidden = !(st === 'play' && game.fails >= 2);
  el.status.classList.toggle('has-button', !el.demoBtn.hidden || st === 'demo');
  el.panelCaught.hidden = st !== 'caught';
  el.panelDead.hidden = st !== 'dead';
  el.panelClear.hidden = st !== 'escaped';
  el.caughtDemo.hidden = game.fails < 2;
  el.deadDemo.hidden = game.fails < 2;
  if (hadButton !== el.status.classList.contains('has-button')) relayout();
}

// ---------------------------------------------------------------- 面

function startLevel(i, { focus = false, hint = false } = {}) {
  finishMotion();
  stopDemo({ quiet: true, keepStatus: true });
  view.hintOpen = hint; // 面を変えると閉じる。起動したときの面1の初回だけ、開いて始める（boot）
  game.index = i;
  game.data = LEVELS[i];
  game.level = loadLevel(game.data);
  game.history = [initialState(game.level)];
  game.status = 'play';
  game.fails = 0;
  game.markBox = null;
  clearToast();
  renderChrome();
  renderStatus();
  renderDock();
  applyLayout({ force: true });
  if (focus) el.wait.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- 動き

function startMotion(events, after) {
  const ms = cssMs('--dur-move');
  const piece = movePieces(el.board, events, ms);
  view.motion = { piece, after, timer: 0 };
  el.app.dataset.moving = '1';
  if (ms <= 0) {
    finishMotion();
    return;
  }
  view.motion.timer = setTimeout(finishMotion, ms + 20);
}

// 動いている途中でも、終わりの位置へ飛ばして後始末まで済ませる（何度呼んでもよい）
function finishMotion() {
  const m = view.motion;
  if (!m) return;
  view.motion = null;
  clearTimeout(m.timer);
  m.piece.finish();
  delete el.app.dataset.moving;
  m.after();
  if (view.pendingLayout && !view.demo) applyLayout();
}

function sound(events, status) {
  const pushed = events.some((e) => e.type === 'push');
  const moved = events.some((e) => e.type === 'move');
  audio.play(pushed ? 'push' : moved ? 'step' : 'wait');
  if (events.some((e) => e.type === 'treasure') && status !== 'caught') setTimeout(() => audio.play('treasure'), 80);
}

// 動こうとしたマスにいる光源の種類（'watch'＝見張り・'patrol'＝警備員）。sim の理由は、どちらでも guard
function blockerKind(action) {
  const s = cur();
  const to = [s.player[0] + DIRS[action][0], s.player[1] + DIRS[action][1]];
  const i = game.level.guards.findIndex((_, k) => same(guardPose(game.level, k, s.guards[k]).at, to));
  return i < 0 ? undefined : game.level.guards[i].kind;
}

function bump(action, reason) {
  audio.play('bump');
  const text = T.bumpText(reason, reason === 'guard' ? blockerKind(action) : undefined);
  if (text) {
    toast(text);
    announce(text);
  }
  if (cssMs('--dur-move') > 0) bumpPlayer(el.board, action, BUMP_MS, game.cell);
}

function showCaught(caught) {
  const t = T.caughtText(game.level, caught);
  el.caughtTitle.textContent = t.title;
  fill(el.caughtText, ...t.lines.map((line) => h('span', null, ...phrased(line))));
  el.caughtUndo.focus({ preventScroll: true });
  announce(`${t.title} ${t.lines.join('')}`);
}

function showDead() {
  const t = T.deadText();
  el.deadTitle.textContent = t.title;
  fill(el.deadText, ...t.lines.map((line) => h('span', null, ...phrased(line))));
  el.deadUndo.focus({ preventScroll: true });
  announce(`${t.title} ${t.lines.join('')}`);
}

function shareUrl() {
  return document.querySelector('link[rel="canonical"]')?.href || `${location.origin}${location.pathname}`;
}

function showClear(prevBest) {
  const s = cur();
  const L = game.data;
  const best = levelRecord(progress, L.id).best;
  const t = T.clearText({ par: L.par, steps: s.steps, best, prevBest });
  // 全面に星が付いたあとの面8：見出しを「全8面クリア！」にし（「脱出成功！」と重ねない）、星の合計を出す
  const all = L.no === LEVELS.length && allCleared(progress);
  const title = all ? T.allClearText() : t.title;
  const total = all ? T.starTotalText(totalStars(progress)) : '';
  el.panelClear.dataset.all = all ? '1' : '0';
  el.clearTitle.textContent = title;
  fill(el.clearStars, starRow(t.stars));
  el.clearStars.dataset.stars = String(t.stars);
  el.clearStarsText.textContent = t.starsText;
  el.clearSteps.textContent = t.stepsText;
  fill(el.clearNote, ...[t.note, t.record, total].filter(Boolean).map((line) => h('span', null, ...phrased(line))));
  el.next.textContent = game.index === LEVELS.length - 1 ? T.LEVELS_BUTTON : T.NEXT_BUTTON;
  const text = T.shareText({ no: L.no, name: L.name, stars: t.stars, steps: s.steps });
  const url = shareUrl();
  el.shareX.href = T.xIntentUrl(text, url);
  el.shareLine.href = T.lineIntentUrl(text, url);
  el.shareNative.hidden = typeof navigator.share !== 'function';
  el.shareRow.dataset.count = String(el.shareNative.hidden ? 3 : 4);
  clearTimeout(view.copyTimer);
  el.shareCopy.textContent = T.COPY_LABEL;
  el.shareCopy.dataset.done = '0';
  el.shareSaid.textContent = '';
  el.next.focus({ preventScroll: true });
  announce([title, t.starsText, t.stepsText, t.note, t.record, total].filter(Boolean).join('。'));
}

// 動きの終わり：盤を描き直し、結果の欄を出す
function settle(status, prevBest) {
  redraw();
  renderDock();
  if (status === 'caught') {
    audio.play('caught');
    showCaught(cur().caught);
  } else if (status === 'dead') {
    audio.play('dead');
    showDead();
  } else if (status === 'escaped') {
    audio.play('clear');
    showClear(prevBest);
  }
}

// ---------------------------------------------------------------- 入力

function perform(action) {
  audio.unlock();
  finishMotion();
  if (game.status !== 'play') return false;
  const r = act(game.level, cur(), action);
  if (!r.valid) {
    bump(action, r.reason);
    return false;
  }
  closeHint();
  game.history.push(r.state);
  const pushed = r.events.find((e) => e.type === 'push');
  let status = 'play';
  let prevBest = null;
  if (r.state.status === 'caught') {
    status = 'caught';
    game.fails += 1;
  } else if (r.state.status === 'escaped') {
    status = 'escaped';
    const L = game.data;
    prevBest = levelRecord(progress, L.id).best;
    progress = recordClear(progress, L.id, starsFor(L.par, r.state.steps), r.state.steps);
    saveProgress(storage, progress);
  } else if (pushed && canWin(game.level, r.state) === 'dead') {
    status = 'dead';
    game.fails += 1;
    game.markBox = pushed.box;
  }
  game.status = status;
  renderStatus();
  sound(r.events, status);
  if (status === 'play') announce(T.moveText(r.events, r.state.steps));
  if (status === 'escaped') renderChrome();
  startMotion(r.events, () => settle(status, prevBest));
  return true;
}

function afterRewind() {
  renderStatus();
  renderDock();
  redraw();
}

function undo() {
  audio.unlock();
  finishMotion();
  if (game.status === 'demo' || game.status === 'escaped' || game.history.length <= 1) return;
  const hadPanel = game.status !== 'play';
  closeHint();
  game.history.pop();
  game.status = 'play';
  game.markBox = null;
  clearToast();
  afterRewind();
  if (hadPanel) el.undo.focus({ preventScroll: true });
}

function restart() {
  audio.unlock();
  finishMotion();
  if (game.status === 'demo') return;
  if (game.status === 'escaped') {
    playAgain();
    return;
  }
  if (cur().steps === 0) return;
  const hadPanel = game.status !== 'play';
  closeHint();
  game.history.push(initialState(game.level));
  game.status = 'play';
  game.markBox = null;
  afterRewind();
  toast(T.RESTART_TOAST);
  announce(T.RESTART_TOAST);
  if (hadPanel) el.restart.focus({ preventScroll: true });
}

// 成功のあとの「もう一度遊ぶ」：記録は残したまま、同じ面を最初から
function playAgain() {
  finishMotion();
  game.history = [initialState(game.level)];
  game.status = 'play';
  game.markBox = null;
  clearToast();
  afterRewind();
  el.wait.focus({ preventScroll: true });
}

function nextLevel() {
  finishMotion();
  if (game.index < LEVELS.length - 1) startLevel(game.index + 1, { focus: true });
  else {
    renderLevelList();
    openDialog(el.levelDialog, el.next);
  }
}

// ---------------------------------------------------------------- お手本（最短解を1手700msで再生。星も記録も付けない）

function startDemo() {
  audio.unlock();
  finishMotion();
  if (game.status === 'demo' || game.status === 'escaped') return; // 失敗の欄からも、状態の行の「お手本」（play）からも始められる
  closeHint();
  game.history = [initialState(game.level)];
  game.status = 'demo';
  game.markBox = null;
  view.demo = { i: 0, timer: 0 };
  el.demoProgress.textContent = T.demoProgress(0, game.data.par);
  renderStatus();
  renderDock();
  redraw();
  announce(T.DEMO_START);
  el.demoStop.focus({ preventScroll: true });
  view.demo.timer = setTimeout(demoStep, DEMO_STEP_MS);
}

function demoStep() {
  const d = view.demo;
  if (!d) return;
  finishMotion();
  const moves = game.data.solution;
  if (d.i >= moves.length) {
    stopDemo({});
    return;
  }
  const r = act(game.level, cur(), moves[d.i]);
  d.i += 1;
  game.history.push(r.state);
  el.demoProgress.textContent = T.demoProgress(d.i, game.data.par);
  renderStatus();
  sound(r.events, 'play');
  startMotion(r.events, () => redraw());
  d.timer = setTimeout(demoStep, DEMO_STEP_MS);
}

// お手本の終わり・とめる：最初の状態に戻す（星も記録も付けない）。quiet は裏のタブや面の切替で、読み上げと移動を省く
function stopDemo({ quiet = false, keepStatus = false } = {}) {
  const d = view.demo;
  if (!d) return;
  clearTimeout(d.timer);
  view.demo = null;
  finishMotion();
  if (keepStatus) return;
  game.history = [initialState(game.level)];
  game.status = 'play';
  game.markBox = null;
  afterRewind();
  if (!quiet) {
    announce(T.DEMO_END);
    toast(T.DEMO_END, { long: true }); // 読み上げには #live だけを使う（#toast は aria-hidden）。画面には数秒、見える形でも出す
    el.wait.focus({ preventScroll: true });
  }
  if (view.pendingLayout) applyLayout();
}

// ---------------------------------------------------------------- 窓

function anyDialogOpen() {
  return el.howtoDialog.open || el.levelDialog.open || el.shareDialog.open;
}

function openDialog(dialog, opener, focusTarget) {
  view.opener = opener ?? document.activeElement;
  if (!dialog.open) dialog.showModal();
  if (focusTarget) focusTarget.focus({ preventScroll: true });
}

/* 窓を閉じる（ボタン・背景を押したとき）。標準の動作で、開いたボタンへ焦点が同期に戻る。
   戻らなかったときの保険も、閉じた直後（同期）にだけ行う。閉じたあとの非同期のイベントで、いつも焦点を戻すと、
   そのあいだに別の場所へ移した焦点を奪い返してしまう（試験で実際に起きた）。Esc で閉じたときは、下の bindDialog の close イベントが、焦点が無いときだけ戻す */
function closeDialog(dialog) {
  const back = view.opener;
  view.opener = null;
  dialog.close();
  if (back && back.isConnected && !back.hidden && document.activeElement !== back) back.focus({ preventScroll: true });
}

// focusTarget：開いた直後に焦点を置く所。省くと、窓の最初の押せるもの（あそびかたでは設定のスイッチに乗り、そのまま Space で設定が変わる事故になるので、「とじる」に置く）
function bindDialog(dialog, opener, closer, onOpen, focusTarget) {
  opener.addEventListener('click', () => {
    onOpen?.();
    openDialog(dialog, opener, focusTarget);
  });
  closer.addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    if (!inside) closeDialog(dialog);
  });
  /* Esc など、ブラウザが閉じた場合。Safari はクリックでボタンに焦点を当てないので、標準の戻しが効かず、焦点がどこにも無くなる。
     そのときだけ、開いたボタンへ戻す。別の場所に焦点があるときは奪わない（closeDialog の経路は、上で opener を空にしてあるので何もしない）。
     close イベントの時点では、閉じた窓の中のボタンが activeElement のまま残っている（Chromium で実測。焦点の整理は少しあと）ので、それも「焦点が無い」に数える */
  dialog.addEventListener('close', () => {
    const back = view.opener;
    view.opener = null;
    const active = document.activeElement;
    const lost = !active || active === document.body || dialog.contains(active);
    if (back && back.isConnected && !back.hidden && lost) back.focus({ preventScroll: true });
  });
}

function renderLevelList() {
  fill(el.levelList, ...LEVELS.map((L, i) => {
    const rec = levelRecord(progress, L.id);
    return h('li', null, h('button', {
      class: 'level-row',
      type: 'button',
      'data-level': L.id,
      'aria-label': T.levelRowLabel(L.no, L.name, rec.stars, rec.best),
      'aria-current': i === game.index ? 'true' : null,
      onclick: () => {
        view.opener = null;
        el.levelDialog.close();
        if (i !== game.index) startLevel(i, { focus: true });
        else el.wait.focus({ preventScroll: true });
      },
    },
    h('span', { class: 'level-row__name', text: T.levelHeading(L.no, L.name) }),
    h('span', { class: 'level-row__record', text: T.levelRowRecord(rec.best) }),
    starRow(rec.stars)));
  }));
}

function renderSound() {
  el.sound.dataset.muted = audio.muted ? '1' : '0';
  el.sound.setAttribute('aria-label', T.soundLabel(audio.muted));
}

// 十字ボタンに付けた aria-keyshortcuts の元の値（文字のキーを含む）。文字のキーをやめたら、文字のキーを外す
const baseShortcuts = new Map(pads.map((b) => [b, b.getAttribute('aria-keyshortcuts')]));

// 文字のキー（WASD・Z・R）を使うかどうかで、キーの案内（盤の横とあそびかた）と、ボタンに付けた読み上げ用のキーの案内を切り替える
function renderLetterKeys() {
  const on = progress.letterKeys;
  el.letterKeys.setAttribute('aria-checked', String(on));
  for (const node of [el.keyHelp, el.howtoKeys]) fill(node, ...phrasedAt(T.keyHelp(on)));
  for (const [b, base] of baseShortcuts) {
    const keys = (base ?? '').split(' ').filter((k) => on || k.length > 1).join(' ');
    if (keys) b.setAttribute('aria-keyshortcuts', keys);
    else b.removeAttribute('aria-keyshortcuts');
  }
}

// ---------------------------------------------------------------- キー

const ARROWS = { ArrowUp: 'U', ArrowRight: 'R', ArrowDown: 'D', ArrowLeft: 'L' };
const LETTERS = { w: 'U', d: 'R', s: 'D', a: 'L' };

/* Space は「待つ」。ボタンに焦点があっても待つ。例外は、キーボードの Tab で焦点を当てたボタンだけ（そのボタンを押す）。
   マウス・タップで押して焦点が残っているだけのボタンと、アプリが動かした焦点（見つかった欄から「戻す」へ、など）では、待つ。
   見分けに :focus-visible は使えない：Chromium は、最初のキー入力の keydown の中で、マウスで押したボタンにも :focus-visible を真にする（実測）。
   そこで、Tab の keydown の直後に当たった焦点だけを覚える。 */
const tabFocus = { armed: false, target: null };
document.addEventListener('keydown', (event) => {
  tabFocus.armed = event.key === 'Tab';
  if (tabFocus.armed) setTimeout(() => { tabFocus.armed = false; }, 0); // 焦点の移動は同じ処理の中で終わる。動かなかった Tab を引きずらない
}, true);
document.addEventListener('pointerdown', () => {
  tabFocus.armed = false;
  tabFocus.target = null;
}, true);
document.addEventListener('focusin', (event) => {
  tabFocus.target = tabFocus.armed ? event.target : null;
  tabFocus.armed = false;
});

/* Space を「待つ」として受けた押下は、離したときの既定の動作（焦点のあるボタンを押す）も止める。Firefox は keyup でボタンを押す。
   押している間に結果の欄が出て焦点が移っても（見つかった直後の「ひとつ戻す」など）、離した Space は何も押さない。 */
let spaceTaken = false;
document.addEventListener('keyup', (event) => {
  if (event.key !== ' ' || !spaceTaken) return;
  spaceTaken = false;
  event.preventDefault();
}, true);
window.addEventListener('blur', () => { spaceTaken = false; });

function onKey(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (anyDialogOpen()) return;
  const t = event.target;
  const node = t instanceof Element ? t : null;
  if (node?.closest('input, textarea, select, [contenteditable="true"]')) return;
  const key = event.key;
  // 盤を文で読む（開いている間）：矢印などは文のスクロールに使い、盤は動かさない。Esc で閉じる
  const reading = node?.closest('.boardtext[open]');
  if (reading) {
    if (key === 'Escape') {
      event.preventDefault();
      reading.open = false;
      reading.querySelector('summary').focus({ preventScroll: true });
    }
    return;
  }
  if (game.status === 'demo') {
    if (key === 'Escape') {
      event.preventDefault();
      stopDemo({});
    }
    return;
  }
  if (key === 'Escape' && view.hintOpen) {
    event.preventDefault();
    closeHint();
    return;
  }
  // ボタン・リンク・summary に焦点があるとき、Enter はその本来の動作だけにする（二重に動かない）。Space は下で決める
  const control = node?.closest('button, a, summary, [role="switch"]') ?? null;
  const letter = key.length === 1 && progress.letterKeys ? key.toLowerCase() : '';
  const dir = ARROWS[key] ?? LETTERS[letter];
  if (dir) {
    if (game.status === 'play') {
      event.preventDefault();
      perform(dir);
    }
    return;
  }
  if (key === ' ') {
    if (game.status !== 'play') return; // 結果の欄・お手本の間は、焦点のあるボタンの本来の動作
    if (control && control === tabFocus.target) return; // Tab で焦点を当てたボタン：そのボタンだけを押す
    event.preventDefault();
    spaceTaken = true;
    perform('.');
    return;
  }
  if (key === 'Backspace' || letter === 'z') {
    if (game.status === 'escaped') return;
    event.preventDefault();
    undo();
    return;
  }
  if (letter === 'r') {
    event.preventDefault();
    restart();
  }
}

// ---------------------------------------------------------------- つなぐ

for (const b of pads) {
  b.addEventListener('click', () => {
    if (b.getAttribute('aria-disabled') === 'true') return;
    const a = b.dataset.action;
    if (a === 'undo') undo();
    else if (a === 'restart') restart();
    else perform(a);
  });
}
document.addEventListener('keydown', onKey);
document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });

el.caughtUndo.addEventListener('click', undo);
el.deadUndo.addEventListener('click', undo);
el.caughtRestart.addEventListener('click', restart);
el.deadRestart.addEventListener('click', restart);
el.caughtDemo.addEventListener('click', startDemo);
el.deadDemo.addEventListener('click', startDemo);
el.demoBtn.addEventListener('click', startDemo);
el.demoStop.addEventListener('click', () => stopDemo({}));
el.next.addEventListener('click', nextLevel);
el.again.addEventListener('click', playAgain);

el.prev.addEventListener('click', () => {
  if (el.prev.getAttribute('aria-disabled') !== 'true' && game.index > 0) startLevel(game.index - 1, { focus: true });
});
el.nextLevel.addEventListener('click', () => {
  if (el.nextLevel.getAttribute('aria-disabled') !== 'true' && game.index < LEVELS.length - 1) startLevel(game.index + 1, { focus: true });
});
el.hintBtn.addEventListener('click', () => {
  view.hintOpen = !view.hintOpen;
  applyHint(root.dataset.layout);
});
el.hintClose.addEventListener('click', closeHint);

el.sound.addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  progress = withMuted(progress, audio.muted);
  saveProgress(storage, progress);
  renderSound();
});
el.letterKeys.addEventListener('click', () => {
  progress = withLetterKeys(progress, !progress.letterKeys);
  saveProgress(storage, progress);
  renderLetterKeys();
});

bindDialog(el.howtoDialog, el.howto, el.howtoClose, undefined, el.howtoClose);
bindDialog(el.levelDialog, el.levelsBtn, el.levelsClose, renderLevelList);
bindDialog(el.shareDialog, el.share, el.shareClose);

/* 共通の部品（shared/share.js）が出す文（説明 .share__note・コピーの合図 .share__said）にも、折り返しの決まりを使う。
   部品は直さない。窓の中に部品が据え付いたあと（と、合図の文が入れ替わるたび）に、同じ文字のまま、区切り（<wbr>）入りの並びへ置き換える。
   以前は区切りが無く、非常用の折り返し（overflow-wrap: anywhere）が「直／接」「リ／ンク」と語の途中で割っていた。
   自分で入れた子が先頭にあれば、もう済み（置き換えが、自分の観察を呼び起こして終わらなくなるのを防ぐ） */
const shareRoot = $('share');
if (shareRoot) {
  const mine = new WeakSet();
  const polishShare = () => {
    for (const node of shareRoot.querySelectorAll('.share__note, .share__said')) {
      const text = node.textContent;
      if (!text || (node.firstChild && mine.has(node.firstChild))) continue;
      const parts = phrased(text);
      for (const part of parts) mine.add(part);
      fill(node, ...parts);
    }
  };
  polishShare();
  new MutationObserver(polishShare).observe(shareRoot, { childList: true, subtree: true });
}

// 結果を送る：Xとして開くリンク・LINE・リンクのコピー・端末の共有シート
el.shareCopy.addEventListener('click', async () => {
  const url = shareUrl();
  let ok = false;
  try {
    await navigator.clipboard.writeText(url);
    ok = true;
  } catch {
    const area = h('textarea', { readonly: '', 'aria-hidden': 'true' });
    area.value = url;
    document.body.append(area);
    area.select();
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
  }
  const text = ok ? T.COPIED : T.COPY_FAILED;
  // 成功は、ボタンの文字を数秒だけ差し替えて知らせる（空けておく欄を作らない）。失敗の文だけ、行を出す
  clearTimeout(view.copyTimer);
  el.shareSaid.textContent = ok ? '' : text;
  el.shareCopy.textContent = ok ? T.COPIED : T.COPY_LABEL;
  el.shareCopy.dataset.done = ok ? '1' : '0';
  view.copyTimer = setTimeout(() => {
    el.shareCopy.textContent = T.COPY_LABEL;
    el.shareCopy.dataset.done = '0';
    el.shareSaid.textContent = '';
  }, 2400);
  toast(text);
  announce(text);
});
el.shareNative.addEventListener('click', async () => {
  const L = game.data;
  const s = cur();
  const text = T.shareText({ no: L.no, name: L.name, stars: starsFor(L.par, s.steps), steps: s.steps });
  try {
    await navigator.share({ title: text, text, url: shareUrl() });
  } catch {
    // 利用者が閉じただけ。何も出さない
  }
});

window.addEventListener('resize', () => {
  finishMotion();
  relayout();
});
window.addEventListener('orientationchange', () => {
  finishMotion();
  relayout();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  finishMotion();
  if (game.status === 'demo') stopDemo({ quiet: true });
});
window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => finishMotion());

// 文字の拡大や書体の読み込みで帯・状態の高さが変わったら、盤の大きさを測り直す（タイマーで遅らせ、rAF には頼らない）
if (typeof ResizeObserver === 'function') {
  let queued = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(queued);
    queued = setTimeout(relayout, 0);
  });
  for (const node of [el.titlebar, el.levelbar, el.status, el.controls]) ro.observe(node);
}

// ---------------------------------------------------------------- 起動

function boot() {
  const q = new URLSearchParams(location.search).get('level');
  const n = /^[1-9]$/.test(q ?? '') ? Number(q) : 0;
  renderSound();
  renderLetterKeys();
  const index = n >= 1 && n <= LEVELS.length ? n - 1 : firstOpenIndex(progress);
  // 初めて遊ぶとき（星がまだ1つも無い）の面1だけ、ヒントを開いて始める（compact・tiny。ほかの型では、ヒントは常に出ている）
  const firstRun = LEVELS.every((L) => levelRecord(progress, L.id).stars === 0);
  startLevel(index, { hint: firstRun && index === 0 });
  root.dataset.ready = 'true';
}

boot();
