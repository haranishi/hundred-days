import { it, expect } from 'vitest';
import { createKeyboard } from '../../src/input/keyboard.js';
import { createGamepad } from '../../src/input/gamepad.js';
import { createInput } from '../../src/input/index.js';
import { deadzone } from '../../src/input/values.js';
export function key(target, type, code, extra = {}) {
  const e = new Event(type, { cancelable: true }); Object.assign(e, { code, ...extra }); target.dispatchEvent(e);
}
it('キーボードは固定刻みで立ち上がり、戻り、単発操作は繰り返さない', () => {
  const target = new EventTarget(), actions = [];
  const k = createKeyboard({ target, onAction: a => actions.push(a) });
  key(target, 'keydown', 'KeyD'); const first = k.sample(1 / 120).steer;
  expect(first).toBeGreaterThan(0); expect(first).toBeLessThan(.2);
  for (let i = 0; i < 120; i++) k.sample(1 / 120);
  expect(k.sample(0).steer).toBeCloseTo(1, 4);
  key(target, 'keyup', 'KeyD'); expect(k.sample(.05).steer).toBeCloseTo(Math.exp(-1), 4);
  for (const code of ['Escape', 'KeyC', 'KeyR', 'KeyE']) {
    key(target, 'keydown', code); key(target, 'keydown', code, { repeat: true }); key(target, 'keyup', code);
  }
  expect(actions).toEqual(['pause', 'camera', 'drop', 'safe']);
  target.dispatchEvent(new Event('blur')); expect(k.sample(0).steer).toBe(0); k.dispose();
});
it('不感帯と外側の飽和、ゲームパッドの単発操作と切断', () => {
  expect(deadzone(.12)).toBe(0); expect(deadzone(-.95)).toBe(-1); expect(deadzone(1)).toBe(1);
  const pad = { axes: [.95, -.95, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  const actions = []; let pads = [pad];
  const g = createGamepad({ getGamepads: () => pads, onAction: a => actions.push(a) });
  for (const i of [0, 1, 3, 9, 12, 13]) pad.buttons[i].pressed = true;
  g.poll(); g.poll(); expect(g.sample()).toEqual({ steer: 1, tuck: 1, brake: 1, jump: true, grab: 0 });
  expect(actions).toEqual(['pause', 'camera', 'drop', 'safe']); pads = []; g.poll(); expect(g.sample().jump).toBe(false);
});
it('キーボードとパッドの同じ操作・仮想入力の解除', () => {
  const target = new EventTarget();
  const pad = { axes: [.95, -.95], buttons: [{ pressed: true }] };
  const a = createInput({ target, getGamepads: () => [] }), b = createInput({ target: new EventTarget(), getGamepads: () => [pad] });
  for (const code of ['KeyD', 'KeyW', 'Space']) key(target, 'keydown', code);
  a.sample(3); b.poll(); expect(a.sample(0)).toEqual(b.sample(0));
  a.setVirtual({ steer: -5, jump: true, grab: 1 }); expect(a.sample(0)).toEqual({ steer: -1, tuck: 0, brake: 0, jump: true, grab: 0 });
  a.setVirtual(null); expect(a.sample(0).steer).toBe(1); a.dispose(); b.dispose();
});
it('タッチ端末でも実際に使った装置の早見へ切り替わり、blurで保持入力を消す', () => {
  const target = new EventTarget(); let callbacks, cleared = 0;
  const input = createInput({ target, initialDevice: 'touch', getGamepads: () => [],
    touch: { setCallbacks(v) { callbacks = v; }, sample: () => ({ steer: 0, tuck: 0, brake: 0, jump: false }), clear() { cleared++; } } });
  expect(input.device).toBe('touch'); key(target, 'keydown', 'KeyD'); expect(input.device).toBe('keyboard');
  callbacks.onUse('touch'); expect(input.device).toBe('touch'); callbacks.onUse('mouse'); expect(input.device).toBe('keyboard');
  target.dispatchEvent(new Event('blur')); expect(cleared).toBe(1); expect(input.sample(.1).steer).toBe(0); input.dispose();
});
it('一時停止で入力を消しても、押し続けたパッドのボタンは再発火しない', () => {
  const pad = { axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) }, actions = [];
  const g = createGamepad({ getGamepads: () => [pad], onAction: a => actions.push(a) });
  pad.buttons[9].pressed = true; g.poll(); g.clear(); g.poll(); expect(actions).toEqual(['pause']);
  pad.buttons[9].pressed = false; g.poll(); pad.buttons[9].pressed = true; g.poll(); expect(actions).toEqual(['pause', 'pause']);
});
it('ボタンに焦点があっても、曲がる・やり直すキーは効く。空白と Enter だけは、そのボタンを押すキー', () => {
  const target = Object.assign(new EventTarget(), { tagName: 'BUTTON' }), actions = [];
  const k = createKeyboard({ target, onAction: a => actions.push(a) });
  key(target, 'keydown', 'KeyD'); expect(k.sample(1 / 120).steer).toBeGreaterThan(0);
  for (const code of ['KeyR', 'KeyE', 'KeyM', 'KeyC', 'Space', 'Enter']) key(target, 'keydown', code);
  expect(actions).toEqual(['drop', 'safe', 'map', 'camera']); expect(k.sample(0).jump).toBe(false); k.dispose();
  // 焦点がボタンに無ければ、空白キーは「構え」と、題字の画面の「滑り出す」（confirm）の両方になる
  const open = new EventTarget(), sent = []; const o = createKeyboard({ target: open, onAction: a => sent.push(a) });
  key(open, 'keydown', 'Space'); key(open, 'keydown', 'Enter'); expect(sent).toEqual(['confirm', 'finish']); expect(o.sample(0).jump).toBe(true); o.dispose();
  // 文字を打つ欄では、これまでどおり Escape 以外を渡さない
  const field = Object.assign(new EventTarget(), { tagName: 'INPUT' }), typed = [];
  const f = createKeyboard({ target: field, onAction: a => typed.push(a) });
  for (const code of ['KeyR', 'KeyD', 'Escape']) key(field, 'keydown', code);
  expect(typed).toEqual(['pause']); expect(f.sample(1 / 120).steer).toBe(0); f.dispose();
});
