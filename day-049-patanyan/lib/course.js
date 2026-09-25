import { mulberry32 } from './rng.js';
import { PHYS, WORLD } from './physics.js';
import { gapFor, pitchFor } from './difficulty.js';

export const COURSE = Object.freeze({
  runUp: 1.6,
  margin: 70,
  maxDelta: 110,
  firstSpread: 40,
  fishRate: 0.35,
  fishSpread: 0.3,
  fishR: 8,
});

// 猫の前の縁が約1.6秒で最初のポールの前の縁に届く位置。はじめての人が最初の1本に備える時間
export function firstPoleX() {
  return WORLD.catX + PHYS.catR + PHYS.speed * COURSE.runUp;
}

export function createCourse(seed) {
  const rng = mulberry32(seed);
  const poles = [];
  const minC = COURSE.margin;
  const maxC = WORLD.bandH - COURSE.margin;
  const mid = WORLD.bandH / 2;

  function makePole() {
    const n = poles.length + 1;
    const prev = poles[poles.length - 1];
    const x = prev ? prev.x + pitchFor(n) : firstPoleX();
    const gap = gapFor(n);
    const lo = prev ? Math.max(minC, prev.center - COURSE.maxDelta) : mid - COURSE.firstSpread;
    const hi = prev ? Math.min(maxC, prev.center + COURSE.maxDelta) : mid + COURSE.firstSpread;
    // 1本につき必ず3つ引く。どこまで先を作っても同じシードなら同じ列になる
    const rCenter = rng();
    const rFish = rng();
    const rFishY = rng();
    const center = lo + (hi - lo) * rCenter;
    const fish = rFish < COURSE.fishRate
      ? { x: x + WORLD.poleW / 2, y: center + (rFishY * 2 - 1) * COURSE.fishSpread * gap, taken: false }
      : null;
    return {
      n,
      x,
      w: WORLD.poleW,
      center,
      gap,
      top: center - gap / 2,
      bottom: center + gap / 2,
      fish,
      passed: false,
    };
  }

  return {
    seed,
    poles,
    ensureUntil(worldX) {
      while (!poles.length || poles[poles.length - 1].x < worldX) poles.push(makePole());
    },
    ensureCount(count) {
      while (poles.length < count) poles.push(makePole());
    },
  };
}
