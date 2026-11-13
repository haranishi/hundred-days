import { ReadableText } from '../../ui/ReadableText';
import { getItem } from '../../content';
import type { Exercise } from '../../engine/lesson';
import type { ExerciseProps } from './types';
import { Thumbnail } from '../../ui/Thumbnail';
export function SpellWord({ exercise, value, onChange, answered }: ExerciseProps<Extract<Exercise, { kind: 'spellWord' }>>) {
  const selected = Array.isArray(value) ? value : [];
  return <><h1><ReadableText text={`「${exercise.word.kana}」を指文字で`} /></h1><p class="small"><ReadableText text="手の札を順に選んでください。" /><br /><ReadableText text="入れた札を押すと戻せます。" /></p>
    <div class="spell-slots" role="group" aria-label="選んだ手の順番">{exercise.correctAnswer.map((_, index) => {
      const id = selected[index];
      return <button class={`spell-slot ${id ? 'spell-slot--filled' : ''} ${answered && id === exercise.correctAnswer[index] ? 'choice--correct' : ''}`} disabled={!id || answered} aria-label={id ? `${index + 1}番目の手を戻す` : `${index + 1}番目の空の枠`} onClick={() => onChange(selected.filter((_, i) => i !== index))}>{id ? <Thumbnail item={getItem(id)!} size={96} /> : index + 1}{id && <span class="choice__selected-mark" aria-hidden="true">✓</span>}</button>;
    })}</div>
    <div class="choices spell-choices" role="group" aria-label="綴る手の選択肢">{exercise.options.map((id, index) => <button class={`choice ${selected.includes(id) ? 'choice--used' : ''}`} data-shortcut={index + 1} disabled={answered || selected.length >= exercise.correctAnswer.length} onClick={() => onChange([...selected, id])}><Thumbnail item={getItem(id)!} size={88} /></button>)}</div>
  </>;
}
