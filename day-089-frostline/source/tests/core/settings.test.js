import { it, expect } from 'vitest';
import { createSettings, DEFAULT_SETTINGS, validateSettings } from '../../src/core/settings.js';
import { selectQuality, QUALITY_TIERS } from '../../src/core/quality.js';
it('壊れた保存値と読み書き拒否でも動く', () => {
  for (const storage of [null, { getItem() { throw Error(); }, setItem() { throw Error(); } }, { getItem: () => '{' }]) {
    const s = createSettings({ storage }); expect(s.get()).toEqual(DEFAULT_SETTINGS);
    expect(s.set({ muted: true }).muted).toBe(true);
  }
});
it('保存・再読込・購読解除と値の補正', () => {
  let saved, calls = 0;
  const storage = { getItem: () => saved, setItem: (k, v) => { saved = v; } };
  const s = createSettings({ storage }); const unsubscribe = s.subscribe(() => calls++);
  s.set({ volume: 2, quality: 'low', stance: -1 }); unsubscribe(); s.set({ muted: true });
  expect(calls).toBe(1); expect(createSettings({ storage }).get()).toEqual(s.get());
  expect(s.get().volume).toBe(1);
  expect(validateSettings({ quality: 'bad', hints: 0, volume: NaN })).toEqual(DEFAULT_SETTINGS);
});
it('画質はURLが最優先・不正値は自動判定へ', () => {
  expect(selectQuality({ search: '?q=low', quality: 'high', webgpu: true })).toBe('low');
  expect(selectQuality({ search: '?q=bad', quality: 'high' })).toBe('high');
  expect(selectQuality({ webgpu: false })).toBe('low');
  expect(selectQuality({ webgpu: true, touch: true })).toBe('mid');
  expect(selectQuality({ webgpu: true, pixelRatio: 2 })).toBe('mid');
  expect(selectQuality({ webgpu: true })).toBe('high');
  expect(Object.keys(QUALITY_TIERS)).toEqual(['high', 'mid', 'low']);
});
