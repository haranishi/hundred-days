export const crossedThreshold = (dx, dy) => Math.hypot(dx, dy) >= 4;

export function dropIndex(rows, from, y) {
  if (from < 0 || from >= rows.length) return -1;
  // 元の行は最後に抜くので、ここで二重に数えると下向きだけ1段ずれる。
  return rows.reduce((to, row, index) =>
    to + Number(index !== from && y >= (row.top + row.bottom) / 2), 0);
}

export function edgeScroll(y, top, bottom) {
  const band = Math.min(48, (bottom - top) / 2);
  if (band <= 0) return 0;
  if (y < top + band) return -Math.ceil(16 * Math.min(1, (top + band - y) / band));
  if (y > bottom - band) return Math.ceil(16 * Math.min(1, (y - bottom + band) / band));
  return 0;
}

export function attachDrag(list, scroller, move) {
  const events = new AbortController();
  const listen = { signal: events.signal };
  let drag = null;
  let frame = 0;
  let marked = null;

  function clearMark() {
    if (marked) delete marked.dataset.drop;
    marked = null;
  }

  function measure() {
    const rows = Array.from(list.children);
    const from = rows.indexOf(drag.row);
    const to = dropIndex(rows.map(row => row.getBoundingClientRect()), from, drag.y);
    clearMark();
    if (to >= 0 && to !== from) {
      marked = rows[to];
      marked.dataset.drop = to > from ? 'after' : 'before';
    }
    return to;
  }

  function tick() {
    frame = 0;
    if (!drag?.active) return;
    const rect = scroller.getBoundingClientRect();
    const step = edgeScroll(drag.y, rect.top, rect.bottom);
    const last = scroller.scrollTop;
    scroller.scrollTop += step;
    measure();
    // 指を止めたままでも端では先へ進み、端に着いたら描画を休む。
    if (step && scroller.scrollTop !== last) frame = requestAnimationFrame(tick);
  }

  function cancel() {
    if (!drag) return;
    const { handle, pointer, row } = drag;
    drag = null;
    cancelAnimationFrame(frame);
    frame = 0;
    clearMark();
    row.classList.remove('is-dragging');
    if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
  }

  list.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-act="grip"]');
    if (!handle || drag || event.button !== 0 || !event.isPrimary) return;
    const row = handle.closest('[data-row]');
    drag = { handle, row, pointer: event.pointerId, x0: event.clientX, y0: event.clientY, y: event.clientY, active: false };
    handle.setPointerCapture(event.pointerId);
  }, listen);

  list.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag.y = event.clientY;
    if (!drag.active) {
      if (!crossedThreshold(event.clientX - drag.x0, drag.y - drag.y0)) return;
      drag.active = true;
      drag.row.classList.add('is-dragging');
    }
    event.preventDefault();
    if (!frame) frame = requestAnimationFrame(tick);
  }, listen);

  list.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { active, row } = drag;
    drag.y = event.clientY;
    const to = active ? measure() : -1;
    cancel();
    if (to >= 0) move(row.dataset.row, to);
  }, listen);

  function lost(event) {
    if (event.pointerId === drag?.pointer) cancel();
  }
  list.addEventListener('pointercancel', lost, listen);
  list.addEventListener('lostpointercapture', lost, listen);
  window.addEventListener('blur', cancel, listen);
  window.addEventListener('resize', cancel, listen);
  window.addEventListener('keydown', event => {
    if (drag && event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  }, { ...listen, capture: true });
  return { cancel, destroy() { cancel(); events.abort(); } };
}
