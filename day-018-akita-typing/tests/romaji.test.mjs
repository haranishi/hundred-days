import test from 'node:test';
import assert from 'node:assert/strict';

import { chunksAt, createMatcher, isSupported, primaryRomaji } from '../lib/romaji.js';

/** 文字列をまるごと打たせて、全部受理されたかを返す */
function typeAll(kana, keys) {
  const m = createMatcher(kana);
  for (const key of keys) {
    const res = m.input(key);
    if (!res.ok) return { ok: false, at: key, expected: res.expected };
  }
  return { ok: m.done };
}

test('既定のローマ字を組み立てられる', () => {
  assert.equal(primaryRomaji('きりたんぽ'), 'kiritanpo');
  assert.equal(primaryRomaji('じゅんさい'), 'junsai');
  assert.equal(primaryRomaji('いぶりがっこ'), 'iburigakko');
  assert.equal(primaryRomaji('しょっつるなべ'), 'shottsurunabe');
});

test('同じ語をIMEで通る別の書き方でも打てる', () => {
  // し＝shi/si、つ＝tsu/tu、じゅ＝ju/jyu/zyu、ふ＝fu/hu
  assert.ok(typeAll('しょっつるなべ', 'shottsurunabe').ok);
  assert.ok(typeAll('しょっつるなべ', 'syotturunabe').ok);
  assert.ok(typeAll('じゅんさい', 'junsai').ok);
  assert.ok(typeAll('じゅんさい', 'jyunsai').ok);
  assert.ok(typeAll('じゅんさい', 'zyunsai').ok);
  assert.ok(typeAll('あきたふき', 'akitafuki').ok);
  assert.ok(typeAll('あきたふき', 'akitahuki').ok);
});

test('ん は n でも nn でも通る（次が子音のとき）', () => {
  assert.ok(typeAll('とんぶり', 'tonburi').ok);
  assert.ok(typeAll('とんぶり', 'tonnburi').ok);
  assert.ok(typeAll('とんぶり', 'toxnburi').ok);
});

test('語尾の ん は n 1個では終われない', () => {
  // IMEでも語尾の n は確定しない。ここで通してしまうと実機と食い違う
  assert.equal(typeAll('いなにわうどん', 'inaniwaudon').ok, false);
  assert.ok(typeAll('いなにわうどん', 'inaniwaudonn').ok);
  assert.equal(primaryRomaji('とんぶりごはん'), 'tonburigohann');
});

test('ん の次が母音・n・y のときは n 単独を許さない', () => {
  const kiniro = chunksAt('きんいろ', 1).map((c) => c.romaji);
  assert.deepEqual(kiniro, ['nn', 'xn']);
  const tonburi = chunksAt('とんぶり', 1).map((c) => c.romaji);
  assert.deepEqual(tonburi, ['n', 'nn', 'xn']);
  // んや → nnya。n 単独だと にゃ と紛れる
  assert.equal(typeAll('こんやく', 'konyaku').ok, false);
  assert.ok(typeAll('こんやく', 'konnyaku').ok);
});

test('n を打った直後は確定を保留し、n でも b でも続けられる', () => {
  // ここで ん を確定させてしまうと、次の n が「ぶ」に当たらず nn 派が弾かれる
  const nn = createMatcher('とんぶり');
  for (const key of 'ton') assert.ok(nn.input(key).ok);
  assert.ok(nn.input('n').ok, 'nn 派が弾かれた');

  const single = createMatcher('とんぶり');
  for (const key of 'ton') assert.ok(single.input(key).ok);
  assert.ok(single.input('b').ok, 'n 1個派が弾かれた');
});

test('案内は語の途中で書き換わらない', () => {
  // `ん` を n で打った瞬間に案内が nn へ変わると、押す必要のないキーを指してしまう
  // （2周目の体験評価で kiritanpo → kiritannpo と変わることが指摘された）
  const m = createMatcher('きりたんぽ');
  for (const key of 'kiritanpo') {
    assert.equal(m.typed + m.remaining(), 'kiritanpo', `案内が書き換わった: ${m.typed + m.remaining()}`);
    m.input(key);
  }
  assert.ok(m.done);
});

test('っ は次の子音を重ねる。単独の ltu/xtu も通る', () => {
  assert.ok(typeAll('いぶりがっこ', 'iburigakko').ok);
  assert.ok(typeAll('いぶりがっこ', 'iburigaltuko').ok);
  assert.ok(typeAll('いぶりがっこ', 'iburigaxtuko').ok);
  // っ＋つ は ttsu でも ttu でも通る
  assert.ok(typeAll('しょっつるなべ', 'shotturunabe').ok);
});

test('づ は du（zu ではない）', () => {
  assert.equal(primaryRomaji('あさづけ'), 'asaduke');
  assert.ok(typeAll('あさづけ', 'asaduke').ok);
  assert.ok(typeAll('あさづけ', 'asadzuke').ok);
  assert.equal(typeAll('あさづけ', 'asazuke').ok, false);
});

test('間違えたときに「押してほしかったキー」が分かる', () => {
  const m = createMatcher('きりたんぽ');
  assert.ok(m.input('k').ok);
  const res = m.input('a');
  assert.equal(res.ok, false);
  assert.equal(res.expected, 'i');
  // 間違えても位置は進まないので、正しいキーで続けられる
  assert.ok(m.input('i').ok);
});

test('残りのローマ字が減っていく', () => {
  const m = createMatcher('ぎばさ');
  assert.equal(m.remaining(), 'gibasa');
  m.input('g');
  assert.equal(m.remaining(), 'ibasa');
  m.input('i');
  assert.equal(m.remaining(), 'basa');
});

test('扱えない文字を見分けられる', () => {
  assert.ok(isSupported('きりたんぽ'));
  assert.ok(isSupported('しょっつるなべ'));
  assert.equal(isSupported('秋田'), false);
});
