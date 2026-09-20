import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, LIMIT, append, clear, load, toCsv, toRecord } from '../lib/history.js';

/** localStorage の最小の代役。壊れた値を入れる試験もここで作る */
const fakeStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    raw: map
  };
};

const sample = { t: 1787463861863, dl: 10.44, ul: 118.27, li: 24.4, ld: 45.1, lu: 61.9, jit: 6.2, grade: 'C', v6: true, eco: false };

test('保存するのは決めた項目だけ（IPや地名は入らない）', () => {
  const record = toRecord({ ...sample, ip: '2400:4053::1', city: 'Akita', lat: 39.7 });
  assert.deepEqual(Object.keys(record).sort(), ['dl', 'eco', 'grade', 'jit', 'ld', 'li', 'lu', 't', 'ul', 'v6'].sort());
  assert.equal(record.ip, undefined);
  assert.equal(record.city, undefined);
});

test('数値は小数第1位に丸めて保存する', () => {
  assert.equal(toRecord(sample).dl, 10.4);
  assert.equal(toRecord(sample).ul, 118.3);
});

test('測れなかった値は null で残す（0で埋めない）', () => {
  const record = toRecord({ ...sample, ld: null, lu: undefined });
  assert.equal(record.ld, null);
  assert.equal(record.lu, null);
});

test('何も保存されていなければ空で返り、壊れているとは言わない', () => {
  const result = load(fakeStorage());
  assert.deepEqual(result, { items: [], broken: false });
});

test('壊れたJSONは捨てずに broken として返す', () => {
  assert.equal(load(fakeStorage({ [KEY]: '{ぐちゃぐちゃ' })).broken, true);
});

test('知らない版番号は broken として扱う（黙って読み替えない）', () => {
  assert.equal(load(fakeStorage({ [KEY]: JSON.stringify({ v: 99, items: [sample] }) })).broken, true);
});

test('中身が全部読めない形なら broken', () => {
  const stored = JSON.stringify({ v: 1, items: [{ nope: 1 }, { nope: 2 }] });
  assert.equal(load(fakeStorage({ [KEY]: stored })).broken, true);
});

test('読める行だけ残して返す', () => {
  const stored = JSON.stringify({ v: 1, items: [sample, { nope: 1 }] });
  const result = load(fakeStorage({ [KEY]: stored }));
  assert.equal(result.broken, false);
  assert.equal(result.items.length, 1);
});

test('追記すると保存され、次に読める', () => {
  const storage = fakeStorage();
  const items = append(storage, [], sample);
  assert.equal(items.length, 1);
  assert.equal(load(storage).items[0].dl, 10.4);
});

test('上限を超えたら古いものから落とす', () => {
  const storage = fakeStorage();
  let items = [];
  for (let i = 0; i < LIMIT + 5; i += 1) items = append(storage, items, { ...sample, t: i + 1, dl: i });
  assert.equal(items.length, LIMIT);
  assert.equal(items[0].dl, 5);
  assert.equal(items.at(-1).dl, LIMIT + 4);
});

test('保存できない環境でも落ちない', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  assert.doesNotThrow(() => append(storage, [], sample));
});

test('読み出し自体が例外になる環境は broken 扱い', () => {
  const storage = { getItem: () => { throw new Error('denied'); } };
  assert.deepEqual(load(storage), { items: [], broken: true });
});

test('全消しできる', () => {
  const storage = fakeStorage();
  append(storage, [], sample);
  assert.deepEqual(clear(storage), []);
  assert.equal(storage.getItem(KEY), null);
});

test('CSVは見出し付きで、真偽値は1/0になる', () => {
  const lines = toCsv([toRecord(sample)]).split('\n');
  assert.equal(lines[0], 'timestamp,down_mbps,up_mbps,latency_idle_ms,latency_down_ms,latency_up_ms,jitter_ms,grade,ipv6,eco');
  assert.match(lines[1], /^2026-.*,10\.4,118\.3,24\.4,45\.1,61\.9,6\.2,C,1,0$/);
});

test('CSVに測れなかった値は空欄で出る', () => {
  const lines = toCsv([toRecord({ ...sample, ld: null })]).split('\n');
  assert.match(lines[1], /,24\.4,,61\.9,/);
});
