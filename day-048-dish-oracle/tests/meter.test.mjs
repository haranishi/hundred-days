// 読みの輪の見せ方（lib/meter.js）。差分の札・読み上げ・軌跡の点が、表示の%と食い違わないことを確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAIL, percent, delta, direction, deltaLabel, readingSpeech, trailPoints, trailLine } from '../lib/meter.js';
import { LIMITS, buildModel, newGame, nextStep, answer, reject, reading, probabilityOf } from '../lib/oracle.js';
import { truthful } from './players.mjs';

test('表示の%は四捨五入で、0〜100に収める', () => {
  assert.equal(percent(0.634), 63);
  assert.equal(percent(0.635), 64);
  assert.equal(percent(0.99), 99);
  assert.equal(percent(1), 100);
  assert.equal(percent(0), 0);
  assert.equal(percent(1.4), 100);
  assert.equal(percent(-0.2), 0);
  assert.equal(percent(Number.NaN), 0);
});

test('上がったとき：差は表示の%どうしで取り、金の札は「↑ +14%」', () => {
  // 0.494→49%、0.634→63%。生の差（0.14）を丸めるのではなく、見えている数字の差にする
  const change = delta(0.494, 0.634);
  assert.equal(change, 14);
  assert.equal(direction(change), 'up');
  assert.equal(deltaLabel(change), '↑ +14%');
  assert.equal(readingSpeech(0.634, change), '読み 63%、14ポイント上がりました');
});

test('下がったとき：「↓ −9%」（全角のマイナス記号）と「下がりました」', () => {
  const change = delta(0.63, 0.54);
  assert.equal(change, -9);
  assert.equal(direction(change), 'down');
  assert.equal(deltaLabel(change), '↓ −9%');
  assert.equal(deltaLabel(change).codePointAt(2), 0x2212, '半角のハイフンではなくマイナス記号');
  assert.equal(readingSpeech(0.54, change), '読み 54%、9ポイント下がりました');
});

test('変わらないとき：「±0%」と「変わりません」。生の値が少し動いても表示が同じなら0', () => {
  assert.equal(delta(0.501, 0.503), 0);
  assert.equal(direction(0), 'flat');
  assert.equal(deltaLabel(0), '±0%');
  assert.equal(readingSpeech(0.5, 0), '読み 50%、変わりません');
});

test('0問目（前回の表示が無い）は差を出さない', () => {
  for (const previous of [null, undefined, Number.NaN]) assert.equal(delta(previous, 0.1), null);
  assert.equal(direction(null), null);
  assert.equal(deltaLabel(null), '');
  assert.equal(readingSpeech(0.1), '読み 10%');
});

test('外した直後：100%から下がった分を出す', () => {
  const change = delta(1, 0.4);
  assert.equal(change, -60);
  assert.equal(deltaLabel(change), '↓ −60%');
  assert.equal(readingSpeech(0.4, change), '読み 40%、60ポイント下がりました');
});

test('軌跡：答える前の読みは点にせず、点の数は答えた問数', () => {
  assert.deepEqual(trailPoints([]), []);
  assert.deepEqual(trailPoints([{ v: 0.1, id: 'curry' }]), []);
  const entries = [
    { v: 0.05, id: 'curry' },
    { v: 0.2, id: 'curry' },
    { v: 0.15, id: 'hayashi' },
    { v: 0.6, id: 'hayashi' },
  ];
  const points = trailPoints(entries);
  assert.equal(points.length, 3);
  assert.deepEqual(points.map(point => point.index), [1, 2, 3]);
  // 下がった点・最有力が入れ替わった点
  assert.deepEqual(points.map(point => point.dropped), [false, true, false]);
  assert.deepEqual(points.map(point => point.switched), [false, true, false]);
});

test('軌跡：8問までは同じ間隔で左から伸び、そのあとは答えた問数ぶんで全幅を使う。縦は0%が下・100%が上', () => {
  const { width, height, pad, minSlots } = TRAIL;
  const entries = count => Array.from({ length: count + 1 }, (_, i) => ({ v: i / (count + 1), id: 'curry' }));
  // 序盤：25問ぶんの目盛りだと4.75px間隔で左に固まっていた。8問ぶんの間隔（約16px）で置く
  const early = trailPoints(entries(3));
  const step = (width - pad * 2) / (minSlots - 1);
  assert.deepEqual(early.map(point => point.x), [pad, pad + step, pad + step * 2].map(x => Math.round(x * 100) / 100));
  assert.ok(step > 15);
  // 8問でちょうど右端に届く
  assert.equal(trailPoints(entries(minSlots)).at(-1).x, width - pad);
  // 25問（上限）でも全幅に収まり、左から右へ並ぶ
  const points = trailPoints(entries(LIMITS.maxQuestions));
  assert.equal(points.length, LIMITS.maxQuestions);
  assert.equal(points[0].x, pad);
  assert.equal(points.at(-1).x, width - pad);
  for (let i = 1; i < points.length; i++) assert.ok(points[i].x > points[i - 1].x);
  const [low, high] = trailPoints([{ v: 0, id: null }, { v: 0, id: 'a' }, { v: 1, id: 'a' }]);
  assert.equal(low.y, height - pad);
  assert.equal(high.y, pad);
  // 範囲外の値は枠の中に収める
  const [clamped] = trailPoints([{ v: 0.5, id: 'a' }, { v: 7, id: 'a' }]);
  assert.equal(clamped.y, pad);
  assert.equal(trailLine(points.slice(0, 2)), `${points[0].x},${points[0].y} ${points[1].x},${points[1].y}`);
});

test('軌跡：料理が無い点は入れ替わりにしない。無い状態から料理が出たら入れ替わり', () => {
  const points = trailPoints([{ v: 0.2, id: 'curry' }, { v: 0, id: null }, { v: 0.3, id: 'sushi' }]);
  assert.deepEqual(points.map(point => point.switched), [false, true]);
  assert.deepEqual(points.map(point => point.dropped), [true, false]);
});

test('実際の占い：正直に答えると読みは推測で100%になり、軌跡の点は問数と一致する', () => {
  const model = buildModel();
  let game = newGame(8);
  let step = nextStep(model, game);
  const entries = [{ v: reading(model, game, step).value, id: reading(model, game, step).id }];
  while (step.type === 'ask') {
    game = answer(game, step.q, truthful(probabilityOf(model, 'curry', step.q)));
    step = nextStep(model, game);
    const now = reading(model, game, step);
    entries.push({ v: now.value, id: now.id });
  }
  assert.equal(step.type, 'guess');
  assert.equal(percent(entries.at(-1).v), 100);
  assert.equal(trailPoints(entries).length, game.answers.length);
  // 外すと、100%から下がった札になる
  const missed = reading(model, reject(game, step.id));
  const change = delta(entries.at(-1).v, missed.value);
  assert.ok(change < 0);
  assert.match(deltaLabel(change), /^↓ −\d+%$/);
});
