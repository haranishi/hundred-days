import { ALL_ITEM_IDS, KANA_IDS } from '../../src/course/course';
import type { SignItem } from '../../src/content/types';
import { createDefaultProgress } from '../../src/store/schema';
import { introduceItem, reviewItem } from '../../src/engine/srs';

const kana = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'];
export function fixtureItem(id: string, patch: Partial<SignItem> = {}): SignItem {
  const index = KANA_IDS.indexOf(id);
  return { id, kind: id.startsWith('kana-') ? 'kana' : id.startsWith('num-') ? 'number' : id.startsWith('mod-') ? 'modifier' : 'word',
    label: index >= 0 ? kana[index]! : id, sign: { hands: { dominant: { keyframes: [] } } },
    describe: { viewer: '説明', self: '作り方' }, sources: [], confidence: 'high', dynamic: false, ...patch };
}
export function fixtureContent() {
  const data = new Map(ALL_ITEM_IDS.map(id => [id, fixtureItem(id)]));
  return { data, items: (id: string) => data.get(id) };
}
export function learnedProgress(ids: string[]) {
  const progress = createDefaultProgress();
  for (const id of ids) progress.items[id] = reviewItem(introduceItem('2026-11-13'), true, '2026-11-13');
  return progress;
}
