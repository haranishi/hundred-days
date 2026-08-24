// 評価の内訳を日本語にする。
// ai.js の evaluate が見ている3要素（位置・着手可能数・石数）だけを説明に使う。
// ここで評価に無い理由を語ると「数字と説明が食い違う」ので足さない。

import {
  opponent, legalMoves, applyMove, coordName, counts,
} from './board.js';
import { CORNERS, WEIGHTS, ENDGAME_EMPTY } from './ai.js';

/** 角の斜め隣（X打）→ 対応する角 */
const X_SQUARES = new Map([[9, 0], [14, 7], [49, 56], [54, 63]]);

/** 角の縦横隣（C打）→ 対応する角 */
const C_SQUARES = new Map([
  [1, 0], [8, 0],
  [6, 7], [15, 7],
  [48, 56], [57, 56],
  [55, 63], [62, 63],
]);

/**
 * 1手の内訳を出す。UIはこれを短い日本語にして出す。
 */
export function analyzeMove(board, player, move) {
  const opp = opponent(player);
  const before = legalMoves(board, opp).length;
  const next = applyMove(board, player, move.index, move.flips);
  const after = legalMoves(next, opp).length;
  const { empty } = counts(next);

  const isCorner = CORNERS.includes(move.index);
  const xCorner = X_SQUARES.get(move.index);
  const cCorner = C_SQUARES.get(move.index);

  return {
    index: move.index,
    coord: coordName(move.index),
    flipCount: move.flips.length,
    opponentMovesBefore: before,
    opponentMovesAfter: after,
    isCorner,
    // 対応する角がまだ空いているときだけ危険。角が既に埋まっていればX打は危なくない
    isXSquare: xCorner !== undefined && next[xCorner] === 0,
    isCSquare: cCorner !== undefined && next[cCorner] === 0,
    givesCorner: cornerHandedOver(next, opp),
    positionValue: WEIGHTS[move.index],
    isEndgame: empty <= ENDGAME_EMPTY,
    emptyAfter: empty,
  };
}

/** その手のあと、相手が角を取れる状態になるか */
function cornerHandedOver(nextBoard, opp) {
  return legalMoves(nextBoard, opp)
    .filter((m) => CORNERS.includes(m.index))
    .map((m) => coordName(m.index));
}

/**
 * 説明文を組み立てる。良い理由・悪い理由を優先度順に見て、上位2つまでを返す。
 */
export function describeMove(board, player, move) {
  const a = analyzeMove(board, player, move);
  const reasons = [];

  if (a.isCorner) {
    reasons.push({ tone: 'good', text: `角(${a.coord})を取れる。角は絶対に裏返らないので、そのまま最後まで残る` });
  }

  if (a.givesCorner.length > 0) {
    reasons.push({ tone: 'bad', text: `この手のあと、相手が角(${a.givesCorner.join('・')})を取れてしまう` });
  } else if (a.isXSquare) {
    reasons.push({ tone: 'bad', text: '角の斜め隣（X打）。角を相手に渡す筋を作りやすい' });
  } else if (a.isCSquare) {
    reasons.push({ tone: 'bad', text: '角の隣（C打）。角を取られる形になりやすい' });
  }

  if (a.opponentMovesAfter === 0) {
    reasons.push({ tone: 'good', text: '相手の打てる場所が無くなる＝相手はパスになり、もう一度自分の番が来る' });
  } else if (a.opponentMovesBefore - a.opponentMovesAfter >= 2) {
    reasons.push({
      tone: 'good',
      text: `相手の打てる場所を ${a.opponentMovesBefore}→${a.opponentMovesAfter} に減らせる`,
    });
  } else if (a.opponentMovesAfter - a.opponentMovesBefore >= 3) {
    reasons.push({
      tone: 'bad',
      text: `相手の打てる場所が ${a.opponentMovesBefore}→${a.opponentMovesAfter} に増えてしまう`,
    });
  }

  if (a.isEndgame) {
    reasons.push({ tone: 'good', text: `残り${a.emptyAfter}マス。ここからは裏返した枚数がそのまま勝敗になるので、${a.flipCount}枚返せるのが効く` });
  } else if (a.flipCount >= 5) {
    reasons.push({
      tone: 'bad',
      text: `${a.flipCount}枚返せるが、序盤で石を増やすと自分の打てる場所が減りやすい`,
    });
  }

  if (reasons.length === 0) {
    if (a.positionValue >= 15) reasons.push({ tone: 'good', text: '位置の価値が高いマス。あとで角を取りにいく足場になる' });
    else if (a.positionValue <= -5) reasons.push({ tone: 'bad', text: '位置としては弱いマス' });
    else reasons.push({ tone: 'flat', text: '大きな損得のない手' });
  }

  return { analysis: a, reasons: reasons.slice(0, 2) };
}

/**
 * AIが指した直後に画面へ出す1行。
 */
export function summarizeChoice(board, player, move, score, depth) {
  const { reasons } = describeMove(board, player, move);
  // 数字は「その手を打ったあとの局面」の点。手そのものの価値ではないので、そう書く
  const head = `${coordName(move.index)} を選んだ（${depth}手先まで読んで、この手のあとの局面を ${score >= 0 ? '+' : ''}${score}点と評価）`;
  return { head, reasons };
}
