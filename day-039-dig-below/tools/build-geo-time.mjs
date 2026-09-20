// PBDB の年代区分（国際層序委員会の区分と公式カラー）を取り、日本語名を付けて data/geo-time.json を書く。
// 使い方: node tools/build-geo-time.mjs
import { writeFileSync } from 'node:fs';
import { PERIOD_JA, EPOCH_JA } from './geo-time-ja.mjs';

const ENDPOINT = 'https://paleobiodb.org/data1.2/intervals/list.json?scale=1&datainfo';
const res = await fetch(ENDPOINT, { headers: { 'User-Agent': 'hundred-days/day-039' } });
if (!res.ok) throw new Error(`PBDB ${res.status}`);
const body = await res.json();

const pick = (itp, table) =>
  body.records
    .filter((x) => x.itp === itp)
    .map((x) => ({
      en: x.nam,
      ja: table[x.nam] ?? null,
      // eag/lag は百万年前。eag が古い側。
      from: x.eag,
      to: x.lag,
      color: x.col,
    }))
    .sort((a, b) => b.from - a.from);

const periods = pick('period', PERIOD_JA);
const epochs = pick('epoch', EPOCH_JA);

const missing = [...periods, ...epochs].filter((x) => !x.ja).map((x) => x.en);
if (missing.length) throw new Error(`日本語名が無い区間: ${missing.join(', ')}`);

writeFileSync(
  new URL('../data/geo-time.json', import.meta.url),
  `${JSON.stringify(
    {
      source: body.data_source,
      license: body.data_license,
      licenseUrl: body.license_url,
      fetchedAt: body.access_time,
      note: '区分と色は国際層序委員会（ICS）の国際年代層序表。PBDB 経由で取得した',
      periods,
      epochs,
    },
    null,
    2,
  )}\n`,
);
console.log(`紀 ${periods.length} 件 / 世 ${epochs.length} 件を書き出した（${body.data_license}）`);
