#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { categoryOf, displayName, feeClass } from '../lib/normalize.js';

export const WIFI_QUERY = '[out:json][timeout:180];area["ISO3166-1"="JP"][admin_level=2]->.a;(nwr(area.a)["internet_access"~"^(wlan|yes)$"];nwr(area.a)["wifi"~"^(free|yes)$"];);out tags center;';
export const UPSTREAMS = [
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

const USER_AGENT = 'hundred-days-day029-fetch (+https://hundred-days.pages.dev/day-029-nearby-wifi/)';
const OUTPUT_DIRECTORY = new URL('../data/', import.meta.url);
const CACHE_DIRECTORY = new URL('cache/', import.meta.url);
const REQUEST_TIMEOUT_MS = 195_000;
const RATE_LIMIT_WAIT_MS = 30_000;
const BRAND_INTERVAL_MS = 3_000;

const SOURCE_METADATA = {
  source: '© OpenStreetMap contributors',
  license: 'ODbL 1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
  extractedVia: 'Overpass API',
};

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const round5 = (value) => Number(value.toFixed(5));
const clean80 = (value) => [...String(value).trim()].slice(0, 80).join('');
const childPath = (directory, name) => directory instanceof URL
  ? new URL(name, directory)
  : resolve(directory, name);

export function brandQuery(brandWikidata) {
  return `[out:json][timeout:180];area["ISO3166-1"="JP"][admin_level=2]->.a;nwr(area.a)["brand:wikidata"="${brandWikidata}"];out tags center;`;
}

export function parseArguments(argv) {
  const parsed = { fromFile: null, fromDir: null, brands: null };
  const names = new Map([
    ['--from-file', 'fromFile'],
    ['--from-dir', 'fromDir'],
    ['--brands', 'brands'],
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const property = names.get(argv[index]);
    const value = argv[index + 1];
    if (!property || !value || value.startsWith('--') || parsed[property]) {
      throw new Error('使い方: node fetch-osm.mjs [--from-file <Wi-Fi生JSON>] [--brands <chains.json>] [--from-dir <ブランド生JSONディレクトリ>]');
    }
    parsed[property] = value;
  }
  if (parsed.fromDir && !parsed.brands) throw new Error('--from-dir には --brands の指定も必要です');
  return parsed;
}

export function readChains(path) {
  const value = JSON.parse(readFileSync(resolve(path), 'utf8'));
  if (!value || !Array.isArray(value.chains)) throw new Error('ブランド対応表の chains は配列で指定してください');
  for (const chain of value.chains) {
    const wikidataValues = Array.isArray(chain?.brandWikidata)
      ? chain.brandWikidata
      : [chain?.brandWikidata];
    if (!chain?.id || wikidataValues.length === 0
      || wikidataValues.some((wikidata) => !/^Q\d+$/.test(wikidata ?? ''))) {
      throw new Error('各ブランドには id と Q番号形式の brandWikidata が必要です');
    }
  }
  return { checkedAt: String(value.checkedAt || ''), chains: value.chains };
}

export function publicChains(chains, checkedAt) {
  return chains.map(({ brandWikidata, ...chain }) => ({ ...chain, checkedAt }));
}

const brandRequests = (chains) => chains.flatMap((chain) => {
  const wikidataValues = Array.isArray(chain.brandWikidata)
    ? chain.brandWikidata
    : [chain.brandWikidata];
  return wikidataValues.map((brandWikidata) => ({ chain, brandWikidata }));
});

export function coordinateOf(element) {
  const lat = element?.type === 'node' ? element.lat : element?.center?.lat;
  const lng = element?.type === 'node' ? element.lon : element?.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: round5(lat), lng: round5(lng) };
}

export function wifiExclusionReason(element) {
  if (element?.tags?.internet_access === 'no') return 'internet_access=no';
  if (!coordinateOf(element)) return '座標なし';
  return null;
}

export function elementToWifiSpot(element) {
  if (wifiExclusionReason(element)) return null;
  const tags = element?.tags ?? {};
  const coordinate = coordinateOf(element);
  const selectedName = clean80(displayName(tags));
  const hasName = [tags['name:ja'], tags.name, tags.brand]
    .some((value) => typeof value === 'string' && value.trim());
  const spot = { id: `${element.type}/${element.id}` };
  if (hasName) spot.name = selectedName;
  spot.cat = categoryOf(tags);
  spot.fee = feeClass(tags);
  if (Object.hasOwn(tags, 'internet_access:ssid')) spot.ssid = tags['internet_access:ssid'];
  spot.lat = coordinate.lat;
  spot.lng = coordinate.lng;
  return spot;
}

export function transformWifi(raw) {
  const stats = { fetched: 0, excluded: { 'internet_access=no': 0, '座標なし': 0 }, output: 0 };
  const spots = [];
  for (const element of raw?.elements ?? []) {
    stats.fetched += 1;
    const reason = wifiExclusionReason(element);
    if (reason) {
      stats.excluded[reason] += 1;
      continue;
    }
    spots.push(elementToWifiSpot(element));
  }
  stats.output = spots.length;
  return { spots, stats };
}

export function elementToChainSpot(element, chain) {
  const coordinate = coordinateOf(element);
  if (!coordinate) return null;
  return {
    id: `${element.type}/${element.id}`,
    brand: chain.id,
    name: clean80(displayName(element?.tags ?? {})),
    lat: coordinate.lat,
    lng: coordinate.lng,
  };
}

export function transformChains(rawByBrand, chains) {
  const stats = { fetched: 0, excluded: { '座標なし': 0 }, output: 0 };
  const spots = [];
  for (const { chain, brandWikidata } of brandRequests(chains)) {
    for (const element of rawByBrand.get(brandWikidata)?.elements ?? []) {
      stats.fetched += 1;
      const spot = elementToChainSpot(element, chain);
      if (!spot) stats.excluded['座標なし'] += 1;
      else spots.push(spot);
    }
  }
  stats.output = spots.length;
  return { spots, stats };
}

export function createDataset(spots, query, generatedAt = new Date().toISOString().slice(0, 10)) {
  return {
    generatedAt,
    ...SOURCE_METADATA,
    query,
    count: spots.length,
    spots,
  };
}

class RetryableResponse extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

export async function fetchOverpass(query, {
  fetchImpl = fetch,
  wait = sleep,
  upstreams = UPSTREAMS,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  let lastError;
  for (const endpoint of upstreams) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
          },
          body: new URLSearchParams({ data: query }),
          signal: controller.signal,
        });
        if ([406, 429].includes(response.status)) throw new RetryableResponse(response.status);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        if (error instanceof RetryableResponse && attempt === 0) {
          console.warn(`取得制限: ${endpoint} (${error.message})。30秒後に再試行します`);
          await wait(RATE_LIMIT_WAIT_MS);
          continue;
        }
        console.warn(`取得失敗: ${endpoint} (${error.message})`);
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw new Error(`すべてのOverpass APIで取得に失敗しました: ${lastError?.message ?? '不明なエラー'}`);
}

