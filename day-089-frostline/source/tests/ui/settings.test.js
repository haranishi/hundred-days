import { it, expect } from 'vitest';
import { SETTING_FIELDS, settingChange } from '../../src/ui/panels.js';
import { createSettings } from '../../src/core/settings.js';
it('全設定項目は値を正しい型で変更でき、即通知される', () => {
  expect(SETTING_FIELDS.map(f => f.key)).toEqual(['gear', 'quality', 'shake', 'volume', 'muted', 'hints', 'stance']);
  const settings = createSettings({ storage: null }); const values = []; settings.subscribe(v => values.push(v));
  expect(settings.get().gear).toBe('board'); // 初めて開いたときは、スノーボード
  for (const [key, value] of [['gear', 'ski'], ['quality', 'mid'], ['shake', 'none'], ['volume', '.2'], ['muted', true], ['hints', false], ['stance', '-1']]) settings.set(settingChange(key, value));
  expect(values).toHaveLength(7); expect(settings.get()).toEqual({ quality: 'mid', shake: 'none', volume: .2, muted: true, hints: false, stance: -1, gear: 'ski' });
  // 知らない値は、スノーボードとして読む。選んだ道具は、保存して読み戻せる
  expect(settings.set({ gear: 'sled' }).gear).toBe('board');
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  createSettings({ storage }).set({ gear: 'ski' }); expect(createSettings({ storage }).get().gear).toBe('ski');
});
