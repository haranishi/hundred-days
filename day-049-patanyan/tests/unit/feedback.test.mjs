import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOALS, nextGoal, courseBest, goalReached, goalLabel, resultGoal, collisionReason } from '../../lib/feedback.js';
import { defaults, recordRun, createStore } from '../../lib/storage.js';
import { createGame, queueFlap, stepOnce, gameTime } from '../../lib/game.js';

test('目標のはしご：全段の直前・一致・直後と100以降', () => {
  assert.deepEqual(GOALS, [1, 3, 5, 10, 15, 25, 35, 50, 75, 100]);
  for (let best = 0; best <= 102; best += 1) {
    assert.equal(nextGoal(best), GOALS.filter((n) => n > best)[0] ?? null, `best=${best}`);
  }
  assert.equal(nextGoal(0), 1);
  assert.equal(nextGoal(1), 3);
  assert.equal(nextGoal(4), 5);
  assert.equal(goalLabel(nextGoal(100)), '自己ベスト更新');
});

test('目標達成は開始時のベストで判定し、次は今回の記録も反映する', () => {
  for (const best of [0, ...GOALS, 101]) {
    const target = nextGoal(best) ?? best + 1;
    assert.equal(goalReached(target - 1, best), false);
    assert.equal(goalReached(target, best), true);
    assert.equal(goalReached(target + 1, best), true);
  }
  assert.equal(resultGoal(0, 0), '次の目標 1本');
  assert.equal(resultGoal(1, 0), '目標達成！ 次は3本');
  assert.equal(resultGoal(4, 1), '目標達成！ 次は5本');
  assert.equal(resultGoal(10, 0), '目標達成！ 次は15本');
  assert.equal(resultGoal(99, 75), '次の目標 100本');
  assert.equal(resultGoal(100, 75), '目標達成！ 次は自己ベスト更新');
  assert.equal(resultGoal(100, 100), '次の目標 自己ベスト更新');
  assert.equal(resultGoal(101, 100), '目標達成！ 次は自己ベスト更新');
});

test('目標は既存保存のモード・日付別ベストから復元する', () => {
  let p = defaults();
  for (const [mode, dateKey, score] of [['any', 20260925, 100], ['daily', 20260925, 4], ['daily', 20260926, 1]]) {
    p = recordRun(p, { mode, dateKey, score, fish: 0 }).profile;
  }
  let saved;
  const store = createStore({ setItem: (_, value) => { saved = value; }, getItem: () => saved });
  store.save(p);
  p = store.load();
  assert.equal(nextGoal(courseBest(p, 'any', 20260925)), null);
  assert.equal(nextGoal(courseBest(p, 'daily', 20260925)), 5);
  assert.equal(nextGoal(courseBest(p, 'daily', 20260926)), 3);
  assert.equal(nextGoal(courseBest(p, 'daily', 20260927)), 1);
});

test('衝突理由：上側面・上クッション・下側面・下クッション・地面', () => {
  const poles = Object.freeze([Object.freeze({ n: 7, top: 110, bottom: 260 })]);
  for (const y of [-100, 0, 109, 110]) {
    assert.equal(collisionReason(Object.freeze({ kind: 'pole', pole: 7, y }), poles), '上のポールに当たった');
  }
  for (const y of [260, 261, 419]) {
    assert.equal(collisionReason({ kind: 'pole', pole: 7, y }, poles), '下のポールに当たった');
  }
  assert.equal(collisionReason({ kind: 'ground' }, poles), '地面に落ちた');
  assert.equal(collisionReason(null, poles), '');
  assert.equal(collisionReason({ kind: 'pole', pole: 99 }, poles), '');
});

test('天井に張り付いた実際のhitも上のポールと判定する', () => {
  const g = createGame({ seed: 42, skyTop: -123, idleBob: 0 });
  for (let i = 0; i < 500 && !g.hit; i += 1) {
    queueFlap(g, gameTime(g));
    stepOnce(g);
  }
  assert.ok(g.hit);
  assert.equal(collisionReason(g.hit, g.course.poles), '上のポールに当たった');
});
