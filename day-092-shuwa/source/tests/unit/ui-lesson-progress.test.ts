import { describe, expect, it } from 'vitest';
import { answerCorrect, answerReady, completeLesson, pairMatches, recordExercise, recordIntroduction } from '../../src/app/lessonProgress';
import { createDefaultProgress } from '../../src/store/schema';
import type { Exercise } from '../../src/engine/lesson';
const today = '2026-11-13';
const choice: Exercise = { id: 'c', kind: 'signToLabel', itemId: 'kana-a', options: ['kana-a', 'kana-i'], correctAnswer: 'kana-a' };
const pairs: Exercise = { id: 'p', kind: 'pairs', itemIds: ['a', 'i'], signOrder: ['i', 'a'], labelOrder: ['a', 'i'] };
const spell: Exercise = { id: 's', kind: 'spellWord', word: { kana: 'あいあ', meaning: '' }, options: ['a', 'i', 'u'], correctAnswer: ['a', 'i', 'a'] };
describe('回答と学習記録の接続', () => {
  it('選択前はチェック不可、選択後は正誤を判定', () => {
    expect(answerReady(choice, null)).toBe(false);
    expect(answerReady(choice, 'not-in-options')).toBe(false);
    expect(answerReady(choice, 'kana-i')).toBe(true);
    expect(answerCorrect(choice, 'kana-i')).toBe(false);
    expect(answerCorrect(choice, 'kana-a')).toBe(true);
  });
  it('ペアは列の位置ではなく項目IDで合わせる', () => {
    expect(pairMatches('kana-a', 'kana-a')).toBe(true);
    expect(pairMatches('kana-a', 'kana-i')).toBe(false);
  });
  it('ペアをそろえるまでチェック不可', () => {
    expect(answerReady(pairs, { matched: ['a'], hadMismatch: false })).toBe(false);
    expect(answerCorrect(pairs, { matched: ['i', 'a'], hadMismatch: false })).toBe(true);
  });
  it('途中に不一致があったペアは最後に再出題するため不正解にする', () => {
    expect(answerReady(pairs, { matched: ['a', 'i'], hadMismatch: true })).toBe(true);
    expect(answerCorrect(pairs, { matched: ['a', 'i'], hadMismatch: true })).toBe(false);
  });
  it('綴りは順序と同じ札の繰り返しを判定する', () => {
    expect(answerReady(spell, ['a'])).toBe(false);
    expect(answerCorrect(spell, ['a', 'i', 'a'])).toBe(true);
    expect(answerCorrect(spell, ['i', 'a', 'a'])).toBe(false);
  });
  it('紹介を表示した時点で保存するが繰り返しで記録を戻さない', () => {
    const state = recordIntroduction(createDefaultProgress(), 'kana-a', today);
    expect(state.items['kana-a']?.box).toBe(0);
    expect(state.items['kana-a']?.introducedAt).toBe(today);
    expect(recordIntroduction(state, 'kana-a', '2026-11-14')).toBe(state);
  });
  it('正誤を既存SRSへ流して元の状態を変更しない', () => {
    const before = createDefaultProgress();
    const correct = recordExercise(before, choice, true, today);
    expect(correct.items['kana-a']).toMatchObject({ box: 1, correct: 1, wrong: 0, due: '2026-11-14' });
    expect(recordExercise(correct, choice, false, today).items['kana-a']).toMatchObject({ correct: 1, wrong: 1 });
    expect(before.items).toEqual({});
  });
  it('綴りの同じ文字を1回答で何度も加算しない', () => {
    const result = recordExercise(createDefaultProgress(), spell, true, today);
    expect(result.items.a?.correct).toBe(1);
  });
  it('完了時に経験値・日付・回数・実績をまとめる', () => {
    const result = completeLesson(createDefaultProgress(), 'first', false, today);
    expect(result.xp).toBe(10);
    expect(result.progress.xpByDay[today]).toBe(10);
    expect(result.progress.lessons.first).toBe(1);
    expect(result.progress.streak.current).toBe(1);
    expect(result.achievements.map(item => item.id)).toEqual(['first-lesson']);
    expect(result.progress.achievements['first-lesson']).toBe(today);
    expect(result.streakExtended).toBe(true);
  });
  it('同日2回目は連続記録と実績を二重に延ばさない', () => {
    const first = completeLesson(createDefaultProgress(), 'first', false, today);
    const second = completeLesson(first.progress, 'first', false, today);
    expect(second.progress.xpByDay[today]).toBe(20);
    expect(second.progress.lessons.first).toBe(2);
    expect(second.progress.streak.current).toBe(1);
    expect(second.streakExtended).toBe(false);
    expect(second.achievements).toEqual([]);
  });
  it('全問一度で正解と復習の経験値を区別する', () => {
    expect(completeLesson(createDefaultProgress(), 'first', true, today).xp).toBe(15);
    expect(completeLesson(createDefaultProgress(), 'review', true, today, true).xp).toBe(5);
  });
});
