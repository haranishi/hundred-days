import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

/* 同梱データそのものの検算。期待値は元のxlsx/CSVから独立に計算した値
   （検収側がPythonで別実装して出した数字。変換ツールの写し間違いを掴むため）。 */
const raw = JSON.parse(await readFile(new URL('../data/towns.json', import.meta.url), 'utf-8'));
const byCode = new Map(raw.towns.map((t) => [t.code, t]));

describe('収録範囲', () => {
  it('1,741市区町村。政令市は市単位・特別区は区単位', () => {
    assert.equal(raw.towns.length, 1741);
    assert.ok(byCode.has('01100'), '札幌市');
    assert.ok(byCode.has('13104'), '新宿区');
    assert.ok(!byCode.has('13100'), '特別区部の合計行は入れない');
    assert.ok(!byCode.has('01101'), '政令市の区は入れない');
  });
  it('人口が欠けるのは双葉町（全町避難で「-」表記）だけ。面積は全町で正の数', () => {
    const noPop = raw.towns.filter((t) => t.pop === null).map((t) => t.code);
    assert.deepEqual(noPop, ['07546']);
    assert.equal(byCode.get('07546').name, '双葉町');
    for (const t of raw.towns) assert.ok(t.area > 0, `${t.code} area`);
  });
});

describe('検算（元データから独立に出した期待値）', () => {
  it('秋田市', () => {
    const t = byCode.get('05201');
    assert.equal(t.name, '秋田市');
    assert.equal(t.pref, '秋田県');
    assert.equal(t.area, 906.07);
    assert.equal(t.rate, -2.58);
    assert.equal(t.sexRatio, 89.6);
    assert.equal(t.single, 36.28);
  });
  it('北秋田市', () => {
    const t = byCode.get('05213');
    assert.equal(t.pop, 30198);
    assert.equal(t.area, 1152.76);
    assert.equal(t.single, 30.02);
    assert.ok(t.ageAvg >= 56.8 && t.ageAvg <= 57.0);
  });
  it('新宿区', () => {
    const t = byCode.get('13104');
    assert.equal(t.rate, 4.74);
    assert.equal(t.single, 67.8);
    assert.equal(t.sexRatio, 100.1);
  });
});

describe('出典の明示', () => {
  it('metaに調査名と時点が入っている', () => {
    assert.ok(raw.meta.census.includes('令和2年国勢調査'));
    assert.ok(raw.meta.census.includes('2020年10月1日'));
    assert.ok(raw.meta.area.includes('国土地理院') || raw.meta.area.includes('面積調'));
  });
});
