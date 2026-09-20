import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALIBRATION_LIMIT_MS, COUNT_IN_BEATS, beatToSeconds, readCalibration, secondsPerBeat, secondsToBeat, writeCalibration
} from '../lib/beat.js';

test('1拍の長さ', () => {
  assert.equal(secondsPerBeat(120), 0.5);
  assert.equal(secondsPerBeat(0), 0.5, 'BPMが壊れていても曲を止めない');
  assert.equal(secondsPerBeat(NaN), 0.5);
});

test('拍と秒は往復しても同じ位置に戻る', () => {
  for (const beat of [0, 1, 2.5, 94.5]) {
    assert.ok(Math.abs(secondsToBeat(beatToSeconds(beat, 124), 124) - beat) < 1e-9);
  }
});

test('カウントインぶんだけ曲が後ろにずれる', () => {
  assert.equal(beatToSeconds(0, 120), COUNT_IN_BEATS * 0.5);
  assert.equal(secondsToBeat(0, 120), -COUNT_IN_BEATS, '曲が始まる前は負の拍');
});

test('補正値はハッシュから読む', () => {
  assert.deepEqual(readCalibration('#cal=-20'), { ms: -20, invalid: false, present: true });
  assert.deepEqual(readCalibration(''), { ms: 0, invalid: false, present: false });
  assert.deepEqual(readCalibration('#other=3'), { ms: 0, invalid: false, present: false });
});

test('刻みに合わない値は丸める', () => {
  assert.equal(readCalibration('#cal=-22').ms, -20);
  assert.equal(readCalibration('#cal=13').ms, 15);
});

test('範囲外の補正値は不正入力として弾く', () => {
  for (const hash of [`#cal=${CALIBRATION_LIMIT_MS + 1}`, '#cal=-99999', '#cal=abc']) {
    const read = readCalibration(hash);
    assert.equal(read.ms, 0, `${hash} は 0 に戻す`);
    if (hash !== '#cal=abc') assert.equal(read.invalid, true, `${hash} は不正入力`);
  }
});

test('補正0のときURLを汚さない', () => {
  assert.equal(writeCalibration(0), '');
  assert.equal(writeCalibration(-20), '#cal=-20');
  assert.equal(writeCalibration(9999), `#cal=${CALIBRATION_LIMIT_MS}`, '上限で頭打ちにする');
});
