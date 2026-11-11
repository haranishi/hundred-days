export const SETTINGS_KEY = 'ginrei.settings.v1';
export const DEFAULT_SETTINGS = Object.freeze({ quality: 'auto', shake: 'normal', volume: .7,
  muted: false, hints: true, stance: 1, gear: 'board' });
/** 滑る道具（gear）：'board'＝スノーボード、'ski'＝スキー。物理の値・人物の姿勢と形・跡が、これで切り替わる */
export function validateSettings(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  return {
    quality: ['auto', 'high', 'mid', 'low'].includes(raw.quality) ? raw.quality : 'auto',
    shake: ['normal', 'less', 'none'].includes(raw.shake) ? raw.shake : 'normal',
    volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : .7,
    muted: typeof raw.muted === 'boolean' ? raw.muted : false,
    hints: typeof raw.hints === 'boolean' ? raw.hints : true,
    stance: raw.stance === -1 ? -1 : 1,
    gear: raw.gear === 'ski' ? 'ski' : 'board',
  };
}
export function createSettings({ storage, key = SETTINGS_KEY } = {}) {
  // localStorage の取得そのものが拒まれる環境もある。
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  let value;
  try { value = validateSettings(JSON.parse(storage?.getItem(key) ?? 'null')); }
  catch { value = { ...DEFAULT_SETTINGS }; }
  const listeners = new Set();
  return {
    get() { return { ...value }; },
    set(changes) {
      value = validateSettings({ ...value, ...changes });
      try { storage?.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても継続する */ }
      for (const fn of listeners) fn({ ...value });
      return { ...value };
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
