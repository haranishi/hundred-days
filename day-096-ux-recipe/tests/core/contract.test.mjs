// 契約（lib/contract.js）の試験。親の担当。担当者は消さない・直さない（直したいときは親へ報告）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCENTS, BLOCK_SCHEMA, BLOCK_TYPES, EFFECTS, GOALS, MAX_BLOCKS, SCHEMA_VERSION, STAGES, STAGE_COLORS, THEMES,
  blankProps, clampText, getPath, isBlockType, nextBlockId, resolveField, sanitizeProps, sanitizeState, setPath, validateState,
} from '../../lib/contract.js';
import { MINIMAL, RESERVE_SAMPLE, STRESS, block, emptyProps, maxProps, oneEach } from '../fixtures/states.js';

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastWhite = (hex) => 1.05 / (lum(hex) + 0.05);

test('強調色は、白い文字を載せても 4.5:1 以上', () => {
  for (const a of ACCENTS) assert.ok(contrastWhite(a.hex) >= 4.5, `${a.key}: ${contrastWhite(a.hex).toFixed(2)}`);
});

test('段階の色: 薄い地の上の文字が 4.5:1 以上・5段階すべてに色と記号がある', () => {
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  for (const stage of STAGES) {
    const c = STAGE_COLORS[stage];
    assert.ok(c && c.glyph.length === 1, stage);
    assert.ok(ratio(c.ink, c.soft) >= 4.5, `${stage}: ${ratio(c.ink, c.soft).toFixed(2)}`);
  }
});

test('項目表の自己点検: 段階・効果・バリエーション・項目の形', () => {
  assert.equal(BLOCK_TYPES.length, Object.keys(BLOCK_SCHEMA).length);
  const roles = new Set(['button', 'headline', 'price']);
  const check = (fields, where) => {
    const keys = new Set();
    for (const f of fields) {
      assert.ok(!keys.has(f.key), `${where}: ${f.key} が重複`);
      keys.add(f.key);
      assert.ok(['text', 'long', 'check', 'list'].includes(f.kind), `${where}.${f.key}: kind`);
      assert.ok(f.label, `${where}.${f.key}: label`);
      if (f.role) assert.ok(roles.has(f.role), `${where}.${f.key}: role`);
      if (f.kind === 'text' || f.kind === 'long') assert.ok(Number.isInteger(f.max) && f.max > 0, `${where}.${f.key}: max`);
      if (f.kind === 'list') {
        assert.ok(f.min >= 0 && f.max >= f.min && f.max <= 8, `${where}.${f.key}: 件数`);
        assert.ok(f.item.length > 0 && f.item.every((g) => g.kind !== 'list'), `${where}.${f.key}: 入れ子の list は使わない`);
        check(f.item, `${where}.${f.key}[]`);
      }
    }
  };
  for (const type of BLOCK_TYPES) {
    const def = BLOCK_SCHEMA[type];
    assert.ok(STAGES.includes(def.stage) && EFFECTS.includes(def.effect), type);
    assert.ok(def.variants.length >= 1 && def.label, type);
    check(def.fields, type);
  }
  for (const stage of STAGES) assert.ok(BLOCK_TYPES.some((t) => BLOCK_SCHEMA[t].stage === stage), `${stage} の部品がある`);
  for (const effect of EFFECTS) assert.ok(BLOCK_TYPES.some((t) => BLOCK_SCHEMA[t].effect === effect), `${effect} の部品がある`);
});

test('共通の見本データは、契約どおり', () => {
  for (const [name, state] of Object.entries({ MINIMAL, RESERVE_SAMPLE, STRESS })) assert.deepEqual(validateState(state), [], name);
  assert.ok(STRESS.blocks.length <= MAX_BLOCKS);
  for (const type of BLOCK_TYPES) for (let v = 0; v < BLOCK_SCHEMA[type].variants.length; v += 1) assert.deepEqual(validateState(oneEach(type, v)), [], `${type}/${v}`);
});

