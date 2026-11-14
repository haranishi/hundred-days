import { COURSES } from '../course/course';
import type { Course, Lesson } from '../course/course';
import type { Progress } from '../store/schema';

export type LessonStatus = 'done' | 'current' | 'open' | 'locked';
export function lessonStatuses(course: Course, completed: Progress['lessons']): Record<string, LessonStatus> {
  const result: Record<string, LessonStatus> = {};
  let previousDone = true;
  let currentAssigned = false;
  for (const unit of course.units) for (const lesson of unit.lessons) {
    const done = (completed[lesson.id] ?? 0) > 0;
    result[lesson.id] = done ? 'done' : !previousDone ? 'locked' : !currentAssigned ? 'current' : 'open';
    if (!done && previousDone) currentAssigned = true;
    previousDone = previousDone && done;
  }
  return result;
}
export function findLesson(id: string): Lesson | undefined {
  return COURSES.flatMap(course => course.units.flatMap(unit => unit.lessons)).find(lesson => lesson.id === id);
}
export function lessonUnitTitle(id: string): string {
  return COURSES.flatMap(course => course.units).find(unit => unit.lessons.some(lesson => lesson.id === id))?.title ?? 'レッスン';
}
