/* 地図の陸の輪郭（data/land.json）を作る。
   Natural Earth 1:50m land（パブリックドメイン）を日本のまわりだけ切り出して間引く。

   node apps/day-042-typhoon-coming/tools/build-land.mjs

   元ファイルは tools/cache/ に置く（.gitignore 済み・配信もしない）。
   取りに行けない環境では、陸のない land.json を書いて「海だけの地図」で動かす。
   台風の経路と予報円は forecast.json の幾何だけで描けるので、陸が無くても答えは読める。 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson';
const CACHE = here('cache/ne_50m_land.geojson');
const OUT = here('../data/land.json');

/* 切り出す窓。台風の進路（フィリピン東の海上から千島の東まで）と日本列島が入る広さ */
export const WINDOW = { west: 118, east: 160, south: 12, north: 50 };
export const TOLERANCE = 0.02; /* 度。約2km。1:50m の原図より粗いが、画面では見分けが付かない */
export const MAX_BYTES = 120 * 1024;

const inWindow = (ring) => ring.some(([lng, lat]) =>
  lng >= WINDOW.west && lng <= WINDOW.east && lat >= WINDOW.south && lat <= WINDOW.north);

/** Douglas-Peucker。閉じた輪なので、いちばん遠い2点で割ってから片側ずつ間引く */
export function simplify(points, tolerance) {
  if (points.length <= 3) return points;
  const distance = (point, from, to) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = dx * dx + dy * dy;
    if (!length) return Math.hypot(point[0] - from[0], point[1] - from[1]);
    const t = Math.max(0, Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / length));
    return Math.hypot(point[0] - (from[0] + t * dx), point[1] - (from[1] + t * dy));
  };
  const run = (list) => {
    if (list.length < 3) return list;
    let worst = 0;
    let at = 0;
    for (let i = 1; i < list.length - 1; i += 1) {
      const gap = distance(list[i], list[0], list[list.length - 1]);
      if (gap > worst) { worst = gap; at = i; }
    }
    if (worst <= tolerance) return [list[0], list[list.length - 1]];
    return [...run(list.slice(0, at + 1)).slice(0, -1), ...run(list.slice(at))];
  };
  const kept = run(points);
  /* 閉じた輪が3点未満に潰れると塗れなくなるので、そのときだけ元に戻す */
  const closed = points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1];
  return closed && kept.length < 4 ? points : kept;
}

/* 間引いたあとの座標は小数2桁（約1.1km）で足りる。この地図はいちばん寄っても
   十数度ぶんを映すので、0.01度は1ピクセルに届かない。3桁だと120KBを超える */
const round = (value) => Number(value.toFixed(2));
const dedupe = (ring) => ring.filter(([lng, lat], i) => i === 0 || lng !== ring[i - 1][0] || lat !== ring[i - 1][1]);

export function buildLand(geojson, { tolerance = TOLERANCE } = {}) {
  const rings = [];
  for (const feature of geojson.features ?? []) {
    const shape = feature.geometry;
    if (!shape) continue;
    /* 穴（内陸の湖）は落とす。陸を塗るだけなので、湖まで抜くと線が増えるわりに見えない */
    const outer = shape.type === 'Polygon' ? [shape.coordinates[0]]
      : shape.type === 'MultiPolygon' ? shape.coordinates.map((polygon) => polygon[0])
        : [];
    for (const ring of outer) {
      if (!inWindow(ring)) continue;
      const thin = dedupe(simplify(ring, tolerance).map(([lng, lat]) => [round(lng), round(lat)]));
      if (thin.length >= 4) rings.push(thin);
    }
  }
  return {
    version: 1,
    source: 'Natural Earth 1:50m land',
    license: 'Public Domain',
    bbox: [WINDOW.west, WINDOW.south, WINDOW.east, WINDOW.north],
    polygons: rings,
  };
}

async function download() {
  mkdirSync(here('cache'), { recursive: true });
  if (existsSync(CACHE)) return readFileSync(CACHE, 'utf8');
  const response = await fetch(SOURCE, { headers: { Accept: 'application/geo+json' } });
  if (!response.ok) throw new Error(`Natural Earth を取得できません (${response.status})`);
  const text = await response.text();
  writeFileSync(CACHE, text);
  return text;
}

export async function main() {
  let land;
  try {
    land = buildLand(JSON.parse(await download()));
  } catch (error) {
    /* 取りに行けないときも止めない。陸のない land.json で「海だけ」の地図にする */
    process.stderr.write(`陸の輪郭を取得できませんでした（海だけの地図にします）: ${error.message}\n`);
    land = { ...buildLand({ features: [] }), note: '取得できなかったため陸を含めていません' };
  }
  const text = `${JSON.stringify(land)}\n`;
  if (text.length > MAX_BYTES) throw new Error(`land.json が大きすぎる: ${text.length} bytes`);
  writeFileSync(OUT, text);
  const points = land.polygons.reduce((sum, ring) => sum + ring.length, 0);
  process.stderr.write(`land.json: ${land.polygons.length}個の輪・${points}点・${(text.length / 1024).toFixed(1)}KB\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });
}
