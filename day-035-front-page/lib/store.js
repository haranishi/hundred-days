/* 貼ったリンクを端末に覚えておく。次に開いたときに同じ紙面が出る。
   外へ送るのは中継だけで、ここに入れたものは端末から出ない。 */

const KEY = 'day-035-front-page';
export const MAX_ARTICLES = 3;

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.url === 'string').slice(0, MAX_ARTICLES) : [];
  } catch {
    return [];
  }
}

export function save(articles, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(articles.slice(0, MAX_ARTICLES)));
    return true;
  } catch {
    return false;
  }
}

export function clear(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* 消せなくても画面は進む */
  }
}
