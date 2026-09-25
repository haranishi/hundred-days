import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, defaults, recordRun } from '../../lib/storage.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('保存と読み込み：ベスト・ミュート・選んだ猫・解放状況が残る', () => {
  const s = memory();
  const store = createStore(s);
  const p = { ...defaults(), best: 12, muted: true, fishTotal: 9, cat: 'kuro' };
  assert.equal(store.save(p), true);
  const back = store.load();
  assert.equal(back.best, 12);
  assert.equal(back.muted, true);
  assert.equal(back.cat, 'kuro');
  assert.deepEqual(back.unlocked, ['chatora', 'hachiware', 'kuro']);
});

test('localStorage が例外を投げても落ちずに既定値で遊べる', () => {
  const broken = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  const store = createStore(broken);
  assert.deepEqual(store.load(), defaults());
  assert.equal(store.save({ ...defaults(), best: 3 }), false);
});

test('localStorage が無い・中身が壊れている・型が違う', () => {
  assert.deepEqual(createStore(null).load(), defaults());
  assert.equal(createStore(undefined).save(defaults()), false);
  const s = memory();
  s.setItem('patanyan.v1', '{not json');
  assert.deepEqual(createStore(s).load(), defaults());
  s.setItem('patanyan.v1', JSON.stringify({ best: -5, muted: 'yes', cat: 'tiger', fishTotal: 'many', daily: { x: 3, 20260924: 7 } }));
  const p = createStore(s).load();
  assert.equal(p.best, 0);
  assert.equal(p.muted, false);
  assert.equal(p.cat, 'chatora');
  assert.equal(p.fishTotal, 0);
  assert.deepEqual(p.daily, { 20260924: 7 });
});

test('まだ解放されていない猫が保存されていたら茶トラに戻す', () => {
  const s = memory();
  s.setItem('patanyan.v1', JSON.stringify({ cat: 'mike', fishTotal: 10 }));
  assert.equal(createStore(s).load().cat, 'chatora');
});

test('結果の記録：モードごとのベスト・NEW・スタンプ・魚の合計', () => {
  let p = defaults();
  let r = recordRun(p, { mode: 'daily', dateKey: 20260924, score: 12, fish: 2 });
  assert.equal(r.isNewBest, true);
  assert.equal(r.best, 12);
  assert.deepEqual(r.reached, [10]);
  assert.deepEqual(r.firstStamps, [10]);
  p = r.profile;
  r = recordRun(p, { mode: 'daily', dateKey: 20260924, score: 8, fish: 1 });
  assert.equal(r.isNewBest, false);
  assert.equal(r.best, 12);
  assert.deepEqual(r.firstStamps, []);
  p = r.profile;
  assert.equal(p.fishTotal, 3);
  assert.deepEqual(p.unlocked, ['chatora', 'hachiware']);
  r = recordRun(p, { mode: 'any', dateKey: 20260924, score: 26, fish: 0 });
  assert.equal(r.isNewBest, true);
  assert.deepEqual(r.reached, [10, 25]);
  assert.deepEqual(r.firstStamps, [25]);
  assert.equal(r.profile.best, 26);
  assert.equal(r.profile.daily['20260924'], 12, 'いつでもモードはきょうのベストを変えない');
  const zero = recordRun(defaults(), { mode: 'any', dateKey: 20260924, score: 0, fish: 0 });
  assert.equal(zero.isNewBest, false, '0本はNEWにしない');
});

test('日ごとのベストは直近14日だけ持つ', () => {
  let p = defaults();
  for (let d = 1; d <= 20; d += 1) p = recordRun(p, { mode: 'daily', dateKey: 20261000 + d, score: d, fish: 0 }).profile;
  const keys = Object.keys(p.daily);
  assert.equal(keys.length, 14);
  assert.ok(!keys.includes('20261001'));
  assert.ok(keys.includes('20261020'));
});
