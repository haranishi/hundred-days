import assert from 'node:assert/strict';
import test from 'node:test';
import { applyLanding, createBoard, getScores } from '../lib/rules.js';

const emptyBoard = () => Array(36).fill(0);
const sorted = (indices) => [...indices].sort((a, b) => a - b);
const directions = [
  ['northwest', 7, 0], ['north', 8, 2], ['northeast', 9, 4],
  ['west', 13, 12], ['east', 15, 16],
  ['southwest', 19, 24], ['south', 20, 26], ['southeast', 21, 28],
];

function assertIndices(actual, expected) {
  assert.ok(Array.isArray(actual));
  assert.equal(new Set(actual).size, actual.length, 'each changed cell occurs once');
  assert.deepEqual(sorted(actual), sorted(expected));
}

test('createBoard gives each side eighteen cells and allocates independent boards', () => {
  const first = createBoard();
  const second = createBoard();
  assert.deepEqual(first, [...Array(18).fill(2), ...Array(18).fill(1)]);
  assert.deepEqual(getScores(first), { player: 18, cpu: 18 });
  assert.notStrictEqual(first, second);
  first[0] = 0;
  assert.equal(second[0], 2);
});

test('getScores counts only occupied cells and leaves the board unchanged', () => {
  const board = emptyBoard();
  board[0] = 1;
  board[5] = 1;
  board[19] = 1;
  board[35] = 2;
  Object.freeze(board);
  assert.deepEqual(getScores(board), { player: 3, cpu: 1 });
  assert.deepEqual(getScores(emptyBoard()), { player: 0, cpu: 0 });
  assert.equal(board[35], 2);
});

for (const owner of [1, 2]) {
  const enemy = 3 - owner;

  for (const original of [0, enemy]) {
    test(`owner ${owner} paints a cell previously owned by ${original}`, () => {
      const board = emptyBoard();
      board[14] = original;
      Object.freeze(board);
      const result = applyLanding(board, 14, owner);
      const expected = [...board];
      expected[14] = owner;
      assert.notStrictEqual(result.board, board);
      assert.deepEqual(result.board, expected);
      assertIndices(result.flipped, []);
      assertIndices(result.changed, [14]);
      assert.equal(board[14], original);
      assert.deepEqual(getScores(result.board), {
        player: Number(owner === 1), cpu: Number(owner === 2),
      });
    });
  }

  for (const [name, enemyCell, anchor] of directions) {
    test(`owner ${owner} flips an enclosed ${name} opponent`, () => {
      const board = emptyBoard();
      board[enemyCell] = enemy;
      board[anchor] = owner;
      Object.freeze(board);
      const result = applyLanding(board, 14, owner);
      const expected = [...board];
      expected[14] = owner;
      expected[enemyCell] = owner;
      assert.notStrictEqual(result.board, board);
      assert.deepEqual(result.board, expected);
      assertIndices(result.flipped, [enemyCell]);
      assertIndices(result.changed, [14, enemyCell]);
      assert.equal(board[14], 0);
      assert.equal(board[enemyCell], enemy);
      assert.deepEqual(getScores(result.board), {
        player: owner === 1 ? 3 : 0, cpu: owner === 2 ? 3 : 0,
      });
    });
  }

  test(`owner ${owner} flips every consecutive opponent up to its first anchor`, () => {
    const board = emptyBoard();
    for (const cell of [13, 14, 15, 16]) board[cell] = enemy;
    board[17] = owner;
    const result = applyLanding(board, 12, owner);
    assertIndices(result.flipped, [13, 14, 15, 16]);
    assertIndices(result.changed, [12, 13, 14, 15, 16]);
    assert.deepEqual(result.board.slice(12, 18), Array(6).fill(owner));
  });

  test(`owner ${owner} resolves all eight directions together without duplicates`, () => {
    const board = emptyBoard();
    for (const [, enemyCell, anchor] of directions) {
      board[enemyCell] = enemy;
      board[anchor] = owner;
    }
    const result = applyLanding(board, 14, owner);
    const flipped = directions.map(([, enemyCell]) => enemyCell);
    assertIndices(result.flipped, flipped);
    assertIndices(result.changed, [14, ...flipped]);
    assert.equal(result.board.filter((cell) => cell === owner).length, 17);
    assert.equal(result.board.filter((cell) => cell === enemy).length, 0);
    assert.equal(board.filter((cell) => cell === enemy).length, 8);
  });

  test(`owner ${owner} leaves open, interrupted and wrapped lines unflipped`, () => {
    const cases = [
      { name: 'edge without an anchor', landing: 12, enemies: [13, 14, 15, 16, 17], own: [] },
      { name: 'empty before the anchor', landing: 12, enemies: [13], own: [15] },
      { name: 'empty before the opponent', landing: 12, enemies: [14], own: [15] },
      { name: 'own cell before the opponent', landing: 12, enemies: [14], own: [13, 15] },
      { name: 'east row wrapping', landing: 5, enemies: [6], own: [7] },
      { name: 'west row wrapping', landing: 6, enemies: [5], own: [4] },
      { name: 'southeast wrapping', landing: 5, enemies: [12], own: [19] },
      { name: 'southwest wrapping', landing: 6, enemies: [11], own: [16] },
    ];
    for (const { name, landing, enemies, own } of cases) {
      const board = emptyBoard();
      for (const cell of enemies) board[cell] = enemy;
      for (const cell of own) board[cell] = owner;
      const expected = [...board];
      expected[landing] = owner;
      const result = applyLanding(board, landing, owner);
      assert.deepEqual(result.board, expected, name);
      assertIndices(result.flipped, []);
      assertIndices(result.changed, [landing]);
    }
  });

  test(`owner ${owner} stops at the nearest own cell`, () => {
    const board = emptyBoard();
    board[13] = enemy;
    board[14] = owner;
    board[15] = enemy;
    board[16] = owner;
    const result = applyLanding(board, 12, owner);
    assertIndices(result.flipped, [13]);
    assert.equal(result.board[15], enemy);
  });

  test(`owner ${owner} does not start new flips from a cell changed by this landing`, () => {
    const board = emptyBoard();
    board[13] = enemy;
    board[14] = owner;
    board[19] = enemy;
    board[25] = owner;
    const result = applyLanding(board, 12, owner);
    assertIndices(result.flipped, [13]);
    assertIndices(result.changed, [12, 13]);
    assert.equal(result.board[19], enemy, 'the new owner at 13 must not trigger a second scan');
  });

  test(`owner ${owner} can flip from its existing cell without counting that cell as changed`, () => {
    const board = emptyBoard();
    board[12] = owner;
    board[13] = enemy;
    board[14] = owner;
    const first = applyLanding(board, 12, owner);
    assertIndices(first.flipped, [13]);
    assertIndices(first.changed, [13]);
    const repeated = applyLanding(first.board, 12, owner);
    assert.notStrictEqual(repeated.board, first.board);
    assert.deepEqual(repeated.board, first.board);
    assertIndices(repeated.flipped, []);
    assertIndices(repeated.changed, []);
  });
}

