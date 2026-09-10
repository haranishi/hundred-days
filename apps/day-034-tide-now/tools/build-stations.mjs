// 気象庁「潮位表掲載地点一覧表」から data/stations.json を作る。
//   node apps/day-034-tide-now/tools/build-stations.mjs
// 元のHTMLは tools/cache/station.html に置く（gitignore 済み）。都道府県は Day 033 の
// 市区町村代表点（1,741件）のうち最寄りのものの都道府県を付ける（地点一覧に都道府県が無いため）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(appDir, 'tools', 'cache');
const cachePath = join(cacheDir, 'station.html');
const SOURCE = 'https://www.data.jma.go.jp/kaiyou/db/tide/suisan/station.php';
const placesPath = join(appDir, '..', 'day-033-did-it-shake', 'data', 'places.json');

async function loadHtml() {
  if (existsSync(cachePath)) return readFileSync(cachePath, 'utf8');
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`地点一覧が取れません: ${response.status}`);
  const html = await response.text();
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, html);
  return html;
}

const strip = (cell) => cell.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
/** 「45゜24'」→ 45.4 */
function degrees(text) {
  const match = text.match(/(\d+)゜(\d+)'/);
  if (!match) throw new Error(`緯度経度が読めません: ${text}`);
  return Number((Number(match[1]) + Number(match[2]) / 60).toFixed(4));
}
function distanceKm(a, b) {
  const toRad = Math.PI / 180;
  const meanLat = ((a.lat + b.lat) / 2) * toRad;
  const dx = (a.lon - b.lon) * toRad * Math.cos(meanLat);
  const dy = (a.lat - b.lat) * toRad;
  return Math.sqrt(dx * dx + dy * dy) * 6371;
}

const html = (await loadHtml()).replace(/\r/g, '');
const places = JSON.parse(readFileSync(placesPath, 'utf8')).places;
const stations = [];
for (const row of html.split(/<tr[^>]*>/).slice(1)) {
  const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
  if (cells.length < 8) continue;
  const [, code, name, lat, lon, mslOffset] = cells;
  if (!/^[A-Z][A-Z0-9]$/.test(code)) continue;
  const point = { lat: degrees(lat), lon: degrees(lon) };
  let nearest = null;
  let best = Infinity;
  for (const place of places) {
    const d = distanceKm(point, place);
    if (d < best) { best = d; nearest = place; }
  }
  const remark = cells[cells.length - 1];
  stations.push({
    code, name, lat: point.lat, lon: point.lon,
    pref: nearest.p,
    // MSL−潮位表基準面（cm）。潮位表の値に足すと平均海面からの高さになる
    msl: Number(mslOffset),
    ...(remark ? { remark } : {})
  });
}
if (stations.length < 200) throw new Error(`地点が少なすぎます: ${stations.length}`);
const codes = new Set(stations.map((s) => s.code));
if (codes.size !== stations.length) throw new Error('地点記号が重複しています');

const out = {
  meta: {
    source: '気象庁ホームページ「潮位表掲載地点一覧表」を加工して作成。都道府県は最寄りの市区町村代表点（Day 033 の places.json）から付与',
    sourceUrl: SOURCE,
    remarks: {
      '＊１': '大船渡、鮎川、釜石のMSLには、平成23年東北地方太平洋沖地震に伴う顕著な地盤変動の影響を考慮した暫定値を使用',
      '＊２': '横浜、神津島、能登の潮位表基準面の標高は、MSLを基準として算出'
    },
    count: stations.length,
    generatedAt: new Date().toISOString()
  },
  stations
};
writeFileSync(join(appDir, 'data', 'stations.json'), JSON.stringify(out));
console.log(`stations.json: ${stations.length}地点 / 都道府県 ${new Set(stations.map((s) => s.pref)).size}`);
