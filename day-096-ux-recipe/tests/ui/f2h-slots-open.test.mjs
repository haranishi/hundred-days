import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 保存を開くとき、一覧を描いたときの savedAt を渡す（枠が別の作業に再利用されていたら、開かずに一覧を読み直す）。
// 実際の呼び出しの形は、ui-slots.js の文字列で確かめる（描画の試験は d-panels が持つ）。
const source = readFileSync(new URL('../../lib/ui-slots.js', import.meta.url), 'utf8');

test('保存の「開く」は、一覧を描いたときの savedAt を渡して開く', () => {
  assert.match(source, /button\('開く', \(\) => load\(slot\.id, \{ savedAt: slot\.savedAt \}\)\)/);
  assert.match(source, /function load\(id, expect\)\s*\{[\s\S]*?ctx\.slots\.load\(id, expect\)/);
});
