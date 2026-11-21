import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFromRecipe } from '../../lib/recipes.js';
import { diagnose } from '../../lib/rules.js';
import { reduce } from '../../lib/state.js';
import { diagnosisModel } from '../../lib/ui-diagnosis.js';

test('同じ部品を続けたときも、片方を外して達成済みに戻ったときも、同じ独自の根拠を読める', () => {
  const page = buildFromRecipe('reserve');
  const repeated = reduce(page, { type: 'duplicateBlock', id: page.blocks[0].id });
  const restored = reduce(repeated, { type: 'removeBlock', id: repeated.blocks[1].id });
  const pending = diagnosisModel(diagnose(repeated)).groups.find(group => group.level === 'tip');
  const completed = diagnosisModel(diagnose(restored)).done;
  for (const items of [pending.items, completed]) {
    const rule = items.find(item => item.id === 'no-adjacent-same');
    assert.ok(rule);
    assert.match(rule.note, /同じ形式を続けるのが向く場面/u);
    assert.deepEqual(rule.sources.map(entry => entry.confidence), ['独自の整理']);
    assert.ok(rule.sources.every(entry => entry.url === undefined));
  }
});
