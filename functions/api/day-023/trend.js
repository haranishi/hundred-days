const FROM_YEAR = 1997;
const UNTIL_YEAR = 2026;
const PARTIAL_YEAR = 2026;
const EXACT_LIMIT = 500;
const TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 600;
const USER_AGENT = "hundred-days-day023 (+https://hundred-days.pages.dev/day-023-magtrace/)";

const WINDOW = { from: FROM_YEAR, until: UNTIL_YEAR, partialYear: PARTIAL_YEAR };
const SOURCE = {
  name: "国立国会図書館サーチ（雑誌記事索引）",
  provider: "国立国会図書館",
  license: "CC BY 4.0",
  url: "https://ndlsearch.ndl.go.jp/",
};

export function normalizeQuery(value) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/[\u0000-\u001f\u007f"'<>\\]/g, "").trim();
  return normalized.length >= 1 && normalized.length <= 30 ? normalized : null;
}

export function decodeHtml(value = "") {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const stripMarkup = (value) => decodeHtml(String(value || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "")).trim();
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const firstTag = (xml, name) => {
  const match = String(xml).match(new RegExp(`<${escapePattern(name)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapePattern(name)}>`, "i"));
  return match ? stripMarkup(match[1]) : "";
};
const allTags = (xml, name) => Array.from(String(xml).matchAll(new RegExp(`<${escapePattern(name)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapePattern(name)}>`, "gi")), (match) => stripMarkup(match[1])).filter(Boolean);

export function parseSruCount(xml) {
  const match = String(xml).match(/<numberOfRecords(?:\s[^>]*)?>(\d+)<\/numberOfRecords>/i);
  if (match) return Number(match[1]);
  if (/<diagnostics(?:\s|>)/i.test(String(xml)) || /Record does not exist/i.test(String(xml))) return 0;
  throw new Error("SRUの件数を読めません");
}

export function cleanMagazine(value, { openSearch = false } = {}) {
  let result = stripMarkup(value).replace(/^掲載誌：/, "").trim();
  if (openSearch) result = result.replace(/\s+p\.[\s\S]*$/i, "").replace(/\s+\d+(?:\([^)]*\))?\s*$/, "").trim();
  result = result.split(/\s(?:=|\/)\s/)[0].trim();
  if (openSearch) result = result.split(/\s:\s/)[0].trim();
  return result;
}

export function parseSruRecords(xml) {
  const blocks = Array.from(String(xml).matchAll(/<recordData(?:\s[^>]*)?>([\s\S]*?)<\/recordData>/gi), (match) => decodeHtml(match[1]));
  return blocks.map((record) => {
    const issued = firstTag(record, "dcterms:issued");
    const titleBlock = record.match(/<dc:title(?:\s[^>]*)?>([\s\S]*?)<\/dc:title>/i)?.[1] || "";
    const title = firstTag(titleBlock, "rdf:value") || firstTag(record, "dcterms:title");
    const publication = cleanMagazine(firstTag(record, "dcndl:publicationName"));
    const number = firstTag(record, "dcndl:number");
    const url = Array.from(record.matchAll(/<rdfs:seeAlso\b[^>]*rdf:resource="([^"]+)"[^>]*\/?\s*>/gi), (match) => decodeHtml(match[1]))
      .find((candidate) => /^https:\/\/ndlsearch\.ndl\.go\.jp\/books\//.test(candidate) && !candidate.includes("#material")) || "";
    return {
      year: /^\d{4}/.test(issued) ? Number(issued.slice(0, 4)) : null,
      title,
      magazine: [publication, number].filter(Boolean).join(" "),
      creators: [...new Set(allTags(record, "dc:creator"))],
      url,
    };
  });
}

export function parseOpenSearchCount(xml) {
  const value = firstTag(xml, "openSearch:totalResults");
  if (!/^\d+$/.test(value)) throw new Error("OpenSearchの件数を読めません");
  return Number(value);
}

export function parseOpenSearchRecords(xml, year) {
  const items = Array.from(String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi), (match) => match[1]);
  return items.map((item) => ({
    year,
    title: firstTag(item, "dc:title") || firstTag(item, "title"),
    magazine: cleanMagazine(firstTag(item, "dc:description"), { openSearch: true }),
    creators: [...new Set(allTags(item, "dc:creator"))],
    url: firstTag(item, "link"),
  }));
}

export function aggregateYears(records, from = FROM_YEAR, until = UNTIL_YEAR) {
  const counts = new Map(Array.from({ length: until - from + 1 }, (_, index) => [from + index, 0]));
  for (const record of records) {
    if (counts.has(record.year)) counts.set(record.year, counts.get(record.year) + 1);
  }
  return Array.from(counts, ([year, count]) => ({ year, count }));
}

const countAt = (years, year) => years.find((item) => item.year === year)?.count ?? null;
const roundedRatio = (to, from) => Math.round((to / Math.max(from, 1)) * 10) / 10;

