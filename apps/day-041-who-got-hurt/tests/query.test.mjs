import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceM } from '../lib/geo.js';
import { F_BIKE, F_CROSS, F_DEATH, F_ELDER, F_MOTOR, F_WALKER } from '../lib/pack.js';
import {
  clusterSpots, filterWho, hourBand, iconOf, shapeOf, summarize, whoMask, withinRadius,
} from '../lib/query.js';

const HERE = { lat: 35.681236, lng: 139.767125 };
const north = (m, extra = {}) => ({ lat: HERE.lat + m / 111320, lng: HERE.lng, year: 2021, hour: 8, flags: 0, ...extra });

test('半径の内側は境界ちょうどを含み、そのすぐ外は落ちる', () => {
  const record = north(500);
  const exact = distanceM(HERE, record);
  assert.equal(withinRadius([record], HERE, exact).length, 1);
  assert.equal(withinRadius([record], HERE, exact - 1e-9).length, 0);
  // 距離を添えて返す
  assert.ok(Math.abs(withinRadius([record], HERE, 600)[0].distance - exact) < 1e-9);
});

test('半径300mと1kmで拾う件数が変わる', () => {
  const records = [north(100), north(299), north(301), north(900), north(1100)];
  assert.equal(withinRadius(records, HERE, 300).length, 2);
  assert.equal(withinRadius(records, HERE, 500).length, 3);
  assert.equal(withinRadius(records, HERE, 1000).length, 4);
});

test('メッシュをまたいだ2ファイルぶんを混ぜても、半径だけで決まる', () => {
  // 別ファイル（別メッシュ）から来た記録も、同じ配列に入れて同じ条件で切る
  const fromA = [north(100), north(200)];
  const fromB = [{ ...north(150), lng: HERE.lng + 0.0001 }, north(4000)];
  const near = withinRadius([...fromA, ...fromB], HERE, 300);
  assert.equal(near.length, 3);
  assert.ok(near.every((record) => record.distance <= 300));
});

test('「誰が」の絞り込みはフラグで決まる', () => {
  const records = [
    north(10, { flags: F_WALKER }),
    north(20, { flags: F_BIKE }),
    north(30, { flags: F_WALKER | F_ELDER }),
    north(40, { flags: F_MOTOR }),
  ];
  assert.equal(filterWho(records, 'all').length, 4);
  assert.equal(filterWho(records, 'walker').length, 2);
  assert.equal(filterWho(records, 'bike').length, 1);
  assert.equal(filterWho(records, 'elder').length, 1);
  assert.equal(whoMask('all'), 0);
  assert.equal(whoMask('ぬるぽ'), 0);
});

test('歩行者かつ半径300m、のように掛け合わせても件数が合う', () => {
  const records = [
    north(100, { flags: F_WALKER }),
    north(250, { flags: F_WALKER | F_DEATH }),
    north(280, { flags: F_BIKE }),
    north(400, { flags: F_WALKER }),
  ];
  const near = filterWho(withinRadius(records, HERE, 300), 'walker');
  assert.equal(near.length, 2);
  assert.deepEqual(summarize(near), { total: 2, walker: 2, bike: 0, elder: 0, death: 1 });
  // 順番を入れ替えても同じ
  const other = withinRadius(filterWho(records, 'walker'), HERE, 300);
  assert.equal(other.length, 2);
});

test('内訳は歩行者・自転車・65歳以上・死亡をそれぞれ数える', () => {
  const records = [
    north(10, { flags: F_WALKER | F_ELDER }),
    north(20, { flags: F_BIKE | F_DEATH }),
    north(30, { flags: F_WALKER | F_BIKE }),
    north(40, { flags: 0 }),
  ];
  assert.deepEqual(summarize(records), { total: 4, walker: 2, bike: 2, elder: 1, death: 1 });
  assert.deepEqual(summarize([]), { total: 0, walker: 0, bike: 0, elder: 0, death: 0 });
});

