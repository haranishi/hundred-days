import { ReadableText } from '../../ui/ReadableText';
import { getItem } from '../../content';
import type { ExerciseProps } from './types';
import type { Exercise } from '../../engine/lesson';
import { Sign } from './Sign';
import { Choices } from './Choices';
export function SignToLabel({ exercise, value, onChange, answered }: ExerciseProps<Extract<Exercise, { options: string[]; itemId: string }>>) {
  const kind = getItem(exercise.itemId)?.kind;
  return <><h1><ReadableText text={kind === 'word' ? 'この手話は、どんな意味？' : `この手は、どの${kind === 'number' ? '数字' : '文字'}？`} /></h1><div class="sign-detail-layout"><Sign item={getItem(exercise.itemId)!} size="md" /><Choices options={exercise.options} selected={value} correctAnswer={exercise.correctAnswer} answered={answered} onSelect={onChange} label="文字の選択肢" render={id => <span class={kind === 'word' || (getItem(id)?.label.length ?? 0) > 3 ? 'choice__word' : 'choice__letter'}><ReadableText text={getItem(id)?.label ?? ''} /></span>} /></div></>;
}
