// lib/sim.js が基準（reference/sim.mjs）と同じであること、全8面の見本の解・最初の位置・罠、見つかった理由5種類の手順。
// 変異テストでは SIM_PATH の sim.js を読む（load-sim.mjs）。壊した sim では、ここのどれかが必ず落ちる。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sim } from './load-sim.mjs';
import { LEVELS } from '../lib/levels-data.js';

const { loadLevel, initialState, act, replay, canWin, starsFor, beams, scene, DEAD_CHECK_LIMIT } = sim;

const REF_DIR = new URL('../../.agent-harness/runs/day066-hakokage-kaito/reference/', import.meta.url);
const HAS_REF = existsSync(fileURLToPath(new URL('sim.mjs', REF_DIR)));
const lines = (url) => readFileSync(fileURLToPath(url), 'utf8').split('\n');

describe('基準との同一性（4行目以降が一字一句同じ）', { skip: HAS_REF ? false : '基準のファイルが無い（.agent-harness/runs/day066-hakokage-kaito/reference/）' }, () => {
  it('lib/sim.js の4行目以降は reference/sim.mjs と同じ', () => {
    assert.deepStrictEqual(lines(new URL('../lib/sim.js', import.meta.url)).slice(3), lines(new URL('sim.mjs', REF_DIR)).slice(3));
  });

  it('lib/layout.js の4行目以降は reference/layout.mjs と同じ', () => {
    assert.deepStrictEqual(lines(new URL('../lib/layout.js', import.meta.url)).slice(3), lines(new URL('layout.mjs', REF_DIR)).slice(3));
  });
});

describe('全8面の見本の解・最初の位置・罠', () => {
  it('8面あり、番号と id が順に並ぶ', () => {
    assert.equal(LEVELS.length, 8);
    LEVELS.forEach((L, i) => {
      assert.equal(L.no, i + 1);
      assert.equal(L.id, `L${i + 1}`);
    });
  });

  for (const L of LEVELS) {
    describe(`面${L.no}「${L.name}」`, () => {
      const level = loadLevel(L);

      it('見本の解で出口に着き、手数＝par・★3', () => {
        const r = replay(level, L.solution);
        assert.equal(r.ok, true, `見本の解が途中で無効 ${r.reason ?? ''}`);
        assert.equal(r.state.status, 'escaped');
        assert.equal(r.state.steps, L.par);
        assert.equal(L.solution.length, L.par);
        assert.equal(starsFor(L.par, r.state.steps), 3);
      });

      it('見本の解の途中で見つからない（各手のあとも play のまま、最後だけ escaped）', () => {
        const r = replay(level, L.solution);
        r.history.slice(0, -1).forEach((s, i) => assert.equal(s.status, 'play', `${i}手目のあと`));
      });

      it('最初の位置は光っていない', () => {
        const s = initialState(level);
        const lit = beams(level, s).some((b) => b.cells.some((c) => c[0] === s.player[0] && c[1] === s.player[1]));
        assert.equal(lit, false);
      });

      it('最初の状態は dead でなく、scene() が予告を持つ', () => {
        const s = initialState(level);
        assert.notEqual(canWin(level, s), 'dead');
        assert.ok(scene(level, s).preview, '予告がある');
      });

      if (L.trap) {
        it(`罠の手順（${L.trap.moves}）の後は canWin が 'dead'（既定の上限のまま）。罠の1手前は dead でなく、上限なしで調べれば 'alive'`, () => {
          const r = replay(level, L.trap.moves);
          assert.equal(r.ok, true);
          assert.equal(r.state.status, 'play', '罠の途中で見つかっていない');
          assert.equal(canWin(level, r.state), 'dead');
          const before = r.history[r.history.length - 2];
          // 既定の上限では、まだ解ける状態が 'unknown' になる面がある（面8）。'unknown' は何も出さないだけで害がない。大事なのは dead と言わないこと
          assert.notEqual(canWin(level, before), 'dead');
          assert.equal(canWin(level, before, Infinity), 'alive');
        });
      }
    });
  }

  it('詰み検出の上限は1万状態', () => {
    assert.equal(DEAD_CHECK_LIMIT, 10000);
  });
});

