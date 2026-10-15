import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture } from './helpers.mjs';

test('checks tracked and untracked JavaScript without executing it', (t) => {
  const f = fixture(t);
  f.write('tracked.mjs', 'throw new Error("must not execute");');
  f.git('add', 'tracked.mjs');
  f.write('new file\nwith-newline.cjs', 'const broken = ;');
  assert.equal(f.run('check-syntax.mjs').status, 1);
  f.write('new file\nwith-newline.cjs', 'module.exports = 1;');
  assert.equal(f.run('check-syntax.mjs').status, 0);
  f.write('tracked.mjs', 'export const broken = ;');
  assert.equal(f.run('check-syntax.mjs').status, 1);
});

test('ignores generated bundles, vendors, ignored files and deleted files', (t) => {
  const f = fixture(t);
  f.write('app.js', 'console.log("valid");');
  for (const dir of ['vendor', 'assets', 'game', 'dist', 'node_modules', '.agent-harness', 'ignored']) {
    f.write(`${dir}/bundle.js`, 'const broken = ;');
  }
  f.write('deleted.js', 'const broken = ;');
  f.git('add', 'deleted.js');
  rmSync(join(f.cwd, 'deleted.js'));
  const result = f.run('check-syntax.mjs');
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /1ファイル/);
});
