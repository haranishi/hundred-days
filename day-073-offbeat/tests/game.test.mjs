import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, MISSIONS, judgeTiming, readBest, saveBest } from '../src/game.js';

const perfect = { grade: 'PERFECT', points: 150 };
const late = { grade: 'OFF BEAT', points: 30 };

test('beat judgement treats just-before and just-after the beat equally at different tempos', () => {
  for (const bpm of [96, 122, 132]) {
    const beat = 60 / bpm;
    assert.equal(judgeTiming(beat - .04, bpm).grade, 'PERFECT');
    assert.equal(judgeTiming(beat + .04, bpm).grade, 'PERFECT');
    assert.equal(judgeTiming(beat + .13, bpm).grade, 'GOOD');
    assert.equal(judgeTiming(beat / 2, bpm).grade, 'OFF BEAT');
    assert.equal(judgeTiming(-.02, bpm).grade, 'PERFECT');
  }
});
test('unstarted, paused and finished sets do not award points; repeated inputs cannot inflate score', () => {
  const game = new GameSession();
  assert.equal(game.act('pad', 0, perfect), null);
  game.start('challenge', 10);
  assert.ok(game.act('pad', 10, perfect));
  assert.equal(game.act('pad', 10.05, perfect), null);
  game.pause(11);
  assert.equal(game.act('pad', 20, perfect), null);
  game.resume(21); game.update(80);
  assert.equal(game.finished, true);
  assert.equal(game.act('pad', 80, perfect), null);
});
test('the live clock survives a long pause and finishes at 60 active seconds', () => {
  const game = new GameSession(); game.start('challenge', 100);
  game.pause(110); assert.equal(game.elapsed(900), 10);
  game.resume(1000); assert.equal(game.elapsed(1005), 15);
  game.update(1049.99); assert.equal(game.finished, false);
  game.update(1050); assert.equal(game.finished, true);
  assert.equal(game.elapsed(2000), 60);
});
test('five different DJ missions can all be completed and each bonus is awarded only once', () => {
  const game = new GameSession(); game.start('challenge', 0);
  const sequence = [['scratch', 4], ['pad', 6], ['sync', 1], ['transition', 1], ['pad', 8]];
  sequence.forEach(([action, count], index) => {
    for (let i = 0; i < count; i++) {
      const result = game.act(action, index * 12 + i * .5 + .3, perfect);
      assert.equal(result.missionComplete, i === count - 1);
    }
    assert.equal(game.completed[index], true);
    assert.equal(game.act(action, index * 12 + 5, perfect)?.missionComplete, false);
  });
  assert.equal(game.completed.filter(Boolean).length, 5);
  game.update(60); assert.equal(game.finished, true);
});
test('drum missions require timing and a transition must be valid', () => {
  const game = new GameSession(); game.start('challenge', 0);
  game.act('pad', 13, late); assert.equal(game.counts[1], 0);
  game.act('pad', 13.5, perfect); assert.equal(game.counts[1], 1);
  game.act('transition', 37, perfect, { valid: false }); assert.equal(game.counts[3], 0);
  game.act('transition', 38, perfect); assert.equal(game.completed[3], true);
});
test('combos grow, multiply a successful streak, and reset without taking away earned score', () => {
  const game = new GameSession(); game.start('free', 0);
  let result;
  for (let i = 0; i < 8; i++) result = game.act('pad', i * .5, perfect);
  assert.equal(result.multiplier, 2); assert.equal(game.maxCombo, 8);
  const score = game.score;
  game.act('pad', 4, late); assert.equal(game.combo, 0); assert.ok(game.score > score);
  game.start('challenge', 8); assert.equal(game.score, 0); assert.equal(game.maxCombo, 0);
  assert.deepEqual(game.completed, MISSIONS.map(() => false));
});
test('missing a mission leaves the live playable and results in an honest C rank', () => {
  const game = new GameSession(); game.start('challenge', 0);
  game.update(60); assert.equal(game.finished, true); assert.equal(game.rank, 'C');
  assert.equal(game.completed.filter(Boolean).length, 0);
});
test('high scores survive lower results and inaccessible browser storage does not stop the game', () => {
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(readBest(storage), 0);
  assert.equal(saveBest(storage, 1000), 1000); assert.equal(saveBest(storage, 20), 1000);
  const unavailable = { getItem() { throw Error('Blocked'); }, setItem() { throw Error('Full'); } };
  assert.equal(readBest(unavailable), 0); assert.equal(saveBest(unavailable, 200), 200);
  data.set('offbeat-best', 'NaN'); assert.equal(readBest(storage), 0);
});
