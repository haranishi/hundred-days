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

function makeGame(dishes = ONE_DISH, courseId = 'standard', random = fixedRandom) {
  return createGame({
    course: courseById(courseId),
    dishes,
    duration: 60_000,
    random
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

test('語中のミスは「直前のキー＋押すはずだったキー」で数える', () => {
  /* 単独の `k` では、きりたんぽ・もろこし・ばっけみそ・いぶりがっこ・だまこもち の
     どれで転んだのか分からない。2連接なら `ts` → しょっつる鍋 の tsu と結びつく。 */
  const g = makeGame();
  g.start(0);
  assert.equal(g.press('g', 0).kind, 'hit');
  const res = g.press('x', 0);
  assert.equal(res.kind, 'miss');
  assert.equal(res.expected, 'i');
  assert.deepEqual(g.missMap, { gi: 1 }, '直前のキーが付いていない');

  // 同じ2連接は積み上がる
  g.press('x', 0);
  assert.deepEqual(g.missMap, { gi: 2 });
});

test('語頭のミスは直前が無いので単独キーのまま', () => {
  const g = makeGame();
  g.start(0);
  assert.equal(g.press('x', 0).kind, 'miss');
  assert.deepEqual(g.missMap, { g: 1 });
});

test('食べた料理を順に覚えていて、豆知識を結果画面に出せる', () => {
  const g = makeGame();
  g.start(0);
  assert.deepEqual(g.eatenDishes, []);
  eatActive(g);
  assert.deepEqual(g.eatenDishes.map((d) => d.name), ['ぎばさ']);
});

test('打ち切れずに終わった料理を1つ返す（打ちかけが最優先）', () => {
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'ぶりこ', reading: 'ぶりこ', note: '' }
  ]);
  const travel = courseById('standard').interval * PLATES_ON_BELT;
  g.start(0);
  assert.equal(g.unfinished(), null, '始まった直後から打ち残しがあることになっている');

  // 1打も入れずに流れた皿は「逃した皿」として拾う
  const lost = g.active().dish.reading;
  g.tick(travel + 1);
  assert.equal(g.unfinished().dish.reading, lost);

  // 打ちかけの皿があれば、そちらを優先して残りの綴りも返す
  const plate = g.active();
  g.press(primaryRomaji(plate.dish.reading)[0], travel + 2);
  const left = g.unfinished();
  assert.equal(left.dish.reading, plate.dish.reading);
  assert.equal(left.rest, primaryRomaji(plate.dish.reading).slice(1));
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

/* ---- どの皿から打ち始めるかを選ぶ ----

   このゲームで唯一「プレイヤーが決めること」。的は自動で左端に固定されるが、
   語の1打目なら、ほかの皿に出ている先頭キーを押してそちらから打ち始められる。
   語の途中では移らない——指が隣のキーへずれただけで打ちかけの語が消えないように。 */

/** いま出ている皿を born の順で返す（レーンの左から右の順） */
function ridingPlates(game) {
  return game.plates.filter((p) => p.state === 'riding').sort((a, b) => a.born - b.born);
}

test('語の1打目なら、ほかの皿の先頭キーでそちらから打ち始められる', () => {
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'とんぶり', reading: 'とんぶり', note: '' }
  ]);
  const course = courseById('standard');
  g.start(0);
  g.tick(course.interval);
  const [first, second] = ridingPlates(g);
  assert.equal(g.active().id, first.id);

  const head = primaryRomaji(second.dish.reading)[0];
  assert.equal(g.headKey(second), head);
  assert.notEqual(head, g.headKey(first), '2枚の先頭キーが同じでは選択にならない');

  const res = g.press(head, 20);
  assert.equal(res.kind, 'hit');
  assert.equal(res.switched, true, '皿が入れ替わったことが画面側へ伝わっていない');
  assert.equal(g.active().id, second.id, '先頭キーを押しても的が移らない');
  // 押したキーはそのまま移った先の1打目になる（同じキーを2度押させない）
  assert.equal(second.matcher.typed, head);
  // 1打も入れていない皿を離れるだけなので、捨てる進捗は無い
  assert.equal(first.matcher.typed, '');
  assert.equal(g.totals.misses, 0);
});

test('語の途中で別の皿の先頭キーを押しても移らない（打ちかけの語が消えない）', () => {
  /* ここを開けていた頃は、隣のキーへの指ズレがそのまま「別の皿へ移る」として発火していた。
     隣接キー誤打を10%混ぜた実測で誤打19回のうち3回がこれで、ハタハタずしを hata まで
     打ったところで g を叩いて ぎばさ へ飛ばされた。打ちかけの語は無言で全部消え、
     その皿は次の tick() で「逃した皿」にまで数えられていた。 */
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'とんぶり', reading: 'とんぶり', note: '' }
  ]);
  const course = courseById('standard');
  g.start(0);
  g.tick(course.interval);
  const [first, second] = ridingPlates(g);

  const typed = primaryRomaji(first.dish.reading).slice(0, 2);
  for (const key of typed) g.press(key, 10);
  assert.equal(first.matcher.typed, typed);

  const head = primaryRomaji(second.dish.reading)[0];
  assert.equal(g.headKey(second), head, '相手の皿に先頭キーの札が出ていない');

  const res = g.press(head, 20);
  assert.equal(res.kind, 'miss', '語の途中なのに別の皿へ移っている');
  assert.ok(!res.switched);
  assert.equal(g.active().id, first.id, '的が別の皿へ動いている');
  assert.equal(first.matcher.typed, typed, '打ちかけの語が消えている');
  assert.equal(g.totals.misses, 1);
});

