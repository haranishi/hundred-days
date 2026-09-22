import { LEVELS } from './level-data.js';

// 手設計の面を加工せず、そのまま共有する。
export { LEVELS };

export const levelId = index =>
  `${Math.floor(index / 5) + 1}-${(index % 5) + 1}`;
export function getLevel(id) {
  if (!/^[1-4]-[1-5]$/.test(id)) {
    throw new RangeError('不明な面');
  }
  return LEVELS[(Number(id[0]) - 1) * 5 + Number(id[2]) - 1];
}
export function tileAt(level, x, y) {
  return level.rows[Math.floor(y / 16)]?.[Math.floor(x / 16)] ?? '.';
}
export function markers(level, chars) {
  return level.rows.flatMap((row, y) =>
    [...row].flatMap((type, x) =>
      chars.includes(type) ? [{ type, x: x * 16, y: y * 16 }] : [],
    ),
  );
}
