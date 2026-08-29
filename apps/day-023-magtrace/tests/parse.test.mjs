import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aggregateYears, parseOpenSearchCount, parseOpenSearchRecords, parseSruCount, parseSruRecords,
} from "../../../functions/api/day-023/trend.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("SRUの154記録を読み、年別件数と先頭記録を取り出す", () => {
  const xml = fixture("sru-dcndl-oshikatsu.xml");
  const records = parseSruRecords(xml);
  assert.equal(parseSruCount(xml), 154);
  assert.equal(records.length, 154);
  assert.deepEqual(aggregateYears(records).filter(({ count }) => count), [
    { year: 2020, count: 1 }, { year: 2021, count: 3 }, { year: 2022, count: 10 },
    { year: 2023, count: 18 }, { year: 2024, count: 45 }, { year: 2025, count: 39 }, { year: 2026, count: 38 },
  ]);
  assert.equal(records[0].title, "アーティスト、アニメ、マンガなどさまざまなIPコラボで推し活消費を取り込む「タワーレコード」");
  assert.equal(records[0].magazine, "SC Japan today 590");
  assert.equal(records[0].url, "https://ndlsearch.ndl.go.jp/books/R000000004-I034821114");
});

test("SRUの総数とdiagnosticsだけの0件を読む", () => {
  assert.equal(parseSruCount(fixture("sru-first-seiseiai.xml")), 3862);
  assert.equal(parseSruCount(fixture("sru-first-zero.xml")), 0);
});

test("OpenSearchの年別件数を読む", () => {
  assert.equal(parseOpenSearchCount(fixture("opensearch-count-seiseiai-2023.xml")), 534);
  assert.equal(parseOpenSearchCount(fixture("opensearch-count-zero.xml")), 0);
});

test("OpenSearchの代表記事3件と掲載誌を整形する", () => {
  const records = parseOpenSearchRecords(fixture("opensearch-records-seiseiai-2023.xml"), 2023);
  assert.equal(records.length, 3);
  assert.equal(records[0].title, "アイディア即プロダクトの経済 : 生成AIは経済をどう変えるか?");
  assert.deepEqual(records[0].creators, ["井上 智洋"]);
  assert.equal(records[0].magazine, "Research Bureau論究");
  assert.equal(records[0].url, "https://ndlsearch.ndl.go.jp/books/R000000004-I033254806");
  assert.equal(records[1].magazine, "日経コンストラクション");
});
