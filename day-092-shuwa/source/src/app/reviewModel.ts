import { getItem } from '../content';
import type { ItemLookup } from '../course/course';
import type { Progress } from '../store/schema';
import { dueItems, weakItems } from '../engine/srs';
import { buildLesson } from '../engine/lesson';
import type { Exercise } from '../engine/lesson';
import { mulberry32 } from '../engine/rng';

export function reviewQueue(state: Progress, today: string, weak = false, lookup: ItemLookup = getItem) {
  const items = Object.fromEntries(Object.entries(state.items).filter(([id]) => {
    const item = lookup(id); return item && item.confidence !== 'low';
  }));
  return {
    count: Object.values(items).filter(item => weak ? item.wrong > 0 : item.due <= today).length,
    ids: weak ? weakItems({ items }) : dueItems({ items }, today),
  };
}

/** 共通出題器から1項目につき1問を取り、期日／苦手順を維持する。 */
export function reviewExercises(ids: string[], state: Progress, lookup: ItemLookup = getItem): Exercise[] {
  return ids.slice(0, 12).flatMap((id, index) => {
    const item = lookup(id);
    if (!item || item.confidence === 'low') return [];
    const exercises = buildLesson({ id: `review-${index}`, title: '復習', kind: 'review', newItems: [], reviewItems: [id] }, state,
      { rng: mulberry32(Date.now() + index), cameraEnabled: false, items: lookup, vocab: [] });
    const exercise = exercises.find(exercise => exercise.kind === (item.kind === 'word' ? 'wordMeaning' : 'labelToSign'));
    return exercise ? [exercise] : [];
  });
}
