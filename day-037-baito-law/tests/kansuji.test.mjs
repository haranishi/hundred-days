import assert from 'node:assert/strict';
import test from 'node:test';
import { annotate, flatten, parseKansuji } from '../lib/kansuji.js';

const readings = (s) => annotate(s).filter((p) => p.type === 'ruby').map((p) => `${p.value}→${p.reading}`);

test('parseKansuji: 十の位・百の位・万の位', () => {
  assert.equal(parseKansuji('一'), 1);
  assert.equal(parseKansuji('十'), 10);
  assert.equal(parseKansuji('四十五'), 45);
  assert.equal(parseKansuji('二十二'), 22);
  assert.equal(parseKansuji('百三'), 103);
  assert.equal(parseKansuji('千二百'), 1200);
  assert.equal(parseKansuji('一万二千'), 12000);
  assert.equal(parseKansuji('〇'), 0);
});

test('parseKansuji: 漢数字でないものは null', () => {
  assert.equal(parseKansuji('使用者'), null);
  assert.equal(parseKansuji(''), null);
  assert.equal(parseKansuji('十五日'), null);
  assert.equal(parseKansuji(null), null);
});

test('単位が続く漢数字にだけルビを振る', () => {
  assert.deepEqual(readings('六箇月間継続勤務し'), ['六箇月→6か月']);
  assert.deepEqual(readings('全労働日の八割以上'), ['八割→8割']);
  assert.deepEqual(readings('十労働日の有給休暇'), ['十労働日→10労働日']);
  assert.deepEqual(readings('少くとも四十五分'), ['四十五分→45分']);
  assert.deepEqual(readings('午後十時から午前五時まで'), ['十時→10時', '五時→5時']);
  assert.deepEqual(readings('少くとも一時間の休憩'), ['一時間→1時間']);
  assert.deepEqual(readings('満十八才に満たない者'), ['十八才→18才']);
});

test('単位が続かない漢数字にはルビを振らない', () => {
  assert.deepEqual(readings('一般の法律事件'), []);
  assert.deepEqual(readings('その一部を'), []);
  assert.deepEqual(readings('一切の責任'), []);
  assert.deepEqual(readings('一定の場合'), []);
  assert.deepEqual(readings('使用者は'), []);
});

test('「十分」は続く字で数かどうかを見分ける', () => {
  /* じゅうぶん */
  assert.deepEqual(readings('十分な休養'), []);
  assert.deepEqual(readings('十分に配慮し'), []);
  /* 10分 */
  assert.deepEqual(readings('十分以上の休憩'), ['十分→10分']);
});

test('分数は分数として読む', () => {
  assert.deepEqual(readings('総額の十分の一'), ['十分の一→10分の1']);
  assert.deepEqual(readings('平均賃金の五分の一'), ['五分の一→5分の1']);
  assert.deepEqual(readings('百分の二十五'), ['百分の二十五→100分の25']);
});

test('「第○条」の参照も読む', () => {
  assert.deepEqual(readings('第三十三条又は前条第一項'), ['第三十三条→第33条', '第一項→第1項']);
  assert.deepEqual(readings('第四十一条第二号'), ['第四十一条→第41条', '第二号→第2号']);
  /* 「第」が無ければ条番号として扱わない */
  assert.deepEqual(readings('三十三条'), []);
});

test('法令番号の年と号も読める', () => {
  assert.deepEqual(readings('昭和二十二年法律第四十九号'), ['二十二年→22年', '第四十九号→第49号']);
});

test('本文は1字も変わらない（ルビを外すと元に戻る）', () => {
  const samples = [
    '使用者は、その雇入れの日から起算して六箇月間継続勤務し全労働日の八割以上出勤した労働者に対して、継続し、又は分割した十労働日の有給休暇を与えなければならない。',
    '使用者は、労働時間が六時間を超える場合においては少くとも四十五分、八時間を超える場合においては少くとも一時間の休憩時間を労働時間の途中に与えなければならない。',
    '使用者は、満十八才に満たない者を午後十時から午前五時までの間において使用してはならない。',
    '一般の法律事件に関して鑑定、代理、仲裁若しくは和解その他の法律事務',
    '',
  ];
  for (const s of samples) assert.equal(flatten(annotate(s)), s);
});

test('ルビの範囲どうしが重ならない', () => {
  const parts = annotate('六箇月間継続勤務し全労働日の八割以上出勤した');
  const joined = parts.map((p) => p.value).join('');
  assert.equal(joined.length, '六箇月間継続勤務し全労働日の八割以上出勤した'.length);
  assert.ok(parts.every((p) => p.value.length > 0));
});
