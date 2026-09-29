// 県庁所在地に立てる柱の GeoJSON。高さ＝値÷最大値×最大高さ、色は指標の系統ごとの順序色。

import { circleRing } from './geo.js';
import { MAX_PILLAR_METERS, metricOf, pillarColor, pillarHeight, ranking } from './metrics.js';

export const PILLAR_RADIUS_KM = 14;
export const PILLAR_STEPS = 32;

// feature の id は県の並び（1〜47）に固定する。指標を切り替えても同じ県は同じ id なので、
// 伸びる演出（feature-state）がそのまま使える
export function buildPillars(prefectures, metricId, { maxMeters = MAX_PILLAR_METERS, radiusKm = PILLAR_RADIUS_KM } = {}) {
  const metric = metricOf(metricId);
  const rows = ranking(prefectures, metricId);
  const rankByCode = new Map(rows.map((row) => [row.code, row.rank]));
  const max = rows[0]?.value ?? 0;
  const features = [];
  prefectures.forEach((pref, index) => {
    const value = pref[metricId];
    if (!(value > 0)) return;
    const rank = rankByCode.get(pref.code);
    features.push({
      type: 'Feature',
      id: index + 1,
      properties: {
        code: pref.code,
        name: pref.name,
        value,
        rank,
        h: pillarHeight(value, max, maxMeters),
        color: pillarColor(metric.family, value / max),
        label: `${pref.name} ${metric.format(value)}（${rank}位）`,
        // 柱の根元（県庁所在地）。押した位置との近さを測るのに使う
        cx: pref.capital.lng,
        cy: pref.capital.lat,
      },
      geometry: { type: 'Polygon', coordinates: [circleRing(pref.capital.lng, pref.capital.lat, radiusKm, PILLAR_STEPS)] },
    });
  });
  return { type: 'FeatureCollection', features };
}

// 伸び方。1.2秒の ease-out（3次）
export const GROW_MS = 1200;
export const easeOut = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
