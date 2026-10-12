// 再生の時計の進め方：「ジリジリ」の間だけ1分を1.2秒かけ、ほかは1分＝0.5秒（2倍で0.25秒）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../lib/levels-data.js';
import { simulate, buildPath } from '../lib/sim.js';
import { sizzleWindows, advance, SEC_PER_MIN, SIZZLE_SEC_PER_MIN } from '../lib/playback.js';

const L = Object.fromEntries(LEVELS.map((x) => [x.id, x]));
const run = (level, order, choices = {}) => simulate(level, {
  order,
  paths: Object.fromEntries(level.trains.map((t) => [t.id, buildPath(level, choices[t.id] || {})])),
});

// 時刻 from から、画面の1コマ（1/60秒）ずつ進めて to に届くまでのコマ数
function framesBetween(windows, speed, from, to) {
  let t = from;
  let n = 0;
  while (t < to - 1e-9) {
    t = advance(t, 1 / 60, speed, windows);
    n += 1;
  }
  return n;
}

describe('「ジリジリ」の時間帯', () => {
  it('面4の焦げる組み方：卵は3分の焼く駅で9分に仕上がり、焦げた瞬間の11分まで。煮物の列車は14分に仕上がり、15分に出た（猶予の1分）', () => {
    const sim = run(L.L4, ['t1', 't2', 't3', 't4'], { t1: { J1: 'G2' } });
    assert.deepStrictEqual(sizzleWindows(L.L4, sim), [[9, 11], [14, 15]]);
  });

  it('仕上がってすぐ出た駅は含めない。猶予の1分だけ待って出た駅は、その1分', () => {
    const sample = run(L.L6, L.L6.solution.order, L.L6.solution.choices);
    assert.deepStrictEqual(sizzleWindows(L.L6, sample), []);
    const wins = sizzleWindows(L.L4, run(L.L4, L.L4.solution.order, L.L4.solution.choices));
    for (const [a, b] of wins) assert.ok(b - a >= 1 && b - a <= 2);
  });
});

describe('時計の進め方', () => {
  it('ふだんは1分＝0.5秒、2倍で0.25秒', () => {
    assert.equal(SEC_PER_MIN, 0.5);
    assert.equal(advance(0, 0.5, 1, []), 1);
    assert.equal(advance(0, 0.5, 2, []), 2);
  });

  it('「ジリジリ」の間は、1倍でも2倍でも1分を1.2秒かけて進む（実時間で1.2秒以上見える）', () => {
    assert.equal(SIZZLE_SEC_PER_MIN, 1.2);
    for (const speed of [1, 2]) {
      // 1分の「ジリジリ」はちょうど1.2秒（1.19秒ではまだ届かない）
      assert.ok(Math.abs(advance(9, 1.2, speed, [[9, 10]]) - 10) < 1e-9);
      assert.ok(advance(9, 1.19, speed, [[9, 10]]) < 10);
      // 焦げる場合（2分の「ジリジリ」）は2.4秒
      assert.ok(Math.abs(advance(9, 2.4, speed, [[9, 11]]) - 11) < 1e-9);
      assert.ok(advance(9, 2.39, speed, [[9, 11]]) < 11);
      // 画面の1コマずつ進めても同じ（72コマ＝1.2秒）
      assert.equal(framesBetween([[9, 10]], speed, 9, 10), 72);
    }
    // 窓の外は、1倍で30コマ（0.5秒）・2倍で15コマ
    assert.equal(framesBetween([], 1, 3, 4), 30);
    assert.equal(framesBetween([], 2, 3, 4), 15);
  });

  it('境目をまたぐ1コマは、境目で速さを切り替える（窓の前後で進みすぎない）', () => {
    // 8.9分から実時間0.1秒：8.9→9.0 は0.05秒（1分＝0.5秒）、残り0.05秒は1分＝1.2秒の速さ
    const t = advance(8.9, 0.1, 1, [[9, 10]]);
    assert.ok(Math.abs(t - (9 + 0.05 / 1.2)) < 1e-9, String(t));
    // 窓の終わりをまたぐとき：9.95分から0.1秒 → 10.0 まで0.06秒、残り0.04秒は1分＝0.5秒
    const u = advance(9.95, 0.1, 1, [[9, 10]]);
    assert.ok(Math.abs(u - (10 + 0.04 / 0.5)) < 1e-9, String(u));
  });
});
