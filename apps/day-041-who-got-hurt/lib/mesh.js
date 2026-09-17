/* 索引の引き方。どのファイルを取れば足りるかを決めるのはここだけ。

   ビルドは2次メッシュ（約10km四方）ごとに分け、2,000件に満たないものは
   親の1次メッシュ（約80km四方）へまとめてある。つまり
   「2次メッシュ番号が索引にあればそれ、無ければ親の4桁」で必ず当たる。 */
import { meshCodeOf, parentMesh } from './pack.js';

export const METERS_PER_DEG_LAT = 111320;
export const fileUrl = (code) => `./data/m/${code}.bin`;

export function fileForPoint(index, lat, lng) {
  const files = index?.files ?? {};
  const second = meshCodeOf(lat, lng, 2);
  if (files[second] != null) return second;
  const first = parentMesh(second);
  return files[first] != null ? first : null;
}

/* 半径の四隅が入るメッシュを集める。メッシュは最小でも約10km四方なので、
   半径1kmで増えるのはメッシュの境目をまたぐときだけ（最大4本）。
   四隅を見れば、円に重なるメッシュは漏れなく拾える */
export function filesForCircle(index, point, radiusM) {
  const dLat = radiusM / METERS_PER_DEG_LAT;
  const dLng = radiusM / (METERS_PER_DEG_LAT * Math.cos(point.lat * Math.PI / 180));
  const found = new Set();
  for (const lat of [point.lat - dLat, point.lat + dLat]) {
    for (const lng of [point.lng - dLng, point.lng + dLng]) {
      const code = fileForPoint(index, lat, lng);
      if (code) found.add(code);
    }
  }
  return [...found].sort();
}

// 索引が言っている件数。これだけ先に分かるので、取る前に見当が付く
export const bytesFor = (index, codes) =>
  codes.reduce((sum, code) => sum + 12 + (index?.files?.[code] ?? 0) * 6, 0);

export const yearSpan = (index) => {
  const [first, last] = index?.years ?? [];
  return Number.isInteger(first) && Number.isInteger(last) ? last - first + 1 : 0;
};
