import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, GUIDE_MS, DWELL_MS, REDUCED_HOLD_MS } from '../lib/timeline.js';

const make = (opts = {}) => createTimeline({ durations: [1000, 2000, 1000], ...opts });
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('始めは手順1の t=0 で止まっていて、案内を見せる', () => {
  const tl = make();
  const s = tl.state();
  assert.equal(s.step, 0); assert.equal(s.t, 0);
  assert.equal(s.playing, false); assert.equal(s.guides, 'full');
  assert.equal(tl.tick(100), false, '止まっている間は進まない');
});

test('再生すると 案内→動き→余韻→次の手順 の順に進む', () => {
  const tl = make();
  tl.play();
  assert.equal(tl.state().phase, 'guide');
  tl.tick(GUIDE_MS - 1);
  assert.equal(tl.state().phase, 'guide'); assert.equal(tl.state().t, 0);
  tl.tick(1);
  assert.equal(tl.state().phase, 'move');
  assert.equal(tl.state().guides, 'faint', '動いている間は折り線だけ薄く残す');
  tl.tick(500);
  near(tl.state().t, 0.5);
  tl.tick(500);
  assert.equal(tl.state().phase, 'dwell'); assert.equal(tl.state().t, 1);
  tl.tick(DWELL_MS);
  const s = tl.state();
  assert.equal(s.step, 1); assert.equal(s.t, 0); assert.equal(s.phase, 'guide');
});

test('大きな経過時間でも段階をまたいで正しく進む', () => {
  const tl = make();
  tl.play();
  tl.tick(GUIDE_MS + 1000 + DWELL_MS + GUIDE_MS + 1000);
  const s = tl.state();
  assert.equal(s.step, 1); near(s.t, 0.5);
});

test('最後の手順が終わると完成になって止まり、もう一度押すと最初から', () => {
  const tl = make();
  tl.play();
  tl.tick(1e6);
  let s = tl.state();
  assert.equal(s.finished, true); assert.equal(s.playing, false);
  assert.equal(s.step, 2); assert.equal(s.t, 1);
  assert.equal(tl.position(), 3);
  tl.play();
  s = tl.state();
  assert.equal(s.step, 0); assert.equal(s.t, 0); assert.equal(s.playing, true); assert.equal(s.finished, false);
});

test('一時停止で止まり、再開すると同じところから続く', () => {
  const tl = make();
  tl.play(); tl.tick(GUIDE_MS + 250);
  tl.pause();
  const before = tl.state();
  assert.equal(before.playing, false); near(before.t, 0.25);
  tl.tick(1000);
  near(tl.state().t, 0.25);
  assert.equal(before.guides, 'none', '途中で止めたら案内は出さない');
  tl.play();
  assert.equal(tl.state().phase, 'move');
  tl.tick(250);
  near(tl.state().t, 0.5);
});

test('速度を2倍にすると半分の時間で進み、0.5倍なら倍かかる', () => {
  const a = make(); a.setSpeed(2); a.play(); a.tick(GUIDE_MS / 2 + 250);
  near(a.state().t, 0.5);
  const b = make(); b.setSpeed(0.5); b.play(); b.tick(GUIDE_MS * 2 + 1000);
  near(b.state().t, 0.5);
  assert.throws(() => a.setSpeed(3));
});

test('次へ・前へは手順の始まりへ移る', () => {
  const tl = make();
  tl.next();
  assert.deepEqual([tl.state().step, tl.state().t], [1, 0]);
  tl.setProgress(1, 0.6);
  tl.prev();
  assert.deepEqual([tl.state().step, tl.state().t], [1, 0], '途中なら同じ手順の始まりへ');
  tl.prev();
  assert.deepEqual([tl.state().step, tl.state().t], [0, 0]);
  tl.prev();
  assert.deepEqual([tl.state().step, tl.state().t], [0, 0], '最初より前へは行かない');
  tl.goto(2); tl.next();
  assert.equal(tl.state().finished, true, '最後で次へを押すと完成');
  tl.prev();
  assert.deepEqual([tl.state().step, tl.state().t, tl.state().finished], [2, 0, false]);
});

