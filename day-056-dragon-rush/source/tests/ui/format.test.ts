// OWNER: tests
// 画面に出す数字の書き方：円は万・億・兆でまとめ、残り時間は切り上げ。
import { describe, expect, it } from 'vitest';
import { formatCountDiff, formatPercent, formatPercentDiff, formatTime, formatYen, formatYenDiff } from '../../src/ui/format';

describe('数字の書き方', () => {
  it('円を万・億・兆でまとめる', () => {
    expect(formatYen(0)).toBe('0円');
    expect(formatYen(9_999)).toBe('9,999円');
    expect(formatYen(123_456_789)).toBe('1億円');
    expect(formatYen(12_345_000_000)).toBe('123億円');
    expect(formatYen(1_234_567_000_000)).toBe('1兆2,345億円');
    expect(formatYen(2_000_000_000_000)).toBe('2兆円');
    expect(formatYen(-5)).toBe('0円');
  });

  it('残り時間は m:ss で、端数は切り上げる（0.2秒残りは 0:01）', () => {
    expect(formatTime(180)).toBe('3:00');
    expect(formatTime(59.2)).toBe('1:00');
    expect(formatTime(0.2)).toBe('0:01');
    expect(formatTime(0)).toBe('0:00');
  });

  it('割合は小数1桁の百分率', () => {
    expect(formatPercent(0.0957)).toBe('9.6%');
    expect(formatPercent(0)).toBe('0.0%');
  });
});

describe('前回との差の書き方（r02-controls）', () => {
  it('符号を必ず付け、破壊率の差はポイントで書く', () => {
    expect(formatYenDiff(12_000_000_000)).toBe('+120億円');
    expect(formatYenDiff(-300_000_000)).toBe('-3億円');
    expect(formatYenDiff(0)).toBe('±0円');
    expect(formatPercentDiff(0.0123)).toBe('+1.2pt');
    expect(formatPercentDiff(-0.004)).toBe('-0.4pt');
    expect(formatPercentDiff(0.0001)).toBe('±0.0pt');
    expect(formatCountDiff(3)).toBe('+3');
    expect(formatCountDiff(-2)).toBe('-2');
    expect(formatCountDiff(0)).toBe('±0');
  });
});
