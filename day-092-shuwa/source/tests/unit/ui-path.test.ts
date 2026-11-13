import { describe, expect, it } from 'vitest';
import type { Course } from '../../src/course/course';
import { lessonStatuses } from '../../src/app/pathModel';
const course: Course = { id: 'kana', title: '指文字', units: [
  { id: 'u1', title: 'あ行', lessons: [{ id: 'a', title: 'あ', kind: 'learn', newItems: ['kana-a'] }, { id: 'b', title: 'まとめ', kind: 'review', newItems: [] }] },
  { id: 'u2', title: 'か行', lessons: [{ id: 'c', title: 'か', kind: 'learn', newItems: ['kana-ka'] }] },
] };
describe('道すじの鍵', () => {
  it('最初のレッスンだけを強調する', () => { expect(lessonStatuses(course, {})).toEqual({ a: 'current', b: 'locked', c: 'locked' }); });
  it('1回以上終えたら次のレッスンを開く', () => { expect(lessonStatuses(course, { a: 2 })).toEqual({ a: 'done', b: 'current', c: 'locked' }); });
  it('ユニットのまとめを終えたら次のユニットを開く', () => { expect(lessonStatuses(course, { a: 1, b: 1 })).toEqual({ a: 'done', b: 'done', c: 'current' }); });
  it('他コースの記録で鍵を開けない', () => { expect(lessonStatuses(course, { other: 4 }).a).toBe('current'); });
  it('全て完了したらスタートを残さない', () => { expect(Object.values(lessonStatuses(course, { a: 1, b: 1, c: 1 }))).toEqual(['done', 'done', 'done']); });
  it('空のコースでも落ちない', () => { expect(lessonStatuses({ ...course, units: [] }, {})).toEqual({}); });
});
