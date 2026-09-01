import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROOT_MIDI, REVEAL_TOP, REVEAL_BOTTOM,
  HEARTBEAT_FROM, HEARTBEAT_SLOW_MS, HEARTBEAT_FAST_MS,
  midiToHz, revealPitch, burstNotes, heartbeatIntervalMs, shouldBeat, shouldPlayMiss
} from '../lib/sound.js';

test('開示の音は、開くほど低くなる（上がると「得した」に聞こえる）', () => {
  const len = 6;
  const hz = [0, 1, 2, 3, 4, 5, 6].map((r) => revealPitch(r, len));
  for (let i = 1; i < hz.length; i += 1) {
    assert.ok(hz[i] < hz[i - 1], `${i}文字目で下がっていない`);
  }
  assert.ok(Math.abs(hz[0] - midiToHz(ROOT_MIDI + REVEAL_TOP)) < 1e-6);
  assert.ok(Math.abs(hz[6] - midiToHz(ROOT_MIDI + REVEAL_BOTTOM)) < 1e-6);
});

test('かな長が0でも壊れず、範囲外を渡しても端で止まる', () => {
  assert.ok(Number.isFinite(revealPitch(0, 0)));
  assert.equal(revealPitch(-3, 5), revealPitch(0, 5));
  assert.equal(revealPitch(99, 5), revealPitch(5, 5));
});

test('弾ける音は上行型で、伏せたまま残せたぶんだけ高い', () => {
  for (const kept of [0, 0.5, 1]) {
    const notes = burstNotes(kept);
    assert.equal(notes.length, 3);
    for (let i = 1; i < notes.length; i += 1) {
      assert.ok(notes[i].freq > notes[i - 1].freq, `kept=${kept} で上行していない`);
      assert.ok(notes[i].delay > notes[i - 1].delay, '音がずれて出てこない');
    }
  }
  assert.ok(burstNotes(1)[0].freq > burstNotes(0)[0].freq, '伏せたまま打っても高くならない');
});

test('心拍は手前ほど速く、奥では鳴らさない', () => {
  assert.equal(heartbeatIntervalMs(0), 0);
  assert.equal(heartbeatIntervalMs(HEARTBEAT_FROM - 0.01), 0);
  assert.equal(heartbeatIntervalMs(HEARTBEAT_FROM), HEARTBEAT_SLOW_MS);
  assert.equal(heartbeatIntervalMs(1), HEARTBEAT_FAST_MS);
  let prev = Infinity;
  for (let d = HEARTBEAT_FROM; d <= 1.0001; d += 0.05) {
    const ms = heartbeatIntervalMs(Math.min(1, d));
    assert.ok(ms <= prev, `depth=${d.toFixed(2)} で間隔が伸びた`);
    prev = ms;
  }
});

test('心拍は間隔を跨いだときだけ鳴る', () => {
  assert.equal(shouldBeat(0, 100, 0.2), false, '奥なのに鳴っている');
  assert.equal(shouldBeat(0, HEARTBEAT_SLOW_MS - 1, HEARTBEAT_FROM), false);
  assert.equal(shouldBeat(0, HEARTBEAT_SLOW_MS, HEARTBEAT_FROM), true);
  // 手前ほど短い間隔で鳴る
  assert.equal(shouldBeat(0, HEARTBEAT_FAST_MS, 1), true);
  assert.equal(shouldBeat(0, HEARTBEAT_FAST_MS, HEARTBEAT_FROM), false);
});

test('打ち間違いの音は続けざまには鳴らさない', () => {
  assert.equal(shouldPlayMiss(-Infinity, 0), true);
  assert.equal(shouldPlayMiss(0, 119), false);
  assert.equal(shouldPlayMiss(0, 120), true);
});
