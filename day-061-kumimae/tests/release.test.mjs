import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { sourceHash } from '../source/tools/source-hash.mjs';
const day = fileURLToPath(new URL('../', import.meta.url));
const source = join(day,'source');
const hash = text => createHash('sha256').update(text).digest('hex');

test('Day61の配布物とOSS通知が検証したビルドに一致する', () => {
  const manifest = JSON.parse(readFileSync(join(day,'legal/THIRD_PARTY_MANIFEST.json')));
  assert.equal(hash(readFileSync(join(day,'legal/THIRD_PARTY_NOTICES.txt'))), manifest.noticeSha256);
  for (const output of manifest.generatedFiles) assert.equal(hash(readFileSync(join(day,output.file))), output.sha256, output.file);
  assert.ok(manifest.packages.length > 0);
  assert.ok(manifest.packages.every(p => p.license === 'MIT' && p.version && p.licenses.length));
});
test('Day61のソース変更には公開物の再生成が必要', () => {
  assert.deepEqual(sourceHash(source), JSON.parse(readFileSync(join(source,'build-record.json'))));
});
test('Day61に実製品カタログや素材を同梱しない', () => {
  for (const dir of ['research','external','src/data','models']) assert.equal(existsSync(join(source,dir)),false,dir);
  const filenames = readdirSync(join(day,'assets'));
  assert.ok(filenames.every(name => /\.(?:js|css|js\.LICENSE\.txt)$/.test(name)));
  const script = filenames.filter(f => f.endsWith('.js')).map(f => readFileSync(join(day,'assets',f),'utf8')).join('\n');
  for (const forbidden of ['catalog.json','parts-data','productModels','sketchfab.com','pcgamer.com','tomshardware.com','kakaku.com/item/']) assert.ok(!script.includes(forbidden),forbidden);
  assert.match(script,/架空/);
});
