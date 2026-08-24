import test from 'node:test';
import assert from 'node:assert/strict';

import { BLACK, WHITE, initialBoard, flipsFor } from '../lib/board.js';
import { analyzeMove, describeMove, summarizeChoice } from '../lib/explain.js';

function move(board, player, index) {
  const flips = flipsFor(board, player, index);
  assert.ok(flips, `そこには打てない: ${index}`);
  return { index, flips };
}

test('角を取る手は「角」を理由に挙げる', () => {
  const board = new Uint8Array(64);
  board[1] = WHITE; board[2] = BLACK;
  const { reasons } = describeMove(board, BLACK, move(board, BLACK, 0));
  assert.ok(reasons.some((r) => r.tone === 'good' && r.text.includes('角')));
});

test('相手に角を渡す手は悪い理由として出る', () => {
  // 黒が b2(X打) に打つと、白が a1 に打てるようになる形
  const board = new Uint8Array(64);
  board[10] = WHITE; board[11] = BLACK; // c2(白) d2(黒)
  board[9] = 0;
  const m = move(board, BLACK, 9); // b2
  const { analysis, reasons } = describeMove(board, BLACK, m);
  assert.equal(analysis.isXSquare, true, 'b2 は X打 と判定されるべき');
  assert.ok(reasons.some((r) => r.tone === 'bad'));
});

test('相手の手を減らせる手は数字つきで説明される', () => {
  const board = initialBoard();
  const m = move(board, BLACK, 19);
  const { analysis } = describeMove(board, BLACK, m);
  assert.equal(typeof analysis.opponentMovesBefore, 'number');
  assert.equal(typeof analysis.opponentMovesAfter, 'number');
});

test('analyzeMove が裏返す枚数と座標を持つ', () => {
  const board = initialBoard();
  const a = analyzeMove(board, BLACK, move(board, BLACK, 19));
  assert.equal(a.coord, 'd3');
  assert.equal(a.flipCount, 1);
  assert.equal(a.isCorner, false);
});

test('理由は必ず1つ以上、多くても2つ', () => {
  const board = initialBoard();
  for (const idx of [19, 26, 37, 44]) {
    const { reasons } = describeMove(board, BLACK, move(board, BLACK, idx));
    assert.ok(reasons.length >= 1 && reasons.length <= 2);
    for (const r of reasons) assert.ok(r.text.length > 0);
  }
});

test('summarizeChoice が座標・点数・深さを含む1行を返す', () => {
  const board = initialBoard();
  const { head, reasons } = summarizeChoice(board, BLACK, move(board, BLACK, 19), 12, 4);
  assert.ok(head.includes('d3'));
  assert.ok(head.includes('12'));
  assert.ok(head.includes('4手先'));
  assert.ok(Array.isArray(reasons));
});

test('角が既に埋まっていれば X打 は危険扱いしない', () => {
  const board = new Uint8Array(64);
  board[0] = BLACK;  // a1 は既に自分のもの
  board[10] = WHITE; board[11] = BLACK;
  const a = analyzeMove(board, BLACK, move(board, BLACK, 9));
  assert.equal(a.isXSquare, false);
});
