import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, labelOf, stageOf, toNextStage } from '../lib/damage.js';
import { makeEnemyShip } from '../lib/models.js';
import { CHARTS, expandChart } from '../lib/chart.js';

test('段はしきい値で上がり、下がらない', () => {
  let previous = -1;
  for (let hits = 0; hits <= 40; hits += 1) {
    const stage = stageOf(hits);
    assert.ok(stage >= previous, `${hits}発で段が下がった`);
    previous = stage;
  }
});

test('しきい値ちょうどでその段に入る', () => {
  STAGES.forEach((one, index) => {
    assert.equal(stageOf(one.at), index, `${one.at}発は段${index}`);
    if (one.at > 0) assert.equal(stageOf(one.at - 1), index - 1, `${one.at - 1}発はまだ段${index - 1}`);
  });
});

test('壊れた値でも0段に落として続ける', () => {
  for (const value of [-5, NaN, undefined, 'abc']) assert.equal(stageOf(value), 0);
  assert.equal(labelOf(999), STAGES.at(-1).label);
});

test('次の段までの残りは減っていき、最後は0', () => {
  assert.equal(toNextStage(0), STAGES[1].at);
  assert.equal(toNextStage(STAGES.at(-1).at), 0);
  assert.ok(toNextStage(3) < toNextStage(2));
});

/* 全部ドンピシャで返せば最後の段まで見られること。
   ここが崩れると、演出の一番奥が誰にも見られないまま終わる。 */
test('本編を全部ドンピシャで返すと最後の段に届く', () => {
  const { notes } = expandChart(CHARTS.main);
  assert.equal(stageOf(notes.length), STAGES.length - 1, `打点${notes.length}で最後の段に届かない`);
});

test('半分だけ当てても、途中の段までは必ず見られる', () => {
  const { notes } = expandChart(CHARTS.main);
  assert.ok(stageOf(Math.floor(notes.length / 2)) >= 3, '半分当てて3段目に届かないと、崩れる手応えが薄い');
});

test('段が進むほど敵船の輪郭が変わる', () => {
  const shapes = STAGES.map((one, index) => makeEnemyShip(index));
  // 面の数は増えない（部品は戻らない）
  for (let index = 1; index < shapes.length; index += 1) {
    assert.ok(shapes[index].faces.length <= shapes[index - 1].faces.length, `段${index}で面が増えた`);
  }
  assert.ok(shapes.at(-1).faces.length < shapes[0].faces.length, '最後まで壊しても見た目が変わらない');

  // 傾く段では、左右の高さの差が出る（遠くのシルエットでは傾きが一番効く）
  const tilt = (ship) => Math.max(...ship.vertices.map((v) => v[1])) - Math.max(...shapes[0].vertices.map((v) => v[1]));
  assert.ok(tilt(shapes.at(-1)) < 0, '最後の段で船が沈み込んでいない');
});
