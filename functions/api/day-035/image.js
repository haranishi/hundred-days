/* 写真の中継。og:image をブラウザから直に読むと、CORSを返さないサイトでは
   canvas が汚れて toBlob が落ちる（実測：4サイト中2サイトがCORSなし）。
   同一オリジンで返すために、ここを通す。画像以外は返さない。 */

import { validateTarget, fetchGuarded } from '../../../apps/day-035-front-page/lib/target.js';

const USER_AGENT = 'hundred-days-day035 (+https://hundred-days.pages.dev/day-035-front-page/)';
export const TIMEOUT_MS = 15_000;
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

const fail = (error, status) => new Response(JSON.stringify({ error }), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }
});

export async function onRequestGet(context, { fetchImpl = fetch } = {}) {
  const requestUrl = new URL(context.request.url);
  const target = validateTarget(requestUrl.searchParams.get('src'));
  if (!target) return fail('invalid_url', 400);

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheUrl = new URL(requestUrl.origin + requestUrl.pathname);
  cacheUrl.search = `?src=${encodeURIComponent(target.href)}`;
  const cacheRequest = new Request(cacheUrl.toString(), { method: 'GET' });
  if (cache) {
    const hit = await cache.match(cacheRequest);
    if (hit) return hit;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { response, error } = await fetchGuarded(target, {
      fetchImpl,
      signal: controller.signal,
      maxRedirects: MAX_REDIRECTS,
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' }
    });
    if (error || !response || !response.ok) return fail('upstream_unavailable', 502);
    const contentType = response.headers.get('content-type') ?? '';
    if (!/^image\//i.test(contentType)) return fail('not_image', 415);
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_BYTES) return fail('too_large', 413);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) return fail('too_large', 413);
    const result = new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType.split(';')[0],
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff'
      }
    });
    if (cache && context.waitUntil) context.waitUntil(cache.put(cacheRequest, result.clone()));
    return result;
  } catch (e) {
    return fail(e?.name === 'AbortError' ? 'timeout' : 'upstream_unavailable', e?.name === 'AbortError' ? 504 : 502);
  } finally {
    clearTimeout(timer);
  }
}
