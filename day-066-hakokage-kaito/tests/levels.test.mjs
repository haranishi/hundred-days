// 面データの検査：levels.json の写しと同じこと、par・最短解の本数・届く状態・詰み状態をソルバーで計算し直して一致すること、
// 依頼の検証 V1〜V7 が全面で合格すること、詰み状態の数が DEAD_CHECK_LIMIT より少ないこと。
// ソルバーと検査（solver.mjs・checks.mjs）は reference/solve.mjs・checks.mjs の写し。変異テストでは SIM_PATH の sim.js を読む。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sim } from './load-sim.mjs';
import { LEVELS } from '../lib/levels-data.js';
import { analyze, explore, judge, verifyTrap, RULE } from './checks.mjs';

const { loadLevel, replay, starsFor, DEAD_CHECK_LIMIT } = sim;

const JSON_URL = new URL('../../.agent-harness/runs/day066-hakokage-kaito/levels.json', import.meta.url);
const HAS_JSON = existsSync(fileURLToPath(JSON_URL));

describe('面データの写し', () => {
  it('lib/levels-data.js は levels.json と完全に同じ', { skip: HAS_JSON ? false : 'levels.json が無い（.agent-harness/runs/day066-hakokage-kaito/）' }, () => {
    assert.deepStrictEqual(LEVELS, JSON.parse(readFileSync(fileURLToPath(JSON_URL), 'utf8')));
  });

  it('各面に名前とヒント、par、見本の解、盤（最大8×8）がある。名前は9字まで、ヒントは40字まで（省略せず、狭い画面でも3行以内に収まる長さ。画面幅ごとの実測は E2E が見る）', () => {
    for (const L of LEVELS) {
      assert.ok(L.name && L.name.length <= 9, `${L.id} の名前 ${L.name}`);
      assert.ok(L.hint && L.hint.length <= 40, `${L.id} のヒント ${L.hint}（${L.hint.length}字）`);
      assert.ok(Number.isInteger(L.par) && L.par > 0);
      assert.match(L.solution, /^[URDL.]+$/);
      assert.ok(L.board.length <= 8 && L.board[0].length <= 8, `${L.id} の盤の大きさ`);
    }
  });
});

describe('ソルバーで計算し直した数字が levels.json の stats と一致する', () => {
  const results = [];
  for (const L of LEVELS) {
    describe(`面${L.no}「${L.name}」`, () => {
      const a = analyze(L);
      results.push(a);
      const level = loadLevel(L);
      const ex = explore(level);

      it('最短手数は par、最短解の本数は stats.solutions、届く状態は stats.reachable', () => {
        assert.equal(a.normal.solvable, true);
        assert.equal(a.normal.par, L.par);
        assert.equal(a.normal.count, L.stats.solutions);
        assert.equal(a.normal.reachable, L.stats.reachable);
      });

      it('詰み状態の数は stats.dead と一致し、DEAD_CHECK_LIMIT より少ない（画面の詰み検出が取りこぼさない）', () => {
        assert.equal(ex.dead, L.stats.dead);
        assert.ok(ex.dead < DEAD_CHECK_LIMIT, `詰み状態 ${ex.dead} が上限 ${DEAD_CHECK_LIMIT} 以上`);
      });

      it('見本の解は par 手で出口に着き、★3', () => {
        const r = replay(level, L.solution);
        assert.equal(r.state.status, 'escaped');
        assert.equal(r.state.steps, L.par);
        assert.equal(starsFor(L.par, r.state.steps), 3);
      });

      if (L.trap) {
        it('罠が成り立つ（直前は解け、直後は解けない）', () => {
          const t = verifyTrap(level, L.trap);
          assert.equal(t.ok, true, JSON.stringify(t));
        });
      }
    });
  }

  it('最初の位置が光っていない（V1）', () => {
    for (const a of results) assert.equal(a.initialSeen, false, a.id);
  });

  it('V1〜V7 が全面で合格する', () => {
    const j = judge(results);
    for (const key of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7']) assert.equal(j[key].pass, true, `${key} ${j[key].detail}`);
  });

  it('検査の合格条件の数字は依頼のとおり（V3 は30%以上・3面、V5 は3面、V6 は30%短縮、1面30秒以内）', () => {
    assert.equal(RULE.v3Ratio, 1.3);
    assert.equal(RULE.v3Levels, 3);
    assert.equal(RULE.v5Levels, 3);
    assert.equal(RULE.v6Ratio, 0.7);
    assert.equal(RULE.msPerLevel, 30_000);
  });
});
