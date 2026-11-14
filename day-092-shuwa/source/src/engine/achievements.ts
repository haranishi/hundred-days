import { COURSES, KANA_IDS } from '../course/course';
import type { Course } from '../course/course';
import type { Progress } from '../store/schema';

/** v1には保存しない、完了イベント由来の評価情報。coursesは試験や更新後の定義を渡せる。 */
export interface AchievementSnapshot extends Progress {
  firstTryPerfect?: boolean;
  cameraSuccess?: boolean;
  courses?: readonly Course[];
}
export interface Achievement { id: string; title: string }
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-lesson', title: '初めてのレッスン' }, { id: 'perfect-lesson', title: '一度で全問正解' },
  ...[3, 7, 30].map(days => ({ id: `streak-${days}`, title: `${days}日連続` })),
  ...(['kana', 'number', 'word'] as const).map(id => ({ id: `course-${id}`, title: `${id === 'kana' ? '指文字' : id === 'number' ? '数字' : 'あいさつ'}コース修了` })),
  { id: 'kana-46', title: '指文字46文字' }, { id: 'camera-first', title: 'カメラで初成功' },
  ...[100, 500].map(xp => ({ id: `xp-${xp}`, title: `${xp}経験値` })),
];
function eligible(state: AchievementSnapshot): Set<string> {
  const ids = new Set<string>();
  if (Object.values(state.lessons).some(count => count > 0)) ids.add('first-lesson');
  if (state.firstTryPerfect) ids.add('perfect-lesson');
  if (state.cameraSuccess) ids.add('camera-first');
  for (const days of [3, 7, 30]) if (state.streak.longest >= days) ids.add(`streak-${days}`);
  for (const course of state.courses ?? COURSES) {
    const lessons = course.units.flatMap(unit => unit.lessons);
    if (lessons.length && lessons.every(lesson => (state.lessons[lesson.id] ?? 0) > 0)) ids.add(`course-${course.id}`);
  }
  if (KANA_IDS.every(id => (state.items[id]?.box ?? 0) >= 1)) ids.add('kana-46');
  const xp = Object.values(state.xpByDay).reduce((sum, amount) => sum + amount, 0);
  for (const threshold of [100, 500]) if (xp >= threshold) ids.add(`xp-${threshold}`);
  return ids;
}
export function evaluate(before: AchievementSnapshot, after: AchievementSnapshot): Achievement[] {
  const previous = eligible(before);
  const current = eligible(after);
  return ACHIEVEMENTS.filter(achievement => current.has(achievement.id) && !previous.has(achievement.id)
    && !Object.hasOwn(before.achievements, achievement.id) && !Object.hasOwn(after.achievements, achievement.id));
}
