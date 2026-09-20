export const STORAGE_NAME = 'day026.moon.v1';
export const VERSION = 1;
export const MAX_STAMPS = 60;

const defaultPlace = () => ({ id: 'tokyo', lat: 35.6581, lon: 139.7414, label: '東京' });

export function initialState() {
  return { v: VERSION, place: defaultPlace(), stamps: [], updatedAt: null };
}

function validPlace(place) {
  const lat = Number(place?.lat);
  const lon = Number(place?.lon);
  if (typeof place?.id !== 'string' || typeof place?.label !== 'string'
    || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { id: place.id.slice(0, 24), lat, lon, label: place.label.slice(0, 20) };
}

function validStamp(stamp) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp?.date ?? '')) return null;
  const age = Number(stamp.age);
  const illum = Number(stamp.illum);
  if (!Number.isFinite(age) || !Number.isFinite(illum) || illum < 0 || illum > 1) return null;
  return { date: stamp.date, age, illum, waxing: Boolean(stamp.waxing) };
}

export function restore(data) {
  if (!data || data.v !== VERSION) return null;
  const place = validPlace(data.place) ?? defaultPlace();
  const seen = new Set();
  const stamps = [];
  for (const raw of Array.isArray(data.stamps) ? data.stamps : []) {
    const stamp = validStamp(raw);
    if (!stamp || seen.has(stamp.date)) continue;
    seen.add(stamp.date);
    stamps.push(stamp);
    if (stamps.length === MAX_STAMPS) break;
  }
  return { v: VERSION, place, stamps, updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null };
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
  return JSON.stringify({
    v: VERSION,
    place: validPlace(state.place) ?? defaultPlace(),
    stamps: (Array.isArray(state.stamps) ? state.stamps : []).map(validStamp).filter(Boolean).slice(0, MAX_STAMPS),
    updatedAt: now.toISOString()
  });
}

export function save(storage, state, now = new Date()) {
  try {
    storage.setItem(STORAGE_NAME, serialize(state, now));
    return { saved: true };
  } catch {
    return { saved: false };
  }
}

export function clear(storage) {
  try {
    storage.removeItem(STORAGE_NAME);
    return { cleared: true };
  } catch {
    return { cleared: false };
  }
}

export function setPlace(state, place) {
  return { ...state, place: validPlace(place) ?? state.place };
}

export function addStamp(state, stamp) {
  const next = validStamp(stamp);
  if (!next || state.stamps.some(({ date }) => date === next.date)) return { state, added: false };
  return { state: { ...state, stamps: [next, ...state.stamps].slice(0, MAX_STAMPS) }, added: true };
}