test('identical calls are independent pure results, without shot or match state', () => {
  const board = emptyBoard();
  board[13] = 2;
  board[14] = 1;
  const first = applyLanding(board, 12, 1);
  const second = applyLanding(board, 12, 1);
  assert.deepEqual(first, second);
  first.board[14] = 0;
  first.flipped.push(35);
  first.changed.push(34);
  assert.equal(board[14], 1);
  assert.equal(second.board[14], 1);
  assertIndices(second.flipped, [13]);
  assertIndices(second.changed, [12, 13]);
});

test('invalid indices leave the board unchanged and return no changed cells', () => {
  const board = Object.freeze([...Array(18).fill(2), ...Array(18).fill(1)]);
  for (const index of [-1, 36, 3.5, NaN, Infinity, -Infinity, '0', null, undefined, {}, 0n]) {
    const result = applyLanding(board, index, 1);
    assert.notStrictEqual(result.board, board);
    assert.deepEqual(result.board, board);
    assertIndices(result.flipped, []);
    assertIndices(result.changed, []);
  }
});

test('invalid owners leave the board unchanged and return no changed cells', () => {
  const board = Object.freeze([...Array(18).fill(2), ...Array(18).fill(1)]);
  for (const owner of [0, 3, -1, 1.5, NaN, Infinity, '1', true, null, undefined, {}, 1n]) {
    const result = applyLanding(board, 12, owner);
    assert.notStrictEqual(result.board, board);
    assert.deepEqual(result.board, board);
    assertIndices(result.flipped, []);
    assertIndices(result.changed, []);
  }
});

test('non-array boards fail explicitly in scores and landing', () => {
  for (const board of [null, undefined, {}, '0'.repeat(36), new Uint8Array(36)]) {
    assert.throws(() => getScores(board), TypeError);
    assert.throws(() => applyLanding(board, 0, 1), TypeError);
  }
});

test('incorrect board lengths fail explicitly in scores and landing', () => {
  for (const board of [[], Array(35).fill(0), Array(37).fill(0)]) {
    assert.throws(() => getScores(board), RangeError);
    assert.throws(() => applyLanding(board, 0, 1), RangeError);
  }
});

test('invalid cell values and sparse boards cannot silently corrupt scores', () => {
  const invalidBoards = [Array(36), emptyBoard()];
  delete invalidBoards[1][20];
  for (const value of [3, -1, 0.5, NaN, Infinity, '1', null, undefined]) {
    const board = emptyBoard();
    board[35] = value;
    invalidBoards.push(board);
  }
  for (const board of invalidBoards) {
    assert.throws(() => getScores(board), TypeError);
    assert.throws(() => applyLanding(board, 0, 1), TypeError);
    assert.throws(() => applyLanding(board, -1, 0), TypeError);
  }
});
