const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** 2地点間の大圏距離をkmで返す。 */
export function haversine(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((value) => value === null || value === undefined || value === '')) {
    return Number.NaN;
  }
  const values = [lat1, lon1, lat2, lon2].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return Number.NaN;

  const [aLat, aLon, bLat, bLon] = values.map(toRadians);
  const deltaLat = bLat - aLat;
  const deltaLon = bLon - aLon;
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const chord = sinLat ** 2 + Math.cos(aLat) * Math.cos(bLat) * sinLon ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, chord)));
}
