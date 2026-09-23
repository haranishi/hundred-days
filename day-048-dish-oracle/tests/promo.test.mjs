// プロモ動画の時刻表の約束事。BGM（小節）と描画（字幕・操作）が同じ秒を読むので、ここが崩れると音と絵がずれる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { DURATION_SECONDS, BAR_SECONDS, BPM, BEATS_PER_BAR, REVEAL_AT, END_START, STORYBOARD, CAPTIONS, sceneAt, captionAt } from '../tools/promo/timeline.mjs';

test('1小節は3拍×90BPM＝2秒', () => {
  assert.equal(BEATS_PER_BAR * 60 / BPM, BAR_SECONDS);
});

test('場面は0秒から終わりまで隙間なく続き、切り替えはすべて小節の頭', () => {
  assert.equal(STORYBOARD[0].start, 0);
  assert.equal(STORYBOARD.at(-1).end, DURATION_SECONDS);
  for (let i = 0; i < STORYBOARD.length; i++) {
    if (i > 0) assert.equal(STORYBOARD[i].start, STORYBOARD[i - 1].end, STORYBOARD[i].id);
    assert.equal(STORYBOARD[i].start % BAR_SECONDS, 0, STORYBOARD[i].id);
  }
  assert.equal(REVEAL_AT % BAR_SECONDS, 0);
  assert.equal(sceneAt(REVEAL_AT).music, 'reveal');
  assert.equal(sceneAt(END_START).id, 'S6');
});

test('字幕は1行16字・2行まで（問数は2桁で置き換えて数える）、エンド画面には出さない', () => {
  for (const caption of CAPTIONS) {
    assert.ok(caption.lines.length <= 2);
    for (const line of caption.lines) assert.ok([...line.replace('{questions}', '25')].length <= 16, line);
  }
  assert.deepEqual(captionAt(END_START + 1), []);
  assert.equal(captionAt(REVEAL_AT)[0], '{questions}問で、見抜く');
});
