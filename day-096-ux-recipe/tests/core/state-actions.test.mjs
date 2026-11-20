import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCENTS, BLOCK_SCHEMA, BLOCK_TYPES, GOALS, MAX_BLOCKS, SITE_NAME_MAX,
  THEMES, getPath, nextBlockId, validateState,
} from '../../lib/contract.js';
import { makeBlock } from '../../lib/blocks.js';
import { buildFromRecipe } from '../../lib/recipes.js';
import { createState, reduce } from '../../lib/state.js';
import { MINIMAL, RESERVE_SAMPLE, STRESS, block, emptyProps, oneEach } from '../fixtures/states.js';

test('8つの目的からレシピを作り、目的変更では現在のテーマを引き継ぐ', () => {
  for (const goal of GOALS) {
    const recipe = buildFromRecipe(goal);
    assert.deepEqual(createState(goal), recipe);
    const next = reduce(STRESS, { type: 'setGoal', goal });
    assert.strictEqual(next.theme, STRESS.theme);
    if (goal === STRESS.goal) assert.strictEqual(next, STRESS);
    else assert.deepEqual(next, { ...recipe, theme: STRESS.theme });
    assert.deepEqual(validateState(next), []);
  }
});

test('選んだ位置に目的の部品を追加し、省略時は最初のフッターの前に置く', () => {
  const footerFirst = reduce(MINIMAL, { type: 'moveBlock', id: 'b2', to: 0 });
  const added = reduce(footerFirst, { type: 'addBlock', blockType: 'plans' });
  assert.deepEqual(added.blocks[0], makeBlock(MINIMAL.goal, 'plans', nextBlockId(footerFirst.blocks)));
  assert.strictEqual(added.blocks[1], footerFirst.blocks[0]);
  assert.strictEqual(added.blocks[2], footerFirst.blocks[1]);
  const noFooter = reduce(MINIMAL, { type: 'removeBlock', id: 'b2' });
  const appended = reduce(noFooter, { type: 'addBlock', blockType: 'cta' });
  assert.strictEqual(appended.blocks[0], noFooter.blocks[0]);
  assert.equal(appended.blocks[1].type, 'cta');

  for (const type of BLOCK_TYPES) {
    for (const [index, expected] of [[-9, 0], [1, 1], [999, 2]]) {
      const next = reduce(MINIMAL, { type: 'addBlock', blockType: type, index });
      assert.deepEqual(next.blocks[expected], makeBlock(MINIMAL.goal, type, 'b3'));
    }
  }
  assert.strictEqual(reduce(STRESS, { type: 'addBlock', blockType: 'form' }), STRESS);
});

test('移動後の添字で順番を決め、複製の編集と削除は元の部品に影響しない', () => {
  const state = RESERVE_SAMPLE;
  const first = state.blocks[0];
  const moved = reduce(state, { type: 'moveBlock', id: first.id, to: 2 });
  assert.deepEqual(moved.blocks.slice(0, 3), [state.blocks[1], state.blocks[2], first]);
  assert.strictEqual(moved.blocks[2], first);
  const end = reduce(moved, { type: 'moveBlock', id: first.id, to: 999 });
  assert.strictEqual(end.blocks.at(-1), first);
  const start = reduce(end, { type: 'moveBlock', id: first.id, to: -999 });
  start.blocks.forEach((b, i) => assert.strictEqual(b, state.blocks[i]));

  const original = state.blocks[2];
  const duplicated = reduce(state, { type: 'duplicateBlock', id: original.id });
  const copy = duplicated.blocks[3];
  assert.deepEqual(copy, { ...original, id: nextBlockId(state.blocks) });
  assert.strictEqual(duplicated.blocks[2], original);
  const edit = reduce(duplicated, { type: 'setProp', id: copy.id, path: ['items', 0, 'text'], value: '複製の文' });
  assert.strictEqual(edit.blocks[2], original);
  assert.notEqual(original.props.items[0].text, edit.blocks[3].props.items[0].text);
  const removed = reduce(edit, { type: 'removeBlock', id: copy.id });
  removed.blocks.forEach((b, i) => assert.strictEqual(b, state.blocks[i]));
  assert.strictEqual(reduce(STRESS, { type: 'duplicateBlock', id: 'b1' }), STRESS);
});

test('最後の部品も消せる。18件目と最大桁の既存idでも新しいidは契約に収まる', () => {
  const only = oneEach('hero', 0);
  const empty = reduce(only, { type: 'removeBlock', id: 'b1' });
  assert.deepEqual(empty.blocks, []);
  assert.equal(reduce(empty, { type: 'addBlock', blockType: 'hero' }).blocks[0].id, 'b1');
  const almost = { ...STRESS, blocks: STRESS.blocks.slice(1) };
  const largeId = { ...MINIMAL, blocks: [MINIMAL.blocks[0], { ...MINIMAL.blocks[1], id: 'b99999999999' }] };
  for (const action of [{ type: 'addBlock', blockType: 'footer' }, { type: 'duplicateBlock', id: 'b2' }]) {
    const full = reduce(almost, action);
    assert.equal(full.blocks.length, MAX_BLOCKS);
    assert.strictEqual(reduce(full, action), full);
    const next = reduce(largeId, { ...action, id: 'b1' });
    assert.equal(next.blocks.length, largeId.blocks.length + 1);
    assert.deepEqual(validateState(next), []);
  }
});

