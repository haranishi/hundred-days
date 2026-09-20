import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast, textSurface } from '../lib/column.js';
import { answerFor } from '../lib/ui.js';
const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
test('全ICS色の文字面4.5:1と操作枠3:1を丸めて実測', () => {
  const time = read('geo-time');
  for (const t of [...time.epochs, ...time.periods]) assert.ok(contrast('#171713', textSurface(t.color)) >= 4.5, t.ja);
  for (const bg of ['#ffffff', '#f6f3eb', '#e5e5da', '#e2e5dc']) {
    assert.ok(contrast('#64665c', bg) >= 3);
    assert.ok(contrast('#171713', bg) >= 4.5);
  }
});
test('答えは最寄り産地の範囲・距離・記録環境のみ、遠方は距離が主', () => {
  const env = read('env-ja');
  const c = { distance: 12, eag: .0117, lag: 0 };
  const answer = answerFor(c, env);
  assert.match(answer, /12.0km先で見つかった/);
  assert.match(answer, /1万1,700年前〜現在/);
  assert.doesNotMatch(answer, /海|陸|ここは/);
  assert.match(answerFor({ ...c, env: 'marine indet.' }, env), /海の底/);
  assert.match(answerFor({ ...c, distance: 123 }, env), /^いちばん近い記録は123.0km先/);
});
