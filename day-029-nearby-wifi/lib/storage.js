const SETTINGS_SLOT = 'day029.wifi.v1';

export function safeStorage(scope = globalThis) {
  try { return scope.localStorage || null; } catch { return null; }
}

export function sanitizeSettings(value) {
  if (!value || value.v !== 1) return { v: 1, last: null, onlyFree: false, layers: { municipal: true, osm: true, chain: true }, updatedAt: 0 };
  const last = value.last;
  const validLast = last && Number.isFinite(last.lat) && Number.isFinite(last.lng)
    && [-90, 90].every((limit, index) => index ? last.lat <= limit : last.lat >= limit)
    && last.lng >= -180 && last.lng <= 180 && [800, 3200].includes(last.radius)
    ? { lat: last.lat, lng: last.lng, label: String(last.label || '前回の場所'), radius: last.radius }
    : null;
  const layers = { municipal: true, osm: true, chain: true };
  for (const layer of Object.keys(layers)) {
    if (typeof value.layers?.[layer] === 'boolean') layers[layer] = value.layers[layer];
  }
  return { v: 1, last: validLast, onlyFree: Boolean(value.onlyFree), layers, updatedAt: Number(value.updatedAt) || 0 };
}

export function loadSettings(storage) {
  try { return sanitizeSettings(JSON.parse(storage?.getItem(SETTINGS_SLOT))); }
  catch { return sanitizeSettings(null); }
}

export function saveSettings(storage, { last = null, onlyFree = false, layers = {} }, now = Date.now()) {
  const rounded = last ? {
    lat: Number(Number(last.lat).toFixed(3)),
    lng: Number(Number(last.lng).toFixed(3)),
    label: String(last.label || '前回の場所'),
    radius: [800, 3200].includes(last.radius) ? last.radius : 800,
  } : null;
  const value = {
    v: 1, last: rounded, onlyFree: Boolean(onlyFree),
    layers: {
      municipal: layers.municipal !== false,
      osm: layers.osm !== false,
      chain: layers.chain !== false,
    },
    updatedAt: now,
  };
  try { storage?.setItem(SETTINGS_SLOT, JSON.stringify(value)); return true; }
  catch { return false; }
}

export { SETTINGS_SLOT };
