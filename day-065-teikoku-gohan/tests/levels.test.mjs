// 面データの形と、ソルバーでの再計算（par・解の数・焦げる計画の数・完食時刻の内訳が stats と一致）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../lib/levels-data.js';
import { KINDS, simulate, buildPath, starsOf } from '../lib/sim.js';
import { DISHES, dishName, MYSTERY_DISH } from '../lib/recipes.js';
import { solve, allPlans } from './solver.mjs';

const JSON_URL = new URL('../../.agent-harness/runs/day065-teikoku-gohan/levels.json', import.meta.url);
const HAS_JSON = existsSync(fileURLToPath(JSON_URL));
const KNOWN_KINDS = new Set(['yard', 'junction', 'serve', ...Object.keys(KINDS)]);

describe('面データの写し', () => {
  it('lib/levels-data.js は levels.json と完全に同じ', { skip: HAS_JSON ? false : 'levels.json が無い（.agent-harness/runs/day065-teikoku-gohan/）' }, () => {
    assert.deepStrictEqual(LEVELS, JSON.parse(readFileSync(JSON_URL, 'utf8')));
  });

  it('6面あり、番号・id が順に並ぶ', () => {
    assert.equal(LEVELS.length, 6);
    LEVELS.forEach((L, i) => {
      assert.equal(L.no, i + 1);
      assert.equal(L.id, `L${i + 1}`);
      assert.equal(L.headway, 1);
      assert.equal(L.burnGrace, 1);
      assert.ok(L.title && L.hint);
    });
  });
});

for (const L of LEVELS) {
  describe(`${L.id}「${L.title}」の盤`, () => {
    const ids = Object.keys(L.nodes);
    const outs = (n) => L.edges.filter((e) => e.from === n);

    it('線路は存在するノードどうしを結び、id は重ならず、長さは正の整数', () => {
      const seen = new Set();
      for (const e of L.edges) {
        assert.ok(L.nodes[e.from] && L.nodes[e.to], `${e.id} ${e.from}->${e.to}`);
        assert.ok(!seen.has(e.id), `線路の id が重なっている ${e.id}`);
        seen.add(e.id);
        assert.ok(Number.isInteger(e.len) && e.len >= 1, `${e.id} の長さ`);
        assert.equal(L.edges.filter((x) => x.from === e.from && x.to === e.to).length, 1, `${e.from}->${e.to} が2本ある`);
      }
    });

    it('ノードの種類が既知で、駅の調理時間は正の整数、座標と曲げ点は盤（360×240）の中', () => {
      const inside = ([x, y]) => x >= 0 && x <= 360 && y >= 0 && y <= 240;
      for (const [id, n] of Object.entries(L.nodes)) {
        assert.ok(KNOWN_KINDS.has(n.kind), `${id} の種類 ${n.kind}`);
        assert.ok(inside(n.pos), `${id} の座標`);
        if (n.time !== undefined) assert.ok(KINDS[n.kind] && Number.isInteger(n.time) && n.time >= 1, `${id} の time`);
      }
      for (const e of L.edges) for (const p of e.via ?? []) assert.ok(inside(p), `${e.id} の曲げ点`);
    });

    it('車庫は1つで出口は1本、配膳駅は1つで行き止まり。ほかのノードは必ず出口を持つ', () => {
      const yards = ids.filter((n) => L.nodes[n].kind === 'yard');
      const serves = ids.filter((n) => L.nodes[n].kind === 'serve');
      assert.equal(yards.length, 1);
      assert.equal(serves.length, 1);
      assert.equal(outs(yards[0]).length, 1, '出庫線は1本だけ');
      assert.equal(outs(serves[0]).length, 0);
      for (const n of ids) if (L.nodes[n].kind !== 'serve') assert.ok(outs(n).length >= 1, `${n} が行き止まり`);
      // 駅は分岐しない（分岐は junction だけ）
      for (const n of ids) if (KINDS[L.nodes[n].kind]) assert.equal(outs(n).length, 1, `${n} は駅なのに出口が複数`);
    });

    it('輪が無い（一方通行で戻れない）', () => {
      const state = {};
      const visit = (n) => {
        if (state[n] === 1) assert.fail(`${n} を通る輪がある`);
        if (state[n] === 2) return;
        state[n] = 1;
        for (const e of outs(n)) visit(e.to);
        state[n] = 2;
      };
      for (const n of ids) visit(n);
    });

    it('全ノードから配膳駅に着き、車庫から全ノードに行ける', () => {
      const serve = ids.find((n) => L.nodes[n].kind === 'serve');
      const reaches = (from) => {
        const stack = [from];
        const seen = new Set();
        while (stack.length) {
          const n = stack.pop();
          if (n === serve) return true;
          if (seen.has(n)) continue;
          seen.add(n);
          for (const e of outs(n)) stack.push(e.to);
        }
        return false;
      };
      for (const n of ids) assert.ok(reaches(n), `${n} から配膳駅へ行けない`);
      const yard = ids.find((n) => L.nodes[n].kind === 'yard');
      const fromYard = new Set([yard]);
      const stack = [yard];
      while (stack.length) for (const e of outs(stack.pop())) if (!fromYard.has(e.to)) { fromYard.add(e.to); stack.push(e.to); }
      assert.deepStrictEqual([...fromYard].sort(), [...ids].sort());
    });

    it('列車と注文は1対1で食材が一致し、注文の料理名は料理表にある', () => {
      assert.equal(L.trains.length, L.orders.length);
      const used = new Set();
      for (const t of L.trains) {
        const o = L.orders.find((x) => x.id === t.order);
        assert.ok(o, `${t.id} の注文が無い`);
        assert.ok(!used.has(o.id), `${o.id} を2本の列車が運ぶ`);
        used.add(o.id);
        assert.equal(o.ingredient, t.ingredient);
        const name = dishName(o.ingredient, o.steps);
        assert.notEqual(name, MYSTERY_DISH, `${o.id} の料理が表に無い`);
        assert.ok(Object.values(DISHES).includes(name));
        assert.ok(Number.isInteger(o.due) && o.due > 0);
      }
    });

    it('見本の解は全列車ぶんあり、その経路で★★★。初期設定ではクリアできない', () => {
      assert.deepStrictEqual([...L.solution.order].sort(), L.trains.map((t) => t.id).sort());
      const paths = Object.fromEntries(L.trains.map((t) => [t.id, buildPath(L, L.solution.choices[t.id] || {})]));
      const r = simulate(L, { order: L.solution.order, paths });
      assert.equal(starsOf(L, r), 3);
      const dflt = simulate(L, { order: L.trains.map((t) => t.id), paths: Object.fromEntries(L.trains.map((t) => [t.id, buildPath(L, {})])) });
      assert.equal(dflt.cleared, false);
    });

    it('ソルバーで計算し直すと、par・解の数・焦げる計画の数・完食時刻の内訳が stats と一致する', () => {
      const s = solve(L);
      assert.equal(s.par, L.par);
      assert.equal(s.clearing, L.stats.clearingPlans);
      assert.equal(s.burntPlans, L.stats.burntPlans);
      assert.equal(s.recipeCorrectPlans, L.stats.recipeCorrectPlans);
      assert.deepStrictEqual(s.finishDistribution, Object.fromEntries(Object.entries(L.stats.finishDistribution).map(([k, v]) => [k, v])));
    });
  });
}

