import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dayRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const prefix = '/day-070-flip-court/';

async function startPreview(t, root = dayRoot) {
  const child = spawn(process.execPath, [join(root, 'tools/serve.mjs')], {
    cwd: repoRoot,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  });
  let output = '';
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview did not report a loopback origin')), 5000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:([1-9]\d*)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Preview exited with code ${code} before reporting its origin: ${output}`));
    });
  });
  return (path, method = 'GET') => new Promise((resolve, reject) => {
    const req = request(origin, { path, method, headers: { Connection: 'close' } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

test('source preview exposes only public files from its own day directory', async (t) => {
  const get = await startPreview(t);

  await t.test('redirects the root and serves actual ES modules with safe headers', async () => {
    const redirect = await get('/');
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.location, prefix);
    const response = await get(`${prefix}lib/config.js?preview=1`);
    assert.equal(response.status, 200);
    assert.match(response.body, /export const WORLD\s*=/);
    assert.match(response.headers['content-type'], /^text\/javascript; charset=utf-8$/);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    const csp = response.headers['content-security-policy'];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /unsafe-eval|unsafe-inline|https?:|\*/);
    const head = await get(`${prefix}lib/config.js`, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-type'], response.headers['content-type']);
    assert.equal(Number(head.headers['content-length']), Buffer.byteLength(response.body));
  });

  await t.test('rejects tools, test files, metadata and secret paths', async () => {
    for (const path of [
      'tools/serve.mjs', 'tests/index.js', 'package.json', 'meta.json', 'README.md',
      '.env', '.env.local', '.precheck-ng.txt', '.git/config', 'lib/unknown.js',
    ]) {
      assert.equal((await get(`${prefix}${path}`)).status, 404, path);
    }
    assert.equal((await get('/lib/config.js')).status, 404);
    const deniedHead = await get(`${prefix}tools/serve.mjs`, 'HEAD');
    assert.equal(deniedHead.status, 404);
    assert.equal(deniedHead.body, '');
    const rejectedMethod = await get(`${prefix}lib/config.js`, 'POST');
    assert.equal(rejectedMethod.status, 405);
    assert.equal(rejectedMethod.headers.allow, 'GET, HEAD');
  });

  await t.test('rejects raw and encoded traversal without reading repository files', async () => {
    for (const path of [
      '../package.json', '%2e%2e/package.json', 'lib/../../package.json',
      '%2e%2e%2fpackage.json', 'lib%5c..%5cpackage.json', '/lib/config.js',
    ]) {
      assert.equal((await get(`${prefix}${path}`)).status, 404, path);
    }
    for (const path of ['%', '%00']) {
      assert.equal((await get(`${prefix}${path}`)).status, 400, path);
    }
  });
});

test('copied preview refuses symlinks to private files and missing public assets', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'flip-court-preview-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const root = join(fixture, 'bundle');
  await mkdir(join(root, 'tools'), { recursive: true });
  await mkdir(join(root, 'lib'));
  await copyFile(join(dayRoot, 'tools/serve.mjs'), join(root, 'tools/serve.mjs'));
  await copyFile(join(dayRoot, 'lib/config.js'), join(root, 'lib/config.js'));
  await writeFile(join(fixture, 'private.txt'), 'private preview canary');
  await symlink(join(fixture, 'private.txt'), join(root, 'lib/rules.js'));
  await writeFile(join(root, '.env'), 'private internal canary');
  await symlink(join(root, '.env'), join(root, 'og.png'));
  const get = await startPreview(t, root);
  assert.equal((await get(`${prefix}lib/config.js`)).status, 200);
  for (const path of ['lib/rules.js', 'og.png', 'index.html', '.env']) {
    assert.equal((await get(`${prefix}${path}`)).status, 404, path);
  }
});
