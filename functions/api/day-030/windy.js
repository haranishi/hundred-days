const UPSTREAM = "https://api.windy.com/webcams/api/v3";
const USER_AGENT = "hundred-days-day030 (+https://hundred-days.pages.dev/day-030-world-window/)";
export const TIMEOUT_MS = 15_000;

const LIST_CACHE_CONTROL = "public, max-age=300, s-maxage=600";
const DETAIL_CACHE_CONTROL = "private, max-age=300";

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const valueOrNull = (value) => value ?? null;

const trimCategories = (categories) => {
  if (!Array.isArray(categories)) return null;
  return categories.map((category) => valueOrNull(category?.id));
};

/** bbox と zoom を一緒に検証し、不正なら null を返す。 */
export function parseBbox(value, zoomValue) {
  if (typeof value !== "string" || !["string", "number"].includes(typeof zoomValue)) return null;
  const parts = value.split(",");
  if (parts.length !== 4 || parts.some((part) => part.trim() === "")) return null;

  const [north, east, south, west] = parts.map(Number);
  const zoom = Number(zoomValue);
  if (
    ![north, east, south, west].every(Number.isFinite)
    || north <= south
    || north < -90 || north > 90
    || south < -90 || south > 90
    || east < -180 || east > 180
    || west < -180 || west > 180
    || !Number.isInteger(zoom) || zoom < 5 || zoom > 18
  ) return null;

  return { north, east, south, west, zoom };
}

/** 同じ表示範囲を再利用できるよう、境界を必ず外側へ広げる。 */
export function snapBbox(bbox, zoom = bbox?.zoom) {
  const step = zoom >= 8 ? 0.1 : 0.5;
  const precision = 1;
  const outward = (value, direction) => {
    // 39.9 / 0.1 のような浮動小数点誤差で、格子上の値を一段広げないための許容差。
    const scaled = value / step;
    const snapped = direction === "up"
      ? Math.ceil(scaled - 1e-10) * step
      : Math.floor(scaled + 1e-10) * step;
    const rounded = Number(snapped.toFixed(precision));
    return Object.is(rounded, -0) ? 0 : rounded;
  };

  return {
    north: outward(bbox.north, "up"),
    east: outward(bbox.east, "up"),
    south: outward(bbox.south, "down"),
    west: outward(bbox.west, "down"),
  };
}

/** 利用画面に必要な項目だけを返し、上流固有の情報を持ち出さない。 */
export function trimList(payload = {}) {
  const webcams = Array.isArray(payload?.webcams) ? payload.webcams : [];
  return {
    webcams: webcams.slice(0, 50).map((webcam) => ({
      id: valueOrNull(webcam?.webcamId),
      title: valueOrNull(webcam?.title),
      lat: numberOrNull(webcam?.location?.latitude),
      lon: numberOrNull(webcam?.location?.longitude),
      status: valueOrNull(webcam?.status),
      city: valueOrNull(webcam?.location?.city),
      country: valueOrNull(webcam?.location?.country),
      categories: trimCategories(webcam?.categories),
    })),
    total: numberOrNull(payload?.total),
    attribution: "Webcams provided by windy.com",
  };
}

/** 期限付きURLを含むため、単体取得時にだけ必要な形へ削る。 */
export function trimDetail(webcam = {}) {
  return {
    id: valueOrNull(webcam?.webcamId),
    title: valueOrNull(webcam?.title),
    status: valueOrNull(webcam?.status),
    lastUpdatedOn: valueOrNull(webcam?.lastUpdatedOn),
    city: valueOrNull(webcam?.location?.city),
    country: valueOrNull(webcam?.location?.country),
    lat: numberOrNull(webcam?.location?.latitude),
    lon: numberOrNull(webcam?.location?.longitude),
    image: valueOrNull(webcam?.images?.current?.preview),
    imageDaylight: valueOrNull(webcam?.images?.daylight?.preview),
    player: {
      day: valueOrNull(webcam?.player?.day),
      month: valueOrNull(webcam?.player?.month),
      year: valueOrNull(webcam?.player?.year),
      lifetime: valueOrNull(webcam?.player?.lifetime),
    },
    detailUrl: valueOrNull(webcam?.urls?.detail),
    categories: trimCategories(webcam?.categories),
  };
}

const json = (body, status, cacheControl = "no-store", extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cacheControl,
    ...extra,
  },
});

const fetchUpstream = async (target, apiKey, fetchImpl) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(target, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "x-windy-api-key": apiKey,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const upstreamError = (response) => {
  if (response.status === 429) {
    return json({ error: "rate_limited" }, 429, "no-store", { "Retry-After": "30" });
  }
  return json({ error: "upstream_unavailable" }, 502);
};

export async function onRequestGet(context, { fetchImpl = fetch } = {}) {
  const url = new URL(context.request.url);
  const apiKey = context.env?.WINDY_API_KEY;

  if (url.searchParams.get("status") === "1") {
    return json({ configured: Boolean(apiKey) }, 200);
  }
  if (!apiKey) return json({ error: "not_configured" }, 503);

  const id = url.searchParams.get("id");
  if (id !== null) {
    if (!/^\d+$/.test(id)) return json({ error: "invalid_id" }, 400);
    const target = `${UPSTREAM}/webcams/${encodeURIComponent(id)}?include=images,player,location,urls,categories`;
    try {
      const upstream = await fetchUpstream(target, apiKey, fetchImpl);
      if (!upstream.ok) return upstreamError(upstream);
      return json(trimDetail(await upstream.json()), 200, DETAIL_CACHE_CONTROL);
    } catch {
      return json({ error: "upstream_unavailable" }, 502);
    }
  }

  const bbox = parseBbox(url.searchParams.get("bbox"), url.searchParams.get("zoom"));
  if (!bbox) return json({ error: "invalid_bbox" }, 400);
  const snapped = snapBbox(bbox);
  const bboxText = [snapped.north, snapped.east, snapped.south, snapped.west].join(",");

  // Node には Cache API がないため、存在する実行環境だけで共有キャッシュを使う。
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheUrl = new URL(url.origin + url.pathname);
  cacheUrl.search = `?bbox=${bboxText}&zoom=${bbox.zoom}`;
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const target = `${UPSTREAM}/webcams?bbox=${bboxText}&limit=50&sortKey=popularity&sortDirection=desc&include=location,categories`;
  try {
    const upstream = await fetchUpstream(target, apiKey, fetchImpl);
    if (!upstream.ok) return upstreamError(upstream);
    const response = json(trimList(await upstream.json()), 200, LIST_CACHE_CONTROL);
    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    return json({ error: "upstream_unavailable" }, 502);
  }
}
