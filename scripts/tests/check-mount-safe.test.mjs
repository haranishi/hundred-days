import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRootRelativeRefs } from '../check-mount-safe.mjs';

function fixture(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'mount-safe-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, text] of Object.entries({ 'assets/x.js': '', 'privacy.html': '', 'day-001-x/index.html': '', ...files })) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}
test('relative, external and unrelated root names pass', t => {
  assert.deepEqual(findRootRelativeRefs(fixture(t, { 'index.html': '<a href="./privacy"><img src="./assets/x"><a href="https://host/assets/x">', 'a.js': "const x = '/not-in-dist';" })), []);
});
test('finds quoted strings, unquoted attributes and CSS url with file and line', t => {
  const refs = findRootRelativeRefs(fixture(t, {
    'index.html': '<script src="/assets/x.js"></script>\n<a href=/privacy>',
    'style.css': 'a{background:url(/day-001-x/a.png)}',
    'a.mjs': 'const x = `/assets/${name}`;'
  }));
  assert.equal(refs.length, 4);
  assert.ok(refs.some(ref => ref.file === 'index.html' && ref.line === 2 && ref.value === '/privacy'));
});
test('API, protocol relative, mount:false, vendor and tools pass', t => {
  assert.deepEqual(findRootRelativeRefs(fixture(t, {
    'index.html': '<script src="//cdn.example/x"></script>',
    'a.js': "fetch('/api/day-023/x')",
    'day-002-y/meta.json': '{"mount":false}',
    'day-002-y/index.html': '<img src="/assets/x">',
    'day-001-x/vendor/a.js': "const x='/assets/x'",
    'day-001-x/tools/a.html': '<img src="/assets/x">'
  })), []);
});
test('サイトのルートへのリンク（href="/"）は違反。../ や JS内の "/" は違反でない', t => {
  const refs = findRootRelativeRefs(fixture(t, {
    'index.html': '<a href="/">x</a>\n<a href=\'/\'>y</a>\n<a href="../">ok</a><a href="./">ok</a>',
    'a.js': "const sep = '/'; path.split('/');"
  }));
  assert.deepEqual(refs.map(ref => [ref.file, ref.line, ref.value]), [['index.html', 1, '/'], ['index.html', 2, '/']]);
});
