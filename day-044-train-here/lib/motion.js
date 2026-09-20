import { RAILWAYS, RAILWAY_BY_ID, geo } from './railways.js';

export const CAR_SPACING = 1.6;
export const CAR_COUNT = 4;
export const SAMPLES_PER_SECTION = 24;
const positiveMod = (x, size) => ((x % size) + size) % size;
const mix = (a, b, t) => a + (b - a) * t;
function curveValue(a, b, c, d, t) { return .5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t); }

export function buildPath(route) {
  const base = route.stations.map(s => geo(s.lng, s.lat));
  const points = base.map((p, i) => {
    const a = base[Math.max(0, i - 1)], b = base[Math.min(base.length - 1, i + 1)];
    const length = Math.max(.001, Math.hypot(b.x - a.x, b.z - a.z)), offset = route.offset || 0;
    return { x: p.x + (b.z - a.z) / length * offset, z: p.z - (b.x - a.x) / length * offset };
  });
  const sections = route.closed ? points.length : points.length - 1;
  const get = index => points[route.closed ? positiveMod(index, points.length) : Math.max(0, Math.min(points.length - 1, index))];
  const samples = [], stationDistances = []; let distance = 0;
  for (let i = 0; i <= sections * SAMPLES_PER_SECTION; i++) {
    const section = Math.min(sections - 1, Math.floor(i / SAMPLES_PER_SECTION));
    const t = (i - section * SAMPLES_PER_SECTION) / SAMPLES_PER_SECTION;
    const [a, b, c, d] = [get(section - 1), get(section), get(section + 1), get(section + 2)];
    const point = { x: curveValue(a.x, b.x, c.x, d.x, t), y: route.height, z: curveValue(a.z, b.z, c.z, d.z, t) };
    if (i) distance += Math.hypot(point.x - samples[i - 1].x, point.z - samples[i - 1].z);
    samples.push({ ...point, distance });
    if (i % SAMPLES_PER_SECTION === 0) stationDistances.push(distance);
  }
  return { id: route.id, closed: !!route.closed, samples, stationDistances, length: distance, sections };
}
export const PATHS = new Map(RAILWAYS.map(route => [route.id, buildPath(route)]));
export function distanceAtPosition(path, position) {
  const p = path.closed ? positiveMod(position, path.sections) : Math.max(0, Math.min(path.sections, position));
  const sample = p * SAMPLES_PER_SECTION, index = Math.floor(sample);
  return mix(path.samples[index].distance, path.samples[Math.min(index + 1, path.samples.length - 1)].distance, sample - index);
}
export function pointOnPath(path, distance, lane = 0) {
  const d = path.closed ? positiveMod(distance, path.length) : Math.max(0, Math.min(path.length, distance));
  let low = 0, high = path.samples.length - 1;
  while (high - low > 1) { const mid = (high + low) >> 1; if (path.samples[mid].distance <= d) low = mid; else high = mid; }
  const a = path.samples[low], b = path.samples[high];
  const t = (d - a.distance) / Math.max(.00001, b.distance - a.distance);
  const length = Math.max(.00001, Math.hypot(b.x - a.x, b.z - a.z));
  const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
  return { x: mix(a.x, b.x, t) + dz * lane, y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) - dx * lane, dx, dz, angle: Math.atan2(dx, dz) };
}
export function trainCars(train) {
  const path = PATHS.get(train.railway);
  if (!path || !Number.isFinite(train.distance) || ![-1, 1].includes(train.direction)) return [];
  const padding = CAR_SPACING * (CAR_COUNT - 1) / 2 + .8;
  const center = path.closed ? train.distance : Math.max(padding, Math.min(path.length - padding, train.distance));
  return Array.from({ length: CAR_COUNT }, (_, index) => {
    const p = pointOnPath(path, center + ((CAR_COUNT - 1) / 2 - index) * CAR_SPACING * train.direction, .45 * train.direction);
    return { ...p, angle: p.angle + (train.direction < 0 ? Math.PI : 0) };
  });
}

// 時刻表とは無関係の動作サンプル。各駅で短く止まり、加減速して次の駅へ進む。
function easedSection(phase) {
  const section = Math.floor(phase), fraction = phase - section;
  const t = Math.max(0, (fraction - .15) / .85);
  return section + t * t * (3 - 2 * t);
}
export function sceneDemoTrains(seconds) {
  return RAILWAYS.flatMap(route => {
    const path = PATHS.get(route.id);
    return Array.from({ length: route.demoCount }, (_, index) => {
      let position, direction, phase;
      if (path.closed) {
        direction = index % 2 ? -1 : 1;
        phase = positiveMod(Math.floor(index / 2) * path.sections / (route.demoCount / 2) + seconds / 13, path.sections);
        position = positiveMod(easedSection(phase) * direction, path.sections);
      } else {
        phase = positiveMod(index * path.sections * 2 / route.demoCount + seconds / 15, path.sections * 2);
        direction = phase < path.sections ? 1 : -1;
        position = phase < path.sections ? easedSection(phase) : path.sections * 2 - easedSection(phase);
      }
      const previous = direction > 0 ? Math.floor(position) : Math.ceil(position);
      const stationIndex = n => path.closed ? positiveMod(n, route.stations.length) : Math.max(0, Math.min(route.stations.length - 1, n));
      return { id: `demo-${route.id}-${index}`, railway: route.id, direction, distance: distanceAtPosition(path, position), number: `${route.code} ${String(index + 1).padStart(2, '0')}`, source: 'demo', from: route.stations[stationIndex(previous)].name, to: route.stations[stationIndex(previous + direction)].name, stopped: phase % 1 < .15 };
    });
  });
}
export function sceneLiveTrains(trains) {
  const path = PATHS.get('yamanote');
  return trains.map(t => ({ id: t.id, railway: 'yamanote', direction: t.direction === 'outer' ? 1 : -1, distance: distanceAtPosition(path, t.position), number: t.number || '列車番号不明', source: 'live', from: RAILWAY_BY_ID.get('yamanote').stations.find(s => s.id === t.from)?.name || '不明', to: RAILWAY_BY_ID.get('yamanote').stations.find(s => s.id === t.to)?.name || null, updatedAt: t.updatedAt, validUntil: t.validUntil, delay: t.delay }));
}
