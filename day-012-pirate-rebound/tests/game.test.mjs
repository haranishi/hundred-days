import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../lib/game.js';
import { expandChart } from '../lib/chart.js';
import { WINDOW } from '../lib/judge.js';

const chart = { bpm: 120, beats: 32, events: [{ beat: 0, kind: 'cannon' }, { beat: 8, kind: 'gull' }, { beat: 12, kind: 'cannon' }] };
const build = () => new GameState(expandChart(chart));

test('打点の数はカモメを含まない', () => {
  const state = build();
  assert.equal(state.total, 2);
  assert.equal(state.gulls.length, 1);
});

test('ちょうどで押すとドンピシャ', () => {
  const state = build();
  const hit = state.press(state.notes[0].time);
  assert.equal(hit.result, 'perfect');
  assert.equal(state.combo, 1);
});

test('同じ打点は二度取れない', () => {
  const state = build();
  state.press(state.notes[0].time);
  const second = state.press(state.notes[0].time + 0.01);
  assert.equal(second.result, 'whiff', '消費済みの打点は連打で稼げない');
  assert.equal(state.counts.perfect, 1);
});

test('拍と関係ない入力はから振りで、打点を消費しない', () => {
  const state = build();
  state.press(state.notes[0].time - 3);
  assert.equal(state.counts.whiff, 1);
  assert.equal(state.taken.size, 0);
  assert.equal(state.press(state.notes[0].time).result, 'perfect', 'から振りのあとでも取れる');
});

test('カモメの鳴き声に釣られると引っかかったことになる', () => {
  const state = build();
  const gullTime = state.gulls[0].time;
  const pressed = state.press(gullTime);
  assert.equal(pressed.result, 'whiff');
  assert.equal(pressed.baitedGull, state.gulls[0].id);
  state.expire(9999);
  assert.equal(state.summary().gullsHeld, 0);
});

test('我慢すればカモメは我慢した数に入る', () => {
  const state = build();
  state.expire(9999);
  assert.equal(state.summary().gullsHeld, 1);
});

test('窓を過ぎた打点はミスとして確定する', () => {
  const state = build();
  const first = state.notes[0];
  assert.deepEqual(state.expire(first.time + WINDOW.reach), [], '窓の内側ではまだ確定させない');
  assert.deepEqual(state.expire(first.time + WINDOW.reach + 0.001), [0]);
  assert.equal(state.counts.miss, 1);
});

test('連続数は途切れると0に戻り、最高記録は残る', () => {
  const state = build();
  state.press(state.notes[0].time);
  state.press(state.notes[0].time - 3);
  assert.equal(state.combo, 0);
  assert.equal(state.bestCombo, 1);
});

/* 体験評価2周目：おしいでも連続が伸びるので、敵船に1発も届いていないのに
   「29 連続」と出て、看板のルール（届くのはドンピシャだけ）と食い違っていた。 */
test('連続はドンピシャだけ数える', () => {
  const state = build();
  state.press(state.notes[0].time + 0.05);
  assert.equal(state.counts.good, 1, 'おしいで入っていること');
  assert.equal(state.combo, 0, 'おしいでは連続を伸ばさない');
});
