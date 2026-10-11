import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const commit = 'ca96624a56bd078437bca8184e78163e5039ad19';
const input = process.argv[process.argv.indexOf('--input-dir') + 1];
if (!process.argv.includes('--input-dir') || !input) throw new Error('Use --input-dir <download directory>.');
const names = ['ne_110m_land', 'ne_110m_admin_0_countries', 'ne_10m_admin_1_states_provinces'];
const loaded = [], inputs = [];
for (const name of names) {
  const bytes = await readFile(resolve(input, `${name}.geojson`));
  loaded.push(JSON.parse(bytes));
  inputs.push({ name, url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${commit}/geojson/${name}.geojson`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const [land, countries, subdivisions] = loaded;
const prefectures = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const regions = [];
for (const [code, adm, label] of [['JP','JPN','日本・地域未特定'],['US','USA','米国・地域未特定'],['US-PR','PRI','プエルトリコ']]) {
  const feature = countries.features.find(feature => feature.properties.ADM0_A3 === adm);
  assert.ok(feature, adm);
  const p = feature.properties;
  regions.push({ code, label, country: code === 'JP' ? 'JP' : 'US', level: code === 'US-PR' ? 'subdivision' : 'country', lat: p.LABEL_Y, lon: p.LABEL_X });
}
for (const feature of subdivisions.features) {
  const p = feature.properties;
  if (!['JP','US'].includes(p.iso_a2)) continue;
  const code = p.iso_3166_2;
  assert.match(code, /^(JP-\d{2}|US-[A-Z]{2})$/);
  const label = p.iso_a2 === 'JP' ? prefectures[Number(code.slice(3)) - 1] : p.name_ja || p.name_en;
  assert.ok(label);
  regions.push({ code, label, country: p.iso_a2, level: 'subdivision', lat: p.latitude, lon: p.longitude });
}
regions.sort((a, b) => a.code.localeCompare(b.code));
assert.equal(regions.filter(r => /^JP-/.test(r.code)).length, 47);
assert.equal(new Set(regions.map(r => r.code)).size, regions.length);
assert.ok(regions.length < 128);
for (const region of regions) {
  assert.ok(Number.isFinite(region.lat) && region.lat >= -90 && region.lat <= 90);
  assert.ok(Number.isFinite(region.lon) && region.lon >= -180 && region.lon <= 180);
}
const polygons = land.features.flatMap(feature => feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates]).map(polygon => polygon.map(ring => ring.map(point => point.map(value => Number(value.toFixed(3))))));
const source = new URL('../', import.meta.url);
await mkdir(new URL('public/data/', source), { recursive: true });
await writeFile(new URL('src/geo-regions.json', source), JSON.stringify(regions) + '\n');
await writeFile(new URL('src/geo-codes.json', source), JSON.stringify(regions.map(region => region.code)) + '\n');
await writeFile(new URL('public/data/map-land.json', source), JSON.stringify({ credit: 'Made with Natural Earth.', commit, polygons }) + '\n');
const manifest = { commit, inputs, regionCount: regions.length, polygonCount: polygons.length, terms: 'https://www.naturalearthdata.com/about/terms-of-use/', scope: 'Regional representative points and generalized land geometry. Not incident, headquarters or server coordinates.' };
await writeFile(new URL('../../docs/day064/research/geo-manifest.json', source), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${regions.length} regional representative points and ${polygons.length} land polygons from Natural Earth.`);
