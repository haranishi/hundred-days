import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_TYPES, BLOCK_TYPES, GOALS, LEVEL_WEIGHT, MAX_BLOCKS, STAGE_LABEL, validateState } from '../../lib/contract.js';
import { makeBlock } from '../../lib/blocks.js';
import { buildFromRecipe } from '../../lib/recipes.js';
import { diagnose, stageCoverage } from '../../lib/rules.js';
import { commit, createHistory, reduce, undo } from '../../lib/state.js';
import { MINIMAL, RESERVE_SAMPLE, STRESS, block } from '../fixtures/states.js';

function page(goal, ...types) {
  return { ...MINIMAL, goal, blocks: types.map((type, i) => makeBlock(goal, type, `b${i + 1}`)) };
}

const reserve = (...types) => page('reserve', ...types);
const empty = reserve();
const booking = buildFromRecipe('reserve');
const fair = buildFromRecipe('event');
const itemOf = (state, id) => diagnose(state).items.find(item => item.id === id);
const prop = (state, type, key, value) =>
  reduce(state, { type: 'setProp', id: state.blocks.find(b => b.type === type).id, path: [key], value });

function applyFix(state, id) {
  const old = structuredClone(state);
  const report = diagnose(state);
  const before = report.items.find(item => item.id === id);
  assert.equal(before.ok, false, id);
  assert.ok(before.fix?.label && ACTION_TYPES.includes(before.fix.action.type), id);
  const next = reduce(state, before.fix.action);
  const after = diagnose(next);
  assert.deepEqual(validateState(next), [], id);
  assert.equal(after.items.find(item => item.id === id)?.ok, true, id);
  assert.ok(after.score > report.score, `${id}: ${after.score} > ${report.score}`);
  assert.deepEqual(state, old, id);
  assert.deepEqual(undo(commit(createHistory(state), next)).present, old, id);
  return next;
}

const needsFewerFields = reserve('form');
needsFewerFields.blocks[0].props.items = Array.from({ length: 5 }, (_, i) => ({ label: `欄${i + 1}` }));
const threeLabels = reserve('hero', 'cta', 'form');
const repeated = reserve('hero', 'benefits', 'benefits', 'voices', 'faq', 'form', 'footer');
const longPage = reserve('hero', 'pain', 'steps', 'proof', 'story', 'team', 'menu', 'plans', 'schedule', 'voices', 'faq', 'form', 'footer');
const copiedQuestion = buildFromRecipe('buy').blocks.find(b => b.type === 'faq').props.items[0].q;
const loneSample = { ...page('buy'), blocks: [block('b1', 'faq', 1, { items: [{}, { q: copiedQuestion }] })] };
const twelveBlocks = reduce(longPage, { type: 'removeBlock', id: longPage.blocks[8].id });

test('ボタン名のまとまりは空白を除いて2件から診断し、名前の欠落は別の項目で知らせる', () => {
  const buttons = (...labels) => ({ ...MINIMAL, blocks: labels.map((button, i) => block('b' + i, 'cta', 0, { button })) });
  for (const labels of [['', '　'], ['予約する', '　', '']]) {
    const state = buttons(...labels);
    assert.equal(itemOf(state, 'button-label-consistent'), undefined);
    assert.equal(itemOf(state, 'button-label-result').ok, false);
  }
  assert.equal(itemOf(buttons('', '予約する', '予約する'), 'button-label-consistent').ok, true);
});

test('ひとこと表示は6枠あっても1項目として診断する', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ label: '質問' + i }));
  const state = { ...MINIMAL, blocks: [block('short', 'form', 1, { items })] };
  assert.equal(itemOf(state, 'form-short').ok, true);
});

test('縦のフォームを短くしても、ひとこと表示の非表示の項目を保つ', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ label: '質問' + i }));
  const state = { ...MINIMAL, blocks: [block('short', 'form', 1, { items }), block('long', 'form', 0, { items })] };
  const rule = itemOf(state, 'form-short');
  assert.equal(rule.blockId, 'long');
  const next = applyFix(state, 'form-short');
  assert.deepEqual(next.blocks[0], state.blocks[0]);
  assert.deepEqual(next.blocks[1].props.items, items.slice(0, 4));
});

