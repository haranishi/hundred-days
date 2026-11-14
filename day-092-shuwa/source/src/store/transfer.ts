import { isDate } from '../engine/date';
import type { Progress } from './schema';
export type ImportResult = { ok: true; progress: Progress } | { ok: false; reason: string };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const safeKey = (key: string) => key.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(key);

/** ファイルと保存領域の読み込みに同じ境界検査を使う。 */
export function validateProgress(value: unknown): ImportResult {
  if (!record(value)) return { ok: false, reason: '記録はJSONのオブジェクトで指定してください。' };
  if (value.version !== 1) return { ok: false, reason: 'この記録の版には対応していません（対応版: 1）。' };
  const settings = value.settings;
  if (!record(settings) || typeof settings.dominant !== 'string' || !['right', 'left'].includes(settings.dominant)
    || ![10, 20, 30, 50].includes(settings.dailyGoal as number)
    || typeof settings.startCourse !== 'string' || !['kana', 'number', 'word'].includes(settings.startCourse)
    || !['sound', 'vibration', 'camera', 'reduceMotion', 'onboarded'].every(key => typeof settings[key] === 'boolean')) {
    return { ok: false, reason: '設定の型または値が正しくありません。' };
  }
  if (!record(value.items)) return { ok: false, reason: '項目ごとの学習記録がありません。' };
  for (const [id, item] of Object.entries(value.items)) {
    if (!safeKey(id) || !record(item) || !count(item.box) || item.box > 5
      || !count(item.correct) || !count(item.wrong) || !isDate(item.due) || !isDate(item.introducedAt)) {
      return { ok: false, reason: '項目の段・期日・正誤回数・紹介日のいずれかが正しくありません。' };
    }
  }
  if (!record(value.lessons) || !Object.entries(value.lessons).every(([id, n]) => safeKey(id) && count(n))) {
    return { ok: false, reason: 'レッスン完了回数は0以上の整数で指定してください。' };
  }
  if (!record(value.xpByDay) || !Object.entries(value.xpByDay).every(([day, n]) => isDate(day) && count(n))) {
    return { ok: false, reason: '日別経験値の日付または値が正しくありません。' };
  }
  const streak = value.streak;
  if (!record(streak) || !count(streak.current) || !count(streak.longest) || streak.longest < streak.current
    || !(streak.lastDate === null || isDate(streak.lastDate)) || (streak.lastDate === null && streak.current !== 0)) {
    return { ok: false, reason: '連続記録の日数または最終日が正しくありません。' };
  }
  if (!record(value.achievements) || !Object.entries(value.achievements).every(([id, day]) => safeKey(id) && isDate(day))) {
    return { ok: false, reason: '実績のIDまたは取得日が正しくありません。' };
  }
  // 未知のフィールドは保存形式に持ち込まず、参照も共有しない。
  const data = value as unknown as Progress;
  return { ok: true, progress: {
    version: 1,
    settings: { dominant: data.settings.dominant, dailyGoal: data.settings.dailyGoal,
      sound: data.settings.sound, vibration: data.settings.vibration, camera: data.settings.camera,
      reduceMotion: data.settings.reduceMotion, onboarded: data.settings.onboarded, startCourse: data.settings.startCourse },
    items: Object.fromEntries(Object.entries(data.items).map(([id, item]) => [id, {
      box: item.box, due: item.due, correct: item.correct, wrong: item.wrong, introducedAt: item.introducedAt,
    }])),
    lessons: { ...data.lessons }, xpByDay: { ...data.xpByDay },
    streak: { current: data.streak.current, longest: data.streak.longest, lastDate: data.streak.lastDate },
    achievements: { ...data.achievements },
  } };
}
export function importProgress(json: string): ImportResult {
  try { return validateProgress(JSON.parse(json)); }
  catch { return { ok: false, reason: 'JSON形式を読み取れません。ファイルの内容を確認してください。' }; }
}
export function exportProgress(progress: Progress): string {
  const result = validateProgress(progress);
  if (!result.ok) throw new Error(result.reason);
  return JSON.stringify(result.progress, null, 2);
}
export function exportFilename(today: string): string {
  if (!isDate(today)) throw new RangeError('書き出しの日付が正しくありません');
  return `tekotoba-progress-${today.replaceAll('-', '')}.json`;
}
