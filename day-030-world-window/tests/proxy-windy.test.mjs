import test from 'node:test';
import assert from 'node:assert/strict';
import {
  onRequestGet,
  parseBbox,
  safeHttpsUrl,
  snapBbox,
  trimDetail,
  trimList,
} from '../../functions/api/day-030/windy.js';
import { createUI } from '../lib/ui.js';

const ctx = (query, apiKey) => ({
  request: new Request(`https://x/api/day-030/windy${query}`),
  env: apiKey === undefined ? {} : { WINDY_API_KEY: apiKey },
});
const upstream = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('status は鍵の値を出さず、設定の真偽だけを no-store で返す', async () => {
  for (const [apiKey, configured] of [[undefined, false], ['secret', true]]) {
    const response = await onRequestGet(ctx('?status=1', apiKey));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { configured });
  }
});

test('鍵が無い通常リクエストは上流へ行かず503', async () => {
  let calls = 0;
  const response = await onRequestGet(ctx('?bbox=40,141,39,140&zoom=6'), {
    fetchImpl: async () => { calls += 1; },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'not_configured' });
  assert.equal(calls, 0);
});

test('bbox は数値・南北関係・座標範囲・zoomを検証する', async () => {
  const invalid = [
    '?bbox=x,141,39,140&zoom=6',
    '?bbox=39,141,39,140&zoom=6',
    '?bbox=91,141,39,140&zoom=6',
    '?bbox=40,181,39,140&zoom=6',
    '?bbox=40,141,39,140&zoom=4',
  ];
  let calls = 0;
  for (const query of invalid) {
    const response = await onRequestGet(ctx(query, 'key'), {
      fetchImpl: async () => { calls += 1; },
    });
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { error: 'invalid_bbox' });
  }
  assert.equal(calls, 0);
  assert.deepEqual(parseBbox('40,141,39,140', 6), {
    north: 40, east: 141, south: 39, west: 140, zoom: 6,
  });
});

test('zoom 6 は0.5度、zoom 9 は0.1度の格子へ外側に丸める', () => {
  assert.deepEqual(
    snapBbox({ north: 40.01, east: 141.01, south: 39.99, west: 140.99 }, 6),
    { north: 40.5, east: 141.5, south: 39.5, west: 140.5 },
  );
  assert.deepEqual(
    snapBbox({ north: 40.01, east: 141.01, south: 39.99, west: 140.99 }, 9),
    { north: 40.1, east: 141.1, south: 39.9, west: 140.9 },
  );
  assert.deepEqual(
    snapBbox({ north: 40.1, east: 141.1, south: 39.9, west: 140.9 }, 9),
    { north: 40.1, east: 141.1, south: 39.9, west: 140.9 },
  );
});

test('一覧は必要項目だけに切り詰め、欠損項目を null にする', () => {
  const result = trimList({
    total: 1,
    webcams: [{
      webcamId: 123,
      title: '駅前',
      status: 'active',
      viewCount: 999,
      lastUpdatedOn: 'discarded',
      location: { city: '秋田', country: 'Japan', latitude: 39.7, longitude: 140.1, region: 'Akita' },
      categories: [{ id: 'city', name: 'City' }],
      extra: 'discarded',
    }, {}],
  });
  assert.deepEqual(result.webcams[0], {
    id: 123, title: '駅前', lat: 39.7, lon: 140.1, status: 'active',
    city: '秋田', country: 'Japan', categories: ['city'],
  });
  assert.deepEqual(result.webcams[1], {
    id: null, title: null, lat: null, lon: null, status: null,
    city: null, country: null, categories: null,
  });
  assert.deepEqual(Object.keys(result).sort(), ['attribution', 'total', 'webcams']);
});

