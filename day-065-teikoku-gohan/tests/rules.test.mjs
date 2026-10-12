// ルールの最小例。手で組んだ小さな面で、規則から手で導いた分を確かめる（sim の結果を写した期待値ではない）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, buildPath } from '../lib/sim.js';
import { yardWait } from '../lib/explain.js';

const N = (kind, time) => ({ kind, pos: [0, 0], ...(time ? { time } : {}) });
const E = (id, from, to, len) => ({ id, from, to, len });

// 列車ごとに同じ工程の注文を付けた面（締切は十分遠い）
function makeLevel(nodes, edges, trainIds, steps = []) {
  return {
    id: 'X', no: 0, title: 'テスト', headway: 1, burnGrace: 1, par: 99,
    nodes, edges,
    trains: trainIds.map((id) => ({ id, ingredient: 'fish', order: `o-${id}` })),
    orders: trainIds.map((id) => ({ id: `o-${id}`, ingredient: 'fish', steps: [...steps], due: 999 })),
  };
}
const plan = (L, order, choices = {}) => ({ order, paths: Object.fromEntries(L.trains.map((t) => [t.id, buildPath(L, choices[t.id] || {})])) });
const seg = (r, train, key) => r.timeline[train].find((s) => s.key === key);
const arrival = (r, train) => r.results.find((x) => x.train === train).arrivedAt;

describe('出発と占有', () => {
  // 車庫→A（線路1）→切る駅（4分）→配膳。後ろの列車ほど手前で待たされる
  const L = makeLevel(
    { Y: N('yard'), A: N('junction'), C: N('cut', 4), S: N('serve') },
    [E('e1', 'Y', 'A', 1), E('e2', 'A', 'C', 1), E('e3', 'C', 'S', 1)],
    ['a', 'b', 'c', 'd'],
    ['cut'],
  );
  const r = simulate(L, plan(L, ['a', 'b', 'c', 'd']));

  it('k番目の列車は k 分に出庫線へ入る（前が空いていれば）', () => {
    assert.equal(seg(r, 'a', 'e:e1').enter, 0);
    assert.equal(seg(r, 'b', 'e:e1').enter, 1);
    assert.equal(seg(r, 'c', 'e:e1').enter, 2);
  });

  it('駅が埋まっていると手前の線路で待ち、その線路を占有し続けて後ろの列車を塞ぐ', () => {
    // a は 2〜6分に切る駅。b は 3分に駅の手前に着くが、6分まで待つ
    assert.deepStrictEqual(pick(seg(r, 'b', 'e:e2')), { enter: 2, ready: 3, leave: 6, waited: 3, blockedBy: 'a' });
    // c は出庫線を終えた3分に、b が居座る駅の手前の線路へ入れず、出庫線で6分まで待つ
    assert.deepStrictEqual(pick(seg(r, 'c', 'e:e1')), { enter: 2, ready: 3, leave: 6, waited: 3, blockedBy: 'b' });
    // d は 3分に出るはずが、出庫線に c がいるので車庫で6分まで待つ（sim は記録しない。explain が出発予定との差から求める）
    assert.equal(seg(r, 'd', 'e:e1').enter, 6);
    assert.deepStrictEqual(yardWait(L, r, 'd'), { type: 'yard', id: null, key: 'yard', enter: 3, ready: 3, leave: 6, waited: 3, blockedBy: 'c' });
    assert.equal(yardWait(L, r, 'a'), null);
  });

  it('切る駅は何分待っても焦げない／駅を出た分に工程が加わる／最終区間を終えた分に到着', () => {
    assert.deepStrictEqual(r.results.map((x) => x.steps), [['cut'], ['cut'], ['cut'], ['cut']]);
    assert.deepStrictEqual(r.results.map((x) => x.burnt), [false, false, false, false]);
    assert.deepStrictEqual(r.results.map((x) => x.arrivedAt), [7, 11, 15, 19]);
    assert.equal(r.finish, 19);
  });
});

function pick(s) {
  return { enter: s.enter, ready: s.ready, leave: s.leave, waited: s.waited, blockedBy: s.blockedBy };
}

