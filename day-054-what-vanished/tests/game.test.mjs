import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange } from '../lib/arrange.js';
import { Game, PACES } from '../lib/game.js';
import { planGame } from '../lib/rules.js';
import { manifest } from './helpers.mjs';

const make = (pace = 'normal') => new Game({ rounds: planGame(manifest, arrange, 55, 'normal'), level: 'normal', seed: 55, pace });
const run = (g, seconds, step = 0.05) => {
  const events = [];
  for (let t = 0; t < seconds; t += step) events.push(...g.tick(step));
  return events;
};

test('準備→覚える60秒→目を閉じる→探す60秒→答える の順に進む', () => {
  const g = make();
  assert.equal(g.phase, 'ready');
  run(g, PACES.normal.ready + 0.1);
  assert.equal(g.phase, 'memorize');
  assert.equal(g.canMove, true);
  run(g, 59.5);
  assert.equal(g.phase, 'memorize');
  const ev = run(g, 1);
  assert.ok(ev.includes('enter:closing'));
  assert.equal(g.canMove, false);
  const closing = run(g, PACES.normal.closing + 0.1);
  assert.equal(closing.filter(e => e === 'vanish').length, 1, '消えるのは1回だけ');
  assert.equal(g.phase, 'search');
  run(g, 60.5);
  assert.equal(g.phase, 'answer');
});

test('残り10秒から毎秒の合図が出る', () => {
  const g = make();
  run(g, PACES.normal.ready + 0.1);
  const ev = run(g, 60, 0.02);
  assert.equal(ev.filter(e => e === 'countdown').length, 10);
});

test('覚えた・わかった で時間を切り上げられる', () => {
  const g = make();
  run(g, 3);
  assert.deepEqual(g.doneMemorizing(), ['enter:closing']);
  run(g, 4);
  assert.equal(g.phase, 'search');
  assert.deepEqual(g.answerNow(), ['enter:answer']);
});

test('ヒントは探し始めて20秒たってから、1問に1回だけ', () => {
  const g = make();
  run(g, 3);
  g.doneMemorizing();
  run(g, 4);
  assert.deepEqual(g.useHint(), []);
  const ev = run(g, 20);
  assert.ok(ev.includes('hint-ready'));
  assert.deepEqual(g.useHint(), ['hint']);
  assert.deepEqual(g.useHint(), []);
});

test('一時停止中は時間が進まず、動けない', () => {
  const g = make();
  run(g, 3);
  const left = g.timeLeft;
  g.pause();
  run(g, 10);
  assert.equal(g.timeLeft, left);
  assert.equal(g.canMove, false);
  g.resume();
  run(g, 1);
  assert.ok(g.timeLeft < left);
});

test('選んで決めると正誤が記録され、3問で結果になる', () => {
  const g = make();
  for (let i = 0; i < 3; i++) {
    run(g, 3);
    g.doneMemorizing();
    run(g, 4);
    g.answerNow();
    assert.deepEqual(g.confirm(), [], '選ぶ前は決められない');
    const pick = i === 0 ? g.current.choices.find(c => c !== g.current.vanished) : g.current.vanished;
    g.choose(pick);
    const ev = g.confirm();
    assert.equal(ev[0], i === 0 ? 'wrong' : 'correct');
    assert.equal(g.phase, 'reveal');
    g.next();
  }
  assert.equal(g.phase, 'result');
  assert.equal(g.score, 2);
  assert.equal(g.answers.length, 3);
});

test('答えの画面は一時停止にならず、Esc 相当の操作は選んだ候補を外すだけ', () => {
  const g = make();
  run(g, 3);
  g.doneMemorizing();
  run(g, 4);
  g.answerNow();
  g.choose(g.current.choices[0]);
  assert.deepEqual(g.pause(), [], '答えの画面では止まらない');
  assert.equal(g.paused, false);
  assert.deepEqual(g.unchoose(), ['unchoose']);
  assert.equal(g.choice, null);
  g.choose(g.current.vanished);
  assert.equal(g.confirm()[0], 'correct');
});

test('候補に無い物は選べない', () => {
  const g = make();
  run(g, 3);
  g.doneMemorizing();
  run(g, 4);
  g.answerNow();
  const outsider = ['apple', 'lemon', 'duck', 'tv', 'kettle'].find(id => !g.current.choices.includes(id));
  assert.deepEqual(g.choose(outsider), []);
  assert.equal(g.choice, null);
});

test('録画・テスト用の速い進行でも、同じ順に進む', () => {
  const g = make('fast');
  run(g, 0.7);
  assert.equal(g.phase, 'memorize');
  run(g, 4.1);
  assert.equal(g.phase, 'closing');
  run(g, 1.7);
  assert.equal(g.phase, 'search');
});
