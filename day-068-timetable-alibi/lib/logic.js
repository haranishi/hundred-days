// Minutes after midnight. Only timetable calls permit boarding/alighting.
export const stationById = (stations, id) => stations.find((s) => s.id === id);
export function formatTime(value) {
  if (!Number.isFinite(value)) return '到達不可';
  const m = Math.floor(value);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export function earliestJourney(caseData, from, at, to) {
  if (from === to) return { arrival: at, legs: [] };
  const best = new Map([[from, at]]);
  const pending = [{ station: from, arrival: at, legs: [] }];
  while (pending.length) {
    pending.sort((a, b) => a.arrival - b.arrival);
    const current = pending.shift();
    if (current.arrival !== best.get(current.station)) continue;
    if (current.station === to) return { arrival: current.arrival, legs: current.legs };
    const ready = current.arrival + (current.legs.length ? caseData.transferMinutes : 0);
    for (const train of caseData.trains) {
      for (let i = 0; i < train.stops.length - 1; i++) {
        const boarding = train.stops[i];
        if (boarding.station !== current.station || boarding.depart < ready) continue;
        for (const destination of train.stops.slice(i + 1)) {
          if (destination.arrive >= (best.get(destination.station) ?? Infinity)) continue;
          best.set(destination.station, destination.arrive);
          pending.push({ station: destination.station, arrival: destination.arrive, legs: [
            ...current.legs,
            { train: train.id, from: current.station, to: destination.station,
              depart: boarding.depart, arrive: destination.arrive }
          ] });
        }
      }
    }
  }
  return { arrival: Infinity, legs: [] };
}
export function investigate(caseData, person) {
  const journey = earliestJourney(caseData, person.record.station, person.record.time, person.claim.station);
  return { ...journey, contradiction: journey.arrival > person.claim.time,
    gap: Number.isFinite(journey.arrival) ? journey.arrival - person.claim.time : null };
}
export function validateCase(caseData, stations) {
  const ids = new Set(stations.map((s) => s.id)), trainIds = new Set();
  if (!Number.isInteger(caseData.transferMinutes) || caseData.transferMinutes < 0) throw new Error('Invalid transfer time');
  for (const train of caseData.trains) {
    if (trainIds.has(train.id) || train.stops.length < 2) throw new Error('Invalid train');
    trainIds.add(train.id);
    let last = -1;
    for (const stop of train.stops) {
      if (!ids.has(stop.station) || !Number.isInteger(stop.arrive) || !Number.isInteger(stop.depart)
        || stop.arrive < last || stop.depart < stop.arrive) throw new Error('Invalid stop');
      last = stop.depart;
    }
  }
  for (const person of caseData.people) {
    if (!ids.has(person.record.station) || !ids.has(person.claim.station)
      || person.claim.time < person.record.time) throw new Error('Invalid testimony');
  }
  const contradictions = caseData.people.filter((p) => investigate(caseData, p).contradiction);
  if (contradictions.length !== 1) throw new Error(`Expected one contradiction, found ${contradictions.length}`);
  return true;
}
export function trainState(train, time) {
  const first = train.stops[0], last = train.stops.at(-1);
  if (time < first.depart) return { kind: 'waiting', station: first.station };
  if (time >= last.arrive) return { kind: 'arrived', station: last.station };
  for (let i = 0; i < train.stops.length - 1; i++) {
    const a = train.stops[i], b = train.stops[i + 1];
    if (time >= a.arrive && time <= a.depart) return { kind: 'stopped', station: a.station };
    if (time >= a.depart && time < b.arrive) return {
      kind: 'moving', from: a.station, to: b.station,
      progress: (time - a.depart) / (b.arrive - a.depart)
    };
  }
  return { kind: 'arrived', station: last.station };
}
export const STORAGE_KEY = 'timetable-alibi-v1';
export function readProgress(storage, validIds) {
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY));
    const solved = Array.isArray(raw?.solved) ? [...new Set(raw.solved.filter((id) => validIds.includes(id)))] : [];
    return { solved, sound: raw?.sound === true };
  } catch { return { solved: [], sound: false }; }
}
export function saveProgress(storage, progress) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify({ solved: progress.solved, sound: progress.sound === true })); return true; }
  catch { return false; }
}
