import test from 'node:test';
import assert from 'node:assert/strict';
import { GOALS, validateState } from '../../lib/contract.js';
import { buildFromRecipe } from '../../lib/recipes.js';
import * as sample from '../../lib/sample.js';
import { MINIMAL, block } from '../fixtures/states.js';

test('8つの目的から見本の店名を引けて、知らない目的は空になる', () => {
  for (const goal of GOALS) assert.equal(sample.sampleSiteName(goal), buildFromRecipe(goal).site.name);
  for (const goal of ['', 'unknown', 'constructor', null]) assert.equal(sample.sampleSiteName(goal), '');
});

test('店名は本文・行・フッターで出現ごとに数え、記号を含む名前もそのまま置き換える', () => {
  const from = '木[屋]';
  const to = '花$&';
  const state = { ...MINIMAL, site: { name: from }, blocks: [
    block('info', 'limited', 0, { label: from, real: true }),
    block('foot', 'footer', 0, { name: from, text: from + 'です。\n' + from + 'より',
      items: [{ text: from + 'の地図' }, { text: 'お問い合わせ' }] }),
  ] };
  const original = structuredClone(state);
  assert.equal(sample.countNameUses(state, from), 5);
  assert.equal(sample.countNameUses(state, 'true'), 0);
  assert.equal(sample.countNameUses(state, ''), 0);
  const changed = sample.replaceNameUses(state, from, to);
  assert.equal(changed.replaced, 5);
  assert.equal(changed.skipped, 0);
  assert.deepEqual(changed.state, { ...original, blocks: [
    block('info', 'limited', 0, { label: to, real: true }),
    block('foot', 'footer', 0, { name: to, text: to + 'です。\n' + to + 'より',
      items: [{ text: to + 'の地図' }, { text: 'お問い合わせ' }] }),
  ] });
  assert.deepEqual(validateState(changed.state), []);
  assert.equal(sample.countNameUses(changed.state, from), 0);
  assert.deepEqual(state, original);
});

test('上限ちょうどの行は置き換え、上限を超える行はそのまま1欄と数える', () => {
  const to = '🌷'.repeat(5);
  const skippedLine = '🌱'.repeat(10) + '店店';
  const state = { ...MINIMAL, blocks: [block('foot', 'footer', 0, {
    name: '店', items: [{ text: skippedLine }, { text: '🌱'.repeat(7) + '店' }],
  })] };
  const changed = sample.replaceNameUses(state, '店', to);
  assert.equal(changed.replaced, 2);
  assert.equal(changed.skipped, 1);
  assert.equal(changed.state.blocks[0].props.name, to);
  assert.deepEqual(changed.state.blocks[0].props.items, [{ text: skippedLine }, { text: '🌱'.repeat(7) + to }]);
  assert.deepEqual(validateState(changed.state), []);
  assert.equal(sample.countNameUses(changed.state, '店'), 2);
  const retry = sample.replaceNameUses(changed.state, '店', to);
  assert.equal(retry.state, changed.state);
  assert.equal(retry.replaced, 0);
  assert.equal(retry.skipped, 1);
});

test('置き換えるものがなければ元の参照を返し、空文字への置換は実行する', () => {
  const state = buildFromRecipe('reserve');
  const name = state.site.name;
  for (const [from, to] of [['', name], [name, name], ['見覚えのない名前', name]]) {
    const result = sample.replaceNameUses(state, from, to);
    assert.equal(result.state, state);
    assert.deepEqual([result.replaced, result.skipped], [0, 0]);
  }
  const result = sample.replaceNameUses(state, name, '');
  assert.ok(result.replaced > 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.state.site.name, name);
  assert.equal(result.state.blocks.at(-1).props.name, '');
  assert.deepEqual(validateState(result.state), []);
});

test('改行を含む名前は複数行の欄に入れ、単一行の欄は有効なまま保つ', () => {
  const state = { ...MINIMAL, blocks: [block('foot', 'footer', 0, { name: '店', text: '場所は店です' })] };
  const changed = sample.replaceNameUses(state, '店', '甲\n乙');
  assert.deepEqual(changed.state.blocks[0].props, { name: '店', text: '場所は甲\n乙です', items: [] });
  assert.deepEqual([changed.replaced, changed.skipped], [1, 1]);
  assert.deepEqual(validateState(changed.state), []);
});

test('IDや項目のキーの記載順が違っても、文章と並びが同じなら見本のまま', () => {
  for (const goal of GOALS) {
    const state = buildFromRecipe(goal);
    assert.equal(sample.isUntouched(state), true);
    state.theme = { accent: state.theme.accent, preset: state.theme.preset };
    for (const [index, b] of state.blocks.entries()) {
      b.id = 'part' + index;
      b.props = Object.fromEntries(Object.entries(b.props).reverse());
    }
    assert.deepEqual(validateState(state), []);
    assert.equal(sample.isUntouched(state), true);
  }
});

test('店名・見た目・本文の1文字・確認の印・行や部品の順序を変えると編集済みになる', () => {
  const edits = [
    s => { s.site.name += '。'; }, s => { s.theme.accent = 0; }, s => { s.theme.preset = 'soft'; },
    s => { s.blocks[0].variant = 0; }, s => { s.blocks[0].props.title += '。'; },
    s => { s.blocks.find(b => b.type === 'limited').props.real = true; },
    s => { s.blocks.find(b => b.type === 'faq').props.items[0].a += '。'; },
    s => { s.blocks.find(b => b.type === 'faq').props.items.reverse(); },
    s => { s.blocks.splice(1, 1); }, s => { s.blocks.reverse(); },
  ];
  for (const edit of edits) {
    const state = buildFromRecipe('event');
    edit(state);
    assert.deepEqual(validateState(state), []);
    assert.equal(sample.isUntouched(state), false);
  }
});
