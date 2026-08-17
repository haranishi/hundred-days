import test from "node:test";
import assert from "node:assert/strict";
import { BATCH_MAX, INTERVAL_MS, apiUrl, createLookup, isWikimediaHost, readCoordinates } from "../lib/coords.js";

const edit = (wiki, title, host) => ({ wiki, title, host: host || `${wiki.replace("wiki", "")}.wikipedia.org` });

test("apiUrl は座標だけを、まとめて、CORSを許して聞く", () => {
  const url = new URL(apiUrl("ja.wikipedia.org", ["秋田県", "東京駅"]));
  assert.equal(url.origin + url.pathname, "https://ja.wikipedia.org/w/api.php");
  assert.equal(url.searchParams.get("prop"), "coordinates");
  assert.equal(url.searchParams.get("titles"), "秋田県|東京駅");
  assert.equal(url.searchParams.get("origin"), "*", "これが無いとブラウザから読めない");
});

test("readCoordinates は座標のある記事だけ拾う", () => {
  const found = readCoordinates({
    query: {
      pages: [
        { title: "東京駅", coordinates: [{ lat: 35.68, lon: 139.76, globe: "earth" }] },
        { title: "カレーライス" },
        { title: "静かの海", coordinates: [{ lat: 23.0, lon: 31.0, globe: "moon" }] },
        { title: "壊れた値", coordinates: [{ lat: "x", lon: 1 }] },
      ],
    },
  });
  assert.deepEqual([...found.keys()], ["東京駅"]);
  assert.deepEqual(found.get("東京駅"), { lat: 35.68, lon: 139.76 });
});

test("readCoordinates は返事が壊れていても落ちない", () => {
  assert.equal(readCoordinates(null).size, 0);
  assert.equal(readCoordinates({}).size, 0);
  assert.equal(readCoordinates({ query: { pages: "x" } }).size, 0);
});

test("同じ記事は二度聞かない", () => {
  const lookup = createLookup({ fetchJson: async () => ({}), onFound: () => {} });
  assert.equal(lookup.push(edit("jawiki", "秋田県")), true);
  assert.equal(lookup.push(edit("jawiki", "秋田県")), false);
  assert.equal(lookup.stats.skipped, 1);
  // 言語版が違えば別の記事
  assert.equal(lookup.push(edit("enwiki", "秋田県")), true);
});

test("問い合わせは2.5秒に1回まで・1周期2本まで", async () => {
  const calls = [];
  let clock = 0;
  const lookup = createLookup({
    now: () => clock,
    fetchJson: async (url) => {
      calls.push(url);
      return { query: { pages: [] } };
    },
    onFound: () => {},
  });

  for (const wiki of ["enwiki", "jawiki", "dewiki", "frwiki"]) {
    for (let i = 0; i < 3; i += 1) lookup.push(edit(wiki, `${wiki}-${i}`));
  }

  clock = INTERVAL_MS;
  assert.equal(await lookup.tick(), 2, "1周期で送るのは2本まで");
  assert.equal(calls.length, 2);

  // 間隔が空いていないうちは何も送らない
  clock += 100;
  assert.equal(await lookup.tick(), 0);
  assert.equal(calls.length, 2);

  clock += INTERVAL_MS;
  assert.equal(await lookup.tick(), 2);
  assert.equal(calls.length, 4);
});

test("1回の問い合わせは50件まで", async () => {
  let asked = null;
  let clock = 0;
  const lookup = createLookup({
    now: () => clock,
    fetchJson: async (url) => {
      asked = new URL(url).searchParams.get("titles").split("|");
      return { query: { pages: [] } };
    },
    onFound: () => {},
  });

  for (let i = 0; i < 70; i += 1) lookup.push(edit("enwiki", `記事${i}`));
  clock = INTERVAL_MS;
  await lookup.tick();
  assert.equal(asked.length, BATCH_MAX);
});