function readRaw(path) {
  const raw = JSON.parse(readFileSync(resolve(path), 'utf8'));
  if (!raw || !Array.isArray(raw.elements)) throw new Error(`Overpass生JSONの elements がありません: ${path}`);
  return raw;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function printStats(label, stats, log) {
  log(`${label}: 取得=${stats.fetched}, ${Object.entries(stats.excluded).map(([reason, count]) => `除外(${reason})=${count}`).join(', ')}, 出力=${stats.output}`);
}

export async function main(argv = process.argv.slice(2), {
  fetcher = fetchOverpass,
  wait = sleep,
  outputDirectory = OUTPUT_DIRECTORY,
  cacheDirectory = CACHE_DIRECTORY,
  log = console.log,
} = {}) {
  const options = parseArguments(argv);
  const outputDir = outputDirectory instanceof URL ? outputDirectory : resolve(outputDirectory);
  const cacheDir = cacheDirectory instanceof URL ? cacheDirectory : resolve(cacheDirectory);
  mkdirSync(outputDir, { recursive: true });

  let wifiRaw;
  if (options.fromFile) {
    wifiRaw = readRaw(options.fromFile);
  } else {
    wifiRaw = await fetcher(WIFI_QUERY);
    mkdirSync(cacheDir, { recursive: true });
    writeJson(childPath(cacheDir, 'wifi.json'), wifiRaw);
  }

  const wifi = transformWifi(wifiRaw);
  const wifiOutput = createDataset(wifi.spots, WIFI_QUERY);
  const wifiPath = childPath(outputDir, 'osm-wifi.json');
  writeJson(wifiPath, wifiOutput);

  const chainConfig = options.brands ? readChains(options.brands) : { checkedAt: '', chains: [] };
  const chains = chainConfig.chains;
  const rawByBrand = new Map();
  const requests = brandRequests(chains);
  for (let index = 0; index < requests.length; index += 1) {
    const { brandWikidata } = requests[index];
    if (index > 0 && !options.fromDir) await wait(BRAND_INTERVAL_MS);
    let raw;
    if (options.fromDir) {
      raw = readRaw(resolve(options.fromDir, `brand-${brandWikidata}.json`));
    } else {
      raw = await fetcher(brandQuery(brandWikidata));
      mkdirSync(cacheDir, { recursive: true });
      const cachePath = childPath(cacheDir, `brand-${brandWikidata}.json`);
      writeJson(cachePath, raw);
    }
    rawByBrand.set(brandWikidata, raw);
  }

  const chainResult = transformChains(rawByBrand, chains);
  const usedBrandQueries = requests.map(({ brandWikidata }) => brandQuery(brandWikidata)).join('\n');
  const chainDataset = createDataset(chainResult.spots, usedBrandQueries);
  const { count: chainCount, spots: chainSpots, ...chainHead } = chainDataset;
  const chainOutput = {
    ...chainHead,
    chains: publicChains(chains, chainConfig.checkedAt),
    count: chainCount,
    spots: chainSpots,
  };
  const chainPath = childPath(outputDir, 'osm-chains.json');
  writeJson(chainPath, chainOutput);

  printStats('Wi-Fi', wifi.stats, log);
  printStats('ブランド', chainResult.stats, log);
  log(`出力: ${wifiPath instanceof URL ? wifiPath.pathname : wifiPath}`);
  log(`出力: ${chainPath instanceof URL ? chainPath.pathname : chainPath}`);
  return { wifi: wifiOutput, chains: chainOutput, stats: { wifi: wifi.stats, chains: chainResult.stats } };
}

if (process.argv[1]?.endsWith('/fetch-osm.mjs')) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
