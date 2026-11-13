import type { CourseId } from '../course/course';

export type Box = 0 | 1 | 2 | 3 | 4 | 5;
export interface ItemProgress {
  box: Box;
  due: string;
  correct: number;
  wrong: number;
  introducedAt: string;
}
export interface Streak {
  current: number;
  longest: number;
  lastDate: string | null;
}
export interface Settings {
  dominant: 'right' | 'left';
  dailyGoal: 10 | 20 | 30 | 50;
  sound: boolean;
  vibration: boolean;
  camera: boolean;
  reduceMotion: boolean;
  onboarded: boolean;
  startCourse: CourseId;
}
export interface Progress {
  version: 1;
  settings: Settings;
  items: Record<string, ItemProgress>;
  lessons: Record<string, number>;
  xpByDay: Record<string, number>;
  streak: Streak;
  achievements: Record<string, string>;
}

/** 毎回独立した初期値を返す。 */
export function createDefaultProgress(): Progress {
  return {
    version: 1,
    settings: {
      dominant: 'right', dailyGoal: 20, sound: true, vibration: true,
      camera: true, reduceMotion: false, onboarded: false, startCourse: 'kana',
    },
    items: {}, lessons: {}, xpByDay: {},
    streak: { current: 0, longest: 0, lastDate: null }, achievements: {},
  };
}