test('全種類で有効な見た目を選べ、同じ番号と範囲外は履歴を増やさない', () => {
  for (const type of BLOCK_TYPES) {
    const state = oneEach(type, 0);
    const change = variant => reduce(state, { type: 'setVariant', id: 'b1', variant });
    const count = BLOCK_SCHEMA[type].variants.length;
    for (let i = 1; i < count; i++) {
      const next = change(i);
      assert.equal(next.blocks[0].variant, i);
      assert.strictEqual(next.blocks[0].props, state.blocks[0].props);
    }
    for (const invalid of [0, -1, count, 0.5, NaN, '1']) assert.strictEqual(change(invalid), state);
  }
});

test('文字数は絵文字も1文字。1行と複数行の違い、チェックの真偽を守る', () => {
  const edit = (state, id, path, value) => reduce(state, { type: 'setProp', id, path, value });
  const hero = MINIMAL.blocks[0];
  const text = edit(MINIMAL, hero.id, ['title'], '😀'.repeat(40));
  assert.equal(text.blocks[0].props.title, '😀'.repeat(32));
  assert.strictEqual(text.blocks[1], MINIMAL.blocks[1]);
  assert.equal(edit(text, hero.id, ['title'], '前\r\n後\u0000').blocks[0].props.title, '前 後');
  assert.equal(edit(text, hero.id, ['title'], 0).blocks[0].props.title, '0');
  assert.equal(edit(text, hero.id, ['lead'], '前\r\n\n\n後\u202e').blocks[0].props.lead, '前\n\n後');
  assert.strictEqual(edit(text, hero.id, ['title'], '😀'.repeat(33)), text);
  const plans = oneEach('plans', 0);
  const path = ['items', 0, 'pick'];
  const unchecked = edit(plans, 'b1', path, 'true');
  assert.equal(getPath(unchecked.blocks[0].props, path), false);
  assert.strictEqual(unchecked.blocks[0].props.items[1], plans.blocks[0].props.items[1]);
  assert.equal(getPath(edit(unchecked, 'b1', path, true).blocks[0].props, path), true);
});

test('繰り返しは最後の行を複製して指定位置へ入れ、おすすめの印を外す', () => {
  const props = { items: [{ name: '先頭' }, { name: '末尾', pick: true, lines: 'ふたつ\nあります' }] };
  const state = { ...MINIMAL, blocks: [block('b1', 'plans', 0, props), MINIMAL.blocks[1]] };
  const items = state.blocks[0].props.items;
  const update = (s, action) => reduce(s, { ...action, id: 'b1', path: ['items'] });
  const insert = update(state, { type: 'addItem', index: 0 });
  const three = insert.blocks[0].props.items;
  assert.deepEqual(three[0], { ...items[1], pick: false });
  assert.strictEqual(three[1], items[0]);
  assert.strictEqual(three[2], items[1]);
  const reordered = update(insert, { type: 'moveItem', from: 2, to: 0 });
  assert.strictEqual(reordered.blocks[0].props.items[0], items[1]);
  assert.strictEqual(reordered.blocks[0].props.items[1], three[0]);
  const four = update(reordered, { type: 'addItem' });
  assert.equal(four.blocks[0].props.items.at(-1).name, '先頭');
  assert.strictEqual(update(four, { type: 'addItem' }), four);
  assert.strictEqual(update(state, { type: 'removeItem', index: 1 }), state);
  const removed = update(insert, { type: 'removeItem', index: 0 });
  removed.blocks[0].props.items.forEach((row, i) => assert.strictEqual(row, items[i]));
  assert.strictEqual(removed.blocks[1], state.blocks[1]);
  for (const [index, expected] of [[-2, 0], [99, items.length]]) {
    const inserted = update(state, { type: 'addItem', index });
    assert.deepEqual(inserted.blocks[0].props.items[expected], { ...items.at(-1), pick: false });
  }
  const empty = oneEach('guarantee', 0, emptyProps('guarantee'));
  const first = update(empty, { type: 'addItem' });
  assert.deepEqual(first.blocks[0].props.items, [{ text: '' }]);
  assert.deepEqual(update(first, { type: 'removeItem', index: 0 }).blocks[0].props.items, []);
});

test('サイト名・テーマの片方または両方の変更で部品を作り直さない', () => {
  const name = reduce(MINIMAL, { type: 'setSite', name: '店'.repeat(26) });
  assert.equal(name.site.name, '店'.repeat(SITE_NAME_MAX));
  assert.strictEqual(name.blocks, MINIMAL.blocks);
  assert.strictEqual(reduce(name, { type: 'setSite', name: '店'.repeat(27) }), name);
  assert.equal(reduce(name, { type: 'setSite', name: '' }).site.name, '');
  for (const preset of THEMES) for (let accent = 0; accent < ACCENTS.length; accent++) {
    const theme = reduce(name, { type: 'setTheme', preset, accent });
    assert.deepEqual(theme.theme, { preset, accent });
    assert.strictEqual(theme.blocks, MINIMAL.blocks);
  }
  const preset = reduce(name, { type: 'setTheme', preset: 'calm' });
  const accent = reduce(preset, { type: 'setTheme', accent: 3 });
  assert.deepEqual(accent.theme, { preset: 'calm', accent: 3 });
  assert.strictEqual(reduce(accent, { type: 'setTheme', accent: 3 }), accent);
});

