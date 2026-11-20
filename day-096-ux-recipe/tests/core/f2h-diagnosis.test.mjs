import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnose } from '../../lib/rules.js';
import { MINIMAL, block } from '../fixtures/states.js';

for (const [goal, value, edited] of [
  ['event', '　１２人 ', '１３人'],
  ['support', ' ５００円/回　', '５５０円/回'],
]) {
  test('「' + value + '」は全角・半角と前後の空白をそろえて見本の数字と照合する', () => {
    for (const [input, ok] of [[value, false], [edited, true]]) {
      const state = { ...MINIMAL, goal, blocks: [block('limit', 'limited', 0, { value: input, real: true })] };
      const report = diagnose(state);
      const limit = report.items.find(item => item.id === 'honest-limited');
      assert.equal(limit.ok, ok);
      if (!ok) {
        assert.equal(limit.blockId, 'limit');
        assert.ok(limit.note.includes('「' + input + '」'));
      }
      assert.equal(report.items.find(item => item.id === 'replace-samples').ok, ok);
      assert.deepEqual(report.samples.blockIds, ok ? [] : ['limit']);
    }
  });
}

test('見出しが空か空白だけの部品には、短い見出しの点を付けない', () => {
  for (const title of ['', ' 　']) {
    const invalid = block('empty', 'hero', 0, { title });
    for (const blocks of [[invalid], [MINIMAL.blocks[0], invalid]]) {
      const report = diagnose({ ...MINIMAL, blocks });
      const short = report.items.find(item => item.id === 'hero-title-short');
      assert.equal(short.ok, false);
      assert.equal(short.blockId, 'empty');
      assert.equal(report.items.find(item => item.id === 'hero-first').ok, blocks.length === 2);
    }
  }
});
