interface Handlers {
  start(event: PointerEvent): void;
  move?(event: PointerEvent): void;
  end(event: Pick<PointerEvent, 'pointerId'>): void;
  single?: boolean;
}

/** capture喪失・取消・画面切替でも終了する。互換マウスイベントはゲームへ漏らさない。 */
export function bindPointer(element: HTMLElement, handlers: Handlers): () => void {
  const active = new Set<number>();
  const stop = (event: Event): void => { event.preventDefault(); event.stopPropagation(); };
  element.addEventListener('pointerdown', event => {
    stop(event);
    if (handlers.single && active.size) return;
    active.add(event.pointerId);
    element.setPointerCapture(event.pointerId);
    handlers.start(event);
  });
  element.addEventListener('pointermove', event => {
    if (!active.has(event.pointerId)) return;
    stop(event);
    handlers.move?.(event);
  });
  const finish = (event: PointerEvent): void => {
    if (!active.delete(event.pointerId)) return;
    stop(event);
    handlers.end(event);
  };
  element.addEventListener('pointerup', finish);
  element.addEventListener('pointercancel', finish);
  element.addEventListener('lostpointercapture', finish);
  for (const name of ['mousedown', 'mousemove', 'mouseup', 'click', 'contextmenu']) element.addEventListener(name, stop);
  return () => {
    const ids = [...active];
    active.clear();
    for (const pointerId of ids) {
      handlers.end({ pointerId });
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    }
  };
}
