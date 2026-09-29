import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, TYPE_LABELS, classify, displayName, exclusionReason } from '../lib/classify.js';

test('classify: bath:type の記載があればそれに従う（根拠は tag）', () => {
  assert.deepEqual(classify({ 'bath:type': 'onsen' }), { type: 'onsen', how: 'tag' });
  assert.deepEqual(classify({ 'bath:type': 'hot_spring' }), { type: 'onsen', how: 'tag' });
  assert.deepEqual(classify({ 'bath:type': 'thermal' }), { type: 'onsen', how: 'tag' });
  assert.deepEqual(classify({ 'bath:type': 'sento' }), { type: 'sento', how: 'tag' });
  assert.deepEqual(classify({ 'bath:type': 'super_sento' }), { type: 'super', how: 'tag' });
  assert.deepEqual(classify({ 'bath:type': 'foot_bath' }), { type: 'foot', how: 'tag' });
  assert.deepEqual(classify({ 'bath:type': 'hand_bath' }), { type: 'foot', how: 'tag' });
});

test('classify: ; でつながった値は先頭から見て、知っている値を採る', () => {
  assert.deepEqual(classify({ 'bath:type': 'foot_bath;hand_bath' }), { type: 'foot', how: 'tag' });
  assert.deepEqual(classify({ 'bath:type': 'unknown; onsen' }), { type: 'onsen', how: 'tag' });
  // 知らない値だけなら名前へ落ちる
  assert.deepEqual(classify({ 'bath:type': 'public', name: '〇〇温泉' }), { type: 'onsen', how: 'name' });
});

test('classify: 記載が無ければ名前から判断する（根拠は name）', () => {
  assert.deepEqual(classify({ name: '駅前足湯' }), { type: 'foot', how: 'name' });
  assert.deepEqual(classify({ name: '湯けむり手湯' }), { type: 'foot', how: 'name' });
  assert.deepEqual(classify({ name: 'スーパー銭湯 湯の華' }), { type: 'super', how: 'name' });
  assert.deepEqual(classify({ name: '〇〇健康ランド' }), { type: 'super', how: 'name' });
  assert.deepEqual(classify({ name: 'ホテル〇〇スパ' }), { type: 'super', how: 'name' });
  assert.deepEqual(classify({ name: '昭和銭湯' }), { type: 'sento', how: 'name' });
  assert.deepEqual(classify({ name: '乳頭温泉' }), { type: 'onsen', how: 'name' });
  assert.deepEqual(classify({ name: '〇〇源泉' }), { type: 'onsen', how: 'name' });
  // 「足湯」は「温泉」より先に見る（足湯つきの温泉地の名前でも足湯にする）
  assert.deepEqual(classify({ name: '温泉足湯' }), { type: 'foot', how: 'name' });
});

test('classify: 「〇〇湯」だけでは銭湯と決めない（判断できず＝other/none）', () => {
  assert.deepEqual(classify({ name: '鶴の湯' }), { type: 'other', how: 'none' });
  assert.deepEqual(classify({ name: '金春湯' }), { type: 'other', how: 'none' });
  assert.deepEqual(classify({}), { type: 'other', how: 'none' });
});

test('displayName: name:ja を優先し、; は「・」でつなぐ', () => {
  assert.equal(displayName({ name: 'Onsen', 'name:ja': '温泉' }), '温泉');
  assert.equal(displayName({ name: '木浦名水館;唄げんかの湯' }), '木浦名水館・唄げんかの湯');
  assert.equal(displayName({ name: ' A ; ; B ' }), 'A・B');
  assert.equal(displayName({}), '');
});

test('exclusionReason: 私用と閉業の印があるものは外す', () => {
  assert.equal(exclusionReason({ access: 'private' }), 'access');
  assert.equal(exclusionReason({ access: 'no' }), 'access');
  assert.equal(exclusionReason({ access: 'customers' }), null);
  assert.equal(exclusionReason({ disused: 'yes' }), 'disused');
  assert.equal(exclusionReason({ abandoned: 'yes' }), 'disused');
  assert.equal(exclusionReason({ 'disused:amenity': 'public_bath' }), 'disused');
  assert.equal(exclusionReason({ 'abandoned:amenity': 'public_bath' }), 'disused');
  assert.equal(exclusionReason({}), null);
});

test('TYPE_LABELS: 5種類そろい、判断できないものは「種類の登録なし」と書く', () => {
  assert.deepEqual(TYPES, ['onsen', 'sento', 'super', 'foot', 'other']);
  assert.deepEqual(Object.keys(TYPE_LABELS), TYPES);
  assert.equal(TYPE_LABELS.other, '種類の登録なし');
});
