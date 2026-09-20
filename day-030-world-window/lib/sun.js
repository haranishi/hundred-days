const radians = (degrees) => degrees * Math.PI / 180;
const degrees = (radiansValue) => radiansValue * 180 / Math.PI;

export function sunElevation(lat, lon, date) {
  const instant = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Number.isNaN(instant.getTime())) return Number.NaN;

  const start = Date.UTC(instant.getUTCFullYear(), 0, 0);
  const day = Math.floor((Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()) - start) / 86_400_000);
  const hour = instant.getUTCHours() + instant.getUTCMinutes() / 60 + instant.getUTCSeconds() / 3600;
  const gamma = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
  const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const minutes = hour * 60;
  const trueSolarMinutes = minutes + equation + 4 * lon;
  let hourAngle = trueSolarMinutes / 4 - 180;
  hourAngle = ((hourAngle + 180) % 360 + 360) % 360 - 180;
  const elevation = Math.asin(Math.sin(radians(lat)) * Math.sin(declination)
    + Math.cos(radians(lat)) * Math.cos(declination) * Math.cos(radians(hourAngle)));
  return degrees(elevation);
}

export function dayPhase(elevation) {
  if (elevation >= 6) return 'day';
  if (elevation >= -6) return 'twilight';
  return 'night';
}
