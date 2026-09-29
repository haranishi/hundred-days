import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBaths, coordinateOf, mergeSameName, metersBetween, toBath } from '../tools/build-baths.mjs';
import { PREFECTURE_CODES, assertComplete, queryFor } from '../tools/fetch-osm.mjs';

const node = (id, tags = {}, lat = 39.717612345, lon = 140.130551234) => ({ type: 'node', id, lat, lon, tags });
const way = (id, tags = {}, center = { lat: 39.1, lon: 140.2 }) => ({ type: 'way', id, center, tags });

test('coordinateOf: node は自分の座標、way/relation は center。小数5桁に丸める', () => {
  assert.deepEqual(coordinateOf(node(1)), { lat: 39.71761, lng: 140.13055 });
  assert.deepEqual(coordinateOf(way(2)), { lat: 39.1, lng: 140.2 });
  assert.equal(coordinateOf({ type: 'way', id: 3 }), null);
  assert.equal(coordinateOf({ type: 'node', id: 4, lat: 'x', lon: 1 }), null);
});

test('toBath: 表示に要る項目だけを残す', () => {
  const { bath } = toBath(node(10, {
    'bath:type': 'onsen', name: '木浦名水館;唄げんかの湯', opening_hours: ' Mo-Su 10:00-21:00 ', fee: 'yes', 'bath:open_air': 'yes', website: 'https://example.test',
  }), '05');
  assert.deepEqual(bath, {
    id: 'n10', pref: '05', lat: 39.71761, lng: 140.13055, t: 'onsen', how: 'tag',
    name: '木浦名水館・唄げんかの湯', oh: 'Mo-Su 10:00-21:00', fee: 'yes', air: true,
  });
});

test('toBath: 名前も種類の記載も無ければ other/none で、無い項目は持たない', () => {
  const { bath } = toBath(way(20), '13');
  assert.deepEqual(bath, { id: 'w20', pref: '13', lat: 39.1, lng: 140.2, t: 'other', how: 'none' });
  // 料金は yes/no だけを残す（donation などは捨てる）
  assert.equal(toBath(node(21, { fee: 'donation' }), '13').bath.fee, undefined);
  assert.equal(toBath(node(22, { fee: 'no' }), '13').bath.fee, 'no');
  assert.equal(toBath({ type: 'relation', id: 23, center: { lat: 35, lon: 139 }, tags: {} }, '13').bath.id, 'r23');
});

test('toBath: 制御文字を空白にし、名前60字・営業時間80字で切る', () => {
  const long = 'あ'.repeat(70);
  const { bath } = toBath(node(30, { name: `湯\u0007${long}`, opening_hours: 'x'.repeat(100) }), '01');
  assert.equal([...bath.name].length, 60);
  assert.equal(bath.name.startsWith('湯 あ'), true);
  assert.equal(bath.oh.length, 80);
});

test('toBath: 座標なし・私用・閉業は除外の理由を返す', () => {
  assert.deepEqual(toBath({ type: 'way', id: 40, tags: {} }, '05'), { excluded: 'coordinate' });
  assert.deepEqual(toBath(node(41, { access: 'private' }), '05'), { excluded: 'access' });
  assert.deepEqual(toBath(node(42, { disused: 'yes' }), '05'), { excluded: 'disused' });
});

function rawAll(extra = {}) {
  return new Map(PREFECTURE_CODES.map((code) => [code, { osm3s: { timestamp_osm_base: '2026-09-29T00:00:00Z' }, elements: extra[code] ?? [] }]));
}

test('buildBaths: 県の境界で2県に出た施設は、県コードの若い方に1件だけ入れる', () => {
  const shared = node(100, { name: '県境の湯', 'bath:type': 'onsen' });
  const raw = rawAll({ '05': [shared, node(101, { name: '銭湯' })], '06': [shared] });
  raw.get('06').osm3s.timestamp_osm_base = '2026-09-29T04:21:42Z';
  const { baths, counts, excluded, byHow, osmBase } = buildBaths(raw);
  assert.deepEqual(baths.map((bath) => [bath.id, bath.pref]), [['n100', '05'], ['n101', '05']]);
  assert.equal(excluded.duplicate, 1);
  assert.deepEqual(counts['05'], { onsen: 1, sento: 1, super: 0, foot: 0, other: 0 });
  assert.deepEqual(counts['06'], { onsen: 0, sento: 0, super: 0, foot: 0, other: 0 });
  assert.deepEqual(byHow, { tag: 1, name: 1, none: 0 });
  assert.equal(osmBase, '2026-09-29T04:21:42Z');
});

test('buildBaths: 除外を数え、県の中は種類+番号の文字列順に並べる', () => {
  const raw = rawAll({
    13: [way(5), node(9), node(10), node(11, { access: 'no' }), node(12, { abandoned: 'yes' }), { type: 'node', id: 13, tags: {} }],
  });
  const { baths, excluded, counts } = buildBaths(raw);
  assert.deepEqual(baths.map((bath) => bath.id), ['n10', 'n9', 'w5']);
  assert.deepEqual(excluded, { coordinate: 1, access: 1, disused: 1, duplicate: 0, sameName: 0 });
  assert.equal(counts['13'].other, 3);
  // 47県すべてに0の件数が入る（Object.keys ではなく県コードの並びで作る）
  assert.deepEqual(Object.keys(counts).length, 47);
});

// 秋田駅のあたり。北へ 0.0001° ≒ 11m
const near = (bath, meters) => ({ ...bath, lat: Number((bath.lat + meters / 111_195).toFixed(6)) });
const base = { pref: '05', lat: 39.7176, lng: 140.1305 };