const examples = [
  { id: 'has-action', level: 'must', yes: reserve('form'), no: reserve('hero', 'limited') },
  { id: 'hero-first', level: 'must', yes: reserve('hero'), no: reserve('pain', 'hero', 'cta') },
  { id: 'flow-complete', level: 'must', yes: booking, no: reserve('footer') },
  { id: 'trust-before-action', level: 'must', yes: reserve('story', 'form'), no: reserve('hero', 'menu', 'form', 'voices', 'cta'), outside: reserve('hero', 'limited') },
  { id: 'honest-limited', level: 'must', yes: prop(fair, 'limited', 'real', true), no: fair, outside: reserve('cta'),
    edit: s => prop(s, 'limited', 'real', true) },
  { id: 'price-before-action', level: 'should', yes: reserve('plans', 'cta'), no: reserve('hero', 'voices', 'form', 'menu', 'cta'), outside: page('support', 'form') },
  { id: 'button-label-result', level: 'should', yes: booking, no: prop(booking, 'form', 'submit', 'こちら'), outside: reserve('pain'),
    edit: s => prop(s, 'form', 'submit', '希望日を伝える') },
  { id: 'button-label-consistent', level: 'should', yes: booking, no: threeLabels, outside: reserve('form'),
    edit: s => prop(s, 'cta', 'button', s.blocks[2].props.submit) },
  { id: 'form-short', level: 'should', yes: booking, no: needsFewerFields, outside: reserve('hero', 'cta') },
  { id: 'hero-title-short', level: 'tip', yes: prop(booking, 'hero', 'title', '🌱'.repeat(28)), no: prop(booking, 'hero', 'title', '🌱'.repeat(29)), outside: reserve('pain'),
    edit: s => prop(s, 'hero', 'title', '座って相談する整体室') },
  { id: 'faq-before-last-action', level: 'tip', yes: reserve('cta', 'faq', 'form'), no: reserve('hero', 'voices', 'menu', 'form', 'faq', 'footer'), outside: page('visit', 'form') },
  { id: 'action-reachable-again', level: 'tip', yes: booking, no: reserve('hero', 'cta', 'menu', 'voices', 'benefits', 'faq', 'footer'), outside: reserve('hero', 'menu', 'voices', 'cta', 'footer') },
  { id: 'no-adjacent-same', level: 'tip', yes: reserve('hero', 'pain', 'hero'), no: repeated,
    edit: s => reduce(s, { type: 'removeBlock', id: s.blocks[2].id }) },
  { id: 'not-too-long', level: 'tip', yes: twelveBlocks, no: longPage, edit: () => twelveBlocks },
  { id: 'replace-samples', level: 'tip', yes: { ...empty, blocks: [block('b1', 'story', 0, { text: '木の椅子を作っています。' })] }, no: loneSample,
    edit: s => reduce(s, { type: 'setProp', id: 'b1', path: ['items', 1, 'q'], value: '色の違いを選べますか？' }) },
];

for (const { id, level, yes, no, outside, edit } of examples) {
  test(`${id} の合否・適用条件と、修正前後の診断`, () => {
    for (const state of [yes, no, ...(outside ? [outside] : [])]) assert.deepEqual(validateState(state), []);
    const passed = itemOf(yes, id);
    const failed = itemOf(no, id);
    assert.equal(passed.ok, true);
    assert.equal(failed.ok, false);
    assert.equal(failed.level, level);
    assert.equal(failed.title, passed.title);
    assert.equal(passed.fix, undefined);
    if (outside) assert.equal(itemOf(outside, id), undefined);
    else for (const state of [reserve('footer'), MINIMAL, STRESS]) assert.ok(itemOf(state, id));
    if (!edit) {
      applyFix(no, id);
    } else {
      assert.equal(failed.fix, undefined);
      const edited = edit(no);
      assert.equal(itemOf(edited, id).ok, true);
      assert.ok(diagnose(edited).score > diagnose(no).score);
    }
  });
}

