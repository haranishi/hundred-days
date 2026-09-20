/* 駐車場データの取得。ブラウザからOverpassを直接叩かず、同一オリジンの中継APIを通す。

   理由はOverpassの利用方針そのもの。「アプリやサイトの利用は全利用者の合計で数える」
   「常設なら1日100クエリ・10MBまで」「アプリを識別できるUser-Agentを付ける」
   「キャッシュとレート制限をする」と書かれている。ブラウザのfetchではUser-Agentを
   設定できず、キャッシュも利用者ごとに分かれてしまうので、方針を満たせるのは
   サーバー側だけになる（day-013/023と同じ形）。 */

import { normalizeElements } from './normalize.js';
import { cacheKey, readCache, safeStorage, writeCache } from './storage.js';
import { displayableCount, nextRadius, RADII } from './state.js';

export const ENDPOINT = '/api/day-025/parking';
export const EXPAND_DELAY_MS = 300;

// 中継APIが「上流が混んでいる／叩きすぎ」を伝えるときのコード
export const RATE_LIMIT_STATUS = 429;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function buildRequestUrl(lat, lng, radius) {
  // 中継側は座標を丸めてキャッシュする。ここで5桁に落としておくと、
  // 同じ場所からの再検索がURLごと一致してブラウザキャッシュにも乗る
  const params = new URLSearchParams({
    lat: Number(lat).toFixed(5),
    lng: Number(lng).toFixed(5),
    radius: String(radius),
  });
  return `${ENDPOINT}?${params}`;
}

export function rateLimitError() {
  const error = new Error('取得の上限に達しました');
  error.rateLimited = true;
  return error;
}

export async function fetchParking(lat, lng, radius, fetchFn = fetch) {
  const response = await fetchFn(buildRequestUrl(lat, lng, radius), { headers: { Accept: 'application/json' } });
  if (response.status === RATE_LIMIT_STATUS) throw rateLimitError();
  if (!response.ok) throw new Error(`parking ${response.status}`);
  const body = await response.json();
  return Array.isArray(body?.elements) ? body.elements : [];
}

export async function searchNearby(center, { fetchFn = fetch, waitFn = sleep, cache = safeStorage('sessionStorage'), onExpand = () => {}, expandDelayMs = EXPAND_DELAY_MS } = {}) {
  let radius = RADII[0];
  let requested = false;
  while (true) {
    const key = cacheKey(center.lat, center.lng, radius);
    let elements = readCache(cache, key);
    if (!elements) {
      if (requested) await waitFn(expandDelayMs); // 拡大の連続リクエストを詰めない
      elements = await fetchParking(center.lat, center.lng, radius, fetchFn);
      requested = true;
      writeCache(cache, key, elements);
    }
    const normalized = normalizeElements(elements);
    const shown = displayableCount(normalized);
    const next = nextRadius(radius, shown);
    if (!next) return { radius, results: normalized };
    onExpand(radius, next, shown);
    radius = next;
  }
}