test('再生中に次へを押すと、次の手順の案内から再生が続く', () => {
  const tl = make();
  tl.play(); tl.tick(GUIDE_MS + 300);
  tl.next();
  const s = tl.state();
  assert.equal(s.step, 1); assert.equal(s.playing, true); assert.equal(s.phase, 'guide');
});

test('つまみは通し位置で動き、触ると再生を止める', () => {
  const tl = make();
  tl.play();
  tl.seek(1.25);
  let s = tl.state();
  assert.equal(s.playing, false); assert.equal(s.step, 1); near(s.t, 0.25);
  near(tl.position(), 1.25);
  tl.seek(3);
  s = tl.state();
  assert.equal(s.finished, true); assert.equal(s.step, 2); assert.equal(s.t, 1);
  tl.seek(-5);
  assert.deepEqual([tl.state().step, tl.state().t], [0, 0]);
  tl.seek(2);
  assert.deepEqual([tl.state().step, tl.state().t], [2, 0], '境目は次の手順の始まり');
});

test('動きを減らす設定では動かさず、各手順の終点を順に見せる', () => {
  const tl = make({ reduced: true });
  assert.equal(tl.state().t, 1);
  assert.equal(tl.state().guides, 'line', '終点では折り線だけ示す');
  tl.play();
  assert.equal(tl.state().phase, 'hold');
  tl.tick(REDUCED_HOLD_MS - 1);
  assert.equal(tl.state().step, 0);
  tl.tick(1);
  assert.deepEqual([tl.state().step, tl.state().t], [1, 1]);
  tl.next();
  assert.deepEqual([tl.state().step, tl.state().t], [2, 1]);
  tl.prev();
  assert.deepEqual([tl.state().step, tl.state().t], [1, 1], '終点同士で1つ戻る');
});

test('途中で動きを減らす設定に変わっても止まらない', () => {
  const tl = make();
  tl.play(); tl.tick(GUIDE_MS + 100);
  tl.setReduced(true);
  const s = tl.state();
  assert.equal(s.t, 1); assert.equal(s.phase, 'hold'); assert.equal(s.playing, true);
});

test('状態が変わるたびに version が増える', () => {
  const tl = make();
  const v0 = tl.state().version;
  tl.next();
  assert.ok(tl.state().version > v0);
});

test('手順が空なら作れない', () => {
  assert.throws(() => createTimeline({ durations: [] }));
});

test('手順ごとに止める: 各手順の終点で止まり、再生で次の手順へ進む', () => {
  const tl = make({ stepStop: true });
  tl.play();
  tl.tick(GUIDE_MS + 1000 + DWELL_MS + 5000);
  let s = tl.state();
  assert.deepEqual([s.step, s.t, s.playing, s.finished], [0, 1, false, false], '手順1の終点で止まる');
  tl.play();
  s = tl.state();
  assert.deepEqual([s.step, s.t, s.phase, s.playing], [1, 0, 'guide', true], '次の手順の案内から');
  tl.tick(1e6);
  assert.deepEqual([tl.state().step, tl.state().t, tl.state().playing], [1, 1, false]);
  tl.play(); tl.tick(1e6);
  s = tl.state();
  assert.equal(s.finished, true, '最後の手順は完成になる');
});

test('手順ごとに止めるは途中で切り替えられ、既定はオフ', () => {
  const tl = make();
  assert.equal(tl.state().stepStop, false);
  tl.play(); tl.tick(GUIDE_MS + 500);
  tl.setStepStop(true);
  tl.tick(1e6);
  assert.deepEqual([tl.state().step, tl.state().playing], [0, false]);
  tl.setStepStop(false);
  tl.play(); tl.tick(1e6);
  assert.equal(tl.state().finished, true);
});

test('動きの軽減でも手順ごとに止める', () => {
  const tl = make({ reduced: true, stepStop: true });
  tl.play();
  tl.tick(REDUCED_HOLD_MS * 5);
  const s = tl.state();
  assert.deepEqual([s.step, s.t, s.playing], [1, 1, false]);
});
