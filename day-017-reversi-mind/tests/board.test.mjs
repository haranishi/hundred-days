import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLACK, WHITE, EMPTY, initialBoard, legalMoves, applyMove, flipsFor,
  counts, isGameOver, coordName, opponent,
} from '../lib/board.js';

test('初期配置は黒2・白2', () => {
  const c = counts(initialBoard());
  assert.equal(c.black, 2);
  assert.equal(c.white, 2);
  assert.equal(c.empty, 60);
});

test('coordName が盤の座標を返す', () => {
  assert.equal(coordName(0), 'a1');
  assert.equal(coordName(7), 'h1');
  assert.equal(coordName(56), 'a8');
  assert.equal(coordName(63), 'h8');
  assert.equal(coordName(27), 'd4');
});

test('黒の初手は d3・c4・f5・e6 の4つだけ', () => {
  const moves = legalMoves(initialBoard(), BLACK).map((m) => coordName(m.index)).sort();
  assert.deepEqual(moves, ['c4', 'd3', 'e6', 'f5']);
});

test('白の初手も4つ', () => {
  const moves = legalMoves(initialBoard(), WHITE).map((m) => coordName(m.index)).sort();
  assert.deepEqual(moves, ['c5', 'd6', 'e3', 'f4']);
});

test('d3 に打つと d4 の白が1枚だけ裏返る', () => {
  const board = initialBoard();
  const flips = flipsFor(board, BLACK, 19); // d3
  assert.deepEqual([...flips], [27]); // d4
  const next = applyMove(board, BLACK, 19, flips);
  assert.equal(next[19], BLACK);
  assert.equal(next[27], BLACK);
  const c = counts(next);
  assert.equal(c.black, 4);
  assert.equal(c.white, 1);
});

test('石があるマスと挟めないマスには打てない', () => {
  const board = initialBoard();
  assert.equal(flipsFor(board, BLACK, 27), null); // 白石がある
  assert.equal(flipsFor(board, BLACK, 0), null); // 隅は挟めない
  assert.equal(flipsFor(board, BLACK, 20), null); // e3 は白の手であって黒は打てない
});

test('applyMove は元の盤を壊さない', () => {
  const board = initialBoard();
  const before = [...board];
  applyMove(board, BLACK, 19);
  assert.deepEqual([...board], before);
});

test('複数方向を同時に裏返す', () => {
  const board = new Uint8Array(64);
  board[10] = WHITE; board[11] = BLACK; // c2(白) d2(黒) → 右方向
  board[17] = WHITE; board[25] = BLACK; // b3(白) b4(黒) → 下方向
  const flips = flipsFor(board, BLACK, 9); // b2 に黒
  assert.deepEqual([...flips].sort((x, y) => x - y), [10, 17]);
});

test('相手の石が続いた先が空きなら裏返らない', () => {
  const board = new Uint8Array(64);
  board[10] = WHITE; // c2 の先は空き
  assert.equal(flipsFor(board, BLACK, 9), null);
});

test('両者とも打てなければ終局', () => {
  const full = new Uint8Array(64).fill(BLACK);
  assert.equal(isGameOver(full), true);
  assert.equal(isGameOver(initialBoard()), false);
});

test('片方だけ打てない場合は終局ではない（パス）', () => {
  const board = new Uint8Array(64);
  board[0] = BLACK;
  board[1] = WHITE;
  board[2] = EMPTY;
  // 黒は c1 に打てる（b1の白を挟む）が、白は挟める形が無い
  assert.equal(legalMoves(board, BLACK).length, 1);
  assert.equal(legalMoves(board, WHITE).length, 0);
  assert.equal(isGameOver(board), false);
});

test('opponent が入れ替わる', () => {
  assert.equal(opponent(BLACK), WHITE);
  assert.equal(opponent(WHITE), BLACK);
});
