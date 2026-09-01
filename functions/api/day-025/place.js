/* 地名検索の中継。ブラウザとNominatimのあいだに立つ。

   Nominatimの利用方針（https://operations.osmfoundation.org/policies/nominatim/）は
   「最大でも毎秒1リクエスト」「アプリを識別できるRefererかUser-Agentを付ける
   （ライブラリ既定のUAは不可）」「結果は必ず自分側でキャッシュする。同じ問い合わせを
   繰り返す利用者は不正として遮断され得る」と定めている。ブラウザのfetchは
   User-Agentを設定できないので、ここで付ける。

   キャッシュは7日。地名と座標の対応は数日で変わるものではなく、このアプリの問い合わせは
   駅名や施設名に集中するので、実質ほとんどが再利用になる。
   なお毎秒1件の上限は、エッジをまたぐ確実な制御ができないため保証していない。
   上流が429を返したらそのまま利用者に伝え、こちらから叩き直さない。 */

const UPSTREAM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "hundred-days-day025 (+https://hundred-days.pages.dev/day-025-nearby-parking/)";
export const TIMEOUT_MS = 15_000; // 上流の応答が遅い日に、答えが来る前に諦めない
const LIMIT = 5;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export function normalizeQuery(value) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").replace(CONTROL_CHARS, "").trim();
  return normalized.length >= 1 && normalized.length <= 40 ? normalized : null;
}

/** 画面が使う3項目だけに削る。住所以外のOSMメタデータは持ち出さない */
export function trimPlaces(items = []) {
  return items
    .map((item) => ({ name: String(item?.display_name ?? ""), lat: Number(item?.lat), lng: Number(item?.lon) }))
    .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .slice(0, LIMIT);
}

const json = (body, status, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": status === 200 ? "public, max-age=3600, s-maxage=604800" : "no-store",
    ...extra,
  },
});

export async function onRequestGet(context, { fetchImpl = fetch } = {}) {
  const url = new URL(context.request.url);
  const query = normalizeQuery(url.searchParams.get("q"));
  if (!query) return json({ error: "invalid_query" }, 400);

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheUrl = new URL(url.origin + url.pathname);
  cacheUrl.search = `?q=${encodeURIComponent(query)}`;
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const target = new URL(UPSTREAM);
  target.search = new URLSearchParams({
    q: query, format: "jsonv2", limit: String(LIMIT), "accept-language": "ja",
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetchImpl(target.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    // 叩きすぎのときは追い打ちせず、そのまま伝える
    if (upstream.status === 429 || upstream.status === 403) {
      return json({ error: "rate_limited" }, 429, { "Retry-After": "30" });
    }
    if (!upstream.ok) return json({ error: "upstream_unavailable" }, 502);
    const places = trimPlaces(await upstream.json());
    const response = json({
      places,
      source: {
        name: "Nominatim / OpenStreetMap contributors",
        license: "ODbL 1.0",
        url: "https://www.openstreetmap.org/copyright",
      },
    }, 200);
    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    return json({ error: "upstream_unavailable" }, 502);
  } finally {
    clearTimeout(timer);
  }
}
