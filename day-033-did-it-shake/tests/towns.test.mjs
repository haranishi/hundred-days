import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveTown, DESIGNATED_CITIES } from '../lib/towns.js';
const { places } = JSON.parse(readFileSync(new URL('../data/places.json', import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/jma-list-2026-09-08.json', import.meta.url)));
test('一覧にある区コード117種がすべて同じ県の政令市へ解決する', () => {
  const codes = new Set(fixture.flatMap((row) => (row.int || []).flatMap((pref) => pref.city || [])).map((city) => city.code));
  const wards = [...codes].filter((code) => !places.some((place) => place.c === code.slice(0, 5)));
  assert.equal(wards.length, 117);
  for (const code of wards) {
    const resolved = resolveTown(code, places);
    assert.ok(DESIGNATED_CITIES.includes(resolved), code);
    assert.equal(resolved.slice(0, 2), code.slice(0, 2));
    assert.ok(places.some((place) => place.c === resolved));
  }
});
test('20市の最初の区と、横浜・川崎・堺・熊本の例', () => {
  assert.equal(DESIGNATED_CITIES.length, 20);
  for (const city of DESIGNATED_CITIES) assert.equal(resolveTown(`${String(Number(city) + 1).padStart(5, '0')}00`, places), city);
  for (const [ward, city] of [['1410400', '14100'], ['1413100', '14130'], ['2714100', '27140'], ['4310300', '43100']]) assert.equal(resolveTown(ward, places), city);
});
test('通常の市と東京23区は直接一致。不正な形・県は一致しない', () => {
  assert.equal(resolveTown('0520100', places), '05201');
  assert.equal(resolveTown('1310100', places), '13101');
  assert.equal(resolveTown('9999900', places), null); assert.equal(resolveTown('05201', places), null);
});
