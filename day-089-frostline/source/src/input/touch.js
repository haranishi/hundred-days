import { emptyInput, clamp } from './values.js';
/** 指ごとの所有権を持つ。後から離れた指でも、他の指の押下を消さない。 */
export function createTouchState({ radius = 54, onAction = () => {} } = {}) {
  const pointers = new Map(); let steeringId = null;
  function down(id, control, x, y) {
    if (control === 'steer' && steeringId !== null) return false;
    if (control === 'steer') steeringId = id;
    pointers.set(id, { control, x, y, dx: 0, dy: 0 }); return true;
  }
  function move(id, x, y) { const p = pointers.get(id); if (p) { p.dx = x - p.x; p.dy = y - p.y; } }
  function up(id, cancelled = false) {
    const p = pointers.get(id); if (!p) return;
    if (!cancelled && ['pause', 'camera', 'safe', 'drop'].includes(p.control)) onAction(p.control);
    pointers.delete(id); if (steeringId === id) steeringId = null;
  }
  return {
    down, move, up,
    sample() {
      const value = emptyInput();
      for (const p of pointers.values()) {
        if (p.control === 'steer') {
          value.steer = clamp(p.dx / radius, -1, 1);
          value.tuck = clamp(-p.dy / radius); value.brake = Math.max(value.brake, clamp(p.dy / radius));
        }
        if (p.control === 'jump') value.jump = true;
        if (p.control === 'brake') value.brake = 1;
      }
      return value;
    },
    clear() { pointers.clear(); steeringId = null; },
  };
}
export function createTouch({ root } = {}) {
  let onAction = () => {}, onUse = () => {};
  const state = createTouchState({ onAction: action => onAction(action) });
  const bindings = [];
  for (const element of root?.querySelectorAll('[data-control]') ?? []) {
    const control = element.dataset.control;
    const down = e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!state.down(e.pointerId, control, e.clientX, e.clientY)) return;
      onUse(e.pointerType); e.preventDefault(); element.setPointerCapture?.(e.pointerId);
    };
    const move = e => state.move(e.pointerId, e.clientX, e.clientY);
    const up = e => { state.up(e.pointerId); e.preventDefault(); };
    const cancel = e => state.up(e.pointerId, true);
    // キーボード操作で発生する click も受ける。指は pointerup で受ける。
    const click = e => { if (e.detail === 0 && ['pause', 'camera', 'safe', 'drop'].includes(control)) onAction(control); };
    for (const [type, fn] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', cancel], ['lostpointercapture', cancel], ['click', click]]) {
      element.addEventListener(type, fn); bindings.push(() => element.removeEventListener(type, fn));
    }
  }
  return {
    setCallbacks(callbacks) { onAction = callbacks.onAction; onUse = callbacks.onUse; },
    sample: state.sample, clear: state.clear,
    dispose() { state.clear(); bindings.forEach(fn => fn()); },
  };
}