test('空の中身・最小の中身・最大の中身が、すべての部品で正しい', () => {
  for (const type of BLOCK_TYPES) {
    for (const props of [blankProps(type), emptyProps(type), maxProps(type)]) {
      const state = { v: SCHEMA_VERSION, goal: 'buy', site: { name: '' }, theme: { preset: 'soft', accent: 0 }, blocks: [{ id: 'b1', type, variant: 0, props }] };
      assert.deepEqual(validateState(state), [], type);
    }
  }
});

test('validateState は、壊れた状態を見つける', () => {
  const bad = (mutate) => { const s = structuredClone(RESERVE_SAMPLE); mutate(s); return validateState(s); };
  assert.ok(bad((s) => { s.goal = 'x'; }).length);
  assert.ok(bad((s) => { s.theme.accent = 99; }).length);
  assert.ok(bad((s) => { s.blocks[0].type = 'nope'; }).length);
  assert.ok(bad((s) => { s.blocks[0].variant = 9; }).length);
  assert.ok(bad((s) => { s.blocks[1].id = s.blocks[0].id; }).length);
  assert.ok(bad((s) => { s.blocks[0].props.title = 'あ'.repeat(33); }).length);
  assert.ok(bad((s) => { s.blocks[0].props.extra = 'x'; }).length);
  assert.ok(bad((s) => { s.blocks[2].props.items.length = 1; }).length);
  assert.ok(bad((s) => { s.blocks[0].props.title = 'a\u0000b'; }).length);
  assert.ok(bad((s) => { s.blocks[0].props.title = 'a\nb'; }).length, '1行の項目に改行は不可');
  assert.ok(validateState(null).length && validateState([]).length);
});

test('clampText: 制御文字・向きを変える文字を除き、文字数（コードポイント）で切る', () => {
  assert.equal(clampText('a\u0000b‮c', 10), 'abc');
  assert.equal(clampText('一行\n二行', 10), '一行 二行');
  assert.equal(clampText('一行\r\n二行\n\n\n\n三行', 40, true), '一行\n二行\n\n三行');
  assert.equal(clampText('😀😀😀', 2), '😀😀');
  assert.equal(clampText(null, 5), '');
  assert.equal(clampText({ a: 1 }, 5), '');
  assert.equal(clampText(12345, 3), '123');
  assert.equal(clampText('<script>alert(1)</script>', 100), '<script>alert(1)</script>'); // 文字はそのまま。無害化は描画側の esc の仕事
});

test('sanitizeState: 壊れた入力から、契約どおりの状態を作る', () => {
  assert.equal(sanitizeState(null), null);
  assert.equal(sanitizeState({ goal: 'x' }), null);
  const dirty = JSON.parse('{"goal":"buy","site":{"name":"' + 'あ'.repeat(40) + '"},"theme":{"preset":"zzz","accent":-1},"blocks":[{"id":"b1","type":"hero","variant":99,"props":{"title":"' + 'x'.repeat(100) + '","__proto__":{"polluted":1},"evil":"y"}},{"type":"nope"},{"id":"b1","type":"cta","variant":0,"props":{}}]}');
  const s = sanitizeState(dirty);
  assert.deepEqual(validateState(s), []);
  assert.equal(s.blocks.length, 2);
  assert.notEqual(s.blocks[0].id, s.blocks[1].id);
  assert.equal(s.blocks[0].variant, 0);
  assert.equal(s.blocks[0].props.title.length, 32);
  assert.equal(s.theme.preset, 'soft');
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(s.blocks[0].props, 'evil'), false);
  for (const sample of [MINIMAL, RESERVE_SAMPLE, STRESS]) assert.deepEqual(sanitizeState(structuredClone(sample)), sample);
  const many = { goal: 'buy', blocks: Array.from({ length: 40 }, (_, i) => ({ id: `b${i + 1}`, type: 'cta' })) };
  assert.equal(sanitizeState(many).blocks.length, MAX_BLOCKS);
});

