import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { createMountedServer, optionsFromArgs } from '../serve-mounted.mjs';

// Exercise the HTTP request handler without opening a socket (sandbox compatible).
function request(server, url, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const response = new Writable({ write(chunk, encoding, done) { chunks.push(chunk); done(); } });
    response.writeHead = (status, headers = {}) => { response.status = status; response.headers = headers; };
    response.on('error', reject);
    response.on('finish', () => resolve({ status: response.status, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    server.emit('request', { url, headers, method }, response);
  });
}
for (const prefix of ['', '/100days']) test(`mounted handler: ${prefix || '/'} redirects, 404, range, API`, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'serve-mounted-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'day-001-x'));
  for (const [path, text] of Object.entries({ 'index.html': 'home', 'privacy.html': 'privacy', '404.html': 'missing', 'day-001-x/index.html': 'day', 'clip.mp4': '0123456789' })) writeFileSync(join(dir, path), text);
  const server = createMountedServer({ distDir: dir, prefix });
  assert.equal((await request(server, prefix + '/')).body, 'home');
  const redirect = await request(server, prefix + '/day-001-x?q=1');
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.Location, prefix + '/day-001-x/?q=1');
  assert.equal((await request(server, prefix + '/day-001-x/')).body, 'day');
  assert.equal((await request(server, prefix + '/privacy')).body, 'privacy');
  assert.equal((await request(server, prefix + '/privacy.html')).headers.Location, prefix + '/privacy');
  assert.equal((await request(server, prefix + '/day-001-x/index.html')).headers.Location, prefix + '/day-001-x/');
  const missing = await request(server, prefix + '/no-such-page');
  assert.equal(missing.status, 404);
  assert.equal(missing.body, 'missing');
  const range = await request(server, prefix + '/clip.mp4', { range: 'bytes=2-4' });
  assert.equal(range.status, 206);
  assert.equal(range.headers['Content-Range'], 'bytes 2-4/10');
  assert.equal(range.body, '234');
  assert.equal((await request(server, prefix + '/clip.mp4', { range: 'bytes=-3' })).body, '789');
  assert.equal((await request(server, prefix + '/clip.mp4', { range: 'bytes=10-' })).status, 416);
  assert.equal((await request(server, prefix + '/clip.mp4', {}, 'HEAD')).body, '');
  assert.equal((await request(server, '/api/day-023/x')).body, '{"stub":true}');
  if (prefix) {
    assert.equal((await request(server, prefix + '/api/day-023/x')).status, 404);
    assert.equal((await request(server, '/100days-other/')).status, 404);
  }
  assert.equal((await request(server, prefix + '/%2e%2e%2fpackage.json')).status, 404);
});
test('CLI prefix and port options', () => {
  assert.deepEqual(optionsFromArgs([]), { prefix: '/100days', port: 4890 });
  assert.deepEqual(optionsFromArgs(['--prefix', '', '--port', '0']), { prefix: '', port: 0 });
});
