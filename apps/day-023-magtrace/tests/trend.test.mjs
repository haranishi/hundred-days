import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTrend, onRequestGet } from "../../../functions/api/day-023/trend.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const response = (body, status = 200) => new Response(body, { status });

test("buildTrendは500件以下をexactモードで集計する", async () => {
  const xml = fixture("sru-dcndl-oshikatsu.xml");
  const fetchImpl = async (url) => response(url.includes("maximumRecords=1") ? xml : xml);
  const result = await buildTrend("推し活", { fetchImpl, now: () => Date.parse("2026-08-29T10:40:00Z") });
  assert.equal(result.mode, "exact");
  assert.equal(result.total, 154);
  assert.equal(result.years.length, 30);
  assert.deepEqual(result.analysis.turningYears, [2020, 2024]);
  assert.ok(result.records.length <= 9);
});

const countsFetch = (failedYears = []) => async (input) => {
  const url = new URL(input);
  if (url.pathname.endsWith("/sru")) return response(fixture("sru-first-seiseiai.xml"));
  const year = Number(url.searchParams.get("from").slice(0, 4));
  if (failedYears.includes(year)) return response("not found", 404);
  if (url.searchParams.get("cnt") === "3") return response(fixture("opensearch-records-seiseiai-2023.xml"));
  const count = year === 2023 ? 534 : year >= 2024 && year <= 2026 ? 700 : year === 2022 ? 2 : 0;
  return response(`<rss xmlns:openSearch="http://a9.com/-/spec/opensearchrss/1.0/"><openSearch:totalResults>${count}</openSearch:totalResults></rss>`);
};

test("500件超は30年と代表記事をcountsモードで取得する", async () => {
  const result = await buildTrend("生成AI", { fetchImpl: countsFetch(), now: () => 0 });
  assert.equal(result.mode, "counts");
  assert.equal(result.years.length, 30);
  assert.equal(result.partial, false);
  assert.equal(result.years.find(({ year }) => year === 2023).count, 534);
  assert.ok(result.records.length > 0);
});

test("6年以下の失敗はpartial、7年失敗は502", async () => {
  const partial = await buildTrend("生成AI", { fetchImpl: countsFetch([1997, 1998]) });
  assert.equal(partial.partial, true);
  assert.equal(partial.years[0].count, null);
  await assert.rejects(() => buildTrend("生成AI", { fetchImpl: countsFetch([1997, 1998, 1999, 2000, 2001, 2002, 2003]) }), (error) => error.status === 502);
});

test("0件は200相当の全0応答になる", async () => {
  const result = await buildTrend("該当なし", { fetchImpl: async () => response(fixture("sru-first-zero.xml")) });
  assert.equal(result.total, 0);
  assert.equal(result.years.length, 30);
  assert.ok(result.years.every(({ count }) => count === 0));
});

test("onRequestGetは不正クエリ400と成功時キャッシュ見出しを返す", async () => {
  const invalid = await onRequestGet({ request: new Request("https://example.test/api/day-023/trend?q=%3C%3E") });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get("cache-control"), "no-store");
  const xml = fixture("sru-dcndl-oshikatsu.xml");
  const valid = await onRequestGet(
    { request: new Request("https://example.test/api/day-023/trend?q=%E6%8E%A8%E3%81%97%E6%B4%BB") },
    { fetchImpl: async () => response(xml), now: () => 0 },
  );
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get("cache-control"), "public, max-age=3600, s-maxage=86400");
  assert.equal(valid.headers.get("x-content-type-options"), "nosniff");
});
