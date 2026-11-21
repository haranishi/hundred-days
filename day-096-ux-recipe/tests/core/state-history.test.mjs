import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCENTS, ACTION_TYPES, BLOCK_SCHEMA, BLOCK_TYPES, GOALS, THEMES, validateState } from '../../lib/contract.js';
import { canRedo, canUndo, commit, createHistory, present, redo, reduce, undo } from '../../lib/state.js';
import { MINIMAL, RESERVE_SAMPLE, STRESS, emptyProps, midProps, oneEach } from '../fixtures/states.js';

const renamed = name => reduce(MINIMAL, { type: 'setSite', name });

test('同じ欄の連続入力を1200msまでまとめ、時刻の逆行・別の欄・キーなしで区切る', () => {
  const first = createHistory(MINIMAL);
  const a = commit(first, renamed('あ'), 'site', 100);
  const b = commit(a, renamed('あい'), 'site', 1300);
  const c = commit(b, renamed('あいう'), 'site', 2500);
  assert.strictEqual(present(undo(c)), MINIMAL);
  assert.strictEqual(present(redo(undo(c))), present(c));
  for (const [key, time] of [['site', 3701], ['body', 2510], [null, 2510], ['site', 2499]]) {
    const split = commit(c, renamed('次'), key, time);
    assert.strictEqual(present(undo(split)), present(c));
  }
  const single = commit(first, renamed('1'), null, 50);
  assert.strictEqual(present(undo(commit(single, renamed('2'), null, 51))), present(single));
  assert.strictEqual(commit(b, present(b), '別', 9999), b);
  assert.strictEqual(present(first), MINIMAL);
  assert.equal(canUndo(first), false);
  assert.equal(canRedo(first), false);
  assert.strictEqual(undo(first), first);
  assert.strictEqual(redo(first), first);
});

test('戻した先で入力すれば未来を消す。戻す・やり直すの直後は前の打鍵とまとめない', () => {
  const a = commit(createHistory(MINIMAL), renamed('最初'), 'name', 10);
  const b = commit(a, renamed('次'), 'name', 2000);
  const back = undo(b);
  assert.strictEqual(present(back), present(a));
  assert.equal(canRedo(back), true);
  const forward = redo(back);
  assert.strictEqual(present(forward), present(b));
  for (const h of [back, forward]) {
    const branch = commit(h, renamed('別の文'), 'name', 2010);
    assert.strictEqual(present(undo(branch)), present(h));
    assert.equal(canRedo(branch), false);
  }
  assert.equal(canRedo(back), true);
  assert.strictEqual(commit(back, present(back)), back);
});

test('履歴は既定60段と指定件数を守り、保持したすべての状態を参照ごと往復できる', () => {
  for (const limit of [undefined, 2, 0]) {
    const states = [MINIMAL];
    let h = createHistory(MINIMAL, limit);
    for (let i = 1; i <= 70; i++) {
      states.push(renamed(String(i)));
      h = commit(h, states[i]);
    }
    const oldest = 70 - (limit ?? 60);
    for (let i = 69; i >= oldest; i--) {
      assert.equal(canUndo(h), true);
      h = undo(h);
      assert.strictEqual(present(h), states[i]);
    }
    assert.equal(canUndo(h), false);
    for (let i = oldest + 1; i <= 70; i++) {
      assert.equal(canRedo(h), true);
      h = redo(h);
      assert.strictEqual(present(h), states[i]);
    }
    assert.equal(canRedo(h), false);
  }
});

function mulberry32(seed) {
  return length => {
    let n = seed = (seed + 0x6d2b79f5) >>> 0;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return Math.floor(((n ^ (n >>> 14)) >>> 0) / 0x100000000 * length);
  };
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

const samples = [
  MINIMAL, RESERVE_SAMPLE, STRESS,
  ...BLOCK_TYPES.flatMap(type => BLOCK_SCHEMA[type].variants.flatMap((_, variant) =>
    [oneEach(type, variant), oneEach(type, variant, midProps(type)), oneEach(type, variant, emptyProps(type))])),
];

function nextAction(type, state, random) {
  const pick = array => array[random(array.length)];
  const block = pick(state.blocks);
  const id = block?.id;
  const index = () => random(state.blocks.length + 4) - 2;
  const text = () => '文章' + random(100000) + '😀\r\n';
  switch (type) {
    case 'setGoal': return { type, goal: pick(GOALS) };
    case 'addBlock': return { type, blockType: pick(BLOCK_TYPES), index: random(2) ? index() : undefined };
    case 'moveBlock': return { type, id, to: index() };
    case 'removeBlock':
    case 'duplicateBlock': return { type, id };
    case 'setVariant': return { type, id, variant: block ? random(BLOCK_SCHEMA[block.type].variants.length + 1) : 0 };
    case 'setSite': return { type, name: text() };
    case 'setTheme': return { type, preset: pick(THEMES), accent: random(ACCENTS.length) };
    case 'replace': return { type, state: pick(samples) };
    case 'setProp': {
      if (!block) return { type, id };
      let field = pick(BLOCK_SCHEMA[block.type].fields);
      const path = [field.key];
      if (field.kind === 'list') {
        const row = random(block.props[field.key].length);
        field = pick(field.item);
        path.push(row, field.key);
      }
      return { type, id, path, value: field.kind === 'check' ? random(2) === 1 : text() };
    }
    default: {
      const entries = state.blocks.flatMap(b => BLOCK_SCHEMA[b.type].fields
        .filter(f => f.kind === 'list').map(f => ({ id: b.id, key: f.key, length: b.props[f.key].length })));
      const entry = pick(entries);
      if (!entry) return { type, id };
      const at = () => random(entry.length + 1);
      return { type, id: entry.id, path: [entry.key], index: at(), from: at(), to: at() };
    }
  }
}

test('固定シードで全見本を各1000回編集し、毎回検証と履歴の往復を行う', t => {
  const effective = new Set();
  for (const [fixture, initial] of samples.entries()) {
    const random = mulberry32(96000 + fixture);
    let h = createHistory(freeze(structuredClone(initial)));
    for (let i = 0; i < 1000; i++) {
      const before = present(h);
      const type = ACTION_TYPES[random(ACTION_TYPES.length)];
      const action = nextAction(type, before, random);
      const next = reduce(before, action);
      const where = '見本' + fixture + ' 操作' + i + ' ' + type;
      assert.deepEqual(validateState(next), [], where);
      const saved = commit(h, freeze(next), null, i);
      if (next === before) assert.strictEqual(saved, h, where);
      else {
        effective.add(type);
        assert.strictEqual(present(undo(saved)), before, where);
        if (type !== 'replace' && type !== 'setGoal') {
          for (const b of before.blocks) {
            const survivor = next.blocks.find(other => other.id === b.id);
            if (survivor && b.id !== action.id) assert.strictEqual(survivor, b, where);
          }
        }
      }
      const back = undo(saved);
      assert.strictEqual(present(redo(back)), next, where);
      h = saved;
    }
  }
  assert.deepEqual(effective, new Set(ACTION_TYPES));
  t.diagnostic(samples.length + '見本 × 1000操作 = ' + samples.length * 1000 + '操作');
});
