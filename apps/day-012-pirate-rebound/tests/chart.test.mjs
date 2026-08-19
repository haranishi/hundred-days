import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARTS, DOUBLE_GAP_BEATS, FLIGHT_BEATS, expandChart, validateChart } from '../lib/chart.js';
import { WINDOW } from '../lib/judge.js';
import { beatToSeconds } from '../lib/beat.js';

test('本編と短縮版のどちらも壊れていない', () => {
  assert.deepEqual(validateChart(CHARTS.main), []);
  assert.deepEqual(validateChart(CHARTS.short), []);
});

test('打点は発射の飛行時間ぶん後ろにできる', () => {
  const { objects } = expandChart({ bpm: 120, beats: 16, events: [{ beat: 3, kind: 'cannon' }] });
  assert.deepEqual(objects[0].hits, [3 + FLIGHT_BEATS]);
});

test('二連弾は半拍あけて2つ', () => {
  const { objects, notes } = expandChart({ bpm: 120, beats: 16, events: [{ beat: 0, kind: 'double' }] });
  assert.deepEqual(objects[0].hits, [FLIGHT_BEATS, FLIGHT_BEATS + DOUBLE_GAP_BEATS]);
  assert.equal(notes.length, 2);
});

test('カモメは打点を作らない', () => {
  const { objects, notes } = expandChart({ bpm: 120, beats: 16, events: [{ beat: 0, kind: 'gull' }] });
  assert.deepEqual(objects[0].hits, []);
  assert.equal(notes.length, 0, '押してはいけないので打点にしない');
});

test('打点は時刻順に並び、通し番号が付く', () => {
  const { notes } = expandChart(CHARTS.main);
  notes.forEach((note, index) => assert.equal(note.index, index));
  for (let index = 1; index < notes.length; index += 1) {
    assert.ok(notes[index].beat > notes[index - 1].beat, `拍 ${notes[index].beat} の順序`);
  }
});

/* ここが崩れると、どちらの打点への入力か決められなくなる。
   譜面を書き換えたときに真っ先に落ちてほしいので、実時間で確かめる。 */
test('隣り合う打点は判定の届く範囲より離れている', () => {
  const { notes, bpm } = expandChart(CHARTS.main);
  for (let index = 1; index < notes.length; index += 1) {
    const gap = beatToSeconds(notes[index].beat, bpm) - beatToSeconds(notes[index - 1].beat, bpm);
    assert.ok(gap > WINDOW.reach, `拍 ${notes[index].beat} の間隔 ${gap.toFixed(3)}秒`);
  }
});

test('壊れた譜面は問題として返る', () => {
  const problems = validateChart({
    bpm: 0,
    beats: 4,
    events: [{ beat: 0, kind: 'cannon' }, { beat: 0.1, kind: 'cannon' }, { beat: 90, kind: 'cannon' }]
  });
  assert.ok(problems.some((one) => one.includes('BPM')));
  assert.ok(problems.some((one) => one.includes('近すぎる')));
  assert.ok(problems.some((one) => one.includes('曲より後ろ')));
});
