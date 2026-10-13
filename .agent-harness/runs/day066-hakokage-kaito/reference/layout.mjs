// 画面の型と盤のマスの大きさ（純粋関数）。day-066-hakokage-kaito/lib/layout.js へ、そのまま写す。
// CSS はメディアクエリを使わず、<html data-layout="…"> を見て並びを変える（境目を JS と CSS で二重に持たないため）。
// 数字の根拠は 02_ui.md と 02_ui_style.md。全面×主な画面幅の表は node layout-table.mjs で出る。

export const CELL_MIN = 36;
export const SLACK = 8; // CSS の行の高さや枠の誤差を吸収する余白。盤の高さの計算から必ず引く

// 型：tall（縦・高い）/ compact（縦・中くらい）/ tiny（縦・低い）/ short（横長・低い）/ wide（広い）
export function layoutMode(vw, vh) {
  if (vw >= 700) return vh < 500 ? 'short' : 'wide';
  if (vh >= 760) return 'tall';
  return vh >= 620 ? 'compact' : 'tiny';
}

// 型ごとの寸法（px）。盤以外の縦の合計（reserve）は、帯・題字・面の帯・ヒント・状態・操作・すき間の和。
export const SIZES = Object.freeze({
  tall: { band: 44, title: 48, levelBar: 52, hint: 48, status: 36, pad: 60, padGap: 8, gaps: 48, bottom: 12, cellMax: 56 },
  compact: { band: 44, title: 40, levelBar: 48, hint: 0, status: 32, pad: 52, padGap: 6, gaps: 30, bottom: 8, cellMax: 56 },
  tiny: { band: 44, title: 0, levelBar: 48, hint: 0, status: 28, pad: 48, padGap: 6, gaps: 20, bottom: 8, cellMax: 56 },
  short: { band: 44, title: 0, levelBar: 48, hint: 44, status: 32, pad: 52, padGap: 6, gaps: 24, bottom: 8, cellMax: 56 },
  wide: { band: 52, title: 64, levelBar: 52, hint: 48, status: 36, pad: 64, padGap: 8, gaps: 48, bottom: 24, cellMax: 64 },
});
export const padHeight = (s) => s.pad * 3 + s.padGap * 2;
export const gutter = (vw) => (vw < 400 ? 12 : 16);

// 盤の上下に置く物の高さの合計（盤を除く）。設計の値。画面では実際に測った値を reserve として渡す。
export function reserveOf(mode) {
  const s = SIZES[mode];
  if (mode === 'short') return s.band + 16;
  if (mode === 'wide') return s.band + s.title + 40;
  return s.band + s.title + s.levelBar + s.hint + s.status + padHeight(s) + s.gaps + s.bottom;
}

// reserve：実際に描いた帯・題字・面の帯・ヒント・状態・操作の高さの合計（px）。省くと設計の値を使う。
// 文字だけを拡大した端末でも、測った値を渡せば盤が操作の下にもぐらない。
export function cellSize({ vw, vh, cols, rows, reserve }) {
  const mode = layoutMode(vw, vh);
  const s = SIZES[mode];
  const used = typeof reserve === 'number' ? reserve : reserveOf(mode);
  let byW;
  if (mode === 'short') byW = Math.floor((vw * 0.5) / cols);
  else if (mode === 'wide') byW = Math.floor(560 / cols);
  else byW = Math.floor((Math.min(vw, 480) - 2 * gutter(vw)) / cols);
  const byH = Math.floor((vh - used - SLACK) / rows);
  return Math.max(CELL_MIN, Math.min(byW, byH, s.cellMax));
}

// 盤と操作が最初の画面に収まるか（E2E と同じ式。足りなければ負の数）
export function spareHeight({ vw, vh, cols, rows, reserve }) {
  const mode = layoutMode(vw, vh);
  const used = typeof reserve === 'number' ? reserve : reserveOf(mode);
  return vh - used - rows * cellSize({ vw, vh, cols, rows, reserve });
}
