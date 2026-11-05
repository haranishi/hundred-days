import { test } from 'node:test';
import assert from 'node:assert/strict';
import { point, facility, distanceMeters, walkMinutes, recommend, mapsUrl, categoryLabel } from '../lib/recommend.js';
import { QUESTIONS, COMPANIONS, completeAnswers } from '../lib/choices.js';

const center = { lat: 35.68, lng: 139.76 };
const answers = { mood: 'cafe', genre: 'drinks', dish: 'coffee', space: 'quiet', walk: 'near' };
const forMood = (mood) => ({ ...answers, mood, ...({ meal: { genre: 'rice', dish: 'teishoku' }, drink: { genre: 'alcohol', dish: 'cocktail' } }[mood] || {}) });
const place = (name, offset = 0.0005, category = 'cafe', extra = {}) => ({
  name, lat: center.lat + offset, lng: center.lng, category, address: '試験市 テスト町1-1', ...extra,
});

test('質問が気分4択、空間2択、距離2択、同行者4択になっている', () => {
  assert.deepEqual(QUESTIONS.map((question) => question.choices.length), [4, 2, 2]);
  assert.equal(COMPANIONS.length, 4);
  assert.equal(completeAnswers(answers), true);
  for (const key of ['mood', 'space', 'walk']) assert.equal(completeAnswers({ ...answers, [key]: 'invalid' }), false);
});
for (const value of [null, {}, { lat: '', lng: '' }, { lat: null, lng: false }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: Infinity, lng: 0 }, { lat: 'no', lng: 1 }]) {
  test(`無効な座標を拒否する: ${JSON.stringify(value)}`, () => assert.equal(point(value), null));
}
test('数値文字列の座標を正規化し、赤道・日付変更線も扱う', () => {
  assert.deepEqual(point({ lat: '35.68', lng: '139.76' }), center);
  assert.deepEqual(point({ lat: 0, lng: -180 }), { lat: 0, lng: -180 });
});
test('距離は同一点0m、南北0.001度で約111m、対称になる', () => {
  const b = { ...center, lat: center.lat + 0.001 };
  assert.equal(distanceMeters(center, center), 0);
  assert.ok(Math.abs(distanceMeters(center, b) - 111.195) < 0.01);
  assert.equal(distanceMeters(center, b), distanceMeters(b, center));
});
test('徒歩時間は迂回係数1.3、毎分80m、切上げ、最低1分', () => {
  assert.equal(walkMinutes(0), 1);
  assert.equal(walkMinutes(180), 3);
  assert.equal(walkMinutes(600), 10);
});
test('名前なしと町丁目以下の粗い位置を候補にしない', () => {
  assert.equal(facility(place('')), null);
  assert.equal(facility(place('遠い精度', 0, 'cafe', { level: 3 })), null);
  assert.equal(facility(place('詳細な精度', 0, 'cafe', { level: 8 })).name, '詳細な精度');
});
test('近場と散歩で半径を厳守し、APIの遠方の完全一致を落とす', () => {
  const values = [place('近い', .00161), place('近場の外', .00163), place('散歩圏', .00539), place('散歩圏の外', .00541), place('遠方の同名', 1)];
  assert.deepEqual(recommend(values, center, answers, 'solo').map((p) => p.name), ['近い']);
  assert.deepEqual(recommend(values, center, { ...answers, walk: 'stroll' }, 'solo').map((p) => p.name), ['近い', '近場の外', '散歩圏']);
});
test('徒歩圏の候補は近い順を基本に最大3軒に絞る', () => {
  const values = [place('4', .0014), place('2', .0007), place('1', .0003), place('3', .001)];
  assert.deepEqual(recommend(values, center, answers).map((p) => p.name), ['1', '2', '3']);
});
test('表記ゆれした同一店の重複を落とし、離れた同名店は残す', () => {
  const values = [place('Ｃａｆｅ　テスト', .0001), place('Cafe テスト', .00011), place('Cafe テスト', .0011)];
  assert.equal(recommend(values, center, answers).length, 2);
});
for (const [mood, values, expected] of [
  ['cafe', [place('薬局', 0, 'medical'), place('テストカフェ', .0001), place('喫茶テスト', .0002, 'restaurant')], ['テストカフェ', '喫茶テスト']],
  ['meal', [place('居酒屋テスト', 0, 'restaurant'), place('テスト食堂', .0001, 'restaurant'), place('ラーメンテスト', .0002, 'unknown')], ['テスト食堂']],
  ['drink', [place('カクテル酒場', .0001, 'bar_izakaya'), place('カクテルバー', .0002, 'restaurant'), place('テストカフェ', 0)], ['カクテル酒場', 'カクテルバー']],
  ['outside', [place('テスト公園', .0001, 'tourism'), place('公園前駅', 0, 'station'), place('公園前薬局', 0, 'medical'), place('公園管理事務所', 0, 'public_facility')], ['テスト公園']],
]) {
  test(`${mood}の候補に無関係な施設を混ぜない`, () => {
    assert.deepEqual(recommend(values, center, forMood(mood)).map((p) => p.name), expected);
  });
}
test('空間の選択で同じ距離のカフェとベーカリーの優先を変える', () => {
  const values = [place('ベーカリーテスト', .0001, 'bakery'), place('パンカフェテスト', .0001, 'cafe')];
  const bread = { ...answers, genre: 'light', dish: 'bread' };
  assert.equal(recommend(values, center, bread)[0].name, 'パンカフェテスト');
  assert.equal(recommend(values, center, { ...bread, space: 'lively' })[0].name, 'ベーカリーテスト');
});
test('家族・パートナーは同程度の距離で飲食店をファストフードより優先する', () => {
  const values = [place('定食ファストフード', .0001, 'fast_food'), place('食堂テスト', .0001, 'restaurant')];
  const a = { ...forMood('meal'), space: 'lively' };
  assert.equal(recommend(values, center, a, 'friends')[0].name, '定食ファストフード');
  assert.equal(recommend(values, center, a, 'family')[0].name, '食堂テスト');
});
test('不正な回答・場所では候補を返さない', () => {
  assert.deepEqual(recommend([place('テスト')], center, {}), []);
  assert.deepEqual(recommend([place('テスト')], null, answers), []);
});
test('帰属情報を施設と一緒に保持する', () => {
  const value = place('テスト', 0, 'cafe', { licenses: ['CC0-1.0'], attributions: ['試験用の出典'] });
  const result = recommend([value], center, answers)[0];
  assert.deepEqual(result.licenses, value.licenses);
  assert.deepEqual(result.attributions, value.attributions);
});
test('地図URLには目的地と徒歩指定だけを含み、現在地・回答を含めない', () => {
  const url = new URL(mapsUrl(place('テスト')));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('travelmode'), 'walking');
  assert.equal(url.searchParams.get('destination'), '35.6805,139.76');
  assert.equal(url.searchParams.has('origin'), false);
  assert.throws(() => mapsUrl({ lat: 'bad', lng: 1 }), TypeError);
  assert.equal(categoryLabel({ category: 'unknown' }, 'outside'), '種類不明');
});

test('ハンバーグ・ハンバーガー・バーミヤンを酒場へ誤分類しない', () => {
  const values = [place('試験ハンバーガー店', .0001, 'fast_food'), place('試験ハンバーグ食堂', .0002, 'restaurant'), place('バーミヤン 試験店', .0003, 'restaurant')];
  assert.equal(recommend(values, center, { ...answers, genre: 'light', dish: 'burger' })[0].name, '試験ハンバーガー店');
  assert.equal(recommend(values, center, { ...answers, mood: 'meal', genre: 'meat', dish: 'hamburg' })[0].name, '試験ハンバーグ食堂');
  assert.equal(recommend(values, center, forMood('drink')).length, 0);
});
