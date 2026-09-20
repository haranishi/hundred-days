/* 前に書いた言葉を端末に覚えておく。押すとすぐ書き直せる。
   入れたものは端末から出ない（このアプリは外へ何も送らない）。 */

const KEY = 'day-036-stroke-by-stroke';
export const MAX_RECENT = 5;

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((w) => typeof w === 'string' && w.length > 0).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/* 同じ言葉は先頭へ動かす。並びは「最後に書いた順」。 */
export function remember(word, previous) {
  const list = Array.isArray(previous) ? previous : [];
  if (typeof word !== 'string' || !word) return list.slice(0, MAX_RECENT);
  return [word, ...list.filter((w) => w !== word)].slice(0, MAX_RECENT);
}

export function save(words, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(words.slice(0, MAX_RECENT)));
    return true;
  } catch {
    return false;
  }
}
