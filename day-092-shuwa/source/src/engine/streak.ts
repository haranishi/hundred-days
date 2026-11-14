import type { Streak } from '../store/schema';
import { dayNumber } from './date';

export function updateStreak(streak: Streak, today: string): Streak {
  const day = dayNumber(today);
  if (streak.lastDate === today) return { ...streak };
  const current = streak.lastDate && day - dayNumber(streak.lastDate) === 1 ? streak.current + 1 : 1;
  return { current, longest: Math.max(streak.longest, current), lastDate: today };
}
export function displayedStreak(streak: Streak, today: string): number {
  const day = dayNumber(today);
  if (!streak.lastDate) return 0;
  const gap = day - dayNumber(streak.lastDate);
  return gap >= 0 && gap <= 1 ? streak.current : 0;
}
