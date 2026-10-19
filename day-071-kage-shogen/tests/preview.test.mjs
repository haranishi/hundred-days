import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dayRoot = fileURLToPath(new URL('../', import.meta.url));
const prefix = '/day-071-kage-shogen/';
const publicFiles = [
  ['index.html', 'text/html'], ['app.css', 'text/css'], ['app.js', 'text/javascript'],
  ['lib/config.js', 'text/javascript'], ['lib/geometry.js', 'text/javascript'], ['lib/shapes.js', 'text/javascript'],
  ['lib/score.js', 'text/javascript'], ['lib/cases.js', 'text/javascript'], ['lib/deduction.js', 'text/javascript'],
  ['lib/diagnose.js', 'text/javascript'],
  ['lib/stage.js', 'text/javascript'], ['lib/game.js', 'text/javascript'], ['lib/transform.js', 'text/javascript'], ['lib/hit.js', 'text/javascript'],
  ['lib/view.js', 'text/javascript'], ['lib/text.js', 'text/javascript'], ['shared/share.js', 'text/javascript'], ['shared/share.css', 'text/css'],
  ['og.png', 'image/png'], ['favicon.svg', 'image/svg+xml'],
];
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

function assertHeaders(response) {
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['content-security-policy'], csp);
  assert.doesNotMatch(response.headers['content-security-policy'], /unsafe-eval|unsafe-inline|https?:|\*/);
}

async function previewRequests(root = dayRoot) {
  const { handleRequest } = await import(pathToFileURL(join(root, 'tools/serve.mjs')));
  // HTTPと同じ配信処理へ、ソケットを開かず要求を渡す。
  return async (path, method = 'GET') => {
    let result;
    await handleRequest({ url: path, method }, {
      writeHead(status, headers) {
        result = { status, headers: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])), body: '' };
      },
      end(body) { result.body = body === undefined ? '' : Buffer.from(body).toString('utf8'); },
    });
    return result;
  };
}

async function fixtureRoot(t) {
  const fixture = await mkdtemp(join(tmpdir(), 'kage-shogen-preview-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const root = join(fixture, 'bundle');
  await mkdir(join(root, 'tools'), { recursive: true });
  await copyFile(join(dayRoot, 'tools/serve.mjs'), join(root, 'tools/serve.mjs'));
  return { fixture, root };
}

// 新しい lib のファイルを足したのに許可リストへ足し忘れると、画面が空になる（2回起きた）。ここで防ぐ。
test('lib の全ファイルと、app.js・lib が import するファイルは、すべて配信される', async () => {
  const get = await previewRequests();
  const modules = (await readdir(join(dayRoot, 'lib'))).filter((name) => name.endsWith('.js'));
  assert.ok(modules.length >= 13, `lib のファイルが少なすぎる: ${modules.length}`);
  for (const name of modules) assert.equal((await get(`${prefix}lib/${name}`)).status, 200, `lib/${name}`);
  for (const source of ['app.js', ...modules.map((name) => `lib/${name}`)]) {
    const text = await readFile(join(dayRoot, source), 'utf8');
    for (const [, specifier] of text.matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]/g)) {
      const target = posix.join(posix.dirname(source), specifier);
      assert.equal((await get(`${prefix}${target}`)).status, 200, `${source} が import する ${target}`);
    }
  }
  // index.html が読む自分のファイルも、同じく配信される。
  const html = await readFile(join(dayRoot, 'index.html'), 'utf8');
  for (const [, href] of html.matchAll(/(?:href|src)="(\.\/[^"]+)"/g)) {
    assert.equal((await get(`${prefix}${href.slice(2)}`)).status, 200, `index.html が読む ${href}`);
  }
});

