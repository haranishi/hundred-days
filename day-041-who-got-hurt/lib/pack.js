/* 事故1件を6バイトに詰める形式。ビルドと画面で同じこの1本を使う。
   位置はファイルの基準メッシュ南西角からの相対値で持つので、
   ファイル名（メッシュ番号）が分かれば緯度経度に戻せる */

export const MAGIC = 0x48443431; /* "HD41" */
export const HEADER_BYTES = 12;
export const RECORD_BYTES = 6;
export const FIRST_YEAR = 2019;
export const LAST_YEAR = 2024;
export const HOUR_UNKNOWN = 24;

/* 種別フラグ。色ではなく意味で持つ */
export const F_WALKER = 1 << 0;   /* 歩行者が関わった */
export const F_BIKE = 1 << 1;     /* 自転車が関わった */
export const F_MOTOR = 1 << 2;    /* 二輪車が関わった */
export const F_DEATH = 1 << 3;    /* 死亡事故 */
export const F_ELDER = 1 << 4;    /* 65歳以上が関わった */
export const F_CROSS = 1 << 5;    /* 交差点またはその付近 */
export const F_NIGHT = 1 << 6;    /* 夜（日の入り後〜日の出前） */

/* 地域メッシュ。4桁＝1次（約80km四方）、6桁＝2次（約10km四方）。
   1次の緯度幅は40分＝2/3度、経度幅は1度。2次はそれを8×8に割る */
export const MESH1_LAT = 2 / 3;
export const MESH1_LON = 1;

export function meshBounds(code) {
  const text = String(code);
  if (!/^\d{4}$|^\d{6}$/.test(text)) throw new Error(`メッシュ番号が4桁でも6桁でもない: ${code}`);
  const p = Number(text.slice(0, 2));
  const u = Number(text.slice(2, 4));
  let lat = p / 1.5;
  let lng = u + 100;
  let latSpan = MESH1_LAT;
  let lngSpan = MESH1_LON;
  if (text.length === 6) {
    const q = Number(text[4]);
    const v = Number(text[5]);
    if (q > 7 || v > 7) throw new Error(`2次メッシュの桁が範囲外: ${code}`);
    latSpan = MESH1_LAT / 8;
    lngSpan = MESH1_LON / 8;
    lat += q * latSpan;
    lng += v * lngSpan;
  }
  return { lat, lng, latSpan, lngSpan };
}

export function meshCodeOf(lat, lng, level = 2) {
  const p = Math.floor(lat * 1.5);
  const u = Math.floor(lng - 100);
  if (level === 1) return `${p}${u}`;
  const q = Math.floor((lat * 1.5 - p) * 8);
  const v = Math.floor((lng - 100 - u) * 8);
  return `${p}${u}${q}${v}`;
}

export const parentMesh = (code) => String(code).slice(0, 4);

/* 緯度経度 ⇔ 0〜65535。65535で割り切るので端がぴたりと合う */
const QMAX = 65535;
export const quantize = (value, base, span) =>
  Math.min(QMAX, Math.max(0, Math.round(((value - base) / span) * QMAX)));
export const dequantize = (q, base, span) => base + (q / QMAX) * span;

export function packTime(year, hour) {
  const y = year - FIRST_YEAR;
  if (y < 0 || y > 7) throw new Error(`年が範囲外: ${year}`);
  const h = hour >= 0 && hour <= 23 ? hour : HOUR_UNKNOWN;
  return (y & 0b111) | ((h & 0b11111) << 3);
}
export const unpackYear = (byte) => FIRST_YEAR + (byte & 0b111);
export const unpackHour = (byte) => (byte >> 3) & 0b11111;

export function writeHeader(view, meshDigits, count) {
  view.setUint32(0, MAGIC, false);
  view.setUint8(4, 1);
  view.setUint8(5, meshDigits);
  view.setUint16(6, 0, true);
  view.setUint32(8, count, true);
}

/* 読み出し。返すのは {lat,lng,year,hour,flags} の配列 */
export function readPack(buffer, meshCode) {
  const view = new DataView(buffer);
  if (view.byteLength < HEADER_BYTES) throw new Error('ファイルが短すぎる');
  if (view.getUint32(0, false) !== MAGIC) throw new Error('目印が違う');
  const meshDigits = view.getUint8(5);
  if (meshDigits !== String(meshCode).length) {
    throw new Error(`メッシュの桁が食い違う: ファイル${meshDigits} / 要求${String(meshCode).length}`);
  }
  const count = view.getUint32(8, true);
  const expected = HEADER_BYTES + count * RECORD_BYTES;
  if (view.byteLength !== expected) {
    throw new Error(`件数と大きさが合わない: ${view.byteLength} ≠ ${expected}`);
  }
  const { lat, lng, latSpan, lngSpan } = meshBounds(meshCode);
  const out = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const at = HEADER_BYTES + i * RECORD_BYTES;
    out[i] = {
      lat: dequantize(view.getUint16(at, true), lat, latSpan),
      lng: dequantize(view.getUint16(at + 2, true), lng, lngSpan),
      year: unpackYear(view.getUint8(at + 4)),
      hour: unpackHour(view.getUint8(at + 4)),
      flags: view.getUint8(at + 5),
    };
  }
  return out;
}
