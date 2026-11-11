import { emptyInput, normalizeInput } from './values.js';
import { createKeyboard } from './keyboard.js';
import { createGamepad } from './gamepad.js';
/** 入力装置は並列に使える。単発の操作は drainActions で一度だけ渡す。 */
export function createInput({ target = globalThis.window, getGamepads, touch, lookElement, initialDevice = 'keyboard' } = {}) {
  const actions = []; let device = initialDevice, virtual = null, last = emptyInput();
  let camera = 'third', drag = null, yaw = 0, pitch = 0;
  const onAction = action => actions.push(action);
  const keyboard = createKeyboard({ target, onAction, onUse: () => { device = 'keyboard'; } });
  const gamepad = createGamepad({ getGamepads, onAction, onUse: () => { device = 'gamepad'; } });
  touch?.setCallbacks?.({ onAction, onUse: pointerType => { device = pointerType === 'touch' ? 'touch' : 'keyboard'; } });
  function down(e) {
    if (e.button && e.button !== 0 || drag || e.target?.closest?.('button, input, select, [data-control]')) return;
    if (e.pointerType === 'touch' && (e.clientX < lookElement.clientWidth / 2 || e.clientY > lookElement.clientHeight * .6)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    lookElement.setPointerCapture?.(e.pointerId);
  }
  function move(e) {
    if (drag?.id !== e.pointerId) return;
    yaw += (e.clientX - drag.x) * .004; pitch += (e.clientY - drag.y) * .004;
    drag.x = e.clientX; drag.y = e.clientY;
  }
  function up(e) { if (drag?.id === e.pointerId) drag = null; }
  for (const [type, fn] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up]]) lookElement?.addEventListener(type, fn);
  function clear() { keyboard.clear(); gamepad.clear(); touch?.clear?.(); drag = null; yaw = pitch = 0; actions.length = 0; last = emptyInput(); }
  target?.addEventListener('blur', clear);
  return {
    poll() { gamepad.poll(); },
    sample(dt) {
      const k = keyboard.sample(dt), g = gamepad.sample(), t = touch?.sample?.() ?? emptyInput();
      const steer = [k.steer, g.steer, t.steer].reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0);
      last = normalizeInput(virtual ?? { steer, tuck: Math.max(k.tuck, g.tuck, t.tuck), brake: Math.max(k.brake, g.brake, t.brake), jump: k.jump || g.jump || t.jump });
      return { ...last };
    },
    setVirtual(value) { virtual = value === null ? null : normalizeInput(value); },
    current: () => ({ ...last }),
    drainActions() { return actions.splice(0); },
    consumeLook(dt) {
      const stick = gamepad.look(); const value = { yaw: yaw + stick.yaw * dt * 2, pitch: pitch + stick.pitch * dt * 2, camera };
      yaw = 0; pitch = 0; return value;
    },
    toggleCamera() { camera = camera === 'third' ? 'first' : 'third'; },
    clear,
    get device() { return device; },
    dispose() {
      clear(); target?.removeEventListener('blur', clear); keyboard.dispose(); touch?.dispose?.();
      for (const [type, fn] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up]]) lookElement?.removeEventListener(type, fn);
    },
  };
}
