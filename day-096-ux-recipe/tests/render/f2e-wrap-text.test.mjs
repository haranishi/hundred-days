import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapPageHtml } from '../../lib/jp-wrap.js';
import { Parser } from '../../vendor/budoux/parser.js';
import { stripWrap } from './f2e-wrap-helpers.mjs';

const sentence = '読みたい資料を棚から探します。';
const wrapped = '読みたい<wbr>資料を<wbr>棚から<wbr>探します。';

test('文節に折り返しを入れても、本文・空白・元のタグは一字ずつ復元できる', () => {
  const html = '<p> ' + sentence + '\n<span>定員は12人です。</span><br>🍞</p>';
  const result = wrapPageHtml(html);
  assert.ok(result.includes(wrapped));
  assert.equal(stripWrap(result), html);
});

test('属性中の > やタグに似た文字、コメント、本文として表示しない4要素をそのまま保つ', () => {
  const open = '<p title="1 > 0 ' + sentence + '" data-note=\'<title> ' + sentence + '\'>';
  const comment = '<!-- <p>' + sentence + '</p> > -->';
  const raw = ['ScRiPt', 'STYLE', 'textarea', 'title'].map(tag =>
    '<' + tag + ' data-test="閉じる > 印">' + sentence + ' <i title=">"> 1,450円・店主' + '</' + tag + '>'
  ).join('');
  assert.equal(wrapPageHtml(comment + open + sentence + '</p>' + raw + sentence),
    comment + open + wrapped + '</p>' + raw + wrapped);
});

test('実体参照を含む連続した本文を読み、元の参照の綴りを保つ', () => {
  const html = '<p>🍞' + sentence + '&amp;&#39;&quot;&lt;wbr&gt;&nbsp;&copy;ショ&#x30FC;トは&#49;,450円です。</p>';
  const result = wrapPageHtml(html);
  for (const [, ref] of html.matchAll(/(&[^;]+;)/g)) assert.ok(result.includes(ref), ref);
  assert.ok(result.includes('ショ&#x30FC;ト'));
  assert.ok(result.includes('<wbr><span class="uxr-nb">&#49;,450円</span><wbr>'));
  assert.equal(stripWrap(result), html);
});

test('カタカナの途中や長音の隣に境目を作らず、続く日本語は文節で折る', () => {
  const html = 'ショート動画とアイスコーヒーとサンドイッチを頼みます。';
  const result = wrapPageHtml(html);
  for (const word of ['ショート', 'アイスコーヒー', 'サンドイッチ']) assert.ok(result.includes(word));
  assert.ok(result.includes('<wbr>頼みます。'));
  assert.equal(stripWrap(result), html);
});

test('開き括弧の直後、閉じ括弧や句読点の直前には折り返しを入れない', () => {
  const pairs = [...'（(「『【〈《〔［｛'].map((open, i) => [open, '）)」』】〉》〕］｝'[i]]);
  for (const [open, close] of pairs) {
    const html = '本日は' + open + 'みんなでお茶を' + close + '飲みます。';
    const result = wrapPageHtml(html);
    assert.ok(result.includes('<wbr>'));
    assert.ok(!result.includes(open + '<wbr>') && !result.includes('<wbr>' + close));
    assert.equal(stripWrap(result), html);
  }
  for (const mark of '、。，．！？') {
    const html = '本を選びます' + mark + '次はお茶です。';
    assert.ok(!wrapPageHtml(html).includes('<wbr>' + mark));
  }
});

test('金額・寸法・時刻・年月・人数・点数は一つずつ保護し、塊の両側で折れる', () => {
  for (const quantity of ['1,450円', '34×70cm', '10:30', '2026年11月', '12人', '96点', '１，４５０円']) {
    assert.equal(wrapPageHtml(quantity), '<wbr><span class="uxr-nb">' + quantity + '</span><wbr>');
  }
  assert.equal(wrapPageHtml('12人96点'), '<wbr><span class="uxr-nb">12人</span><wbr><span class="uxr-nb">96点</span><wbr>');
  assert.equal(wrapPageHtml('（12人）。'), '<wbr><span class="uxr-nb">（12人）。</span><wbr>');
});

test('中黒は直前の語や数値と一緒に保ち、次の語とは境目を共有する', () => {
  const html = '予約・相談・12人・96点';
  const result = wrapPageHtml(html);
  assert.equal(result, '<wbr>' + ['予約・', '相談・', '12人・', '96点']
    .map(word => '<span class="uxr-nb">' + word + '</span>').join('<wbr>') + '<wbr>');
  assert.equal(stripWrap(result), html);
  assert.equal(wrapPageHtml('（店主）・窓口'), '<wbr><span class="uxr-nb">（店主）・</span><wbr>窓口');
  assert.equal(wrapPageHtml('受付 ・ 予約'), '<wbr><span class="uxr-nb">受付 ・</span><wbr> 予約');
});

test('営業時間や寸法で区切りの両側に単位が付いても、区切りだけを行に残さない', () => {
  for (const value of ['8時〜11時', '34cm×70cm', '10:30〜12:00', '34 × 70 cm']) {
    assert.equal(wrapPageHtml(value), '<wbr><span class="uxr-nb">' + value + '</span><wbr>');
  }
});

test('空・タグだけ・英数字・長い一語を欠かさず、長い一語は幅に応じて折れるままにする', () => {
  for (const html of ['', '<b></b><br>', 'ABC123xyz', 'A1z'.repeat(4096), 'カ'.repeat(4096)]) {
    assert.equal(wrapPageHtml(html), html);
  }
});

test('同じ本文の解析を使い回し、500件を超えたら先に入れた本文から再解析する', t => {
  const calls = t.mock.method(Parser.prototype, 'parseBoundaries');
  const source = '🍵湯のみ&amp;受け皿を選びます。';
  const count = () => calls.mock.calls.filter(call => call.arguments[0] === '🍵湯のみ&受け皿を選びます。').length;
  const first = wrapPageHtml(source);
  assert.equal(wrapPageHtml('<b>' + source + '</b>' + source), '<b>' + first + '</b>' + first);
  assert.equal(count(), 1);
  for (let i = 0; i < 499; i++) wrapPageHtml('商品番号' + i + 'を調べます。');
  assert.equal(wrapPageHtml(source), first);
  assert.equal(count(), 1);
  wrapPageHtml('木のお皿をもう一枚追加します。');
  assert.equal(wrapPageHtml(source), first);
  assert.equal(count(), 2);
});
