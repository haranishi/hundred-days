import { CAMERA_DEFAULT, CAMERA_LIMITS, TOOL_IDS } from './contract.js';
import { createGesture, LONG_PRESS_MS } from './controls-gesture.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const RAD = Math.PI / 180;

const KEY_ACTIONS = Object.freeze({
  '[': { type: 'branch', value: -1 }, ']': { type: 'branch', value: 1 },
  enter: { type: 'apply' }, escape: { type: 'cancel' },
  arrowleft: { type: 'arrow', value: [-1, 0] }, arrowright: { type: 'arrow', value: [1, 0] },
  arrowup: { type: 'arrow', value: [0, -1] }, arrowdown: { type: 'arrow', value: [0, 1] },
  '+': { type: 'zoom', value: 1.18 }, '=': { type: 'zoom', value: 1.18 },
  '-': { type: 'zoom', value: 1 / 1.18 }, '−': { type: 'zoom', value: 1 / 1.18 },
  r: { type: 'reset' }, ' ': { type: 'advance', value: 'week' }, spacebar: { type: 'advance', value: 'week' },
});

export function keyCommand({ key, shiftKey, ctrlKey, altKey, metaKey, isComposing }) {
  if (isComposing || altKey || typeof key !== 'string') return null;
  const lower = key.toLowerCase();
  if (lower === 'z') return { type: shiftKey ? 'redo' : 'undo' };
  if (ctrlKey || metaKey) return null;
  if (/^[1-5]$/.test(key)) return { type: 'tool', value: TOOL_IDS[Number(key) - 1] };
  return Object.hasOwn(KEY_ACTIONS, lower) ? KEY_ACTIONS[lower] : null;
}

export function orbitCamera(camera, dx, dy) {
  const { az, pol } = camera.get();
  camera.set({
    az: ((az - dx * 0.36 + 180) % 360 + 360) % 360 - 180,
    pol: clamp(pol - dy * 0.36, CAMERA_LIMITS.polMin, CAMERA_LIMITS.polMax),
  }, { animate: false });
}

export function zoomCamera(camera, scale, { dx = 0, dy = 0 } = {}) {
  const { az, pol, dist, target } = camera.get();
  // 細長い画面では、木が収まる距離が既定の上限より遠くなる。描画側が教える範囲があれば、それを使う
  const limits = camera.distanceLimits?.() ?? CAMERA_LIMITS;
  const next = { dist: clamp(dist / scale, limits.distMin, limits.distMax) };
  if (dx || dy) {
    const around = az * RAD;
    const above = pol * RAD;
    const right = [Math.cos(around), 0, -Math.sin(around)];
    const up = [-Math.sin(around) * Math.cos(above), Math.sin(above), -Math.cos(around) * Math.cos(above)];
    const unit = camera.pxToWorld(dist);
    const offset = target.map((v, i) => v - CAMERA_DEFAULT.target[i] + unit * (dy * up[i] - dx * right[i]));
    const length = Math.hypot(...offset);
    const factor = length > CAMERA_LIMITS.panMax ? CAMERA_LIMITS.panMax / length : 1;
    next.target = CAMERA_DEFAULT.target.map((v, i) => v + offset[i] * factor);
  }
  camera.set(next, { animate: false });
}