test('置換は項目を整え、読み取れない状態では元の参照を返す', () => {
  const raw = { goal: 'visit', site: { name: '店\u0000名' }, blocks: [{ type: 'hero', variant: 100, props: { title: '文', extra: '余分' } }] };
  const state = reduce(MINIMAL, { type: 'replace', state: raw });
  assert.deepEqual(validateState(state), []);
  assert.equal(state.site.name, '店名');
  assert.equal(state.blocks[0].variant, 0);
  assert.equal(Object.hasOwn(state.blocks[0].props, 'extra'), false);
  raw.blocks[0].props.title = '書き換えた';
  assert.equal(state.blocks[0].props.title, '文');
  for (const bad of [null, [], {}, { goal: '違う' }, { goal: 'constructor' }]) {
    assert.strictEqual(reduce(state, { type: 'replace', state: bad }), state);
  }
});

test('壊れた操作・存在しないid・型の違う添字とpathはすべて同じ参照', () => {
  const state = RESERVE_SAMPLE;
  const bad = [null, undefined, 1, 'addBlock', [], {}, { type: 'なし' },
    { type: 'setGoal', goal: 'constructor' }, { type: 'setGoal', goal: state.goal },
    { type: 'setTheme' }, { type: 'setTheme', preset: 'none' }, { type: 'setTheme', accent: ACCENTS.length },
    { type: 'setTheme', preset: 'calm', accent: NaN }, { type: 'setTheme', preset: 'none', accent: 4 },
    { type: 'setSite' }, { type: 'setSite', name: {} }, { type: 'setSite', name: NaN },
    { type: 'addBlock', blockType: 'constructor' }, { type: 'addBlock', blockType: ['hero'] },
    { type: 'setProp', id: 'b1', path: ['title'] },
    { type: 'setProp', id: 'b3', path: ['items'], value: '文' },
    { type: 'setProp', id: 'b3', path: ['items', 0], value: '文' },
    { type: 'moveBlock', id: 'b1', to: -10 },
  ];
  for (const type of ['removeBlock', 'moveBlock', 'duplicateBlock', 'setVariant', 'setProp', 'addItem', 'removeItem', 'moveItem']) {
    for (const id of [undefined, 'unknown', 2]) bad.push({ type, id, to: 1, variant: 1, path: ['items'], index: 0, from: 0 });
  }
  for (const value of [NaN, Infinity, -Infinity, 0.5, '1', null, Symbol('添字')]) {
    bad.push({ type: 'addBlock', blockType: 'hero', index: value }, { type: 'moveBlock', id: 'b3', to: value },
      { type: 'setTheme', accent: value }, { type: 'setVariant', id: 'b3', variant: value },
      { type: 'addItem', id: 'b3', path: ['items'], index: value });
  }
  for (const index of [-1, 99, NaN, 0.5, '1']) {
    bad.push({ type: 'removeItem', id: 'b3', path: ['items'], index },
      { type: 'moveItem', id: 'b3', path: ['items'], from: index, to: 1 },
      { type: 'moveItem', id: 'b3', path: ['items'], from: 0, to: index });
  }
  for (const type of ['setProp', 'addItem', 'removeItem', 'moveItem']) {
    for (const path of [undefined, null, {}, 'items.1.title', [], ['nope'], ['__proto__'], ['items', '0', 'title'], ['items', 90, 'title'], ['items', -1, 'title']]) {
      bad.push({ type, id: 'b3', path, value: '文', index: 1, from: 0, to: 1 });
    }
  }
  bad.push({ type: 'addItem', id: 'b3', path: ['heading'] }, { type: 'moveItem', id: 'b3', path: ['items'], from: 1, to: 1 });
  for (const action of bad) assert.strictEqual(reduce(state, action), state);
  const sparseRows = oneEach('benefits', 0);
  sparseRows.blocks[0].props.items = Array(2);
  for (const broken of [null, undefined, [], {}, { ...state, blocks: [null] }, { ...state, blocks: Array(2) }, sparseRows, { ...state, theme: {} }]) {
    assert.strictEqual(reduce(broken, { type: 'setSite', name: '店' }), broken);
  }
  // 疎配列（空の要素）は、他の欠けた項目と同じく、空の項目に作り直して受け入れる（契約の sanitize が配列を添字で作る）
  const repaired = reduce(state, { type: 'replace', state: sparseRows });
  assert.notStrictEqual(repaired, state);
  assert.deepEqual(validateState(repaired), []);
  assert.ok(repaired.blocks[0].props.items.every((item) => item && typeof item.title === 'string'));
});
