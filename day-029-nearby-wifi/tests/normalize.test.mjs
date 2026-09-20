import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, chainMessage, chainStatus, displayName, feeClass, mapsUrl, sortByDistance, summarize, toSpot } from '../lib/normalize.js';

test('feeClass: fee=noは無料', () => assert.equal(feeClass({ 'internet_access:fee': 'no' }), 'free'));
test('feeClass: customersは来店客向け', () => assert.equal(feeClass({ 'internet_access:fee': 'customers' }), 'customers'));
test('feeClass: yesは有料', () => assert.equal(feeClass({ 'internet_access:fee': 'yes' }), 'paid'));
test('feeClass: feeなしは不明', () => assert.equal(feeClass({ internet_access: 'wlan' }), 'unknown'));
test('feeClass: wifi=freeは無料', () => assert.equal(feeClass({ wifi: 'free' }), 'free'));
test('feeClass: internet_access=noは除外', () => assert.equal(feeClass({ internet_access: 'no', wifi: 'free' }), null));

const categories = [
  [{ amenity: 'cafe' }, 'カフェ'],
  [{ shop: 'convenience' }, 'コンビニ'],
  [{ railway: 'station' }, '駅'],
  [{ public_transport: 'station' }, '駅'],
  [{ amenity: 'library' }, '図書館'],
  [{ tourism: 'hotel' }, '宿'],
  [{ tourism: 'hostel' }, '宿'],
  [{ tourism: 'guest_house' }, '宿'],
  [{ amenity: 'restaurant' }, '飲食店'],
  [{ amenity: 'fast_food' }, 'ファストフード'],
  [{ amenity: 'townhall' }, '公共施設'],
  [{ amenity: 'community_centre' }, '公共施設'],
  [{ amenity: 'public_building' }, '公共施設'],
  [{ amenity: 'bank' }, '銀行'],
  [{ shop: 'books' }, '店'],
  [{ office: 'company' }, 'オフィス'],
  [{ leisure: 'park' }, 'その他'],
];
for (const [tags, expected] of categories) {
  test(`categoryOf: ${JSON.stringify(tags)} → ${expected}`, () => assert.equal(categoryOf(tags), expected));
}

test('displayName: name:ja→name→brand→種類名→名前なしの順', () => {
  assert.equal(displayName({ 'name:ja': '日本語名', name: 'Name', brand: 'Brand' }), '日本語名');
  assert.equal(displayName({ name: 'Name', brand: 'Brand' }), 'Name');
  assert.equal(displayName({ brand: 'Brand' }), 'Brand');
  assert.equal(displayName({ amenity: 'library' }), '図書館');
  assert.equal(displayName({}), '名前なし');
});

test('toSpot: nodeを必要な形へ正規化', () => {
  assert.deepEqual(toSpot({ type: 'node', id: 7, lat: 39.7, lon: 140.1, tags: {
    name: 'A', amenity: 'cafe', 'internet_access:fee': 'no', 'internet_access:ssid': 'A Wi-Fi', opening_hours: '24/7',
  } }), { id: 'node/7', name: 'A', category: 'カフェ', fee: 'free', ssid: 'A Wi-Fi', lat: 39.7, lng: 140.1, hours: '24/7' });
});

test('toSpot: way/relationはcenterを使い、座標なしは除外', () => {
  assert.equal(toSpot({ type: 'way', id: 8, center: { lat: 1, lon: 2 }, tags: {} }).lng, 2);
  assert.equal(toSpot({ type: 'relation', id: 9, tags: {} }), null);
});

test('sortByDistance: 距離を付けて近い順', () => {
  const spots = sortByDistance([{ id: 'far', lat: 39.72, lng: 140.1 }, { id: 'near', lat: 39.701, lng: 140.1 }], { lat: 39.7, lng: 140.1 });
  assert.deepEqual(spots.map((spot) => spot.id), ['near', 'far']);
  assert.ok(spots[0].distance < spots[1].distance);
});

test('mapsUrl: 座標検索を小数5桁で作る', () => {
  assert.equal(mapsUrl(39.717612, 140.130554), 'https://www.google.com/maps/search/?api=1&query=39.71761,140.13055');
});

test('summarize: 3層を集計', () => {
  assert.deepEqual(summarize([{ layer: 'municipal' }, { layer: 'osm' }, { layer: 'osm' }, { layer: 'chain' }]),
    { total: 4, municipal: 1, osm: 2, chain: 1 });
});

test('chainMessage: allはブランドを主語に確認日と未確認を示す', () => {
  const chain = { label: 'ガスト', tier: 'all', checkedAt: '2026-09-04', condition: '登録不要' };
  assert.equal(chainStatus(chain), '公式に全店規模で案内');
  assert.equal(chainMessage(chain), 'ガストは公式サイトで無料Wi-Fiを案内しています（2026-09-04時点）。登録不要。ただし、この地点で実際に使えるかは確認していません');
});

test('chainMessage: partialは一部店舗でと明記する', () => {
  const chain = { label: '喫茶店', tier: 'partial', checkedAt: '2026-09-04', condition: 'ログインが必要' };
  assert.equal(chainStatus(chain), '一部店舗・条件つき');
  assert.match(chainMessage(chain), /^喫茶店は公式サイトで一部店舗で無料Wi-Fiを案内しています/);
});
