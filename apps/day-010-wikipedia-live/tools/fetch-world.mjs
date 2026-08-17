/* 世界地図の形（国の輪郭）を data/world.json として作る。手で1回実行するだけで、
   ビルドやアプリの実行時には走らない（day-008 の fetch-data.mjs と同じ考え方）。

   出どころ: Natural Earth 1:110m Admin 0 – Countries（パブリックドメイン）
   日本語の国名（NAME_JA）が入っているので、「いま一番書き換わっている場所」を日本語で出せる。

   使い方:
     node apps/day-010-wikipedia-live/tools/fetch-world.mjs
     node apps/day-010-wikipedia-live/tools/fetch-world.mjs --from-file path/to/ne.geojson
*/

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');

// 世界全体を1画面に収める用途なので、輪郭は思い切って粗くする。単位は度
const TOLERANCE = 0.4;
// 小さすぎる島は点にしかならないので落とす（面積の目安・度の2乗）
const MIN_AREA = 0.35;
const DIGITS = 2;

const round = (value) => Number(value.toFixed(DIGITS));

/** 線を間引く（Douglas-Peucker）。折れ線の形を保ったまま点を減らす。 */
function simplify(points, tolerance) {
  if (points.length < 3) return points;

  const sqTolerance = tolerance * tolerance;
  const sqSegmentDistance = ([px, py], [ax, ay], [bx, by]) => {
    let x = ax;
    let y = ay;
    let dx = bx - ax;
    let dy = by - ay;
    if (dx !== 0 || dy !== 0) {
      const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) [x, y] = [bx, by];
      else if (t > 0) [x, y] = [x + dx * t, y + dy * t];
    }
    dx = px - x;
    dy = py - y;
    return dx * dx + dy * dy;
  };

  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let index = -1;
    let far = sqTolerance;
    for (let i = first + 1; i < last; i += 1) {
      const distance = sqSegmentDistance(points[i], points[first], points[last]);
      if (distance > far) {
        far = distance;
        index = i;
      }
    }
    if (index > 0) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

const ringArea = (ring) => {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(sum / 2);
};

async function load() {
  const fromFile = process.argv.indexOf('--from-file');
  if (fromFile > -1 && process.argv[fromFile + 1]) {
    return JSON.parse(readFileSync(process.argv[fromFile + 1], 'utf8'));
  }
  console.log(`取得: ${SOURCE}`);
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`取得に失敗: HTTP ${response.status}`);
  return response.json();
}

const geo = await load();
const countries = [];
let ringsBefore = 0;
let pointsBefore = 0;
let pointsAfter = 0;

for (const feature of geo.features) {
  const props = feature.properties;
  const geometry = feature.geometry;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  const rings = [];
  for (const polygon of polygons) {
    // 穴（内側のリング）は世界地図の縮尺では見えないので外周だけ使う
    const outer = polygon[0];
    ringsBefore += 1;
    pointsBefore += outer.length;
    if (ringArea(outer) < MIN_AREA) continue;
    const thin = simplify(outer, TOLERANCE).map(([lon, lat]) => [round(lon), round(lat)]);
    if (thin.length < 4) continue;
    pointsAfter += thin.length;
    rings.push(thin);
  }
  if (!rings.length) continue;

  countries.push({
    // 日本語名が無い国は英語名で出す（画面に「undefined」を出さないため）
    n: props.NAME_JA || props.NAME || '',
    e: props.NAME || '',
    r: rings
  });
}

const out = {
  source: 'Natural Earth 1:110m Admin 0 – Countries',
  license: 'public domain',
  note: `輪郭は許容誤差${TOLERANCE}度で間引き、座標は小数${DIGITS}桁に丸めている`,
  countries
};

mkdirSync(join(appDir, 'data'), { recursive: true });
const file = join(appDir, 'data', 'world.json');
writeFileSync(file, JSON.stringify(out));
const size = readFileSync(file).length;

console.log(`国 ${countries.length} / 輪郭 ${ringsBefore}本のうち ${countries.reduce((n, c) => n + c.r.length, 0)}本を採用`);
console.log(`点 ${pointsBefore} → ${pointsAfter}（${Math.round((1 - pointsAfter / pointsBefore) * 100)}%削減）`);
console.log(`書き出し: data/world.json ${(size / 1024).toFixed(1)}KB`);
