/* メルカトル投影と、描くものが全部入る範囲の決め方。
   地図ライブラリを入れずに canvas へ直接描くので、投影はここだけで完結させる。 */

const rad = (n) => (n * Math.PI) / 180;
export const MAX_LAT = 85;

/* 緯度 → メルカトルのy（北が大きい）。単位は「赤道上の1度」にそろえてある。
   x は経度をそのまま度で使うので、y も度に直しておかないと縦横比が π/180 倍ずれる。
   極に近い値は丸めて発散させない */
export function mercatorY(lat) {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  return (Math.log(Math.tan(Math.PI / 4 + rad(clamped) / 2)) * 180) / Math.PI;
}

/** メルカトルのy → 緯度 */
export const mercatorLat = (y) => (Math.atan(Math.sinh(rad(y))) * 180) / Math.PI;

/** 点の集まりを囲む枠。空なら null */
export function boundsOf(points) {
  let west = Infinity; let east = -Infinity; let south = Infinity; let north = -Infinity;
  for (const at of points) {
    if (!at || !Number.isFinite(at.lat) || !Number.isFinite(at.lng)) continue;
    west = Math.min(west, at.lng); east = Math.max(east, at.lng);
    south = Math.min(south, at.lat); north = Math.max(north, at.lat);
  }
  return Number.isFinite(west) ? { west, east, south, north } : null;
}

/** 枠を余白のぶん広げる（度ではなく枠の大きさに対する割合） */
export function padBounds(bounds, ratio = 0.1) {
  const width = Math.max(bounds.east - bounds.west, 0.2);
  const height = Math.max(bounds.north - bounds.south, 0.2);
  return {
    west: bounds.west - width * ratio,
    east: bounds.east + width * ratio,
    south: bounds.south - height * ratio,
    north: bounds.north + height * ratio,
  };
}

/**
 * 枠と画面の大きさから、緯度経度→ピクセルの変換を作る。
 * 縦横比は保つ（どちらかが余る方向へ枠を広げる）。
 */
export function createProjection(bounds, width, height) {
  const west = bounds.west;
  const east = Math.max(bounds.east, bounds.west + 1e-6);
  const top = mercatorY(Math.max(bounds.north, bounds.south + 1e-6));
  const bottom = mercatorY(bounds.south);
  const scale = Math.min(width / (east - west), height / (top - bottom));
  const centerLng = (west + east) / 2;
  const centerY = (top + bottom) / 2;
  const toPixel = (lat, lng) => ({
    x: width / 2 + (lng - centerLng) * scale,
    y: height / 2 - (mercatorY(lat) - centerY) * scale,
  });
  return {
    width,
    height,
    scale,
    toPixel,
    /* メートルの半径をピクセルに直す。円の中心の緯度でメルカトルの伸びを見込む。
       厳密な楕円にはしない（画面では差が出ない） */
    metersToPixels(meters, lat) {
      const degrees = meters / 111320;
      return (degrees / Math.cos(rad(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))))) * scale;
    },
    /* 逆変換。目盛線を引く範囲を求めるのに使う */
    bounds: () => ({
      west: centerLng - width / 2 / scale,
      east: centerLng + width / 2 / scale,
      south: mercatorLat(centerY - height / 2 / scale),
      north: mercatorLat(centerY + height / 2 / scale),
    }),
  };
}
