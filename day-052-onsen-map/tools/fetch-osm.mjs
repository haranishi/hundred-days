#!/usr/bin/env node
// OpenStreetMap の公衆浴場（amenity=public_bath）を都道府県ごとに Overpass API から取り、
// 生の応答を tools/cache/JP-NN.json に置く。変換は build-data.mjs が担う。
// 使い方: node tools/fetch-osm.mjs            … 47都道府県すべて（キャッシュがある県は飛ばす）
//         node tools/fetch-osm.mjs 05 13      … 指定した県だけ

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const UPSTREAMS = [
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];
const USER_AGENT = 'hundred-days-day052-fetch (+https://hundred-days.pages.dev/)';
const CACHE_DIRECTORY = new URL('./cache/', import.meta.url);
const REQUEST_TIMEOUT_MS = 200_000;
const INTERVAL_MS = 2_000;

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

export const PREFECTURE_CODES = Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'));

export function queryFor(code) {
  return `[out:json][timeout:180];area["ISO3166-2"="JP-${code}"]->.a;nwr(area.a)["amenity"="public_bath"];out tags center;`;
}

// Overpass は時間切れでも 200 を返し、途中までの結果に remark を添えることがある。部分結果は失敗として扱う
export function assertComplete(json) {
  if (!json || !Array.isArray(json.elements)) throw new Error('elements がありません');
  if (typeof json.remark === 'string' && /error|timed out|out of memory/i.test(json.remark)) {
    throw new Error(`部分結果: ${json.remark}`);
  }
  return json;
}

async function fetchOverpass(query) {
  let lastError;
  for (const endpoint of UPSTREAMS) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
          },
          body: new URLSearchParams({ data: query }),
          signal: controller.signal,
        });
        if ([429, 502, 503, 504].includes(response.status)) {
          lastError = new Error(`HTTP ${response.status} (${endpoint})`);
          await sleep(20_000 * (attempt + 1));
          continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status} (${endpoint})`);
        return assertComplete(await response.json());
      } catch (error) {
        lastError = error;
        await sleep(5_000);
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastError ?? new Error('取得に失敗しました');
}

async function main(argv) {
  const codes = argv.length > 0 ? argv : PREFECTURE_CODES;
  for (const code of codes) {
    if (!PREFECTURE_CODES.includes(code)) throw new Error(`都道府県コードは01〜47で指定してください: ${code}`);
  }
  mkdirSync(CACHE_DIRECTORY, { recursive: true });
  for (const code of codes) {
    const path = new URL(`JP-${code}.json`, CACHE_DIRECTORY);
    if (existsSync(path)) {
      console.log(`JP-${code}: キャッシュを使う`);
      continue;
    }
    const json = await fetchOverpass(queryFor(code));
    writeFileSync(path, `${JSON.stringify(json)}\n`);
    console.log(`JP-${code}: ${json.elements.length}件（osm_base ${json.osm3s?.timestamp_osm_base ?? '不明'}）`);
    await sleep(INTERVAL_MS);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
