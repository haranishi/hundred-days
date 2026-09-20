import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHistory, buckets, diagnose, gradeFor, isNight } from '../lib/diagnose.js';

/* 判定は実回線に触らないので、固定の入力で全分岐を押さえられる。
   ここが通っていれば「診断の言い分」は測定の当たり外れと無関係に正しい。 */

const at = (hour, dl, ul = 100) => {
  const d = new Date(2026, 7, 20, hour, 0, 0);
  return { t: d.getTime(), dl, ul };
};
const ids = (result) => result.items.map((i) => i.id);

test('グレードはアイドル時からの増加量で決まる', () => {
  assert.equal(gradeFor(20, 22, 21).grade, 'A+');   // +2ms
  assert.equal(gradeFor(20, 45, 30).grade, 'A');    // +25ms
  assert.equal(gradeFor(20, 70, 30).grade, 'B');    // +50ms
  assert.equal(gradeFor(20, 200, 30).grade, 'C');   // +180ms
  assert.equal(gradeFor(20, 400, 30).grade, 'D');   // +380ms
  assert.equal(gradeFor(20, 900, 30).grade, 'F');   // +880ms
  assert.equal(gradeFor(20, 200, 30).bad, true);
  assert.equal(gradeFor(20, 45, 30).bad, false);
});

test('遅延が測れていなければグレードを出さない', () => {
  const g = gradeFor(null, null, null);
  assert.equal(g.grade, '—');
  assert.equal(g.increase, null);
});

test('負荷で遅延が下がっても、増加量は0未満にしない', () => {
  assert.equal(gradeFor(30, 25, 26).increase, 0);
});

test('DX-1 下りだけ遅い＝宅内は原因になれない', () => {
  const result = diagnose({ dl: 10, ul: 118 }, []);
  assert.ok(ids(result).includes('DX-1'));
  assert.equal(result.items[0].id, 'DX-1');
  assert.match(result.items[0].body, /宅内の機器より外側/);
});

test('DX-2 上りだけ遅い', () => {
  const result = diagnose({ dl: 200, ul: 5 }, []);
  assert.ok(ids(result).includes('DX-2'));
  assert.ok(!ids(result).includes('DX-1'));
});

test('下りも上りも出ていれば非対称の指摘は出ない', () => {
  const result = diagnose({ dl: 300, ul: 200 }, []);
  assert.ok(!ids(result).includes('DX-1'));
  assert.ok(!ids(result).includes('DX-2'));
});

test('DX-3 通信中に遅延が跳ねる', () => {
  const result = diagnose({ dl: 300, ul: 200, grade: 'C', increase: 180 }, []);
  assert.ok(ids(result).includes('DX-3'));
});

test('DX-4 夜だけ遅い＝混雑', () => {
  const history = [at(3, 160), at(10, 150), at(15, 140), at(21, 30), at(22, 20)];
  const result = diagnose({ dl: 20, ul: 90 }, history);
  assert.ok(ids(result).includes('DX-4'));
  assert.match(result.items.find((i) => i.id === 'DX-4').body, /買い替えても直りません/);
});

test('DX-5 いつ測っても遅い', () => {
  const history = [at(3, 8), at(10, 9), at(15, 7), at(21, 8)];
  const result = diagnose({ dl: 8, ul: 9 }, history);
  assert.ok(ids(result).includes('DX-5'));
  assert.ok(!ids(result).includes('DX-4'));
});

test('DX-6 時間帯と関係なく不規則に落ちる', () => {
  const history = [at(3, 200), at(9, 20), at(13, 190), at(16, 15), at(20, 180), at(22, 170)];
  const result = diagnose({ dl: 180, ul: 100 }, history);
  assert.ok(ids(result).includes('DX-6'));
});

test('DX-7 履歴が3件未満なら時間帯の判定を出さない', () => {
  const result = diagnose({ dl: 150, ul: 100 }, [at(21, 150), at(22, 140)]);
  assert.ok(ids(result).includes('DX-7'));
  for (const id of ['DX-4', 'DX-5', 'DX-6']) assert.ok(!ids(result).includes(id));
});

test('DX-8 どれにも当たらなければ「異常なし」を先頭に出す', () => {
  const history = [at(3, 300), at(10, 290), at(15, 310), at(21, 295)];
  const result = diagnose({ dl: 300, ul: 250, grade: 'A' }, history);
  assert.equal(result.items[0].id, 'DX-8');
});

test('問題が見つかったときは「異常なし」を出さない', () => {
  const result = diagnose({ dl: 10, ul: 118 }, []);
  assert.ok(!ids(result).includes('DX-8'));
});

test('重い指摘から順に並ぶ', () => {
  const history = [at(3, 160), at(10, 150), at(15, 140), at(21, 20)];
  const result = diagnose({ dl: 10, ul: 118, grade: 'C', increase: 180 }, history);
  const levels = result.items.map((i) => i.level);
  assert.deepEqual([...levels].sort((a, b) => ({ severe: 0, warn: 1, info: 2, ok: 3 })[a] - ({ severe: 0, warn: 1, info: 2, ok: 3 })[b]), levels);
});

test('夜のサンプルしか無ければ、夜だけ遅いとは言わない', () => {
  const stats = analyzeHistory([at(20, 10), at(21, 12), at(22, 9)]);
  assert.notEqual(stats.pattern, 'night');
  assert.equal(stats.pattern, 'always');
});

test('18時以降を夜として扱う', () => {
  assert.equal(isNight(17), false);
  assert.equal(isNight(18), true);
  assert.equal(isNight(23), true);
});

test('壊れた履歴が混ざっても集計は落ちない', () => {
  const stats = analyzeHistory([at(3, 100), null, { t: NaN, dl: 5 }, { t: Date.now() }, at(10, 200)]);
  assert.equal(stats.count, 2);
});

test('3時間刻みの集計は測定のある枠だけ数える', () => {
  const rows = buckets([at(1, 100), at(2, 200), at(22, 10)]);
  const zero = rows.find((r) => r.label === '00-03時');
  assert.equal(zero.count, 2);
  assert.equal(zero.dl, 150);
  assert.equal(rows.find((r) => r.label === '21-24時').count, 1);
  assert.equal(rows.find((r) => r.label === '12-15時').count, 0);
});
