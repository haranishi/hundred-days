import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, MAX_BYTES } from '../../../functions/api/day-035/image.js';

const request = (src) => ({ request: { url: `https://host/api/day-035/image?src=${encodeURIComponent(src)}` }, waitUntil: () => {} });
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('画像なら中身をそのまま返す', async () => {
  const response = await onRequestGet(request('https://example.com/a.png'), {
    fetchImpl: async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
});

test('同一オリジンで返すのでキャッシュを効かせる', async () => {
  const response = await onRequestGet(request('https://example.com/a.png'), {
    fetchImpl: async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })
  });
  assert.match(response.headers.get('cache-control'), /max-age=86400/);
});

test('画像でなければ415', async () => {
  const response = await onRequestGet(request('https://example.com/a.html'), {
    fetchImpl: async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })
  });
  assert.equal(response.status, 415);
  assert.equal((await response.json()).error, 'not_image');
});

test('大きすぎる画像は413', async () => {
  const response = await onRequestGet(request('https://example.com/big.png'), {
    fetchImpl: async () => new Response(png, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(MAX_BYTES + 1) }
    })
  });
  assert.equal(response.status, 413);
});

test('危ないURLは400', async () => {
  for (const src of ['http://127.0.0.1/a.png', 'file:///etc/passwd']) {
    const response = await onRequestGet(request(src), { fetchImpl: async () => new Response(png) });
    assert.equal(response.status, 400, src);
  }
});

test('上流が落ちていたら502', async () => {
  const response = await onRequestGet(request('https://example.com/a.png'), {
    fetchImpl: async () => new Response('no', { status: 404 })
  });
  assert.equal(response.status, 502);
});

test('内部へ飛ばすリダイレクトは追わない', async () => {
  const response = await onRequestGet(request('https://example.com/a.png'), {
    fetchImpl: async () => new Response(null, { status: 301, headers: { location: 'http://localhost:8080/a.png' } })
  });
  assert.equal(response.status, 502);
});