test('つかんだ皿を左端で抱えているあいだも、ほかの皿へは移らない', () => {
  /* 1打だけ入れて左端で待たせている皿がいちばん失いやすい。旧仕様ではここで
     別の皿の先頭キーを押すと進捗が0に戻り、次の tick() でそのまま逃した扱いになっていた。 */
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'とんぶり', reading: 'とんぶり', note: '' }
  ]);
  const course = courseById('standard');
  const travel = course.interval * PLATES_ON_BELT;
  g.start(0);
  const first = g.active();
  const head1 = primaryRomaji(first.dish.reading)[0];
  g.press(head1, 10);
  g.tick(course.interval);
  g.tick(travel + 1);
  assert.equal(first.held, true, '打ちかけの皿が左端で待っていない');
  assert.equal(g.totals.dishesMissed, 0);

  const second = ridingPlates(g).find((p) => p.id !== first.id);
  const res = g.press(primaryRomaji(second.dish.reading)[0], travel + 2);
  assert.equal(res.kind, 'miss');
  assert.equal(g.active().id, first.id, 'つかんだ皿から的が外れている');
  assert.equal(first.matcher.typed, head1, 'つかんだ皿の打ちかけが消えている');

  // 打ちかけが残っているので、次の tick() でも取り上げられない
  g.tick(travel + 3);
  assert.equal(first.state, 'riding');
  assert.equal(g.totals.dishesMissed, 0);
});

test('皿を選び直すキーはミスに数えない（つまずきではなく選択なので）', () => {
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'とんぶり', reading: 'とんぶり', note: '' }
  ]);
  const course = courseById('standard');
  g.start(0);
  g.tick(course.interval);
  const [, second] = ridingPlates(g);

  g.press(primaryRomaji(second.dish.reading)[0], 20);

  assert.equal(g.totals.misses, 0, '選び直しがミスに数えられている');
  assert.deepEqual(g.missMap, {}, '選び直しが「つまずいたキー」に入っている');
  assert.equal(g.totals.hits, 1);
});

test('どの皿の先頭キーでもないキーは、今までどおりミスになる', () => {
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'とんぶり', reading: 'とんぶり', note: '' }
  ]);
  const course = courseById('standard');
  g.start(0);
  g.tick(course.interval);
  assert.ok(g.plates.every((p) => g.headKey(p) !== 'z'), 'z で始まる皿が出ている');

  const res = g.press('z', 20);
  assert.equal(res.kind, 'miss');
  assert.equal(g.totals.misses, 1);
  assert.equal(g.active().id, ridingPlates(g)[0].id, 'ミスで的が動いている');
});

test('先頭キーが同じ皿が2枚あるときは、先に出たほう（左）へ移る', () => {
  /* 的の先頭キーが b と衝突しない並びで配りたいので、ここだけ乱数を変える。
     並びは決め打ちにせず、下の assert で実際にそうなっていることを確かめる */
  const g = makeGame([
    { name: 'ぎばさ', reading: 'ぎばさ', note: '' },
    { name: 'ぶりこ', reading: 'ぶりこ', note: '' },
    { name: 'ばっけみそ', reading: 'ばっけみそ', note: '' }
  ], 'standard', () => 0);
  const course = courseById('standard');
  g.start(0);
  g.tick(course.interval);
  g.tick(course.interval * 2);
  assert.equal(g.plates.length, 3);

  const [target, ...others] = ridingPlates(g);
  assert.equal(g.active().id, target.id);
  assert.notEqual(g.headKey(target), 'b', '的の先頭キーが b と衝突している');
  const bees = others.filter((p) => g.headKey(p) === 'b');
  assert.equal(bees.length, 2, '先頭キー b の皿が2枚出ていない');
  const older = bees.reduce((a, b) => (a.born <= b.born ? a : b));

  g.press('b', 20);
  assert.equal(g.active().id, older.id, '同じ先頭キーが2枚あるとき、左（先に出た皿）へ移っていない');
});

test('打つ皿が無いときの打鍵はミスに数えない', () => {
  const g = makeGame();
  g.start(0);
  eatActive(g);
  // 1枚しか出ていない状態で食べ切ったので、次の投入まで的が無い
  assert.equal(g.press('z', 10).kind, 'idle');
  assert.equal(g.totals.misses, 0);
});
