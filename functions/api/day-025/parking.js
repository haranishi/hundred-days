/* 駐車場データの中継。ブラウザとOverpass APIのあいだに立って、利用方針を守る役をする。

   Overpassの利用方針（https://wiki.openstreetmap.org/wiki/Overpass_API）は
   「アプリやサイトの利用は全利用者の合計で数える」「常設利用なら1日100クエリ・10MB未満に」
   「アプリを一意に識別できるUser-AgentかRefererを付ける」「キャッシュとレート制限をする」
   「429や406を受けたら30秒待つ」と定めている。ブラウザから直接叩くとUser-Agentを付けられず、
   キャッシュも利用者ごとに割れるので、方針を満たせるのはここだけになる。

   いちばん効くのは**座標を丸めること**。半径800mの検索に対して約110m四方まで丸めるので、
   同じ駅前から来た人はみな同じキャッシュを引き、上流には1回しか行かない。 */

const UPSTREAMS = [
  "https://z.overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];
const USER_AGENT = "hundred-days-day025 (+https://hundred-days.pages.dev/day-025-nearby-parking/)";
/* Overpassに「最大10秒まで計算していい」と伝えているので、こちらの打ち切りは必ずそれより長くする。
   8秒にしていたときは、上流が答えを作り終える前に毎回諦めていた（本番で初回が必ず502・16秒＝8秒×2系統。
   2回目は上流側が温まって成功するので、ローカルでは気づけなかった）。
   上流の計算を途中で捨てるのは負荷をかけ損でもある。 */
const QUERY_TIMEOUT_S = 10;
export const TIMEOUT_MS = (QUERY_TIMEOUT_S + 5) * 1000;
const ALLOWED_RADII = [800, 3200];
const MAX_ELEMENTS = 500;
const CELL = 1000; // 座標を1/1000度＝約110m四方に丸める

// 実装で使うタグだけ通す。返す量が減れば上流の1日10MBの枠も長持ちする
const KEEP_TAGS = ["name", "fee", "charge", "opening_hours", "capacity", "access", "amenity"];

export function roundCoord(value) {
  return Math.round(value * CELL) / CELL;
}

export function parseParams(searchParams) {
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radius = Number(searchParams.get("radius"));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (!ALLOWED_RADII.includes(radius)) return null;
  return { lat: roundCoord(lat), lng: roundCoord(lng), radius };
}

export function buildQuery(lat, lng, radius) {
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];nwr["amenity"="parking"](around:${radius},${lat},${lng});out tags center ${MAX_ELEMENTS};`;
}

/** 画面が使う項目だけに削る。座標は node は lat/lon、way/relation は center に入る */
export function trimElement(element) {
  const tags = element?.tags || {};
  const kept = {};
  for (const key of KEEP_TAGS) if (tags[key] !== undefined) kept[key] = tags[key];
  const trimmed = { type: element.type, id: element.id, tags: kept };
  if (element.type === "node") { trimmed.lat = element.lat; trimmed.lon = element.lon; }
  else if (element.center) trimmed.center = { lat: element.center.lat, lon: element.center.lon };
  return trimmed;
}

export function trimElements(elements = []) {
  const hasCoords = (e) => (e.type === "node"
    ? Number.isFinite(e.lat) && Number.isFinite(e.lon)
    : Number.isFinite(e.center?.lat) && Number.isFinite(e.center?.lon));
  return elements.filter((e) => e && hasCoords(e)).map(trimElement);
}

class UpstreamLimited extends Error {
  constructor() { super("upstream rate limited"); this.rateLimited = true; }
}

/** 別マシンを指す2系統を順に試す。429/406は「叩きすぎ」なので即座に諦める（方針どおり30秒空ける） */
export async function fetchUpstream(query, { fetchImpl = fetch, upstreams = UPSTREAMS, timeoutMs = TIMEOUT_MS } = {}) {
  let lastError;
  for (const endpoint of upstreams) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status === 406) throw new UpstreamLimited();
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof UpstreamLimited) throw error; // 他系統も同じIPから数えられる。追い打ちしない
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("Overpass unavailable");
}

const json = (body, status, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    // 駐車場は数日で変わるものではない。エッジで長く持たせて上流に行く回数を減らす
    "Cache-Control": status === 200 ? "public, max-age=3600, s-maxage=604800" : "no-store",
    ...extra,
  },
});

export async function onRequestGet(context, { fetchImpl = fetch } = {}) {
  const url = new URL(context.request.url);
  const params = parseParams(url.searchParams);
  if (!params) return json({ error: "invalid_params" }, 400);

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheUrl = new URL(url.origin + url.pathname);
  cacheUrl.search = `?lat=${params.lat}&lng=${params.lng}&radius=${params.radius}`;
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  try {
    const data = await fetchUpstream(buildQuery(params.lat, params.lng, params.radius), { fetchImpl });
    const response = json({
      elements: trimElements(data?.elements),
      center: { lat: params.lat, lng: params.lng },
      radius: params.radius,
      source: {
        name: "OpenStreetMap contributors",
        license: "ODbL 1.0",
        url: "https://www.openstreetmap.org/copyright",
        via: "Overpass API",
      },
    }, 200);
    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    if (error?.rateLimited) return json({ error: "rate_limited" }, 429, { "Retry-After": "30" });
    return json({ error: "upstream_unavailable" }, 502);
  }
}
