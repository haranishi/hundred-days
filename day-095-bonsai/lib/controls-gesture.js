export const LONG_PRESS_MS = 480;
const DOUBLE_TAP_MS = 330;

export function createGesture(emit) {
  const pointers = new Map();
  let single = null;
  let pair = null;
  let lastTap = null;

  function beginSingle(point, standalone) {
    single = { start: point, last: point, dragged: false, held: false, tapAllowed: false, standalone };
    if (standalone) {
      single.tapAllowed = emit({ type: 'press', point }) !== false;
    } else {
      emit({ type: 'resume-orbit' });
    }
  }

  function pairFrame() {
    const [a, b] = pointers.values();
    return {
      a: a.id, b: b.id,
      x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      span: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  function updatePair(point) {
    if (point.id !== pair.a && point.id !== pair.b) return;
    const frame = pairFrame();
    const dx = frame.x - pair.x;
    const dy = frame.y - pair.y;
    const scale = pair.span >= 1 && frame.span >= 1 ? frame.span / pair.span : 1;
    pair = frame;
    if (dx || dy || scale !== 1) emit({ type: 'pinch', dx, dy, scale });
  }

  function updateSingle(point) {
    const { start, last } = single;
    if (point.x === last.x && point.y === last.y) return;
    const slop = point.kind === 'touch' ? 6 : 4;
    const startDrag = !single.dragged && Math.hypot(point.x - start.x, point.y - start.y) >= slop;
    if (startDrag) {
      single.dragged = true;
      lastTap = null;
    }
    const from = startDrag ? start : last;
    single.last = point;
    emit({ type: 'move', point, dx: point.x - from.x, dy: point.y - from.y, dt: point.time - from.time, dragged: single.dragged });
  }

  function down(point) {
    if (pointers.has(point.id)) return;
    pointers.set(point.id, point);
    if (pointers.size === 1) beginSingle(point, true);
    if (pointers.size === 2) {
      single = null;
      lastTap = null;
      pair = pairFrame();
      emit({ type: 'cancel-press' });
    }
  }

  function move(point) {
    if (!pointers.has(point.id)) return;
    pointers.set(point.id, point);
    if (pair) updatePair(point);
    else if (single) updateSingle(point);
  }

  function tick(time) {
    if (!single?.standalone || single.dragged || single.held || time - single.start.time < LONG_PRESS_MS) return;
    single.held = true;
    lastTap = null;
    emit({ type: 'long-press', point: single.last });
  }

  function finishSingle(point) {
    tick(point.time);
    const { dragged, held, tapAllowed } = single;
    single = null;
    if (!dragged && !held && tapAllowed) {
      const radius = point.kind === 'touch' ? 26 : 16;
      if (lastTap?.kind === point.kind && point.time - lastTap.time <= DOUBLE_TAP_MS
        && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) <= radius) {
        lastTap = null;
        emit({ type: 'double-tap', point });
        return;
      }
      lastTap = point;
      emit({ type: 'tap', point });
    } else {
      lastTap = null;
    }
    emit({ type: 'release', point, dragged, held });
  }

  function end(point, cancelled = false) {
    if (!pointers.has(point.id)) return;
    // 最後の座標がpointerupだけに届く場合でも、つまみや枝の候補へ反映する。
    if (!cancelled) move(point);
    pointers.delete(point.id);
    if (pair) {
      if (pointers.size >= 2) {
        pair = pairFrame();
      } else {
        pair = null;
        beginSingle(pointers.values().next().value, false);
      }
      return;
    }
    if (cancelled) clear();
    else if (single) finishSingle(point);
  }

  function clear() {
    const active = pointers.size > 0 || single !== null;
    pointers.clear();
    single = null;
    pair = null;
    lastTap = null;
    if (active) emit({ type: 'cancel-press' });
  }

  return { down, move, end, tick, clear, has: (id) => pointers.has(id), get size() { return pointers.size; } };
}
