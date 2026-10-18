import { WORLD } from './config.js';

const ROWS = WORLD.rows;
const CELL_COUNT = ROWS * ROWS;
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

function validateBoard(board) {
  if (!Array.isArray(board)) throw new TypeError('Board must be an array');
  if (board.length !== CELL_COUNT) throw new RangeError(`Board must contain ${CELL_COUNT} cells`);
  for (const cell of board) {
    if (cell !== 0 && cell !== 1 && cell !== 2) {
      throw new TypeError('Board cells must be 0, 1 or 2');
    }
  }
}

export function createBoard() {
  return Array.from({ length: CELL_COUNT }, (_, index) => index < CELL_COUNT / 2 ? 2 : 1);
}

export function getScores(board) {
  validateBoard(board);
  const scores = { player: 0, cpu: 0 };
  for (const cell of board) {
    if (cell === 1) scores.player += 1;
    if (cell === 2) scores.cpu += 1;
  }
  return scores;
}

export function applyLanding(board, index, owner) {
  validateBoard(board);
  const nextBoard = [...board];
  const flipped = [];
  const changed = [];
  if ((owner !== 1 && owner !== 2) || !Number.isInteger(index) || index < 0 || index >= CELL_COUNT) {
    return { board: nextBoard, flipped, changed };
  }

  if (board[index] !== owner) changed.push(index);
  nextBoard[index] = owner;
  const startRow = Math.floor(index / ROWS);
  const startColumn = index % ROWS;
  const enemy = 3 - owner;
  for (const [rowStep, columnStep] of DIRECTIONS) {
    const line = [];
    let row = startRow + rowStep;
    let column = startColumn + columnStep;
    while (row >= 0 && row < ROWS && column >= 0 && column < ROWS) {
      const cellIndex = row * ROWS + column;
      if (board[cellIndex] !== enemy) {
        if (board[cellIndex] === owner) flipped.push(...line);
        break;
      }
      line.push(cellIndex);
      row += rowStep;
      column += columnStep;
    }
  }
  for (const cellIndex of flipped) nextBoard[cellIndex] = owner;
  changed.push(...flipped);
  return { board: nextBoard, flipped, changed };
}
