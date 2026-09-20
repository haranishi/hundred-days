import { STATIONS, DIRECTIONS, RAILWAY, station, stopsBetween, mod } from './network.js';

export const MAX_AGE_MS = 120_000;
const safeText = value => typeof value === 'string' ? value.slice(0, 100) : '';
const stationId = value => typeof value === 'string' && value.startsWith('odpt.Station:JR-East.Yamanote.') ? value.split('.').at(-1) : null;
export function normalizeTrain(raw, now = Date.now()) {
  if (!raw || raw['odpt:railway'] !== RAILWAY) return null;
  const direction = { 'odpt.RailDirection:InnerLoop': 'inner', 'odpt.RailDirection:OuterLoop': 'outer' }[raw['odpt:railDirection']];
  const from = stationId(raw['odpt:fromStation']);
  const to = raw['odpt:toStation'] == null ? null : stationId(raw['odpt:toStation']);
  const updatedAt = Date.parse(raw['dc:date']);
  const validUntil = raw['dct:valid'] == null ? updatedAt + MAX_AGE_MS : Date.parse(raw['dct:valid']);
  const id = safeText(raw['owl:sameAs']);
  if (!direction || !station(from) || !id || !Number.isFinite(updatedAt) || !Number.isFinite(validUntil)) return null;
  if (updatedAt > now + 30_000 || now - updatedAt > MAX_AGE_MS || validUntil <= now) return null;
  if (raw['odpt:toStation'] != null && (!station(to) || stopsBetween(from, to, direction) !== 1)) return null;
  const destinationRaw = raw['odpt:destinationStation'];
  const destination = stationId(Array.isArray(destinationRaw) ? destinationRaw[0] : destinationRaw);
  const delay = raw['odpt:delay'];
  return {
    id, number: safeText(raw['odpt:trainNumber']), direction, from, to,
    destination: station(destination) ? destination : null,
    destinationKnown: !!station(destination),
    delay: typeof delay === 'number' && Number.isFinite(delay) && delay >= 0 ? delay : null,
    updatedAt, validUntil: Math.min(validUntil, updatedAt + MAX_AGE_MS),
    position: mod(station(from).index + (to ? DIRECTIONS[direction].step * 0.5 : 0)),
    source: 'live',
  };
}
export function isFresh(train, now = Date.now()) {
  return train.source === 'demo' || (Number.isFinite(train.validUntil) && train.validUntil > now && now - train.updatedAt <= MAX_AGE_MS);
}
export function distanceToBoard(train, origin) {
  if (!station(origin) || !DIRECTIONS[train.direction]) return Infinity;
  return mod((station(origin).index - train.position) * DIRECTIONS[train.direction].step);
}
export function candidates(trains, origin, destination, direction, now = Date.now()) {
  if (!station(origin) || !station(destination) || origin === destination || !DIRECTIONS[direction]) return [];
  return trains.filter(t => {
    if (t.direction !== direction || !isFresh(t, now)) return false;
    const distance = distanceToBoard(t, origin);
    if (distance > 5) return false;
    // 終着駅を越える案内をしない。終着駅不明の列車は候補に含めず、地図では表示する。
    if (!t.destinationKnown) return false;
    const terminalDistance = stopsBetween(t.from, t.destination, t.direction);
    const boardDistance = stopsBetween(t.from, origin, t.direction);
    const tripDistance = stopsBetween(origin, destination, t.direction);
    return t.source === 'demo' || (terminalDistance >= boardDistance + tripDistance && terminalDistance > 0);
  }).sort((a, b) => distanceToBoard(a, origin) - distanceToBoard(b, origin));
}
export function locationText(train) {
  return train.to ? `${station(train.from)?.name ?? '不明'} → ${station(train.to)?.name ?? '不明'}` : `${station(train.from)?.name ?? '不明'}駅付近`;
}
export function boardingText(train, origin) {
  const d = distanceToBoard(train, origin);
  if (d < 0.01) return '乗車駅付近';
  return `${Math.ceil(d)}駅手前`;
}

// 架空の運行。実ダイヤ・実在の列車番号・現在の発車予定には使わない。
export function demoTrains(elapsedSeconds) {
  return ['outer', 'inner'].flatMap(direction => Array.from({ length: 10 }, (_, index) => {
    const position = mod(index * 3 + (direction === 'inner' ? 1.2 : 0) + DIRECTIONS[direction].step * elapsedSeconds / 22);
    const base = direction === 'outer' ? Math.floor(position) : Math.ceil(position);
    const from = STATIONS[mod(base)].id;
    const to = STATIONS[mod(base + DIRECTIONS[direction].step)].id;
    return { id: `demo-${direction}-${index}`, number: `DEMO ${String(index + 1).padStart(2, '0')}`, direction, from, to,
      destination: null, destinationKnown: true, delay: null, position, source: 'demo', updatedAt: 0, validUntil: Infinity };
  }));
}
