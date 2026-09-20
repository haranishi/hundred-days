import assert from 'node:assert/strict';
import test from 'node:test';
import { decide, wateredMessage } from '../lib/decide.js';

const record = (last, plantedOn = '2026-08-20') => ({ seed: 12, plantedOn, wateredDays: last ? [last] : [] });

test('昨日の水やりは今日押せてしおれない', () => {
  const result = decide(record('2026-09-03'), '2026-09-04');
  assert.equal(result.canWater, true);
  assert.equal(result.daysSinceWater, 1);
  assert.equal(result.wilt, 0);
  assert.equal(result.kind, 'waiting');
});

test('5日ぶりは4/6しおれる', () => {
  const result = decide(record('2026-08-30'), '2026-09-04');
  assert.equal(result.daysSinceWater, 5);
  assert.equal(result.wilt, 4 / 6);
  assert.equal(result.kind, 'missed');
});

test('同じ日は水やり済みになる', () => {
  const result = decide(record('2026-09-03'), '2026-09-03');
  assert.equal(result.canWater, false);
  assert.equal(result.wateredToday, true);
  assert.equal(result.kind, 'done');
});

test('時計が戻ると押せない', () => {
  const result = decide(record('2026-09-05'), '2026-09-04');
  assert.equal(result.canWater, false);
  assert.equal(result.kind, 'clock');
});

test('水やり前は種の状態', () => {
  const result = decide(record(null, null), '2026-09-04');
  assert.deepEqual({ steps: result.steps, ageDays: result.ageDays, kind: result.kind, canWater: result.canWater }, { steps: 0, ageDays: 0, kind: 'seed', canWater: true });
});

test('8日ぶりのしおれは1で頭打ち', () => assert.equal(decide(record('2026-08-27'), '2026-09-04').wilt, 1));

test('水やり後の文言は節目と4種類の通常文を使い分ける', () => {
  const expected = new Map([
    [1, '芽が出ました。また明日'],
    [7, '7日目。最初の1週間です。また明日'],
    [14, '14日目。枝が増えてきました。また明日'],
    [30, '30日目。ひと月ぶんの木です。また明日'],
    [50, '50日目。半分まで来ました。また明日'],
    [100, '100日目。ここまで一緒に育ちました'],
    [8, '今日の一滴をあげました。また明日'],
    [9, '今日のぶん、伸びました。また明日'],
    [10, '新しい葉が出ました。また明日'],
    [11, 'ひとしずく、届きました。また明日']
  ]);
  for (const [steps, message] of expected) assert.equal(wateredMessage(steps), message);
});

test('状態ごとのnoteを返す', () => {
  assert.equal(decide(record('2026-09-04'), '2026-09-04').note, '今日の一滴はあげました。また明日');
  assert.equal(decide(record('2026-09-03'), '2026-09-04').note, '今日の一滴を待っています');
  assert.equal(decide(record('2026-09-02'), '2026-09-04').note, '2日ぶりですね。おかえりなさい');
  assert.equal(decide(record('2026-09-01'), '2026-09-04').note, '3日ぶりですね。おかえりなさい');
  assert.equal(decide(record('2026-08-31'), '2026-09-04').note, '4日ぶりですね。水をあげると元気になります');
  assert.equal(decide(record('2026-09-05'), '2026-09-04').note, '時計が戻っているようです。また明日');
  assert.equal(decide(record(null, null), '2026-09-04').note, '');
});
