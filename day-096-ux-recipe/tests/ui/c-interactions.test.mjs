import test from 'node:test';
import assert from 'node:assert/strict';
import { crossedThreshold, dropIndex, edgeScroll } from '../../lib/dnd.js';
import { keyAction, removeWithUndo } from '../../lib/keys.js';
import { createEditor } from '../../app.js';
import { recipeStages } from '../../lib/ui-goal.js';
import { flowMeter, previewScale } from '../../lib/ui-preview.js';
import { insertionIndex } from '../../lib/ui-palette.js';
import { stageCoverage } from '../../lib/rules.js';
import { MINIMAL, RESERVE_SAMPLE } from '../fixtures/states.js';

test('つまみの4px未満の揺れはクリックとして扱う', () => {
  assert.equal(crossedThreshold(2, 3), false);
  assert.equal(crossedThreshold(-4, 0), true);
  assert.equal(crossedThreshold(3, 3), true);
});

test('落とす位置は元の行を除いた順番。行の高さが違っても上下に動かせる', () => {
  const rows = [{ top: 0, bottom: 20 }, { top: 20, bottom: 100 }, { top: 100, bottom: 160 }];
  assert.equal(dropIndex(rows, 0, 40), 0);
  assert.equal(dropIndex(rows, 0, 61), 1);
  assert.equal(dropIndex(rows, 0, 300), 2);
  assert.equal(dropIndex(rows, 2, 9), 0);
  assert.equal(dropIndex(rows, 2, 11), 1);
  assert.equal(dropIndex(rows, 1, 70), 1);
  assert.equal(dropIndex(rows, -1, 0), -1);
});

test('端に近づくほど速く、外に出ても一定の速さまで。中央では止まる', () => {
  assert.equal(edgeScroll(80, 0, 160), 0);
  assert.ok(edgeScroll(5, 0, 160) < edgeScroll(30, 0, 160));
  assert.ok(edgeScroll(155, 0, 160) > edgeScroll(130, 0, 160));
  assert.equal(edgeScroll(999, 0, 160), -edgeScroll(-999, 0, 160));
  assert.equal(edgeScroll(12, 5, 5), 0);
});

test('キー操作はIME・入力欄・ダイアログに割り込まない', () => {
  assert.equal(keyAction({ key: 'Z', metaKey: true, shiftKey: true }), 'redo');
  assert.equal(keyAction({ key: 'z', ctrlKey: true }), 'undo');
  assert.equal(keyAction({ key: 'y', ctrlKey: true }), 'redo');
  assert.equal(keyAction({ key: 'ArrowUp', altKey: true }), 'up');
  assert.equal(keyAction({ key: 'ArrowDown', altKey: true }), 'down');
  assert.equal(keyAction({ key: 'Escape' }), 'escape');
  assert.equal(keyAction({ key: 'Delete' }), 'remove');
  for (const flags of [{ editing: true }, { modal: true }, { isComposing: true }, { keyCode: 229 }, { repeat: true }]) {
    assert.equal(keyAction({ key: 'Delete', ...flags }), null);
  }
  assert.equal(keyAction({ key: 'Backspace' }), null);
  assert.equal(keyAction({ key: 'z', altKey: true, ctrlKey: true }), null);
});

test('カードの帯は部品順、メーターは5段階順。欠けた段階にも文字がある', () => {
  assert.deepEqual(recipeStages(MINIMAL.blocks), ['notice', 'relief']);
  const meter = flowMeter(stageCoverage(MINIMAL));
  assert.deepEqual(meter.map(item => item.count), [1, 0, 0, 0, 1]);
  assert.equal(meter[1].amount, 'なし');
  const full = flowMeter(stageCoverage(RESERVE_SAMPLE));
  assert.equal(full.reduce((sum, item) => sum + item.count, 0), RESERVE_SAMPLE.blocks.length);
});

test('追加先は指定位置、選んだ部品の直後、省略の順。プレビューは端末の幅に収まる', () => {
  const blocks = MINIMAL.blocks;
  assert.equal(insertionIndex(blocks, blocks[0].id, 0), 0);
  assert.equal(insertionIndex(blocks, blocks[0].id, 9), 2);
  assert.equal(insertionIndex(blocks, blocks[0].id), 1);
  assert.equal(insertionIndex(blocks, 'b999'), undefined);
  assert.equal(previewScale(360, 960), 0.375);
  assert.equal(previewScale(800, 390), 1);
});

test('削除通知から戻すと、消した部品と順序が戻る', () => {
  const ctx = createEditor(MINIMAL);
  let action;
  ctx.toast = (_message, options) => { action = options; };
  removeWithUndo(ctx, 'b1');
  assert.deepEqual(ctx.getState().blocks.map(block => block.id), ['b2']);
  assert.equal(action.actionLabel, '元に戻す');
  action.onAction();
  assert.deepEqual(ctx.getState(), MINIMAL);
});

test('古い削除通知を押しても、その後に書いたサイト名は消えない', () => {
  const ctx = createEditor(MINIMAL);
  let undoRemoval;
  ctx.toast = (_message, options) => { if (options) undoRemoval = options.onAction; };
  removeWithUndo(ctx, 'b2');
  ctx.dispatch({ type: 'setSite', name: 'ひだまり' });
  undoRemoval();
  assert.equal(ctx.getState().site.name, 'ひだまり');
});
