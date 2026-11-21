import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraRig } from '../../lib/camera.js';
import { createGesture } from '../../lib/controls-gesture.js';
import { connectControls } from '../../lib/controls.js';

const pt = (id, x, y, time = 0) => ({ id, x, y, time, kind: 'touch' });
const machine = () => {
  const log = [];
  return { gesture: createGesture((a) => log.push(a)), log };
};

test('1本指は遊び幅を超えた分から回し、離す時の最終位置も使う', () => {
  const { gesture: g, log } = machine();
  g.down(pt(1, 30, 20));
  g.move(pt(1, 32, 21)); assert.deepEqual(log, []);
  g.move(pt(1, 40, 24));
  g.end(pt(1, 45, 22, 100));
  assert.deepEqual(log, [{ type: 'orbit', dx: 10, dy: 4 }, { type: 'orbit', dx: 5, dy: -2 }]);
  assert.equal(g.size, 0);
});

test('2本指の中点と間隔を取り、3本目からの交代で構図が跳ねない', () => {
  const { gesture: g, log } = machine();
  g.down(pt(2, 0, 0)); g.down(pt(9, 20, 0));
  g.move(pt(9, 40, 0));
  assert.deepEqual(log, [{ type: 'pinch', dx: 10, dy: 0, scale: 2 }]);
  g.down(pt(5, 220, 50)); g.move(pt(5, 245, 20));
  assert.equal(log.length, 1);
  g.end(pt(2, 0, 0), true);
  assert.equal(log.length, 1);
  g.move(pt(5, 249, 20));
  assert.equal(log[1].dx, 2); assert.equal(log[1].dy, 0);
  g.end(pt(9, 40, 0)); g.move(pt(5, 260, 25));
  assert.deepEqual(log[2], { type: 'orbit', dx: 11, dy: 5 });
  g.end(pt(5, 260, 25));
  assert.equal(log.length, 3);
});

test('同一点に重なった2本指、使っていない指のキャンセル、2本から1本への復帰', () => {
  const { gesture: g, log } = machine();
  g.down(pt(1, 4, 5)); g.down(pt(2, 4, 5)); g.down(pt(3, 60, 60));
  g.end(pt(3, 80, 80), true); assert.equal(g.size, 2);
  g.move(pt(1, 9, 5));
  assert.deepEqual(log, [{ type: 'pinch', dx: 2.5, dy: 0, scale: 1 }]);
  g.end(pt(1, 9, 5)); g.end(pt(2, 4, 5)); g.end(pt(2, 4, 5), true);
  assert.equal(log.length, 1);
});

test('近くの短い2タップで戻り、長押し・遠いタップ・キャンセルは数えない', () => {
  const { gesture: g, log } = machine();
  function tap(id, x, begin, end, cancel = false) {
    g.down(pt(id, x, 3, begin)); g.end(pt(id, x, 3, end), cancel);
  }
  tap(1, 15, 0, 50); tap(2, 18, 170, 205);
  assert.deepEqual(log.map((a) => a.type), ['tap', 'double-tap']);
  tap(3, 17, 260, 850); tap(4, 17, 900, 920); tap(5, 17, 940, 950, true);
  tap(6, 17, 1020, 1030); tap(7, 77, 1100, 1120); tap(8, 77, 1600, 1640);
  assert.deepEqual(log.slice(2).map((a) => a.type), ['tap', 'tap', 'tap', 'tap']);
  g.clear(); tap(1, 77, 1660, 1670);
  assert.equal(log.at(-1).type, 'tap');
});

test('指を払った時だけ慣性が減衰し、動きを減らす設定とキャンセルで止まる', () => {
  const { gesture: g, log } = machine();
  function swipe(cancel) {
    g.down(pt(5, 0, 0, 0)); g.move(pt(5, 20, 0, 20)); g.end(pt(5, 20, 0, 36), cancel);
  }
  swipe(true); assert.equal(log.filter((a) => a.type === 'fling').length, 0);
  swipe(false); assert.deepEqual(log.at(-1), { type: 'fling', dx: 1000, dy: 0 });
  const rig = createCameraRig();
  rig.touch(); rig.fling(-2, 0);
  for (let i = 0; i < 160; i++) rig.update(1 / 60);
  assert.ok(rig.serialize().yaw < -0.2 && rig.serialize().yaw > -0.23);
  const rested = rig.serialize();
  rig.update(1); assert.deepEqual(rig.serialize(), rested);
  rig.fling(-4, 0); rig.stopInertia(); rig.update(0.1);
  assert.deepEqual(rig.serialize(), rested);
  rig.setReducedMotion(true); rig.fling(-4, 0); rig.update(0.1);
  assert.deepEqual(rig.serialize(), rested);
});

