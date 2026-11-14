import { clearSession, STREAK_NOTICE_KEY } from '../store/session';
import { signal, computed } from '@preact/signals';
import { createPersistence } from '../store/persist';
import type { Progress, Settings } from '../store/schema';
import type { Achievement } from '../engine/achievements';
import { createDefaultProgress } from '../store/schema';
import { STORAGE_KEY } from '../store/persist';

const persistence = createPersistence();
const initial = persistence.load();
export const progress = signal(initial.progress);
export const storageAvailable = signal(initial.storageAvailable);
export const recoveryNotice = signal(initial.recovered);
export const systemReducedMotion = signal(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
export const reducedMotion = computed(() => progress.value.settings.reduceMotion || systemReducedMotion.value);
export const sessionActive = signal(false);
export interface LessonResult {
  lessonId: string; title: string; xp: number; accuracy: number; seconds: number;
  streak: number; streakExtended: boolean; achievements: Achievement[];
  repeatHash?: string;
}
export const lastResult = signal<LessonResult | null>(null);
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export const currentDay = signal(localToday());
export function updateProgress(update: (current: Progress) => Progress): void {
  progress.value = update(progress.value);
  storageAvailable.value = persistence.save(progress.value).storageAvailable;
}
export function updateSettings(settings: Partial<Settings>): void {
  updateProgress(current => ({ ...current, settings: { ...current.settings, ...settings } }));
}
export function flushProgress(): void { storageAvailable.value = persistence.flush().storageAvailable; }
export function resetLocalProgress(): void {
  clearSession();
  try { localStorage.removeItem(STREAK_NOTICE_KEY); } catch { /* 保存不可 */ }
  updateProgress(() => createDefaultProgress());
  flushProgress(); lastResult.value = null; recoveryNotice.value = false;
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) if (key?.startsWith(`${STORAGE_KEY}:broken-`)) localStorage.removeItem(key);
  } catch { storageAvailable.value = false; }
}
export function watchPersistence(): () => void {
  const flush = () => { if (document.visibilityState === 'hidden') flushProgress(); };
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', flushProgress);
  const timer = window.setInterval(() => {
    storageAvailable.value = persistence.getSnapshot().storageAvailable;
    currentDay.value = localToday();
  }, 400);
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const change = () => { systemReducedMotion.value = media.matches; };
  media.addEventListener('change', change);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', flush);
    window.removeEventListener('pagehide', flushProgress);
    media.removeEventListener('change', change);
    flushProgress();
  };
}
