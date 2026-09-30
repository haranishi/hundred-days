import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('画面の単語帳は本番の data/words.js を指している', () => {
  const src = readFileSync(new URL('../lib/words-source.js', import.meta.url), 'utf8');
  const code = src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.match(code, /from '\.\.\/data\/words\.js'/);
  assert.doesNotMatch(code, /fixture/);
});
