/** 固定刻み。秒を使い、時計（ミリ秒）はここだけで読む。 */
export function createLoop({ step, render = () => {}, beforeFrame = () => {},
  now = () => performance.now(), requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis), dt = 1 / 120, maxSteps = 8 } = {}) {
  let remainder = 0, time = 0, last = null, paused = false, hidden = false, manual = false;
  let running = false, handle;
  function progress(seconds, limit) {
    remainder += seconds;
    const count = Math.min(Math.floor((remainder + dt * 1e-9) / dt), limit);
    for (let i = 0; i < count; i++) { step(dt); time += dt; }
    remainder -= count * dt;
    if (remainder < 0) remainder = 0;
    if (limit !== Infinity && remainder >= dt) remainder %= dt;
    return count;
  }
  function draw(frameDt) { render({ alpha: remainder / dt, frameDt, time }); }
  function tick() {
    beforeFrame();
    const stamp = now();
    const elapsed = last === null ? 0 : Math.max(0, (stamp - last) / 1000);
    last = stamp;
    if (!manual && !paused && !hidden) { progress(elapsed, maxSteps); draw(elapsed); }
  }
  function frame() { if (!running) return; tick(); if (running) handle = requestFrame?.(frame); }
  function resetClock() { last = null; remainder = 0; }
  return {
    tick,
    start() { if (running) return; running = true; resetClock(); handle = requestFrame?.(frame); },
    stop() { running = false; cancelFrame?.(handle); resetClock(); },
    setPaused(value) { if (paused !== !!value) { paused = !!value; resetClock(); } },
    setHidden(value) { if (hidden !== !!value) { hidden = !!value; resetClock(); } },
    setManual(value) { if (manual !== !!value) { manual = !!value; resetClock(); } },
    advance(seconds) {
      if (!manual) throw new Error('手動送りを有効にしてください');
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('送り時間は0以上の秒数で指定してください');
      beforeFrame();
      const count = paused || hidden ? 0 : progress(seconds, Infinity);
      draw(paused || hidden ? 0 : seconds); return count;
    },
    reset: resetClock,
    get time() { return time; },
    get manual() { return manual; },
  };
}
