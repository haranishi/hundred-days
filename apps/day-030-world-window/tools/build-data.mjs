import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDirection } from '../lib/direction.js';
import { buildCountryIndex, countryOf, countryTable } from './country-lookup.mjs';
import { isExcluded, readExcludeHosts } from './url-kind.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(TOOL_DIR, '..');
const RAW_PATH = resolve(TOOL_DIR, 'cache/osm-raw.json');
const PROBE_PATH = resolve(TOOL_DIR, 'cache/probe.json');
const COUNTRIES_SOURCE_PATH = resolve(TOOL_DIR, 'cache/ne_50m_admin_0_countries.geojson');

const firstUrl = (element) => String(element.tags?.['contact:webcam'] || '').split(';', 1)[0].trim();
const truncate = (value, length) => value ? [...String(value)].slice(0, length).join('') : null;
const EMAIL_LIKE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
/* 提供元が公開しているURLでも、クエリに token= や key= を含むものは秘密情報の検査（gitleaks・公開前チェック）に
   引っ掛かり、見た目にも鍵を配っているように読める。同梱データには載せない（提供元の website があればそちらへ） */
const SECRET_LIKE_QUERY = /[?&](token|access_token|auth|apikey|api_key|key|secret|password|pass|sig|signature|credential)=/i;

async function readProbe() {
  try {
    return JSON.parse(await readFile(PROBE_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function coordinateOf(element) {
  return element.type === 'node'
    ? { lat: element.lat, lon: element.lon }
    : { lat: element.center?.lat, lon: element.center?.lon };
}

function setIf(output, key, value) {
  if (value !== null && value !== undefined && value !== '') output[key] = value;
}

async function main() {
  const [raw, probe, geojson, excludesText] = await Promise.all([
    readFile(RAW_PATH, 'utf8').then(JSON.parse),
    readProbe(),
    readFile(COUNTRIES_SOURCE_PATH, 'utf8').then(JSON.parse),
    readFile(resolve(TOOL_DIR, 'exclude-hosts.txt'), 'utf8'),
  ]);
  // 個別に外す地物のID（1行1件・#はコメント）。公開前チェックに掛かる文字列を含む地点などを、データ全体を変えずに外す
  const excludeIds = readExcludeHosts(await readFile(resolve(TOOL_DIR, 'exclude-ids.txt'), 'utf8').catch(() => ''));
  const countryIndex = buildCountryIndex(geojson);
  const countries = countryTable(geojson);
  const excludeHosts = readExcludeHosts(excludesText);
  const cameras = [];
  const kinds = { yt: 0, img: 0, hls: 0, page: 0 };
  const countryCounts = new Map();
  let dropped = 0;
  let invalidCoordinates = 0;
  let privateText = 0;
  let unconfirmed = 0;

  for (const element of raw.elements || []) {
    const url = firstUrl(element);
    // OSMの誤入力を公開データへ転記しないことを、probeの進捗に依存せず保証する。
    if (EMAIL_LIKE.test(url) || SECRET_LIKE_QUERY.test(url)) {
      privateText += 1;
      continue;
    }
    const result = probe[url];
    if (excludeIds.has(`${element.type === 'way' ? 'w' : 'n'}${element.id}`)) {
      dropped += 1;
      continue;
    }
    if (result?.kind === 'drop') {
      dropped += 1;
      continue;
    }
    const { lat, lon } = coordinateOf(element);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      invalidCoordinates += 1;
      continue;
    }
    let kind = result?.kind || 'page';
    if (!result) unconfirmed += 1;
    if (!['yt', 'img', 'hls', 'page'].includes(kind) || isExcluded(url, excludeHosts)) kind = 'page';
    const tags = element.tags || {};
    const country = countryOf(countryIndex, lat, lon);
    const camera = {
      i: `${element.type === 'way' ? 'w' : 'n'}${element.id}`,
      a: Number(lat.toFixed(5)),
      o: Number(lon.toFixed(5)),
      k: kind,
      u: kind === 'yt' ? result.finalUrl : result?.finalUrl || url,
    };
    setIf(camera, 'n', truncate(tags.name, 80));
    setIf(camera, 'c', country);
    setIf(camera, 'p', truncate(tags.operator, 60));
    setIf(camera, 'd', parseDirection(tags['camera:direction']));
    setIf(camera, 'z', tags['surveillance:zone']);
    setIf(camera, 's', truncate(tags.description, 120));
    setIf(camera, 'r', truncate(tags.ref, 20));
    setIf(camera, 'w', tags.website || tags['contact:website']);
    setIf(camera, 't', tags.check_date);
    cameras.push(camera);
    kinds[kind] += 1;
    countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
  }

  const osmTimestamp = raw.osm3s?.timestamp_osm_base || '';
  const data = {
    generatedAt: osmTimestamp.slice(0, 10),
    osmTimestamp,
    count: cameras.length,
    kinds,
    cameras,
  };
  await mkdir(resolve(APP_DIR, 'data'), { recursive: true });
  await Promise.all([
    writeFile(resolve(APP_DIR, 'data/cameras.json'), `${JSON.stringify(data)}\n`),
    writeFile(resolve(APP_DIR, 'data/countries.json'), `${JSON.stringify(countries, null, 2)}\n`),
  ]);

  const topCountries = [...countryCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 10);
  console.log(`総数: ${cameras.length}件`);
  console.log(`種別: ${Object.entries(kinds).map(([kind, count]) => `${kind}=${count}`).join(', ')}`);
  console.log(`国別上位10: ${topCountries.map(([country, count]) => `${country || '不明'}=${count}`).join(', ')}`);
  console.log(`除外数: drop=${dropped}, 座標不正=${invalidCoordinates}, メール形式または鍵付きURL=${privateText}`);
  console.log(`未確認 ${unconfirmed}件`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
