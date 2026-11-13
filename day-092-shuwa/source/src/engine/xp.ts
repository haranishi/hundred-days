import type { Progress } from '../store/schema';
export function lessonXp(firstTryPerfect: boolean, kind: 'learn' | 'review' = 'learn'): number {
  return kind === 'review' ? 5 : 10 + (firstTryPerfect ? 5 : 0);
}
export function todayXp(progress: Pick<Progress, 'xpByDay'>, today: string): number {
  return progress.xpByDay[today] ?? 0;
}
/** 目標の割合は0〜1。超過分の経験値は消さない。 */
export function goalRatio(xp: number, goal: number): number {
  return goal > 0 ? Math.max(0, Math.min(1, xp / goal)) : 0;
}
export function awardXp(progress: Progress, today: string, amount: number): Progress {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('経験値は0以上の整数です');
  return { ...progress, xpByDay: { ...progress.xpByDay, [today]: todayXp(progress, today) + amount } };
}
