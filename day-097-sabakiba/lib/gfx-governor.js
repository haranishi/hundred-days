import { AUTO_TIERS, measuredTier, SLOW_FPS } from './gfx.js';

/** 起動後の実測と、その後の連続した描画を別の窓で測る。時刻とフレーム間隔は ms。 */
export function createGfxGovernor({
  tier, minFps = SLOW_FPS, warmup = 12, startupSize = 30, windowSize = 45, cooldownMs = 3000, maxFrameMs = 250,
} = {}) {
  let current = tier, startupFps = null;
  let lastChange = -Infinity, remaining = warmup, longFrames = 0;
  const samples = [];

  function resetFrames() {
    remaining = warmup;
    longFrames = 0;
    samples.length = 0;
  }

  function push(frameMs, nowMs) {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || !Number.isFinite(nowMs)) return null;
    if (!AUTO_TIERS.includes(current) || (startupFps !== null && current === 'light')) return null;
    // タブ復帰などの単発の停止を測定から外し、停止に近い描画が続く端末は拾う。
    if (frameMs > maxFrameMs) {
      if (++longFrames < 6) return null;
      frameMs = maxFrameMs;
    } else longFrames = 0;
    if (remaining > 0) { remaining--; return null; }
    if (nowMs - lastChange < cooldownMs) return null;
    const startup = startupFps === null;
    samples.push(frameMs);
    if (samples.length < (startup ? startupSize : windowSize)) return null;
    const sorted = samples.sort((a, b) => a - b);
    const mid = (sorted.length - 1) / 2;
    const fps = 1000 / ((sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2);
    samples.length = 0;
    if (startup) startupFps = fps;
    const to = measuredTier(current, fps, minFps);
    if (to === current) return null;
    const from = current;
    current = to;
    lastChange = nowMs;
    resetFrames();
    return { from, to, reason: startup ? 'startup' : 'sustained', fps };
  }

  return { push, resetFrames, get startupFps() { return startupFps; } };
}
