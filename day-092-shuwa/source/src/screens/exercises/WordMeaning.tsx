import { ReadableText } from '../../ui/ReadableText';
import { getItem } from '../../content';
import type { ExerciseProps } from './types';
import type { Exercise } from '../../engine/lesson';
import { Sign } from './Sign';
import { Choices } from './Choices';
export function WordMeaning({ exercise, value, onChange, answered }: ExerciseProps<Extract<Exercise, { options: string[]; itemId: string }>>) {
  const item = getItem(exercise.itemId)!;
  return <><h1><ReadableText text="この手話は、どんな意味？" /></h1><div class="sign-detail-layout"><Sign item={item} size="md" spec={{ ...item.sign, body: true }} autoplay loop />
    <Choices options={exercise.options} selected={value} correctAnswer={exercise.correctAnswer} answered={answered} onSelect={onChange} label="意味の選択肢" render={id => <span><ReadableText text={getItem(id)?.meaning ?? getItem(id)?.label ?? ''} /></span>} /></div></>;
}
