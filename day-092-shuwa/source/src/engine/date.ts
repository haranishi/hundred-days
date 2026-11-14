/** 端末から渡された暦日を扱う。現在時刻やローカルの時差は参照しない。 */
export function dayNumber(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('日付はYYYY-MM-DD形式で指定してください');
  const value = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) {
    throw new RangeError('存在しない日付です');
  }
  return value.getTime() / 86400000;
}

export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86400000).toISOString().slice(0, 10);
}

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { dayNumber(value); return true; } catch { return false; }
}
