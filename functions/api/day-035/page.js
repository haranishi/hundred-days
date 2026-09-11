/* 貼られたページのOGPだけを取る中継。本文は取らない（他人の記事の複製になるため）。
   ブラウザからは他オリジンのHTMLを読めないので、ここが代わりに1回だけ取りに行く。
   巡回はしない。ユーザーが貼った1本を、その場で1回。SNSのリンク展開と同じ範囲。 */

import { validateTarget, fetchGuarded } from '../../../apps/day-035-front-page/lib/target.js';

const USER_AGENT = 'hundred-days-day035 (+https://hundred-days.pages.dev/day-035-front-page/)';
export const TIMEOUT_MS = 15_000;
export const MAX_BYTES = 256 * 1024; // 見出しは <head> にある。本文まで読む必要がない
export const MAX_REDIRECTS = 3;

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–'
};

export function decodeEntities(value = '') {
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

export function attrsOf(tag = '') {
  const attrs = {};
  const re = /([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match = re.exec(tag);
  while (match) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? '');
    match = re.exec(tag);
  }
  return attrs;
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim() || null;

function absolute(value, base) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/* 取るのは og と標準のメタだけ。本文には触らない */
export function extractMeta(html = '', baseUrl = '') {
  const meta = new Map();
  for (const [tag] of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attrsOf(tag);
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content);
  }
  let canonical = null;
  for (const [tag] of String(html).matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attrsOf(tag);
    if ((attrs.rel || '').toLowerCase() === 'canonical' && attrs.href) {
      canonical = absolute(attrs.href, baseUrl);
      break;
    }
  }
  const titleTag = /<title[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(html);
  const pick = (...keys) => {
    for (const key of keys) {
      const value = clean(meta.get(key));
      if (value) return value;
    }
    return null;
  };
  return {
    title: pick('og:title', 'twitter:title') || clean(decodeEntities(titleTag?.[1] ?? '')),
    lead: pick('og:description', 'twitter:description', 'description'),
    image: absolute(pick('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'), canonical || baseUrl),
    site: pick('og:site_name', 'application-name'),
    publishedAt: pick('article:published_time', 'article:modified_time', 'date', 'pubdate'),
    canonical
  };
}

/* content-type と <meta charset> から文字コードを決める。日本語のサイトはまだUTF-8だけではない */
export function charsetOf(contentType = '', head = '') {
  const fromHeader = /charset\s*=\s*["']?([\w:.-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w:.-]+)/i.exec(head)?.[1];
  return (fromMeta || 'utf-8').toLowerCase();
}

/* 先頭だけ読んで打ち切る。まるごと落としてこないのは、帯域と、本文を持たないという方針の両方のため */
export async function readCapped(response, limit = MAX_BYTES) {
  if (!response.body) return new Uint8Array(await response.arrayBuffer()).slice(0, limit);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  const merged = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= merged.length) break;
    merged.set(chunk.subarray(0, merged.length - offset), offset);
    offset += chunk.length;
  }
  return merged;
}

export function decodeHtml(bytes, contentType) {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  const charset = charsetOf(contentType, utf8.slice(0, 2048));
  if (charset === 'utf-8' || charset === 'utf8') return utf8;
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return null;
  }
}

const json = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': status === 200 ? 'public, max-age=600, s-maxage=3600' : 'no-store'
  }
});

export async function onRequestGet(context, { fetchImpl = fetch } = {}) {
  const requestUrl = new URL(context.request.url);
  const target = validateTarget(requestUrl.searchParams.get('url'));
  if (!target) return json({ error: 'invalid_url' }, 400);

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheUrl = new URL(requestUrl.origin + requestUrl.pathname);
  cacheUrl.search = `?url=${encodeURIComponent(target.href)}`;
  const cacheRequest = new Request(cacheUrl.toString(), { method: 'GET' });
  if (cache) {
    const hit = await cache.match(cacheRequest);
    if (hit) return hit;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { response, finalUrl, error } = await fetchGuarded(target, {
      fetchImpl,
      signal: controller.signal,
      maxRedirects: MAX_REDIRECTS,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ja,en;q=0.8' }
    });
    if (error || !response) return json({ error: error ?? 'upstream_unavailable' }, 502);
    if (!response.ok) return json({ error: 'upstream_unavailable', status: response.status }, 502);
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      return json({ error: 'not_html' }, 415);
    }
    const html = decodeHtml(await readCapped(response), contentType);
    if (html === null) return json({ error: 'encoding_unsupported' }, 415);
    const meta = extractMeta(html, finalUrl.href);
    if (!meta.title && !meta.lead) return json({ error: 'no_meta' }, 422);
    const body = { ...meta, url: finalUrl.href, host: finalUrl.hostname.replace(/^www\d*\./, '') };
    const result = json(body, 200);
    if (cache && context.waitUntil) context.waitUntil(cache.put(cacheRequest, result.clone()));
    return result;
  } catch (e) {
    return json({ error: e?.name === 'AbortError' ? 'timeout' : 'upstream_unavailable' }, e?.name === 'AbortError' ? 504 : 502);
  } finally {
    clearTimeout(timer);
  }
}
