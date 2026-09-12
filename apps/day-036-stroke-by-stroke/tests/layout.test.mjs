import test from 'node:test';
import assert from 'node:assert/strict';
import { gridFor, board, strokeOrder, CELL, GAP, PAD } from '../lib/layout.js';

test('gridFor: 入る数だけ横に並べ、あふれたら行を折る', () => {
  assert.deepEqual(gridFor(1, 4), { cols: 1, rows: 1 });
  assert.deepEqual(gridFor(4, 4), { cols: 4, rows: 1 });
  assert.deepEqual(gridFor(5, 4), { cols: 4, rows: 2 });
  assert.deepEqual(gridFor(8, 4), { cols: 4, rows: 2 });
});

test('gridFor: 狭い画面は2列', () => {
  assert.deepEqual(gridFor(4, 2), { cols: 2, rows: 2 });
  assert.deepEqual(gridFor(8, 2), { cols: 2, rows: 4 });
  assert.deepEqual(gridFor(1, 2), { cols: 1, rows: 1 });
});

test('gridFor: 上限8字をはみ出さない', () => {
  assert.deepEqual(gridFor(20, 4), { cols: 4, rows: 2 });
  assert.deepEqual(gridFor(0, 4), { cols: 1, rows: 1 });
});

test('board: 盤面の大きさはマスと余白から決まる', () => {
  const b = board(3, 4);
  assert.equal(b.width, PAD * 2 + 3 * CELL + 2 * GAP);
  assert.equal(b.height, PAD * 2 + CELL);
  assert.equal(b.cells.length, 3);
  assert.deepEqual(b.cells[0], { x: PAD, y: PAD });
  assert.deepEqual(b.cells[1], { x: PAD + CELL + GAP, y: PAD });
});

test('board: マスが重ならない', () => {
  const b = board(8, 4);
  const keys = new Set(b.cells.map((c) => `${c.x},${c.y}`));
  assert.equal(keys.size, 8);
  assert.equal(b.rows, 2);
});

test('board: 端数の行は中央に寄せる', () => {
  const b = board(5, 4);
  assert.equal(b.cells[4].x, PAD + ((4 - 1) * (CELL + GAP)) / 2);
});

test('board: 行が埋まっているときは寄せない', () => {
  const b = board(4, 2);
  assert.equal(b.cells[2].x, PAD);
});

test('strokeOrder: 1字目の全画から順に数える', () => {
  const order = strokeOrder([
    { strokes: ['a1', 'a2'] },
    { strokes: null },
    { strokes: ['c1'] },
  ]);
  assert.equal(order.length, 3);
  assert.deepEqual(
    order.map((o) => [o.cellIndex, o.indexInChar]),
    [
      [0, 0],
      [0, 1],
      [2, 0],
    ]
  );
});
