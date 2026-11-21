import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_TIERS, GFX_TIERS } from '../../lib/gfx.js';
import { createGfxGovernor } from '../../lib/gfx-governor.js';
import { deviceInfo, readLearnedGfx, resolveGfx, STORAGE_NAME, writeLearnedGfx } from '../../lib/gfx-select.js';

test('3段の画素比・テクスチャ・影・魚形状の予算が設計表どおりになる', () => {
  assert.deepEqual(AUTO_TIERS, ['high', 'standard', 'light']);
  const values = (name) => AUTO_TIERS.map((q) => GFX_TIERS[q][name]);
  assert.deepEqual(values('quality'), AUTO_TIERS);
  assert.deepEqual(values('dpr'), [2, 1.5, 1]);
  assert.deepEqual(values('maxTextureSize'), [1024, 512, 512]);
  assert.deepEqual(values('maxTriangles'), [90000, 45000, 20000]);
  const [h, s, l] = values('shadowSize');
  assert.ok(h > s && s > 0 && l === 0);
});

test('画面・CPU・メモリ・UAを使い、起動の実測と過去の降格を反映する', () => {
  const desktop = deviceInfo({ navigator: { hardwareConcurrency: 12, deviceMemory: 8, userAgent: 'Desktop' },
    screen: { width: 1920, height: 1080 } });
  assert.equal(resolveGfx({ env: desktop }), 'high');
  const phone = { ...desktop, userAgent: 'iPhone Mobile', minSide: 390 };
  assert.equal(resolveGfx({ env: phone }), 'standard');
  assert.equal(resolveGfx({ env: { ...phone, hardwareConcurrency: 4 } }), 'light');
  assert.equal(resolveGfx({ env: { ...desktop, deviceMemory: 2 } }), 'light');
  assert.equal(resolveGfx({ env: { ...desktop, saveData: true } }), 'light');
  assert.equal(resolveGfx({ env: { ...desktop, minSide: 600, userAgent: 'Macintosh', touchPoints: 5 } }), 'standard');
  assert.equal(resolveGfx({ env: {} }), 'standard');
  assert.equal(resolveGfx({ env: phone, learned: 'high' }), 'standard');
  assert.equal(resolveGfx({ env: desktop, learned: 'light' }), 'light');
  assert.equal(resolveGfx({ env: desktop, startupFps: 22 }), 'standard');
  assert.equal(resolveGfx({ env: desktop, startupFps: 26 }), 'high');
  assert.equal(resolveGfx({ setting: 'high', env: phone, learned: 'light', startupFps: 15 }), 'high');
});

function meter(options = {}) {
  const g = createGfxGovernor({ tier: 'high', warmup: 2, startupSize: 5, windowSize: 7, cooldownMs: 300, ...options });
  let now = 0;
  const changes = [];
  return { g, changes, feed(count, ms) {
    for (let i = 0; i < count; i++) {
      now += ms;
      const change = g.push(ms, now);
      if (change) changes.push(change);
    }
  } };
}

test('起動の実測と継続する低速で1段ずつ下げ、切替直後に再降格しない', () => {
  const { g, feed, changes } = meter();
  feed(6, 50); assert.equal(changes.length, 0);
  feed(1, 50);
  assert.deepEqual(changes, [{ from: 'high', to: 'standard', reason: 'startup', fps: 20 }]);
  assert.equal(g.startupFps, 20);
  feed(5, 50); assert.equal(changes.length, 1);
  feed(12, 50);
  assert.deepEqual(changes[1], { from: 'standard', to: 'light', reason: 'sustained', fps: 20 });
  feed(80, 100); assert.equal(changes.length, 2);
});

test('30fps・境界の26fps・単発の停止で降格せず、非表示前のサンプルを持ち越さない', () => {
  const { g, feed, changes } = meter();
  feed(10, 1000 / 30);
  assert.ok(Math.abs(g.startupFps - 30) < 1e-10);
  feed(35, 1000 / 26); feed(1, 8000); feed(18, 1000 / 30);
  assert.deepEqual(changes, []);
  feed(3, 50); g.resetFrames(); feed(3, 50); feed(12, 16);
  assert.deepEqual(changes, []);
  assert.equal(g.push(NaN, 0), null); assert.equal(g.push(-4, 2), null);
  feed(40, 400); assert.equal(changes.length, 2);
});

test('降格の記録が30日で切れ、未来・破損・保存拒否・別タブの値を扱える', () => {
  const now = 50 * 86400000, data = new Map();
  const storage = () => ({ getItem: (name) => data.get(name) ?? null, setItem: (name, v) => data.set(name, v) });
  const opts = { storage, now };
  assert.equal(readLearnedGfx(opts), null);
  assert.equal(writeLearnedGfx('standard', opts), true);
  assert.ok(data.has(STORAGE_NAME)); assert.equal(readLearnedGfx(opts), 'standard');
  assert.equal(readLearnedGfx({ storage, now: now + 30 * 86400000 - 1 }), 'standard');
  assert.equal(readLearnedGfx({ storage, now: now + 30 * 86400000 }), null);
  assert.equal(readLearnedGfx({ storage, now: now - 1 }), null);
  writeLearnedGfx('light', opts);
  writeLearnedGfx('standard', { storage, now: now + 300 });
  assert.equal(readLearnedGfx(opts), 'light');
  for (const raw of ['{', 'null', '[]', '"'.repeat(700), '{"tier":"fast","at":20}', '{"tier":"light","at":-1}']) {
    data.set(STORAGE_NAME, raw); assert.equal(readLearnedGfx(opts), null);
  }
  const denied = { storage() { throw new Error('保存が無効です。'); }, now };
  assert.equal(readLearnedGfx(denied), null);
  assert.equal(writeLearnedGfx('light', denied), false);
  assert.equal(writeLearnedGfx('auto', opts), false);
});
