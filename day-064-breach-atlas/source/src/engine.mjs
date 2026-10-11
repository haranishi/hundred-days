import { CAUSES, UNITS, normalize } from './model.mjs';
import { LOCATION_IDS } from './geo-keys.mjs';
export const HEADER = 222;
const units = Object.keys(UNITS), causes = ['all', ...Object.keys(CAUSES)];
const statuses = ['all', 'confirmed', 'possible', 'reported', 'notice'];
const regions = ['all', 'japan', 'us'], registries = ['all', 'japan', 'california', 'hhs'];
const encoder = new TextEncoder();
export function decodeIndex(snapshot) {
  return snapshot.rows.map((row, index) => ({
    id: row[0], company: row[1], companyId: row[2], shortName: row[3] || row[1], aliases: row[4] || [],
    cause: row[5], year: row[6], announcedAt: row[7], status: row[8],
    scale: { unit: row[9], value: row[10], qualifier: row[11], bound: row[12] },
    region: row[13], registry: row[14], sourceKind: row[15] || null, geoCode: row[16] || (row[13] === 'japan' ? 'JP' : 'US'), geoBasis: row[17] || 'country-only', index,
  }));
}
export function searchText(record) { return normalize([record.company, record.shortName, ...record.aliases].join(' ')); }
export function searchTerms(query) { return String(query || '').trim().split(/\s+/).map(normalize).filter(Boolean); }
export function encodeIndex(records) {
  const searches = records.map(record => encoder.encode(searchText(record)));
  const length = 4 + records.length * 28 + searches.reduce((sum, bytes) => sum + bytes.length, 0);
  const bytes = new Uint8Array(length), view = new DataView(bytes.buffer), companies = new Map();
  view.setUint32(0, records.length, true); let offset = 4;
  records.forEach((record, index) => {
    const key = record.companyId;
    if (!companies.has(key)) companies.set(key, companies.size);
    view.setUint16(offset, record.year, true);
    bytes[offset + 2] = units.indexOf(record.scale.unit); bytes[offset + 3] = causes.indexOf(record.cause);
    bytes[offset + 4] = statuses.indexOf(record.status); bytes[offset + 5] = regions.indexOf(record.region);
    bytes[offset + 6] = registries.indexOf(record.registry);
    bytes[offset + 7] = LOCATION_IDS.get(record.geoCode) || 0;
    view.setUint32(offset + 8, Number(record.announcedAt.replaceAll('-', '').padEnd(8, '0')), true);
    view.setFloat64(offset + 12, record.scale.value ?? -1, true); view.setUint32(offset + 20, companies.get(key), true);
    view.setUint32(offset + 24, searches[index].length, true); offset += 28;
    bytes.set(searches[index], offset); offset += searches[index].length;
  });
  return bytes;
}
export function unpackResult(packed) {
  return { indices: Array.from(packed.slice(HEADER)), count: packed[0], companies: packed[1], causes: Array.from(packed.slice(2, 9)), units: Array.from(packed.slice(9, 14)), years: Array.from(packed.slice(14, 215)), regions: Array.from(packed.slice(215, 218)), registries: Array.from(packed.slice(218, 222)) };
}
export class WasmEngine {
  constructor(exports, records) {
    this.wasm = exports;
    const bytes = encodeIndex(records), pointer = exports.allocate(bytes.length);
    try {
      new Uint8Array(exports.memory.buffer, pointer, bytes.length).set(bytes);
      if (exports.load(pointer, bytes.length) !== records.length) throw new Error('Invalid search index');
    } finally { exports.release(pointer, bytes.length); }
  }
  query(filters, order = 'date') {
    const bytes = encoder.encode(searchTerms(filters.query).join('\n')), w = this.wasm, pointer = w.allocate(bytes.length);
    try {
      new Uint8Array(w.memory.buffer, pointer, bytes.length).set(bytes);
      const period = filters.period === 'all' ? 0 : filters.period === 'recent' ? 1 : filters.period === 'historical' ? 2 : Number(filters.period);
      const location = !filters.location || filters.location === 'all' ? 0 : LOCATION_IDS.get(filters.location);
      if (location === undefined) throw new RangeError('Unknown geographic region.');
      const length = w.query(units.indexOf(filters.unit), causes.indexOf(filters.cause), period, statuses.indexOf(filters.status), regions.indexOf(filters.region || 'all'), registries.indexOf(filters.registry || 'all'), location, order === 'scale' ? 2 : order === 'oldest' ? 1 : 0, pointer, bytes.length);
      if (!length) throw new RangeError('Comparison requires one known unit.');
      return unpackResult(new Uint32Array(w.memory.buffer, w.result_pointer(), length).slice());
    } finally { w.release(pointer, bytes.length); }
  }
}
export function referenceEngine(records) {
  const texts = records.map(searchText);
  return { query(filters, order = 'date') {
    if (order === 'scale' && ['all', 'unknown'].includes(filters.unit)) throw new RangeError('Choose one known unit.');
    const terms = searchTerms(filters.query), packed = new Uint32Array(HEADER), indices = [], companies = new Set();
    records.forEach((record, index) => {
      if (filters.location && filters.location !== 'all' && record.geoCode !== filters.location) return;
      if (!terms.every(term => texts[index].includes(term))) return;
      const unit = filters.unit === 'all' || filters.unit === record.scale.unit;
      const cause = filters.cause === 'all' || filters.cause === record.cause;
      const status = filters.status === 'all' || filters.status === record.status;
      const region = !filters.region || filters.region === 'all' || filters.region === record.region;
      const registry = !filters.registry || filters.registry === 'all' || filters.registry === record.registry;
      const period = filters.period === 'all' || (filters.period === 'recent' ? record.year >= 2025 : filters.period === 'historical' ? record.year < 2025 : record.year === Number(filters.period));
      if (cause && status && region && registry && period) { packed[9]++; packed[9 + units.indexOf(record.scale.unit)]++; }
      if (unit && status && region && registry && period) packed[2 + causes.indexOf(record.cause) - 1]++;
      if (unit && cause && status && region && registry) packed[14 + record.year - 1900]++;
      if (unit && cause && status && registry && period) { packed[215]++; packed[215 + regions.indexOf(record.region)]++; }
      if (unit && cause && status && region && period) { packed[218]++; packed[218 + registries.indexOf(record.registry)]++; }
      if (unit && cause && status && region && registry && period) { indices.push(index); companies.add(record.companyId); }
    });
    indices.sort((a, b) => (order === 'scale' ? (records[b].scale.value ?? -1) - (records[a].scale.value ?? -1) : 0) || (order === 'oldest' ? records[a].announcedAt.localeCompare(records[b].announcedAt) : records[b].announcedAt.localeCompare(records[a].announcedAt)) || a - b);
    packed[0] = indices.length; packed[1] = companies.size;
    return { ...unpackResult(packed), indices };
  } };
}