export function analyzeTrend(query, years, window = WINDOW) {
  const confirmed = years.filter(({ year, count }) => year < window.partialYear && Number.isFinite(count));
  const positive = confirmed.filter(({ count }) => count > 0);
  const firstValue = positive[0] || null;
  let peakValue = null;
  for (const value of positive) {
    if (!peakValue || value.count > peakValue.count || (value.count === peakValue.count && value.year > peakValue.year)) peakValue = value;
  }
  let jumpValue = null;
  if (firstValue) {
    for (const value of confirmed) {
      if (value.year <= firstValue.year || value.count < 5) continue;
      const from = countAt(years, value.year - 1);
      if (!Number.isFinite(from) || value.count - from < 3) continue;
      const ratio = roundedRatio(value.count, from);
      const increase = value.count - from;
      const largestIncrease = jumpValue ? jumpValue.to - jumpValue.from : -Infinity;
      if (!jumpValue || increase > largestIncrease || (increase === largestIncrease && value.year > jumpValue.year)) {
        jumpValue = { year: value.year, from, to: value.count, ratio };
      }
    }
  }

  const average = (from, until) => {
    const values = years.filter(({ year }) => year >= from && year <= until).map(({ count }) => count);
    return values.every(Number.isFinite) ? values.reduce((sum, count) => sum + count, 0) / values.length : null;
  };
  const previous = average(window.partialYear - 6, window.partialYear - 4);
  const recent = average(window.partialYear - 3, window.partialYear - 1);
  let trend = null;
  if (previous !== null && recent !== null && (previous > 0 || recent > 0)) {
    if (previous === 0) trend = "up";
    else if (recent / previous >= 1.2) trend = "up";
    else if (recent / previous <= 0.8) trend = "down";
    else trend = "flat";
  }

  const total = years.reduce((sum, { count }) => sum + (Number.isFinite(count) ? count : 0), 0);
  const headline = jumpValue
    ? jumpValue.ratio >= 1.5
      ? `${jumpValue.year}年を境に、掲載数が約${jumpValue.ratio}倍へ`
      : `${jumpValue.year}年に、前年からいちばん増えた（${jumpValue.from}件→${jumpValue.to}件）`
    : peakValue ? `${peakValue.year}年に最も多く語られた（${peakValue.count}件）` : `この30年で${total}件`;

  let lead = "";
  if (firstValue && peakValue) {
    lead = firstValue.year === peakValue.year
      ? `「${query}」を題名に含む雑誌記事は、${firstValue.year}年に現れ、その年が最多です（${peakValue.count}件）。`
      : `「${query}」を題名に含む雑誌記事は、${firstValue.year}年に現れ、${peakValue.year}年に最も多くなりました（${peakValue.count}件）。`;
  } else {
    const partialCount = countAt(years, window.partialYear) || 0;
    if (partialCount > 0) lead = `「${query}」を題名に含む雑誌記事は、${window.partialYear}年になって現れました（${partialCount}件・集計途中）。`;
  }
  const trendText = trend === "up" ? "直近3年は増えています。" : trend === "down" ? "直近3年は減っています。" : trend === "flat" ? "直近3年はほぼ横ばいです。" : "";
  const jumpText = jumpValue
    ? jumpValue.ratio >= 1.5
      ? `${jumpValue.year}年には前年の約${jumpValue.ratio}倍に増えました。`
      : `${jumpValue.year}年には前年から最も増えました（${jumpValue.from}件→${jumpValue.to}件）。`
    : "";
  const support = `${jumpText}${trendText}`;

  const clueMap = new Map();
  const addClue = (year, text) => {
    if (!year) return;
    const existing = clueMap.get(year);
    clueMap.set(year, existing ? `${existing}・${text}` : text);
  };
  if (firstValue) addClue(firstValue.year, "収録範囲で初めて題名に現れた年");
  if (jumpValue) addClue(jumpValue.year, `前年${jumpValue.from}件→${jumpValue.to}件（約${jumpValue.ratio}倍）`);
  if (peakValue) addClue(peakValue.year, `最多の${peakValue.count}件`);
  const clues = Array.from(clueMap, ([year, text]) => ({ year, text })).sort((a, b) => a.year - b.year).slice(0, 3);
  const turningYears = [...new Set([jumpValue?.year, peakValue?.year, firstValue?.year].filter(Boolean))].sort((a, b) => a - b).slice(0, 3);

  return {
    first: firstValue ? { year: firstValue.year, count: firstValue.count } : null,
    peak: peakValue ? { year: peakValue.year, count: peakValue.count } : null,
    jump: jumpValue,
    trend,
    headline,
    finding: { lead, support },
    clues,
    turningYears,
  };
}

const sruUrl = (query, maximumRecords) => {
  const url = new URL("https://ndlsearch.ndl.go.jp/api/sru");
  url.searchParams.set("operation", "searchRetrieve");
  url.searchParams.set("query", `dpid=zassaku AND title="${query}"`);
  url.searchParams.set("maximumRecords", String(maximumRecords));
  url.searchParams.set("recordSchema", "dcndl");
  return url.toString();
};

