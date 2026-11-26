import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from '../../tools/promo/timeline.mjs';

const VERBATIM = [
  [0, 2, '帳簿、また後回し？'],
  [2, 4, '気づけば、未確認が25件。'],
  [4, 9, '科目を選んで、確定。'],
  [9, 12, 'まとめて片づく。'],
  [12, 18, '打つそばから、仕訳ができる。'],
  [18, 21, '利益が、その場で分かる。'],
  [21, 24, '帳票もCSVも、すぐ出せる。'],
  [24, 27, '本物の帳簿は、自分のPCの中だけ。'],
];

test('絵コンテの自己検査が通る（960コマ・安全域・合図）', () => {
  const result = T.selftestStoryboard();
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.totalFrames, 960);
  assert.equal(result.captions, 8);
});

test('字幕は依頼の文言・秒数と一致し、30px以上、透明にならない', () => {
  assert.equal(T.CAPTIONS.length, VERBATIM.length);
  VERBATIM.forEach(([start, end, text], index) => {
    const caption = T.CAPTIONS[index];
    assert.equal(caption.start, start);
    assert.equal(caption.end, end);
    assert.equal(T.captionText(caption), text);
    assert.ok(caption.size >= 30, `字幕 ${index} が ${caption.size}px`);
  });
  assert.equal(T.CAPTIONS[0].tag, '個人事業主の方へ');
  assert.equal(T.CAPTIONS[7].note, '（ソースから動かす版）');
  assert.ok(T.CAPTIONS[7].noteSize >= 16);
  const disclaimer = T.END_BLOCKS.find((block) => block.id === 'disclaimer');
  assert.equal(disclaimer.lines.join(''), T.END_CARD.disclaimer);
  assert.ok(disclaimer.fontSize >= 16);
  for (let frame = 0; frame < T.TOTAL_FRAMES; frame += 3) {
    const view = T.captionAt(frame / T.FPS);
    if (!view) continue;
    assert.equal(view.alpha, 1);
    assert.ok(view.dy >= 0 && view.dy <= 14);
  }
});

test('禁止表現と手元のアドレスを、字幕と締めの札に入れない', () => {
  const spoken = [
    ...T.CAPTIONS.flatMap((caption) => [caption.lines.join(''), caption.tag, caption.note]),
    T.END_CARD.pills, T.END_CARD.cta, T.END_CARD.url, T.END_CARD.series, T.END_CARD.disclaimer,
  ].filter(Boolean).join('\n');
  for (const word of ['申告できる', '電子帳簿保存法', '自動で仕訳', '自動で提案', '他より速い', '他より簡単', '127.0.0.1']) {
    assert.equal(spoken.includes(word), false, word);
  }
});
