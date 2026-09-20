/* マスの割りつけ。KanjiVG の座標は 109 四方なので、1マスをそのまま 109 とする。 */

export const CELL = 109;
export const GAP = 10;
export const PAD = 14;
export const MAX_CELLS = 8;

/* 1行に置く数は画面の広さで決める。横に詰めて縮めると、画の順番が追えなくなる
   ので、入りきらないぶんは行を折る（広い画面は4、狭い画面は2）。 */
export function gridFor(count, maxCols = 4) {
  const n = Math.max(1, Math.min(MAX_CELLS, Math.floor(count) || 1));
  const cols = Math.max(1, Math.min(n, Math.floor(maxCols) || 1));
  return { cols, rows: Math.ceil(n / cols) };
}

/* 盤面の大きさとマスの位置。単位は KanjiVG と同じ。 */
export function board(count, maxCols = 4) {
  const n = Math.max(1, Math.min(MAX_CELLS, Math.floor(count) || 1));
  const { cols, rows } = gridFor(n, maxCols);
  const width = PAD * 2 + cols * CELL + (cols - 1) * GAP;
  const height = PAD * 2 + rows * CELL + (rows - 1) * GAP;
  const cells = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    cells.push({ x: PAD + col * (CELL + GAP), y: PAD + row * (CELL + GAP) });
  }
  /* 最後の行が埋まらないときは、その行だけ中央に寄せる */
  const lastRowCount = n - Math.floor((n - 1) / cols) * cols;
  if (rows > 1 && lastRowCount < cols) {
    const shift = ((cols - lastRowCount) * (CELL + GAP)) / 2;
    for (let i = n - lastRowCount; i < n; i++) cells[i].x += shift;
  }
  return { width, height, cols, rows, cells };
}

/* 画の通し番号。1字目の全画→2字目の全画の順に数える。 */
export function strokeOrder(chars) {
  const order = [];
  chars.forEach((char, cellIndex) => {
    (char.strokes || []).forEach((stroke, indexInChar) => {
      order.push({ cellIndex, indexInChar, stroke });
    });
  });
  return order;
}
