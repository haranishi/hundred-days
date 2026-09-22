import { LEVELS as DATA } from './level-data.js';

// 元データを変えず、省略可能な受け渡し項目を補う。
export const LEVELS = Object.freeze(DATA.map(level => Object.freeze({
  ...level,
  parTicks: level.parTicks ?? 2400,
  secretMochi: level.secretMochi ?? null,
  entityOptions: level.entityOptions ?? {},
  routes: { safe: [], reward: [], ...level.routes },
})));

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
