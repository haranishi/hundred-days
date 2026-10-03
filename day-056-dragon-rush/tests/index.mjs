import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(root + name, 'utf8');
test('Day56はスマホの条件を明示し、実績・制作時間を創作しない', () => {
  const meta = JSON.parse(read('meta.json'));
  assert.equal(meta.day, 56);
  assert.equal(meta.title, '夕暮れ怪獣ラッシュ');
  assert.equal(meta.actualMinutes, undefined);
  assert.match(read('index.html'), /スマートフォンのタッチ操作に対応/);
  assert.match(read('index.html'), /スマホは横向き/);
  assert.match(read('index.html'), /軽量画質固定/);
  assert.doesNotMatch(read('app.js'), /loaded \|\| touchOnly/);
  assert.match(read('index.html'), /強い光と画面の揺れ/);
});
test('全配信素材の指紋が実物と一致する', () => {
  const { files } = JSON.parse(read('game/asset-manifest.json'));
  assert.equal(files.filter(f => f.file.endsWith('.glb')).length, 3);
  assert.equal(files.filter(f => f.file.endsWith('.ogg')).length, 306);
  assert.equal(files.filter(f => /^assets\/index-[\w-]+\.js$/.test(f.file)).length, 1);
  for (const file of files) {
    const bytes = readFileSync(root + 'game/' + file.file);
    assert.equal(bytes.length, file.bytes, file.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
    assert.ok(bytes.length < 25 * 1024 * 1024, 'Cloudflare Pagesの1ファイル上限を超えない');
  }
});
test('許諾全文と旧実装の除去を配信に確認する', () => {
  assert.match(read('game/licenses/three.txt'), /three.js authors/);
  assert.match(read('game/licenses/postprocessing.txt'), /Raoul van Rüschen/);
  assert.match(read('game/licenses/n8ao.txt'), /CC0 1.0 Universal/);
  assert.match(read('game/licenses/BakingLab.txt'), /Stephen Hill/);
  assert.match(read('game/licenses/SMAA.txt'), /Jorge Jimenez/);
  const { module } = JSON.parse(read('game/entry.json'));
  assert.ok(existsSync(root + 'game/' + module));
  const bundle = read('game/' + module);
  assert.doesNotMatch(bundle, /0\.1031|p3\.yzx\s*\+\s*33\.33|data:application\/javascript/);
  assert.match(bundle, /limiter\.worklet-[\w-]+\.js/);
  assert.match(read('source/src/core/springs.ts'), /Math\.exp/);
  assert.doesNotMatch(read('source/src/core/springs.ts'), /0\.48|0\.235/);
});