const openSearchUrl = (query, year, count) => {
  const url = new URL("https://ndlsearch.ndl.go.jp/api/opensearch");
  url.searchParams.set("dpid", "zassaku");
  url.searchParams.set("title", query);
  url.searchParams.set("cnt", String(count));
  url.searchParams.set("from", `${year}-01-01`);
  url.searchParams.set("until", `${year}-12-31`);
  return url.toString();
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchText(url, fetchImpl, { retry = false } = {}) {
  for (let attempt = 0; attempt < (retry ? 2 : 1); attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml" } });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === 1 || !retry) throw new Error(`HTTP ${response.status}`);
      } else {
        return await response.text();
      }
    } catch (error) {
      if (!retry || attempt === 1 || (error?.name !== "AbortError" && !/^HTTP (429|5\d\d)$/.test(error?.message || ""))) throw error;
    } finally {
      clearTimeout(timer);
    }
    await wait(RETRY_DELAY_MS);
  }
  throw new Error("上流を取得できません");
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

const emptyResponse = (query, fetchedAt) => {
  const years = Array.from({ length: 30 }, (_, index) => ({ year: FROM_YEAR + index, count: 0 }));
  return {
    query, field: "title", dataset: "zassaku", mode: "exact", window: { ...WINDOW }, total: 0, years, partial: false,
    analysis: {
      first: null, peak: null, jump: null, trend: null, headline: null,
      finding: null, clues: null, turningYears: null,
    },
    records: [], source: { ...SOURCE }, fetchedAt,
  };
};

export async function buildTrend(value, { fetchImpl = fetch, now = () => Date.now() } = {}) {
  const query = normalizeQuery(value);
  if (!query) throw Object.assign(new Error("invalid_query"), { code: "invalid_query", status: 400 });
  const fetchedAt = new Date(now()).toISOString();
  const firstXml = await fetchText(sruUrl(query, 1), fetchImpl);
  const upstreamTotal = parseSruCount(firstXml);
  if (upstreamTotal === 0) return emptyResponse(query, fetchedAt);

  let mode = "exact";
  let years;
  let partial = false;
  let records = [];
  if (upstreamTotal <= EXACT_LIMIT) {
    const xml = await fetchText(sruUrl(query, EXACT_LIMIT), fetchImpl);
    records = parseSruRecords(xml);
    years = aggregateYears(records);
  } else {
    mode = "counts";
    const yearList = Array.from({ length: 30 }, (_, index) => FROM_YEAR + index);
    years = await mapWithConcurrency(yearList, 5, async (year) => {
      try {
        const xml = await fetchText(openSearchUrl(query, year, 1), fetchImpl, { retry: true });
        return { year, count: parseOpenSearchCount(xml) };
      } catch {
        return { year, count: null };
      }
    });
    const failures = years.filter(({ count }) => count === null).length;
    if (failures >= 7) throw Object.assign(new Error("upstream_unavailable"), { code: "upstream_unavailable", status: 502 });
    partial = failures > 0;
  }

  const analysis = analyzeTrend(query, years);
  if (mode === "exact") {
    records = records.filter((record) => analysis.turningYears.includes(record.year)).reduce((selected, record) => {
      if (selected.filter((item) => item.year === record.year).length < 3) selected.push(record);
      return selected;
    }, []);
  } else {
    const groups = await mapWithConcurrency(analysis.turningYears, 3, async (year) => {
      try {
        const xml = await fetchText(openSearchUrl(query, year, 3), fetchImpl, { retry: true });
        return parseOpenSearchRecords(xml, year).slice(0, 3);
      } catch {
        return [];
      }
    });
    records = groups.flat();
  }

  return {
    query, field: "title", dataset: "zassaku", mode, window: { ...WINDOW },
    total: years.reduce((sum, { count }) => sum + (Number.isFinite(count) ? count : 0), 0),
    years, partial, analysis, records, source: { ...SOURCE }, fetchedAt,
  };
}

const jsonResponse = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: status === 200 ? {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=3600, s-maxage=86400",
    "X-Content-Type-Options": "nosniff",
  } : {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

export async function onRequestGet(context, { fetchImpl = fetch, now = () => Date.now() } = {}) {
  const request = context.request;
  const url = new URL(request.url);
  const query = normalizeQuery(url.searchParams.get("q"));
  if (!query) return jsonResponse({ error: "invalid_query" }, 400);

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = `?q=${encodeURIComponent(query)}`;
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  try {
    const body = await buildTrend(query, { fetchImpl, now });
    const response = jsonResponse(body, 200);
    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    const status = error?.status === 400 ? 400 : 502;
    return jsonResponse({ error: status === 400 ? "invalid_query" : "upstream_unavailable" }, status);
  }
}
