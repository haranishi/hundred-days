import { it, expect } from 'vitest';
import { createTouchState, createTouch } from '../../src/input/touch.js';
class Element extends EventTarget {
  constructor(control) { super(); this.dataset = { control }; this.captured = []; }
  setPointerCapture(id) { this.captured.push(id); }
}
function pointer(el, type, id, x = 100, y = 200) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch' }); el.dispatchEvent(e);
}
it('指の初期位置が中心・2本目のジャンプ・離す順序は独立', () => {
  const s = createTouchState(); s.down(11, 'steer', 170, 380); s.move(11, 224, 326);
  s.down(22, 'jump', 320, 500); expect(s.sample()).toEqual({ steer: 1, tuck: 1, brake: 0, jump: true, grab: 0 });
  s.up(22); expect(s.sample().jump).toBe(false); expect(s.sample().steer).toBe(1);
  expect(s.down(33, 'steer', 0, 0)).toBe(false); s.up(11); expect(s.sample().steer).toBe(0);
});
it('制動と舵の合成・取消と単発操作', () => {
  const actions = [], s = createTouchState({ onAction: a => actions.push(a) });
  s.down(1, 'steer', 0, 0); s.move(1, -54, 54); s.down(2, 'brake', 0, 0);
  expect(s.sample().brake).toBe(1); s.up(2); expect(s.sample().brake).toBe(1);
  s.down(3, 'camera', 0, 0); s.up(3, true); s.down(4, 'pause', 0, 0); s.up(4); s.up(4);
  expect(actions).toEqual(['pause']); s.clear(); expect(s.sample().brake).toBe(0);
});
it('Pointer Eventsの2本目のpointerupを受け、取消と廃棄で解除', () => {
  const steer = new Element('steer'), jump = new Element('jump'), pause = new Element('pause'); const actions = [];
  const t = createTouch({ root: { querySelectorAll: () => [steer, jump, pause] } });
  t.setCallbacks({ onAction: a => actions.push(a), onUse: () => {} });
  pointer(steer, 'pointerdown', 1); pointer(steer, 'pointermove', 1, 154, 200);
  pointer(jump, 'pointerdown', 2); expect(t.sample().jump).toBe(true);
  pointer(jump, 'pointerup', 2); expect(t.sample().jump).toBe(false); expect(t.sample().steer).toBe(1);
  pointer(pause, 'pointerdown', 3); pointer(pause, 'pointerup', 3); expect(actions).toEqual(['pause']);
  pointer(steer, 'pointercancel', 1); expect(t.sample().steer).toBe(0); expect(jump.captured).toEqual([2]);
  t.dispose(); pointer(jump, 'pointerdown', 2); expect(t.sample().jump).toBe(false);
});
