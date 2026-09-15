export function years(value, ago = true) {
  if (!Number.isFinite(Number(value)) || value === null || value === undefined || value < 0) return '年代不明';
  const n = Math.round(value * 1e6);
  if (!n) return ago ? '現在' : '0年';
  const oku = Math.floor(n / 1e8), man = Math.floor(n % 1e8 / 1e4), rest = n % 1e4;
  const comma = (v) => v.toLocaleString('ja-JP');
  return `${oku ? `${oku}億` : ''}${man ? `${comma(man)}万` : ''}${rest ? comma(rest) : ''}年${ago ? '前' : ''}`;
}
export const ageRange = (old, young) => old === young ? years(old) : `${years(old)}〜${years(young)}`;
export const periodAt = (age, times) => times.periods.find((t) => age <= t.from && (age > t.to || age === 0 && t.to === 0));
export function intervalFor(record, times) {
  const old = Number(record.eag), young = Number(record.lag);
  if (record.eag == null || record.lag == null || !Number.isFinite(old + young) || young < 0 || old < young) return null;
  const age = (old + young) / 2;
  return times.epochs.find((t) => age <= t.from && (age > t.to || age === 0 && t.to === 0)) || periodAt(age, times) || null;
}
export const environment = (env, table) => table.env[env] || null;
export const gapYears = (younger, older) => Math.max(0, Math.round((older.to - younger.from) * 1e6) / 1e6);
export function layersFor(collections, occurrences, times) {
  const groups = new Map();
  for (const c of collections) {
    const time = intervalFor(c, times) || { en: 'unknown', ja: '年代区分不明', color: '#ffffff', from: 0, to: 0 };
    if (!groups.has(time.en)) groups.set(time.en, { ...time, collections: [], occurrences: [] });
    groups.get(time.en).collections.push(c);
  }
  for (const layer of groups.values()) {
    layer.collections.sort((a, b) => a.distance - b.distance);
    const ids = new Set(layer.collections.map((c) => c.oid));
    layer.occurrences = occurrences.filter((o) => ids.has(o.cid));
  }
  return [...groups.values()].sort((a, b) => a.from - b.from);
}
