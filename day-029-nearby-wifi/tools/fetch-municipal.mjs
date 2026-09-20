#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { get } from 'node:https';

const GENERATED_AT = '2026-09-04';
const MODIFIED_BY = 'haranishi';
const MODIFICATION = '列を絞り、座標を数値化し、同一施設の複数APを1点に束ねた';
const DATA_NOTE = '自治体の公衆無線LANアクセスポイント一覧を加工したもの。出典と規約は sources を参照。OpenStreetMap のデータは含まない';
const SOURCES_PATH = new URL('municipal-sources.json', import.meta.url);
const OUTPUT_PATH = new URL('../data/municipal.json', import.meta.url);

export function detectEncoding(bytes, fallback = 'utf-8') {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', offset: 3 };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', offset: 2 };
  }
  return { encoding: fallback, offset: 0 };
}

export function decodeBytes(bytes, fallback = 'utf-8') {
  const { encoding, offset } = detectEncoding(bytes, fallback);
  return new TextDecoder(encoding).decode(bytes.subarray(offset));
}

// RFC 4180: quoted commas, escaped quotes, CRLF and newlines inside fields.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[index + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      index += 1;
    } else if (char === '\n' || char === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error('CSVの引用符が閉じていません');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function candidates(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function matchColumns(header, columns) {
  const normalized = header.map((value) => value.replace(/^\uFEFF/, '').trim());
  const indexes = new Map(normalized.map((value, index) => [value, index]));
  const result = {};

  for (const [field, configured] of Object.entries(columns)) {
    if (field === 'addressParts') continue;
    const match = candidates(configured).find((name) => indexes.has(name.trim()));
    result[field] = match == null ? -1 : indexes.get(match.trim());
  }
  result.addressParts = candidates(columns.addressParts)
    .map((name) => indexes.get(name.trim()))
    .filter((index) => index != null);

  for (const required of ['name', 'lat', 'lng']) {
    if (result[required] === -1) {
      throw new Error(`必須列「${columns[required]}」が見つかりません（ヘッダ: ${normalized.join(', ')}）`);
    }
  }
  return result;
}

const inLatitudeRange = (value) => value >= 20 && value <= 46;
const inLongitudeRange = (value) => value >= 122 && value <= 154;

export function normalizeCoordinate(rawLat, rawLng, swapLatLng = 'auto') {
  const latText = String(rawLat ?? '').trim();
  const lngText = String(rawLng ?? '').trim();
  if (!latText || !lngText || /^[-―ー]+$/.test(latText) || /^[-―ー]+$/.test(lngText)) {
    return { ok: false, reason: 'empty' };
  }

  let lat = Number(latText);
  let lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'nonNumeric' };
  }
  if (lat === 999 || lng === 999) return { ok: false, reason: 'sentinel999' };

  let swapped = false;
  if (swapLatLng === 'auto' && inLongitudeRange(lat) && inLatitudeRange(lng)) {
    [lat, lng] = [lng, lat];
    swapped = true;
  }
  if (Math.abs(lat) > 1000 || Math.abs(lng) > 1000) {
    return { ok: false, reason: 'oversized' };
  }
  if (!inLatitudeRange(lat) || !inLongitudeRange(lng)) {
    return { ok: false, reason: 'outOfRange' };
  }
  return { ok: true, lat, lng, swapped };
}

const round5 = (value) => Number(value.toFixed(5));
const clean = (value) => String(value ?? '').trim();
const truncate80 = (value) => [...clean(value)].slice(0, 80).join('');

export function bundleDuplicates(spots) {
  const bundled = new Map();
  for (const input of spots) {
    const spot = { ...input, lat: round5(input.lat), lng: round5(input.lng) };
    const key = `${spot.src}\u0000${spot.name}\u0000${spot.lat.toFixed(5)}\u0000${spot.lng.toFixed(5)}`;
    const existing = bundled.get(key);
    if (existing) {
      existing.apCount += spot.apCount ?? 1;
      if (!existing.ssid && spot.ssid) existing.ssid = spot.ssid;
      if (!existing.addr && spot.addr) existing.addr = spot.addr;
    } else {
      bundled.set(key, { ...spot, apCount: spot.apCount ?? 1 });
    }
  }
  return [...bundled.values()];
}

