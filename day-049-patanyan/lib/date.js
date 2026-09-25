// きょうのコースは「日本時間の日付」で全員そろえる。端末のタイムゾーンに引きずられないよう UTC+9 を足して UTC として読む
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstDateKey(nowMs) {
  const d = new Date(nowMs + JST_OFFSET_MS);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

export function isValidDateKey(key) {
  if (!Number.isInteger(key)) return false;
  const y = Math.floor(key / 10000);
  const m = Math.floor((key % 10000) / 100);
  const d = key % 100;
  if (y < 2024 || y > 2099 || m < 1 || m > 12 || d < 1) return false;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= last;
}

// 挑戦リンクの ?course= は外から来る値なので、8桁の実在する日付だけを通す
export function parseCourseParam(value) {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return null;
  const key = Number(value);
  return isValidDateKey(key) ? key : null;
}

export function dateLabel(key) {
  const m = Math.floor((key % 10000) / 100);
  const d = key % 100;
  return `${m}/${d}`;
}
