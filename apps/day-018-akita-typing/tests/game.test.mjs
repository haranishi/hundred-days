import test from 'node:test';
import assert from 'node:assert/strict';

import { PLATES_ON_BELT, RUSH_GAP_MS, createGame } from '../lib/game.js';
import { courseById } from '../lib/dishes.js';
import { primaryRomaji } from '../lib/romaji.js';

const ONE_DISH = [{ name: 'ぎばさ', reading: 'ぎばさ', note: '' }];

/* 皿の出る順は山を切って決まるので、どの料理が来るかを決め打ちしない。
   いま出ている皿のよみからローマ字を組み立てて打つ */
function eatActive(game, now = 0) {
  const plate = game.active();
  for (const key of primaryRomaji(plate.dish.reading)) game.press(key, now);
  return plate;
}

/** 乱数を固定して、毎回同じ順で皿が出るようにする */
const fixedRandom = () => 0.5;

function makeGame(dishes = ONE_DISH, courseId = 'standard') {
  return createGame({
    course: courseById(courseId),
    dishes,
    duration: 60_000,
    random: fixedRandom
  });
}

test('始めると皿が1枚出ていて、それが打つ的になる', () => {
  const g = makeGame();
  g.start(0);
  assert.equal(g.plates.length, 1);
  assert.equal(g.active().dish.reading, 'ぎばさ');
});

test('打ち切ると食べたことになり、値段が加算される', () => {
  const g = makeGame();
  g.start(0);
  const price = g.active().price;
  for (const key of 'gibas') assert.equal(g.press(key, 0).kind, 'hit');
  assert.equal(g.press('a', 0).kind, 'ate');
  assert.equal(g.totals.eaten, price);
  assert.equal(g.totals.dishesEaten, 1);
  assert.equal(g.totals.hits, 6);
});

test('間違えるとミスに数え、押してほしかったキーを覚える', () => {
  const g = makeGame();
  g.start(0);
  const res = g.press('x', 0);
  assert.equal(res.kind, 'miss');
  assert.equal(res.expected, 'g');
  assert.equal(g.totals.misses, 1);
  assert.deepEqual(g.missMap, { g: 1 });
  // ミスしても位置は戻らない
  assert.equal(g.press('g', 0).kind, 'hit');
});

test('左端まで流れた皿は取りこぼしになり、次の皿が的になる', () => {
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'ぶりこ', reading: 'ぶりこ', note: '' }
  ]);
  g.start(0);
  const travel = courseById('standard').interval * PLATES_ON_BELT;
  const first = g.active();
  g.tick(travel + 1);
  assert.equal(first.state, 'missed');
  assert.equal(g.totals.dishesMissed, 1);
  assert.notEqual(g.active()?.id, first.id);
});

test('投入間隔ごとに皿が増える', () => {
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'ぶりこ', reading: 'ぶりこ', note: '' },
    { name: 'とんぶり', reading: 'とんぶり', note: '' }
  ]);
  const course = courseById('standard');
  g.start(0);
  assert.equal(g.plates.length, 1);
  g.tick(course.interval);
  assert.equal(g.plates.length, 2);
  g.tick(course.interval * 2);
  assert.equal(g.plates.length, 3);
});

test('打つ的はいちばん左（先に出た皿）', () => {
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'ぶりこ', reading: 'ぶりこ', note: '' }
  ]);
  const course = courseById('standard');
  g.start(0);
  const first = g.active();
  g.tick(course.interval);
  assert.equal(g.plates.length, 2);
  assert.equal(g.active().id, first.id);
});

test('走行時間は投入間隔のちょうど4枚ぶん（ベルトの詰まり方がコースで変わらない）', () => {
  for (const id of ['light', 'standard', 'heavy']) {
    const course = courseById(id);
    const g = createGame({ course, dishes: ONE_DISH, duration: 60_000, random: fixedRandom });
    assert.equal(g.travelMs, course.interval * PLATES_ON_BELT);
  }
});

test('もうすぐ流れ切る皿だけ警告する（打ち始めた皿は警告しない）', () => {
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'ぶりこ', reading: 'ぶりこ', note: '' }
  ]);
  const course = courseById('standard');
  const travel = course.interval * PLATES_ON_BELT;
  g.start(0);
  const plate = g.active();

  assert.equal(g.isExpiring(plate, 0), false, '出た直後に警告している');
  assert.equal(g.isExpiring(plate, travel - 500), true, '流れ切る直前に警告していない');

  // 1打でも入れれば消えないので、警告する意味がない
  g.press(primaryRomaji(plate.dish.reading)[0], travel - 500);
  assert.equal(g.isExpiring(plate, travel - 500), false, '打ち始めた皿に警告している');
});

test('制限時間で終わる', () => {
  const g = makeGame();
  g.start(0);
  assert.equal(g.isOver(59_999), false);
  assert.equal(g.isOver(60_000), true);
  assert.equal(g.remaining(45_000), 15_000);
});

test('同じ料理が続けて出ない（山を配り切るまで重複しない）', () => {
  const dishes = [
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'ぶりこ', reading: 'ぶりこ', note: '' },
    { name: 'とんぶり', reading: 'とんぶり', note: '' }
  ];
  const g = makeGame(dishes);
  const course = courseById('standard');
  g.start(0);
  for (let i = 1; i <= 2; i += 1) g.tick(course.interval * i);
  const readings = g.plates.map((p) => p.dish.reading);
  assert.equal(new Set(readings).size, 3);
});

test('レーンが空になったら投入間隔を待たずに次の皿を出す', () => {
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'ぶりこ', reading: 'ぶりこ', note: '' }
  ]);
  const course = courseById('standard');
  g.start(0);
  eatActive(g);
  assert.equal(g.active(), null);

  // 間隔（2秒前後）より早く、しかし即座でもないタイミングで次が出る
  g.tick(RUSH_GAP_MS - 1);
  assert.equal(g.active(), null);
  g.tick(RUSH_GAP_MS);
  assert.ok(g.active());
  assert.ok(RUSH_GAP_MS < course.interval);
});

test('まだ皿が残っているうちは間隔を待つ（急いで出して重ねない）', () => {
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'ぶりこ', reading: 'ぶりこ', note: '' },
    { name: 'とんぶり', reading: 'とんぶり', note: '' }
  ]);
  const course = courseById('standard');
  g.start(0);
  g.tick(course.interval);
  assert.equal(g.plates.length, 2);
  // 1枚食べても、もう1枚残っているので急がない
  eatActive(g, course.interval);
  assert.equal(g.totals.dishesEaten, 1);
  g.tick(course.interval + RUSH_GAP_MS);
  assert.equal(g.plates.length, 2);
});

test('打つ皿が無いときの打鍵はミスに数えない', () => {
  const g = makeGame();
  g.start(0);
  eatActive(g);
  // 1枚しか出ていない状態で食べ切ったので、次の投入まで的が無い
  assert.equal(g.press('z', 10).kind, 'idle');
  assert.equal(g.totals.misses, 0);
});
