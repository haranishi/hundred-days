import {LEVELS} from './levels.js';
export const STORAGE_KEY = 'amegumo-sokoban.v1';
const IDS = LEVELS.map(level=>level.id);
export function readProgress(storage) {
  try {
    const raw = JSON.parse((storage ?? globalThis.localStorage).getItem(STORAGE_KEY) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(IDS.filter(id => Number.isSafeInteger(raw[id]) && raw[id] > 0 && raw[id] <= 10000).map(id => [id,raw[id]]));
  } catch {return {};}
}
export function recordWin(progress, id, moves, storage) {
  if (!IDS.includes(id) || !Number.isSafeInteger(moves) || moves < 1 || moves > 10000) return {progress,saved:false};
  const next = {...progress,[id]:Math.min(progress[id] ?? Infinity,moves)};
  try {(storage ?? globalThis.localStorage).setItem(STORAGE_KEY,JSON.stringify(next));return {progress:next,saved:true};}
  catch {return {progress:next,saved:false};}
}
