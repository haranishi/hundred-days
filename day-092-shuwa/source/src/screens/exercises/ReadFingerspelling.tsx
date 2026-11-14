import { ReadableText } from '../../ui/ReadableText';
import { useEffect, useRef, useState } from 'preact/hooks';
import { fingerspellTokens, tokenSpec } from '../../content/spell';
import type { HandViewHandle } from '../../hand';
import { HandView } from '../../hand';
import type { Exercise } from '../../engine/lesson';
import type { ExerciseProps } from './types';
import { progress, reducedMotion } from '../../app/state';
import { Choices } from './Choices';
export function ReadFingerspelling({ exercise, value, onChange, answered }: ExerciseProps<Extract<Exercise, { kind: 'readFingerspelling' }>>) {
  const hand = useRef<HandViewHandle>(null);
  const [position, setPosition] = useState(0);
  const [slow, setSlow] = useState(false);
  const [run, setRun] = useState(0);
  useEffect(() => { if (slow) hand.current?.replay(0.5); }, [position, run, slow]);
  const tokens = fingerspellTokens(exercise.word.kana);
  useEffect(() => {
    if (reducedMotion.value || answered || position >= tokens.length - 1) return;
    const timer = setTimeout(() => setPosition(position + 1), slow ? 1800 : 900);
    return () => clearTimeout(timer);
  }, [position, slow, run, tokens.length, answered, reducedMotion.value]);
  const token = tokens[position];
  const spec = token && tokenSpec(token);
  return <><h1><ReadableText text="指文字を読んでみよう" /></h1>
    <div class="sign-detail-layout"><div class="exercise-hand">{spec ? <HandView ref={hand} key={`${run}-${position}`} spec={spec} label={`${position + 1}文字目の手の形`} dominant={progress.value.settings.dominant} interactive controls="view" autoplay reducedMotion={reducedMotion.value} size="md" /> : <p><ReadableText text="この文字の手の形は未収録です" /></p>}
    <div class="playback"><button class="text-button" onClick={() => { setPosition(0); setRun(run + 1); }}><ReadableText text="もう一度" /></button><button class="text-button" aria-pressed={slow} onClick={() => { setSlow(!slow); setPosition(0); setRun(run + 1); }}><ReadableText text="ゆっくり" /></button></div>
    <div class="spell-dots" role="group" aria-label="文字の再生位置">{tokens.map((_, index) => <button class={index === position ? 'spell-dot spell-dot--active' : 'spell-dot'} aria-label={`${index + 1}文字目を見る`} aria-current={position === index ? 'step' : undefined} onClick={() => setPosition(index)}><span /></button>)}</div>
    </div><Choices options={exercise.options} selected={value} correctAnswer={exercise.correctAnswer} answered={answered} onSelect={onChange} label="単語の選択肢" render={word => <span>{word}</span>} /></div>
  </>;
}
