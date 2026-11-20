import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createToolMachine } from '../../lib/controls-tools.js';
import { keyCommand } from '../../lib/controls.js';

const first = { id: 1, index: 3 };
const second = { id: 2, index: 8 };
const point = (hit, time = 0) => ({ hit, time });

function logTools(pick = (p) => p.hit) {
  const calls = [];
  const bend = {};
  const record = (name) => (...args) => calls.push([name, ...args]);
  const tools = createToolMachine({
    pick,
    highlight: record('highlight'), cut: record('cut'), pinch: record('pinch'),
    beginBend(hit) { calls.push(['begin', hit]); return hit === first ? bend : null; },
    moveBend: record('bend'), finishBend: record('finish'), splash: record('splash'), water: record('water'),
  });
  return { tools, calls, bend };
}

test('切る候補は別の節へ動くと消え、最初の節に戻して離した時だけ切る', () => {
  const { tools, calls } = logTools();
  assert.equal(tools.press(point(first)), false);
  assert.equal(tools.setTool('cut'), true);
  assert.equal(tools.setTool('axe'), false);
  assert.equal(tools.press(point(first)), true);
  tools.move(point(second));
  assert.deepEqual(calls, [['highlight', first, 'cut'], ['highlight', null, 'cut']]);
  tools.finish(point(second));
  assert.deepEqual(calls.slice(2), [['highlight', null]]);
  calls.length = 0;
  tools.press(point(first));
  tools.move(point(second));
  tools.move(point(first));
  tools.finish(point(first));
  assert.deepEqual(calls, [
    ['highlight', first, 'cut'], ['highlight', null, 'cut'], ['highlight', first, 'cut'],
    ['highlight', null], ['cut', first],
  ]);
});

test('枝のない場所へ移動して離すと切らず、候補を消す', () => {
  const { tools, calls } = logTools();
  tools.setTool('cut');
  tools.press(point(first));
  tools.move(point(null));
  tools.finish(point(null));
  assert.deepEqual(calls, [['highlight', first, 'cut'], ['highlight', null, 'cut'], ['highlight', null]]);
});

test('枝のない位置からのドラッグは、枝をまたいでも切らず視点操作のまま', () => {
  const { tools, calls } = logTools();
  tools.setTool('cut');
  assert.equal(tools.press(point(null)), false);
  tools.move(point(first));
  tools.finish(point(first));
  assert.deepEqual(calls, []);
});

test('芽摘みも候補を離してから反映し、取り消した指では摘まない', () => {
  const { tools, calls } = logTools();
  tools.setTool('pinch');
  tools.press(point(first));
  tools.cancel();
  tools.finish(point(first));
  assert.deepEqual(calls, [['highlight', first, 'pinch'], ['highlight', null]]);
  tools.press(point(second));
  tools.finish(point(second));
  assert.deepEqual(calls.at(-1), ['pinch', second]);
});

test('切る・芽摘みは座標が同じでも離すときに枝を探し直す', () => {
  for (const id of ['cut', 'pinch']) {
    for (const finalHit of [null, second, { ...first, point: [1, 2, 3] }]) {
      let projected = first;
      const { tools, calls } = logTools(() => projected);
      const fixedPoint = point(first);
      tools.setTool(id);
      tools.press(fixedPoint);
      projected = finalHit;
      tools.finish(fixedPoint);
      assert.deepEqual(calls.filter(([name]) => name === id), finalHit?.id === first.id ? [[id, finalHit]] : [], id);
    }
  }
});

test('曲げは押した枝に目標を渡し続け、道具切り替えでは確定しない', () => {
  const { tools, calls, bend } = logTools();
  tools.setTool('bend');
  tools.press(point(first));
  const target = point(second, 70);
  tools.move(target);
  tools.setTool('pinch');
  tools.finish(target);
  assert.deepEqual(calls, [['begin', first], ['highlight', first, 'bend'], ['bend', bend, target], ['highlight', null], ['finish', bend, false]]);
});

test('曲がらない枝を押してもセッションを更新・確定せず、離した曲げだけを確定する', () => {
  const { tools, calls, bend } = logTools();
  tools.setTool('bend');
  tools.press(point(second));
  tools.move(point(first));
  tools.finish(point(first));
  assert.deepEqual(calls, [['begin', second], ['highlight', second, 'bend'], ['highlight', null]]);
  tools.press(point(first));
  tools.move(point(second));
  tools.finish(point(second));
  assert.deepEqual(calls.at(-1), ['finish', bend, true]);
});

test('水の長押しは途中で粒を出し、時間に応じた量を上限まで確定する', () => {
  const { tools, calls } = logTools();
  tools.setTool('water');
  tools.press(point(null, 10));
  assert.equal(tools.hold(), true);
  assert.deepEqual(calls, [['splash']]);
  tools.finish(point(null, 4010));
  assert.deepEqual(calls.at(-1), ['water', 0.65]);
  tools.press(point(null, 10));
  tools.finish(point(null, 10));
  assert.deepEqual(calls.at(-1), ['water', 0.12]);
});

test('水の道具でもドラッグは視点へ切り替わり、水をやらない', () => {
  const { tools, calls } = logTools();
  tools.setTool('water');
  tools.press(point(null, 10));
  assert.equal(tools.move(point(null, 400), true), true);
  assert.equal(tools.hold(), false);
  tools.finish(point(null, 410));
  assert.ok(!calls.some(([name]) => name === 'water'));
});

test('キーボードは道具・枝・曲げの方向・視点・時間・履歴に対応する', () => {
  for (const [key, tool] of [['1', 'look'], ['2', 'cut'], ['3', 'bend'], ['4', 'pinch'], ['5', 'water']]) {
    assert.deepEqual(keyCommand({ key }), { type: 'tool', value: tool });
  }
  assert.deepEqual(keyCommand({ key: '[' }), { type: 'branch', value: -1 });
  assert.deepEqual(keyCommand({ key: ']' }), { type: 'branch', value: 1 });
  assert.deepEqual(keyCommand({ key: 'Enter' }), { type: 'apply' });
  assert.deepEqual(keyCommand({ key: 'Escape' }), { type: 'cancel' });
  assert.deepEqual(keyCommand({ key: 'ArrowUp' }), { type: 'arrow', value: [0, -1] });
  assert.deepEqual(keyCommand({ key: 'ArrowRight' }), { type: 'arrow', value: [1, 0] });
  assert.deepEqual(keyCommand({ key: 'R' }), { type: 'reset' });
  assert.ok(keyCommand({ key: '+' }).value > 1);
  assert.ok(keyCommand({ key: '-' }).value < 1);
  assert.deepEqual(keyCommand({ key: ' ' }), { type: 'advance', value: 'week' });
  assert.deepEqual(keyCommand({ key: 'z' }), { type: 'undo' });
  assert.deepEqual(keyCommand({ key: 'Z', shiftKey: true }), { type: 'redo' });
  assert.deepEqual(keyCommand({ key: 'z', metaKey: true }), { type: 'undo' });
  for (const event of [{ key: 'Tab' }, { key: 'constructor' }, { key: 'r', ctrlKey: true }, { key: 'ArrowLeft', altKey: true }, { key: 'Enter', isComposing: true }]) {
    assert.equal(keyCommand(event), null);
  }
});