describe('見つかった理由の手順（E2E が使う手順と手数を、先に単体で固定する）', () => {
  const run = (no, moves) => {
    const level = loadLevel(LEVELS[no - 1]);
    const r = replay(level, moves);
    assert.equal(r.ok, true, `面${no} ${moves} が途中で無効 (${r.reason})`);
    assert.equal(r.state.status, 'caught', `面${no} ${moves} で見つかる`);
    return r.state.caught;
  };

  it('walked-in＝面1 DD（2手目）', () => {
    const c = run(1, 'DD');
    assert.equal(c.reason, 'walked-in');
    assert.equal(c.step, 2);
    assert.equal(c.phase, 'move');
  });

  it('uncovered＝面1 LLDD（4手目）', () => {
    const c = run(1, 'LLDD');
    assert.equal(c.reason, 'uncovered');
    assert.equal(c.step, 4);
  });

  it('guard-turn＝面5 RURDDD', () => {
    const c = run(5, 'RURDDD');
    assert.equal(c.reason, 'guard-turn');
    assert.equal(c.phase, 'guard');
    assert.equal(c.source.kind, 'guard');
  });

  it('guard-turn-box＝面7 UUURURDUDDDULLDD', () => {
    const c = run(7, 'UUURURDUDDDULLDD');
    assert.equal(c.reason, 'guard-turn-box');
    assert.equal(c.phase, 'guard');
  });

  it('guard-rotate＝面4 RDD', () => {
    const c = run(4, 'RDD');
    assert.equal(c.reason, 'guard-rotate');
    assert.equal(c.phase, 'guard');
  });

  it('原因の光の通り道（beam）の最後は怪盗のマス、またはそれを通る', () => {
    for (const [no, moves] of [[1, 'DD'], [1, 'LLDD'], [5, 'RURDDD'], [7, 'UUURURDUDDDULLDD'], [4, 'RDD']]) {
      const c = run(no, moves);
      assert.ok(c.beam.length > 0, `面${no} の beam が空`);
      assert.ok(c.beam.some((cell) => cell[0] === c.cell[0] && cell[1] === c.cell[1]), `面${no}：beam が怪盗のマスを含む`);
    }
  });
});

describe('画面で打てる手順（詰みの欄が出ると、画面は先へ進めない）', () => {
  // 手順を1手ずつ進め、箱を押した直後に画面と同じ規則（canWin の既定の上限）で詰みを調べる。詰みになった手の番号（1から）を返す。無ければ 0
  const deadAt = (no, moves) => {
    const level = loadLevel(LEVELS[no - 1]);
    let state = initialState(level);
    for (let i = 0; i < moves.length; i++) {
      const r = act(level, state, moves[i]);
      assert.equal(r.valid, true, `面${no} ${moves} の${i + 1}手目が無効`);
      state = r.state;
      if (state.status !== 'play') return 0;
      if (r.events.some((e) => e.type === 'push') && canWin(level, state) === 'dead') return i + 1;
    }
    return 0;
  };

  it('E2E が打つ「見つかった理由」の手順は、どれも詰みを通らない', () => {
    for (const [no, moves] of [[1, 'DD'], [1, 'LLDD'], [5, 'RURDDD'], [7, 'UUURRURDDDULLLDDR'], [4, 'RDD']]) {
      assert.equal(deadAt(no, moves), 0, `面${no} ${moves}`);
    }
  });

  it('面7の guard-turn-box は UUURRURDDDULLLDDR（17手目）：箱の前で警備員が引き返して見つかる', () => {
    const level = loadLevel(LEVELS[6]);
    const r = replay(level, 'UUURRURDDDULLLDDR');
    assert.equal(r.state.status, 'caught');
    assert.equal(r.state.caught.reason, 'guard-turn-box');
    assert.equal(r.state.caught.step, 17);
    assert.equal(r.state.caught.beam.length, 2);
  });

  it('設計の食い違い：作業記録の 03_gates.md の面7の手順 UUURURDUDDDULLDD は、10手目の箱を押す手で詰みになる（ルールだけで再生すれば16手目に見つかるが、画面は10手目で止まる）', () => {
    assert.equal(deadAt(7, 'UUURURDUDDDULLDD'.slice(0, 10)), 10);
    const r = replay(loadLevel(LEVELS[6]), 'UUURURDUDDDULLDD');
    assert.equal(r.state.status, 'caught');
    assert.equal(r.state.caught.reason, 'guard-turn-box');
  });

  it('面3の罠 RRRRDD は6手目（最後の箱を押す手）で詰みになる', () => {
    assert.equal(deadAt(3, 'RRRRDD'), 6);
  });
});
