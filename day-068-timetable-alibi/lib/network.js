export const STATIONS = [
  { id: 'harbor', number: '01', name: '灯台港', en: 'TODAI PORT', x: -13, z: 5.7, color: '#e5b36a', kind: 'harbor' },
  { id: 'central', number: '02', name: '汐見中央', en: 'SHIOMI CENTRAL', x: -3.5, z: 1.2, color: '#e5b36a', kind: 'town' },
  { id: 'forest', number: '03', name: '白樺', en: 'SHIRAKABA', x: 4, z: 6, color: '#e5b36a', kind: 'forest' },
  { id: 'ridge', number: '04', name: '霧山', en: 'KIRIYAMA', x: 3.2, z: -6.4, color: '#7ec9bd', kind: 'mountain' },
  { id: 'onsen', number: '05', name: '星見温泉', en: 'HOSHIMI ONSEN', x: 13, z: -2.8, color: '#7ec9bd', kind: 'onsen' }
];
export const TRACKS = [
  { from: 'harbor', to: 'central', via: [-9, 0.8], color: '#dca553' },
  { from: 'central', to: 'forest', via: [1, 4.4], color: '#dca553' },
  { from: 'central', to: 'ridge', via: [-1.2, -6.6], color: '#61aaa5' },
  { from: 'ridge', to: 'onsen', via: [10.2, -7.6], color: '#61aaa5' }
];
const station = (id) => STATIONS.find((s) => s.id === id);
export function trackPoints(track, reverse = false) {
  const a = station(track.from), b = station(track.to), [vx, vz] = track.via;
  const result = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40, u = 1 - t;
    return { x: u*u*a.x+2*u*t*vx+t*t*b.x, z: u*u*a.z+2*u*t*vz+t*t*b.z };
  });
  return reverse ? result.reverse() : result;
}
export function routePoints(from, to) {
  const q = [{ id: from, points: [] }], visited = new Set([from]);
  while (q.length) {
    const current = q.shift();
    if (current.id === to) return current.points.length ? current.points : [station(from)];
    for (const track of TRACKS) {
      const reversed = track.to === current.id;
      if (!reversed && track.from !== current.id) continue;
      const next = reversed ? track.from : track.to;
      if (visited.has(next)) continue;
      visited.add(next);
      q.push({ id: next, points: [...current.points, ...trackPoints(track, reversed).slice(current.points.length ? 1 : 0)] });
    }
  }
  throw new Error('Unconnected station route');
}
export function pointAlong(points, progress) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));
  const distance = Math.max(0,Math.min(1,progress)) * lengths.at(-1);
  let index = lengths.findIndex((l) => l >= distance);
  if (index < 1) index = 1;
  const a = points[index-1], b = points[index] ?? a;
  const t = (distance-lengths[index-1]) / ((lengths[index]-lengths[index-1]) || 1);
  return { x: a.x+(b.x-a.x)*t, z: a.z+(b.z-a.z)*t, angle: Math.atan2(b.x-a.x,b.z-a.z) };
}
