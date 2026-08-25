import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../lib/game.js';
import { COURSES, DURATION_MS, courseById, dishesForCourse } from '../lib/dishes.js';

/* 難易度は式で見積もらず、実際にゲームを回して測る。
   1周目の体験評価で、机上の式（0.8打/秒で元が取れる）と実測（1.9打/秒必要）が
   2倍以上ずれていた。ずれた原因は「的が常に左端＝残り時間が最も短い皿」で、
   遅い人は打ちかけの皿を取り上げられ続けるという、式に入っていない構造だった。
   同じ間違いを繰り返さないよう、ここでは本物のゲームを動かして測る。 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 一定の速さで打ち続ける人を再現する。1皿食べ終えたら反応時間ぶん休む。
 * missRate を渡すと、その割合で打ち間違える人になる（間違えた打鍵も時間を食う）。
 * 初心者は必ずミスをするので、ミス0の想定だけで難易度を決めると机上の空論になる。
 */
function play({ courseId, keysPerSecond, seed = 7, reactionMs = 400, missRate = 0 }) {
  const course = courseById(courseId);
  const game = createGame({
    course,
    dishes: dishesForCourse(course),
    duration: DURATION_MS,
    random: mulberry32(seed)
  });
  const wrong = mulberry32(seed * 977 + 13);
  const stepMs = 1000 / keysPerSecond;
  let now = 0;
  game.start(now);
  let nextKeyAt = reactionMs;

  while (now < DURATION_MS) {
    now += 20;
    game.tick(now);
    if (now < nextKeyAt) continue;
    const plate = game.active();
    if (!plate) { nextKeyAt = now + 100; continue; }
    const key = plate.matcher.remaining()[0];
    if (!key) { nextKeyAt = now + 100; continue; }
    if (missRate > 0 && wrong() < missRate) {
      game.press(key === 'z' ? 'q' : 'z', now);
      nextKeyAt = now + stepMs;
      continue;
    }
    const res = game.press(key, now);
    nextKeyAt = now + (res.kind === 'ate' ? reactionMs : stepMs);
  }
  return { ...game.totals, target: course.target };
}

/** 5つの種で全部勝てたときだけ「勝てる」とみなす */
function winsAt(courseId, keysPerSecond, missRate = 0) {
  return [3, 7, 11, 21, 42].every((seed) => {
    const r = play({ courseId, keysPerSecond, seed, missRate });
    return r.eaten >= r.target;
  });
}

test('お手軽は1打/秒でも元が取れる', () => {
  // キーを目で探しながら打つ人の速さ。ここが落ちると「一番下でも難しすぎる」に逆戻りする
  for (const seed of [3, 7, 11, 21, 42]) {
    const r = play({ courseId: 'light', keysPerSecond: 1, seed });
    assert.ok(
      r.eaten >= r.target,
      `seed=${seed}: ¥${r.eaten} で目標¥${r.target}に届かない（${r.dishesEaten}皿）`
    );
  }
});

test('お手軽は初心者が3割打ち間違えても元が取れる', () => {
  // ミス0の人だけを想定して難易度を決めると、実際の初心者は負ける。
  // 2周目の体験評価で「1打/秒・正確率79.7%だと¥80の負け」と実測されて分かった
  for (const missRate of [0.1, 0.2, 0.3]) {
    assert.ok(
      winsAt('light', 1, missRate),
      `ミス率${Math.round(missRate * 100)}%・1打/秒でお手軽の元が取れない`
    );
  }
});

test('おすすめは普通の速さ（2.5打/秒）で元が取れる', () => {
  assert.ok(winsAt('standard', 2.5), 'おすすめが2.5打/秒で勝てない');
  // 初心者がうっかり選んだら勝ててしまう、では difficulty の意味がない
  assert.equal(winsAt('standard', 1), false, 'おすすめが1打/秒でも勝ててしまう');
});

test('大食いは速い人（4打/秒）で元が取れる', () => {
  assert.ok(winsAt('heavy', 4), '大食いが4打/秒で勝てない');
  assert.equal(winsAt('heavy', 2.5), false, '大食いが2.5打/秒で勝ててしまう');
});

test('難易度が3段の梯子になっている（同じ速さで下ほど勝ちやすい）', () => {
  for (const keysPerSecond of [1.5, 2.5, 4]) {
    const light = play({ courseId: 'light', keysPerSecond });
    const standard = play({ courseId: 'standard', keysPerSecond });
    const heavy = play({ courseId: 'heavy', keysPerSecond });
    const margin = (r) => r.eaten - r.target;
    assert.ok(
      margin(light) > margin(standard) && margin(standard) > margin(heavy),
      `${keysPerSecond}打/秒での余裕が順番になっていない: ` +
      `お手軽${margin(light)} / おすすめ${margin(standard)} / 大食い${margin(heavy)}`
    );
  }
});

test('速く打つほど必ず多く食べられる（速さが報われる）', () => {
  for (const course of COURSES) {
    let previous = -1;
    for (const keysPerSecond of [1, 2, 3, 5]) {
      const r = play({ courseId: course.id, keysPerSecond });
      assert.ok(
        r.eaten > previous,
        `${course.label}: ${keysPerSecond}打/秒で¥${r.eaten}、前段より増えていない`
      );
      previous = r.eaten;
    }
  }
});

test('打ちかけの皿は流れ切っても取り上げられない', () => {
  const course = courseById('heavy');
  const game = createGame({
    course, dishes: dishesForCourse(course), duration: DURATION_MS, random: mulberry32(7)
  });
  game.start(0);
  const plate = game.active();
  const romaji = plate.matcher.remaining();

  // 1打だけ入れて、走行時間の倍まで放置する
  assert.equal(game.press(romaji[0], 0).kind, 'hit');
  const travel = course.interval * 4;
  game.tick(travel * 2);

  assert.equal(game.totals.dishesMissed, 0, '打ちかけの皿が逃した扱いになっている');
  assert.equal(game.active().id, plate.id, 'つかんだ皿が的から外れている');
  assert.equal(game.progress(plate, travel * 2), 1, 'つかんだ皿は左端で止まるはず');

  // 残りを打てばちゃんと食べられる
  let now = travel * 2;
  for (const key of romaji.slice(1)) { now += 10; game.press(key, now); }
  assert.equal(game.totals.dishesEaten, 1);
});

test('1打も入れていない皿は今までどおり逃す（時間の緊張は残す）', () => {
  const course = courseById('heavy');
  const game = createGame({
    course, dishes: dishesForCourse(course), duration: DURATION_MS, random: mulberry32(7)
  });
  game.start(0);
  game.tick(course.interval * 4 + 1);
  assert.equal(game.totals.dishesMissed, 1);
});