test('点は適用項目だけの重み付き割合で、件数は重みと区別する', () => {
  const all = { ...empty, blocks: [
    block('b1', 'hero', 0, { title: '森の紙もの便', cta: '紙を取り寄せる' }), block('b2', 'menu', 0),
    block('b3', 'proof', 0), block('b4', 'limited', 1, { real: true }), block('b5', 'faq', 0),
    block('b6', 'form', 0, { submit: '紙を取り寄せる' }),
  ] };
  const complete = diagnose(all);
  assert.equal(complete.total, 15);
  assert.equal(complete.passed, 15);
  assert.equal(complete.score, 100);
  assert.deepEqual(new Set(complete.items.map(i => i.id)), new Set(examples.map(e => e.id)));
  for (const state of [empty, MINIMAL, RESERVE_SAMPLE, STRESS, ...GOALS.map(buildFromRecipe)]) {
    const r = diagnose(state);
    const satisfied = r.items.filter(i => i.ok);
    const weight = items => items.reduce((sum, i) => sum + LEVEL_WEIGHT[i.level], 0);
    assert.equal(r.total, r.items.length);
    assert.equal(r.passed, satisfied.length);
    assert.equal(r.score, state.blocks.length ? Math.round(100 * weight(satisfied) / weight(r.items)) : 0);
    assert.deepEqual(r.stages, stageCoverage(state));
    assert.equal(r.stages.reduce((sum, s) => sum + s.count, 0), state.blocks.length);
    for (const s of r.stages) {
      assert.equal(s.ok, s.count > 0);
      assert.equal(s.label, STAGE_LABEL[s.key]);
    }
  }
});

test('段階がいくつ欠けても一手でそろい、既存の部品と編集内容を保つ', () => {
  for (const state of [reserve('menu'), MINIMAL, reserve('form', 'footer'), reserve('limited')]) {
    const before = stageCoverage(state);
    const after = applyFix(state, 'flow-complete');
    const added = after.blocks.filter(b => !state.blocks.some(old => old.id === b.id));
    const byStage = { notice: 'hero', understand: 'benefits', trust: 'voices', act: 'cta', relief: 'faq' };
    assert.deepEqual(added.map(b => b.type).sort(), before.filter(s => !s.ok).map(s => byStage[s.key]).sort());
    assert.deepEqual(after.blocks.filter(b => state.blocks.some(old => old.id === b.id)), state.blocks);
  }
  const missingHero = reserve('pain', 'cta', 'footer');
  assert.equal(applyFix(missingHero, 'hero-first').blocks[0].type, 'hero');
  const displaced = reserve('menu', 'hero', 'faq');
  assert.equal(applyFix(displaced, 'hero-first').blocks[0].id, displaced.blocks[1].id);
});

test('期限と人数は受付の記録を見て一つずつ確認し、ほかの修正では印が付かない', () => {
  const state = reserve('limited', 'hero', 'limited', 'limited');
  state.blocks[2].props.real = true;
  const original = structuredClone(state);
  let confirmed = state;
  for (const index of [0, 3]) {
    const item = itemOf(confirmed, 'honest-limited');
    assert.equal(item.ok, false);
    assert.equal(item.blockId, state.blocks[index].id);
    assert.equal(Object.hasOwn(item, 'fix'), false);
    assert.match(item.note, /受付の記録.*編集欄.*本当の数字です/u);
    confirmed = reduce(confirmed, { type: 'setProp', id: item.blockId, path: ['real'], value: true });
    assert.deepEqual(validateState(confirmed), []);
  }
  assert.equal(itemOf(confirmed, 'honest-limited').ok, true);
  assert.ok(diagnose(confirmed).score > diagnose(state).score);
  assert.deepEqual(undo(commit(createHistory(state), confirmed)).present, original);
  assert.deepEqual(state, original);
  assert.deepEqual(confirmed.blocks, state.blocks.map(b =>
    b.type === 'limited' ? { ...b, props: { ...b.props, real: true } } : b));
  for (const item of diagnose(state).items.filter(i => i.fix)) {
    const after = reduce(state, item.fix.action);
    assert.deepEqual(after.blocks.filter(b => b.type === 'limited'), state.blocks.filter(b => b.type === 'limited'));
  }
});

