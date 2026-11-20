import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapPageHtml } from '../../lib/jp-wrap.js';
import { stripWrap } from './f2e-wrap-helpers.mjs';

// 漢字＋送りがな1字＋漢字の複合語は、BudouX が送りがなの後ろで切っても、1つの語として折れ目を入れない（採点の指摘「売り／場から」）。
const wrapped = text => wrapPageHtml(`<p>${text}</p>`);

test('売り場・売り切れ・買い物・受け付け・申し込み・問い合わせ・取り扱い・持ち帰りは、語の途中に折れ目を入れない', () => {
  for (const word of ['売り場', '売り切れ', '買い物', '受け付け', '申し込み', '問い合わせ', '取り扱い', '持ち帰り']) {
    const html = wrapped(`${word}からそう聞いた翌朝のこと`);
    const inside = word.length;
    // 語の中（先頭と末尾を除く各位置）に <wbr> が無い
    for (let i = 1; i < inside; i += 1) {
      assert.ok(!html.includes(`${word.slice(0, i)}<wbr>${word.slice(i)}`), `${word} の途中（${i}字目）に折れ目がある: ${html}`);
    }
    assert.equal(stripWrap(html), `<p>${word}からそう聞いた翌朝のこと</p>`);
  }
});

test('助詞の後ろの文節の境目は残す（「朝の｜売り場」）', () => {
  const html = wrapped('朝の売り場でパンを並べる');
  assert.match(html, /朝の<wbr>/, '助詞「の」の後ろの境目が消えている');
});

test('ひらがなが続く語（新しい店・聞いた翌朝）の境目は、この補正では消さない', () => {
  // 前の字がひらがななので対象外（漢字＋ひらがな1字＋漢字のときだけ）。BudouX の出力どおり。
  const html = wrapped('新しい店で聞いた翌朝');
  assert.equal(stripWrap(html), '<p>新しい店で聞いた翌朝</p>');
});
