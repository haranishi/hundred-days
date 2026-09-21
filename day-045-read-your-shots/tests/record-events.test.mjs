import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from '../app.js';
import { createGame, step } from '../lib/game.js';
import { mulberry32 } from '../lib/rng.js';

test('検証窓口はplayingの実イベントだけを記録し、停止・コピー・再記録が動く', async () => {
  const keys = ['document', 'window', 'matchMedia', 'location', 'localStorage', 'devicePixelRatio', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch'];
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const noop = () => {};
  // 描画は測らないが、文字幅だけは実物と同じ形（{ width }）で返す必要がある。
  const ctx = new Proxy({ measureText: text => ({ width: [...String(text)].length * 9 }) }, { get: (target, key) => target[key] ?? noop, set: (target, key, value) => { target[key] = value; return true; } });
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { dataset: {}, hidden: false, getContext: () => ctx, getBoundingClientRect: () => ({ width: 480 }), focus: noop, scrollIntoView: noop, setAttribute: noop, addEventListener: noop });
    return elements.get(id);
  };
  try {
    Object.assign(globalThis, {
      document: { getElementById: element, querySelector: element, addEventListener: noop }, window: { addEventListener: noop },
      matchMedia: () => ({ matches: false }), location: { search: '?seed=20260921', hash: '' },
      localStorage: { getItem: () => null, setItem: noop }, devicePixelRatio: 1,
      requestAnimationFrame: () => 1, cancelAnimationFrame: noop, fetch: async () => ({ ok: false }),
    });
    boot(); await new Promise(resolve => setImmediate(resolve));
    const api = window.__day045;
    api.setManual(true); api.recordEvents(true); api.advance(1000);
    assert.equal(api.seconds(), 0); assert.deepEqual(api.events(), []);
    api.start(); api.input({ fire: true }); api.advance(2000);
    let s = createGame('playing'); const rng = mulberry32(20260921), expected = [];
    for (let i = 0; i < 120; i++) { s = step(s, 1 / 60, { fire: true }, rng); expected.push(...s.events.map(name => ({ t: s.time, name }))); }
    assert.deepEqual(api.events(), expected); assert.equal(api.seconds(), s.time);
    const copy = api.events(); copy[0].name = 'changed'; copy.push({ t: 0, name: 'changed' });
    assert.deepEqual(api.events(), expected);
    element('pause').onclick(); api.advance(1000);
    assert.deepEqual(api.events(), expected); assert.equal(api.seconds(), s.time);
    element('pause').onclick(); api.recordEvents(false); api.advance(1000);
    assert.deepEqual(api.events(), expected);
    api.recordEvents(true); assert.deepEqual(api.events(), []);
    api.advance(180000); assert.equal(api.state(), 'over');
    assert.equal(element('final-level').textContent, api.snapshot().level);
    const shared = new URL(element('result-x').href).searchParams.get('text');
    assert.ok(shared.includes(`LV${api.snapshot().level}まで到達`));
    assert.ok(shared.includes(element('review').textContent));
    assert.ok([...shared].length * 2 + 24 <= 280);
    const endEvents = api.events(), endTime = api.seconds(); api.advance(1000);
    assert.deepEqual(api.events(), endEvents); assert.equal(api.seconds(), endTime);
  } finally {
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
