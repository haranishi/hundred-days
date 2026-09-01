/* 地名検索。Nominatimも中継API経由にする。

   利用方針が「アプリを識別できるUser-Agentを付けること（ライブラリ既定のUAは不可）」
   「最大でも毎秒1リクエスト」「結果は必ずキャッシュすること」を求めていて、
   ブラウザのfetchではUser-Agentを設定できない。 */

export const ENDPOINT = '/api/day-025/place';

export function buildRequestUrl(query) {
  return `${ENDPOINT}?q=${encodeURIComponent(query)}`;
}

export async function searchPlaces(query, fetchFn = fetch) {
  const response = await fetchFn(buildRequestUrl(query), { headers: { Accept: 'application/json' } });
  if (response.status === 429) {
    const error = new Error('地名検索の上限に達しました');
    error.rateLimited = true;
    throw error;
  }
  if (!response.ok) throw new Error(`place ${response.status}`);
  const body = await response.json();
  return Array.isArray(body?.places) ? body.places : [];
}