test('単体は current.preview を image にし、必要項目だけに切り詰める', () => {
  const result = trimDetail({
    webcamId: 123,
    title: '駅前',
    images: { current: { preview: 'https://img/current.jpg', thumbnail: 'discarded' }, daylight: {} },
    player: { day: 'https://player/day', month: null },
    location: { latitude: 39.7, longitude: 140.1 },
    urls: { detail: 'https://www.windy.com/webcams/123', edit: 'discarded' },
    categories: [{ id: 'city', name: 'City' }],
  });
  assert.equal(result.image, 'https://img/current.jpg');
  assert.equal(result.imageDaylight, null);
  assert.deepEqual(result.player, { day: 'https://player/day', month: null, year: null, lifetime: null });
  assert.deepEqual(result.categories, ['city']);
  assert.equal('images' in result, false);
  assert.equal('urls' in result, false);
});

test('429 は Retry-After 付きで返し、上流を再試行しない', async () => {
  let calls = 0;
  const response = await onRequestGet(ctx('?bbox=40,141,39,140&zoom=6', 'key'), {
    fetchImpl: async () => { calls += 1; return upstream({ private: 'body' }, 429); },
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '30');
  assert.deepEqual(await response.json(), { error: 'rate_limited' });
  assert.equal(calls, 1);
});

test('上流401は本文を隠して502にする', async () => {
  const response = await onRequestGet(ctx('?id=123', 'key'), {
    fetchImpl: async () => upstream({ error: 'bad key', key: 'secret' }, 401),
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'upstream_unavailable' });
});

test('一覧の上流URLとキャッシュキーには丸めたbboxを使う', async (t) => {
  const originalCaches = globalThis.caches;
  let cacheKey;
  let target;
  globalThis.caches = {
    default: {
      match: async (request) => { cacheKey = request.url; return undefined; },
      put: async () => {},
    },
  };
  t.after(() => {
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  });

  const response = await onRequestGet(ctx('?bbox=40.01,141.01,39.99,140.99&zoom=6', 'key'), {
    fetchImpl: async (url) => { target = url; return upstream({ total: 0, webcams: [] }); },
  });
  assert.equal(response.status, 200);
  assert.match(cacheKey, /bbox=40\.5,141\.5,39\.5,140\.5/);
  assert.match(target, /bbox=40\.5,141\.5,39\.5,140\.5/);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300, s-maxage=600');
});

test('Cache API が無いNode環境でも一覧を取得できる', async () => {
  const response = await onRequestGet(ctx('?bbox=40,141,39,140&zoom=9', 'key'), {
    fetchImpl: async () => upstream({ total: 0, webcams: [] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    webcams: [], total: 0, attribution: 'Webcams provided by windy.com',
  });
});

test('trimDetail と safeHttpsUrl: https 以外の画像・プレーヤー・詳細URLを null にする', () => {
  assert.equal(safeHttpsUrl('https://images-webcams.windy.com/a.jpg'), 'https://images-webcams.windy.com/a.jpg');
  for (const bad of ['http://images-webcams.windy.com/a.jpg', 'javascript:alert(1)', 'data:text/html,x', '', null]) {
    assert.equal(safeHttpsUrl(bad), null, String(bad));
  }
  const detail = trimDetail({
    webcamId: 123,
    title: 'Test Cam',
    images: {
      current: { preview: 'javascript:alert(1)' },
      daylight: { preview: 'http://example.com/day.jpg' },
    },
    player: {
      day: 'https://webcams.windy.com/player/day',
      month: 'javascript:alert(2)',
      year: 'http://webcams.windy.com/player/year',
      lifetime: 'data:text/html,<b>x</b>',
    },
    urls: { detail: 'javascript:alert(3)' },
  });
  assert.equal(detail.image, null);
  assert.equal(detail.imageDaylight, null);
  assert.equal(detail.player.day, 'https://webcams.windy.com/player/day');
  assert.equal(detail.player.month, null);
  assert.equal(detail.player.year, null);
  assert.equal(detail.player.lifetime, null);
  assert.equal(detail.detailUrl, null);
});

test('ui.js: renderWindy と renderDetail は https 以外の src/href をDOMに書かない', (t) => {
  const makeNode = (tagName = 'div') => {
    const attrs = {};
    const node = {
      tagName: tagName.toUpperCase(),
      className: '',
      textContent: '',
      children: [],
      dataset: {},
      style: { setProperty() {} },
      classList: {
        _set: new Set(),
        toggle(k, v) { if (v === undefined ? !this._set.has(k) : v) this._set.add(k); else this._set.delete(k); },
        contains(k) { return this._set.has(k); },
        add(k) { this._set.add(k); },
        remove(k) { this._set.delete(k); },
      },
      append(...items) { this.children.push(...items.map((x) => (typeof x === 'string' ? { tagName: '#TEXT', textContent: x, children: [] } : x))); },
      replaceChildren(...items) { this.children = []; this.append(...items); },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] ?? null; },
      removeAttribute(k) { delete attrs[k]; },
      addEventListener() {},
      getBoundingClientRect() { return { bottom: 0 }; },
      focus() {},
      canPlayType() { return ''; },
    };
    return node;
  };
  const walk = (root, out = []) => {
    out.push(root);
    for (const child of root.children || []) walk(child, out);
    return out;
  };

  const origDoc = globalThis.document;
  const origAdd = globalThis.addEventListener;
  const origHtmlEl = globalThis.HTMLElement;
  const nodes = new Map();
  const bodyRoot = makeNode('div');
  nodes.set('#panel-body', bodyRoot);
  globalThis.HTMLElement = class {};
  globalThis.document = {
    documentElement: makeNode('html'),
    body: makeNode('body'),
    visibilityState: 'hidden',
    querySelector(sel) {
      if (!nodes.has(sel)) nodes.set(sel, makeNode());
      return nodes.get(sel);
    },
    querySelectorAll() { return []; },
    createElement(tag) { return makeNode(tag); },
    createElementNS(_ns, tag) { return makeNode(tag); },
    createDocumentFragment() { return makeNode('#FRAGMENT'); },
    addEventListener() {},
  };
  globalThis.addEventListener = () => {};
  t.after(() => {
    globalThis.document = origDoc;
    globalThis.addEventListener = origAdd;
    if (origHtmlEl === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = origHtmlEl;
  });

  const ui = createUI({ toggleKind() {}, toggleWindy() {}, search() {}, random() {}, locate() {}, close() {}, theme() {} });
  try {
    ui.renderWindy(
      { id: 'w1', lat: 35, lon: 139, country: 'JP', kind: 'windy', name: 'Unsafe Cam' },
      {
        title: 'Unsafe Cam',
        image: 'javascript:alert(1)',
        player: { day: 'http://evil.example/embed' },
        detailUrl: 'javascript:alert(2)',
      }
    );
    let all = walk(bodyRoot);
    assert.equal(all.filter((n) => n.tagName === 'IMG').length, 0);
    assert.equal(all.filter((n) => n.tagName === 'IFRAME').length, 0);
    assert.ok(all.filter((n) => n.tagName === 'A').every((a) => typeof a.href === 'string' && a.href.startsWith('https://')));

    ui.renderDetail(
      { id: 'n1', lat: 35, lon: 139, country: 'JP', kind: 'img', url: 'http://insecure.example/cam.jpg', website: 'javascript:alert(1)', name: 'Insecure Cam' },
      { JP: { ja: '日本', continent: 'AS' } },
      null
    );
    all = walk(bodyRoot);
    assert.equal(all.filter((n) => n.tagName === 'IMG').length, 0);
    assert.ok(all.filter((n) => n.tagName === 'A').every((a) => typeof a.href === 'string' && a.href.startsWith('https://')));

    ui.renderDetail(
      { id: 'n2', lat: 35, lon: 139, country: 'JP', kind: 'img', url: 'https://cam.example.com/live.jpg', website: 'https://cam.example.com/', name: 'Safe Cam' },
      { JP: { ja: '日本', continent: 'AS' } },
      null
    );
    all = walk(bodyRoot);
    const imgs = all.filter((n) => n.tagName === 'IMG');
    assert.equal(imgs.length, 1);
    assert.match(imgs[0].src, /^https:\/\/cam\.example\.com\/live\.jpg\?_=/);
  } finally {
    ui.closeDetail();
  }
});
