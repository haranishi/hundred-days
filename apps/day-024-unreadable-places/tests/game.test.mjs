import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIVES, BASE_TRAVEL_MS, MIN_TRAVEL_MS, BURST_MS, ANSWER_MS, REQUEUE_AFTER, createGame
} from '../lib/game.js';
import { primaryRomaji } from '../lib/romaji.js';
import { basePoints, revealedCount, tailMs } from '../lib/hint.js';

const PLACES = [
  { kanji: '及位', kana: 'のぞき', pref: '山形県', city: '真室川町', difficulty: 0.9 },
  { kanji: '男鹿', kana: 'おが', pref: '秋田県', city: '男鹿市', difficulty: 0.7 },
  { kanji: '仁井田', kana: 'にいだ', pref: '秋田県', city: '秋田市', difficulty: 0.3 }
];

const fixedRandom = () => 0.5;

function makeGame(places = PLACES) {
  return createGame({ places, random: fixedRandom });
}

/** いま向かってきている地名を、既定の書き方で打ち切る */
function typeActive(game, now = 0) {
  const target = game.active();
  for (const key of primaryRomaji(target.place.kana)) game.press(key, now);
  return target;
}

test('始める前は待機、始めると1件が向かってくる', () => {
  const game = makeGame();
  assert.equal(game.state, 'ready');
  assert.equal(game.active(), null);
  game.start(0);
  assert.equal(game.state, 'running');
  assert.equal(game.active().phase, 'incoming');
  assert.equal(game.lives, LIVES);
});

test('読みを打ち切ると弾けて、点が入る', () => {
  const game = makeGame();
  game.start(0);
  const before = game.score;
  const target = typeActive(game, 0);
  assert.equal(game.active().phase, 'burst');
  assert.ok(game.score > before);
  assert.equal(game.totals.cleared, 1);
  // 1文字も開かずに打ち切ったので満点
  assert.equal(game.score, basePoints(target.place.difficulty));
});

test('開示が進んでから打つと点が減る', () => {
  const fast = makeGame();
  fast.start(0);
  fast.tick(0);
  typeActive(fast, 0);

  const slow = makeGame();
  slow.start(0);
  const kanaLength = slow.active().place.kana.length;
  const late = BASE_TRAVEL_MS - tailMs(kanaLength);
  slow.tick(late);
  assert.equal(slow.active().revealed, kanaLength);
  typeActive(slow, late);

  assert.ok(slow.score < fast.score, `${slow.score} < ${fast.score} のはず`);
  assert.ok(slow.score > 0);
});

test('着弾するとライフが減り、正解を見せる時間に入る', () => {
  const game = makeGame();
  game.start(0);
  game.tick(BASE_TRAVEL_MS);
  assert.equal(game.lives, LIVES - 1);
  assert.equal(game.active().phase, 'answer');
  assert.equal(game.totals.hit, 1);
});

test('正解を読ませる時間が過ぎてから次が来る', () => {
  const game = makeGame();
  game.start(0);
  game.tick(BASE_TRAVEL_MS);
  const failed = game.active().place;
  game.tick(BASE_TRAVEL_MS + ANSWER_MS - 1);
  assert.equal(game.active().place, failed, 'まだ次に行ってはいけない');
  game.tick(BASE_TRAVEL_MS + ANSWER_MS);
  assert.equal(game.active().phase, 'incoming');
});

test('弾けたあとは短い間で次に進む', () => {
  const game = makeGame();
  game.start(0);
  typeActive(game, 0);
  game.tick(BURST_MS - 1);
  assert.equal(game.active().phase, 'burst');
  game.tick(BURST_MS);
  assert.equal(game.active().phase, 'incoming');
});

test('ライフを使い切ると終わるが、最後の正解は見せてから終わる', () => {
  const game = makeGame();
  game.start(0);
  let now = 0;
  for (let i = 0; i < LIVES; i += 1) {
    now += BASE_TRAVEL_MS;
    game.tick(now);
    assert.equal(game.active().phase, 'answer');
    now += ANSWER_MS;
    game.tick(now);
  }
  assert.equal(game.state, 'over');
  assert.equal(game.lives, 0);
  assert.equal(game.active(), null);
});