test('複数のフォームを一手で4欄までに縮め、それぞれの先頭4欄を保つ', () => {
  const state = reserve('form', 'cta', 'form', 'form');
  for (const [index, count] of [[0, 6], [2, 5], [3, 2]]) {
    state.blocks[index].props.items = Array.from({ length: count }, (_, i) => ({ label: `窓口${index}の欄${i + 1}` }));
  }
  const after = applyFix(state, 'form-short');
  assert.deepEqual(after.blocks, state.blocks.map(b =>
    b.type === 'form' ? { ...b, props: { ...b.props, items: b.props.items.slice(0, 4) } } : b));
});

test('目的、最初と最後の手続き、下部の境目で適用条件を切り替える', () => {
  for (const goal of GOALS) {
    const s = page(goal, 'hero', 'menu', 'proof', 'cta', 'faq', 'form');
    assert.equal(Boolean(itemOf(s, 'price-before-action')), ['reserve', 'buy', 'event', 'visit'].includes(goal));
    assert.equal(Boolean(itemOf(s, 'faq-before-last-action')), ['reserve', 'buy', 'apply', 'signup', 'support'].includes(goal));
    assert.equal(itemOf(page(goal, 'limited'), 'price-before-action'), undefined);
    assert.equal(itemOf(page(goal, 'limited'), 'faq-before-last-action'), undefined);
  }
  const six = reserve('hero', 'benefits', 'voices', 'cta', 'faq', 'footer');
  assert.equal(itemOf(six, 'action-reachable-again').ok, false);
  const atBoundary = reduce(six, { type: 'moveBlock', id: six.blocks[3].id, to: 4 });
  assert.equal(itemOf(atBoundary, 'action-reachable-again').ok, true);
  assert.equal(itemOf(reduce(atBoundary, { type: 'addBlock', blockType: 'footer', index: 6 }), 'action-reachable-again').ok, true);
  assert.equal(itemOf(prop(six, 'hero', 'cta', '　'), 'action-reachable-again'), undefined);
  assert.equal(itemOf(reserve('menu', 'proof', 'cta', 'faq', 'access', 'footer'), 'action-reachable-again'), undefined);
});

test('ボタン名の空欄・総称・表記ゆれを検出し、空欄は呼び方の種類に含めない', () => {
  for (const label of ['', '　 ', '送信', 'こちら', '詳細', '詳しくはこちら', 'クリック', 'ＯＫ', 'Submit', ' submit ']) {
    const s = prop(booking, 'form', 'submit', label);
    const vague = itemOf(s, 'button-label-result');
    assert.equal(vague.ok, false, label);
    assert.equal(vague.blockId, s.blocks.find(b => b.type === 'form').id);
  }
  assert.equal(itemOf(prop(threeLabels, 'hero', 'cta', '　'), 'button-label-consistent').ok, true);
  assert.equal(itemOf(prop(booking, 'hero', 'cta', '料金の詳細を見る'), 'button-label-result').ok, true);
});

test('文章照合は目的の既定値と完全一致する文字列だけを拾う', () => {
  assert.equal(itemOf({ ...loneSample, goal: 'reserve' }, 'replace-samples').ok, true);
  const longer = reduce(loneSample, { type: 'setProp', id: 'b1', path: ['items', 1, 'q'], value: '質問：' + copiedQuestion });
  assert.equal(itemOf(longer, 'replace-samples').ok, true);
  assert.equal(itemOf({ ...empty, blocks: [block('b1', 'limited', 0, { real: true })] }, 'replace-samples').ok, true);
});

test('空きがないときは既存の部品を使い、無関係な部品を消す修正を出さない', () => {
  const full = reserve('hero', 'cta', 'schedule', 'pain', 'benefits', 'menu', 'proof', 'team', 'guarantee',
    'steps', 'access', 'faq', 'story', 'plans', 'compare', 'voices', 'schedule', 'footer');
  assert.equal(full.blocks.length, MAX_BLOCKS);
  for (const id of ['trust-before-action', 'price-before-action', 'faq-before-last-action', 'action-reachable-again']) {
    assert.equal(itemOf(full, id).fix?.action.type, 'moveBlock', id);
    const moved = applyFix(full, id);
    assert.deepEqual(new Set(moved.blocks.map(b => b.id)), new Set(full.blocks.map(b => b.id)));
    for (const b of full.blocks) assert.deepEqual(moved.blocks.find(other => other.id === b.id), b);
  }
  const onlyHeadings = reserve(...Array(MAX_BLOCKS).fill('hero'));
  for (const id of ['flow-complete', 'has-action', 'action-reachable-again']) {
    assert.equal(itemOf(onlyHeadings, id).fix, undefined);
    assert.match(itemOf(onlyHeadings, id).note, /空き/u);
  }
  const oneSpace = reserve(...Array(MAX_BLOCKS - 1).fill('pain'));
  assert.equal(itemOf(oneSpace, 'flow-complete').fix, undefined);
  assert.match(itemOf(oneSpace, 'flow-complete').note, /空き/u);
});

