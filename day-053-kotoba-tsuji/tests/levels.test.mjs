import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, getLevel } from '../lib/levels.js';

test('levels（v2）：埋める字は 1・7・15、parSec は 30・150・360（一人前は体験評価 v2-r1 で 5→7・120→150）。埋める字は辻の数を超えず、免許皆伝は辻をすべて空ける', () => {
  assert.deepEqual(LEVELS.map((lv) => [lv.name, lv.blanks, lv.parSec]), [['手習い', 1, 30], ['一人前', 7, 150], ['免許皆伝', 15, 360]]);
  for (const lv of LEVELS) {
    assert.ok(Number.isInteger(lv.blanks) && lv.blanks >= 1 && lv.blanks <= lv.crossings, lv.name);
    assert.ok(Object.isFrozen(lv));
  }
  assert.equal(getLevel(3).blanks, getLevel(3).crossings);
  // 上の腕前ほど埋める字が多い
  assert.ok(LEVELS.every((lv, i) => i === 0 || lv.blanks > LEVELS[i - 1].blanks));
});
