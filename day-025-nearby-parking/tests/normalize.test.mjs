import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeElement, normalizeElements } from '../lib/normalize.js';

test('normalize: fee=yesを有料に写像する', () => {
  assert.equal(normalizeElement({ type: 'node', id: 1, lat: 1, lon: 2, tags: { fee: 'yes' } }).fee, 'yes');
});

test('normalize: fee=noを無料に写像する', () => {
  assert.equal(normalizeElement({ type: 'node', id: 1, lat: 1, lon: 2, tags: { fee: 'no' } }).fee, 'no');
});

test('normalize: fee欠損と未知値をunknownに写像する', () => {
  assert.equal(normalizeElement({ type: 'node', id: 1, lat: 1, lon: 2, tags: {} }).fee, 'unknown');
  assert.equal(normalizeElement({ type: 'node', id: 2, lat: 1, lon: 2, tags: { fee: 'donation' } }).fee, 'unknown');
});

test('normalize: private/customers/noだけを利用制限ありにする', () => {
  for (const access of ['private', 'customers', 'no']) {
    assert.equal(normalizeElement({ type: 'node', id: access, lat: 1, lon: 2, tags: { access } }).restricted, true);
  }
  assert.equal(normalizeElement({ type: 'node', id: 3, lat: 1, lon: 2, tags: { access: 'yes' } }).restricted, false);
});

test('normalize: wayはcenterを使いcenter欠損を除外する', () => {
  assert.deepEqual(normalizeElement({ type: 'way', id: 7, center: { lat: 3, lon: 4 } }).lat, 3);
  assert.equal(normalizeElement({ type: 'way', id: 8, tags: {} }), null);
  assert.equal(normalizeElements([{ type: 'relation', id: 9 }, { type: 'node', id: 1, lat: 1, lon: 2 }]).length, 1);
});

test('normalize: 24/7を日本語化し他の営業時間は保持する', () => {
  assert.equal(normalizeElement({ type: 'node', id: 1, lat: 1, lon: 2, tags: { opening_hours: '24/7' } }).openingHours, '24時間');
  assert.equal(normalizeElement({ type: 'node', id: 2, lat: 1, lon: 2, tags: { opening_hours: 'Mo-Fr 09:00-18:00' } }).openingHours, 'Mo-Fr 09:00-18:00');
});

test('normalize: 名前欠損はnullでOSM IDを安定生成する', () => {
  const item = normalizeElement({ type: 'relation', id: 42, center: { lat: 1, lon: 2 }, tags: {} });
  assert.equal(item.name, null);
  assert.equal(item.id, 'relation/42');
  assert.equal(item.osmUrl, 'https://www.openstreetmap.org/relation/42');
});
