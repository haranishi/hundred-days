import { describe, expect, it } from 'vitest';
import { ALL_ITEM_IDS, COURSES, createCourses, KANA_IDS } from '../../src/course/course';
import { getItem } from '../../src/content';
import { fixtureContent } from './engine-fixtures';

describe('コースの並び', () => {
  it('3コースと指定のユニット数・数字の順を持つ', () => {
    const courses = createCourses(fixtureContent().items);
    expect(courses.map(course => course.id)).toEqual(['kana', 'number', 'word']);
    expect(courses.map(course => course.units.length)).toEqual([7, 3, 5]);
    expect(courses[1]!.units.map(unit => unit.title)).toEqual(['1〜5', '6〜10', '0・100・1000']);
    const numbers = courses[1]!.units.flatMap(unit => unit.lessons.flatMap(lesson => lesson.newItems));
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 100, 1000].map(n => `num-${n}`));
  });
  it('各行は3+2、新出は最大3、IDは一意、各ユニット末尾は全項目の復習', () => {
    const courses = createCourses(fixtureContent().items);
    const lessons = courses.flatMap(course => course.units.flatMap(unit => unit.lessons));
    expect(new Set(lessons.map(lesson => lesson.id)).size).toBe(lessons.length);
    expect(lessons.every(lesson => lesson.newItems.length <= 3)).toBe(true);
    expect(courses[0]!.units[0]!.lessons.slice(0, -1).map(lesson => lesson.newItems.length)).toEqual([3, 2, 3, 2]);
    for (const course of courses) for (const unit of course.units) {
      const review = unit.lessons.at(-1)!;
      expect(review.kind).toBe('review');
      if (unit.id === 'kana-unit-7') expect(review.reviewItems).toEqual(KANA_IDS);
      else expect(review.reviewItems).toEqual(unit.lessons.flatMap(lesson => lesson.newItems));
    }
    expect(new Set(lessons.flatMap(lesson => lesson.newItems)).size).toBe(ALL_ITEM_IDS.length);
  });
  it('未収録とlowを除外し、mediumを残して、空レッスンも除外する', () => {
    const { items, data } = fixtureContent();
    data.delete('kana-a');
    data.get('kana-i')!.confidence = 'low';
    data.get('kana-u')!.confidence = 'medium';
    const lessons = createCourses(items)[0]!.units[0]!.lessons;
    expect(lessons[0]!.newItems).toEqual(['kana-u']);
    expect(createCourses(() => undefined).every(course => course.units.length === 0)).toBe(true);
    for (const course of COURSES) for (const unit of course.units) for (const lesson of unit.lessons) {
      for (const id of [...lesson.newItems, ...(lesson.reviewItems ?? [])]) {
        expect(getItem(id)).toBeDefined();
        expect(getItem(id)!.confidence).not.toBe('low');
      }
    }
  });
});
