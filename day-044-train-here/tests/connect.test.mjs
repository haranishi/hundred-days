import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../tools/connect.mjs', import.meta.url));

test('接続ヘルプはキー入力やAPI呼び出しを行わず終了する', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', timeout: 3000 });
  assert.equal(result.status, 0); assert.match(result.stdout, /非表示入力/);
});
test('非対話の接続を拒否し、入力された文字列を出力しない', () => {
  const synthetic = 'SYNTHETIC-NOT-A-REAL-KEY';
  const result = spawnSync(process.execPath, [cli], { input: synthetic, encoding: 'utf8', timeout: 3000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /端末から実行/);
  assert.ok(!(result.stdout + result.stderr).includes(synthetic));
});
