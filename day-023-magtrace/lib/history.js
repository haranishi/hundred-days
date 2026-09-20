export const STORAGE_NAME = "magtrace-recent-queries";

export function readHistory(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const value = JSON.parse(target.getItem(STORAGE_NAME) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item).slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function saveHistory(query, storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const next = [query, ...readHistory(target).filter((item) => item !== query)].slice(0, 5);
    target.setItem(STORAGE_NAME, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function clearHistory(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    target.removeItem(STORAGE_NAME);
    return true;
  } catch {
    return false;
  }
}

export function canUseStorage(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    target.getItem(STORAGE_NAME);
    return true;
  } catch {
    return false;
  }
}
