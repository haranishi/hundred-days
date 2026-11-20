import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GFX_IDS } from '../../lib/contract.js';
import { GFX_TIERS } from '../../lib/gfx.js';
import { createGfxGovernor } from '../../lib/gfx-governor.js';
import { clearLearnedGfx, LEARNED_GFX_KEY, readLearnedGfx, resolveGfx, writeLearnedGfx } from '../../lib/gfx-select.js';

test('画質表に全段の描画設定が揃う', () => {
  assert.deepEqual(Object.keys(GFX_TIERS), GFX_IDS);
  const fields = ['dpr', 'shadowSize', 'stageSize', 'barkSize', 'padCards', 'anisotropy', 'antialias'];
  assert.deepEqual(Object.values(GFX_TIERS).map((tier) => fields.map((key) => tier[key])), [
    [2, 2048, 1024, 256, 120, 8, true],
    [1.75, 1024, 512, 256, 84, 4, true],
    [1.25, 1024, 256, 160, 60, 2, false],
    [1, 0, 128, 64, 6, 1, false],
  ]);
  for (const field of ['potSegments', 'soilRadial', 'soilRings', 'mossX', 'mossZ', 'wallX', 'wallY']) {
    assert.ok(GFX_TIERS.low[field] < GFX_TIERS.mid[field] && GFX_TIERS.mid[field] < GFX_TIERS.high[field], field);
  }
});

const phone = { coarse: true, minSide: 390, memory: 4, cores: 8, saveData: false };

test('URL、設定、自動判定、覚えた段の優先順位と端末の境界値', () => {
  for (const [input, expected] of [
    ...GFX_IDS.map((param) => [{ param, setting: 'mid', env: { saveData: true }, learned: 'low' }, param]),
    ...['high', 'mid', 'low'].map((setting) => [{ param: 'invalid', setting, learned: 'low', env: phone }, setting]),
    [{ env: phone }, 'mid'],
    [{ env: { ...phone, minSide: 699 } }, 'mid'],
    [{ env: { ...phone, minSide: 700 } }, 'high'],
    [{ env: { ...phone, coarse: false, cores: 4 } }, 'high'],
    [{ env: { ...phone, cores: 4 } }, 'low'],
    [{ env: { ...phone, cores: 5 } }, 'mid'],
    [{ env: { memory: 3 } }, 'low'],
    [{ env: { memory: 4 } }, 'high'],
    [{ env: { saveData: true } }, 'low'],
    [{ env: { coarse: true, minSide: 390 } }, 'mid'],
    [{ env: {} }, 'high'],
    [{ env: phone, setting: 'auto', learned: 'high' }, 'mid'],
    [{ env: phone, learned: 'low' }, 'low'],
    [{ env: {}, learned: 'mid' }, 'mid'],
    [{ env: { saveData: true }, learned: 'mid' }, 'low'],
    [{ setting: 'test', learned: 'test' }, 'high'],
  ]) {
    assert.equal(resolveGfx(input), expected, JSON.stringify(input));
  }
});

test('覚えた画質は30日で失効し、壊れた値や保存例外を無視する', () => {
  let raw = null;
  const storage = () => ({
    getItem(key) { assert.equal(key, LEARNED_GFX_KEY); return raw; },
    setItem(key, value) { assert.equal(key, LEARNED_GFX_KEY); raw = value; },
    removeItem(key) { assert.equal(key, LEARNED_GFX_KEY); raw = null; },
  });
  const day = 24 * 60 * 60 * 1000;
  assert.equal(readLearnedGfx({ storage, now: day }), null);
  assert.equal(writeLearnedGfx('mid', { storage, now: day }), true);
  assert.deepEqual(JSON.parse(raw), { tier: 'mid', at: day });
  assert.equal(readLearnedGfx({ storage, now: 31 * day - 1 }), 'mid');
  assert.equal(readLearnedGfx({ storage, now: 31 * day }), null);
  assert.equal(readLearnedGfx({ storage, now: 0 }), null);
  assert.equal(clearLearnedGfx({ storage }), true);
  assert.equal(readLearnedGfx({ storage, now: day }), null);
  for (const invalid of ['{', '{"tier":"test","at":1}', '{"tier":"low","at":"1"}']) {
    raw = invalid;
    assert.equal(readLearnedGfx({ storage, now: day }), null);
  }
  assert.equal(writeLearnedGfx('test', { storage, now: day }), false);
  const denied = () => { throw new Error('SecurityError'); };
  assert.equal(readLearnedGfx({ storage: denied, now: day }), null);
  assert.equal(writeLearnedGfx('low', { storage: denied, now: day }), false);
  assert.equal(clearLearnedGfx({ storage: denied }), false);
});

test('遅いフレームが続いたときだけ一段ずつ下げ、3秒の間隔と最低画質を守る', () => {
  const { push } = createGfxGovernor({ tier: 'high' });
  for (let i = 0; i < 59; i += 1) assert.equal(push(50, i * 50), null);
  assert.deepEqual(push(50, 3000), { from: 'high', to: 'mid' });
  for (let i = 0; i < 90; i += 1) assert.equal(push(45, 3050 + i * 30), null);
  assert.deepEqual(push(50, 6000), { from: 'mid', to: 'low' });
  for (let i = 0; i < 90; i += 1) assert.equal(push(90, 6000 + i * 90), null);
});

test('降格が保留されたときは実際に画質を変えた時刻から3秒待つ', () => {
  const { push, resetFrames } = createGfxGovernor({ tier: 'high', windowSize: 1, warmup: 0 });
  assert.deepEqual(push(50, 1000), { from: 'high', to: 'mid' });
  resetFrames({ changedAt: 5000 });
  assert.equal(push(50, 7999), null);
  assert.deepEqual(push(50, 8000), { from: 'mid', to: 'low' });
});

test('速い描画、30fps固定、少数の詰まり、試験用の段では画質を下げない', () => {
  for (const [tier, interval] of [['high', 16.7], ['mid', 1000 / 30], ['test', 80], ['low', 80]]) {
    const { push } = createGfxGovernor({ tier });
    for (let i = 0; i < 100; i += 1) assert.equal(push(interval, i * interval), null);
  }
  const { push } = createGfxGovernor({ tier: 'high', windowSize: 5, warmup: 0 });
  for (const interval of [20, 150, 20, 150, 20]) assert.equal(push(interval, 1000), null);
});

test('250ms超と無効な間隔はウォームアップ中も窓にも入れない', () => {
  const { push } = createGfxGovernor({ tier: 'mid', windowSize: 3, warmup: 2 });
  for (const interval of [251, 90, 300, 90, NaN, 250, 250, 260, -1, 0]) {
    assert.equal(push(interval, 1000), null);
  }
  assert.deepEqual(push(250, 1000), { from: 'mid', to: 'low' });
});

test('250ms超は6回目から窓に入り、250ms以下や計測の再開で連続回数を数え直す', () => {
  const { push, resetFrames } = createGfxGovernor({ tier: 'mid', windowSize: 2, warmup: 0 });
  for (const restart of [() => assert.equal(push(250, 2000), null), resetFrames]) {
    for (let i = 0; i < 5; i += 1) assert.equal(push(500, 2000), null);
    restart();
  }
  for (let i = 0; i < 6; i += 1) assert.equal(push(500, 2000), null);
  assert.deepEqual(push(500, 2000), { from: 'mid', to: 'low' });
});
