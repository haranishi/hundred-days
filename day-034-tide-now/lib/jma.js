import { parseYear, dateWindow } from './tide.js';
export { ShapeError } from './tide.js';
const BASE = 'https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt';
// 成功・進行中は共有する。失敗だけは手動の「もう一度読む」で再試行できる。
export function createClient(fetcher = (...args) => fetch(...args), timeoutMs = 8000) {
  const memory = new Map();
  function fetchYear(code, year) {
    if (!/^[A-Z][A-Z0-9]$/.test(code) || !Number.isInteger(year) || year < 2000 || year > 2099) return Promise.reject(new TypeError('地点または年が不正です'));
    const id = `${code}:${year}`;
    if (memory.has(id)) return memory.get(id);
    const pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(`${BASE}/${year}/${code}.txt`, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        // 呼び出し側が文言（地点名入り）と行動の案内を決められるように status を添える。
        if (!response.ok) throw Object.assign(new Error(response.status === 404 ? '潮位表が見つかりません' : '潮位表が取れません'), { status: response.status });
        return parseYear(await response.text(), code);
      } finally { clearTimeout(timer); }
    })();
    memory.set(id, pending);
    pending.catch(() => memory.delete(id));
    return pending;
  }
  async function fetchWindow(code, now) {
    const dates = dateWindow(now), year = Number(dates[1].slice(0, 4));
    const years = [...new Set([year, ...dates.map((date) => Number(date.slice(0, 4)))])];
    const results = await Promise.allSettled(years.map((value) => fetchYear(code, value)));
    if (results[0].status === 'rejected') throw results[0].reason;
    return new Map(results.flatMap((result) => result.status === 'fulfilled' ? [...result.value] : []));
  }
  return { fetchYear, fetchWindow };
}
export const { fetchYear, fetchWindow } = createClient();