test('項目の道具: resolveField・getPath・setPath・nextBlockId・sanitizeProps', () => {
  assert.equal(resolveField('hero', ['title']).max, 32);
  assert.equal(resolveField('benefits', ['items', 1, 'title']).max, 16);
  assert.equal(resolveField('benefits', ['items']).kind, 'list');
  assert.equal(resolveField('plans', ['items', 0, 'pick']).kind, 'check');
  assert.equal(resolveField('hero', ['nope']), null);
  assert.equal(resolveField('benefits', ['items', 'title']), null);
  assert.equal(resolveField('hero', ['title', 0]), null);
  const props = RESERVE_SAMPLE.blocks[2].props;
  assert.equal(getPath(props, ['items', 1, 'title']), '痛くしない');
  const next = setPath(props, ['items', 1, 'title'], '変えた');
  assert.equal(getPath(next, ['items', 1, 'title']), '変えた');
  assert.equal(getPath(props, ['items', 1, 'title']), '痛くしない', '元は変わらない');
  assert.equal(next.items[0], props.items[0], '触っていない所は同じ物を使い回す');
  assert.equal(nextBlockId([{ id: 'b1' }, { id: 'b7' }, { id: 'x' }]), 'b8');
  assert.equal(nextBlockId([]), 'b1');
  assert.deepEqual(sanitizeProps('faq', { items: [{ q: 'a' }] }).items.length, 2, '最小件数まで補う');
  assert.equal(block('b1', 'hero', 0, { title: '見出し' }).props.cta, '');
});

test('部品の種類は、自分の持つ名前だけ（constructor・__proto__・toString などを拾わない）', () => {
  for (const evil of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(isBlockType(evil), false, evil);
    assert.equal(resolveField(evil, ['title']), null, evil);
    assert.ok(validateState({ ...MINIMAL, blocks: [{ id: 'b1', type: evil, variant: 0, props: {} }] }).length, evil);
    const s = sanitizeState({ goal: 'buy', blocks: [{ id: 'b1', type: evil }, { id: 'b2', type: 'cta' }] });
    assert.equal(s.blocks.length, 1, `${evil} は捨てる`);
  }
  assert.equal(isBlockType('hero'), true);
});

test('採番: 12字を超えない。番号が大きすぎるときは、空いている最小の番号', () => {
  assert.equal(nextBlockId([{ id: 'b99999999999' }]), 'b1');
  assert.equal(nextBlockId([{ id: 'b99999999999' }, { id: 'b1' }, { id: 'b2' }]), 'b3');
  assert.ok(nextBlockId([{ id: 'b9999999999' }]).length <= 12);
});

test('疎配列（空の要素）と site.name の制御文字を、検証が見逃さない', () => {
  const sparse = { ...structuredClone(MINIMAL), blocks: [{ id: 'b1', type: 'pain', variant: 0, props: { heading: '', lead: '', items: new Array(2) } }] };
  assert.ok(validateState(sparse).length, '疎配列は不正');
  const clean = sanitizeState({ goal: 'buy', blocks: [{ id: 'b1', type: 'pain', props: { items: new Array(3) } }] });
  assert.deepEqual(validateState(clean), []);
  assert.ok(clean.blocks[0].props.items.every((it) => it && typeof it.text === 'string'), '空の要素は、空の項目に作り直す');
  for (const name of ['a\u0000b', 'a\u202Eb', 'a\nb']) assert.ok(validateState({ ...structuredClone(MINIMAL), site: { name } }).length, JSON.stringify(name));
});

test('目的・テーマ・バージョンの一覧', () => {
  assert.equal(GOALS.length, 8);
  assert.equal(THEMES.length, 4);
  assert.equal(SCHEMA_VERSION, 1);
});