// 面6の締切は 2026-10-12 に変えた（体験評価R2：締切の早い順に並べるだけで1回目に★3になり、最終面が面5より易しかった）
describe('面6「ランチタイム」は、締切の早い順に並べるだけでは解けない', () => {
  const L = LEVELS.find((x) => x.id === 'L6');
  const dish = (tid) => dishName(L.trains.find((t) => t.id === tid).ingredient, L.orders.find((o) => o.id === L.trains.find((t) => t.id === tid).order).steps);

  it('締切は お刺身11・ひと口ステーキ17・角煮19・ゆで卵20・焼きにんじん23分で、登録順は締切の早い順', () => {
    assert.deepStrictEqual(L.trains.map((t) => dish(t.id)), ['お刺身', 'ひと口ステーキ', '角煮', 'ゆで卵', '焼きにんじん']);
    const dues = L.trains.map((t) => L.orders.find((o) => o.id === t.order).due);
    assert.deepStrictEqual(dues, [11, 17, 19, 20, 23]);
  });

  it('par は21分のまま。解は4通り（21分が1・22分が2・23分が1）', () => {
    assert.equal(L.par, 21);
    assert.equal(L.stats.clearingPlans, 4);
    assert.deepStrictEqual(L.stats.finishDistribution, { 21: 1, 22: 2, 23: 1 });
  });

  it('登録順（＝締切の早い順）で出すと、工程が正しいどの組み方でも完食しない', () => {
    const reg = L.trains.map((t) => t.id).join();
    let n = 0;
    for (const plan of allPlans(L)) {
      if (plan.order.join() !== reg) continue;
      n++;
      assert.equal(simulate(L, plan).cleared, false, JSON.stringify(plan));
    }
    assert.ok(n > 0, '登録順の計画が1つも数えられていない');
  });

  it('見本（★3）は お刺身→ゆで卵→ひと口ステーキ→角煮→焼きにんじん。焼き場はステーキが近い側、にんじんが遠い側', () => {
    assert.deepStrictEqual(L.solution.order.map(dish), ['お刺身', 'ゆで卵', 'ひと口ステーキ', '角煮', '焼きにんじん']);
    const near = L.edges.find((e) => e.from === 'J2' && e.to === 'G');
    const far = L.edges.find((e) => e.from === 'J2' && e.to === 'G2');
    assert.ok(near.len < far.len, 'G が近い焼き場、G2 が遠い焼き場');
    assert.equal(L.solution.choices.t2.J2, 'G');
    assert.equal(L.solution.choices.t5.J2, 'G2');
  });
});
