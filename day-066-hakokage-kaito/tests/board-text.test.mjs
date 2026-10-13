// 「盤を文で読む」の、光っているマス・次の1手で光るマス・影のマスが、同じ状態の scene() と一致すること（全8面の最初と見本の解の各手のあと）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sim } from './load-sim.mjs';
import { LEVELS } from '../lib/levels-data.js';
import { boardLines, LABEL_LIT, LABEL_NEXT, LABEL_SHADOW } from '../lib/board-text.js';

const { loadLevel, initialState, act, scene } = sim;

// 行の「左から{x}・上から{y}」を、内部の座標（0から）の集合にする。「なし」は空
const cells = (line) => new Set([...line.matchAll(/左から(\d+)・上から(\d+)/g)].map((m) => `${Number(m[1]) - 1},${Number(m[2]) - 1}`));
const lineOf = (lines, label) => {
  const hit = lines.filter((l) => l.startsWith(`${label}：`));
  assert.equal(hit.length, 1, `${label} の行が1つ`);
  return hit[0];
};
const sameSet = (a, b, msg) => assert.deepEqual([...a].sort(), [...b].sort(), msg);

describe('盤を文で読む：光・予告・影が scene() と一致する', () => {
  for (const L of LEVELS) {
    it(`面${L.no}「${L.name}」：最初と見本の解の各手のあと（${L.par + 1}状態）`, () => {
      const level = loadLevel(L);
      let state = initialState(level);
      const states = [state];
      for (const a of L.solution) {
        const r = act(level, state, a);
        assert.equal(r.valid, true);
        state = r.state;
        states.push(state);
      }
      states.forEach((s, i) => {
        const lines = boardLines(level, s);
        const sc = scene(level, s);
        sameSet(cells(lineOf(lines, LABEL_LIT)), sc.lit, `面${L.no} ${i}手目の光`);
        const next = new Set((sc.preview ? sc.preview.beams : []).flatMap((b) => b.cells.map((c) => c.join())));
        sameSet(cells(lineOf(lines, LABEL_NEXT)), next, `面${L.no} ${i}手目の予告`);
        sameSet(cells(lineOf(lines, LABEL_SHADOW)), new Set(sc.shadows.map((x) => x.cell.join())), `面${L.no} ${i}手目の影`);
      });
    });
  }

  it('光も影も無いときは「なし」と読む（面1・見張りの光が箱で止まる前の、影の無い状態）', () => {
    const level = loadLevel(LEVELS[0]);
    const lines = boardLines(level, initialState(level));
    assert.equal(lineOf(lines, LABEL_SHADOW), `${LABEL_SHADOW}：なし`);
  });

  it('showNext=false なら、次の1手の欄は「なし」（見つかった・詰み・成功では予告を出さない）', () => {
    const level = loadLevel(LEVELS[0]);
    const lines = boardLines(level, initialState(level), { showNext: false });
    assert.equal(lineOf(lines, LABEL_NEXT), `${LABEL_NEXT}：なし`);
  });
});

describe('盤を文で読む：位置・宝・出口・箱・光源の行', () => {
  it('面2：あなた・宝・出口（閉じている）・箱1・見張り1・見張り2。位置は左から・上から（1から数える）', () => {
    const level = loadLevel(LEVELS[1]);
    const lines = boardLines(level, initialState(level));
    assert.equal(lines[0], 'あなた：左から1・上から2');
    assert.equal(lines[1], '宝：左から6・上から6');
    assert.equal(lines[2], '出口：閉じている（左から6・上から1）');
    assert.equal(lines[3], '箱1：左から2・上から2');
    assert.equal(lines[4], '見張り1：左から1・上から3、向きは右');
    assert.equal(lines[5], '見張り2：左から4・上から6、向きは上');
  });

  it('宝を取ったら「宝：持っている」「出口：開いている」', () => {
    const level = loadLevel(LEVELS[0]);
    let state = initialState(level);
    for (const a of 'LLDRRDD') state = act(level, state, a).state;
    assert.equal(state.treasure, true);
    const lines = boardLines(level, state);
    assert.ok(lines.includes('宝：持っている'));
    assert.ok(lines.some((l) => l.startsWith('出口：開いている')));
  });

  it('面8：警備員（向き）・見張り（向き）・レーザー（向き）の行がある', () => {
    const level = loadLevel(LEVELS[7]);
    const lines = boardLines(level, initialState(level));
    assert.ok(lines.some((l) => /^警備員：.*、向きは右$/.test(l)));
    assert.ok(lines.some((l) => /^見張り：.*、向きは左$/.test(l)));
    assert.ok(lines.some((l) => /^レーザー：.*、向きは上$/.test(l)));
    assert.ok(lines.some((l) => l.startsWith('箱1：')) && lines.some((l) => l.startsWith('箱2：')));
  });
});