describe('焦げの境界（猶予1分）', () => {
  // 車庫→駅（3分）→配膳。駅の出口の線路が長いほど、後ろの列車は駅で待たされる
  const make = (kind, exitLen) => makeLevel(
    { Y: N('yard'), G: N(kind, 3), S: N('serve') },
    [E('e1', 'Y', 'G', 1), E('e2', 'G', 'S', exitLen)],
    ['a', 'b'],
    [kind],
  );

  it('仕上がりから猶予ちょうど（1分）待って出たら焦げない', () => {
    // a: 駅1〜4分、出口4〜8分。b: 駅4〜7分で仕上がり、出口が空く8分に出る＝待ち1分
    const L = make('grill', 4);
    const r = simulate(L, plan(L, ['a', 'b']));
    assert.deepStrictEqual(pick(seg(r, 'b', 's:G')), { enter: 4, ready: 7, leave: 8, waited: 1, blockedBy: 'a' });
    assert.equal(r.results[1].burnt, false);
    assert.equal(r.cleared, true);
  });

  it('猶予を1分超えたら（待ち2分）焦げる。判定は駅を出る瞬間で、相手は出口をふさいだ列車', () => {
    const L = make('grill', 5);
    const r = simulate(L, plan(L, ['a', 'b']));
    assert.deepStrictEqual(pick(seg(r, 'b', 's:G')), { enter: 4, ready: 7, leave: 9, waited: 2, blockedBy: 'a' });
    assert.equal(r.results[1].burnt, true);
    assert.equal(r.results[1].burntAt, 'G');
    assert.deepStrictEqual(r.problems, [{ train: 'b', order: 'o-b', kind: 'burnt', at: 'G' }]);
  });

  it('煮る駅も火の駅として焦げる', () => {
    const L = make('simmer', 5);
    const r = simulate(L, plan(L, ['a', 'b']));
    assert.equal(r.results[1].burnt, true);
  });

  it('切る駅は同じだけ待っても焦げない', () => {
    const L = make('cut', 5);
    const r = simulate(L, plan(L, ['a', 'b']));
    assert.equal(seg(r, 'b', 's:G').waited, 2);
    assert.equal(r.results[1].burnt, false);
    assert.equal(r.cleared, true);
  });
});

describe('同じ区間を取り合うとき', () => {
  /* 車庫→J1 から3本に分かれ、J2 で合流して配膳へ（合流の線路 X は2分）。
     a（1番手）は遠回り（3分＋1分）、o（2番手）は直通（1分）、b（3番手）は近道（1分＋1分）。
     a と b は 5分に同時に X を待ち、ちょうど5分に o が X を抜ける */
  const L = makeLevel(
    { Y: N('yard'), J1: N('junction'), Ja: N('junction'), Jc: N('junction'), J2: N('junction'), S: N('serve') },
    [E('e1', 'Y', 'J1', 1), E('ea', 'J1', 'Ja', 3), E('eo', 'J1', 'J2', 1), E('ec', 'J1', 'Jc', 1),
      E('ea2', 'Ja', 'J2', 1), E('ec2', 'Jc', 'J2', 1), E('x', 'J2', 'S', 2)],
    ['a', 'o', 'b'],
  );
  const choices = { a: { J1: 'Ja' }, o: { J1: 'J2' }, b: { J1: 'Jc' } };

  it('同じ分に入りたい列車が複数いたら、出発順が早い列車が先（途中で空いても後の列車は割り込めない）', () => {
    const r = simulate(L, plan(L, ['a', 'o', 'b'], choices));
    assert.equal(arrival(r, 'o'), 5);
    assert.equal(seg(r, 'a', 'e:x').enter, 5);
    assert.equal(arrival(r, 'a'), 7);
    assert.deepStrictEqual(pick(seg(r, 'b', 'e:ec2')), { enter: 4, ready: 5, leave: 7, waited: 2, blockedBy: 'a' });
    assert.equal(arrival(r, 'b'), 9);
  });

  it('先に入った列車が区間を持つ（あとから来た列車は、出発順が早くても空くまで待つ）', () => {
    // 合流の線路 X を4分にして、b（1番手）が 3〜7分に占有する。a（2番手）は 6分に着いて 7分まで待つ
    const L2 = { ...L, edges: L.edges.map((e) => (e.id === 'x' ? { ...e, len: 4 } : e)) };
    const r = simulate(L2, plan(L2, ['b', 'a'], choices));
    // b: 出庫0〜1、近道1〜2、2〜3、X 3〜7 → 7分着。a: 出庫1〜2、遠回り2〜5、5〜6で待ち、X が空く7分に入る
    assert.equal(seg(r, 'b', 'e:x').enter, 3);
    assert.deepStrictEqual(pick(seg(r, 'a', 'e:ea2')), { enter: 5, ready: 6, leave: 7, waited: 1, blockedBy: 'b' });
    assert.equal(arrival(r, 'a'), 11);
  });
});

describe('配膳駅は何台でも入れる', () => {
  it('別々の線路から同じ分に着いても、どちらも待たない', () => {
    // a（1番手）は Jb 経由で配膳まで2分、b（2番手）は Ja 経由で1分。どちらも 4分に着く
    const L = makeLevel(
      { Y: N('yard'), J1: N('junction'), Ja: N('junction'), Jb: N('junction'), S: N('serve') },
      [E('e1', 'Y', 'J1', 1), E('ea', 'J1', 'Ja', 1), E('eb', 'J1', 'Jb', 1), E('ea2', 'Ja', 'S', 1), E('eb2', 'Jb', 'S', 2)],
      ['a', 'b'],
    );
    const r = simulate(L, plan(L, ['a', 'b'], { a: { J1: 'Jb' }, b: { J1: 'Ja' } }));
    assert.deepStrictEqual(r.results.map((x) => x.arrivedAt), [4, 4]);
    assert.ok(Object.values(r.timeline).flat().every((s) => s.waited === 0));
    assert.equal(r.finish, 4);
  });
});
