import { AUTO_TIERS } from './gfx.js';

export function createGfxGovernor({
  tier, minFps = 26, windowSize = 45, warmup = 15, cooldownMs = 3000, maxFrameMs = 250,
}) {
  let index = AUTO_TIERS.indexOf(tier);
  let lastChange = -Infinity;
  let remaining;
  const samples = [];

  function resetFrames() {
    remaining = warmup;
    samples.length = 0;
  }

  function push(frameMs, nowMs) {
    if (index < 0 || index >= AUTO_TIERS.length - 1 || !Number.isFinite(frameMs) || frameMs <= 0
      || frameMs > maxFrameMs || !Number.isFinite(nowMs)) return null;
    if (remaining > 0) {
      remaining -= 1;
      return null;
    }
    samples.push(frameMs);
    if (samples.length > windowSize) samples.shift();
    if (samples.length < windowSize || nowMs - lastChange < cooldownMs) return null;

    // 一時的に詰まった数枚や、低電力モードの30fpsだけで画質を落とさない。
    const sorted = samples.slice().sort((a, b) => a - b);
    const median = (sorted[Math.floor((windowSize - 1) / 2)] + sorted[Math.floor(windowSize / 2)]) / 2;
    if (median <= 1000 / minFps) return null;
    const from = AUTO_TIERS[index];
    index += 1;
    lastChange = nowMs;
    resetFrames();
    return { from, to: AUTO_TIERS[index] };
  }

  resetFrames();
  return { push, resetFrames };
}
