import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOOD_GROUPS, selectedDish, dishMatchScore } from '../lib/food.js';
import { questionsFor, chooseAnswer, completeAnswers, searchQuery } from '../lib/choices.js';
import { recommend, mapsSearchUrl, categoryLabel } from '../lib/recommend.js';

const ramen = { mood: 'meal', genre: 'noodles', dish: 'ramen', space: 'quiet', walk: 'near' };
const center = { lat: 35.68, lng: 139.76 };
const place = (name, offset = .0005, category = 'restaurant') => ({ name, category, lat: center.lat + offset, lng: center.lng });

test('食事は気分→ジャンル→具体的な料理→空間→徒歩圏に進む', () => {
  assert.deepEqual(questionsFor(ramen).map(q => q.id), ['mood', 'genre', 'dish', 'space', 'walk']);
  assert.deepEqual(questionsFor(ramen)[2].choices.map(c => c.label), ['ラーメン', 'うどん', 'そば', 'パスタ']);
});
let leaves = 0;
for (const [mood, groups] of Object.entries(FOOD_GROUPS)) for (const group of groups) for (const dish of group.dishes) {
  leaves++;
  test(`${mood}→${group.label}→${dish.label}で回答を完了し、料理名で検索できる`, () => {
    const answers = { ...ramen, mood, genre: group.id, dish: dish.id };
    assert.equal(questionsFor(answers).length, 5);
    assert.equal(completeAnswers(answers), true);
    assert.equal(selectedDish(answers).label, dish.label);
    assert.equal(searchQuery(answers), dish.query);
    assert.ok(dish.query.length > 0);
  });
}
assert.equal(leaves, 36);
test('外でリフレッシュは食事を尋ねず3問で完了する', () => {
  const answers = { mood: 'outside', space: 'quiet', walk: 'near' };
  assert.deepEqual(questionsFor(answers).map(q => q.id), ['mood', 'space', 'walk']);
  assert.equal(completeAnswers(answers), true);
});
test('気分を変えるとジャンル・料理だけを消し、空間と距離は保持する', () => {
  assert.deepEqual(chooseAnswer(ramen, 'mood', 'cafe'), { mood: 'cafe', space: 'quiet', walk: 'near' });
  assert.deepEqual(chooseAnswer(ramen, 'mood', 'outside'), { mood: 'outside', space: 'quiet', walk: 'near' });
  assert.equal(ramen.dish, 'ramen');
});
test('ジャンルを変えると料理を消し、同じ回答なら保持する', () => {
  assert.deepEqual(chooseAnswer(ramen, 'genre', 'fish'), { mood: 'meal', genre: 'fish', space: 'quiet', walk: 'near' });
  assert.deepEqual(chooseAnswer(ramen, 'genre', 'noodles'), ramen);
});
test('別のジャンルの料理や未完了の回答は検索できない', () => {
  for (const answers of [{ ...ramen, dish: 'sushi' }, { ...ramen, genre: 'fish' }, { ...ramen, dish: '' }]) {
    assert.equal(completeAnswers(answers), false);
    assert.equal(searchQuery(answers), '');
  }
  assert.deepEqual(chooseAnswer(ramen, 'dish', 'sushi'), ramen);
});
test('ラーメンを選ぶと寿司を除き、料理名に合う店を優先する', () => {
  const values = [place('近くの寿司店', .00001), place('夜食亭', .0001), place('ラーメン試験', .001)];
  assert.deepEqual(recommend(values, center, ramen).map(p => p.name), ['ラーメン試験', '夜食亭']);
  assert.deepEqual(recommend(values, center, { ...ramen, genre: 'fish', dish: 'sushi' }).map(p => p.name), ['近くの寿司店', '夜食亭']);
});
test('料理に合う店がなければ、別の料理を出さず0件にする', () => {
  assert.deepEqual(recommend([place('寿司試験'), place('ステーキ試験')], center, ramen), []);
});
test('パンケーキは一般のカフェ表記がなくても候補になり、パンやケーキと混同しない', () => {
  const pancake = { ...ramen, mood: 'cafe', genre: 'sweets', dish: 'pancake' };
  const values = [place('幸せのパンケーキ 試験店', .0001), place('試験ベーカリー', .00001, 'bakery')];
  assert.deepEqual(recommend(values, center, pancake).map(p => p.name), ['幸せのパンケーキ 試験店']);
  assert.equal(dishMatchScore(place('pancake cafe'), { ...pancake, dish: 'cake' }), 0);
  assert.equal(dishMatchScore(place('幸せのパンケーキ'), { ...pancake, genre: 'light', dish: 'bread' }), 0);
});
test('0件時の地図検索にも同じ料理と検索中心を渡す', () => {
  const url = new URL(mapsSearchUrl(center, ramen));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('query'), 'ラーメン near 35.68,139.76');
  assert.throws(() => mapsSearchUrl({}, ramen), TypeError);
});

test('蕎麦を選んだら中華そば・焼きそば・油そばで3枠を埋めない', () => {
  const values = [place('中華そば 試験店', .00001), place('焼きそば 試験店', .00002), place('油そば 試験店', .00003), place('蕎麦 試験店', .001)];
  const answers = { ...ramen, dish: 'soba' };
  assert.deepEqual(recommend(values, center, answers).map(p => p.name), ['蕎麦 試験店']);
  for (const name of ['Chuka soba', 'Yakisoba', 'Aburasoba', 'まぜそば', '沖縄そば']) assert.equal(dishMatchScore(place(name), answers), 0);
});
test('紅茶のteaはSTEAK HOUSEに一致せず、ビールはビアードパパに一致しない', () => {
  const tea = { ...ramen, mood: 'cafe', genre: 'drinks', dish: 'tea' };
  const beer = { ...ramen, mood: 'drink', genre: 'alcohol', dish: 'beer' };
  assert.equal(dishMatchScore(place('STEAK HOUSE'), tea), 0);
  assert.equal(dishMatchScore(place('Tea House'), tea), 2);
  assert.equal(dishMatchScore(place('ビアードパパ', .0001, 'bakery'), beer), 0);
  assert.equal(dishMatchScore(place('ビアホール'), beer), 2);
});

test('一杯の候補に酒屋を混ぜず、甘味の食品店は実際のカテゴリを表示する', () => {
  const sake = { ...ramen, mood: 'drink', genre: 'alcohol', dish: 'sake' };
  const wagashi = { ...ramen, mood: 'cafe', genre: 'sweets', dish: 'wagashi' };
  assert.equal(dishMatchScore(place('日本酒専門店', .0001, 'grocery'), sake), 0);
  assert.equal(dishMatchScore(place('和菓子試験店', .0001, 'grocery'), wagashi), 2);
  assert.equal(categoryLabel({ category: 'grocery' }, 'cafe'), '食品店');
  assert.equal(categoryLabel({ category: 'retail_other' }, 'cafe'), '物販店');
  assert.equal(categoryLabel({ category: 'unknown' }, 'meal'), '種類不明');
});

test('中華・支那のそば/蕎麦表記はラーメンへ揃え、蕎麦店へ混ぜない', () => {
  for (const name of ['中華そば 試験店', '中華蕎麦 試験店', '支那そば 試験店', '支那蕎麦 試験店']) {
    assert.equal(dishMatchScore(place(name), ramen), 2, name);
    assert.equal(dishMatchScore(place(name), { ...ramen, dish: 'soba' }), 0, name);
  }
  assert.equal(dishMatchScore(place('蕎麦処 試験店'), { ...ramen, dish: 'soba' }), 2);
});
