import { useState } from 'preact/hooks';
import { getItem } from '../../content';
import type { SignItem } from '../../content/types';
import { mirrorText } from '../../content/mirror';
import { progress } from '../../app/state';
import { spellingItems } from '../../engine/fingerspelling';
import type { Exercise } from '../../engine/lesson';
import type { ExerciseAnswer, PairAnswer } from '../../app/lessonProgress';
import { Thumbnail } from '../../ui/Thumbnail';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { ReadableText } from '../../ui/ReadableText';
import { Sign } from './Sign';

export function MistakeDetail({ exercise, value }: { exercise: Exercise; value: ExerciseAnswer }) {
  const [expanded, setExpanded] = useState<SignItem | null>(null);
  const describe = (text: string) => mirrorText(text, progress.value.settings.dominant);
  const difference = (a: string[], b: string[]) => {
    const index = a.findIndex((id, index) => id !== b[index]);
    const first = getItem(a[index < 0 ? 0 : index] ?? '');
    const second = getItem(b[index < 0 ? 0 : index] ?? '');
    if (!first || !second || first.id === second.id) return null;
    const tip = first.confusables?.find(other => other.id === second.id)?.tip
      ?? second.confusables?.find(other => other.id === first.id)?.tip;
    return <p class="feedback__difference"><strong><ReadableText text="見分けるヒント" /></strong><br /><ReadableText text={describe(tip ?? `${first.label}：${first.describe.viewer} ／ ${second.label}：${second.describe.viewer}`)} /></p>;
  };
  const row = (title: string, ids: string[], label: string) => <div class="feedback__comparison">
    <strong><ReadableText text={`${title}：${label}`} /></strong><div class="feedback__items">{ids.map((id, index) => {
      const item = getItem(id);
      return item && <div class="feedback__item" key={`${id}-${index}`}><figure><button class={`feedback__enlarge ${title !== 'あなたの答え' ? 'correct-answer-card' : ''}`} aria-label={`「${item.label}」の手を大きく見る`} onClick={() => setExpanded(item)}><Thumbnail item={item} size={56} />{title !== 'あなたの答え' && <span class="choice__mark" aria-hidden="true">✓</span>}</button><figcaption><ReadableText text={item.label} /></figcaption></figure><p><ReadableText text={describe(item.describe.viewer)} /></p></div>;
    })}</div></div>;
  let detail;
  if (exercise.kind === 'pairs') {
    const pairs = (value as PairAnswer | null)?.mismatches ?? [];
    detail = pairs.map(([a, b]) => <div key={`${a}-${b}`}>
      <p><ReadableText text={`${getItem(a)?.label} と ${getItem(b)?.label} を取りちがえました`} /></p>
      {row('正しいペア', [a, b], `${getItem(a)?.label}の手＝${getItem(a)?.label}、${getItem(b)?.label}の手＝${getItem(b)?.label}`)}
      {difference([a], [b])}
    </div>);
  } else {
    const correctIds = 'itemId' in exercise ? [exercise.itemId] : exercise.kind === 'spellWord' ? exercise.correctAnswer : exercise.sequence;
    const selectedIds = Array.isArray(value) ? value : typeof value === 'string'
      ? exercise.kind === 'readFingerspelling' ? spellingItems(value) ?? [] : [value] : [];
    // 選択肢に出ていた言葉にそろえる：意味を選ぶ問題は意味、それ以外は名前（あいさつでも「こんばんは」）
    const label = (ids: string[]) => ids.map(id => (exercise.kind === 'wordMeaning' ? getItem(id)?.meaning : undefined) ?? getItem(id)?.label ?? '').join('・');
    detail = <>
      {row('正解', correctIds, exercise.kind === 'readFingerspelling' || exercise.kind === 'spellWord' ? exercise.word.kana : label(correctIds))}
      {row('あなたの答え', selectedIds, exercise.kind === 'readFingerspelling' && typeof value === 'string' ? value : label(selectedIds))}
      {difference(correctIds, selectedIds)}
    </>;
  }
  return <><div class="feedback__detail feedback__detail--comparison">{detail}</div>
    {expanded && <Sheet title={`「${expanded.label}」の手`} onClose={() => setExpanded(null)}><Sign item={expanded} /><p><ReadableText text={describe(expanded.describe.viewer)} /></p><Button secondary onClick={() => setExpanded(null)}><ReadableText text="とじる" /></Button></Sheet>}
  </>;
}
