import test from 'node:test';
import assert from 'node:assert/strict';
import { BEATS_PER_BAR, buildAccompaniment, chordAt, countInTicks, midiToFreq } from '../lib/music.js';
import { COUNT_IN_BEATS } from '../lib/beat.js';

test('MIDIノートから周波数', () => {
  assert.ok(Math.abs(midiToFreq(69) - 440) < 1e-9);
  assert.ok(Math.abs(midiToFreq(81) - 880) < 1e-9, '1オクターブ上は2倍');
});

test('コードは4小節で1周する', () => {
  assert.equal(chordAt(0).name, chordAt(4).name);
  assert.equal(chordAt(-1).name, chordAt(3).name, '負の小節番号でも落ちない');
});

test('伴奏は曲の長さをはみ出さない', () => {
  const events = buildAccompaniment(16);
  assert.ok(events.length > 0);
  assert.ok(events.every((event) => event.beat < 16));
  assert.deepEqual(events.map((e) => e.beat), [...events.map((e) => e.beat)].sort((a, b) => a - b));
});

test('小節ごとに低音・和音・ふしが揃う', () => {
  const first = buildAccompaniment(BEATS_PER_BAR);
  const voices = new Set(first.map((event) => event.voice));
  assert.deepEqual([...voices].sort(), ['bass', 'melody', 'pad']);
});

test('打った音を埋めないよう、伴奏はどれも小さい', () => {
  assert.ok(buildAccompaniment(32).every((event) => event.gain <= 0.25));
});

/* カウントインは8拍あるが、数える音が鳴るのは後半の4拍だけ。
   前半4拍は練習の1発に使う（体験評価1周目の指摘への対応）。 */
test('数える音は後半4拍ぶんで、最後だけ高い', () => {
  const ticks = countInTicks();
  assert.equal(ticks.length, 4);
  assert.deepEqual(ticks.map((tick) => tick.beat), [-4, -3, -2, -1]);
  assert.ok(ticks[3].freq > ticks[0].freq, '4拍目で次が頭だと分かるようにする');
  assert.ok(ticks.every((tick) => tick.beat >= -COUNT_IN_BEATS), 'カウントインの外で鳴らさない');
});
