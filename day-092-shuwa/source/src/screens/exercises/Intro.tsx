import { useState } from 'preact/hooks';
import { getItem } from '../../content';
import type { ExerciseProps } from './types';
import { ReadableText } from '../../ui/ReadableText';
import { Sign } from './Sign';
import { mirrorText } from '../../content/mirror';
import { progress } from '../../app/state';
export function Intro({ exercise }: ExerciseProps<Extract<import('../../engine/lesson').Exercise, { kind: 'intro' | 'tryIt' }>>) {
  const [perspective, setPerspective] = useState<'viewer' | 'self'>('viewer');
  const item = getItem(exercise.itemId)!;
  return <div class="intro-exercise">
    <p class="eyebrow"><ReadableText text={`新しい${item.kind === 'kana' ? '指文字' : item.kind === 'number' ? '数字' : item.kind === 'word' ? 'あいさつ' : '指文字の変化'}`} /></p>
    <h1 class={`sign-label ${item.label.length > 3 ? 'sign-label--word' : ''}`}><ReadableText text={item.label} /></h1><p class="reading"><ReadableText text={item.reading ?? ''} /></p>
    <div class="sign-detail-layout"><Sign item={item} onPerspectiveChange={setPerspective} size="md" />
    <div class="card description"><h2><ReadableText text={perspective === 'self' ? '自分で作るときのコツ' : item.kind === 'word' ? '相手から見た動き' : '相手から見た形'} /></h2><p><ReadableText text={mirrorText(item.describe[perspective], progress.value.settings.dominant)} /></p>
      {item.memory && <><h2><ReadableText text={item.memory.kind === 'origin' ? '由来' : '覚え方の例'} /></h2><p><ReadableText text={mirrorText(item.memory.text, progress.value.settings.dominant)} /></p></>}
      {item.confusables?.map(other => <p><strong><ReadableText text={`「${getItem(other.id)?.label ?? other.id}」との見分け方`} /></strong><br /><ReadableText text={mirrorText(other.tip, progress.value.settings.dominant)} /></p>)}
    </div></div>
  </div>;
}
