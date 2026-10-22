import test from 'node:test';
import assert from 'node:assert/strict';
import { toUnicode, toUnicodeHost } from '../lib/punycode.js';

// RFC3492 §7.1の各言語の例。ライブラリの実装は参照しない。
const vectors = [
  ['egbpdaj6bu4bxfgehfvwxn', 'ليهمابتكلموشعربي؟'],
  ['ihqwcrb4cv8a8dqg056pqjye', '他们为什么不说中文'],
  ['ihqwctvzc91f659drss3x8bo0yb', '他們爲什麽不說中文'],
  ['Proprostnemluvesky-uyb24dma41a', 'Pročprostěnemluvíčesky'],
  ['4dbcagdahymbxekheh6e0a7fei0b', 'למההםפשוטלאמדבריםעברית'],
  ['i1baa7eci9glrd9b2ae1bj0hfcgg6iyaf8o0a1dig0cd', 'यहलोगहिन्दीक्योंनहींबोलसकतेहैं'],
  ['989aomsvi5e83db1d2a355cv1e0vak1dwrv93d5xbh15a0dt30a5jpsd879ccm6fea98c', '세계의모든사람들이한국어를이해한다면얼마나좋을까'],
  ['n8jok5ay5dzabd5bym9f0cm5685rrjetr6pdxa', 'なぜみんな日本語を話してくれないのか'],
  ['b1abfaaepdrnnbgefbadotcwatmq2g4l', 'почемужеонинеговорятпорусски'],
  ['PorqunopuedensimplementehablarenEspaol-fmd56a', 'PorquénopuedensimplementehablarenEspañol'],
  ['TisaohkhngthchnitingVit-kjcr8268qyxafd2f1b9g', 'TạisaohọkhôngthểchỉnóitiếngViệt'],
  ['3B-ww4c5e180e575a65lsy2b', '3年B組金八先生'],
  ['-with-SUPER-MONKEYS-pc58ag80a8qai00g7n9n', '安室奈美恵-with-SUPER-MONKEYS'],
  ['Hello-Another-Way--fc4qua05auwb3674vfr0b', 'Hello-Another-Way-それぞれの場所'],
  ['2-u9tlzr9756bt3uc0v', 'ひとつ屋根の下2'],
  ['MajiKoi5-783gue6qz075azm5e', 'MajiでKoiする5秒前'],
  ['de-jg4avhby1noc0d', 'パフィーdeルンバ'],
  ['d9juau41awczczp', 'そのスピードで'],
  ['mnchen-3ya', 'münchen']
];
for (const [encoded, expected] of vectors) test(`punycode: ${encoded}`, () => assert.equal(toUnicode('xn--' + encoded), expected));
test('punycode: 日本語のホストとASCII・大文字接頭辞', () => {
  assert.equal(toUnicodeHost('www.xn--wgv71a119e.jp'), 'www.日本語.jp');
  assert.equal(toUnicode('XN--mnchen-3ya'), 'münchen');
  assert.equal(toUnicode('example'), 'example');
});
test('punycode: 壊れた入力・範囲外・巨大入力をそのまま返す', () => {
  for (const label of ['', 'xn--', 'xn--%', 'xn--a!', 'xn--99999999999999999999999999999', 'xn--' + 'z'.repeat(100000), null]) assert.equal(toUnicode(label), label);
});