class Surface extends EventTarget {
  style = { touchAction: 'pan-y' };
  tabIndex = -1;
  clientHeight = 400;
  captured = new Set();
  focus() {}
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  getAttribute() { return this.tabIndex < 0 ? null : String(this.tabIndex); }
  setAttribute(name, value) { if (name === 'tabindex') this.tabIndex = Number(value); }
  removeAttribute() { this.tabIndex = -1; }
}

function fire(target, type, props) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, props);
  target.dispatchEvent(event);
  return event;
}

test('ページ外側の縦スクロールと矢印を保ち、3Dのキー・ホイールだけを処理する', () => {
  const canvas = new Surface(), page = new Surface();
  const rig = createCameraRig();
  const controls = connectControls(canvas, { rig, reducedMotion: true });
  assert.equal(canvas.style.touchAction, 'none'); assert.equal(page.style.touchAction, 'pan-y');
  assert.equal(canvas.tabIndex, 0);
  const home = rig.serialize();
  for (const e of [fire(page, 'wheel', { deltaY: 40 }), fire(page, 'keydown', { key: 'ArrowLeft' }),
    fire(canvas, 'keydown', { key: 'ArrowLeft', ctrlKey: true }), fire(canvas, 'keydown', { key: ' ' })]) {
    assert.equal(e.defaultPrevented, false);
  }
  assert.deepEqual(rig.serialize(), home);
  assert.equal(fire(canvas, 'keydown', { key: 'ArrowRight' }).defaultPrevented, true);
  assert.ok(rig.serialize().yaw > home.yaw);
  fire(canvas, 'keydown', { key: '+' }); assert.ok(rig.serialize().distance < home.distance);
  fire(canvas, 'keydown', { key: '-' }); assert.ok(Math.abs(rig.serialize().distance - home.distance) < 1e-9);
  assert.equal(fire(canvas, 'wheel', { deltaY: 1, deltaMode: 1 }).defaultPrevented, true);
  assert.ok(rig.serialize().distance > home.distance);
  fire(canvas, 'keydown', { key: 'Home' }); assert.deepEqual(rig.serialize(), home);
  controls.dispose();
  assert.equal(canvas.style.touchAction, 'pan-y'); assert.equal(canvas.tabIndex, -1);
  assert.equal(fire(canvas, 'wheel', { deltaY: 100, deltaMode: 0 }).defaultPrevented, false);
});

test('指の捕捉・解放・キャンセル・練習への切替と、動きを減らす設定を反映する', () => {
  const canvas = new Surface(), media = new EventTarget(), rig = createCameraRig();
  media.matches = false;
  canvas.ownerDocument = { defaultView: { matchMedia: () => media } };
  let touched = 0;
  const controls = connectControls(canvas, { rig, onUser: () => touched++ });
  const pointer = (type, id, x, y) => fire(canvas, type,
    { pointerId: id, clientX: x, clientY: y, button: 0, pointerType: 'touch' });
  pointer('pointerdown', 4, 15, 20); pointer('pointermove', 4, 35, 20);
  assert.ok(canvas.hasPointerCapture(4)); assert.equal(rig.userTouched, true);
  assert.equal(rig.serialize().yaw, 0);
  media.matches = true; media.dispatchEvent(new Event('change'));
  assert.ok(rig.serialize().yaw < 0);
  pointer('pointerdown', 8, 40, 20);
  const before = rig.serialize();
  pointer('pointermove', 8, 55, 23);
  assert.ok(rig.serialize().distance < before.distance);
  assert.notDeepEqual(rig.serialize().target, before.target);
  pointer('pointercancel', 4, 35, 20); assert.deepEqual([...canvas.captured], [8]);
  pointer('lostpointercapture', 8, 55, 23); assert.equal(canvas.captured.size, 0);
  assert.equal(touched, 1);
  pointer('pointerdown', 1, 1, 1);
  controls.setEnabled(false); assert.equal(canvas.captured.size, 0);
  const frozen = rig.serialize();
  pointer('pointerdown', 5, 5, 5); pointer('pointermove', 5, 100, 1);
  assert.deepEqual(rig.serialize(), frozen);
  controls.setEnabled(true);
  for (const id of [3, 4]) { pointer('pointerdown', id, 10, 20); pointer('pointerup', id, 11, 21); }
  assert.equal(rig.userTouched, false); assert.equal(rig.serialize().yaw, 0);
  controls.dispose();
});
