// 座標は CSS px、時刻は ms。指を交代するときはその場を次の操作の起点にする。
const TAP_INTERVAL = 330;

export function createGesture(emit) {
  const pointers = new Map();
  let single = null, pair = null, lastTap = null;

  function pairFrame() {
    const [a, b] = pointers.values();
    return { a: a.id, b: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      span: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function down(point) {
    if (pointers.has(point.id)) return;
    pointers.set(point.id, point);
    if (pointers.size === 1) single = { start: point, last: point, dragged: false, tap: true };
    if (pointers.size === 2) {
      single = null;
      lastTap = null;
      pair = pairFrame();
    }
  }

  function move(point) {
    if (!pointers.has(point.id)) return;
    pointers.set(point.id, point);
    if (pair) {
      if (point.id !== pair.a && point.id !== pair.b) return;
      const next = pairFrame();
      const dx = next.x - pair.x, dy = next.y - pair.y;
      const scale = next.span >= 1 && pair.span >= 1 ? next.span / pair.span : 1;
      pair = next;
      if (dx || dy || scale !== 1) emit({ type: 'pinch', dx, dy, scale });
    } else if (single) {
      const from = single.dragged ? single.last : single.start;
      const dx = point.x - from.x, dy = point.y - from.y;
      if (!dx && !dy) return;
      if (!single.dragged && Math.hypot(dx, dy) < (point.kind === 'touch' ? 6 : 4)) return;
      single.dragged = true;
      lastTap = null;
      const seconds = (point.time - from.time) / 1000;
      if (seconds > 0) single.speed = [dx / Math.max(0.008, seconds), dy / Math.max(0.008, seconds)];
      single.last = point;
      emit({ type: 'orbit', dx, dy });
    }
  }

  function end(point, cancelled = false) {
    if (!pointers.has(point.id)) return;
    if (!cancelled) move(point);
    pointers.delete(point.id);
    if (pair) {
      if (point.id !== pair.a && point.id !== pair.b) return;
      pair = pointers.size >= 2 ? pairFrame() : null;
      if (!pair) {
        const remaining = pointers.values().next().value;
        single = { start: remaining, last: remaining, dragged: false, tap: false };
      }
      return;
    }
    const tap = !cancelled && single?.tap && !single.dragged && point.time - single.start.time <= TAP_INTERVAL;
    if (!cancelled && single?.speed && point.time - single.last.time <= 90 && Math.hypot(...single.speed) >= 80) {
      emit({ type: 'fling', dx: single.speed[0], dy: single.speed[1] });
    }
    single = null;
    if (!tap) { lastTap = null; return; }
    const elapsed = lastTap ? point.time - lastTap.time : Infinity;
    if (lastTap?.kind === point.kind && elapsed >= 0 && elapsed <= TAP_INTERVAL
      && Math.hypot(lastTap.x - point.x, lastTap.y - point.y) <= (point.kind === 'touch' ? 26 : 16)) {
      lastTap = null;
      emit({ type: 'double-tap', point });
    } else {
      lastTap = point;
      emit({ type: 'tap', point });
    }
  }

  function clear() {
    pointers.clear();
    single = pair = lastTap = null;
  }

  return { down, move, end, clear, has: (id) => pointers.has(id), get size() { return pointers.size; } };
}
