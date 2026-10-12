// lib/sim.js が基準（reference/sim.mjs）と同じ結果を返すこと、見本と初期設定の結果、期待値。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as lib from '../lib/sim.js';
import { LEVELS } from '../lib/levels-data.js';
import { allPlans, permutations } from './solver.mjs';

const REF_URL = new URL('../../.agent-harness/runs/day065-teikoku-gohan/reference/sim.mjs', import.meta.url);
const HAS_REF = existsSync(fileURLToPath(REF_URL));

const pathsFor = (L, choices) => Object.fromEntries(L.trains.map((t) => [t.id, lib.buildPath(L, choices[t.id] || {})]));
const samplePlan = (L) => ({ order: [...L.solution.order], paths: pathsFor(L, L.solution.choices) });
const defaultPlan = (L) => ({ order: L.trains.map((t) => t.id), paths: pathsFor(L, {}) });

// 乱数の種を固定した疑似乱数（突き合わせる計画を毎回同じにする）
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/* 突き合わせる計画：正しい料理になる全計画（allPlans）＋見本＋初期設定＋どんな経路でもよい計画。
   経路の組が少ない面（L1・L2・L4）は全経路×全順列、多い面は固定の種で4000件を選ぶ */
function plansToCompare(L) {
  const plans = [samplePlan(L), defaultPlan(L), ...allPlans(L)];
  const ids = L.trains.map((t) => t.id);
  const paths = lib.allPaths(L);
  const combos = paths.length ** ids.length;
  const perms = [...permutations(ids)];
  if (combos * perms.length <= 5000) {
    for (let m = 0; m < combos; m++) {
      let x = m;
      const p = {};
      for (const id of ids) {
        p[id] = paths[x % paths.length];
        x = Math.floor(x / paths.length);
      }
      for (const order of perms) plans.push({ order, paths: p });
    }
  } else {
    const rnd = lcg(65 * 1000 + L.no);
    for (let i = 0; i < 4000; i++) {
      const p = Object.fromEntries(ids.map((id) => [id, paths[Math.floor(rnd() * paths.length)]]));
      plans.push({ order: perms[Math.floor(rnd() * perms.length)], paths: p });
    }
  }
  return plans;
}

describe('基準（reference/sim.mjs）との突き合わせ', { skip: HAS_REF ? false : '基準のファイルが無い（.agent-harness/runs/day065-teikoku-gohan/reference/）' }, () => {
  it('全6面で、simulate の戻り値（timeline・待ち・相手・焦げ・到着・finish）が完全に一致する', async () => {
    const ref = await import(REF_URL.href);
    let compared = 0;
    for (const L of LEVELS) {
      for (const plan of plansToCompare(L)) {
        assert.deepStrictEqual(lib.simulate(L, plan), ref.simulate(L, plan), `${L.id} ${plan.order.join(',')}`);
        compared++;
      }
    }
    assert.ok(compared > 10000, `突き合わせた計画が少なすぎる: ${compared}`);
  });

  it('経路の組み立て・区間・星・定数も一致する', async () => {
    const ref = await import(REF_URL.href);
    assert.deepStrictEqual(lib.KINDS, ref.KINDS);
    for (const L of LEVELS) {
      assert.equal(lib.yardOf(L), ref.yardOf(L));
      assert.deepStrictEqual(lib.allPaths(L), ref.allPaths(L));
      for (const path of lib.allPaths(L)) assert.deepStrictEqual(lib.sectionsOf(L, path), ref.sectionsOf(L, path));
      // 分岐ごとの選び方（未指定・無効な指定を含む）から作る経路
      const branches = Object.keys(L.nodes).filter((n) => L.edges.filter((e) => e.from === n).length > 1);
      for (const n of branches) {
        for (const e of [...L.edges.filter((x) => x.from === n), { to: 'Z' }]) {
          const choices = { [n]: e.to };
          assert.deepStrictEqual(lib.buildPath(L, choices), ref.buildPath(L, choices));
        }
      }
      for (const finish of [L.par - 1, L.par, L.par + 1, L.par + 2, L.par + 9]) {
        for (const cleared of [true, false]) {
          assert.equal(lib.starsOf(L, { cleared, finish }), ref.starsOf(L, { cleared, finish }));
        }
      }
    }
    assert.throws(() => lib.edgeOf(LEVELS[0], 'Y', 'S'));
  });
});

// 期待値（基準で計算し、L2 は手でも確かめた：牛肉 0分発→焼く3〜6分→7分着、にんじん 1分発→焼く駅の手前で2分待ち→10分着）
const SAMPLE_EXPECT = {
  L1: { finish: 7, arrivals: { t1: 7 }, waits: { t1: 0 } },
  L2: { finish: 10, arrivals: { t2: 7, t1: 10 }, waits: { t2: 0, t1: 2 } },
  L3: { finish: 14, arrivals: { t2: 9, t3: 13, t1: 10, t4: 14 }, waits: { t2: 0, t3: 0, t1: 1, t4: 0 } },
  L4: { finish: 22, arrivals: { t1: 10, t3: 14, t2: 18, t4: 22 }, waits: { t1: 0, t3: 2, t2: 5, t4: 8 } },
  L5: { finish: 13, arrivals: { t4: 12, t3: 13, t2: 10, t1: 11 }, waits: { t4: 0, t3: 1, t2: 0, t1: 0 } },
  L6: { finish: 21, arrivals: { t1: 9, t4: 12, t2: 15, t3: 18, t5: 21 }, waits: { t1: 0, t4: 0, t2: 0, t3: 1, t5: 5 } },
};
const DEFAULT_EXPECT = {
  L1: { finish: 10, problems: ['t1:wrong'] },
  L2: { finish: 13, problems: ['t1:wrong', 't2:wrong'] },
  L3: { finish: 21, problems: ['t1:wrong', 't2:wrong', 't3:late', 't4:wrong'] },
  L4: { finish: 22, problems: ['t3:wrong', 't4:wrong'] },
  L5: { finish: 20, problems: ['t1:wrong', 't2:wrong', 't3:late', 't4:wrong'] },
  L6: { finish: 25, problems: ['t1:wrong', 't3:wrong', 't4:wrong', 't5:wrong'] },
};

describe('見本と初期設定', () => {
  for (const L of LEVELS) {
    it(`${L.id}「${L.title}」の見本は★★★（finish=${L.par}）で、到着と待ちが期待どおり`, () => {
      const r = lib.simulate(L, samplePlan(L));
      assert.equal(r.cleared, true);
      assert.equal(r.finish, L.par);
      assert.equal(lib.starsOf(L, r), 3);
      const exp = SAMPLE_EXPECT[L.id];
      assert.equal(r.finish, exp.finish);
      assert.deepStrictEqual(Object.fromEntries(r.results.map((x) => [x.train, x.arrivedAt])), exp.arrivals);
      const waits = Object.fromEntries(Object.entries(r.timeline).map(([id, segs]) => [id, segs.reduce((a, s) => a + s.waited, 0)]));
      assert.deepStrictEqual(waits, exp.waits);
    });

    it(`${L.id} の初期設定（登録順・各分岐は先頭の出口）ではクリアできない`, () => {
      const r = lib.simulate(L, defaultPlan(L));
      assert.equal(r.cleared, false);
      assert.equal(lib.starsOf(L, r), 0);
      assert.equal(r.finish, DEFAULT_EXPECT[L.id].finish);
      assert.deepStrictEqual(r.problems.map((p) => `${p.train}:${p.kind}`), DEFAULT_EXPECT[L.id].problems);
    });
  }
});
