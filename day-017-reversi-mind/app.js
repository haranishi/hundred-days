import {
  BLACK, WHITE, EMPTY, initialBoard, legalMoves, applyMove, flipsFor,
  counts, opponent, coordName,
} from './lib/board.js';
import { scoreMoves } from './lib/ai.js';
import { describeMove, summarizeChoice } from './lib/explain.js';

const HUMAN = BLACK;
const AI = WHITE;
const MAX_DEPTH = 4;
/** 自分の番のヒントは即座に出したいので1手浅くする */
const HINT_DEPTH = 3;
/** 読みの深さが1段進むごとの見せ時間。数字が動くのを目で追えるようにする */
const STEP_MS = 420;

const el = {
  empty: document.getElementById('state-empty'),
  game: document.getElementById('game'),
  start: document.getElementById('start'),
  board: document.getElementById('board'),
  status: document.getElementById('status'),
  invalid: document.getElementById('invalid'),
  thinking: document.getElementById('thinking'),
  depthLabel: document.getElementById('depth-label'),
  barFill: document.getElementById('bar-fill'),
  explain: document.getElementById('explain'),
  result: document.getElementById('result'),
  resultHead: document.getElementById('result-head'),
  resultDetail: document.getElementById('result-detail'),
  scoreBlack: document.getElementById('score-black'),
  scoreWhite: document.getElementById('score-white'),
  toggleMind: document.getElementById('toggle-mind'),
  reset: document.getElementById('reset'),
};

const state = {
  board: initialBoard(),
  turn: HUMAN,
  overlay: [],      // [{index, score, best}]
  lastMove: null,
  busy: false,
  over: false,
};

const cells = [];

function buildBoard() {
  el.board.innerHTML = '';
  cells.length = 0;
  for (let i = 0; i < 64; i += 1) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.index = String(i);
    cell.setAttribute('role', 'gridcell');
    cell.addEventListener('click', () => onCellClick(i));
    el.board.appendChild(cell);
    cells.push(cell);
  }
}

function heatColor(score, min, max) {
  // 青(悪い) → 灰 → 赤(良い)。数値も併記するので色だけに意味を持たせない
  if (max === min) return 'rgba(120,130,145,0.92)';
  const t = (score - min) / (max - min); // 0..1
  const r = Math.round(58 + (210 - 58) * t);
  const g = Math.round(110 + (74 - 110) * t);
  const b = Math.round(208 + (61 - 208) * t);
  return `rgba(${r},${g},${b},0.92)`;
}

