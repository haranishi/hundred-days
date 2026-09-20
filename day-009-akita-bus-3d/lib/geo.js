/* 座標の妥当性判定と、緯度経度→平面(km)の変換。
   中継APIと同じ範囲をブラウザ側でももう一度確かめる（上流の仕様が変わっても、
   県外の座標が3Dの中に飛び出さないようにするため）。 */

export const AKITA_BOUNDS = { latMin: 38.8, latMax: 40.6, lonMin: 139.4, lonMax: 141.1 };

// 緯度1度の距離。経度方向はこれに cos(緯度) を掛ける
export const KM_PER_DEGREE = 111.32;

export function isInsideAkita(lat, lon) {
  return (
    Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= AKITA_BOUNDS.latMin && lat <= AKITA_BOUNDS.latMax
    && lon >= AKITA_BOUNDS.lonMin && lon <= AKITA_BOUNDS.lonMax
  );
}

/** bbox [lonMin, latMin, lonMax, latMax] の中心。壊れた値なら秋田市付近を返す。 */
export function boundsCenter(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) {
    return { lon: 140.1, lat: 39.7 };
  }
  return { lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
}

/** bbox の実寸(km)。経度方向は中心緯度で補正する。 */
export function boundsSpanKm(bbox, origin) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return { width: 120, height: 160 };
  return {
    width: Math.abs(bbox[2] - bbox[0]) * KM_PER_DEGREE * Math.cos((origin.lat * Math.PI) / 180),
    height: Math.abs(bbox[3] - bbox[1]) * KM_PER_DEGREE,
  };
}

/** 緯度経度 → 原点からの平面座標(km)。x=東, y=北。 */
export function toPlane(lon, lat, origin) {
  return {
    x: (lon - origin.lon) * KM_PER_DEGREE * Math.cos((origin.lat * Math.PI) / 180),
    y: (lat - origin.lat) * KM_PER_DEGREE,
  };
}
