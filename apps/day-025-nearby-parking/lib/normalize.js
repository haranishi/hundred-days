const RESTRICTED = new Set(['private', 'customers', 'no']);

export function normalizeElement(element) {
  const lat = element.type === 'node' ? element.lat : element.center?.lat;
  const lng = element.type === 'node' ? element.lon : element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const tags = element.tags || {};
  const fee = tags.fee === 'yes' ? 'yes' : tags.fee === 'no' ? 'no' : 'unknown';
  return {
    id: `${element.type}/${element.id}`,
    name: tags.name || null,
    lat,
    lng,
    fee,
    charge: tags.charge || null,
    openingHours: tags.opening_hours === '24/7' ? '24時間' : tags.opening_hours || null,
    capacity: tags.capacity || null,
    restricted: RESTRICTED.has(tags.access),
    osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
  };
}

export function normalizeElements(elements = []) {
  return elements.map(normalizeElement).filter(Boolean);
}
