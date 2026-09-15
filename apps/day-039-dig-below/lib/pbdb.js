import { bounds, nearest } from './geo.js';
const API = 'https://paleobiodb.org/data1.2/';
export async function getJSON(url, { signal, fetcher = fetch } = {}) {
  const response = await fetcher(url, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('データを取得できません');
  return response.json();
}
async function records(path, params, options) {
  const data = await getJSON(`${API}${path}?${new URLSearchParams(params)}`, options);
  if (!Array.isArray(data.records) || data.errors?.length) throw new Error('応答を読み取れません');
  return data.records;
}
export async function findRecords(point, options = {}) {
  let collections = [];
  for (const half of [0.3, 0.9, 3.5]) {
    const found = await records('colls/list.json', { ...bounds(point, half), show: 'loc,time,env', limit: 3000 }, options);
    collections = nearest([...collections, ...found], point);
    if (collections.length >= 40) break;
  }
  if (!collections.length) return { collections, occurrences: [] };
  const occurrences = await records('occs/list.json', {
    coll_id: collections.map((r) => r.oid).join(','), show: 'class,ref', limit: 5000,
  }, options);
  const ids = new Set(collections.map((r) => r.oid));
  return { collections, occurrences: occurrences.filter((r) => ids.has(r.cid)), truncated: occurrences.length >= 5000 };
}