test('source preview は自分のDayの公開ファイルだけを配る', async (t) => {
  const get = await previewRequests();

  await t.test('root を転送し、実在するESモジュールを安全なヘッダで配る', async () => {
    for (const path of ['/', prefix.slice(0, -1)]) {
      const redirect = await get(path);
      assert.equal(redirect.status, 302);
      assert.equal(redirect.headers.location, prefix);
      assertHeaders(redirect);
    }
    const response = await get(`${prefix}lib/config.js?preview=1`);
    assert.equal(response.status, 200);
    assert.match(response.body, /export const HEIGHT_RATIO\s*=\s*0\.6/);
    assert.equal(response.headers['content-type'], 'text/javascript; charset=utf-8');
    assertHeaders(response);
    const head = await get(`${prefix}lib/config.js`, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-type'], response.headers['content-type']);
    assert.equal(Number(head.headers['content-length']), Buffer.byteLength(response.body));
    assertHeaders(head);
  });

  await t.test('非公開ファイル・別のDay・不正なメソッドを拒む', async () => {
    for (const path of [
      'tools/serve.mjs', 'tools/design/verify.mjs', 'tests/index.js', 'package.json', 'meta.json', 'README.md',
      '.env', '.env.local', '.precheck-ng.txt', '.git/config', 'lib/unknown.js', 'lib/transform.test.js',
    ]) {
      const response = await get(`${prefix}${path}`);
      assert.equal(response.status, 404, path);
      assertHeaders(response);
    }
    for (const path of ['/lib/config.js', '/day-070-flip-court/lib/config.js', `${prefix}lib/config.js/`]) {
      assert.equal((await get(path)).status, 404, path);
    }
    const deniedHead = await get(`${prefix}tools/serve.mjs`, 'HEAD');
    assert.equal(deniedHead.status, 404);
    assert.equal(deniedHead.body, '');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await get(`${prefix}lib/config.js`, method);
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.allow, 'GET, HEAD');
      assertHeaders(response);
    }
  });

  await t.test('生のパス走査・符号化した走査・壊れたパスを拒む', async () => {
    for (const path of [
      '../package.json', '%2e%2e/package.json', 'lib/../../package.json',
      '%2e%2e%2fpackage.json', 'lib%5c..%5cpackage.json', '/lib/config.js',
      './lib/config.js', 'lib/./config.js', '%252e%252e/package.json',
    ]) {
      const response = await get(`${prefix}${path}`);
      assert.equal(response.status, 404, path);
      assertHeaders(response);
    }
    for (const path of ['%', '%00', '%E0%A4%A']) {
      const response = await get(`${prefix}${path}`);
      assert.equal(response.status, 400, path);
      assertHeaders(response);
    }
  });
});

test(`一時ディレクトリで許可リスト全${publicFiles.length}ファイルの配信とMIMEを確かめる`, async (t) => {
  const { root } = await fixtureRoot(t);
  for (const [path] of publicFiles) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `public fixture: ${path}`);
  }
  const get = await previewRequests(root);
  for (const [path, type] of publicFiles) {
    const response = await get(`${prefix}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.body, `public fixture: ${path}`);
    assert.equal(response.headers['content-type'], type.startsWith('image/') ? type : `${type}; charset=utf-8`);
    assertHeaders(response);
  }
  assert.equal((await get(prefix)).body, 'public fixture: index.html');
});

test('コピーしたpreviewはリンク・ディレクトリ・存在しない許可ファイルを404にする', async (t) => {
  const { fixture, root } = await fixtureRoot(t);
  await mkdir(join(root, 'lib'));
  await mkdir(join(root, 'app.js'));
  await copyFile(join(dayRoot, 'lib/config.js'), join(root, 'lib/config.js'));
  await writeFile(join(fixture, 'private.txt'), 'private preview canary');
  await symlink(join(fixture, 'private.txt'), join(root, 'lib/geometry.js'));
  await writeFile(join(root, '.env'), 'private internal canary');
  await symlink(join(root, '.env'), join(root, 'og.png'));
  const get = await previewRequests(root);
  assert.equal((await get(`${prefix}lib/config.js`)).status, 200);
  for (const path of ['lib/geometry.js', 'og.png', 'index.html', '.env', 'app.js', 'shared/share.css']) {
    assert.equal((await get(`${prefix}${path}`)).status, 404, path);
  }
  assert.equal((await get(prefix)).status, 404);
});

test('起動時に不正なPORTを拒み、待受を始めない', () => {
  for (const port of ['', '-1', '65536', '1.5', 'invalid']) {
    const result = spawnSync(process.execPath, [join(dayRoot, 'tools/serve.mjs')], {
      env: { ...process.env, PORT: port }, encoding: 'utf8', timeout: 2000,
    });
    assert.equal(result.status, 1, port);
    assert.match(result.stderr, /PORT must be an integer between 0 and 65535/);
    assert.equal(result.stdout, '');
  }
});
