import { PHYS } from './physics.js';

// 実時間→ゲーム時間の写し。1回の経過を0.1秒で打ち切るので、タブ復帰で一気に進んで墜落しない。
// 入力の時刻もこのフレームの範囲に押し込めるので、描画より後の時刻の入力でも次の描画に間に合う
export function createFrameClock(maxFrame = PHYS.maxFrame) {
  let realLast = null;
  return {
    frame(realNow, rawInputs = []) {
      if (realLast === null) realLast = realNow;
      const d = Math.min(Math.max(realNow - realLast, 0), maxFrame);
      const offsets = rawInputs.map((t) => Math.min(Math.max(t - realLast, 0), d));
      realLast = realNow;
      return { delta: d, offsets };
    },
    reset(realNow) {
      realLast = realNow;
    },
  };
}