test('約40mの近さは同じ地点、離れれば別の地点になる', () => {
  const spots = clusterSpots([north(0), north(22), north(33), north(56)], HERE);
  assert.equal(spots.length, 2);
  assert.equal(spots[0].count, 3);
  assert.equal(spots[1].count, 1);
  // まとめる距離を狭めれば別々になる
  assert.equal(clusterSpots([north(0), north(22), north(33), north(56)], HERE, { reachM: 10 }).length, 4);
});

test('地点は件数の多い順。同数なら近いほうが先', () => {
  const far = (m, extra) => ({ ...north(m), ...extra });
  const records = [
    far(100), far(110), far(120), /* 3件・100m付近 */
    far(500), far(510), /* 2件・500m付近 */
    far(300), /* 1件 */
  ];
  const spots = clusterSpots(records, HERE);
  assert.deepEqual(spots.map((spot) => spot.count), [3, 2, 1]);
  assert.ok(spots[0].distance < spots[1].distance);
  // 上位は既定で5件まで
  const many = Array.from({ length: 12 }, (_, i) => north(i * 200));
  assert.equal(clusterSpots(many, HERE).length, 5);
  assert.equal(clusterSpots(many, HERE, { limit: 3 }).length, 3);
  assert.deepEqual(clusterSpots([], HERE), []);
});

test('地点は交差点かどうかと、誰が巻き込まれたかを持つ', () => {
  const spots = clusterSpots([
    north(0, { flags: F_CROSS | F_WALKER }),
    north(20, { flags: F_CROSS }),
    north(30, { flags: F_BIKE | F_DEATH }),
  ], HERE);
  assert.equal(spots.length, 1);
  assert.equal(spots[0].crossing, true);
  assert.deepEqual([spots[0].walker, spots[0].bike, spots[0].death], [1, 1, 1]);
  // 交差点が半数に満たなければ添えない
  const few = clusterSpots([north(0, { flags: F_CROSS }), north(20), north(30)], HERE);
  assert.equal(few[0].crossing, false);
});

test('時刻の帯は0〜23時だけ。時刻不明（24）は混ぜず、別に数える', () => {
  const band = hourBand([
    north(0, { hour: 8 }), north(10, { hour: 8 }), north(20, { hour: 8 }),
    north(30, { hour: 17 }), north(40, { hour: 0 }), north(50, { hour: 23 }),
    north(60, { hour: 24 }), north(70, { hour: 24 }),
  ]);
  assert.equal(band.hours.length, 24);
  assert.equal(band.hours.reduce((sum, n) => sum + n, 0), 6);
  assert.equal(band.hours[8], 3);
  assert.equal(band.hours[0], 1);
  assert.equal(band.hours[23], 1);
  assert.equal(band.unknown, 2);
  assert.equal(band.known, 6);
  assert.equal(band.peak, 8);
  assert.equal(band.max, 3);
});

test('1件も無いときの帯は、いちばん多い時刻を持たない', () => {
  const band = hourBand([]);
  assert.equal(band.peak, -1);
  assert.equal(band.max, 0);
  assert.equal(band.unknown, 0);
  assert.equal(hourBand([north(0, { hour: 24 })]).peak, -1);
});

test('ピンの形は歩行者＝丸・自転車＝ひし形・そのほか＝点。死亡は縁取りが付く', () => {
  assert.equal(shapeOf({ flags: F_WALKER }), 'walker');
  assert.equal(shapeOf({ flags: F_BIKE }), 'bike');
  assert.equal(shapeOf({ flags: F_MOTOR }), 'other');
  assert.equal(shapeOf({ flags: 0 }), 'other');
  // 歩行者と自転車の両方が関わった事故は歩行者の形にする
  assert.equal(shapeOf({ flags: F_WALKER | F_BIKE }), 'walker');
  assert.equal(iconOf({ flags: F_WALKER }), 'walker');
  assert.equal(iconOf({ flags: F_WALKER | F_DEATH }), 'walker-death');
  assert.equal(iconOf({ flags: F_DEATH }), 'other-death');
});
