import type { Box, ItemProgress, Progress } from '../store/schema';
import { addDays, dayNumber } from './date';
export const INTERVALS = [0, 1, 3, 7, 14, 30] as const;
export function introduceItem(today: string): ItemProgress {
  dayNumber(today);
  return { box: 0, due: today, correct: 0, wrong: 0, introducedAt: today };
}
export function reviewItem(item: ItemProgress, correct: boolean, today: string): ItemProgress {
  dayNumber(today);
  if (correct && item.due > today) return { ...item, correct: item.correct + 1 };
  const box = (correct ? Math.min(5, item.box + 1) : 1) as Box;
  return { ...item, box, due: addDays(today, INTERVALS[box]),
    correct: item.correct + Number(correct), wrong: item.wrong + Number(!correct) };
}
export function dueItems(progress: Pick<Progress, 'items'>, today: string, limit = 12): string[] {
  dayNumber(today);
  return Object.entries(progress.items).filter(([, item]) => item.due <= today)
    .sort(([a, x], [b, y]) => x.due.localeCompare(y.due) || a.localeCompare(b))
    .slice(0, Math.max(0, Math.min(12, Math.floor(limit)))).map(([id]) => id);
}
export function weakItems(progress: Pick<Progress, 'items'>, limit = 12): string[] {
  return Object.entries(progress.items).filter(([, item]) => item.wrong > 0)
    .sort(([a, x], [b, y]) => y.wrong - x.wrong || x.due.localeCompare(y.due) || a.localeCompare(b))
    .slice(0, Math.max(0, Math.min(12, Math.floor(limit)))).map(([id]) => id);
}
