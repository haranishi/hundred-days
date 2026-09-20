export function estimateOffsetHours(lon) {
  if (!Number.isFinite(lon)) return 0;
  return Math.max(-12, Math.min(14, Math.round(lon / 15)));
}

export function formatLocalTime(lon, date) {
  const instant = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(instant.getTime())) return '';
  const shifted = new Date(instant.getTime() + estimateOffsetHours(lon) * 3_600_000);
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}