export function transformSource(bytes, source) {
  const text = decodeBytes(bytes, source.encoding);
  const rows = parseCsv(text);
  while (rows.length && rows.at(-1).every((value) => value === '')) rows.pop();
  if (rows.length === 0) throw new Error('CSVが空です');

  let header = rows[0].map((value) => value.trim());
  let dataRows = rows.slice(1);
  if (header[0]?.replace(/^\uFEFF/, '') === '_id') {
    header = header.slice(1);
    dataRows = dataRows.map((row) => row.slice(1));
  }
  const columns = matchColumns(header, source.columns);
  const stats = {
    read: dataRows.length,
    dropped: { empty: 0, nonNumeric: 0, sentinel999: 0, oversized: 0, outOfRange: 0 },
    swapped: 0,
    bundled: 0,
    output: 0,
  };
  const spots = [];

  for (const row of dataRows) {
    const coordinate = normalizeCoordinate(
      row[columns.lat],
      row[columns.lng],
      source.fixes?.swapLatLng,
    );
    if (!coordinate.ok) {
      stats.dropped[coordinate.reason] += 1;
      continue;
    }
    if (coordinate.swapped) stats.swapped += 1;

    const name = truncate80(row[columns.name]);
    const directAddress = columns.address === -1 ? '' : clean(row[columns.address]);
    const addr = directAddress || columns.addressParts.map((index) => clean(row[index])).join('');
    const ssid = columns.ssid === -1 ? '' : clean(row[columns.ssid]);
    const spot = {
      src: source.id,
      name,
      lat: coordinate.lat,
      lng: coordinate.lng,
      addr,
      apCount: 1,
    };
    if (ssid) spot.ssid = ssid;
    spots.push(spot);
  }

  const output = bundleDuplicates(spots);
  stats.bundled = spots.length - output.length;
  stats.output = output.length;
  return { spots: output, stats };
}

function download(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('リダイレクト回数が上限を超えました'));
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: { 'User-Agent': 'hundred-days-data-fetcher/1.0' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(download(new URL(response.headers.location, url).href, redirects + 1));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}: ${url}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('error', reject);
  });
}

function parseArguments(argv) {
  if (argv.length === 0) return { fromDir: null };
  if (argv.length === 2 && argv[0] === '--from-dir') return { fromDir: argv[1] };
  throw new Error('使い方: node fetch-municipal.mjs [--from-dir <dir>]');
}

function sourceSummary(source, count, dropped) {
  return {
    id: source.id,
    org: source.org,
    title: source.title,
    pageUrl: source.pageUrl,
    fileUrl: source.fileUrl,
    license: source.license,
    licenseUrl: source.licenseUrl,
    credit: source.credit,
    retrievedAt: GENERATED_AT,
    modifiedBy: MODIFIED_BY,
    modification: MODIFICATION,
    count,
    dropped,
  };
}

function printStats(results) {
  console.table(results.map(({ source, stats }) => ({
    出典: source.org,
    読込: stats.read,
    空欄: stats.dropped.empty,
    非数値: stats.dropped.nonNumeric,
    座標999: stats.dropped.sentinel999,
    桁異常: stats.dropped.oversized,
    範囲外: stats.dropped.outOfRange,
    入替修正: stats.swapped,
    重複束ね: stats.bundled,
    出力点数: stats.output,
  })));
}

export async function main(argv = process.argv.slice(2)) {
  const { fromDir } = parseArguments(argv);
  const sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'));
  const results = [];

  for (const source of sources) {
    const bytes = fromDir
      ? readFileSync(`${fromDir.replace(/\/$/, '')}/${source.localName}`)
      : await download(source.fileUrl);
    const opening = decodeBytes(bytes.subarray(0, Math.min(bytes.length, 256)), source.encoding).trimStart();
    if (/^<!doctype html|^<html/i.test(opening)) {
      throw new Error(`${source.org}: fileUrlは配布ページです。CSV直リンクがないため --from-dir で変換済みの ${source.localName} を指定してください`);
    }
    results.push({ source, ...transformSource(bytes, source) });
  }

  const output = {
    generatedAt: GENERATED_AT,
    note: DATA_NOTE,
    sources: results.map(({ source, spots, stats }) => sourceSummary(
      source,
      spots.length,
      Object.values(stats.dropped).reduce((sum, count) => sum + count, 0),
    )),
    spots: results.flatMap(({ spots }) => spots),
  };
  mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  printStats(results);
  console.log(`出力: ${OUTPUT_PATH.pathname} (${output.spots.length}点)`);
  return output;
}

if (process.argv[1]?.endsWith('/fetch-municipal.mjs')) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
