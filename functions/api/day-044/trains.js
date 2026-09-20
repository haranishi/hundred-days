import { RAILWAY } from '../../../day-044-train-here/lib/network.js';
import { normalizeTrain, MAX_AGE_MS } from '../../../day-044-train-here/lib/trains.js';

const ENDPOINT = 'https://api-challenge.odpt.org/api/v4/odpt:Train';
const MAX_BYTES = 1_000_000;
const errorResponse = (code, status) => Response.json({ code }, { status, headers: { 'Cache-Control': 'no-store' } });

// 上流のURL・本文・例外をログやクライアントへ出さない（URLに認証キーを含むため）。
async function boundedJSON(response) {
  if (Number(response.headers.get('Content-Length')) > MAX_BYTES) throw new Error('Payload too large');
  if (!response.body) throw new Error('Empty body');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Payload too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function handleTrains(context, dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const fetcher = dependencies.fetch ?? fetch;
  const cache = dependencies.cache ?? globalThis.caches?.default;
  if (context.request.method !== 'GET') return errorResponse('METHOD_NOT_ALLOWED', 405);
  const token = context.env?.ODPT_CHALLENGE_TOKEN;
  if (typeof token !== 'string' || !token.trim()) return errorResponse('NOT_CONFIGURED', 503);
  // 特定利用条件と当アプリでの利用範囲を確認した運用者が明示的に有効にする。
  if (context.env?.ODPT_USE_CONFIRMED !== 'true') return errorResponse('ACCESS_PENDING', 503);
  const cacheUrl = new URL(context.request.url);
  cacheUrl.pathname = '/api/day-044/trains'; cacheUrl.search = '';
  const cacheKey = new Request(cacheUrl, { method: 'GET' });
  if (cache) {
    try { const saved = await cache.match(cacheKey); if (saved) return saved; } catch { /* キャッシュ失敗だけで上流取得を止めない */ }
  }
  const url = new URL(ENDPOINT);
  url.searchParams.set('odpt:operator', 'odpt.Operator:JR-East');
  url.searchParams.set('odpt:railway', RAILWAY);
  url.searchParams.set('acl:consumerKey', token.trim());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const upstream = await fetcher(url.toString(), { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
    if (!upstream.ok) return errorResponse(upstream.status === 401 || upstream.status === 403 ? 'ACCESS_DENIED' : 'UPSTREAM_UNAVAILABLE', 502);
    const data = await boundedJSON(upstream);
    if (!Array.isArray(data) || data.length > 500) return errorResponse('INVALID_UPSTREAM', 502);
    const receivedAt = now();
    const records = data.filter(row => row && row['odpt:railway'] === RAILWAY);
    const trains = records.map(row => normalizeTrain(row, receivedAt)).filter(Boolean);
    const times = records.map(row => Date.parse(row['dc:date'])).filter(t => Number.isFinite(t) && t <= receivedAt + 30_000);
    const allOld = records.length > 0 && times.length === records.length && records.every(row => {
      const timestamp = Date.parse(row['dc:date']);
      const valid = row['dct:valid'] == null ? timestamp + MAX_AGE_MS : Date.parse(row['dct:valid']);
      return receivedAt - timestamp > MAX_AGE_MS || valid <= receivedAt;
    });
    if (records.length && !trains.length && !allOld) return errorResponse('UNSUPPORTED_UPSTREAM', 502);
    const result = {
      status: trains.length ? 'live' : allOld ? 'stale' : 'empty',
      updatedAt: trains.length ? Math.max(...trains.map(t => t.updatedAt)) : times.length ? Math.max(...times) : null,
      receivedAt, trains,
    };
    const response = Response.json(result, { headers: { 'Cache-Control': 'public, max-age=15, s-maxage=30', 'X-Content-Type-Options': 'nosniff' } });
    if (cache) {
      const pending = cache.put(cacheKey, response.clone()).catch(() => {});
      if (context.waitUntil) context.waitUntil(pending); else await pending;
    }
    return response;
  } catch { return errorResponse('UPSTREAM_UNAVAILABLE', 502); }
  finally { clearTimeout(timeout); }
}
// 公開版は架空デモ専用。環境にキーが設定されても実データを取得・配信しない。
export const onRequest = () => errorResponse('DEMO_ONLY', 503);
