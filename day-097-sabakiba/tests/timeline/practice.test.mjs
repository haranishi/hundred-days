import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, addSample, finish, PRACTICE_REACH_PX, PRACTICE_START_REACH_PX } from '../../lib/practice.js';

const line = [[0, 0, 0], [0.7, 0, 0], [0.7, 0, 0], [10, 0, 0]];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} と ${b}`);
const session = (curvePoints = line, tolerance = 1) => createSession({ curvePoints, tolerance });
const range = (start, end, count = 21) => Array.from({ length: count }, (_, i) => start + (end - start) * i / (count - 1));

function trace(xs, { offset = () => 0, times, tolerance = 1 } = {}) {
  const s = session(line, tolerance);
  xs.forEach((x, i) => addSample(s, [x, offset(i), 0], times ? times[i] : i * 30));
  return finish(s);
}

test('三次元の折れ線を等速で両端までたどると100点で、同じ入力を採点し直しても一致する', () => {
  const points = [[0, 0, 0], [0, 0, 2], [0, 3, 2], [4, 3, 2]], s = session(points, 0.25);
  for (const d of range(0, 9, 91)) {
    const p = d < 2 ? [0, 0, d] : d < 5 ? [0, d - 2, 2] : [d - 5, 3, 2];
    addSample(s, p, 200 + d * 120);
  }
  const before = structuredClone(s);
  const result = finish(s);
  assert.equal(result.score, 100);
  near(result.coverage, 1); near(result.accuracy, 1); near(result.smoothness, 1);
  near(result.meanDist, 0); near(result.maxDist, 0);
  assert.equal(result.grade, 'S'); assert.equal(result.reversals, 0);
  assert.deepEqual(finish(s), result);
  assert.deepEqual(s, before);
});

test('線への垂線と端点の距離をcmで測り、頂点が重なっても弧長と距離が求まる', () => {
  const s = session();
  for (const [i, p] of [[0, [-2, 0, 0]], [1, [2.1, 3, 4]], [2, [14, 0, 0]]]) addSample(s, p, i * 30);
  const r = finish(s);
  near(r.meanDist, (2 + 5 + 4) / 3); near(r.maxDist, 5);
  near(r.coverage, 1);
  const angled = session([[0, 0, 0], [3, 0, 4]]);
  addSample(angled, [1.5, 2, 2], 0);
  near(finish(angled).meanDist, 2);
  assert.throws(() => session([[0, 0, 0], [0, 0, 0]]), RangeError);
  assert.throws(() => session([[0, NaN, 0], [1, 2, 3]]), TypeError);
  assert.throws(() => session(line, 0), RangeError);
});

test('平均と90パーセンタイルから一致度を求め、ずれに応じてS・A・B・C・Dになる', () => {
  const xs = range(0, 10);
  const expected = [[0, 'S', 100], [0.5, 'A', 84], [1, 'B', 68], [1.5, 'C', 51], [2, 'D', 35]];
  for (const [d, grade, score] of expected) {
    const r = trace(xs, { offset: () => d });
    near(r.meanDist, d); near(r.maxDist, d); near(r.accuracy, 1 - d / 2);
    assert.equal(r.grade, grade); assert.equal(r.score, score);
  }
  const offsets = [0, 0.4, 0.8, 1.6];
  const r = trace([0, 2, 5, 10], { offset: i => offsets[i], tolerance: 2 });
  const p90 = 0.8 + 0.7 * (1.6 - 0.8);
  near(r.accuracy, 1 - (0.6 * 0.7 + 0.4 * p90) / 4);
});

test('30ms間隔で補間した速さの変動係数を使い、イベントの密度に左右されない', () => {
  const times = [1000, 1008, 1080, 1101, 1155, 1189, 1235, 1262, 1300];
  const xs = times.map(t => (t - 1000) / 30);
  near(trace(xs, { times }).smoothness, 1);
  assert.equal(trace(xs, { times }).score, 100);

  const changing = [0, 0.15, 2.75, 3.2, 5.2, 5.75, 8.1, 9.3, 10];
  const grid = range(1000, 1300, 11).map(t => {
    const i = times.findIndex(endpoint => endpoint >= t);
    if (i === 0) return 0;
    return changing[i - 1] + (changing[i] - changing[i - 1]) * ((t - times[i - 1]) / (times[i] - times[i - 1]));
  });
  const speeds = grid.slice(1).map((a, k) => Math.abs(a - grid[k]) / 30);
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const cv = Math.sqrt(speeds.reduce((sum, v) => sum + (v - mean) ** 2, 0) / speeds.length) / mean;
  // 両端の2%（動き出す前・止まった後）は速さの計算から外すので、全区間で測った値と、わずかにずれる。
  near(trace(changing, { times }).smoothness, 1 - 0.8 * cv, 0.01);
  assert.equal(trace([0, 10]).smoothness, 0.5);
  assert.equal(trace([0, 5, 10], { times: [0, 10, 22] }).smoothness, 0.5);
  near(trace([0, 5, 10], { times: [0, 3.6e9, 7.2e9] }).smoothness, 1);
});

test('全長の3%を超える後戻りを一続きで数え、小刻みな往復はなめらかさを下げる', () => {
  const jitter = trace([0, 3, 2.8, 3, 4, 3.71, 6, 10]);
  assert.equal(jitter.reversals, 0);
  assert.equal(trace([0, 4, 3.7, 7, 10]).reversals, 1);
  const one = trace([0, 1, 6, 5.9, 5.6, 5, 4, 3.8, 6, 8, 10]);
  assert.equal(one.reversals, 1);
  const zigzag = trace([0, 2, 4, 3, 2, 4, 6, 5, 4, 6, 8, 10]);
  assert.equal(zigzag.reversals, 2);
  assert.ok(zigzag.smoothness < trace(range(0, 10, 12)).smoothness);
  assert.match(zigzag.comment, /小刻みに往復/);
});

test('端点の許容は15%・85%。途中開始・放棄・逆向きは範囲を割り引き、70%未満を60点以下にする', () => {
  near(trace(range(1.5, 8.5)).coverage, 0.7);
  const partial = [
    [range(3, 10), /途中から/], [range(0, 7), /途中で終/],
    [range(3, 7), /中ほど/], [range(10, 0), /逆/],
  ];
  for (const [xs, reason] of partial) {
    const r = trace(xs);
    assert.ok(r.coverage < 0.7 && r.score <= 60);
    assert.match(r.comment, reason);
  }
  assert.equal(trace(range(10, 0)).coverage, 0);
  assert.ok(trace(range(1.5, 8.5)).score > 60);
});

test('空の軌跡・同時刻・遅着・無効な座標を扱い、一度記録した点は入力配列の書換えに影響されない', () => {
  const s = session();
  const empty = finish(s);
  assert.equal(empty.score, 0); assert.equal(empty.grade, 'D'); assert.match(empty.comment, /まだ/);
  assert.equal(empty.smoothness, 0.5);
  for (const key of ['accuracy', 'smoothness', 'coverage', 'reversals', 'meanDist', 'maxDist']) assert.ok(Number.isFinite(empty[key]));
  addSample(s, [0, 0, 0], 0);
  addSample(s, [1, 6, 0], 30);
  const point = [4, 0, 0];
  addSample(s, point, 30);
  point[1] = 100;
  addSample(s, [0, 8, 0], 10);
  addSample(s, [10, 0, 0], 90);
  assert.deepEqual(finish(s), trace([0, 4, 10], { times: [0, 30, 90] }));
  assert.throws(() => addSample(s, [0, NaN, 0], 100), TypeError);
  assert.throws(() => addSample(s, [0, 0, 0], Infinity), TypeError);
});

test('指の受付は線から28px・始点から40pxで、cmの許容幅とは独立しています', () => {
  assert.equal(PRACTICE_REACH_PX, 28);
  assert.equal(PRACTICE_START_REACH_PX, 40);
});

test('端の3%は一度触れれば届いたと数え、2割からの一筆は60点までです', () => {
  const endpoints = trace(range(0.3, 9.7));
  near(endpoints.coverage, 1);
  assert.ok(endpoints.score >= 95 && endpoints.grade === 'S');
  near(trace([0.4, 0.25, 5, 9.75, 9.6]).coverage, 1);
  near(trace(range(0.31, 9.69)).coverage, 0.938);
  near(trace([0.2, 0.2]).coverage, 0);
  const late = trace(range(2, 10));
  assert.equal(late.score, 60);
  assert.match(late.comment, /「ここから」の丸/);
  const reverse = trace(range(10, 0));
  assert.equal(reverse.coverage, 0);
  assert.ok(reverse.score <= 60 && reverse.reversals === 1);
});

test('軌跡から判別した理由に応じて、異なるコメントを10種類以上返す', () => {
  const examples = [
    [trace([]), /まだ/], [trace([3]), /一つ/], [trace([3, 3, 3]), /同じ場所/],
    [trace(range(10, 0)), /逆/], [trace([0, 4, 2, 6, 4, 8, 10]), /往復/],
    [trace(range(3, 7)), /中ほど/], [trace(range(4, 10)), /途中から/],
    [trace(range(0, 5)), /途中で/], [trace(range(0, 10), { offset: () => 1.2 }), /平均1.2cm/],
    [trace(range(0, 10), { offset: i => i === 6 ? 2 : 0 }), /大きく離れ/],
    [trace([0, 4, 3, 5, 8, 10]), /少し戻/], [trace([0, 0, 0, 0, 10]), /速さにむら/],
    [trace(range(0, 10)), /なめらか/],
  ];
  for (const [result, reason] of examples) {
    assert.match(result.comment, reason);
    assert.ok(result.comment.split('。').filter(Boolean).length <= 2);
  }
  assert.ok(new Set(examples.map(([r]) => r.comment)).size >= 10);
});

test('始点や終点で指を止めても、なめらかさは下がらない（案内どおり丸に指を置いてから引ける）', () => {
  const points = Array.from({ length: 41 }, (_, i) => [i * 0.5, 0, 0]);
  const trace = (restStart, restEnd) => {
    const session = createSession({ curvePoints: points, tolerance: 0.5 });
    let t = 0;
    addSample(session, [0, 0, 0], t);
    // 始点に指を置いたまま止まる。
    t += restStart;
    for (let i = 1; i <= 40; i++) { t += 25; addSample(session, [i * 0.5, 0, 0], t); }
    // 終点で止めてから離す。
    t += restEnd;
    addSample(session, [20, 0, 0], t);
    return finish(session);
  };
  const steady = trace(0, 0);
  assert.ok(steady.smoothness > 0.95 && steady.score >= 95, JSON.stringify(steady));
  for (const [a, b] of [[300, 0], [0, 600], [600, 1000], [1000, 1000]]) {
    const rested = trace(a, b);
    assert.ok(Math.abs(rested.smoothness - steady.smoothness) < 0.05, `${a}/${b}: ${rested.smoothness}`);
    assert.ok(rested.score >= steady.score - 2, `${a}/${b}: ${rested.score}`);
  }
  // 途中で長く止まるのは、これまでどおり減点する。
  const session = createSession({ curvePoints: points, tolerance: 0.5 });
  let t = 0;
  addSample(session, [0, 0, 0], t);
  for (let i = 1; i <= 40; i++) { t += i === 20 ? 1200 : 25; addSample(session, [i * 0.5, 0, 0], t); }
  assert.ok(finish(session).smoothness < steady.smoothness - 0.2);
});
