import { describe, expect, it } from 'vitest';
import { damped, smoothDamp } from '../src/core/springs';

describe('臨界減衰の解析解', () => {
  it('固定目標の解 (1 + omega*t) exp(-omega*t) に一致する', () => {
    const state = damped(0);
    smoothDamp(state, 10, 1, 0.5);
    expect(state.value).toBeCloseTo(10 - 20 / Math.E, 12);
    expect(state.velocity).toBeCloseTo(20 / Math.E, 12);
  });
  it('時間分割を変えても同じ位置と速度になる', () => {
    const whole = damped(1), split = damped(1);
    whole.velocity = split.velocity = 0.5;
    smoothDamp(whole, 7, 0.8, 0.2);
    for (let n = 0; n < 12; n++) smoothDamp(split, 7, 0.8, 0.2 / 12);
    expect(split.value).toBeCloseTo(whole.value, 12);
    expect(split.velocity).toBeCloseTo(whole.velocity, 12);
  });
  it('有限速度・0秒・強い初速による行き過ぎを抑える', () => {
    const state = damped();
    expect(smoothDamp(state, 100, 1, 0)).toBe(0);
    expect(smoothDamp(state, 100, 1, 0.5, 2)).toBeLessThanOrEqual(1);
    state.value = 0; state.velocity = 1000;
    expect(smoothDamp(state, 1, 1, 0.1)).toBe(1);
    expect(state.velocity).toBe(0);
  });
});
