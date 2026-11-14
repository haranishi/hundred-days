import type { Exercise } from '../engine/lesson';
import type { Progress } from '../store/schema';
import { introduceItem, reviewItem } from '../engine/srs';
import { awardXp, lessonXp } from '../engine/xp';
import { updateStreak } from '../engine/streak';
import { evaluate } from '../engine/achievements';

export type PairAnswer = { matched: string[]; hadMismatch: boolean; mismatches?: [string, string][] };
export type ExerciseAnswer = string | string[] | PairAnswer | null;
export function pairMatches(sign: string, label: string): boolean { return sign === label; }
export function answerReady(exercise: Exercise, value: ExerciseAnswer): boolean {
  if (exercise.kind === 'intro' || exercise.kind === 'tryIt') return true;
  if (exercise.kind === 'pairs') return !!value && typeof value === 'object' && !Array.isArray(value)
    && exercise.itemIds.every(id => value.matched.includes(id));
  if (exercise.kind === 'spellWord') return Array.isArray(value) && value.length === exercise.correctAnswer.length
    && value.every(id => exercise.options.includes(id));
  return typeof value === 'string' && 'options' in exercise && exercise.options.includes(value);
}
export function answerCorrect(exercise: Exercise, value: ExerciseAnswer): boolean {
  if (!answerReady(exercise, value)) return false;
  if (exercise.kind === 'intro' || exercise.kind === 'tryIt') return true;
  if (exercise.kind === 'pairs') return !(value as PairAnswer).hadMismatch;
  if (exercise.kind === 'spellWord') return Array.isArray(value)
    && exercise.correctAnswer.every((id, index) => value[index] === id);
  return 'correctAnswer' in exercise && value === exercise.correctAnswer;
}
export function recordIntroduction(state: Progress, id: string, today: string): Progress {
  return state.items[id] ? state : { ...state, items: { ...state.items, [id]: introduceItem(today) } };
}
export function recordExercise(state: Progress, exercise: Exercise, correct: boolean, today: string): Progress {
  if (exercise.kind === 'intro') return recordIntroduction(state, exercise.itemId, today);
  const ids = 'itemId' in exercise ? [exercise.itemId] : exercise.kind === 'pairs' ? exercise.itemIds
    : exercise.kind === 'spellWord' ? exercise.correctAnswer : exercise.sequence;
  const items = { ...state.items };
  for (const id of new Set(ids)) items[id] = reviewItem(items[id] ?? introduceItem(today), correct, today);
  return { ...state, items };
}
export function completeLesson(state: Progress, lessonId: string, perfect: boolean, today: string, review = false, cameraSuccess = false) {
  const xp = lessonXp(perfect, review ? 'review' : 'learn');
  let after = awardXp({ ...state, lessons: { ...state.lessons, [lessonId]: (state.lessons[lessonId] ?? 0) + 1 },
    streak: updateStreak(state.streak, today) }, today, xp);
  const achievements = evaluate(state, { ...after, firstTryPerfect: perfect, cameraSuccess });
  after = { ...after, achievements: { ...after.achievements,
    ...Object.fromEntries(achievements.map(item => [item.id, today])) } };
  return { progress: after, xp, achievements, streakExtended: state.streak.lastDate !== today };
}
