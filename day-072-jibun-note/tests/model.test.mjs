import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, normalizeData, validateStep, firstIncomplete, buildReport, reportText, encodeSnapshot, decodeSnapshot, hasContent, EXAMPLE, LIMITS, STORAGE_KEY } from '../lib/model.js';
import { readSaved, writeSaved, removeSaved } from '../lib/storage.js';

const sample = () => structuredClone(EXAMPLE);
const state = () => ({ data: sample(), step: 3, screen: 'result', demo: false });

test('an empty or whitespace-only experience cannot produce a result', () => {
  assert.equal(buildReport(emptyData()), null);
  assert.equal(firstIncomplete(emptyData('work')), 0);
  assert.ok(validateStep({ ...sample(), action: ' \n ' }, 1).action);
});
test('each step reports its actual missing field and accepts an unfinished outcome', () => {
  for (const [field, step] of [['title', 0], ['situation', 0], ['challenge', 1], ['action', 1], ['result', 2], ['reason', 3]]) {
    const data = { ...sample(), [field]: '' };
    assert.ok(validateStep(data, step)[field]);
    assert.equal(buildReport(data), null);
  }
  assert.ok(buildReport({ ...sample(), result: 'まだ変化はなく、試している途中です。', learning: '' }));
});
test('results follow the selected actions, never infer a talent from input keywords', () => {
  const data = { ...sample(), action: 'リーダーとして大成功、と書いても診断はしない。', behaviors: ['listen'] };
  const result = buildReport(data);
  assert.deepEqual(result.strengths.map(item => item.id), ['listen']);
  assert.equal(result.data.action, data.action);
  assert.equal(result.values[0].id, data.values[0]);
  assert.ok(result.questions.some(item => item.kind === '企業選び・面接で確かめる'));
});
test('selection normalization removes unknown IDs, duplicates and excessive picks', () => {
  const data = normalizeData({ ...sample(), behaviors: ['listen', 'listen', 'missing', 'plan', 'learn'], values: ['missing', 'growth'] });
  assert.deepEqual(data.behaviors, ['listen', 'plan']);
  assert.deepEqual(data.values, ['growth']);
  assert.ok(validateStep({ ...sample(), behaviors: [] }, 3).behaviors);
  assert.ok(validateStep({ ...sample(), values: [] }, 3).values);
});
test('field length boundaries hold without cutting user content silently', () => {
  for (const [field, max] of Object.entries(LIMITS)) {
    assert.ok(normalizeData({ ...sample(), [field]: 'あ'.repeat(max) }));
    assert.equal(normalizeData({ ...sample(), [field]: 'あ'.repeat(max + 1) }), null);
  }
  assert.equal(normalizeData({ ...sample(), action: { toString: 'unsafe' } }), null);
  assert.equal(normalizeData([]), null);
});
test('unknown properties do not reach persistence or reports', () => {
  const encoded = encodeSnapshot({ ...state(), api: 'unexpected', data: { ...sample(), hidden: 'unexpected' } });
  assert.equal(encoded.includes('unexpected'), false);
  assert.equal(normalizeData({ ...sample(), context: 'missing' }).context, '');
});
test('plain text keeps the exact submitted evidence and omits unentered achievements', () => {
  const data = { ...sample(), title: '<img src=x onerror=alert(1)>', action: '売上や順位は測っていません。', result: '感想を聞いている途中です。', learning: '' };
  const text = reportText(data);
  assert.ok(text.includes(data.title));
  assert.ok(text.includes(data.action));
  assert.ok(text.includes(data.result));
  assert.equal(text.includes('【次に試したいこと・学んだこと】'), false);
  assert.equal(reportText(emptyData()), '');
});
test('all four steps and a completed result round-trip through storage', () => {
  for (let step = 0; step < 4; step++) {
    const current = { data: sample(), step, screen: 'work', demo: true };
    assert.deepEqual(decodeSnapshot(encodeSnapshot(current)), current);
  }
  assert.deepEqual(decodeSnapshot(encodeSnapshot(state())), state());
});
test('corrupt, oversized, incompatible and malicious-shaped snapshots are rejected', () => {
  for (const raw of ['{broken', 'null', '[]', '{}', JSON.stringify({ version: 2, data: sample() }), 'x'.repeat(32769), JSON.stringify({ version: 1, data: { ...sample(), action: [] } })]) assert.equal(decodeSnapshot(raw), null);
  const restored = decodeSnapshot(encodeSnapshot({ data: emptyData('work'), step: 0, screen: 'result' }));
  assert.equal(restored.screen, 'work');
  assert.equal(decodeSnapshot(JSON.stringify({ version: 1, data: sample(), step: -10, screen: 'invalid' })).step, 0);
});
test('storage failure is observable and never deletes other apps', () => {
  const values = new Map([['another-app', 'keep']]);
  const memory = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  assert.deepEqual(readSaved(memory), { ok: true, state: null });
  assert.equal(writeSaved(memory, state()).ok, true);
  assert.deepEqual(readSaved(memory).state, state());
  assert.equal(removeSaved(memory).ok, true);
  assert.equal(values.get('another-app'), 'keep');
  assert.equal(values.has(STORAGE_KEY), false);
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('denied'); } };
  assert.equal(readSaved(denied).ok, false);
  assert.equal(writeSaved(denied, state()).ok, false);
  assert.equal(removeSaved(denied).ok, false);
  memory.setItem(STORAGE_KEY, 'corrupt');
  assert.equal(readSaved(memory).kind, 'corrupt');
});
test('choosing a context alone does not count as a written experience', () => {
  assert.equal(hasContent(emptyData('work')), false);
  assert.equal(hasContent(sample()), true);
});
