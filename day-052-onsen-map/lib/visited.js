// 「行った」の記録。この端末の localStorage だけに置く。
// 読み書きは必ず try/catch で包む（プライベートモード・保存の禁止・容量切れで例外になる）。
// 保存できない環境でも、開いている間はメモリの上で動く。

import { isBathId } from './baths.js';

// 定数名に KEY を含めない（秘密情報の検査が誤検知する）
export const STORE_NAME = 'day052.visited.v1';
const PROBE_NAME = 'day052.probe';

export function safeStorage(scope = globalThis) {
  try {
    const storage = scope.localStorage;
    if (!storage) return null;
    storage.setItem(PROBE_NAME, '1');
    storage.removeItem(PROBE_NAME);
    return storage;
  } catch {
    return null;
  }
}

export function sanitizeVisited(items, prefCodes) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const clean = [];
  for (const item of items) {
    if (!item || !isBathId(item.id) || seen.has(item.id)) continue;
    if (!prefCodes.includes(item.pref)) continue;
    seen.add(item.id);
    clean.push({
      id: item.id,
      pref: item.pref,
      name: typeof item.name === 'string' ? item.name.slice(0, 80) : '',
      at: Number.isFinite(item.at) ? item.at : 0,
    });
  }
  return clean;
}

export function loadVisited(storage, prefCodes) {
  try {
    const raw = storage?.getItem(STORE_NAME);
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (value?.v !== 1) return [];
    return sanitizeVisited(value.items, prefCodes);
  } catch {
    return [];
  }
}

export function saveVisited(storage, items) {
  if (!storage) return false;
  try {
    storage.setItem(STORE_NAME, JSON.stringify({ v: 1, items }));
    return true;
  } catch {
    return false;
  }
}

export const isVisited = (items, id) => items.some((item) => item.id === id);

export function toggleVisited(items, bath, now = Date.now()) {
  if (isVisited(items, bath.id)) return items.filter((item) => item.id !== bath.id);
  return [...items, { id: bath.id, pref: bath.pref, name: bath.name || '', at: now }];
}

export const removeVisited = (items, id) => items.filter((item) => item.id !== id);

export function visitedSummary(items) {
  return { baths: items.length, prefs: new Set(items.map((item) => item.pref)).size };
}

export const summaryText = ({ baths, prefs }) => `行った ${baths}か所・${prefs}都道府県`;
