// 画面の型の境目と、全8面×7つの画面幅で盤（1マス36px以上）と操作が最初の画面に収まること（余り8px以上）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMode, cellSize, spareHeight, reserveOf, padHeight, SIZES, CELL_MIN, SLACK, gutter } from '../lib/layout.js';
import { LEVELS } from '../lib/levels-data.js';

describe('layoutMode の境目', () => {
  it('幅 699/700：700 から横長（short か wide）', () => {
    assert.equal(layoutMode(699, 800), 'tall');
    assert.equal(layoutMode(700, 800), 'wide');
  });

  it('横長の高さ 499/500', () => {
    assert.equal(layoutMode(844, 499), 'short');
    assert.equal(layoutMode(844, 500), 'wide');
  });

  it('縦長の高さ 619/620 と 759/760', () => {
    assert.equal(layoutMode(390, 619), 'tiny');
    assert.equal(layoutMode(390, 620), 'compact');
    assert.equal(layoutMode(390, 759), 'compact');
    assert.equal(layoutMode(390, 760), 'tall');
  });

  it('主な画面幅の型：390×844 tall・375×667 compact・320×568 tiny・844×390 short・1440×900 wide', () => {
    assert.deepEqual(
      [[390, 844], [375, 667], [320, 568], [844, 390], [1440, 900]].map(([w, h]) => layoutMode(w, h)),
      ['tall', 'compact', 'tiny', 'short', 'wide'],
    );
  });

  it('拡大200%：1440×900 の200%は CSS の画面幅 720×450（short）、390×844 の200%は 195×422（tiny）', () => {
    assert.equal(layoutMode(720, 450), 'short');
    assert.equal(layoutMode(195, 422), 'tiny');
  });
});

describe('寸法の表', () => {
  it('十字ボタンの高さ＝3段＋すき間2つ。操作の1辺は 60/52/48/52/64px', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(SIZES).map(([k, s]) => [k, s.pad])), { tall: 60, compact: 52, tiny: 48, short: 52, wide: 64 });
    assert.equal(padHeight(SIZES.tall), 60 * 3 + 8 * 2);
    assert.equal(padHeight(SIZES.compact), 52 * 3 + 6 * 2);
  });

  it('左右の余白は幅 400 未満が12px、それ以上が16px', () => {
    assert.equal(gutter(399), 12);
    assert.equal(gutter(400), 16);
  });
});

const VIEWS = [[390, 844], [375, 667], [320, 568], [844, 390], [1440, 900], [768, 1024], [360, 800]];

describe('全8面×7つの画面幅：マス36px以上・余り8px以上（node reference/layout-table.mjs の表と同じ）', () => {
  for (const L of LEVELS) {
    const cols = L.board[0].length;
    const rows = L.board.length;
    it(`面${L.no}（${cols}×${rows}）`, () => {
      for (const [vw, vh] of VIEWS) {
        const cell = cellSize({ vw, vh, cols, rows });
        const spare = spareHeight({ vw, vh, cols, rows });
        assert.ok(cell >= CELL_MIN, `${vw}×${vh}：マス ${cell}px`);
        assert.ok(spare >= SLACK, `${vw}×${vh}：余り ${spare}px（${SLACK}px 以上）`);
      }
    });
  }

  it('表と同じ数字：面8は 390×844 で 45px・余り45、320×568 で 36px・余り12、844×390 で 46px・余り8', () => {
    const f = (vw, vh) => ({ cell: cellSize({ vw, vh, cols: 8, rows: 7 }), spare: spareHeight({ vw, vh, cols: 8, rows: 7 }) });
    assert.deepEqual(f(390, 844), { cell: 45, spare: 45 });
    assert.deepEqual(f(320, 568), { cell: 36, spare: 12 });
    assert.deepEqual(f(844, 390), { cell: 46, spare: 8 });
  });
});

describe('reserve（実測した盤以外の高さ）を渡すと、その値で盤の高さが決まる', () => {
  it('reserve を大きくするとマスが小さくなり、小さくすると上限（tall は56px）で止まる', () => {
    const base = { vw: 390, vh: 844, cols: 6, rows: 8 };
    assert.equal(cellSize({ ...base, reserve: 500 }), Math.floor((844 - 500 - SLACK) / 8));
    assert.equal(cellSize({ ...base, reserve: 300 }), 56);
    assert.equal(cellSize({ ...base, reserve: 700 }), CELL_MIN);
  });

  it('reserve を渡さなければ設計の値（reserveOf）を使う', () => {
    const base = { vw: 390, vh: 844, cols: 7, rows: 6 };
    assert.equal(cellSize(base), cellSize({ ...base, reserve: reserveOf('tall') }));
  });

  it('spareHeight は reserve で変わる（足りなければ負の数）', () => {
    const base = { vw: 390, vh: 844, cols: 8, rows: 8 };
    assert.ok(spareHeight({ ...base, reserve: 900 }) < 0);
    assert.equal(spareHeight({ ...base, reserve: 484 }), 844 - 484 - 8 * cellSize({ ...base, reserve: 484 }));
  });
});
