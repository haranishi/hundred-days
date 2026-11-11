import { describe, it, expect } from 'vitest';
import { createLoop } from '../../src/core/loop.js';
function fixture() {
  let stamp = 0, steps = 0, draws = 0;
  const loop = createLoop({ now: () => stamp, step: () => steps++, render: () => draws++ });
  return { loop, ms: n => { stamp += n; loop.tick(); }, count: () => steps, draws: () => draws };
}
describe('固定刻み', () => {
  it('表示の頻度によらず120刻み', () => {
    for (const hz of [30, 60, 144]) {
      const f = fixture(); f.ms(0); for (let i = 0; i < hz; i++) f.ms(1000 / hz);
      expect(f.count()).toBe(120);
    }
  });
  it('遅れた分を8刻みで捨てる', () => {
    const f = fixture(); f.ms(0); f.ms(1000); expect(f.count()).toBe(8);
    f.ms(1000 / 120); expect(f.count()).toBe(9);
  });
  it('手動は上限なし・端数を持ち越す', () => {
    const a = fixture(), b = fixture(); a.loop.setManual(true); b.loop.setManual(true);
    for (let i = 0; i < 250; i++) a.loop.advance(.004);
    b.loop.advance(1); expect(a.count()).toBe(120); expect(a.count()).toBe(b.count());
    a.ms(10000); expect(a.count()).toBe(120);
  });
  it('停止と隠れた時間を再開時に捨てる', () => {
    for (const setter of ['setPaused', 'setHidden']) {
      const f = fixture(); f.ms(0); f.loop[setter](true); f.ms(9000);
      f.loop[setter](false); f.ms(9000); expect(f.count()).toBe(0);
      f.ms(1000 / 120); expect(f.count()).toBe(1);
    }
  });
  it('不正な手動送りを拒む', () => {
    const f = fixture(); expect(() => f.loop.advance(1)).toThrow(); f.loop.setManual(true);
    for (const seconds of [NaN, Infinity, -1, '1']) expect(() => f.loop.advance(seconds)).toThrow();
    f.loop.setPaused(true); expect(f.loop.advance(1)).toBe(0);
  });
});

it('画面更新の直前に再開する場合も、止まっていた経過を捨てる', () => {
  let stamp = 0, count = 0, resume = false;
  const loop = createLoop({ now: () => stamp, step: () => count++, beforeFrame() { if (resume) { resume = false; loop.setPaused(false); } } });
  loop.tick(); loop.setPaused(true); stamp = 5000; resume = true; loop.tick(); expect(count).toBe(0);
  stamp += 1000 / 120; loop.tick(); expect(count).toBe(1);
});
