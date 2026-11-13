/**
 * 手の表示をドラッグで回す操作の判定（three.js にも画面にも依存しない。hand-r2 で追加）。
 *
 * 指（タッチ）では、縦の払いはページのスクロールに渡し、横の払いだけで手を左右に回す。図鑑の項目ページでは手の表示が最初の画面の
 * 縦 約300〜650px を占めるので、縦の払いを奪うとページが動かず手が傾くだけになっていた（使い心地の評価の指摘）。
 * 表示には touch-action: pan-y を付け、縦の払いはブラウザがスクロールする（その時は pointercancel が来る）。
 * ここでは動き始めの向きで「回す」か「任せる」かを決める。指では上下の回転はしない（縦の払いと区別できないため）。
 * マウスとペンは今までどおり、横で左右・縦で上下に回す。
 */

/** 動き始めとみなす距離（px）。これより小さい揺れでは決めない */
export const DRAG_SLOP = 6;

export type DragIntent = 'pending' | 'rotate' | 'scroll';

/**
 * 押してから dx・dy（px）動いた時の判定。
 * 指: 横の動きが縦の動き以上なら回す、縦が大きければスクロールに任せる。マウス・ペン: 動けば回す
 */
export function dragIntent(dx: number, dy: number, pointerType: string): DragIntent {
  if (Math.hypot(dx, dy) < DRAG_SLOP) return 'pending';
  if (pointerType !== 'touch') return 'rotate';
  return Math.abs(dx) >= Math.abs(dy) ? 'rotate' : 'scroll';
}

/**
 * 回す量（度）。表示の幅をひと往復で約 160° 回る速さ（小さな表示でも回し切れるように幅で割る）。
 * 指では上下に回さない
 */
export function dragRotation(dx: number, dy: number, width: number, pointerType: string): { yaw: number; pitch: number } {
  const k = 160 / Math.max(160, width);
  return { yaw: 0 - dx * k, pitch: pointerType === 'touch' ? 0 : dy * k * 0.8 };
}
