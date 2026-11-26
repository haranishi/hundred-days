import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './helpers.mjs';

test('private scan requires a nonempty personal word list', (t) => {
  const f = fixture(t);
  assert.equal(f.run('precheck.mjs').status, 1);
  f.write('.precheck-ng.txt', '# comments only\n');
  assert.equal(f.run('precheck.mjs').status, 1);
  f.write('.precheck-ng.txt', 'private-fixture-marker\n');
  assert.equal(f.run('precheck.mjs').status, 0);
});

test('personal matches and invalid regexes fail without exposing the pattern', (t) => {
  const f = fixture(t);
  const pattern = 'private-fixture-marker';
  f.write('.precheck-ng.txt', pattern);
  f.write('note.txt', pattern);
  const match = f.run('precheck.mjs');
  assert.equal(match.status, 1);
  assert.match(match.output, /NGワード: note\.txt:1/);
  assert.ok(!match.output.includes(pattern));
  f.write('.precheck-ng.txt', '[' + pattern);
  const invalid = f.run('precheck.mjs');
  assert.equal(invalid.status, 1);
  assert.match(invalid.output, /不正な正規表現/);
  assert.ok(!invalid.output.includes(pattern));
});

test('public scan works without private configuration and still rejects tokens', (t) => {
  const f = fixture(t);
  assert.equal(f.run('precheck.mjs', '--public').status, 0);
  const value = ['sk', '-'].join('') + 'a'.repeat(24);
  f.write('leak.txt', value);
  const result = f.run('precheck.mjs', '--public');
  assert.equal(result.status, 1);
  assert.match(result.output, /APIキー\/トークン: leak\.txt:1/);
  assert.ok(!result.output.includes(value));
});

test('both scan modes reject local paths and tracked private files', (t) => {
  const f = fixture(t);
  f.write('.precheck-ng.txt', 'private-fixture-marker');
  f.write('note.txt', '/' + ['Users', 'fixture', 'notes'].join('/'));
  for (const args of [[], ['--public']]) {
    assert.equal(f.run('precheck.mjs', ...args).status, 1);
  }
  f.write('note.txt', 'safe');
  f.git('add', '-f', '.precheck-ng.txt');
  for (const args of [[], ['--public']]) {
    const result = f.run('precheck.mjs', ...args);
    assert.equal(result.status, 1);
    assert.match(result.output, /追跡されている/);
  }
});

test('public mode is explicit and does not weaken the default private scan', (t) => {
  const f = fixture(t);
  f.write('.precheck-ng.txt', 'private-fixture-marker');
  f.write('note.txt', 'private-fixture-marker');
  assert.equal(f.run('precheck.mjs').status, 1);
  assert.equal(f.run('precheck.mjs', '--public').status, 0);
  assert.equal(f.run('precheck.mjs', '--unknown').status, 2);
});

test('author check rejects personal and lookalike emails without logging them', (t) => {
  const f = fixture(t);
  for (const email of ['fixture@example.test', 'fixture@users.noreply.github.com.example.test']) {
    f.git('config', 'user.email', email);
    const result = f.run('precheck.mjs', '--public');
    assert.equal(result.status, 1);
    assert.match(result.output, /noreplyでない/);
    assert.ok(!result.output.includes(email));
  }
});

test('filenames with newlines cannot bypass the public scan', (t) => {
  const f = fixture(t);
  f.write('note\nwith-newline.txt', '/' + ['Users', 'fixture'].join('/'));
  assert.equal(f.run('precheck.mjs', '--public').status, 1);
});

test('leading whitespace in the first filename cannot bypass the public scan', async (t) => {
  for (const filename of [' leading.txt', '\tleading.txt', '\nleading.txt']) {
    await t.test(JSON.stringify(filename), (subtest) => {
      const f = fixture(subtest);
      f.write(filename, '/' + ['Users', 'fixture'].join('/'));
      assert.equal(f.run('precheck.mjs', '--public').status, 1);
    });
  }
});

test('Day100 の kamoku の著作権表示は、取り込んだ組み立て結果の中だけ非公開語の検査から外す', (t) => {
  const f = fixture(t);
  f.write('.precheck-ng.txt', 'private-fixture-marker\n');
  const notice = 'Copyright (c) 2026 Private-Fixture-Marker and the kamoku contributors';
  const spdx = '/* SPDX-FileCopyrightText: 2026 Private-Fixture-Marker and the kamoku contributors */';
  const built = ['day-100-kamoku/kamoku-LICENSE-MIT.txt', 'day-100-kamoku/css/base.css', 'day-100-kamoku/web/pkg/x.wasm'];
  for (const file of built) f.write(file, `${notice}\n${spdx}\n`);
  assert.equal(f.run('precheck.mjs').status, 0);
  // 同じ行でも、表示の外にある語は止める
  f.write(built[0], `${notice} private-fixture-marker\n`);
  assert.equal(f.run('precheck.mjs').status, 1);
  // 表示の形でなければ止める
  f.write(built[0], 'made by private-fixture-marker\n');
  assert.equal(f.run('precheck.mjs').status, 1);
  f.write(built[0], 'ok\n');
  // 手で書くファイルと、ほかのフォルダでは、同じ表示でも止める
  for (const file of ['day-100-kamoku/README.md', 'day-100-kamoku/day100/day100.css', 'day-099-meibo/LICENSE.txt']) {
    f.write(file, `${notice}\n`);
    const result = f.run('precheck.mjs');
    assert.equal(result.status, 1, file);
    assert.ok(result.output.includes(`NGワード: ${file}:1`), file);
    f.write(file, 'ok\n');
  }
  // 秘密の値の検査は、表示の行でも変えない
  f.write(built[1], `${notice} ${['sk', '-'].join('') + 'a'.repeat(24)}\n`);
  assert.match(f.run('precheck.mjs').output, /APIキー\/トークン/);
});
