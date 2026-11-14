import { ITEMS } from '../content';
import type { SignItem } from '../content/types';
import type { CourseId } from '../course/course';
import type { Progress } from '../store/schema';
import { addDays } from '../engine/date';

export const CATALOG_COURSES: { id: CourseId; title: string }[] = [
  { id: 'kana', title: '指文字' }, { id: 'number', title: '数字' }, { id: 'word', title: 'あいさつ' },
];
export function inCourse(item: SignItem, course: CourseId): boolean {
  return course === 'kana' ? item.kind === 'kana' || item.kind === 'modifier' : item.kind === course;
}
export function learnedCounts(state: Progress, items: SignItem[] = ITEMS) {
  return CATALOG_COURSES.map(course => {
    const all = items.filter(item => inCourse(item, course.id));
    return { ...course, total: all.length, learned: all.filter(item => (state.items[item.id]?.box ?? 0) >= 1).length };
  });
}
export function weekXp(state: Progress, today: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, index - 6);
    return { day, label: `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`, xp: state.xpByDay[day] ?? 0 };
  });
}
export function recordShareText(days: number): string {
  return `てことばで手話を${days}日続けています。少しずつ、手になじむ学びを。 #てことば #手話 #100日チャレンジ`;
}
