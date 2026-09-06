export function googleMapsUrl(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

export function osmUrl(id) {
  const match = /^([nw])(\d+)$/.exec(String(id));
  if (!match) return null;
  return `https://www.openstreetmap.org/${match[1] === 'n' ? 'node' : 'way'}/${match[2]}`;
}
