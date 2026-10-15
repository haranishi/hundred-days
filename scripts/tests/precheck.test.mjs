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
