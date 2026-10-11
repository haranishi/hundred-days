import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeIndex, WasmEngine, referenceEngine } from '../src/engine.mjs';
import { DEFAULT_FILTERS, CAUSES } from '../src/model.mjs';
const snapshot = JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url), 'utf8'));
const records = decodeIndex(snapshot), bytes = readFileSync(new URL('../public/engine/search.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const rust = new WasmEngine(instance.exports, records), fallback = referenceEngine(records);

test('compiled browser Rust processes every real record and matches all contextual aggregates', () => {
  assert.ok(bytes.length < 100000); assert.equal(records.length, 18001);
  const checks = [
    {}, { region: 'japan' }, { region: 'us' }, { registry: 'hhs', region: 'us' }, { registry: 'california', region: 'us' },
    { query: 'ＫＤＤＩ' }, { query: 'べねっせ' }, { query: 'Ｐｌａｌａ' }, { query: 'LINE ヤフー' },
    { query: '横浜市 中区' }, { query: 'さいたま市 文化振興課' }, { query: 'health care' }, { query: '架空の未収録会社' }, { period: '2014' }, { period: 'recent' },
    { status: 'reported', unit: 'people' }, { region: 'japan', unit: 'records' },
    { location: 'JP-13' }, { location: 'JP' }, { location: 'US-CA', registry: 'hhs' }, { location: 'US-PR', period: 'recent' },
    ...Object.keys(CAUSES).map(cause => ({ cause })),
    ...['records','people','accounts','unknown'].map(unit => ({ unit })),
    ...['confirmed','possible','reported','notice'].map(status => ({ status })),
  ];
  for (const check of checks) for (const order of ['date','oldest']) {
    const filters = { ...DEFAULT_FILTERS, ...check };
    assert.deepEqual(rust.query(filters,order),fallback.query(filters,order), JSON.stringify({ check,order }));
  }
  for (const unit of ['records','people','accounts']) {
    const filters = { ...DEFAULT_FILTERS, unit }; assert.deepEqual(rust.query(filters,'scale'),fallback.query(filters,'scale'));
  }
});

test('filters and repeated queries do not alter the index or include a previous query', () => {
  const filters = { ...DEFAULT_FILTERS, query: 'KDDI', region: 'japan', unit: 'people' };
  for (let i=0; i<40; i++) { assert.equal(rust.query(filters).count,3); assert.equal(rust.query(DEFAULT_FILTERS).count,18001); }
  assert.equal(rust.query({ ...DEFAULT_FILTERS, region: 'japan', status: 'notice' }).count,4450);
  assert.throws(() => rust.query(DEFAULT_FILTERS,'scale'),RangeError);
  assert.throws(() => rust.query({ ...DEFAULT_FILTERS, unit: 'unknown' },'scale'),RangeError);
});

test('the lightweight index and lazy chunks resolve every record exactly once', () => {
  let full = [];
  for (let chunk=0; chunk<Math.ceil(records.length/snapshot.chunkSize); chunk++) full.push(...JSON.parse(readFileSync(new URL(`../public/data/details/${chunk}.json`,import.meta.url),'utf8')));
  assert.equal(full.length,18001);
  assert.deepEqual(full.map(record=>record.id),records.map(record=>record.id));
  full.forEach((record,index)=>assert.deepEqual(record.scale.value,records[index].scale.value));
  full.forEach((record,index)=>assert.equal(record.sourceKind || null,records[index].sourceKind));
  full.forEach((record,index)=>assert.equal(record.geoCode,records[index].geoCode));
  full.forEach((record,index)=>assert.equal(record.geoBasis,records[index].geoBasis));
});

test('source totals count each document URL once even when several pages are cited', () => {
  const data = JSON.parse(readFileSync(new URL('../src/data.json', import.meta.url), 'utf8'));
  const urls = [...data.incidents.flatMap(record => record.sources.map(source => source.url)), ...data.coverage.reports.map(report => report.sourceUrl || report.url)];
  const unique = new Set(urls.map(value => { const url = new URL(value); url.hash = ''; return url.href; }));
  assert.equal(snapshot.sourceCount, unique.size);
});
