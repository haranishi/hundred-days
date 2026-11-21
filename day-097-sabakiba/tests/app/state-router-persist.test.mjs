// 経路（lib/router.js）と保存（lib/persist.js）の単体試験。
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRoute, parseQueryParams, parseRoute, resolveInitialLocation } from '../../lib/router.js';
import {
  STORAGE_NAME, defaultPersisted, loadPersisted, parsePersisted, savePersisted, serializePersisted,
} from '../../lib/persist.js';
import { createInitialState } from '../../lib/app-state.js';

test('router: すべての正規経路を解析し、往復（parse → format）が一致する', () => {
  const cases = [
    ['#/', { name: 'home', valid: true }],
    ['#/safety', { name: 'safety', valid: true }],
    ['#/fish/aji', { name: 'intro', species: 'aji', valid: true }],
    ['#/fish/aji/1', { name: 'guide', species: 'aji', step: 0, valid: true }],
    ['#/fish/hirame/4', { name: 'guide', species: 'hirame', step: 3, valid: true }],
    ['#/done/saba', { name: 'done', species: 'saba', valid: true }],
    ['#/parts/tai', { name: 'parts', species: 'tai', valid: true }],
  ];
  for (const [hash, expected] of cases) {
    const parsed = parseRoute(hash);
    assert.deepEqual(parsed, expected, hash);
    assert.equal(formatRoute(parsed), hash, `formatRoute(${hash})`);
  }
  assert.deepEqual(parseRoute(''), { name: 'home', valid: true });
  assert.deepEqual(parseRoute('#'), { name: 'home', valid: true });
});

test('router: 壊れた経路は valid:false で入口（home）へ戻す', () => {
  const broken = [
    '#/unknown',
    '#/fish/unicorn',
    '#/fish/aji/0',
    '#/fish/aji/-1',
    '#/fish/aji/abc',
    '#/fish/aji/2/extra',
    '#/done/dragon',
    '#/parts/nope',
    '#noslash',
  ];
  for (const h of broken) {
    const res = parseRoute(h);
    assert.equal(res.name, 'home', h);
    assert.equal(res.valid, false, h);
  }
});

test('router: ハッシュ末尾のクエリ（#/fish/aji/2?debug=1）と search クエリ（?gl=off#/fish/aji/2）の両方を正しく解釈する', () => {
  const a = resolveInitialLocation('', '#/fish/aji/2?debug=1&hand=L&t=0.4');
  assert.deepEqual(a.route, { name: 'guide', species: 'aji', step: 1, valid: true });
  assert.equal(a.params.debug, true);
  assert.equal(a.params.hand, 'L');
  assert.equal(a.params.t, 0.4);

  const b = resolveInitialLocation('?gl=off&gfx=light', '#/fish/aji/2');
  assert.deepEqual(b.route, { name: 'guide', species: 'aji', step: 1, valid: true });
  assert.equal(b.params.gl, 'off');
  assert.equal(b.params.gfx, 'light');

  // ハッシュが空で ?sp=aji&step=3 のときガイドを開く
  const c = resolveInitialLocation('?sp=aji&step=3&debug=1', '');
  assert.deepEqual(c.route, { name: 'guide', species: 'aji', step: 3, valid: true });
  assert.equal(c.params.debug, true);

  // 範囲外の t や不正な gfx は丸め・無視される
  const d = parseQueryParams('?t=2.5&gfx=ultra&sp=unicorn&hand=X', '');
  assert.equal(d.t, 1);
  assert.equal(d.gfx, null);
  assert.equal(d.sp, null);
  assert.equal(d.hand, null);
});

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    has: (k) => map.has(k),
  };
}

test('persist: 名前は sabakiba.v1 で、保存と読み戻しが往復一致する', () => {
  assert.equal(STORAGE_NAME, 'sabakiba.v1');
  const storage = memoryStorage();
  const state = createInitialState({
    species: 'tai',
    leftHanded: true,
    quality: 'light',
    speed: 0.5,
    loop: false,
    view: 'top',
    labels: true,
    speech: true,
    wake: false,
    progress: { aji: 3, tai: 1 },
    best: { aji: { head: 88, fillet: 91 } },
  });
  assert.equal(savePersisted(state, storage), true);
  const loaded = loadPersisted(storage);
  assert.equal(loaded.species, 'tai');
  assert.equal(loaded.leftHanded, true);
  assert.equal(loaded.quality, 'light');
  assert.equal(loaded.speed, 0.5);
  assert.equal(loaded.loop, false);
  assert.equal(loaded.view, 'top');
  assert.equal(loaded.labels, true);
  assert.equal(loaded.speech, true);
  assert.equal(loaded.wake, false);
  assert.deepEqual(loaded.progress, { aji: 3, tai: 1 });
  assert.deepEqual(loaded.best, { aji: { head: 88, fillet: 91 } });
});

test('persist: 壊れたJSON・旧版・未知のキー・不正な値で落ちず、壊れた保存を捨てて既定へ戻す', () => {
  // 壊れたJSON
  const broken = memoryStorage({ [STORAGE_NAME]: '{broken json' });
  const loadedBroken = loadPersisted(broken);
  assert.deepEqual(loadedBroken, defaultPersisted());
  assert.equal(broken.has(STORAGE_NAME), false, '壊れた保存は削除される');

  // 旧版（v: 0）
  const old = memoryStorage({ [STORAGE_NAME]: JSON.stringify({ v: 0, leftHanded: true }) });
  const loadedOld = loadPersisted(old);
  assert.deepEqual(loadedOld, defaultPersisted());
  assert.equal(old.has(STORAGE_NAME), false, '旧版は破棄して既定に戻す');

  // 未知のキーと一部不正な値（v: 1 は維持しつつ安全な値だけ取り出す）
  const partial = parsePersisted(JSON.stringify({
    v: 1,
    unknownExtraField: 'evil',
    leftHanded: true,
    quality: 'broken',
    speed: 3,
    progress: { aji: 2, ghost: 5, saba: -1 },
    best: { aji: { head: 82, bad: 999, 'BAD_ID': 50 } },
  }));
  assert.equal(partial.ok, true);
  assert.equal(partial.data.leftHanded, true);
  assert.equal(partial.data.quality, 'auto');
  assert.equal(partial.data.speed, 1);
  assert.deepEqual(partial.data.progress, { aji: 2 });
  assert.deepEqual(partial.data.best, { aji: { head: 82 } });
  assert.equal('unknownExtraField' in partial.data, false);

  // ストレージが例外を投げる環境でも落ちない
  const failing = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.deepEqual(loadPersisted(failing), defaultPersisted());
  assert.equal(savePersisted(createInitialState(), failing), false);
  assert.equal(typeof serializePersisted(null), 'string');
});
