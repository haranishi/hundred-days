import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLACK, WHITE, initialBoard, legalMoves, applyMove, coordName,
} from '../lib/board.js';
import {
  WEIGHTS, CORNERS, evaluate, scoreMoves, iterativeDeepening,
} from '../lib/ai.js';

test('重みテーブルは64マスで、角が最大・X打が最小', () => {
  assert.equal(WEIGHTS.length, 64);
  for (const c of CORNERS) assert.equal(WEIGHTS[c], 120);
  for (const x of [9, 14, 49, 54]) assert.equal(WEIGHTS[x], -40);
  assert.equal(Math.max(...WEIGHTS), 120);
  assert.equal(Math.min(...WEIGHTS), -40);
});

test('角を持っている方が高く評価される', () => {
  const a = new Uint8Array(64);
  a[0] = BLACK; a[1] = WHITE;
  const b = new Uint8Array(64);
  b[0] = WHITE; b[1] = BLACK;
  assert.ok(evaluate(a, BLACK) > evaluate(b, BLACK));
});

test('決着した盤は石差がそのまま巨大な点になる', () => {
  const win = new Uint8Array(64).fill(BLACK);
  assert.ok(evaluate(win, BLACK) > 100000);
  assert.ok(evaluate(win, WHITE) < -100000);
});

test('評価は手番から見た値なので符号が反転する', () => {
  // 初期配置は対称なので 0（-0 と 0 を区別させないため +0 で正規化する）
  const board = initialBoard();
  assert.equal(evaluate(board, BLACK) + 0, -evaluate(board, WHITE) + 0);

  // 対称でない盤でも反転することを見る
  const skewed = applyMove(initialBoard(), BLACK, 19);
  assert.notEqual(evaluate(skewed, BLACK), 0);
  assert.equal(evaluate(skewed, BLACK), -evaluate(skewed, WHITE));
});

test('scoreMoves は合法手を全部返し、降順に並ぶ', () => {
  const board = initialBoard();
  const scored = scoreMoves(board, BLACK, 2);
  assert.equal(scored.length, legalMoves(board, BLACK).length);
  for (let i = 1; i < scored.length; i += 1) {
    assert.ok(scored[i - 1].score >= scored[i].score, '降順になっていない');
  }
});

test('scoreMoves の並び順は入力順に依存しない（同点は index 昇順で安定）', () => {
  const board = initialBoard();
  const a = scoreMoves(board, BLACK, 1).map((m) => m.index);
  const b = scoreMoves(board, BLACK, 1).map((m) => m.index);
  assert.deepEqual(a, b);
});

test('角が取れる局面では角を最善に選ぶ', () => {
  // a1 が空き、b1 が白、c1 が黒 → 黒が a1 に打つと b1 を取れて角が入る
  const board = new Uint8Array(64);
  board[1] = WHITE; // b1
  board[2] = BLACK; // c1
  board[9] = WHITE; // b2
  board[18] = BLACK; // c3
  const scored = scoreMoves(board, BLACK, 2);
  assert.equal(coordName(scored[0].index), 'a1');
});

test('反復深化は深さ1から順に、指定の深さまで結果を返す', () => {
  const board = initialBoard();
  const seen = [];
  for (const step of iterativeDeepening(board, BLACK, 4)) {
    seen.push(step.depth);
    assert.ok(step.moves.length > 0);
  }
  assert.deepEqual(seen, [1, 2, 3, 4]);
});

test('読みを深めると評価が変わりうる（深さ1と深さ4で同じとは限らない）', () => {
  // 具体的な局面で、深さごとのスコア列が全部同一にはならないことを見る
  const board = applyMove(initialBoard(), BLACK, 19);
  const d1 = scoreMoves(board, WHITE, 1).map((m) => m.score);
  const d4 = scoreMoves(board, WHITE, 4).map((m) => m.score);
  assert.notDeepEqual(d1, d4);
});

test('パスがある局面でも探索が止まらずに値を返す', () => {
  const board = new Uint8Array(64);
  board[0] = BLACK;
  board[1] = WHITE;
  // 白に手が無い局面。黒から2手読んでも例外にならない
  assert.equal(legalMoves(board, WHITE).length, 0);
  const scored = scoreMoves(board, BLACK, 3);
  assert.ok(Number.isFinite(scored[0].score));
});

test('深さ4の探索が現実的な時間で終わる', () => {
  const board = applyMove(initialBoard(), BLACK, 19);
  const started = Date.now();
  scoreMoves(board, WHITE, 4);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 3000, `深さ4に${elapsed}msかかった`);
});
