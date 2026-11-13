import { getItem } from '../content';
import type { Exercise } from '../engine/lesson';
import type { SessionState } from '../engine/session';
import type { ExerciseAnswer } from '../app/lessonProgress';

export const SESSION_KEY = 'tekotoba:session:v1';
export const STREAK_NOTICE_KEY = 'tekotoba:streak-notice:v1';
export interface SavedSession {
  version: 1;
  lessonId: string;
  route: string;
  session: SessionState;
  exercises: Exercise[];
  matchedWithCamera: boolean;
  value: ExerciseAnswer;
  started: number;
  cameraSuccess: boolean;
  wordNoticeShown: boolean;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 200 && value.every(id => typeof id === 'string' && id.length < 500);
function validExercise(value: unknown): value is Exercise {
  if (!object(value) || typeof value.id !== 'string') return false;
  if (value.kind === 'intro' || value.kind === 'tryIt') return typeof value.itemId === 'string' && !!getItem(value.itemId);
  if (value.kind === 'pairs') return strings(value.itemIds) && value.itemIds.length >= 2 && value.itemIds.length <= 4
    && value.itemIds.every(id => !!getItem(id))
    && strings(value.signOrder) && strings(value.labelOrder)
    && [value.signOrder, value.labelOrder].every(order => order.length === (value.itemIds as string[]).length && new Set(order).size === order.length && order.every(id => (value.itemIds as string[]).includes(id)));
  if (!strings(value.options) || !value.options.length) return false;
  if (value.kind === 'spellWord' || value.kind === 'readFingerspelling') {
    if (!object(value.word) || typeof value.word.kana !== 'string' || typeof value.word.meaning !== 'string') return false;
    return value.kind === 'spellWord' ? strings(value.correctAnswer) && value.correctAnswer.every(id => (value.options as string[]).includes(id)) && value.options.every(id => !!getItem(id))
      : strings(value.sequence) && value.sequence.every(id => !!getItem(id)) && typeof value.correctAnswer === 'string' && value.options.includes(value.correctAnswer);
  }
  return ['signToLabel', 'labelToSign', 'wordMeaning'].includes(String(value.kind))
    && typeof value.itemId === 'string' && value.options.every(id => !!getItem(id)) && value.correctAnswer === value.itemId && value.options.includes(value.itemId);
}
export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw || raw.length > 1_000_000) return null;
    const saved: unknown = JSON.parse(raw);
    if (!object(saved) || saved.version !== 1 || typeof saved.lessonId !== 'string' || typeof saved.route !== 'string'
      || !/^#\/(lesson\/[^/]+|review|practice\/weak)$/.test(saved.route)
      || typeof saved.started !== 'number' || !Number.isFinite(saved.started)
      || !Array.isArray(saved.exercises) || !saved.exercises.length || !saved.exercises.every(validExercise)
      || typeof saved.matchedWithCamera !== 'boolean' || typeof saved.cameraSuccess !== 'boolean' || typeof saved.wordNoticeShown !== 'boolean' || !object(saved.session)) return null;
    const state = saved.session;
    if (!validExercise(state.current) || !Array.isArray(state.queue) || state.queue.length > 500 || !state.queue.every(validExercise)
      || !Array.isArray(state.records) || state.records.length > 5000
      || !state.records.every(record => object(record) && typeof record.exerciseId === 'string' && typeof record.correct === 'boolean')
      || typeof state.answered !== 'boolean' || !Number.isInteger(state.total) || (state.total as number) < 1
      || state.total !== state.queue.length + state.records.length + Number(!state.answered)) return null;
    const value = saved.value;
    if (!(value === null || typeof value === 'string' || strings(value) || (object(value) && strings(value.matched)
      && typeof value.hadMismatch === 'boolean' && (value.mismatches === undefined || (Array.isArray(value.mismatches)
        && value.mismatches.every(pair => strings(pair) && pair.length === 2)))))) return null;
    return saved as unknown as SavedSession;
  } catch { return null; }
}
export function saveSession(saved: SavedSession): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(saved)); } catch { /* 保存不可でも学習は続ける */ }
}
export function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* 保存不可 */ }
}
/** 通知を表示した最終完了日を記録し、同じ途切れを繰り返し知らせない。 */
export function claimStreakNotice(lastDate: string): boolean {
  try {
    if (localStorage.getItem(STREAK_NOTICE_KEY) === lastDate) return false;
    localStorage.setItem(STREAK_NOTICE_KEY, lastDate);
    return true;
  } catch { return false; }
}
