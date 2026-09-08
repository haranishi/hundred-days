/* 干す場所の候補（1,741市区町村）を作る。
   入力は Day 015 が用意済みの2ファイル。
     - towns.json … 市区町村コード・都道府県名・市区町村名（令和2年国勢調査）
     - points.json … 市区町村ごとの代表点（e-Stat小地域の重心を人口で重み付けした独自計算）
   代表点を使うのは「役所の位置」ではなく「人が住んでいるあたり」の天気が欲しいから。
   出力は緯度経度を小数3桁（約100m）に丸めた1ファイル。天気の格子はこれより粗いので足りる。

   実行: node apps/day-032-laundry-dry/tools/build-places.mjs */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'day-015-town-stats', 'data');
const out = join(here, '..', 'data', 'places.json');

const towns = JSON.parse(readFileSync(join(src, 'towns.json'), 'utf8')).towns;
const points = JSON.parse(readFileSync(join(src, 'points.json'), 'utf8'));

const round3 = (n) => Math.round(n * 1000) / 1000;

const places = [];
const missing = [];
for (const town of towns) {
  const point = points[town.code];
  if (!point) {
    missing.push(town.code);
    continue;
  }
  const [lon, lat] = point;
  places.push({ c: town.code, p: town.pref, n: town.name, lat: round3(lat), lon: round3(lon) });
}

if (missing.length) throw new Error(`代表点が無い市区町村がある: ${missing.join(',')}`);
if (places.length !== 1741) throw new Error(`市区町村の数が1,741ではない: ${places.length}`);

// 県ごと・50音ではなくコード順（同じ県が並び、県内は既存データの順のまま）
places.sort((a, b) => (a.c < b.c ? -1 : a.c > b.c ? 1 : 0));

writeFileSync(
  out,
  JSON.stringify({
    meta: {
      source: '市区町村名は「令和2年国勢調査」（総務省統計局）、代表点は「境界データ」（総務省統計局・e-Stat統計GIS）の小地域重心から人口加重で独自に計算',
      count: places.length,
      generatedAt: new Date().toISOString()
    },
    places
  })
);
console.log(`places.json: ${places.length}件`);