test('12部品で質問を足す利点と長さの減点が相殺する場合、その場で理由がわかる', () => {
  const state = page('buy', 'hero', 'benefits', 'compare', 'voices', 'menu', 'guarantee', 'proof', 'story', 'team', 'steps', 'cta', 'footer');
  const extra = reduce(state, { type: 'addBlock', blockType: 'faq', index: 10 });
  assert.equal(itemOf(extra, 'faq-before-last-action').ok, true);
  assert.equal(itemOf(extra, 'not-too-long').ok, false);
  assert.equal(diagnose(state).score, diagnose(extra).score);
  const item = itemOf(state, 'faq-before-last-action');
  assert.equal(item.fix, undefined);
  assert.match(item.note, /合計点/u);
});

test('初めてのボタンや見出しが別の項目を呼び込む場合も、一手で点が上がる', () => {
  const bare = reserve('hero', 'compare', 'benefits', 'hero');
  const button = applyFix(bare, 'has-action');
  assert.ok(button.blocks.some(b => b.type === 'cta'));
  assert.match(itemOf(bare, 'has-action').fix.label, /声|料金/u);
  const noHeading = reserve('plans', 'menu', 'form', 'faq', 'pain', 'schedule', 'cta', 'access', 'footer', 'pain', 'steps', 'schedule');
  const headed = applyFix(noHeading, 'hero-first');
  assert.equal(headed.blocks[0].type, 'hero');
});

test('共有ページの最大桁のIDを保持したまま、足す部品にも有効なIDが付く', () => {
  const state = structuredClone(MINIMAL);
  state.blocks[0].id = 'b99999999999';
  assert.deepEqual(validateState(state), []);
  for (const id of ['has-action', 'flow-complete']) {
    const next = applyFix(state, id);
    assert.deepEqual(next.blocks.find(b => b.id === state.blocks[0].id), state.blocks[0]);
  }
});

test('組み替えた300ページで、表示した各修正が対象を満たし、総合点も上がる', () => {
  let seed = 9602;
  function pick(limit) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 4294967296 * limit);
  }
  const exercised = new Set();
  for (let run = 0; run < 300; run++) {
    const goal = GOALS[pick(GOALS.length)];
    const types = Array.from({ length: pick(MAX_BLOCKS + 1) }, () => BLOCK_TYPES[pick(BLOCK_TYPES.length)]);
    const state = page(goal, ...types);
    for (const b of state.blocks) {
      if (b.type === 'limited') b.props.real = Boolean(pick(2));
      if (b.type === 'form') b.props.items = Array.from({ length: pick(6) + 1 }, (_, i) => ({ label: `控え${i + 1}` }));
      if (b.type === 'hero' && pick(3) === 0) b.props.cta = '';
    }
    const original = structuredClone(state);
    const before = diagnose(state);
    for (const item of before.items.filter(i => i.fix)) {
      exercised.add(item.id);
      const next = reduce(state, item.fix.action);
      const after = diagnose(next);
      assert.deepEqual(validateState(next), [], `${run} / ${item.id}`);
      assert.equal(after.items.find(i => i.id === item.id)?.ok, true, item.id);
      assert.ok(after.score > before.score, `${run} / ${item.id}`);
      assert.ok(state.blocks.every(b => next.blocks.some(other => other.id === b.id)), item.id);
    }
    assert.deepEqual(state, original);
  }
  assert.deepEqual(exercised, new Set(examples.filter(e => !e.edit).map(e => e.id)));
});
