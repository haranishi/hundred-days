import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { needsDayLicense } from '../lib/day-license.mjs';

/* コードがこのリポジトリにあるDayは、フォルダ直下に、リポジトリ直下と同じ内容の LICENSE を持つ。
   新しいDayで置き忘れると、ここで落ちる（直し方：cp LICENSE day-NNN-xxx/LICENSE）。本番には配信しない（scripts/lib/dist-files.mjs） */

const root = fileURLToPath(new URL('../../', import.meta.url));
const rootLicense = readFileSync(join(root, 'LICENSE'), 'utf8');
const dayDirs = readdirSync(root)
  .filter((name) => /^day-\d{3}-/.test(name) && statSync(join(root, name)).isDirectory())
  .sort();
const targets = dayDirs.filter((dir) => {
  const meta = JSON.parse(readFileSync(join(root, dir, 'meta.json'), 'utf8'));
  return needsDayLicense(meta, { hasSource: existsSync(join(root, dir, 'source', 'package.json')) });
});

test('リポジトリ直下の LICENSE は MIT で、著作権者が書いてある', () => {
  assert.match(rootLicense, /^MIT License\n/);
  assert.match(rootLicense, /^Copyright \(c\) \d{4} \S+/m);
});

test('コードがこのリポジトリにあるDayは、フォルダ直下に LICENSE を持ち、内容は直下と同じ', () => {
  // Dayの探し方が壊れて、何も調べずに通ってしまうのを防ぐ（Dayは増えることはあっても減らない）
  assert.ok(dayDirs.length >= 94, `Dayのフォルダが ${dayDirs.length} 件しか見つからない`);
  assert.ok(targets.length >= 80, `LICENSE を求めるDayが ${targets.length} 件しかない`);
  const missing = targets.filter((dir) => !existsSync(join(root, dir, 'LICENSE')));
  assert.deepEqual(missing, [], `LICENSE が無いDay。cp LICENSE <フォルダ>/LICENSE で置く`);
  const differ = targets.filter((dir) => readFileSync(join(root, dir, 'LICENSE'), 'utf8') !== rootLicense);
  assert.deepEqual(differ, [], '直下の LICENSE と内容が違うDay。直下を直したら、各Dayの写しも直す');
});

test('LICENSE を求める条件：status が external 以外、または外部Dayで source/ にコードがある', () => {
  assert.equal(needsDayLicense({ status: 'published' }), true);
  assert.equal(needsDayLicense({ status: 'draft' }), true);
  assert.equal(needsDayLicense({}), true, 'status が無いDayは published');
  assert.equal(needsDayLicense(undefined), true, 'meta が読めないときも、置く側に倒す');
  assert.equal(needsDayLicense({ status: 'external' }, { hasSource: true }), true, 'コードを source/ に置く外部Day');
  assert.equal(needsDayLicense({ status: 'external' }, { hasSource: false }), false, 'コードがここに無い外部Day');
  assert.equal(needsDayLicense({ status: 'external' }), false);
});
