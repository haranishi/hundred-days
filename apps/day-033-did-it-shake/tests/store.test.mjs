import test from 'node:test';
import assert from 'node:assert/strict';
import { load, save, isAvailable, DEFAULTS } from '../lib/store.js';
function memory(initial = null) {
  const values = new Map(initial ? [['day-033-did-it-shake', initial]] : []);
  return { getItem: (name) => values.get(name), setItem: (name, value) => values.set(name, value), removeItem: (name) => values.delete(name) };
}
test('codeとmodeだけ保存し、picked/currentを読み戻す。外すと消える', () => {
  const storage = memory();
  for (const mode of ['picked', 'current']) {
    assert.equal(save({ code: '05201', mode, lat: 39.7, list: [] }, storage), true);
    assert.deepEqual(JSON.parse(storage.getItem('day-033-did-it-shake')), { code: '05201', mode });
    assert.deepEqual(load(storage), { code: '05201', mode });
  }
  save({ code: null }, storage); assert.deepEqual(load(storage), DEFAULTS);
});
test('壊れた値や不明な選択は捨てる', () => {
  for (const text of ['{', 'null', '{}', '{"code":43212,"mode":"picked"}', '{"code":"bad","mode":"current"}', '{"code":"05201","mode":"other"}']) assert.deepEqual(load(memory(text)), DEFAULTS);
});
test('保存が使えなくても動く', () => {
  const broken = { getItem() { throw new Error(); }, setItem() { throw new Error(); }, removeItem() { throw new Error(); } };
  assert.deepEqual(load(broken), DEFAULTS); assert.equal(save({ code: '05201', mode: 'picked' }, broken), false);
  assert.equal(isAvailable(broken), false); assert.equal(isAvailable(null), false); assert.equal(isAvailable(memory()), true);
});
