import assert from 'node:assert/strict';
import test from 'node:test';
import { GOALS } from '../../lib/contract.js';
import { buildFromRecipe } from '../../lib/recipes.js';
import { diagnose } from '../../lib/rules.js';
import { reduce } from '../../lib/state.js';

const event = buildFromRecipe('event');
const limit = event.blocks.find(block => block.type === 'limited');
const rule = state => diagnose(state).items.find(item => item.id === 'honest-limited');
const edit = (state, id, key, value) => reduce(state, { type: 'setProp', id, path: [key], value });
const checked = edit(event, limit.id, 'real', true);

test('参加の見本に印を付けても86点のままで、直す数字と部品を知らせる', () => {
  const before = rule(event);
  assert.equal(before.ok, false);
  assert.equal(before.blockId, limit.id);
  assert.match(before.note, /受付の記録.*本当の数字です/u);

  const after = rule(checked);
  assert.equal(after.ok, false);
  assert.equal(after.blockId, limit.id);
  assert.equal(after.fix, undefined);
  assert.ok(after.note.includes('「' + limit.props.value + '」は見本のまま'));
  assert.match(after.note, /実際の数字.*本当の数字です/u);
  assert.equal(diagnose(checked).score, 86);
  assert.equal(rule(edit(checked, limit.id, 'value', ' ' + limit.props.value + '　')).ok, false);

  const recorded = edit(checked, limit.id, 'value', '16人');
  assert.equal(rule(recorded).ok, true);
  assert.equal(diagnose(recorded).score, 96);
  assert.equal(rule(edit(recorded, limit.id, 'real', false)).ok, false);
});

test('同じ目的の別の欄から写した数字にも、その値を使って案内する', () => {
  const value = event.blocks.find(block => block.type === 'proof').props.items[1].num;
  const copied = edit(checked, limit.id, 'value', value);
  assert.equal(rule(copied).ok, false);
  assert.ok(rule(copied).note.includes('「' + value + '」'));
  assert.equal(rule({ ...copied, goal: 'reserve' }).ok, true);
});

test('数字が空か空白だけなら、受付の確認の印で判定する', () => {
  for (const value of ['', ' 　']) {
    const blank = edit(event, limit.id, 'value', value);
    assert.equal(rule(blank).ok, false);
    assert.equal(rule(edit(blank, limit.id, 'real', true)).ok, true);
  }
});

test('期限や人数の部品が複数あると、見本の数字が残る部品を指す', () => {
  const two = reduce(checked, { type: 'duplicateBlock', id: limit.id });
  const copy = two.blocks.filter(block => block.type === 'limited')[1];
  const firstEdited = edit(two, limit.id, 'value', '18人');
  const pending = rule(firstEdited);
  assert.equal(pending.ok, false);
  assert.equal(pending.blockId, copy.id);
  assert.ok(pending.note.includes(copy.props.value));
  assert.equal(rule(edit(firstEdited, copy.id, 'value', '6人')).ok, true);
});

test('8目的の見本はこれまでと同じ診断点で始まる', () => {
  const scores = Object.fromEntries(GOALS.map(goal => [goal, diagnose(buildFromRecipe(goal)).score]));
  assert.deepEqual(scores, { reserve: 96, buy: 96, inquire: 96, signup: 95, apply: 96, event: 86, visit: 96, support: 95 });
});
