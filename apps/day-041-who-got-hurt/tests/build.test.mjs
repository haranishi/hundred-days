/* 変換スクリプトの検査。CSVそのものは同梱しないので、見出し行＋2行を切り出した
   実データ（tests/fixtures/npa/）で、列の並びが年で違っても読めることを固定する */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { decodeDms, flagsOf, readYear } from '../tools/build-data.mjs';
import { F_BIKE, F_CROSS, F_DEATH, F_ELDER, F_MOTOR, F_NIGHT, F_WALKER } from '../lib/pack.js';

const fixture = (name) => fileURLToPath(new URL(`fixtures/npa/${name}`, import.meta.url));

test('度分秒を潰した整数を十進度へ戻す', () => {
  /* 緯度は9桁 DDMMSSsss、経度は10桁 DDDMMSSsss */
  assert.equal(decodeDms('430607590', true).toFixed(5), '43.10211');
  assert.equal(decodeDms('1412107630', false).toFixed(5), '141.35212');
  assert.equal(decodeDms('351044450', true).toFixed(5), '35.17901');
});

test('桁数が違う・数字でない・空はnullを返す', () => {
  assert.equal(decodeDms('43060759', true), null);   /* 8桁 */
  assert.equal(decodeDms('430607590', false), null); /* 経度に9桁 */
  assert.equal(decodeDms('43060759O', true), null);  /* Oは数字でない */
  assert.equal(decodeDms('', true), null);
  assert.equal(decodeDms(undefined, true), null);
});

test('当事者が歩行者・自転車・二輪車のいずれでもフラグが立つ', () => {
  const base = { typeA: '03', typeB: '03', ageA: '25', ageB: '35', content: '2', shape: '14', daynight: '12' };
  assert.equal(flagsOf(base), 0);
  assert.ok(flagsOf({ ...base, typeB: '61' }) & F_WALKER);
  assert.ok(flagsOf({ ...base, typeA: '61' }) & F_WALKER);      /* A側でも立つ */
  assert.ok(flagsOf({ ...base, typeB: '51' }) & F_BIKE);
  assert.ok(flagsOf({ ...base, typeB: '52' }) & F_BIKE);        /* 駆動補助機付も自転車 */
  assert.ok(flagsOf({ ...base, typeB: '36' }) & F_MOTOR);
  assert.ok(flagsOf({ ...base, typeB: '43' }) & F_MOTOR);       /* 特定小型原付 */
  assert.equal(flagsOf({ ...base, typeB: '59' }) & F_BIKE, 0);  /* 軽車両その他は自転車でない */
});

test('死亡・65歳以上・交差点・夜のフラグ', () => {
  const base = { typeA: '03', typeB: '03', ageA: '25', ageB: '35', content: '2', shape: '14', daynight: '12' };
  assert.ok(flagsOf({ ...base, content: '1' }) & F_DEATH);
  assert.ok(flagsOf({ ...base, ageB: '65' }) & F_ELDER);
  assert.ok(flagsOf({ ...base, ageB: '75' }) & F_ELDER);
  assert.equal(flagsOf({ ...base, ageB: '55' }) & F_ELDER, 0);  /* 55〜64歳は入れない */
  for (const shape of ['01', '31', '07', '37']) assert.ok(flagsOf({ ...base, shape }) & F_CROSS);
  for (const shape of ['14', '13', '11', '00']) assert.equal(flagsOf({ ...base, shape }) & F_CROSS, 0);
  for (const dn of ['21', '22', '23']) assert.ok(flagsOf({ ...base, daynight: dn }) & F_NIGHT);
  for (const dn of ['11', '12', '13']) assert.equal(flagsOf({ ...base, daynight: dn }) & F_NIGHT, 0);
});

test('58列（2019年）と68列（2024年）のどちらも列名で読める', async () => {
  for (const [name, statYear, columns] of [['honhyo_2019.csv', 2019, 58], ['honhyo_2024.csv', 2024, 68]]) {
    const rows = [];
    const tally = { rows: 0, dropped: 0, outOfRange: 0, columns: {} };
    await readYear(fixture(name), statYear, (row) => rows.push(row), tally);
    assert.equal(tally.columns[statYear], columns, `${name} の列数`);
    assert.equal(tally.rows, 2, `${name} の行数`);
    for (const row of rows) {
      assert.ok(row.lat > 20 && row.lat < 46, '緯度が日本の範囲');
      assert.ok(row.lng > 122 && row.lng < 154, '経度が日本の範囲');
      assert.ok(Number.isInteger(row.flags) && row.flags >= 0 && row.flags <= 255);
    }
  }
});

test('ファイル名の年ではなく発生年で持つ（統計2024年のファイルに2023年の事故が入っている）', async () => {
  const rows = [];
  const tally = { rows: 0, dropped: 0, outOfRange: 0, columns: {} };
  await readYear(fixture('honhyo_2024.csv'), 2024, (row) => rows.push(row), tally);
  /* 切り出した2行はどちらも2023年12月に起きた事故。ファイル名の2024が入っていたら誤り */
  assert.deepEqual(rows.map((row) => row.year), [2023, 2023]);
});

test('列が足りないファイルは黙って通さず落ちる', async () => {
  await assert.rejects(
    () => readYear(fixture('notacsv.json'), 2024, () => {}, { rows: 0, dropped: 0, outOfRange: 0, columns: {} }),
    /列「.+」が無い/,
  );
});
