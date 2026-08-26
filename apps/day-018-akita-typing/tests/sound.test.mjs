import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BEAT_MS, MINYO, RITSU,
  bgmStage, midiToHz, notesForBeat, pitchForPrice, priceStep, scaleForStage, shouldPlayMiss
} from '../lib/sound.js';

/* 音そのものはブラウザでしか鳴らないが、「何を鳴らすか決める部分」は純関数に切ってある。
   ここで固定できるのはその決め方だけ——実際の音量や聞こえ方はテストの守備範囲ではない。 */

test('拍の長さは BPM96（625ms）', () => {
  assert.equal(Math.round(BEAT_MS), 625);
});

test('値段の段が音の高さになる（安い皿ほど低い）', () => {
  const prices = [100, 150, 210, 280, 350];
  const pitches = prices.map(pitchForPrice);
  for (let i = 1; i < pitches.length; i += 1) {
    assert.ok(pitches[i] > pitches[i - 1], `¥${prices[i]} が ¥${prices[i - 1]} より高くない`);
  }
  // 表に無い値段も近い段に落ちる（値付けを変えても音が壊れない）
  assert.equal(priceStep(99), 0);
  assert.equal(priceStep(120), 0);
  assert.equal(priceStep(1000), 4);
  assert.equal(pitchForPrice(120), pitchForPrice(100));
});

test('音の高さの基準（A4=440Hzから作る）', () => {
  assert.equal(Math.round(midiToHz(69)), 440);
  assert.equal(Math.round(midiToHz(50)), 147);
});

test('BGMの段は経過比率で切り替わる。最後の段の入口は残り時間の警告と同じ0.75', () => {
  assert.equal(bgmStage(0), 0);
  assert.equal(bgmStage(0.39), 0);
  assert.equal(bgmStage(0.4), 1);
  assert.equal(bgmStage(0.749), 1);
  assert.equal(bgmStage(0.75), 2);
  assert.equal(bgmStage(1), 2);
  // ?duration=6 のような短い回でも比率で切るので、ちゃんと段が来る
  assert.equal(bgmStage(4.5 / 6), 2);
});

test('終盤だけ音階が民謡音階に倒れる', () => {
  assert.deepEqual(scaleForStage(0), RITSU);
  assert.deepEqual(scaleForStage(1), RITSU);
  assert.deepEqual(scaleForStage(2), MINYO);
});

test('ミス音は続けざまには鳴らさない（速い人は1秒に4回以上間違える）', () => {
  assert.equal(shouldPlayMiss(-Infinity, 0), true);
  assert.equal(shouldPlayMiss(1000, 1050), false);
  assert.equal(shouldPlayMiss(1000, 1140), true);
});

test('同じseedなら毎回まったく同じ音符列になる（ループ素材を持たない代わり）', () => {
  for (let beat = 0; beat < 16; beat += 1) {
    assert.deepEqual(notesForBeat(7, beat, 0), notesForBeat(7, beat, 0));
  }
  const a = Array.from({ length: 16 }, (_, i) => notesForBeat(7, i, 1));
  const b = Array.from({ length: 16 }, (_, i) => notesForBeat(8, i, 1));
  assert.notDeepEqual(a, b, 'seedを変えても同じ音符列になっている');
});

test('根音は8拍に1度だけ置き直す（重ねると濁る）', () => {
  const drones = [];
  for (let beat = 0; beat < 32; beat += 1) {
    if (notesForBeat(3, beat, 1).some((n) => n.voice === 'drone')) drones.push(beat);
  }
  assert.deepEqual(drones, [0, 8, 16, 24]);
});

test('段が上がるほど音数が増える（60秒に起伏を作る）', () => {
  const count = (stage) => {
    let n = 0;
    for (let beat = 0; beat < 64; beat += 1) n += notesForBeat(11, beat, stage).length;
    return n;
  };
  assert.ok(count(1) > count(0), `段1(${count(1)}) が段0(${count(0)}) より少ない`);
  assert.ok(count(2) > count(1), `段2(${count(2)}) が段1(${count(1)}) より少ない`);
});

test('音符はどれも鳴らせる形をしている', () => {
  for (const stage of [0, 1, 2]) {
    for (let beat = 0; beat < 32; beat += 1) {
      for (const note of notesForBeat(5, beat, stage)) {
        assert.ok(['drone', 'pluck', 'pulse'].includes(note.voice), `知らない声部: ${note.voice}`);
        assert.ok(note.freq > 20 && note.freq < 4000, `音域の外: ${note.freq}`);
        assert.ok(note.dur > 0 && note.gain > 0 && note.gain <= 0.2);
        assert.ok(note.delay >= 0 && note.delay < BEAT_MS);
      }
    }
  }
});
