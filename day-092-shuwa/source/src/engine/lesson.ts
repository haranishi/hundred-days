import { ALL_ITEM_IDS, unitItemIds } from '../course/course';
import type { ItemLookup, Lesson } from '../course/course';
import type { SignItem, VocabWord } from '../content/types';
import type { Progress } from '../store/schema';
import { canReadWord, spellingItems } from './fingerspelling';
import { shuffle } from './rng';
import type { Rng } from './rng';

export type ChoiceKind = 'signToLabel' | 'labelToSign' | 'wordMeaning';
export type Exercise =
  | { id: string; kind: 'intro' | 'tryIt'; itemId: string }
  | { id: string; kind: ChoiceKind; itemId: string; options: string[]; correctAnswer: string }
  | { id: string; kind: 'pairs'; itemIds: string[]; signOrder: string[]; labelOrder: string[] }
  | { id: string; kind: 'readFingerspelling'; word: VocabWord; sequence: string[]; options: string[]; correctAnswer: string }
  | { id: string; kind: 'spellWord'; word: VocabWord; options: string[]; correctAnswer: string[] };
export interface LessonOptions {
  rng: Rng;
  /** 呼び出し側との互換用。自分でやってみる問題の出題には使わない。 */
  cameraEnabled: boolean;
  items: ItemLookup;
  vocab: VocabWord[];
}

export function buildLesson(lesson: Lesson, progress: Pick<Progress, 'items'>, opts: LessonOptions): Exercise[] {
  const { rng } = opts;
  const lookup = (id: string) => { const item = opts.items(id); return item?.confidence !== 'low' ? item : undefined; };
  const unique = (ids: string[]) => [...new Set(ids)];
  const fresh = unique(lesson.kind === 'learn' ? lesson.newItems : []).filter(id => lookup(id)).slice(0, 3);
  const targets = unique([...fresh, ...(lesson.reviewItems ?? [])]).filter(id => lookup(id));
  if (!targets.length) return [];
  const learned = Object.entries(progress.items).filter(([id, item]) => item.box >= 1 && lookup(id)).map(([id]) => id);
  const known = new Set([...learned, ...fresh]);
  const pool = unique([...ALL_ITEM_IDS, ...Object.keys(progress.items), ...targets,
    ...targets.flatMap(id => lookup(id)?.confusables?.map(other => other.id) ?? [])])
    .map(lookup).filter((item): item is SignItem => !!item);
  const result: Exercise[] = [];
  const nextId = () => `${lesson.id}-exercise-${result.length + 1}`;
  const choices = (id: string, kind: ChoiceKind): Exercise => {
    const target = lookup(id)!;
    const unitIds = new Set(unitItemIds(id));
    const confusableIds = new Set(target.confusables?.map(item => item.id) ?? []);
    // 表示が同じ選択肢も重複とみなす（意味の4択ではmeaningを使う）。
    const display = (item: SignItem) => kind === 'wordMeaning' ? item.meaning ?? item.label : item.label;
    const seen = new Set([display(target)]);
    const candidates = pool.filter(item => item.id !== id);
    const tiers = [candidates.filter(item => confusableIds.has(item.id)),
      candidates.filter(item => unitIds.has(item.id)), candidates.filter(item => item.kind === target.kind)];
    const distractors: string[] = [];
    for (const tier of tiers) for (const item of shuffle(tier, rng)) {
      if (distractors.length < 3 && !seen.has(display(item))) {
        seen.add(display(item)); distractors.push(item.id);
      }
    }
    return { id: nextId(), kind, itemId: id, options: shuffle([id, ...distractors], rng), correctAnswer: id };
  };
  for (const id of fresh) {
    result.push({ id: nextId(), kind: 'intro', itemId: id });
    result.push(choices(id, 'signToLabel'));
  }
  // 多項目の復習では全対象に一度ずつ触れ、残りの種類を入れる余地を残す。
  const active = shuffle(targets, rng);
  for (const id of active.slice(0, fresh.length || 10)) result.push(choices(id, 'labelToSign'));
  const targetKinds = new Set(targets.map(id => lookup(id)!.kind));
  const pairIds = unique([...targets, ...shuffle(learned.filter(id => targetKinds.has(lookup(id)!.kind)), rng)]).slice(0, 4);
  if (pairIds.length >= 2) result.push({ id: nextId(), kind: 'pairs', itemIds: pairIds,
    signOrder: shuffle(pairIds, rng), labelOrder: shuffle(pairIds, rng) });
  if ([...known].filter(id => lookup(id)?.kind === 'kana').length >= 3) {
    const readable = opts.vocab.filter(word => canReadWord(word.kana, known));
    const word = shuffle(readable, rng)[0];
    if (word) {
      const sequence = spellingItems(word.kana)!;
      const length = [...word.kana.normalize('NFC')].length;
      const candidates = shuffle(opts.vocab, rng).map(other => other.kana);
      const difference = (kana: string) => Math.abs([...kana.normalize('NFC')].length - length);
      const wordOptions = unique([word.kana, ...candidates.filter(kana => difference(kana) === 0),
        ...candidates.filter(kana => difference(kana) === 1)]).slice(0, 4);
      result.push({ id: nextId(), kind: 'readFingerspelling', word, sequence,
        options: shuffle(wordOptions, rng), correctAnswer: word.kana });
      const required = unique(sequence);
      const extras = shuffle([...known].filter(id => !required.includes(id) && ['kana', 'modifier'].includes(lookup(id)!.kind)), rng);
      result.push({ id: nextId(), kind: 'spellWord', word,
        options: shuffle([...required, ...extras.slice(0, Math.max(0, 4 - required.length))], rng), correctAnswer: sequence });
    }
  }
  const wordTarget = active.find(id => lookup(id)?.kind === 'word');
  if (wordTarget) result.push(choices(wordTarget, 'wordMeaning'));
  const practiceTarget = fresh.find(id => lookup(id)?.dynamic === false);
  if (practiceTarget) result.push({ id: nextId(), kind: 'tryIt', itemId: practiceTarget });
  const fillers = shuffle(unique([...learned, ...targets]), rng);
  while (result.length < 10) {
    const id = fillers[(result.length - 1) % fillers.length]!;
    result.push(choices(id, lookup(id)?.kind === 'word' ? 'wordMeaning' : 'signToLabel'));
  }
  return result.slice(0, 14);
}
