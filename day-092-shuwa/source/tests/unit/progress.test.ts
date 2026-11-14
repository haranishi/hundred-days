import { describe, expect, it } from 'vitest';
import { addDays, dayNumber } from '../../src/engine/date';
import { displayedStreak, updateStreak } from '../../src/engine/streak';
import { INTERVALS, dueItems, introduceItem, reviewItem, weakItems } from '../../src/engine/srs';
import { awardXp, goalRatio, lessonXp, todayXp } from '../../src/engine/xp';
import { evaluate } from '../../src/engine/achievements';
import { createCourses, KANA_IDS } from '../../src/course/course';
import { createDefaultProgress } from '../../src/store/schema';
import type { Streak } from '../../src/store/schema';
import { fixtureContent, learnedProgress } from './engine-fixtures';

describe('暦日と連続記録', () => {
  const empty: Streak = { current: 0, longest: 0, lastDate: null };
  it('最初の日は1、同じ日に2回終えても増えず、翌日は増える', () => {
    const first = updateStreak(empty, '2026-11-13');
    expect(first).toEqual({ current: 1, longest: 1, lastDate: '2026-11-13' });
    expect(updateStreak(first, '2026-11-13')).toEqual(first);
    expect(updateStreak(first, '2026-11-14').current).toBe(2);
    expect(empty.current).toBe(0);
  });
  it.each([
    ['2026-01-31', '2026-02-01'], ['2026-12-31', '2027-01-01'],
    ['2024-02-28', '2024-02-29'], ['2024-02-29', '2024-03-01'], ['2025-02-28', '2025-03-01'],
  ])('%sから%sも翌日として数える', (lastDate, today) => {
    expect(updateStreak({ current: 3, longest: 3, lastDate }, today)).toEqual({ current: 4, longest: 4, lastDate: today });
    expect(addDays(lastDate, 1)).toBe(today);
  });
  it('休んだら1から、表示は0になり、最長は残る', () => {
    const streak = { current: 4, longest: 8, lastDate: '2026-11-10' };
    expect(displayedStreak(streak, '2026-11-10')).toBe(4);
    expect(displayedStreak(streak, '2026-11-11')).toBe(4);
    expect(displayedStreak(streak, '2026-11-12')).toBe(0);
    expect(updateStreak(streak, '2026-11-13')).toEqual({ current: 1, longest: 8, lastDate: '2026-11-13' });
    expect(displayedStreak(empty, '2026-11-13')).toBe(0);
  });
  it('存在しない日付を拒否する', () => {
    expect(() => dayNumber('2025-02-29')).toThrow();
    expect(() => dayNumber('2026-1-1')).toThrow();
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
  });
});
describe('復習の段と期日', () => {
  it('紹介は当日期日で段0、期日の正解で段と間隔を進め段5で止める', () => {
    let item = introduceItem('2024-02-28');
    expect(item).toEqual({ box: 0, due: '2024-02-28', correct: 0, wrong: 0, introducedAt: '2024-02-28' });
    for (let box = 1; box <= 5; box++) {
      const today = item.due;
      item = reviewItem(item, true, today);
      expect(item.box).toBe(box);
      expect(item.due).toBe(addDays(today, INTERVALS[box]!));
    }
    const capped = reviewItem(item, true, '2026-12-31');
    expect(capped.box).toBe(5);
    expect(capped.due).toBe('2027-01-30');
    expect(capped.correct).toBe(6);
  });
  it('1日に何回正解しても段階は1つまで、翌日の正解で次の段階へ進む', () => {
    let item = introduceItem('2026-11-13');
    for (let i = 0; i < 8; i++) item = reviewItem(item, true, '2026-11-13');
    expect(item).toMatchObject({ box: 1, due: '2026-11-14', correct: 8 });
    item = reviewItem(item, true, '2026-11-14');
    expect(item).toMatchObject({ box: 2, due: '2026-11-17', correct: 9 });
    expect(reviewItem(item, true, '2026-11-15')).toMatchObject({ box: 2, due: '2026-11-17', correct: 10 });
  });
  it('同日のまちがいの後に正解しても段1・翌日のまま', () => {
    const wrong = reviewItem(reviewItem(introduceItem('2026-11-13'), true, '2026-11-13'), false, '2026-11-13');
    expect(reviewItem(wrong, true, '2026-11-13')).toMatchObject({ box: 1, due: '2026-11-14', correct: 2, wrong: 1 });
  });
  it('まちがえると段1で翌日に戻り、紹介日と正解数は残す', () => {
    const item = { ...introduceItem('2026-11-01'), box: 5 as const, correct: 9 };
    expect(reviewItem(item, false, '2026-11-13')).toEqual({ ...item, box: 1, due: '2026-11-14', wrong: 1 });
    expect(item.box).toBe(5);
  });
  it('期日順に最大12件、未来分を除外し、指定上限も守る', () => {
    const progress = createDefaultProgress();
    for (let i = 0; i < 20; i++) progress.items[`item-${i}`] = { ...introduceItem('2026-11-01'), due: addDays('2026-11-01', i) };
    expect(dueItems(progress, '2026-11-15')).toEqual(Array.from({ length: 12 }, (_, i) => `item-${i}`));
    expect(dueItems(progress, '2026-11-15', 50)).toHaveLength(12);
    expect(dueItems(progress, '2026-11-02', 1)).toEqual(['item-0']);
    expect(dueItems(progress, '2026-10-31')).toEqual([]);
    expect(dueItems(progress, '2026-11-15', -1)).toEqual([]);
  });
  it('苦手は誤答数の多い順で最大12件、誤答0は含めない', () => {
    const progress = createDefaultProgress();
    for (let i = 0; i < 20; i++) progress.items[`item-${i}`] = { ...introduceItem('2026-11-01'), wrong: i };
    expect(weakItems(progress)).toHaveLength(12);
    expect(weakItems(progress, 2)).toEqual(['item-19', 'item-18']);
    expect(weakItems(progress, 30)).not.toContain('item-0');
  });
});
describe('経験値', () => {
  it('通常10、一度で正解15、復習5を与える', () => {
    expect(lessonXp(false)).toBe(10);
    expect(lessonXp(true)).toBe(15);
    expect(lessonXp(false, 'review')).toBe(5);
    expect(lessonXp(true, 'review')).toBe(5);
  });
  it('日別に加算し、目標の割合を0〜1に収める', () => {
    const before = createDefaultProgress();
    const after = awardXp(awardXp(before, '2026-11-13', 15), '2026-11-13', 10);
    expect(todayXp(after, '2026-11-13')).toBe(25);
    expect(todayXp(after, '2026-11-14')).toBe(0);
    expect(before.xpByDay).toEqual({});
    expect(goalRatio(10, 20)).toBe(0.5);
    expect(goalRatio(25, 20)).toBe(1);
    expect(goalRatio(-5, 20)).toBe(0);
    expect(goalRatio(10, 0)).toBe(0);
    expect(() => awardXp(before, '2026-11-13', -1)).toThrow();
  });
});
describe('実績', () => {
  it('初レッスン・全問正解・カメラ・連続・経験値を新規取得分だけ返す', () => {
    const before = createDefaultProgress();
    const after = { ...before, lessons: { demo: 1 }, firstTryPerfect: true, cameraSuccess: true,
      streak: { current: 30, longest: 30, lastDate: '2026-11-13' }, xpByDay: { '2026-11-13': 500 } };
    expect(evaluate(before, after).map(item => item.id)).toEqual([
      'first-lesson', 'perfect-lesson', 'streak-3', 'streak-7', 'streak-30', 'camera-first', 'xp-100', 'xp-500',
    ]);
    expect(evaluate(after, after)).toEqual([]);
    const awarded = { ...before, achievements: { 'perfect-lesson': '2026-11-12' } };
    expect(evaluate(awarded, after).map(item => item.id)).not.toContain('perfect-lesson');
  });
  it('各コースは全レッスンの完了が必要で、空コースは修了にしない', () => {
    const { items } = fixtureContent();
    const courses = createCourses(items);
    const before = { ...createDefaultProgress(), courses };
    const after = { ...before, lessons: Object.fromEntries(courses.flatMap(course => course.units.flatMap(unit => unit.lessons.map(lesson => [lesson.id, 1])))) };
    expect(evaluate(before, after).filter(item => item.id.startsWith('course-'))).toHaveLength(3);
    after.lessons['kana-unit-1-lesson-1'] = 0;
    expect(evaluate(before, after).map(item => item.id)).not.toContain('course-kana');
    expect(evaluate(createDefaultProgress(), { ...createDefaultProgress(), courses: createCourses(() => undefined) })).toEqual([]);
  });
  it('指文字46文字はすべて段1以上で取得する', () => {
    const before = createDefaultProgress();
    const after = learnedProgress(KANA_IDS);
    expect(KANA_IDS).toHaveLength(46);
    expect(evaluate(before, after).map(item => item.id)).toContain('kana-46');
    after.items['kana-n']!.box = 0;
    expect(evaluate(before, after).map(item => item.id)).not.toContain('kana-46');
  });
});
