import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RomajiBuffer } from '../lib/kana.js';

// 1字ずつ打ち、最後に flush した結果
function typeAll(keys, { flush = true } = {}) {
  const buf = new RomajiBuffer();
  const out = [];
  for (const k of keys) out.push(...buf.feed(k));
  if (flush) out.push(...buf.flush());
  return out.join('');
}

test('RomajiBuffer：表のとおりに変換する', () => {
  const table = [
    ['neko', 'ねこ'],
    ['kyuuri', 'きゆうり'],
    ['kitte', 'きつて'],
    ['shinbun', 'しんぶん'],
    ['sanpo', 'さんぽ'],
    ['konnnichiha', 'こんにちは'],
    ['tsuki', 'つき'],
    ['tuki', 'つき'],
    ['chizu', 'ちず'],
    ['tizu', 'ちず'],
    ['fune', 'ふね'],
    ['hune', 'ふね'],
    ['jama', 'じやま'],
    ['zyama', 'じやま'],
    ['jyama', 'じやま'],
    ['wo', 'を'],
    ['xtu', 'つ'],
    ['ltsu', 'つ'],
    ['xya', 'や'],
    ['kan\'i', 'かんい'],
    ['n\'', 'ん'],
    ['nn', 'ん'],
    ['kanji', 'かんじ'],
    ['shashin', 'しやしん'],
    ['kyakka', 'きやつか'],
    ['matcha', 'まつちや'],
    ['maccha', 'まつちや'],
    ['happa', 'はつぱ'],
    ['fairu', 'ふあいる'],
    ['ra-men', 'らめん'],
    ['GAKKOU', 'がつこう'],
    ['dya', 'ぢや'],
    ['nyanko', 'にやんこ'],
  ];
  for (const [keys, want] of table) assert.equal(typeAll([...keys]), want, keys);
});

test('RomajiBuffer：n は次の字を見てから確定し、flush で「ん」になる', () => {
  const buf = new RomajiBuffer();
  assert.deepEqual(buf.feed('h'), []);
  assert.deepEqual(buf.feed('o'), ['ほ']);
  assert.deepEqual(buf.feed('n'), []);
  assert.equal(buf.pending, 'n');
  assert.deepEqual(buf.feed('b'), ['ん']); // n＋子音で確定
  assert.equal(buf.pending, 'b');
  assert.deepEqual(buf.feed('a'), ['ば']);
  assert.deepEqual(buf.feed('n'), []);
  assert.deepEqual(buf.flush(), ['ん']);
  assert.equal(buf.pending, '');
});

test('RomajiBuffer：kanji の途中で flush する', () => {
  const buf = new RomajiBuffer();
  const out = [];
  for (const k of 'kan') out.push(...buf.feed(k));
  assert.deepEqual(out, ['か']);
  assert.deepEqual(buf.flush(), ['ん']); // 別のマスへ移ったなど
  for (const k of 'ji') out.push(...buf.feed(k));
  assert.deepEqual(out, ['か', 'じ']);

  // 子音だけが残っているときの flush は捨てる
  const b2 = new RomajiBuffer();
  const o2 = [];
  for (const k of 'kanj') o2.push(...b2.feed(k));
  assert.deepEqual(o2, ['か', 'ん']);
  assert.equal(b2.pending, 'j');
  assert.deepEqual(b2.flush(), []);
  assert.deepEqual(b2.feed('i'), ['い']);
});

test('RomajiBuffer：続かない綴り・clear・かなの直接入力', () => {
  const buf = new RomajiBuffer();
  assert.deepEqual(buf.feed('q'), []); // q は使わない
  assert.deepEqual(buf.feed('k'), []);
  assert.deepEqual(buf.feed('q'), []); // kq は続かないので捨てる
  assert.equal(buf.pending, '');
  buf.feed('s');
  buf.clear();
  assert.equal(buf.pending, '');
  assert.deepEqual(buf.feed('Enter'), []);
  assert.deepEqual(buf.feed('ア'), ['あ']);
  buf.feed('n');
  assert.deepEqual(buf.feed('か'), ['ん', 'か']);
});
