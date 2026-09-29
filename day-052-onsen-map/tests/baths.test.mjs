import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { metersBetween } from '../tools/build-baths.mjs';
import {
  TYPE_COLORS, bathFacts, bathName, bathTotalText, countsText, emptyTypeHint, emptyTypeMessage, emptyTypes, filterByType, formatKm,
  googleMapsUrl, hasJapanese, howText, isBathId, nearestBaths, osmUrl, sortBaths, totalOf,
} from '../lib/baths.js';

const data = JSON.parse(readFileSync(new URL('../data/baths.json', import.meta.url), 'utf8'));
const stats = JSON.parse(readFileSync(new URL('../data/stats.json', import.meta.url), 'utf8'));
const akita = stats.prefectures.find((pref) => pref.code === '05');

test('TYPE_COLORS / emptyTypes: 点の5色は Okabe-Ito から（判断できないものは灰色）、0件の種類を拾う', () => {
  assert.deepEqual(TYPE_COLORS, { onsen: '#E69F00', sento: '#56B4E9', super: '#F0E442', foot: '#009E73', other: '#9AA1AD' });
  assert.deepEqual(emptyTypes(data.counts['05']), ['sento']);
  assert.deepEqual(emptyTypes({ onsen: 1, sento: 1, super: 1, foot: 1, other: 1 }), []);
  assert.deepEqual(emptyTypes(null), ['onsen', 'sento', 'super', 'foot', 'other']);
});

test('howText: 種類と判断の根拠', () => {
  assert.equal(howText({ t: 'onsen', how: 'tag' }), '種類：温泉（地図データに登録あり）');
  assert.equal(howText({ t: 'sento', how: 'name' }), '種類：銭湯（名前から判断）');
  assert.equal(howText({ t: 'foot', how: 'tag' }), '種類：足湯・手湯（地図データに登録あり）');
  assert.equal(howText({ t: 'other', how: 'none' }), '種類の登録なし');
  assert.equal(howText(null), '種類の登録なし');
});

test('bathName: 名前が無ければ「名前の登録なし」', () => {
  assert.equal(bathName({ name: '乳頭温泉' }), '乳頭温泉');
  assert.equal(bathName({}), '名前の登録なし');
});

test('googleMapsUrl: 小数5桁の座標検索（Day 029 と同じ形）', () => {
  assert.equal(googleMapsUrl(39.717612, 140.130551), 'https://www.google.com/maps/search/?api=1&query=39.71761,140.13055');
  assert.equal(googleMapsUrl('35.1', '139'), 'https://www.google.com/maps/search/?api=1&query=35.10000,139.00000');
});

test('osmUrl / isBathId: 先頭の文字で node・way・relation を決める', () => {
  assert.equal(osmUrl('n123'), 'https://www.openstreetmap.org/node/123');
  assert.equal(osmUrl('w45'), 'https://www.openstreetmap.org/way/45');
  assert.equal(osmUrl('r6'), 'https://www.openstreetmap.org/relation/6');
  for (const bad of ['x1', 'n', 'n0', 'n12a', 'N12', '', null, 12]) {
    assert.equal(osmUrl(bad), null, String(bad));
    assert.equal(isBathId(bad), false, String(bad));
  }
  assert.equal(data.baths.every((bath) => isBathId(bath.id)), true);
});

test('bathFacts: 地図データにあるものだけ。無い項目は出さない', () => {
  assert.deepEqual(bathFacts({ oh: 'Mo-Su 10:00-21:00', fee: 'yes', air: true }), [
    { label: '営業時間（地図データの記載）', value: 'Mo-Su 10:00-21:00' },
    { label: '料金（地図データの記載）', value: 'あり' },
    { label: '露天風呂（地図データの記載）', value: 'あり' },
  ]);
  assert.deepEqual(bathFacts({ fee: 'no' }), [{ label: '料金（地図データの記載）', value: '無料' }]);
  assert.deepEqual(bathFacts({}), []);
});

test('bathTotalText / countsText: 秋田県は見出し「120件」と内訳（温泉79・スーパー銭湯など1・足湯・手湯4・種類の登録なし36）', () => {
  const counts = data.counts['05'];
  assert.equal(totalOf(counts), 120);
  assert.equal(bathTotalText(counts), '地図に載っているお風呂 120件');
  assert.equal(countsText(counts), '温泉79、スーパー銭湯など1、足湯・手湯4、種類の登録なし36');
  // 0件の種類は内訳に出さない
  assert.equal(countsText({ onsen: 2, sento: 0, super: 0, foot: 1, other: 0 }), '温泉2、足湯・手湯1');
  assert.equal(bathTotalText({ onsen: 0, sento: 0, super: 0, foot: 0, other: 0 }), '地図に載っているお風呂 0件');
  assert.equal(countsText({ onsen: 0, sento: 0, super: 0, foot: 0, other: 0 }), '');
  assert.equal(bathTotalText(null), '地図に載っているお風呂 0件');
});

test('emptyTypeMessage: 0件の種類には国の数を添える', () => {
  assert.equal(emptyTypeMessage('sento', akita), 'この県で地図に載っている銭湯はありません（国の統計では12軒）');
  assert.equal(emptyTypeMessage('onsen', akita), 'この県で地図に載っている温泉はありません（国の統計では温泉地104か所）');
  assert.equal(emptyTypeMessage('super', akita), 'この県で地図に載っているスーパー銭湯などはありません');
  assert.equal(emptyTypeMessage('foot', akita), 'この県で地図に載っている足湯・手湯はありません');
  assert.equal(emptyTypeMessage('other', akita), 'この県で地図に載っている、種類の登録がないお風呂はありません');
  assert.equal(emptyTypeMessage('all', akita), 'この県で地図に載っているお風呂はありません');
  assert.match(emptyTypeHint('sento'), /銭湯の多くが「種類の登録なし」/);
  assert.match(emptyTypeHint('foot'), /全部ではありません|意味しません/);
});

