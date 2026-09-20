/* 生の値を、人が読める形に直すところ。

   Exifの数値は「分子と分母の組（RATIONAL）」で入っている。1/250秒・F2.8・35mmは
   すべてこの形なので、まず rationalValue で数にしてから単位ごとの表記にする。
   ここは表示専用で、解析にも除去にも関わらない。 */

/** RATIONAL（{n, d}）または素の数値を、ふつうの数にする。分母0や壊れた値は null。 */
export function rationalValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(value.n);
  const d = Number(value.d);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}

/** 度分秒（[度, 分, 秒]）と方角（N/S/E/W）を十進の緯度経度にする。 */
export function dmsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 2) return null;
  const degrees = rationalValue(dms[0]);
  const minutes = rationalValue(dms[1]);
  const seconds = dms.length > 2 ? rationalValue(dms[2]) : 0;
  if (degrees === null || minutes === null || seconds === null) return null;
  const size = Math.abs(degrees) + Math.abs(minutes) / 60 + Math.abs(seconds) / 3600;
  if (!Number.isFinite(size)) return null;
  const south = /^[SW]/i.test(String(ref ?? '').trim());
  return south ? -size : size;
}

/** 緯度経度は十進6桁。約0.1mの分解能で、地図の検索欄にそのまま貼れる桁数。 */
export function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(6) : '';
}

export function formatLatLon(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`;
}

/** Exifの日時は "2026:08:18 09:11:00"。読めない形式のときは元の文字列をそのまま返す。 */
export function formatExifDateTime(raw) {
  const text = String(raw ?? '').trim();
  const found = /^(\d{4})[:\-/](\d{1,2})[:\-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (!found) return text;
  const [, year, month, day, hour, minute, second] = found;
  const clock = `${Number(hour)}:${minute}${second ? `:${second}` : ''}`;
  return `${Number(year)}年${Number(month)}月${Number(day)}日 ${clock}`;
}

/** GPSDateStamp は "2026:08:18"。 */
export function formatExifDate(raw) {
  const text = String(raw ?? '').trim();
  const found = /^(\d{4})[:\-/](\d{1,2})[:\-/](\d{1,2})$/.exec(text);
  if (!found) return text;
  return `${Number(found[1])}年${Number(found[2])}月${Number(found[3])}日`;
}

/** GPSTimeStamp は [時, 分, 秒] のRATIONAL3つ。世界標準時なので呼び出し側でそう書く。 */
export function formatGpsTime(parts) {
  if (!Array.isArray(parts) || parts.length < 3) return '';
  const numbers = parts.map(rationalValue);
  if (numbers.some((value) => value === null)) return '';
  const pad = (value) => String(Math.floor(value)).padStart(2, '0');
  const seconds = Math.round(numbers[2] * 100) / 100;
  return `${pad(numbers[0])}:${pad(numbers[1])}:${String(Math.floor(seconds)).padStart(2, '0')}`;
}

/** 1秒より短ければ「1/250秒」、長ければ「2秒」。 */
export function formatExposureTime(value) {
  const seconds = rationalValue(value);
  if (seconds === null || seconds <= 0) return '';
  if (seconds >= 1) return `${trim(seconds, 1)}秒`;
  return `1/${Math.round(1 / seconds)}秒`;
}

export function formatFNumber(value) {
  const size = rationalValue(value);
  return size === null || size <= 0 ? '' : `F${trim(size, 1)}`;
}

export function formatFocalLength(value) {
  const size = rationalValue(value);
  return size === null || size <= 0 ? '' : `${trim(size, 1)}mm`;
}

export function formatIso(value) {
  const first = Array.isArray(value) ? value[0] : value;
  const size = rationalValue(first);
  return size === null || size <= 0 ? '' : `ISO ${Math.round(size)}`;
}

/** GPSAltitudeRef が 1 のときは海面より下。 */
export function formatAltitude(value, ref) {
  const size = rationalValue(value);
  if (size === null) return '';
  const below = Number(Array.isArray(ref) ? ref[0] : ref) === 1;
  return `${below ? '海面下' : '海抜'} ${trim(Math.abs(size), 1)}m`;
}

/** GPSImgDirectionRef が M のときは磁北基準。 */
export function formatDirection(value, ref) {
  const size = rationalValue(value);
  if (size === null) return '';
  const magnetic = /^M/i.test(String(ref ?? '').trim());
  return `${magnetic ? '磁北' : '真北'}から ${trim(size, 1)}度の向き`;
}

const ORIENTATIONS = {
  1: 'そのまま（回さない）',
  2: '左右を反転して見る',
  3: '180度回して見る',
  4: '上下を反転して見る',
  5: '左右を反転して時計回りに90度回して見る',
  6: '時計回りに90度回して見る',
  7: '左右を反転して反時計回りに90度回して見る',
  8: '反時計回りに90度回して見る'
};

export function formatOrientation(value) {
  const key = Number(Array.isArray(value) ? value[0] : value);
  return ORIENTATIONS[key] ? `${key}：${ORIENTATIONS[key]}` : '';
}

/** 縦写真かどうか（5〜8は90度回して表示する指定）。 */
export function isRotated(value) {
  const key = Number(Array.isArray(value) ? value[0] : value);
  return key >= 2 && key <= 8;
}

export function formatBytes(size) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)}バイト`;
  if (bytes < 1024 * 1024) return `${trim(bytes / 1024, 1)}KB`;
  return `${trim(bytes / (1024 * 1024), 1)}MB`;
}

/** 小数の末尾の0を落とす（2.80 → 2.8、35.0 → 35）。 */
function trim(value, digits) {
  return String(Number(value.toFixed(digits)));
}
