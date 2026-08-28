const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(value) {
  if (value instanceof Date) return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const stamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(stamp);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? stamp
    : null;
}

export function expiryStatus(expiry, today = new Date()) {
  if (!expiry) return 'none';
  const expiryDay = dayNumber(expiry);
  const todayDay = dayNumber(today);
  if (expiryDay === null || todayDay === null) return 'none';
  const difference = Math.round((expiryDay - todayDay) / DAY_MS);
  if (difference < 0) return 'expired';
  if (difference <= 30) return 'soon';
  return 'ok';
}

