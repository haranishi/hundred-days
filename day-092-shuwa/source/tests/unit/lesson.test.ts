import { describe, expect, it } from 'vitest';
import { COURSES, createCourses } from '../../src/course/course';
import type { Lesson } from '../../src/course/course';
import { buildLesson } from '../../src/engine/lesson';
import { canReadWord, characterItems, spellingItems } from '../../src/engine/fingerspelling';
import { mulberry32 } from '../../src/engine/rng';
import { answer, createSession, isFinished, next, summary } from '../../src/engine/session';
import { createDefaultProgress } from '../../src/store/schema';
import { getItem } from '../../src/content';
import { fixtureContent, learnedProgress } from './engine-fixtures';
const lesson: Lesson = { id: 'demo', title: 'あいう', kind: 'learn', newItems: ['kana-a', 'kana-i', 'kana-u'] };
const vocab = [{ kana: 'あい', meaning: '愛' }, { kana: 'いう', meaning: '言う' }, { kana: 'うい', meaning: '初々しい' }, { kana: 'あう', meaning: '会う' }];
function build(cameraEnabled = false, currentLesson = lesson) {
  return buildLesson(currentLesson, createDefaultProgress(), { rng: mulberry32(42), cameraEnabled, items: fixtureContent().items, vocab });
}

