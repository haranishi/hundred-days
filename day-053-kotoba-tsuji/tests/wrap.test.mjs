// 文節の切れ目の目安：語の途中（「育つ」「手当て」など）で切らない
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phraseSegments } from '../lib/ui/wrap.js';

// 語の途中に切れ目が無いか（切れ目の位置の集合に、語の内側の位置が入っていないか）
function keepsWhole(text, word) {
  const segs = phraseSegments(text);
  assert.equal(segs.join(''), text, '切っても元の文に戻る');
  const cuts = new Set();
  let pos = 0;
  for (const s of segs.slice(0, -1)) cuts.add((pos += [...s].length));
  const at = [...text].join('').indexOf(word);
  assert.ok(at >= 0, `${word} が文にある`);
  const start = [...text.slice(0, at)].length;
  for (let k = start + 1; k < start + [...word].length; k++) assert.ok(!cuts.has(k), `「${word}」の途中で切れている: ${segs.join('|')}`);
}

test('「木の幹に穴をあけて育つものじゃ」は「育つ」の途中で切らず、助詞の後で切る', () => {
  const t = '長い触角と鋭いあごを持ち、木の幹に穴をあけて育つものじゃ';
  keepsWhole(t, '育つ');
  keepsWhole(t, '触角');
  const segs = phraseSegments(t);
  assert.ok(segs.includes('育つものじゃ'), segs.join('|'));
  assert.ok(segs.some((s) => s.endsWith('、')), '読点の後で切る');
});

test('「手当て」「暮らす」「泳げぬ」「取っ手」を割らない', () => {
  keepsWhole('けがをしたときに手当てをする道具じゃ', '手当て');
  keepsWhole('いそぎんちゃくの中で暮らす小さな魚ぞ', '暮らす');
  keepsWhole('水の中では泳げぬ鳥であろう', '泳げぬ');
  keepsWhole('鍋の取っ手をつかむでござる', '取っ手');
});

test('句読点・かぎかっこの前後で切れ、閉じかっこは行頭に来ない', () => {
  assert.deepEqual(phraseSegments('あっぱれ！ 全5問、解き明かしたり！'), ['あっぱれ！', ' 全5問、', '解き明かしたり！']);
  const segs = phraseSegments('ボタンは「共有…」かコピーしたリンクから');
  assert.ok(!segs.some((s) => s.startsWith('」')), segs.join('|'));
  assert.deepEqual(phraseSegments(''), []);
});
