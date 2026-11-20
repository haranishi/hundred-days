import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../panels.css', import.meta.url), 'utf8');

test('強調色の名前を1行に保ち、選択肢に44px以上の押せる範囲を確保する', () => {
  const label = css.match(/\.cs-accent-choices \.cs-choice-text\s*\{([^}]+)\}/u)?.[1] ?? '';
  assert.match(label, /white-space:\s*nowrap/u);
  const control = css.match(/\.cs-choice,\s*\.cs-check\s*\{([^}]+)\}/u)[1];
  for (const value of ['min-width', 'min-height']) {
    const minimum = control.match(new RegExp(value + ':\\s*(\\d+)px'))?.[1];
    assert.ok(Number(minimum) >= 44, value);
  }
});

test('390pxの端末でパネルの左右の余白を引いても、強調色を3列に配置できる列幅を使う', () => {
  const grid = css.match(/\.cs-accent-choices\s*\{[^}]*minmax\(min\(([\d.]+)(px|rem),\s*100%\),\s*1fr\)/u);
  assert.ok(grid);
  const columnMin = Number(grid[1]) * (grid[2] === 'rem' ? 16 : 1);
  // 画面枠とパネルの内側に各16px、列の間に8pxずつ使う。
  const available = 390 - 4 * 16;
  assert.equal(Math.floor((available + 8) / (columnMin + 8)), 3);
});
