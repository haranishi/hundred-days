import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MARKERS, createState, emptyReason, freeEligibleCount, markerSpots, matchedSpots, visibleSpots,
} from '../lib/state.js';

const datasets = {
  municipal: {
    sources: [{ id: 'city', org: '架空市' }],
    spots: [{ src: 'city', name: '自治体遠', lat: 39.719, lng: 140.1305, apCount: 1 }],
  },
  osm: { spots: [
    { id: 'node/1', name: 'OSM近', cat: 'カフェ', fee: 'paid', lat: 39.7177, lng: 140.1305 },
    { id: 'node/2', name: 'OSM無料', cat: '駅', fee: 'free', lat: 39.718, lng: 140.1305 },
  ] },
  chain: {
    chains: [{ id: 'brand', label: '架空チェーン', tier: 'all', condition: '登録不要', checkedAt: '2026-09-04' }],
    spots: [{ id: 'node/3', brand: 'brand', name: '推定中', lat: 39.7185, lng: 140.1305 }],
  },
};

function state() {
  return { ...createState(), datasets, center: { lat: 39.7176, lng: 140.1305 }, radius: 800 };
}

test('matchedSpots: 3層を距離順に並べる', () => {
  assert.deepEqual(matchedSpots(state()).map((spot) => spot.name), ['OSM近', 'OSM無料', '推定中', '自治体遠']);
});

test('matchedSpots: 層チェックは対象層だけを隠す', () => {
  const value = state(); value.layers = { municipal: true, osm: false, chain: true };
  assert.deepEqual(matchedSpots(value).map((spot) => spot.layer), ['chain', 'municipal']);
});

test('matchedSpots: 無料絞り込みはOSMの有料・不明だけを隠す', () => {
  const value = state(); value.onlyFree = true;
  assert.deepEqual(matchedSpots(value).map((spot) => spot.name), ['OSM無料', '推定中', '自治体遠']);
});

test('matchedSpots: 半径外を除き、visibleSpotsは距離順の先頭100件', () => {
  const value = state();
  value.datasets = { ...datasets, osm: { spots: Array.from({ length: 105 }, (_, index) => ({
    id: `node/${index}`, name: String(index), cat: 'その他', fee: 'free', lat: 39.7176 + index / 1_000_000, lng: 140.1305,
  })) } };
  value.layers = { municipal: false, osm: true, chain: false };
  assert.equal(matchedSpots(value).length, 105);
  assert.equal(visibleSpots(value).length, 100);
  assert.equal(visibleSpots(value)[0].name, '0');
});

test('markerSpots: 地図ピンは近い60件まで', () => {
  const value = state();
  value.datasets = { ...datasets, osm: { spots: Array.from({ length: 70 }, (_, index) => ({
    id: `node/${index}`, name: String(index), cat: 'その他', fee: 'free', lat: 39.7176 + index / 1_000_000, lng: 140.1305,
  })) } };
  value.layers = { municipal: false, osm: true, chain: false };
  assert.equal(MAX_MARKERS, 60);
  assert.equal(markerSpots(value).length, 60);
});

test('emptyReason: 層全OFF・無料絞り込み・半径・範囲を区別する', () => {
  const value = state();
  value.layers = { municipal: false, osm: false, chain: false };
  assert.equal(emptyReason(value), 'layers-off');
  value.layers.osm = true; value.onlyFree = true;
  value.datasets = { ...datasets, osm: { spots: [datasets.osm.spots[0]] } };
  assert.equal(freeEligibleCount(value), 0);
  assert.equal(emptyReason(value), 'free-filter');
  value.onlyFree = false; value.datasets = { ...datasets, osm: { spots: [] } };
  assert.equal(emptyReason(value), 'radius');
  value.radius = 3200;
  assert.equal(emptyReason(value), 'range');
});

test('matchedSpots: 名前なし・不明のOSM地点を除外する', () => {
  const value = state();
  value.datasets = { ...datasets, osm: { spots: [
    { id: 'node/empty', name: '名前なし', cat: 'その他', fee: 'unknown', lat: 39.7177, lng: 140.1305 },
    { id: 'node/known', name: '名前あり', cat: 'その他', fee: 'unknown', lat: 39.7178, lng: 140.1305 },
  ] } };
  value.layers = { municipal: false, osm: true, chain: false };
  assert.deepEqual(matchedSpots(value).map((spot) => spot.name), ['名前あり']);
});
