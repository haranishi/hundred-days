export const VIEW_STORAGE_KEY = 'day030.view.v1';
export const ALL_KINDS = new Set(['yt', 'img', 'hls', 'page']);

export function createState() {
  return {
    cameras: [], countries: {}, meta: { count: 0, kinds: {} },
    enabledKinds: new Set(ALL_KINDS), selected: null, windyEnabled: true,
    windyConfigured: false, windyCameras: [], loading: true,
  };
}

export function readView(storage) {
  try {
    const value = JSON.parse(storage?.getItem(VIEW_STORAGE_KEY));
    if (!Array.isArray(value?.center) || value.center.length !== 2) return null;
    const center = value.center.map(Number);
    const zoom = Number(value.zoom);
    if (!center.every(Number.isFinite) || !Number.isFinite(zoom)) return null;
    return { center, zoom: Math.max(0, Math.min(18, zoom)) };
  } catch { return null; }
}

export function writeView(storage, center, zoom) {
  try {
    storage?.setItem(VIEW_STORAGE_KEY, JSON.stringify({ center: [center.lng, center.lat], zoom }));
  } catch { /* 保存不可でも地図そのものは使える。 */ }
}

export function toggleGroup(state, group) {
  const kinds = group === 'video' ? ['yt', 'hls'] : group === 'image' ? ['img'] : ['page'];
  const turnOn = kinds.some((kind) => !state.enabledKinds.has(kind));
  kinds.forEach((kind) => turnOn ? state.enabledKinds.add(kind) : state.enabledKinds.delete(kind));
  return turnOn;
}
