import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDays, clampOffset, dateKey, differenceDays, formatDate, formatTime,
  harvestMoonInfo, jstMidnight, lunarDayFor, moonName, nowFromSearch,
  parseAt, phaseState
} from '../lib/koyomi.js';

test('?at= は日本時間として解釈する', () => {
  assert.equal(parseAt('2026-09-02T21:00'), Date.UTC(2026, 8, 2, 12));
});

for (const value of ['2026-9-02T21:00', '2026-09-02 21:00', '2026-02-30T12:00', '2026-09-02T24:00', 'x']) {
  test(`不正なat ${value} はnull`, () => assert.equal(parseAt(value), null));
}

test('不正なatはfallbackを使う', () => assert.equal(nowFromSearch('?at=bad', 1234), 1234));
test('端末TZによらずJST暦日を作る', () => assert.equal(dateKey(Date.UTC(2026, 8, 1, 15)), '2026-09-02'));
test('JST 0:00をUTC instantへ直す', () => assert.equal(jstMidnight('2026-09-02'), Date.UTC(2026, 8, 1, 15)));
test('月末をまたいで日を足す', () => assert.equal(addDays('2026-09-30', 1), '2026-10-01'));
test('日付差はUTC+9暦日の整数日', () => assert.equal(differenceDays('2026-09-02', '2026-09-25'), 23));
test('日付表示に曜日を付ける', () => assert.equal(formatDate('2026-09-02'), '9月2日（水）'));
test('時刻は秒を最寄り分へ丸める', () => assert.equal(formatTime(Date.UTC(2026, 8, 2, 11, 38, 40)), '20:39'));

for (const [day, expected] of [[1,'新月（朔）'],[3,'三日月'],[13,'十三夜'],[15,'十五夜'],[16,'十六夜'],[21,'二十一日の月'],[30,'三十日月']]) {
  test(`旧暦日${day}の呼び名`, () => assert.equal(moonName(day), expected));
}

test('直前の朔の暦日を1日目にする', () => {
  assert.equal(lunarDayFor('2026-09-02', Date.UTC(2026, 7, 12, 17, 37)), 21);
});

test('2026年の名月までは9/2から23日', () => {
  const info = harvestMoonInfo('2026-09-02');
  assert.equal(info.target, '2026-09-25');
  assert.equal(info.remaining, 23);
  assert.equal(info.fullOffset, 2);
  assert.equal(info.fullText, '満月は名月の2日後（9/27 1:49）');
});

test('2026年9月25日は今夜が中秋の名月', () => assert.equal(harvestMoonInfo('2026-09-25').lead, '今夜が中秋の名月'));
test('2030年は名月と満月が同じ日', () => {
  const info = harvestMoonInfo('2030-09-12');
  assert.equal(info.fullOffset, 0);
  assert.equal(info.fullText, '満月は名月と同じ日（6:18）');
});
test('過ぎた名月は翌年の日付を返す', () => assert.match(harvestMoonInfo('2026-10-01').lead, /2027年9月15日/));
test('表にない年は未収録', () => assert.equal(harvestMoonInfo('2033-09-01').mode, 'missing'));

for (const [input, expected] of [[-99,-30],[99,30],[2.6,3],['bad',0]]) {
  test(`offset ${input} を範囲内にする`, () => assert.equal(clampOffset(input), expected));
}

test('新月の状態文', () => assert.equal(phaseState({ fraction: .01, waxing: true }), '新月のころ'));
test('満月の状態文', () => assert.equal(phaseState({ fraction: .99, waxing: false }), '満月のころ'));
test('上弦の状態文', () => assert.equal(phaseState({ fraction: .5, waxing: true }), '上弦のころ'));
test('下弦の状態文', () => assert.equal(phaseState({ fraction: .5, waxing: false }), '下弦のころ'));
test('途中の状態文', () => assert.equal(phaseState({ fraction: .7, waxing: false }), '欠けていく途中'));
