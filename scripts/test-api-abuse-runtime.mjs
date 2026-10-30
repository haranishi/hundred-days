// Cloudflare Pagesの配線を、外部APIへ取得せずに確認する。
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';

const FIXTURE_KEY = 'test-only-proxy-secret-with-at-least-32-characters';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await mkdir('.cache', { recursive: true });
const directory = await mkdtemp('.cache/api-abuse-runtime-');
const publicDir = join(directory, 'public');
await mkdir(publicDir);
await writeFile(join(publicDir, 'health.txt'), 'static-ok');
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = 'http://127.0.0.1:' + port;
const worker = spawn(process.env.API_GUARD_WRANGLER_BIN || 'wrangler', [
  'pages', 'dev', publicDir, '--ip', '127.0.0.1', '--port', String(port),
  '--compatibility-date', '2026-07-29', '--persist-to', join(directory, 'state'),
  '--binding', 'HUNDRED_DAYS_API_PROXY_SECRET=' + FIXTURE_KEY,
  '--binding', 'LINK_DOKUMI_RATE_LIMIT=1',
], { env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false',
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '', startupError;
const capture = chunk => { output = (output + chunk.toString()).slice(-65_536); };
worker.stdout.on('data', capture);
worker.stderr.on('data', capture);
worker.on('error', error => { startupError = error; });
let cases = 0;
const apiPath = '/api/day-030/windy?status=1';
function signed(client, path = apiPath) {
  const id = createHash('sha256').update('runtime-fixture-' + client).digest('hex');
  const stamp = String(Math.floor(Date.now() / 1000));
  const message = JSON.stringify(['hundred-days-api-v1', stamp, id, 'GET', path]);
  return { 'x-hundred-client': id, 'x-hundred-time': stamp,
    'x-hundred-signature': createHmac('sha256', FIXTURE_KEY).update(message).digest('hex') };
}
async function get(path, options) {
  return fetch(base + path, { ...options, signal: AbortSignal.timeout(10_000) });
}
async function expectStatus(path, status, options) {
  const result = await get(path, options);
  assert.equal(result.status, status, path + ': ' + await result.clone().text());
  await result.body?.cancel();
  cases++;
}
try {
  const deadline = Date.now() + 40_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (worker.exitCode !== null) throw new Error('Pages exited before startup');
    try {
      const result = await get('/health.txt');
      if (result.ok && await result.text() === 'static-ok') { ready = true; break; }
    } catch { /* Pagesの起動待ち */ }
    await sleep(200);
  }
  assert.ok(ready, 'Pages startup timed out');
  await expectStatus('/health.txt', 200);
  await expectStatus(apiPath, 405, { method: 'POST' });
  await expectStatus(apiPath, 403, { headers: { 'sec-fetch-site': 'cross-site' } });
  await expectStatus(apiPath, 403, { headers: { origin: 'https://untrusted.example' } });
  await expectStatus(apiPath, 200, { headers: signed('normal') });
  await expectStatus(apiPath, 200, { headers: { ...signed('proxy'), origin: 'https://rairakku.com', 'sec-fetch-site': 'same-origin' } });
  const invalid = signed('invalid');
  invalid['x-hundred-signature'] = '0'.repeat(64);
  await expectStatus(apiPath, 403, { headers: invalid });
  await expectStatus(apiPath + '&id=12', 403, { headers: signed('query') });
  // 固定窓の境界直前に試験を始めない。境界自体は単体で確認する。
  const left = 10_000 - Date.now() % 10_000;
  if (left < 2_000) await sleep(left + 25);
  const responses = await Promise.all(Array.from({ length: 25 }, () => get(apiPath, { headers: signed('burst') })));
  assert.equal(responses.filter(response => response.status === 200).length, 20);
  assert.equal(responses.filter(response => response.status === 429).length, 5);
  for (const response of responses) {
    if (response.status === 429) {
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.ok(Number(response.headers.get('retry-after')) >= 1);
    }
    await response.body?.cancel();
  }
  cases++;
  await expectStatus(apiPath, 200, { headers: signed('other-client') });
  for (const route of ['trace?url=http%3A%2F%2Flocalhost%2F', 'around?host=localhost&scheme=https']) {
    const path = '/api/day-074/' + route;
    await expectStatus(path, 200, { headers: signed(route + '-client1', path) });
    await expectStatus(path, 429, { headers: signed(route + '-client1', path) });
    await expectStatus(path, 200, { headers: signed(route + '-client2', path) });
  }
  for (let i = 0; i < 25; i++) await expectStatus('/health.txt', 200);
  console.log('Pages API Bot対策: ' + cases + '項目が成功。外部APIの取得なし。');
} catch (error) {
  await writeFile('.cache/api-abuse-runtime.log', output);
  console.error(error.message);
  console.error('Pagesの起動記録: .cache/api-abuse-runtime.log');
  process.exitCode = 1;
} finally {
  if (worker.exitCode === null && !startupError) {
    const exited = once(worker, 'exit');
    worker.kill('SIGTERM');
    await Promise.race([exited, sleep(4_000)]);
    if (worker.exitCode === null) { worker.kill('SIGKILL'); await exited; }
  }
  await rm(directory, { recursive: true, force: true });
}