test('降参するとライフが減り、あとで出し直される', () => {
  const game = makeGame();
  game.start(0);
  const given = game.active().place;
  assert.equal(game.giveUp(0), true);
  assert.equal(game.lives, LIVES - 1);
  assert.equal(game.totals.surrendered, 1);

  let now = ANSWER_MS;
  game.tick(now);
  const seen = [];
  for (let i = 0; i < REQUEUE_AFTER + 2 && game.state === 'running'; i += 1) {
    const t = game.active();
    if (t.phase !== 'incoming') break;
    seen.push(t.place);
    typeActive(game, now);
    now += BURST_MS;
    game.tick(now);
  }
  assert.ok(seen.includes(given), '降参した地名が出し直されていない');
});

test('弾けている間・正解表示の間の打鍵は無視する', () => {
  const game = makeGame();
  game.start(0);
  typeActive(game, 0);
  const r = game.press('a', 10);
  assert.equal(r.ignored, true);
  assert.equal(game.totals.misses, 0);
});

test('打ち間違いはライフを減らさないが、数える', () => {
  const game = makeGame();
  game.start(0);
  const wrong = game.active().place.kana.startsWith('の') ? 'z' : 'q';
  const r = game.press(wrong, 0);
  assert.equal(r.ok, false);
  assert.equal(r.ignored, false);
  assert.equal(game.totals.misses, 1);
  assert.equal(game.lives, LIVES);
});

test('打ち間違いの返り値に正解のキーを含めない（読みを伏せている最中に漏らさない）', () => {
  const game = makeGame();
  game.start(0);
  const r = game.press('q', 0);
  assert.equal('expected' in r, false);
  // 記録自体は残っていて、結果画面で使える
  assert.ok(game.stumbles(3).length >= 1);
});

test('進むほど接近が速くなり、下限で止まる', () => {
  const game = makeGame();
  game.start(0);
  const first = game.active().travelMs;
  let now = 0;
  for (let i = 0; i < 40 && game.state === 'running'; i += 1) {
    typeActive(game, now);
    now += BURST_MS;
    game.tick(now);
  }
  const later = game.active().travelMs;
  assert.ok(later < first, `${later} < ${first} のはず`);
  assert.ok(later >= MIN_TRAVEL_MS);
});

test('在庫を使い切っても、ライフが残っているうちは出題が続く', () => {
  const game = createGame({ places: PLACES.slice(0, 2), random: fixedRandom });
  game.start(0);
  let now = 0;
  for (let i = 0; i < 6; i += 1) {
    assert.equal(game.state, 'running');
    typeActive(game, now);
    now += BURST_MS;
    game.tick(now);
  }
  assert.equal(game.totals.cleared, 6);
});

test('在庫が空なら作らせない', () => {
  assert.throws(() => createGame({ places: [] }), /places/);
});

test('奥から手前へ進む', () => {
  const game = makeGame();
  game.start(0);
  game.tick(0);
  const start = game.active().depth;
  game.tick(BASE_TRAVEL_MS / 2);
  const mid = game.active().depth;
  assert.ok(start < 0.05, `開始直後は奥にいるはず: ${start}`);
  assert.ok(mid > start && mid < 1, `中間は ${mid}`);
});

test('伏せたまま打てる人と、開示を待つ人の差が点数に出る', () => {
  const place = PLACES[0];
  const kanaLength = place.kana.length;
  const atFull = BASE_TRAVEL_MS - tailMs(kanaLength);
  assert.equal(revealedCount({ elapsed: 0, travelMs: BASE_TRAVEL_MS, kanaLength }), 0);
  assert.equal(revealedCount({ elapsed: atFull, travelMs: BASE_TRAVEL_MS, kanaLength }), kanaLength);
});
