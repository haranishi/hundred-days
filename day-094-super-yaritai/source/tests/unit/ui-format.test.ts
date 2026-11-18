// 画面に出す文字の組み立て（純粋な部分）：点の書き方・試合の長さ・結果の見出し。
import { describe, expect, it } from 'vitest';
import { MATCH } from '../../src/shared/rules/tuning';
import type { MatchResult, PlayerResult } from '../../src/shared/view';
import { formatPoints } from '../../src/client/ui/screens/dom';
import { durationLabel } from '../../src/client/ui/screens/online';
import { headlineFor } from '../../src/client/ui/screens/results';

function p(slot: number, name: string, score: number, rank: number): PlayerResult {
  return { slot, kind: 'human', name, character: 'ch/character-female-b', score, rank, title: '', complete: false, achieved: [], secrets: [], breakdown: {}, caught: 0 };
}

function result(players: PlayerResult[], winnerSlots: number[]): MatchResult {
  return { duration: 120, players, winnerSlots, damage: 0, aborted: false };
}

describe('点の書き方', () => {
  it('3桁ごとにカンマ。小数は丸め、負はマイナス記号', () => {
    expect(formatPoints(0)).toBe('0');
    expect(formatPoints(999)).toBe('999');
    expect(formatPoints(12340)).toBe('12,340');
    expect(formatPoints(1234567)).toBe('1,234,567');
    expect(formatPoints(10.6)).toBe('11');
    expect(formatPoints(-1500)).toBe('−1,500');
    expect(formatPoints(Number.NaN)).toBe('0');
  });
});

describe('試合の長さ', () => {
  it('90・120・180秒を「1分半・2分・3分」と書く', () => {
    expect(MATCH.durations.map(durationLabel)).toEqual(['1分半', '2分', '3分']);
    expect(durationLabel(45)).toBe('45秒');
    expect(durationLabel(60)).toBe('1分');
  });
});

describe('結果の見出し', () => {
  const a = p(0, 'ミカン', 5000, 1);
  const b = p(1, 'ケンタ', 3000, 2);
  it('自分が勝てば「あなたの勝ち！」', () => {
    expect(headlineFor(result([a, b], [0]), 0)).toEqual({ text: 'あなたの勝ち！', tone: 'win' });
  });
  it('ほかの人が勝てば名前で', () => {
    expect(headlineFor(result([a, b], [0]), 1)).toEqual({ text: 'ミカンの勝ち', tone: 'lose' });
  });
  it('勝者が2人以上ならひきわけ', () => {
    expect(headlineFor(result([a, { ...b, score: 5000, rank: 1 }], [0, 1]), 0).tone).toBe('draw');
    expect(headlineFor(result([a, { ...b, score: 5000, rank: 1 }], [0, 1]), 0).text).toBe('ひきわけ！');
  });
  it('名前が空ならキャラの名前、それも無ければ番号', () => {
    expect(headlineFor(result([{ ...a, name: '' }, b], [0]), 1).text).toBe('ミカンの勝ち');
    expect(headlineFor(result([{ ...a, name: '', character: 'ch/unknown' }, b], [0]), 1).text).toBe('1Pの勝ち');
  });
  it('勝者がいなければ「試合終了」', () => {
    expect(headlineFor(result([a, b], []), 0)).toEqual({ text: '試合終了', tone: 'draw' });
  });
});
