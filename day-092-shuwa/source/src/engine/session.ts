import type { Exercise } from './lesson';
import { shuffle } from './rng';
import type { Rng } from './rng';
export interface AnswerRecord { exerciseId: string; correct: boolean }
export interface SessionState {
  queue: Exercise[];
  current: Exercise | null;
  records: AnswerRecord[];
  answered: boolean;
  total: number;
}
export function createSession(exercises: readonly Exercise[]): SessionState {
  if (new Set(exercises.map(exercise => exercise.id)).size !== exercises.length) {
    throw new Error('問題IDが重複しています');
  }
  return { queue: exercises.slice(1), current: exercises[0] ?? null, records: [], answered: false, total: exercises.length };
}
/** 二重送信・別の問題への回答は状態を変えない。再出題はnextで最後尾へ。 */
export function answer(state: SessionState, exerciseId: string, correct: boolean): SessionState {
  if (!state.current || state.answered || state.current.id !== exerciseId) return state;
  return { ...state, answered: true, records: [...state.records, { exerciseId, correct }] };
}
export function next(state: SessionState, rng: Rng = Math.random): SessionState {
  if (!state.current || !state.answered) return state;
  const queue = [...state.queue];
  const retry = state.records.at(-1)?.correct === false;
  if (retry) {
    const differentOrder = (values: string[]) => {
      const mixed = shuffle(values, rng);
      return mixed.length > 1 && mixed.every((value, index) => value === values[index])
        ? [...mixed.slice(1), mixed[0]!] : mixed;
    };
    const exercise = state.current;
    queue.push('options' in exercise ? { ...exercise, options: differentOrder(exercise.options) }
      : exercise.kind === 'pairs' ? { ...exercise, signOrder: differentOrder(exercise.signOrder), labelOrder: differentOrder(exercise.labelOrder) }
      : exercise);
  }
  return { ...state, total: state.total + Number(retry), current: queue.shift() ?? null, queue, answered: false };
}
export function isFinished(state: SessionState): boolean { return state.current === null; }
export function summary(state: SessionState): { accuracy: number; firstTryPerfect: boolean; correct: number; attempts: number } {
  const correct = state.records.filter(record => record.correct).length;
  return { accuracy: state.records.length ? correct / state.records.length : 0,
    firstTryPerfect: state.total > 0 && isFinished(state) && state.records.every(record => record.correct),
    correct, attempts: state.records.length };
}
