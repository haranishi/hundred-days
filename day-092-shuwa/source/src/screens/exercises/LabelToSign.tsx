import { getItem } from '../../content';
import type { ExerciseProps } from './types';
import type { Exercise } from '../../engine/lesson';
import { Thumbnail } from '../../ui/Thumbnail';
import { ReadableText } from '../../ui/ReadableText';
import { Choices } from './Choices';
export function LabelToSign({ exercise, value, onChange, answered }: ExerciseProps<Extract<Exercise, { options: string[]; itemId: string }>>) {
  const item = getItem(exercise.itemId)!;
  return <><h1><ReadableText text={`この${item.kind === 'number' ? '数字' : item.kind === 'word' ? 'ことば' : '文字'}を表す手は？`} /></h1><div class="sign-detail-layout"><p class={`sign-label ${item.label.length > 3 ? 'sign-label--word' : ''}`}><ReadableText text={item.label} /></p><Choices options={exercise.options} selected={value} correctAnswer={exercise.correctAnswer} answered={answered} onSelect={onChange} label="手の選択肢" render={id => <Thumbnail item={getItem(id)!} size={140} />} /></div></>;
}
