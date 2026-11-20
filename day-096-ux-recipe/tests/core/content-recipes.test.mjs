import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_SCHEMA, BLOCK_TYPES, GOALS, STAGES, countChars, resolveField, validateState } from '../../lib/contract.js';
import { makeBlock, GENERIC } from '../../lib/blocks.js';
import { RECIPES, buildFromRecipe, suggestionsFor } from '../../lib/recipes.js';
import { createState } from '../../lib/state.js';
import { diagnose } from '../../lib/rules.js';

const layouts = {
  reserve: ['soft', 0, 'hero0 pain0 benefits0 menu0 voices0 steps0 faq0 form0 access0 footer0'],
  buy: ['lively', 5, 'hero2 benefits1 compare0 voices1 menu1 guarantee0 faq1 cta0 footer0'],
  inquire: ['crisp', 1, 'hero1 pain1 benefits2 steps1 proof1 story0 faq1 form1 footer0'],
  signup: ['soft', 3, 'hero0 benefits0 steps1 story1 voices1 guarantee1 faq0 cta1 footer0'],
  apply: ['calm', 2, 'hero1 story1 benefits2 team0 steps0 voices0 access1 faq0 form1 footer0'],
  event: ['lively', 4, 'hero2 benefits1 schedule0 menu1 proof1 limited0 access0 faq1 form0 footer0'],
  visit: ['calm', 5, 'hero0 benefits1 menu0 schedule1 voices1 access0 faq1 cta0 footer0'],
  support: ['soft', 2, 'hero1 story1 proof0 benefits2 plans0 voices0 faq0 guarantee1 cta1 footer0'],
};

for (const goal of GOALS) {
  test(`${goal} の下書きはそのまま使え、すべての段階に部品がある`, () => {
    const state = createState(goal);
    const recipe = RECIPES[goal];
    assert.equal(recipe.goal, goal);
    assert.equal(state.site.name, recipe.siteName);
    assert.match(recipe.question, /？$/u);
    assert.match(recipe.summary, /^(?:[^。！？]+。){1,2}$/u);
    assert.deepEqual(validateState(state), []);
    const [preset, accent, order] = layouts[goal];
    assert.deepEqual(state.theme, { preset, accent });
    assert.equal(state.blocks.map(b => b.type + b.variant).join(' '), order);
    assert.ok(state.blocks.length >= 9 && state.blocks.length <= 11);
    assert.equal(state.blocks.at(-1).props.name, state.site.name);
    assert.equal(state.blocks.at(-1).props.text, 'このページはサンプルです。');

    const report = diagnose(state);
    assert.deepEqual(report.stages.map(stage => stage.key), STAGES);
    assert.ok(report.stages.every(stage => stage.ok && stage.count > 0));
    assert.ok(report.score >= (goal === 'event' ? 85 : 90), String(report.score));
    assert.deepEqual(report.items.filter(item => !item.ok).map(item => item.id),
      goal === 'event' ? ['honest-limited', 'replace-samples'] : ['replace-samples']);
  });
}

test('下書きの件数、使う色と見た目、編集するたびに独立した中身', () => {
  assert.deepEqual(Object.keys(RECIPES), GOALS);
  assert.equal(new Set(Object.values(RECIPES).map(r => r.theme.preset)).size, 4);
  assert.equal(new Set(Object.values(RECIPES).map(r => r.theme.accent)).size, 6);
  for (const goal of GOALS) {
    const first = buildFromRecipe(goal);
    const another = buildFromRecipe(goal);
    assert.deepEqual(first, another);
    assert.notEqual(first.theme, another.theme);
    assert.deepEqual(first.blocks.map(b => b.id), first.blocks.map((_, i) => `b${i + 1}`));
    first.blocks[0].props.title = '書き換えた見出し';
    first.blocks.find(b => b.type === 'benefits').props.items[0].text = '書き換えた説明';
    assert.deepEqual(buildFromRecipe(goal), another);
  }
});

test('部品箱の8目的×19種類と汎用見本は契約に合い、入れ子の行も元と共有しない', () => {
  assert.deepEqual(Object.keys(GENERIC).sort(), [...BLOCK_TYPES].sort());
  for (const type of BLOCK_TYPES) {
    const state = buildFromRecipe('reserve');
    assert.deepEqual(validateState({ ...state, blocks: [{ id: 'b1', type, variant: 0, props: GENERIC[type] }] }), [], type);
  }
  for (const goal of GOALS) {
    const state = buildFromRecipe(goal);
    for (const type of BLOCK_TYPES) {
      const fresh = makeBlock(goal, type, 'new');
      const sibling = makeBlock(goal, type, 'other');
      const original = RECIPES[goal].blocks.find(b => b.type === type);
      const expected = original?.props ?? GENERIC[type];
      assert.deepEqual(validateState({ ...state, blocks: [fresh] }), [], `${goal}/${type}`);
      assert.deepEqual(fresh, { id: 'new', type, variant: original?.variant ?? 0, props: expected });
      assert.notEqual(fresh.props, expected);
      assert.notEqual(fresh.props, sibling.props);
      for (const { key, kind } of BLOCK_SCHEMA[type].fields) {
        if (kind === 'list') {
          assert.notEqual(fresh.props[key], expected[key]);
          for (let i = 0; i < expected[key].length; i++) {
            assert.notEqual(fresh.props[key][i], expected[key][i]);
            assert.notEqual(fresh.props[key][i], sibling.props[key][i]);
          }
        } else if (kind !== 'check') {
          assert.ok(fresh.props[key].trim(), `${goal}/${type}/${key}`);
        }
      }
    }
  }
});

test('言い換えは8目的×4欄に各4案あり、そのまま入力できる', () => {
  const fields = [['hero', 'title'], ['hero', 'cta'], ['cta', 'button'], ['form', 'submit']];
  let count = 0;
  for (const [type, key] of fields) {
    const sets = new Set();
    for (const goal of GOALS) {
      const options = suggestionsFor(goal, type, key);
      assert.equal(options.length, 4);
      assert.equal(new Set(options).size, 4);
      for (const option of options) {
        assert.ok(option.trim() && countChars(option) <= resolveField(type, [key]).max, option);
        if (key !== 'title') assert.doesNotMatch(option, /^(?:送信|こちら|詳細|詳しくはこちら|クリック|OK|Submit)$/iu);
      }
      sets.add(options.join('|'));
      count += options.length;
      options.pop();
      assert.equal(suggestionsFor(goal, type, key).length, 4);
    }
    assert.equal(sets.size, GOALS.length);
  }
  assert.equal(count, 128);
  assert.deepEqual(suggestionsFor('reserve', 'hero', 'lead'), []);
  assert.deepEqual(suggestionsFor('buy', 'menu', 'price'), []);
  assert.deepEqual(suggestionsFor('unknown', 'hero', 'title'), []);
});