test('filterByType / sortBaths: 名前順。日本語の名前→英字だけの名前→名前の無いもの（種類の順・番号の順）', () => {
  const baths = [
    { id: 'n3', t: 'other' }, { id: 'n2', t: 'onsen', name: 'いろは湯' }, { id: 'n9', t: 'onsen' },
    { id: 'n1', t: 'sento', name: 'あけぼの湯' }, { id: 'w1', t: 'onsen', name: 'Abc Onsen' }, { id: 'w2', t: 'onsen', name: 'Kasumi Onsen' },
    { id: 'r1', t: 'super', name: 'スパ湯' }, { id: 'r2', t: 'foot', name: '足湯広場' },
  ];
  assert.deepEqual(sortBaths(baths).map((bath) => bath.id), ['n1', 'n2', 'r1', 'r2', 'w1', 'w2', 'n9', 'n3']);
  assert.equal(hasJapanese('Kasumi Onsen (Yurihonjo)'), false);
  assert.equal(hasJapanese('Onsen 温泉'), true);
  assert.equal(hasJapanese('カナ'), true);
  assert.equal(hasJapanese(''), false);
  assert.equal(hasJapanese(undefined), false);
  // 同梱データの秋田県：英字だけの名前（Kasumi Onsen など）は日本語の名前より後ろ
  const akita = sortBaths(data.baths.filter((bath) => bath.pref === '05'));
  const firstLatin = akita.findIndex((bath) => bath.name && !hasJapanese(bath.name));
  const lastJapanese = akita.map((bath) => Boolean(bath.name && hasJapanese(bath.name))).lastIndexOf(true);
  assert.ok(firstLatin > lastJapanese, `${firstLatin} > ${lastJapanese}`);
  assert.equal(hasJapanese(akita[0].name), true);
  assert.deepEqual(filterByType(baths, 'onsen').map((bath) => bath.id), ['n2', 'n9', 'w1', 'w2']);
  assert.equal(filterByType(baths, 'all').length, 8);
  assert.deepEqual(filterByType(baths, 'foot').map((bath) => bath.id), ['r2']);
  assert.equal(filterByType(baths, 'sento').length, 1);
});

test('nearestBaths / formatKm: 近い順・上限件数・半径', () => {
  const here = { lat: 39.7176, lng: 140.1305 };
  const rows = nearestBaths(data.baths, here, { limit: 5, maxKm: 20 });
  assert.equal(rows.length, 5);
  assert.ok(rows.every((row, index) => index === 0 || rows[index - 1].km <= row.km));
  assert.ok(rows.every((row) => row.km <= 20 && row.bath.pref === '05'));
  assert.deepEqual(nearestBaths(data.baths, { lat: 0, lng: 0 }), []);
  assert.equal(formatKm(0.2345), '230m');
  assert.equal(formatKm(0.001), '10m');
  assert.equal(formatKm(1.234), '1.2km');
  assert.equal(formatKm(12.6), '13km');
});

test('同梱の baths.json: 5,208件で、県ごとの件数と中身が合う（同じ名前で100m以内の二重登録はまとめてある）', () => {
  assert.equal(data.count, 5208);
  assert.equal(data.baths.length, 5208);
  const codes = stats.prefectures.map((pref) => pref.code);
  assert.deepEqual(Object.keys(data.counts).sort(), [...codes].sort());
  for (const code of codes) {
    const inPref = data.baths.filter((bath) => bath.pref === code);
    assert.equal(totalOf(data.counts[code]), inPref.length, code);
    for (const type of Object.keys(TYPE_COLORS)) assert.equal(data.counts[code][type], inPref.filter((bath) => bath.t === type).length, `${code} ${type}`);
  }
  assert.equal(new Set(data.baths.map((bath) => bath.id)).size, 5208);
  assert.deepEqual(['05', '13', '44'].map((code) => totalOf(data.counts[code])), [120, 334, 171]);
  // 同じ県・同じ名前で100m以内の組は残っていない
  const byKey = new Map();
  for (const bath of data.baths.filter((one) => one.name)) {
    const key = `${bath.pref}|${bath.name}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(bath);
  }
  const close = [...byKey.values()].filter((group) => group.length > 1)
    .some((group) => group.some((one, index) => group.slice(index + 1).some((two) => metersBetween(one, two) < 100)));
  assert.equal(close, false);
});

test('chipTypes: 「すべて」「温泉」の次に「種類の登録なし」。この県に0件の種類は末尾へ', async () => {
  const { chipTypes, CHIP_ORDER } = await import('../lib/render.js');
  assert.deepEqual(CHIP_ORDER, ['onsen', 'other', 'sento', 'super', 'foot']);
  // 秋田県は銭湯が0件なので最後
  assert.deepEqual(chipTypes(data.counts['05']), ['all', 'onsen', 'other', 'super', 'foot', 'sento']);
  // 東京都は5種類ともあるので、決めた順のまま
  assert.deepEqual(chipTypes(data.counts['13']), ['all', 'onsen', 'other', 'sento', 'super', 'foot']);
  assert.deepEqual(chipTypes({ onsen: 0, sento: 1, super: 0, foot: 2, other: 0 }), ['all', 'sento', 'foot', 'onsen', 'other', 'super']);
});
