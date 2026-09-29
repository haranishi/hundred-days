#!/usr/bin/env node
// tools/cache/JP-NN.json（fetch-osm.mjs が置いた Overpass の生応答）から data/baths.json を作る。
// 使い方: node tools/build-baths.mjs [--date YYYY-MM-DD]
// 同じ入力と日付からは同じ出力になる。

import { readFileSync, writeFileSync } from 'node:fs';
import { PREFECTURE_CODES } from './fetch-osm.mjs';
import { classify, displayName, exclusionReason, TYPES } from '../lib/classify.js';

const CACHE_DIRECTORY = new URL('./cache/', import.meta.url);
const OUTPUT = new URL('../data/baths.json', import.meta.url);

const round5 = (value) => Number(value.toFixed(5));
// 制御文字を除き、長すぎる値は切る（画面の1行に収めるため）
const clean = (value, max) => [...String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim()].slice(0, max).join('');

export function coordinateOf(element) {
  const lat = element?.type === 'node' ? element.lat : element?.center?.lat;
  const lng = element?.type === 'node' ? element.lon : element?.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: round5(lat), lng: round5(lng) };
}

export function toBath(element, pref) {
  const tags = element.tags ?? {};
  const coordinate = coordinateOf(element);
  if (!coordinate) return { excluded: 'coordinate' };
  const reason = exclusionReason(tags);
  if (reason) return { excluded: reason };
  const { type, how } = classify(tags);
  const bath = { id: `${element.type[0]}${element.id}`, pref, lat: coordinate.lat, lng: coordinate.lng, t: type, how };
  const name = displayName(tags);
  if (name) bath.name = clean(name, 60);
  if (typeof tags.opening_hours === 'string' && tags.opening_hours.trim()) bath.oh = clean(tags.opening_hours, 80);
  if (tags.fee === 'yes' || tags.fee === 'no') bath.fee = tags.fee;
  if (tags['bath:open_air'] === 'yes') bath.air = true;
  return { bath };
}

export function buildBaths(rawByPref) {
  const seen = new Set();
  const baths = [];
  const excluded = { coordinate: 0, access: 0, disused: 0, duplicate: 0 };
  let osmBase = '';
  for (const pref of PREFECTURE_CODES) {
    const raw = rawByPref.get(pref);
    if (!raw || !Array.isArray(raw.elements)) throw new Error(`JP-${pref} の生データがありません`);
    const stamp = raw.osm3s?.timestamp_osm_base ?? '';
    if (stamp > osmBase) osmBase = stamp;
    // 県の境界にかかる施設は2県の応答に出る。県コードの若い方に入れる
    const elements = [...raw.elements].sort((a, b) => `${a.type}${a.id}`.localeCompare(`${b.type}${b.id}`));
    for (const element of elements) {
      const key = `${element.type}/${element.id}`;
      if (seen.has(key)) {
        excluded.duplicate += 1;
        continue;
      }
      seen.add(key);
      const { bath, excluded: reason } = toBath(element, pref);
      if (reason) excluded[reason] += 1;
      else baths.push(bath);
    }
  }
  const { baths: mergedBaths, merged } = mergeSameName(baths);
  excluded.sameName = merged;
  const counts = {};
  for (const pref of PREFECTURE_CODES) counts[pref] = Object.fromEntries(TYPES.map((type) => [type, 0]));
  const byHow = { tag: 0, name: 0, none: 0 };
  for (const bath of mergedBaths) {
    counts[bath.pref][bath.t] += 1;
    byHow[bath.how] += 1;
  }
  return { baths: mergedBaths, counts, excluded, byHow, osmBase };
}

const HOW_RANK = { tag: 0, name: 1, none: 2 };
const KIND_RANK = { n: 0, w: 1, r: 2 };

export function metersBetween(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// OpenStreetMap では同じお風呂が「点」と「建物の輪郭」で二重に登録されていることが多い（同名の組の9割は25m以内）。
// 同じ県・同じ名前で maxMeters 以内のものは1件にまとめる。残すのは種類の根拠が強いもの（登録あり→名前→なし）、
// 次に点→輪郭→リレーションの順。営業時間などは残す側に無ければ、まとめた側から補う
export function mergeSameName(baths, maxMeters = 100) {
  const groups = new Map();
  for (const bath of baths) {
    if (!bath.name) continue;
    const key = JSON.stringify([bath.pref, bath.name]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bath);
  }
  const absorbed = new Set();
  const replacement = new Map();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const ordered = [...members].sort((a, b) => HOW_RANK[a.how] - HOW_RANK[b.how]
      || KIND_RANK[a.id[0]] - KIND_RANK[b.id[0]]
      || a.id.localeCompare(b.id));
    const clusters = [];
    for (const bath of ordered) {
      const cluster = clusters.find((candidate) => metersBetween(candidate.primary, bath) < maxMeters);
      if (!cluster) {
        clusters.push({ primary: bath, merged: { ...bath } });
        continue;
      }
      absorbed.add(bath.id);
      for (const field of ['oh', 'fee', 'air']) {
        if (cluster.merged[field] === undefined && bath[field] !== undefined) cluster.merged[field] = bath[field];
      }
    }
    for (const cluster of clusters) replacement.set(cluster.primary.id, cluster.merged);
  }
  const result = baths.filter((bath) => !absorbed.has(bath.id)).map((bath) => replacement.get(bath.id) ?? bath);
  return { baths: result, merged: absorbed.size };
}

function parseDate(argv) {
  const index = argv.indexOf('--date');
  if (index === -1) return new Date().toISOString().slice(0, 10);
  const value = argv[index + 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error('--date は YYYY-MM-DD で指定してください');
  return value;
}

function main(argv) {
  const rawByPref = new Map(PREFECTURE_CODES.map((pref) => [
    pref,
    JSON.parse(readFileSync(new URL(`JP-${pref}.json`, CACHE_DIRECTORY), 'utf8')),
  ]));
  const { baths, counts, excluded, byHow, osmBase } = buildBaths(rawByPref);
  const output = {
    generatedAt: parseDate(argv),
    osmBase,
    source: '© OpenStreetMap contributors',
    license: 'ODbL 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    query: 'nwr(area["ISO3166-2"="JP-NN"])["amenity"="public_bath"]（47都道府県ごと）',
    count: baths.length,
    counts,
    baths,
  };
  writeFileSync(OUTPUT, `${JSON.stringify(output)}\n`);
  const typeTotals = Object.fromEntries(TYPES.map((type) => [type, baths.filter((bath) => bath.t === type).length]));
  console.log(`出力 ${baths.length}件`, typeTotals, '判断の根拠', byHow, '除外', excluded, `osm_base ${osmBase}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
