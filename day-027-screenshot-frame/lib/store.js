import { BACKGROUNDS, DEFAULT_BACKGROUND } from './backgrounds.js';
import { ASPECTS } from './layout.js';

export const STORAGE_NAME = 'day027.frame.v1';
export const VERSION = 1;

export function initialState() {
  return { v: VERSION, bg: DEFAULT_BACKGROUND, aspect: 'auto', padding: 40, radius: 35, shadow: 50, frame: false, updatedAt: null };
}

const backgroundIds = new Set(BACKGROUNDS.map(({ id }) => id));
const validLevel = (value, fallback) => Number.isInteger(value) && value >= 0 && value <= 100 ? value : fallback;

export function restore(data) {
  if (!data || data.v !== VERSION) return null;
  const defaults = initialState();
  return {
    v: VERSION,
    bg: typeof data.bg === 'string' && backgroundIds.has(data.bg) ? data.bg : defaults.bg,
    aspect: typeof data.aspect === 'string' && ASPECTS.includes(data.aspect) ? data.aspect : defaults.aspect,
    padding: validLevel(data.padding, defaults.padding),
    radius: validLevel(data.radius, defaults.radius),
    shadow: validLevel(data.shadow, defaults.shadow),
    frame: typeof data.frame === 'boolean' ? data.frame : defaults.frame,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null
  };
}

export function load(storage) {
  try {
    const raw = storage.getItem(STORAGE_NAME);
    if (!raw) return { state: initialState(), canSave: true };
    return { state: restore(JSON.parse(raw)) ?? initialState(), canSave: true };
  } catch {
    return { state: initialState(), canSave: false };
  }
}

export function serialize(state, now = new Date()) {
  const clean = restore({ ...state, v: VERSION }) ?? initialState();
  return JSON.stringify({ ...clean, updatedAt: now.toISOString() });
}

export function save(storage, state, now = new Date()) {
  try {
    storage.setItem(STORAGE_NAME, serialize(state, now));
    return { saved: true };
  } catch {
    return { saved: false };
  }
}
