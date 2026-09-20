// リバーシのルール。盤は長さ64の配列で、index = 行*8 + 列（行・列とも0始まり）。
// 「オセロ」は登録商標のため、このアプリはルール名の「リバーシ」を使う。

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const SIZE = 8;

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

export function opponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

export function initialBoard() {
  const board = new Uint8Array(64);
  board[27] = WHITE; // d4
  board[28] = BLACK; // e4
  board[35] = BLACK; // d5
  board[36] = WHITE; // e5
  return board;
}

/** そのマスに打ったとき裏返る石の位置。打てないなら null。 */
export function flipsFor(board, player, index) {
  if (index < 0 || index > 63) return null;
  if (board[index] !== EMPTY) return null;

  const row = Math.floor(index / 8);
  const col = index % 8;
  const opp = opponent(player);
  const flips = [];

  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === opp) {
      line.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    // 相手の石が1つ以上続いたあとに自分の石があれば、その区間が裏返る
    const closed = line.length > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === player;
    if (closed) flips.push(...line);
  }

  return flips.length > 0 ? flips : null;
}

export function legalMoves(board, player) {
  const moves = [];
  for (let i = 0; i < 64; i += 1) {
    const flips = flipsFor(board, player, i);
    if (flips) moves.push({ index: i, flips });
  }
  return moves;
}

export function applyMove(board, player, index, flips) {
  const targets = flips || flipsFor(board, player, index);
  if (!targets) return null;
  const next = Uint8Array.from(board);
  next[index] = player;
  for (const i of targets) next[i] = player;
  return next;
}

export function counts(board) {
  let black = 0;
  let white = 0;
  let empty = 0;
  for (let i = 0; i < 64; i += 1) {
    if (board[i] === BLACK) black += 1;
    else if (board[i] === WHITE) white += 1;
    else empty += 1;
  }
  return { black, white, empty };
}

/** 両者とも打てなければ終局。 */
export function isGameOver(board) {
  return legalMoves(board, BLACK).length === 0 && legalMoves(board, WHITE).length === 0;
}

/** index 0 → "a1"、index 63 → "h8"。 */
export function coordName(index) {
  return 'abcdefgh'[index % 8] + (Math.floor(index / 8) + 1);
}

export function discName(player) {
  return player === BLACK ? '黒' : '白';
}
