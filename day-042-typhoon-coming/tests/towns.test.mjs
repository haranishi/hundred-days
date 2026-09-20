/* 市区町村の引き当て。入力した語も現在地も外へ出さないので、ここが当たらないと何も出ない。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FAR_KM, boxCenter, createTowns, distanceKm, townLabel } from '../lib/towns.js';
import { townsJson } from './fixtures.mjs';

const towns = createTowns(townsJson);
const TOKYO_STATION = { lat: 35.6812, lng: 139.7671 };

test('1805件すべてに読みと地域コードがある', () => {
  assert.equal(towns.count, 1805);
  for (const town of towns.towns) {
    assert.match(town.code, /^\d{7}$/);
    assert.match(town.area, /^\d{6}$/);
    assert.ok(town.kana, `${town.name} に読みが無い`);
    assert.ok(town.pref.endsWith('都') || town.pref.endsWith('道') || town.pref.endsWith('府') || town.pref.endsWith('県'),
      `${town.name} の都道府県名が「${town.pref}」`);
  }
});

test('コードから市区町村と地域を引く', () => {
  assert.equal(towns.get('1310100').name, '千代田区');
  assert.equal(towns.get('0521000').name, '由利本荘市');
  assert.equal(towns.area('130011').name, '２３区西部');
  assert.equal(towns.area('050013').name, '本荘由利地域');
  assert.equal(towns.get('9999999'), null);
});

test('階層をまたいで同じコードが使われても取り違えない（小笠原諸島の130040）', () => {
  /* 130040 は class15s にも class10s にもある。混ぜて引くと都道府県が取れなくなる */
  const town = towns.get('1342100');
  assert.equal(town.name, '小笠原村');
  assert.equal(town.area, '130040');
  assert.equal(towns.area('130040').name, '小笠原諸島');
  assert.equal(town.pref, '東京都');
});

test('北海道・沖縄・鹿児島も都道府県名で出す（気象台の管轄名にしない）', () => {
  assert.equal(towns.towns.find((town) => town.name === '札幌市').pref, '北海道');
  assert.equal(towns.towns.find((town) => town.name === '那覇市').pref, '沖縄県');
  assert.equal(towns.towns.find((town) => town.name === '奄美市').pref, '鹿児島県');
  assert.equal(new Set(towns.towns.map((town) => town.pref)).size, 47);
});

test('現在地は外接矩形で絞り、複数なら矩形の中心がいちばん近いものを採る', () => {
  /* 東京駅は千代田区・中央区・港区の3つの矩形に入る。代表点（市役所など）で比べると
     中央区のほうが近く出るので、矩形の中心で比べる */
  const found = towns.fromPoint(TOKYO_STATION);
  assert.equal(found.name, '千代田区');
  assert.equal(found.code, '1310100');
  assert.equal(towns.fromPoint({ lat: 39.3856, lng: 140.0491 }).name, '由利本荘市');
  assert.equal(towns.fromPoint({ lat: 26.2124, lng: 127.6809 }).name, '那覇市');
});

test('矩形に入らなくても、近い中心があれば拾う', () => {
  /* 秋田県沖の海の上。矩形には入らないが、由利本荘市の中心から50km以内 */
  const found = towns.fromPoint({ lat: 39.35, lng: 139.6 });
  assert.ok(found, '近い市区町村が見つからない');
  assert.ok(distanceKm({ lat: 39.35, lng: 139.6 }, boxCenter(found)) <= FAR_KM);
});

test('日本から遠ければ何も返さない', () => {
  assert.equal(towns.fromPoint({ lat: 37.77, lng: -122.42 }), null, 'サンフランシスコ');
  assert.equal(towns.fromPoint({ lat: 0, lng: 0 }), null);
  assert.equal(towns.fromPoint(null), null);
  assert.equal(towns.fromPoint({ lat: NaN, lng: 139 }), null);
});

test('名前と読みで探す。前方一致が先、最大8件', () => {
  const one = towns.search('由利本荘');
  assert.equal(one.length, 1, '「由利本荘」に当たるのは由利本荘市だけ');
  assert.equal(one[0].code, '0521000');
  assert.equal(towns.search('ゆりほんじょう')[0].code, '0521000');
  /* 半角カナ・カタカナ・全角英数もそろえてから照合する */
  assert.equal(towns.search('ﾕﾘﾎﾝｼﾞｮｳ')[0].code, '0521000');
  assert.equal(towns.search('ユリホンジョウ')[0].code, '0521000');
  /* 「ちよだ」は群馬県千代田町にも当たる。同じ段の中は同梱データの順（北→南）のまま */
  assert.deepEqual(towns.search('ちよだ').map((town) => `${town.name}（${town.pref}）`),
    ['千代田町（群馬県）', '千代田区（東京都）']);
  /* 名前そのものに当たったものは先頭へ */
  assert.equal(towns.search('千代田区')[0].name, '千代田区');
  assert.ok(towns.search('川').length <= 8, '候補は8件まで');
  assert.equal(towns.search('  ').length, 0);
  assert.equal(towns.search('ぬるぽ').length, 0);
});

test('同じ名前の市区町村は都道府県で見分ける', () => {
  const found = towns.search('府中市');
  assert.ok(found.length >= 2, '府中市は東京都と広島県にある');
  const labels = found.map(townLabel);
  assert.ok(labels.includes('府中市（東京都）'));
  assert.ok(labels.includes('府中市（広島県）'));
});

test('地域の並び順は北→南（気象庁のファイル順）', () => {
  assert.ok(towns.areaOrder('011011') < towns.areaOrder('050013'), '宗谷は秋田より北');
  assert.ok(towns.areaOrder('050013') < towns.areaOrder('130011'), '秋田は東京より北');
  assert.ok(towns.areaOrder('130011') < towns.areaOrder('471011'), '東京は沖縄より北');
  assert.equal(towns.areaOrder('999999'), null);
});