export function connectControls(canvas, { camera, tools, reducedMotion, resting, onCommand, onInput }) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const captured = new Set();
  let orbit = false;
  let velocity = null;
  let inertia = 0;
  let pressTimer = 0;
  let splashTimer = 0;

  function stopTimers() {
    clearTimeout(pressTimer);
    clearInterval(splashTimer);
    pressTimer = splashTimer = 0;
  }

  function stopInertia() {
    cancelAnimationFrame(inertia);
    inertia = 0;
    velocity = null;
  }

  function coast(point) {
    if (reducedMotion() || resting() || !velocity || point.time - velocity.time > 90) return;
    if (Math.hypot(velocity.x, velocity.y) < 0.04) return;
    let last = performance.now();
    function frame(now) {
      if (reducedMotion()) { stopInertia(); return; }
      const dt = clamp(now - last, 0, 32);
      last = now;
      orbitCamera(camera, velocity.x * dt, velocity.y * dt);
      const decay = Math.exp(-dt / 110);
      velocity.x *= decay;
      velocity.y *= decay;
      if (Math.hypot(velocity.x, velocity.y) >= 0.025) inertia = requestAnimationFrame(frame);
      else stopInertia();
    }
    inertia = requestAnimationFrame(frame);
  }

  const gesture = createGesture((action) => {
    switch (action.type) {
      case 'press':
        orbit = !tools.press(action.point);
        if (orbit) canvas.dataset.gesture = 'orbit';
        return orbit;
      case 'move':
        if (!orbit && tools.move(action.point, action.dragged)) {
          stopTimers();
          orbit = true;
          canvas.dataset.gesture = 'orbit';
        }
        if (orbit && action.dragged) {
          orbitCamera(camera, action.dx, action.dy);
          const dt = Math.max(8, action.dt);
          velocity = {
            x: clamp(action.dx / dt, -1.2, 1.2), y: clamp(action.dy / dt, -1.2, 1.2), time: action.point.time,
          };
        }
        break;
      case 'pinch':
        zoomCamera(camera, action.scale, action);
        break;
      case 'resume-orbit':
        orbit = true;
        canvas.dataset.gesture = 'orbit';
        break;
      case 'long-press':
        if (orbit || !tools.hold()) break;
        if (!reducedMotion() && !resting()) splashTimer = setInterval(() => tools.hold(), 170);
        break;
      case 'release':
        if (orbit) coast(action.point);
        else tools.finish(action.point);
        delete canvas.dataset.gesture;
        orbit = false;
        break;
      case 'double-tap':
        stopInertia();
        delete canvas.dataset.gesture;
        orbit = false;
        onCommand({ type: 'reset' });
        break;
      case 'cancel-press':
        tools.cancel();
        stopTimers();
        stopInertia();
        delete canvas.dataset.gesture;
        orbit = false;
        break;
    }
  });

  function point(event) {
    return { id: event.pointerId, x: event.clientX, y: event.clientY, kind: event.pointerType || 'mouse', time: event.timeStamp };
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    onInput('pointer');
    stopInertia();
    // 復帰の補間中に枝を押しても、押した時点の見え方で当たり判定を安定させる。
    if (!gesture.size) camera.set(camera.get(), { animate: false });
    canvas.focus({ preventScroll: true });
    try {
      canvas.setPointerCapture(event.pointerId);
      captured.add(event.pointerId);
    } catch {
      // 合成の入力でも、キャンバスに届く座標から操作できるようにする。
    }
    const start = point(event);
    gesture.down(start);
    if (gesture.size === 1) pressTimer = setTimeout(() => gesture.tick(start.time + LONG_PRESS_MS), LONG_PRESS_MS);
  }, options);

  canvas.addEventListener('pointermove', (event) => gesture.move(point(event)), options);
  function endPointer(event) {
    captured.delete(event.pointerId);
    if (!gesture.has(event.pointerId)) return;
    gesture.end(point(event), event.type !== 'pointerup');
    stopTimers();
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, endPointer, options);

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    onInput('wheel');
    stopInertia();
    if (gesture.size) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    zoomCamera(camera, Math.exp(clamp(-event.deltaY * unit * 0.0018, -1.5, 1.5)));
  }, { ...options, passive: false });

  canvas.addEventListener('keydown', (event) => {
    const command = keyCommand(event);
    if (!command) return;
    event.preventDefault();
    if (event.repeat && command.type !== 'arrow' && command.type !== 'zoom') return;
    onInput('key');
    cancel();
    onCommand(command);
  }, options);

  function cancel() {
    gesture.clear();
    stopTimers();
    stopInertia();
    for (const id of captured) {
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    captured.clear();
  }

  return { cancel, dispose() { cancel(); events.abort(); } };
}
