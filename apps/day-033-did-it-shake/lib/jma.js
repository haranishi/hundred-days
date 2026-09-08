/* 外部への取得はこの一覧1本だけ。仕様が変わったら、空の答えにせず知らせる。 */
export const ENDPOINT = 'https://www.jma.go.jp/bosai/quake/data/list.json';
export class ShapeError extends Error {
  constructor() { super('発表の形が変わったようです'); this.name = 'ShapeError'; }
}
const validIntensity = (value) => typeof value === 'string' && /^(?:[1-47]|[56][+-])$/.test(value);
export function parseList(value) {
  if (!Array.isArray(value)) throw new ShapeError();
  for (const row of value) {
    if (!row || typeof row.eid !== 'string' || typeof row.ttl !== 'string' ||
        !Number.isFinite(Date.parse(row.rdt))) throw new ShapeError();
    if (['震源・震度情報', '震度速報'].includes(row.ttl) && row.ift !== '取消') {
      if (!Number.isFinite(Date.parse(row.at)) || !validIntensity(row.maxi) || !Array.isArray(row.int) ||
          !row.int.every((pref) => pref && /^\d{2}$/.test(pref.code) && validIntensity(pref.maxi) && Array.isArray(pref.city) &&
            pref.city.every((city) => city && typeof city.code === 'string' && /^\d{7}$/.test(city.code) && validIntensity(city.maxi)))) throw new ShapeError();
    }
  }
  return value;
}
export async function fetchList({ fetchImpl = globalThis.fetch, timeoutMs = 8000, now = Date.now } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(ENDPOINT, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`発表を取れませんでした (${response.status})`);
    let value;
    try { value = await response.json(); } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ShapeError();
    }
    return { list: parseList(value), fetchedAt: now() };
  } finally { clearTimeout(timer); }
}