test('metersBetween: 緯度0.001°の差は約111m、同じ点は0m', () => {
  assert.equal(metersBetween(base, base), 0);
  const distance = metersBetween(base, { ...base, lat: base.lat + 0.001 });
  assert.ok(Math.abs(distance - 111.2) < 0.5, `${distance}`);
  assert.ok(Math.abs(metersBetween(base, near(base, 25)) - 25) < 0.5);
});

test('mergeSameName: 同じ県・同じ名前で25m以内の点と建物の輪郭は1件にまとめる', () => {
  const point = { ...base, id: 'n1', t: 'onsen', how: 'name', name: '駅前温泉' };
  const outline = { ...near(base, 20), id: 'w9', t: 'onsen', how: 'name', name: '駅前温泉', oh: '10:00-22:00', fee: 'yes' };
  const { baths, merged } = mergeSameName([outline, point]);
  assert.equal(merged, 1);
  assert.equal(baths.length, 1);
  // 根拠が同じなら点（n）を残し、残す側に無い営業時間・料金はまとめた側から補う
  assert.deepEqual(baths[0], { ...point, oh: '10:00-22:00', fee: 'yes' });
});

test('mergeSameName: 残す側は種類の根拠（登録あり→名前→なし）、次に点→輪郭→リレーションの順', () => {
  const tagged = { ...near(base, 30), id: 'w5', t: 'onsen', how: 'tag', name: '湯の宿' };
  const byName = { ...base, id: 'n2', t: 'onsen', how: 'name', name: '湯の宿', air: true };
  const relation = { ...near(base, 10), id: 'r3', t: 'onsen', how: 'name', name: '湯の宿', oh: '9:00-20:00' };
  const { baths, merged } = mergeSameName([byName, relation, tagged]);
  assert.equal(merged, 2);
  assert.equal(baths[0].id, 'w5');
  assert.equal(baths[0].how, 'tag');
  // 残す側に無い項目だけを補う（露天・営業時間）
  assert.equal(baths[0].air, true);
  assert.equal(baths[0].oh, '9:00-20:00');
  const ways = mergeSameName([{ ...near(base, 5), id: 'r1', t: 'other', how: 'none', name: 'A' }, { ...base, id: 'w1', t: 'other', how: 'none', name: 'A' }]);
  assert.equal(ways.baths[0].id, 'w1');
});

test('mergeSameName: 100m以上離れた同じ名前・名前の無いもの・別の県は、まとめない', () => {
  const one = { ...base, id: 'n1', t: 'onsen', how: 'name', name: '鶴の湯' };
  const far = { ...near(base, 150), id: 'n2', t: 'onsen', how: 'name', name: '鶴の湯' };
  assert.equal(mergeSameName([one, far]).baths.length, 2);
  assert.equal(mergeSameName([one, far]).merged, 0);
  const unnamed = [{ ...base, id: 'n3', t: 'other', how: 'none' }, { ...near(base, 5), id: 'w3', t: 'other', how: 'none' }];
  assert.equal(mergeSameName(unnamed).baths.length, 2);
  const otherPref = { ...near(base, 5), id: 'n4', pref: '03', t: 'onsen', how: 'name', name: '鶴の湯' };
  assert.equal(mergeSameName([one, otherPref]).baths.length, 2);
  // 同名が3つ並んでも、残す側から100m以内のものだけを吸う（遠いものは別の1件として残る）
  const trio = mergeSameName([one, { ...near(base, 40), id: 'w8', t: 'onsen', how: 'name', name: '鶴の湯' }, far]);
  assert.deepEqual(trio.baths.map((bath) => bath.id), ['n1', 'n2']);
  // 並びは元の順のまま
  assert.deepEqual(mergeSameName([far, one]).baths.map((bath) => bath.id), ['n2', 'n1']);
});

test('buildBaths: 点と輪郭の二重登録は、県ごとの件数に入れる前にまとめて数える', () => {
  const raw = rawAll({ '05': [node(1, { name: '駅前温泉', 'bath:type': 'onsen' }), way(2, { name: '駅前温泉' }, { lat: 39.717612345 + 0.0001, lon: 140.130551234 })] });
  const { baths, counts, excluded } = buildBaths(raw);
  assert.deepEqual(baths.map((bath) => bath.id), ['n1']);
  assert.equal(excluded.sameName, 1);
  assert.equal(counts['05'].onsen, 1);
});

test('buildBaths: どれか1県でも生データが無いと止まる', () => {
  const raw = rawAll();
  raw.delete('47');
  assert.throws(() => buildBaths(raw), /JP-47 の生データがありません/);
  const broken = rawAll();
  broken.set('05', { elements: null });
  assert.throws(() => buildBaths(broken), /JP-05/);
});

test('fetch-osm: 47県のコードと、部分結果を失敗として扱う確認', () => {
  assert.equal(PREFECTURE_CODES.length, 47);
  assert.equal(PREFECTURE_CODES[0], '01');
  assert.equal(PREFECTURE_CODES[46], '47');
  assert.match(queryFor('05'), /"ISO3166-2"="JP-05"/);
  assert.match(queryFor('05'), /\["amenity"="public_bath"\]/);
  assert.deepEqual(assertComplete({ elements: [] }), { elements: [] });
  assert.throws(() => assertComplete({ elements: [], remark: 'runtime error: Query timed out' }), /部分結果/);
  assert.throws(() => assertComplete({}), /elements/);
});