function render() {
  const c = counts(state.board);
  el.scoreBlack.textContent = String(c.black);
  el.scoreWhite.textContent = String(c.white);

  const scores = state.overlay.map((o) => o.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const byIndex = new Map(state.overlay.map((o) => [o.index, o]));
  const playable = new Set(
    state.turn === HUMAN && !state.busy && !state.over
      ? legalMoves(state.board, HUMAN).map((m) => m.index)
      : [],
  );

  for (let i = 0; i < 64; i += 1) {
    const cell = cells[i];
    const v = state.board[i];
    cell.className = 'cell';
    cell.innerHTML = '';
    cell.disabled = false;

    if (v !== EMPTY) {
      const disc = document.createElement('span');
      disc.className = `cell__disc cell__disc--${v === BLACK ? 'black' : 'white'}`;
      cell.appendChild(disc);
      cell.setAttribute('aria-label', `${coordName(i)} ${v === BLACK ? '黒' : '白'}`);
    } else {
      cell.setAttribute('aria-label', `${coordName(i)} 空き`);
    }

    if (playable.has(i)) cell.classList.add('cell--playable');
    if (state.lastMove === i) cell.classList.add('cell--last');

    const o = byIndex.get(i);
    if (o && v === EMPTY) {
      const tag = document.createElement('span');
      tag.className = 'cell__score';
      tag.textContent = String(o.score);
      tag.style.background = heatColor(o.score, min, max);
      cell.appendChild(tag);
      if (o.best) cell.classList.add('cell--best');
      cell.setAttribute('aria-label', `${coordName(i)} 評価 ${o.score}点${o.best ? '・現時点の最善手' : ''}`);
    }
  }
}

function setOverlay(scored) {
  if (!el.toggleMind.checked || !scored || scored.length === 0) {
    state.overlay = [];
    return;
  }
  const best = scored[0].score;
  state.overlay = scored.map((s) => ({ index: s.index, score: s.score, best: s.score === best }));
}

function showExplain(head, reasons) {
  el.explain.innerHTML = '';
  if (!head) return;
  const h = document.createElement('p');
  h.className = 'explain__head';
  h.textContent = head;
  el.explain.appendChild(h);
  if (reasons && reasons.length) {
    const ul = document.createElement('ul');
    ul.className = 'explain__list';
    for (const r of reasons) {
      const li = document.createElement('li');
      li.className = r.tone;
      li.textContent = r.text;
      ul.appendChild(li);
    }
    el.explain.appendChild(ul);
  }
}

function clearInvalid() {
  el.invalid.hidden = true;
  el.invalid.textContent = '';
}

function showInvalid(text) {
  el.invalid.textContent = text;
  el.invalid.hidden = false;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function onCellClick(index) {
  if (state.over || state.busy || state.turn !== HUMAN) return;

  // 状態③：不正入力。何が起きたのかを必ず言葉で返す
  if (state.board[index] !== EMPTY) {
    showInvalid(`${coordName(index)} にはすでに石が置かれています。`);
    return;
  }
  const flips = flipsFor(state.board, HUMAN, index);
  if (!flips) {
    showInvalid(`${coordName(index)} には打てません。自分の石で相手の石を挟める場所だけに打てます。`);
    return;
  }

  clearInvalid();
  const move = { index, flips };
  const { reasons } = describeMove(state.board, HUMAN, move);
  state.board = applyMove(state.board, HUMAN, index, flips);
  state.lastMove = index;
  state.overlay = [];
  showExplain(`あなたは ${coordName(index)}（${flips.length}枚返した）`, reasons);
  state.turn = AI;
  render();
  void advance();
}

/** 手番が回ったところから、終局まで進める */
async function advance() {
  if (state.over) return;

  // 終局・パス判定
  const myMoves = legalMoves(state.board, state.turn);
  if (myMoves.length === 0) {
    const theirMoves = legalMoves(state.board, opponent(state.turn));
    if (theirMoves.length === 0) {
      finish();
      return;
    }
    const passer = state.turn === HUMAN ? 'あなた' : 'AI';
    state.turn = opponent(state.turn);
    el.status.textContent = `${passer}は打てる場所がないためパス。`;
    render();
    await wait(900);
    void advance();
    return;
  }

  if (state.turn === HUMAN) {
    state.busy = false;
    el.status.textContent = 'あなたの番です';
    el.status.classList.remove('status--thinking');
    if (el.toggleMind.checked) {
      setOverlay(scoreMoves(state.board, HUMAN, HINT_DEPTH));
    }
    render();
    return;
  }

  await aiTurn();
}

async function aiTurn() {
  state.busy = true;
  el.status.textContent = 'AIが読んでいます';
  el.status.classList.add('status--thinking');
  el.thinking.hidden = false;
  showExplain('', []);
  render();

  let chosen = null;
  let chosenScore = 0;

  // 反復深化。1手先 → 4手先と読み直し、そのつど盤の数字を更新する。
  // 待ち時間の演出ではなく、実際に探索し直しているので最善手が入れ替わる。
  for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
    el.depthLabel.textContent = String(depth);
    el.barFill.style.width = `${(depth / MAX_DEPTH) * 100}%`;

    // 同期の重い計算の前に1フレーム描画を通す
    await wait(0);
    const scored = scoreMoves(state.board, AI, depth);
    chosen = scored[0];
    chosenScore = scored[0].score;

    setOverlay(scored);
    render();
    await wait(STEP_MS);
  }

  el.thinking.hidden = true;
  el.barFill.style.width = '0%';

  const move = { index: chosen.index, flips: chosen.flips };
  const { head, reasons } = summarizeChoice(state.board, AI, move, chosenScore, MAX_DEPTH);
  state.board = applyMove(state.board, AI, move.index, move.flips);
  state.lastMove = move.index;
  state.overlay = [];
  state.turn = HUMAN;
  state.busy = false;
  showExplain(`AIは ${head}`, reasons);
  render();
  void advance();
}

function finish() {
  state.over = true;
  state.busy = false;
  state.overlay = [];
  el.thinking.hidden = true;
  const c = counts(state.board);
  el.status.textContent = '終局';
  el.status.classList.remove('status--thinking');
  el.result.hidden = false;
  if (c.black > c.white) el.resultHead.textContent = `あなたの勝ち（${c.black} 対 ${c.white}）`;
  else if (c.white > c.black) el.resultHead.textContent = `AIの勝ち（${c.white} 対 ${c.black}）`;
  else el.resultHead.textContent = `引き分け（${c.black} 対 ${c.white}）`;
  el.resultDetail.textContent = '「最初から」でもう一度対局できます。';
  render();
}

function startGame() {
  state.board = initialBoard();
  state.turn = HUMAN;
  state.overlay = [];
  state.lastMove = null;
  state.busy = false;
  state.over = false;
  el.empty.hidden = true;
  el.game.hidden = false;
  el.result.hidden = true;
  el.thinking.hidden = true;
  clearInvalid();
  showExplain('', []);
  void advance();
}

el.start.addEventListener('click', startGame);
el.reset.addEventListener('click', startGame);
el.toggleMind.addEventListener('change', () => {
  if (!el.toggleMind.checked) {
    state.overlay = [];
    render();
  } else if (state.turn === HUMAN && !state.busy && !state.over) {
    setOverlay(scoreMoves(state.board, HUMAN, HINT_DEPTH));
    render();
  }
});

buildBoard();
render();
