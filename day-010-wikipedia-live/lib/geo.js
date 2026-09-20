/* 緯度経度 → 画面の座標、と、座標 → どの国か。
   世界地図はズームもパンもしないので、投影は正距円筒（経度と緯度をそのまま横縦に置く）で足りる。 */

// 南極はほぼ使わないので下を切る。北も上を少し切って、陸のある帯だけを画面いっぱいに使う
export const BOUNDS = { west: -180, east: 180, north: 84, south: -58 };

export function project(lon, lat, width, height, bounds = BOUNDS) {
  const x = ((lon - bounds.west) / (bounds.east - bounds.west)) * width;
  const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * height;
  return [x, y];
}

/** 画面に入らない緯度（南極など）は描かないし、ピンも立てない。 */
export function inBounds(lon, lat, bounds = BOUNDS) {
  return lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north;
}

/** 点が多角形の中にあるか（射線法）。輪郭は [[lon, lat], …]。 */
export function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    // 同じ高さに辺があるときだけ、その辺が点の右側にあるかを数える
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 座標がどの国かを返す（見つからなければ null）。
 * 国の輪郭は1:110mまで間引いてあるので、海沿いや小さな島は外れることがある。
 * 名指しは「いちばん書き換わっている場所」の見出しに使うだけなので、その粗さで足りる。
 */
export function countryAt(lon, lat, countries) {
  for (const country of countries) {
    for (const ring of country.r) {
      if (inRing(lon, lat, ring)) return country;
    }
  }
  return null;
}

/** 経度の差を -180〜180 に畳む。太平洋をまたぐ線を画面の端から端まで引かないため。 */
export function wrapLon(delta) {
  let value = delta;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}
