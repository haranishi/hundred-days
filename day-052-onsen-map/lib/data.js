// 同梱データの読み込みと形の確認。形が崩れていたら読めなかったのと同じ扱いにする（半端な数字を出さない）。

import { TYPES } from './classify.js';
import { METRIC_IDS } from './metrics.js';

export const DATA_URLS = { stats: './data/stats.json', baths: './data/baths.json' };

const isCount = (value) => Number.isInteger(value) && value >= 0;

export function validateStats(json) {
  const prefectures = json?.prefectures;
  if (!Array.isArray(prefectures) || prefectures.length !== 47) throw new Error('stats: 47都道府県がありません');
  prefectures.forEach((pref, index) => {
    const code = String(index + 1).padStart(2, '0');
    if (pref?.code !== code || typeof pref.name !== 'string') throw new Error(`stats: ${code} の並びか名前が違います`);
    if (!Number.isFinite(pref.capital?.lng) || !Number.isFinite(pref.capital?.lat)) throw new Error(`stats: ${code} の位置がありません`);
    for (const metric of METRIC_IDS) if (!isCount(pref[metric])) throw new Error(`stats: ${code} の ${metric} が数ではありません`);
  });
  const national = json.national;
  for (const metric of METRIC_IDS) if (!isCount(national?.[metric])) throw new Error(`stats: 全国の ${metric} がありません`);
  if (!Array.isArray(national.sentoSeries) || national.sentoSeries.length < 2) throw new Error('stats: 銭湯の推移がありません');
  return json;
}

export function validateBaths(json) {
  if (!Array.isArray(json?.baths) || !json.counts || typeof json.counts !== 'object') throw new Error('baths: 形が違います');
  for (const bath of json.baths) {
    if (typeof bath?.id !== 'string' || typeof bath.pref !== 'string'
      || !Number.isFinite(bath.lat) || !Number.isFinite(bath.lng) || !TYPES.includes(bath.t)) {
      throw new Error('baths: お風呂の項目が足りません');
    }
  }
  return json;
}

async function fetchJson(url, fetchFn) {
  const response = await fetchFn(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`data ${response.status}`);
  return response.json();
}

export async function loadStats(fetchFn = globalThis.fetch) {
  return validateStats(await fetchJson(DATA_URLS.stats, fetchFn));
}

export async function loadBaths(fetchFn = globalThis.fetch) {
  return validateBaths(await fetchJson(DATA_URLS.baths, fetchFn));
}

// 県コード → その県のお風呂。並びは baths.json の順（県ごと・番号順）のまま
export function indexBaths(baths) {
  const byPref = new Map();
  const byId = new Map();
  for (const bath of baths) {
    if (!byPref.has(bath.pref)) byPref.set(bath.pref, []);
    byPref.get(bath.pref).push(bath);
    byId.set(bath.id, bath);
  }
  return { byPref, byId };
}
