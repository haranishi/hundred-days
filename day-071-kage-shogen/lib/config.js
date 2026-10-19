// 共有の定数。座標は壁の面（cm）で、x は右へ・y は上へ増える。画面への変換は view.js が行う。
export { WALL, GRID } from './geometry.js';

// 画面に出す範囲（壁の左右に10cmずつ余白。邪魔な道具を寄せる場所もこの中に入る）。
export const VIEW = Object.freeze({ minX: -10, maxX: 250, minY: 0, maxY: 180 });

// 月影荘の決まり：灯りは胸の高さ（身長のちょうど6割）に提げる。
export const HEIGHT_RATIO = 0.6;

// 1回の微調整の大きさ（cm）。細かい操作は fine、Shift や長押しの粗い操作は coarse。
export const STEP = Object.freeze({ fine: 1, coarse: 5 });

// 合格の状態を保つ時間と、正解の位置へそろえる動きの長さ（ms）。
export const SOLVE_HOLD_MS = 350;
export const SNAP_MS = 420;

// 星：ガイド・ヒント・誤答のどれも使わず1回で解くと3つ。使った分だけ減る（最低1つ）。
export const MAX_STARS = 3;
