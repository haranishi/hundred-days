import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, parseMoney, moneyText, chargeSummary, subtotalText, comparisonNote, questions,
  issues, memoText, decodeDraft, encodeDraft, CHARGES, DOCUMENTS, hasInput, documentGroups } from '../lib/model.js';

for (const [raw, expected] of [['0', 0], ['120000', 120000], ['１２３，４５６', 123456], [' 500 ', 500], ['999,999,999', 999999999], ['000', 0]]) {
  test(`金額を整数として読む：${raw}`, () => assert.deepEqual(parseMoney(raw), { kind: 'known', value: expected }));
}
for (const raw of ['', ' ', '　']) test('未入力は0円ではない', () => assert.deepEqual(parseMoney(raw), { kind: 'unknown', value: null }));
for (const raw of ['-1', '+1', '1.5', '1e4', '1,2', '12,34,567', '1000000000', 'NaN', 'Infinity', '500円', '<script>', '1'.repeat(21), null]) {
  test(`不正な金額を受理しない：${raw}`, () => assert.equal(parseMoney(raw).kind, 'invalid'));
}
test('金額の表示は未入力・0・エラーを分ける', () => {
  assert.equal(moneyText(''), '不明・未入力'); assert.equal(moneyText('0'), '0円'); assert.equal(moneyText('-3'), '入力を確認');
});
test('初期データ同士は参照を共有しない', () => {
  const a = emptyData(); const b = emptyData(); a.charges.wall.selected = true; assert.equal(b.charges.wall.selected, false);
  assert.equal(hasInput(b), false); assert.equal(hasInput(a), true);
});
test('何も選んでいない合計は0円ではない', () => {
  assert.equal(chargeSummary(emptyData()).total, null); assert.equal(subtotalText(emptyData()), '内訳は未入力です');
});
test('金額不明の項目は部分合計であると表示する', () => {
  const d = emptyData(); d.charges.wall = { selected: true, amount: '50000' }; d.charges.floor.selected = true;
  assert.deepEqual(chargeSummary(d), { count: 2, known: 1, unknown: 1, invalid: false, total: 50000 });
  assert.match(subtotalText(d), /わかる分の小計 50,000円.*金額不明 1項目/);
  d.invoice = '100000'; assert.equal(comparisonNote(d), '');
});
test('選んだ全項目が不明なら小計0円を表示しない', () => {
  const d = emptyData(); d.charges.wall.selected = true;
  assert.match(subtotalText(d), /金額は不明/); assert.equal(chargeSummary(d).total, null);
});
test('不正金額は合計に含めずメモ出力も防ぐ', () => {
  const d = emptyData(); d.charges.wall = { selected: true, amount: '-5000' };
  assert.equal(issues(d)[0].id, 'amount-wall'); assert.match(subtotalText(d), /確認/); assert.throws(() => memoText(d));
});
test('非選択項目の以前の値は出力・検証対象にしない', () => {
  const d = emptyData(); d.charges.wall.amount = '-5000';
  assert.equal(issues(d).length, 0); assert.doesNotMatch(memoText(d), /-5000/);
});
test('合計の差は確認事項であり適正額・過剰請求を判断しない', () => {
  const d = emptyData(); d.invoice = '120000'; d.deposit = '60000';
  d.charges.wall = { selected: true, amount: '50000' };
  assert.match(comparisonNote(d), /異なります/); assert.match(memoText(d), /敷金.*60,000円/);
  assert.match(memoText(d), /120,000円/); assert.doesNotMatch(memoText(d), /過剰請求|支払うべき|返金額/);
  d.charges.wall.amount = '120000'; assert.equal(comparisonNote(d), '');
});
test('請求額0円にも合計の差を表示する', () => {
  const d = emptyData(); d.invoice = '0'; d.charges.key = { selected: true, amount: '5000' }; assert.ok(comparisonNote(d));
});
test('最大7費目の合計は安全な整数', () => {
  const d = emptyData(); for (const [id] of CHARGES) d.charges[id] = { selected: true, amount: '999999999' };
  assert.equal(chargeSummary(d).total, 6999999993); assert.ok(Number.isSafeInteger(chargeSummary(d).total));
});
test('選択した関心だけから、質問を組み立てる', () => {
  const d = emptyData(); d.concerns = ['deposit', 'contract'];
  assert.equal(questions(d).length, 2); assert.match(questions(d).join(), /敷金/); assert.match(questions(d).join(), /特約/);
});
test('未確認とないを分け、書類が揃うことを相談条件にしない', () => {
  const d = emptyData(); d.documents.contract = 'have'; d.documents.invoice = 'missing';
  const groups = documentGroups(d); assert.equal(groups.find((g) => g.status === 'unknown').items.length, DOCUMENTS.length - 2);
  const text = memoText(d); assert.match(text, /ない：請求書/); assert.match(text, /未確認：入居時/); assert.match(text, /揃っていなくても/);
});
test('空でも使えるメモと公式窓口の案内がある', () => {
  const text = memoText(emptyData()); assert.match(text, /188/); assert.match(text, /通話料/); assert.match(text, /https:\/\/www.kokusen.go.jp\/map\//);
});
test('保存と復元は同じ内容で往復する', () => {
  const d = emptyData(); d.invoice = '５０００'; d.concerns = ['reply']; d.documents.exit = 'have';
  assert.deepEqual(decodeDraft(encodeDraft(d)), d);
});
for (const raw of ['{}', 'null', '{', '{"version":2}', 'x'.repeat(8001)]) test('壊れた保存を受理しない', () => assert.throws(() => decodeDraft(raw)));
test('未知の項目を復元・出力しない', () => {
  const d = emptyData(); d.unrecognized = 'NOT-FOR-EXPORT';
  const restored = decodeDraft(encodeDraft(d)); assert.equal(restored.unrecognized, undefined); assert.doesNotMatch(memoText(restored), /NOT-FOR-EXPORT/);
});
test('保存データのHTMLや不正な選択肢を拒否する', () => {
  for (const mutate of [(d) => { d.invoice = '<img>'; }, (d) => { d.stage = 'unexpected'; }, (d) => { d.documents.entry = '__proto__'; }, (d) => { d.concerns = ['unknown']; }]) {
    const d = emptyData(); mutate(d); assert.throws(() => decodeDraft(encodeDraft(d)));
  }
});
