import type { Exercise } from '../../engine/lesson';
import type { ExerciseAnswer } from '../../app/lessonProgress';
export interface ExerciseProps<T extends Exercise = Exercise> {
  exercise: T;
  value: ExerciseAnswer;
  onChange(value: ExerciseAnswer): void;
  answered: boolean;
}