describe('種付き乱数と出題', () => {
  it('同じ種なら同じ並びで、別の種では並びが変わる', () => {
    expect(build()).toEqual(build());
    const different = buildLesson(lesson, createDefaultProgress(), { rng: mulberry32(7), cameraEnabled: false, items: fixtureContent().items, vocab });
    expect(different).not.toEqual(build());
    const rng = mulberry32(99);
    expect(Array.from({ length: 1000 }, () => rng()).every(n => n >= 0 && n < 1)).toBe(true);
  });
  it('新出最大3つを紹介し、直後に確認問題、全体は10〜14問', () => {
    const exercises = build(true, { ...lesson, newItems: [...lesson.newItems, 'kana-e'] });
    expect(exercises.length).toBeGreaterThanOrEqual(10);
    expect(exercises.length).toBeLessThanOrEqual(14);
    expect(exercises.filter(exercise => exercise.kind === 'intro')).toHaveLength(3);
    exercises.forEach((exercise, i) => {
      if (exercise.kind === 'intro') expect(exercises[i + 1]).toMatchObject({ kind: 'signToLabel', itemId: exercise.itemId });
    });
    expect(exercises.map(exercise => exercise.kind)).toEqual(expect.arrayContaining(['labelToSign', 'pairs', 'readFingerspelling', 'spellWord', 'tryIt']));
    expect(new Set(exercises.map(exercise => exercise.id)).size).toBe(exercises.length);
  });
  it('全コースの4択に正解が一度だけ含まれ、重複がなく、ペアは既習と対象の2〜4組', () => {
    const { items } = fixtureContent();
    for (const course of createCourses(items)) for (const unit of course.units) for (const currentLesson of unit.lessons) {
      const exercises = build(true, currentLesson);
      expect(exercises.length).toBeGreaterThanOrEqual(10);
      expect(exercises.length).toBeLessThanOrEqual(14);
      for (const exercise of exercises) {
        if ('options' in exercise) {
          expect(new Set(exercise.options).size).toBe(exercise.options.length);
          if (typeof exercise.correctAnswer === 'string') {
            expect(exercise.options).toHaveLength(4);
            expect(exercise.options.filter(option => option === exercise.correctAnswer)).toHaveLength(1);
          } else for (const id of exercise.correctAnswer) expect(exercise.options).toContain(id);
        }
        if (exercise.kind === 'pairs') {
          expect(exercise.itemIds.length).toBeGreaterThanOrEqual(2);
          expect(exercise.itemIds.length).toBeLessThanOrEqual(4);
          expect(exercise.itemIds.every(id => [...currentLesson.newItems.slice(0, 3), ...(currentLesson.reviewItems ?? [])].includes(id))).toBe(true);
          expect([...exercise.signOrder].sort()).toEqual([...exercise.itemIds].sort());
          expect([...exercise.labelOrder].sort()).toEqual([...exercise.itemIds].sort());
        }
      }
    }
  });
  it('未習の項目でペアを埋めず、2〜3組でも出題する', () => {
    for (const count of [1, 2, 3]) {
      const exercises = build(false, { ...lesson, newItems: lesson.newItems.slice(0, count) });
      const pairs = exercises.find(exercise => exercise.kind === 'pairs');
      if (count === 1) expect(pairs).toBeUndefined();
      else expect(pairs).toMatchObject({ itemIds: lesson.newItems.slice(0, count) });
    }
    const exercises = buildLesson(lesson, learnedProgress(['kana-e']), {
      rng: mulberry32(2), cameraEnabled: false, items: fixtureContent().items, vocab: [],
    });
    expect(exercises.find(exercise => exercise.kind === 'pairs')).toMatchObject({ itemIds: ['kana-a', 'kana-i', 'kana-u', 'kana-e'] });
  });
  it('confusablesを最優先し、残りは同じユニット、次に同じ種類から選ぶ', () => {
    const { items, data } = fixtureContent();
    data.get('kana-a')!.confusables = [{ id: 'kana-n', tip: '見分ける' }];
    const first = buildLesson(lesson, createDefaultProgress(), { rng: mulberry32(1), cameraEnabled: false, items, vocab: [] })[1]!;
    expect(first.kind).toBe('signToLabel');
    if ('options' in first) {
      expect(first.options).toContain('kana-n');
      const rest = first.options.filter(id => id !== 'kana-a' && id !== 'kana-n');
      expect(rest.every(id => ['kana-i', 'kana-u', 'kana-e', 'kana-o', 'kana-ka', 'kana-ki', 'kana-ku', 'kana-ke', 'kana-ko'].includes(id))).toBe(true);
    }
    const filtered = (id: string) => ['kana-a', 'kana-n', 'kana-ra', 'kana-ri'].includes(id) ? items(id) : undefined;
    const fallback = buildLesson({ ...lesson, newItems: ['kana-a'] }, createDefaultProgress(), { rng: mulberry32(1), cameraEnabled: false, items: filtered, vocab: [] });
    expect(fallback[1]).toMatchObject({ options: expect.arrayContaining(['kana-a', 'kana-n', 'kana-ra', 'kana-ri']) });
  });
  it('選択肢の表示が同じ項目も重複させない', () => {
    const { items, data } = fixtureContent();
    for (const id of ['kana-i', 'kana-u', 'kana-e']) data.get(id)!.label = '同じ表示';
    const exercises = buildLesson(lesson, createDefaultProgress(), { rng: mulberry32(1), cameraEnabled: false, items, vocab: [] });
    for (const exercise of exercises) if ('options' in exercise && exercise.kind !== 'readFingerspelling' && exercise.kind !== 'spellWord') {
      const labels = exercise.options.map(id => items(id)!.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
  it('カメラ設定に関係なく、静止形の新出がある時だけ自分でやってみる問題を1問出す', () => {
    expect(build(false).filter(exercise => exercise.kind === 'tryIt')).toHaveLength(1);
    expect(build(true).filter(exercise => exercise.kind === 'tryIt')).toHaveLength(1);
    const { items, data } = fixtureContent();
    lesson.newItems.forEach(id => { data.get(id)!.dynamic = true; });
    expect(buildLesson(lesson, createDefaultProgress(), { rng: mulberry32(1), cameraEnabled: true, items, vocab }).some(exercise => exercise.kind === 'tryIt')).toBe(false);
    expect(build(true, { ...lesson, kind: 'review', newItems: [], reviewItems: lesson.newItems }).some(exercise => exercise.kind === 'tryIt')).toBe(false);
  });
  it('単語のレッスンには意味の問題を入れる', () => {
    expect(build(false, { ...lesson, newItems: ['word-ohayou', 'word-konnichiwa', 'word-konbanwa'] })
      .some(exercise => exercise.kind === 'wordMeaning')).toBe(true);
  });
  it('足りない問題は既習項目で埋め、入力を変更しない', () => {
    const progress = learnedProgress(['kana-ra', 'kana-ri']);
    const original = JSON.stringify(progress);
    const exercises = buildLesson({ ...lesson, newItems: ['kana-a'] }, progress, {
      rng: mulberry32(2), cameraEnabled: false, items: fixtureContent().items, vocab: [],
    });
    expect(exercises).toHaveLength(10);
    expect(exercises.some(exercise => 'itemId' in exercise && ['kana-ra', 'kana-ri'].includes(exercise.itemId))).toBe(true);
    expect(JSON.stringify(progress)).toBe(original);
  });
  it('実データでも10〜14問を作り、対象皆無なら空、lowは出さない', () => {
    const first = COURSES[0]!.units[0]!.lessons[0]!;
    const exercises = buildLesson(first, createDefaultProgress(), { rng: mulberry32(1), cameraEnabled: false, items: getItem, vocab: [] });
    expect(exercises.length).toBeGreaterThanOrEqual(10);
    expect(exercises.length).toBeLessThanOrEqual(14);
    expect(exercises.filter(exercise => exercise.kind === 'tryIt')).toHaveLength(1);
    for (const exercise of exercises) if ('options' in exercise) expect(new Set(exercise.options).size).toBe(exercise.options.length);
    expect(buildLesson(lesson, createDefaultProgress(), { rng: mulberry32(1), cameraEnabled: true, items: () => undefined, vocab })).toEqual([]);
    const { items, data } = fixtureContent();
    data.get('kana-a')!.confidence = 'low';
    const noLow = buildLesson(lesson, createDefaultProgress(), { rng: mulberry32(1), cameraEnabled: true, items, vocab });
    expect(JSON.stringify(noLow)).not.toContain('kana-a');
  });
});
describe('指文字の語の判定', () => {
  it.each([
    [['あい', 'えお', 'おえ', 'ええ', 'え', 'えええ'], ['あい', 'えお', 'おえ', 'ええ']],
    [['あい', 'ええ', 'え', 'おえお', 'えおえおえ'], ['あい', 'ええ', 'え', 'おえお']],
    [['あい', 'ええ', 'え', 'えおえおえ'], ['あい', 'ええ', 'え']],
  ])('読む問題は同じ文字数を優先し、足りなければ±1文字で補う', (words, expected) => {
    const exercises = buildLesson(lesson, createDefaultProgress(), {
      rng: mulberry32(42), cameraEnabled: false, items: fixtureContent().items,
      vocab: words.map(kana => ({ kana, meaning: kana })),
    });
    const reading = exercises.find(exercise => exercise.kind === 'readFingerspelling');
    expect(reading?.kind).toBe('readFingerspelling');
    if (reading?.kind === 'readFingerspelling') {
      expect(reading.correctAnswer).toBe('あい');
      expect([...reading.options].sort()).toEqual([...expected].sort());
    }
  });

  it.each([
    ['が', ['kana-ka', 'mod-dakuon']], ['ぱ', ['kana-ha', 'mod-handakuon']],
    ['っ', ['kana-tsu', 'mod-sokuon']], ['ゃ', ['kana-ya', 'mod-youon']], ['ー', ['mod-chouon']],
  ])('%sは元の文字と変化の両方が必要', (character, ids) => {
    expect(characterItems(character)).toEqual(ids);
    expect(canReadWord(character, new Set(ids))).toBe(true);
    expect(canReadWord(character, new Set(ids.slice(0, -1)))).toBe(false);
  });
  it('文字単位で小字・濁音・長音を判定し、結合濁点を正規化する', () => {
    const ids = ['kana-ki', 'kana-ya', 'mod-youon', 'kana-ha', 'mod-handakuon', 'mod-chouon'];
    expect(canReadWord('きゃぱー', new Set(ids))).toBe(true);
    expect(canReadWord('きゃぱー', new Set(ids.filter(id => id !== 'kana-ya')))).toBe(false);
    expect(spellingItems('か\u3099')).toEqual(['kana-ka', 'mod-dakuon']);
    expect(characterItems('かき')).toBeUndefined();
    expect(canReadWord('', new Set(ids))).toBe(false);
    expect(canReadWord('漢字', new Set(ids))).toBe(false);
  });
  it('段0は既習と数えず、段1以上と今回の新出だけで語を選ぶ', () => {
    const { items } = fixtureContent();
    const current = { ...lesson, newItems: ['kana-a'] };
    const progress = learnedProgress(['kana-i', 'kana-u']);
    const options = { rng: mulberry32(1), cameraEnabled: false, items, vocab };
    expect(buildLesson(current, progress, options).some(exercise => exercise.kind === 'spellWord')).toBe(true);
    progress.items['kana-u']!.box = 0;
    expect(buildLesson(current, progress, { ...options, rng: mulberry32(1) }).some(exercise => exercise.kind === 'spellWord')).toBe(false);
  });
});
describe('レッスン進行', () => {
  const exercises = build().slice(0, 2);
  it('誤答を最後へ回し、正解するまで終わらない', () => {
    let state = createSession(exercises);
    state = next(answer(state, exercises[0]!.id, false));
    expect(state.current!.id).toBe(exercises[1]!.id);
    state = next(answer(state, exercises[1]!.id, true));
    expect(state.current!.id).toBe(exercises[0]!.id);
    state = next(answer(state, exercises[0]!.id, false));
    expect(isFinished(state)).toBe(false);
    state = next(answer(state, exercises[0]!.id, true));
    expect(isFinished(state)).toBe(true);
    expect(summary(state)).toEqual({ accuracy: 0.5, firstTryPerfect: false, correct: 2, attempts: 4 });
  });
  it('再出題の合計と番号が進み、札の順序も変わる', () => {
    const choice = build().find(exercise => exercise.kind === 'signToLabel')!;
    if (!('options' in choice)) throw new Error('選択問題が必要');
    const state = next(answer(createSession([choice]), choice.id, false), () => 0.99);
    expect(state.total).toBe(2);
    expect(state.total - state.queue.length).toBe(2);
    expect(state.current?.id).toBe(choice.id);
    expect(state.current).toHaveProperty('options');
    if (state.current && 'options' in state.current) {
      expect(state.current.options).not.toEqual(choice.options);
      expect([...state.current.options].sort()).toEqual([...choice.options].sort());
    }
  });
  it('一度で全問正解を判定し、未完了や空は全問正解としない', () => {
    let state = createSession(exercises);
    expect(summary(state).firstTryPerfect).toBe(false);
    for (const exercise of exercises) state = next(answer(state, exercise.id, true));
    expect(summary(state)).toEqual({ accuracy: 1, firstTryPerfect: true, correct: 2, attempts: 2 });
    expect(isFinished(createSession([]))).toBe(true);
    expect(summary(createSession([])).firstTryPerfect).toBe(false);
  });
  it('未回答で進めず、別ID・二重回答・完了後の回答を無視する', () => {
    const initial = createSession(exercises);
    expect(next(initial)).toBe(initial);
    expect(answer(initial, 'wrong-id', true)).toBe(initial);
    const answered = answer(initial, exercises[0]!.id, true);
    expect(answer(answered, exercises[0]!.id, false)).toBe(answered);
    expect(initial.records).toEqual([]);
    const empty = createSession([]);
    expect(answer(empty, 'none', false)).toBe(empty);
    expect(() => createSession([exercises[0]!, exercises[0]!])).toThrow();
  });
});

describe('問題の札の種類', () => {
  it('数字のペアに指文字の札を混ぜない', () => {
    const exercises = build(false, { ...lesson, newItems: ['num-1', 'num-2', 'num-3'] });
    const pairs = exercises.find(exercise => exercise.kind === 'pairs');
    expect(pairs?.kind).toBe('pairs');
    if (pairs?.kind === 'pairs') expect(pairs.itemIds.every(id => id.startsWith('num-'))).toBe(true);
  });
  it('既習項目が増えても綴る札は必要な形を残して4つに絞る', () => {
    const exercises = buildLesson(lesson, learnedProgress(['kana-e', 'kana-o', 'kana-ka', 'kana-ki', 'kana-ku', 'kana-ke']), {
      rng: mulberry32(1), cameraEnabled: false, items: fixtureContent().items, vocab,
    });
    const spelling = exercises.find(exercise => exercise.kind === 'spellWord');
    expect(spelling?.kind).toBe('spellWord');
    if (spelling?.kind === 'spellWord') {
      expect(spelling.options).toHaveLength(4);
      for (const id of spelling.correctAnswer) expect(spelling.options).toContain(id);
    }
  });
  it('指文字を綴る札に既習の数字や単語を混ぜない', () => {
    const exercises = buildLesson(lesson, learnedProgress(['num-1', 'word-ohayou']), {
      rng: mulberry32(1), cameraEnabled: false, items: fixtureContent().items, vocab,
    });
    const spelling = exercises.find(exercise => exercise.kind === 'spellWord');
    expect(spelling?.kind).toBe('spellWord');
    if (spelling?.kind === 'spellWord') expect(spelling.options.every(id => id.startsWith('kana-') || id.startsWith('mod-'))).toBe(true);
  });
});
