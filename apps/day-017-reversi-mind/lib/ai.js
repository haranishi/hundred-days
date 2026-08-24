// 評価関数と反復深化αβ探索。
// 画面に「AIが何点と見ているか」を出すので、根の各手のスコアは
// 枝刈りで丸めず必ず正確な値を出す（下の scoreMoves のコメント参照）。

import {
  BLACK, EMPTY, opponent, legalMoves, applyMove, counts,
} from './board.js';

/**
 * 位置の価値。角(120)が最も高く、角の斜め隣＝X打(-40)が最も低い。
 * 角は絶対に裏返らないので価値が高く、X打は角を相手に渡す筋を作るので低い。
 */
export const WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

export const CORNERS = [0, 7, 56, 63];

/** 終盤に入ったとみなす空きマス数。ここから石数の重みを上げる。 */
export const ENDGAME_EMPTY = 12;

const MOBILITY_WEIGHT = 12;
const WIN_SCORE = 10000;

/**
 * player から見た盤面の点数。要素は3つだけに絞ってある。
 * 説明文（explain.js）がこの3要素をそのまま日本語にするので、
 * ここを増やすと「数字の理由」が説明できなくなる。
 */
export function evaluate(board, player) {
  const opp = opponent(player);
  const myMoves = legalMoves(board, player).length;
  const oppMoves = legalMoves(board, opp).length;

  if (myMoves === 0 && oppMoves === 0) {
    const c = counts(board);
    const mine = player === BLACK ? c.black : c.white;
    const theirs = player === BLACK ? c.white : c.black;
    return (mine - theirs) * WIN_SCORE;
  }

  let position = 0;
  let mine = 0;
  let theirs = 0;
  let empty = 0;
  for (let i = 0; i < 64; i += 1) {
    if (board[i] === player) {
      position += WEIGHTS[i];
      mine += 1;
    } else if (board[i] === opp) {
      position -= WEIGHTS[i];
      theirs += 1;
    } else {
      empty += 1;
    }
  }

  const mobility = (myMoves - oppMoves) * MOBILITY_WEIGHT;
  // 序盤に石を増やしても価値は薄い。終盤は石数がそのまま勝敗になる。
  const discWeight = empty <= ENDGAME_EMPTY ? 12 : 1;
  const discs = (mine - theirs) * discWeight;

  return position + mobility + discs;
}

function negamax(board, player, depth, alpha, beta) {
  if (depth === 0) return evaluate(board, player);

  const moves = legalMoves(board, player);
  if (moves.length === 0) {
    const oppMoves = legalMoves(board, opponent(player));
    if (oppMoves.length === 0) return evaluate(board, player);
    // パス。手番だけ渡して深さは消費する
    return -negamax(board, opponent(player), depth - 1, -beta, -alpha);
  }

  let best = -Infinity;
  let a = alpha;
  for (const move of moves) {
    const next = applyMove(board, player, move.index, move.flips);
    const value = -negamax(next, opponent(player), depth - 1, -beta, -a);
    if (value > best) best = value;
    if (best > a) a = best;
    if (a >= beta) break; // ここでの枝刈りは根の表示値に影響しない
  }
  return best;
}

/**
 * 根の全候補手にスコアを付ける。降順。
 *
 * ⚠️ 根では手ごとに窓を (-∞, +∞) に開き直している。
 * 通常のαβは「最善手より悪い」と分かった時点で打ち切るため、
 * 2番手以降の値が正確でなくなる（上界・下界にしかならない）。
 * このアプリは全候補手の点数を画面に出すので、そこが丸められると嘘になる。
 * 速度より表示の正確さを優先している。
 */
export function scoreMoves(board, player, depth) {
  const moves = legalMoves(board, player);
  const scored = moves.map((move) => {
    const next = applyMove(board, player, move.index, move.flips);
    const score = -negamax(next, opponent(player), depth - 1, -Infinity, Infinity);
    return { index: move.index, flips: move.flips, score };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored;
}

/**
 * 深さ1から maxDepth まで順に読み、そのつど結果を渡す。
 * 「読みが深まると意見が変わる」を画面で見せるための本体。
 * 演出の待ち時間ではなく、実際に探索し直している。
 */
export function* iterativeDeepening(board, player, maxDepth) {
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    yield { depth, moves: scoreMoves(board, player, depth) };
  }
}
