import { clamp, RAD } from './camera-math.js';
import { createGesture } from './controls-gesture.js';

const keys = new Map([
  ['ArrowLeft', ['orbit', -8 * RAD, 0]], ['ArrowRight', ['orbit', 8 * RAD, 0]],
  ['ArrowUp', ['orbit', 0, 6 * RAD]], ['ArrowDown', ['orbit', 0, -6 * RAD]],
  ['+', ['zoomBy', 1.18]], ['=', ['zoomBy', 1.18]], ['-', ['zoomBy', 1 / 1.18]], ['−', ['zoomBy', 1 / 1.18]],
  ['Home', ['reset']],
]);
const point = (e) => ({ id: e.pointerId, kind: e.pointerType || 'mouse', x: e.clientX, y: e.clientY, time: e.timeStamp });

export function connectControls(canvas, { rig, onUser, onTap, reducedMotion } = {}) {
  const events = new AbortController();
  const listener = { signal: events.signal };
  const captured = new Set();
  const previousTouch = canvas.style.touchAction;
  const previousTab = canvas.getAttribute('tabindex');
  canvas.style.touchAction = 'none';
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;
  let enabled = true;

  const media = reducedMotion === undefined
    ? canvas.ownerDocument?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
  const setMotion = () => rig.setReducedMotion(Boolean(media?.matches ?? reducedMotion));
  media?.addEventListener('change', setMotion, listener);
  setMotion();

  const gesture = createGesture((action) => {
    if (action.type === 'orbit') rig.orbit(-action.dx * 0.006, action.dy * 0.006);
    if (action.type === 'fling') rig.fling(-action.dx * 0.006, action.dy * 0.006);
    if (action.type === 'pinch') {
      const { distance, fov } = rig.serialize();
      const unit = 2 * distance * Math.tan(fov * RAD / 2) / Math.max(1, canvas.clientHeight);
      if (action.scale !== 1) rig.zoomBy(action.scale);
      if (action.dx || action.dy) rig.pan(-action.dx * unit, action.dy * unit);
    }
    if (action.type === 'double-tap') rig.reset();
    if (action.type === 'tap') onTap?.(action.point);
  });

  function touch() {
    const first = !rig.userTouched;
    rig.touch();
    if (first) onUser?.();
  }

  function release(id) {
    if (!captured.delete(id)) return;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }

  function cancel() {
    rig.stopInertia();
    gesture.clear();
    for (const id of captured) release(id);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!enabled || e.button !== 0) return;
    touch();
    canvas.focus({ preventScroll: true });
    try {
      canvas.setPointerCapture(e.pointerId);
      captured.add(e.pointerId);
    } catch {
      // 捕捉を提供しない入力でも、キャンバスに届く操作は続けられる。
    }
    gesture.down(point(e));
  }, listener);
  canvas.addEventListener('pointermove', (e) => gesture.move(point(e)), listener);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (e) => {
      gesture.end(point(e), type !== 'pointerup');
      release(e.pointerId);
    }, listener);
  }
  canvas.addEventListener('blur', cancel, listener);

  canvas.addEventListener('wheel', (e) => {
    if (!enabled || gesture.size || !e.deltaY) return;
    e.preventDefault();
    touch();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
    rig.zoomBy(Math.exp(clamp(-e.deltaY * unit * 0.0018, -1.5, 1.5)));
  }, { ...listener, passive: false });
  canvas.addEventListener('keydown', (e) => {
    if (!enabled || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    const command = keys.get(e.key);
    if (!command) return;
    e.preventDefault();
    e.stopPropagation();
    const [method, ...args] = command;
    if (method !== 'reset') touch();
    rig[method](...args);
  }, listener);

  return {
    cancel,
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) cancel();
    },
    dispose() {
      cancel();
      events.abort();
      canvas.style.touchAction = previousTouch;
      if (previousTab === null) canvas.removeAttribute('tabindex');
      else canvas.setAttribute('tabindex', previousTab);
    },
  };
}