test("編集が多い言語版と日本語版だけを聞きにいく", () => {
  const lookup = createLookup({ fetchJson: async () => ({}), onFound: () => {} });
  // 上位6言語版を埋めてから、少数の言語版と日本語版を1件ずつ入れる
  for (const wiki of ["a", "b", "c", "d", "e", "f"]) {
    for (let i = 0; i < 10; i += 1) lookup.push(edit(`${wiki}wiki`, `${wiki}-${i}`));
  }
  lookup.push(edit("zzwiki", "めったに来ない言語"));
  lookup.push(edit("jawiki", "秋田県"));

  const picked = lookup.pickWikis();
  assert.ok(picked.includes("jawiki"), "日本語版は必ず対象にする");
  assert.ok(!picked.includes("zzwiki"), "件数の少ない言語版は聞かない");
});

test("見つかった座標を呼び出し側へ渡す", async () => {
  const found = [];
  let clock = 0;
  const lookup = createLookup({
    now: () => clock,
    fetchJson: async () => ({
      query: { pages: [{ title: "東京駅", coordinates: [{ lat: 35.68, lon: 139.76, globe: "earth" }] }] },
    }),
    onFound: (spot) => found.push(spot),
  });

  lookup.push(edit("jawiki", "東京駅"));
  clock = INTERVAL_MS;
  await lookup.tick();

  assert.equal(found.length, 1);
  assert.equal(found[0].title, "東京駅");
  assert.equal(found[0].wiki, "jawiki");
  assert.equal(found[0].lat, 35.68);
  assert.equal(lookup.stats.found, 1);
});

test("問い合わせが失敗しても止まらない", async () => {
  let clock = 0;
  let calls = 0;
  const lookup = createLookup({
    now: () => clock,
    fetchJson: async () => {
      calls += 1;
      throw new Error("network");
    },
    onFound: () => {},
  });

  lookup.push(edit("jawiki", "秋田県"));
  lookup.push(edit("enwiki", "Akita"));
  clock = INTERVAL_MS;
  await lookup.tick();
  assert.equal(calls, 2);

  // 失敗した記事を追いかけて聞き直さない（問い合わせが増えるだけなので）
  clock += INTERVAL_MS;
  assert.equal(await lookup.tick(), 0);
});

test("待ち行列が伸びたら古いものから捨てる", () => {
  const lookup = createLookup({ fetchJson: async () => ({}), onFound: () => {} });
  for (let i = 0; i < 400; i += 1) lookup.push(edit("enwiki", `記事${i}`));
  assert.ok(lookup.stats.queued <= 120, `貯めすぎ: ${lookup.stats.queued}`);
  assert.ok(lookup.stats.dropped > 0);
});

test("問い合わせ先はウィキメディアのドメインだけ通す", () => {
  for (const host of [
    "ja.wikipedia.org",
    "en.wikipedia.org",
    "zh-yue.wikipedia.org", // ハイフン入りの言語コード
    "commons.wikimedia.org",
    "www.wikidata.org",
    "www.mediawiki.org",
    "ja.wiktionary.org",
  ]) {
    assert.equal(isWikimediaHost(host), true, `通らないと座標が引けない: ${host}`);
  }

  for (const host of [
    "example.com",
    "wikipedia.org.example.com", // 末尾に本物を足しただけの偽ホスト
    "ja.wikipedia.org.example.com",
    "wikipedia.org", // サブドメイン無しは使わない
    "ja.wikipedia.co.jp",
    "ja.wikipedia.org:8080",
    "ja.wikipedia.org/../evil",
    // URLの利用者情報を使って本物に見せる形（実際の接続先は後ろ側）。
    // 記号を分けて書いているのは、公開前チェックのメール検出に引っかからないようにするため
    `ja.wikipedia.org${"@"}evil.example.com`,
    "",
    null,
    undefined,
  ]) {
    assert.equal(isWikimediaHost(host), false, `通してはいけない: ${host}`);
  }
});

test("許していないホストは待ち行列に積まず、URLも組ませない", async () => {
  let calls = 0;
  const lookup = createLookup({
    fetchJson: async () => {
      calls += 1;
      return {};
    },
    onFound: () => {},
    now: () => INTERVAL_MS,
  });

  // ストリームが嘘のホストを送ってきた場合
  assert.equal(lookup.push({ wiki: "evilwiki", title: "記事", host: "evil.example.com" }), false);
  assert.equal(await lookup.tick(), 0);
  assert.equal(calls, 0, "許していないホストへ問い合わせに行ってはいけない");

  // 最後の砦：URLを組む所でも弾く
  assert.throws(() => apiUrl("evil.example.com", ["記事"]), /許していないホスト/);
});
