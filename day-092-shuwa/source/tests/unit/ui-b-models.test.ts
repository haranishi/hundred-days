import { describe, expect, it, vi } from 'vitest';
import { reviewExercises, reviewQueue } from '../../src/app/reviewModel';
import { inCourse, learnedCounts, recordShareText, weekXp } from '../../src/app/recordModel';
import { playbackDelay, playbackTokens } from '../../src/app/spellModel';
import { fixtureContent, fixtureItem, learnedProgress } from './engine-fixtures';
import { createDefaultProgress } from '../../src/store/schema';
import { introduceItem } from '../../src/engine/srs';

vi.mock('../../src/content', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/content')>();
  const items = actual.ITEMS.filter(item => ['kana-a', 'kana-i', 'kana-u'].includes(item.id));
  return { ...actual, ITEMS: items, getItem: (id: string) => items.find(item => item.id === id) };
});

const today = '2026-11-13';
describe('復習の画面用モデル', () => {
  it('未収録・確信度lowを除いてから12項目に絞り、全件数も返す', () => {
    const { items, data } = fixtureContent();
    const state = createDefaultProgress();
    for (const id of ['missing', ...data.keys()]) state.items[id] = introduceItem(today);
    data.get('kana-a')!.confidence = 'low';
    const queue = reviewQueue(state, today, false, items);
    expect(queue.count).toBe(data.size - 1);
    expect(queue.ids).toHaveLength(12);
    expect(queue.ids).not.toContain('missing'); expect(queue.ids).not.toContain('kana-a');
  });
  it('古い期日から並べ、未来の項目を出さない', () => {
    const { items } = fixtureContent();
    const state = learnedProgress(['kana-a', 'kana-i', 'kana-u']);
    state.items['kana-a']!.due = '2026-11-15';
    state.items['kana-i']!.due = '2026-11-12';
    state.items['kana-u']!.due = '2026-11-01';
    expect(reviewQueue(state, today, false, items).ids).toEqual(['kana-u', 'kana-i']);
  });
  it('苦手はまちがいの多い順で、未来の期日も含む', () => {
    const { items } = fixtureContent();
    const state = learnedProgress(['kana-a', 'kana-i', 'kana-u']);
    state.items['kana-a']!.wrong = 2; state.items['kana-i']!.wrong = 5;
    expect(reviewQueue(state, today, true, items).ids).toEqual(['kana-i', 'kana-a']);
  });
  it('1項目1問で選んだ順を保つ', () => {
    const { items } = fixtureContent();
    const ids = ['kana-u', 'word-arigatou', 'kana-i'];
    const exercises = reviewExercises(ids, learnedProgress(ids), items);
    expect(exercises).toHaveLength(3);
    expect(exercises.map(exercise => 'itemId' in exercise ? exercise.itemId : '')).toEqual(ids);
    expect(exercises.map(exercise => exercise.kind)).toEqual(['labelToSign', 'wordMeaning', 'labelToSign']);
    expect(new Set(exercises.map(exercise => exercise.id)).size).toBe(3);
  });
  it('12項目を超える出題や紹介・カメラの問題を作らない', () => {
    const { data, items } = fixtureContent();
    const ids = [...data.keys()].slice(0, 20);
    const exercises = reviewExercises(ids, learnedProgress(ids), items);
    expect(exercises).toHaveLength(12);
    expect(exercises.every(exercise => exercise.kind === 'labelToSign')).toBe(true);
  });
  it('未収録とlowだけなら出題しない', () => {
    const { items, data } = fixtureContent();
    data.get('kana-a')!.confidence = 'low';
    expect(reviewExercises(['missing', 'kana-a'], createDefaultProgress(), items)).toEqual([]);
  });
});
describe('記録と図鑑の画面用モデル', () => {
  it('箱1以上の収録項目をコース別に数え、変化は指文字に含める', () => {
    const items = ['kana-a', 'mod-dakuon', 'num-1', 'word-arigatou'].map(id => fixtureItem(id));
    const state = learnedProgress(items.map(item => item.id));
    state.items['word-arigatou']!.box = 0;
    state.items['unknown'] = introduceItem(today);
    expect(learnedCounts(state, items).map(course => [course.total, course.learned])).toEqual([[2, 2], [1, 1], [1, 0]]);
    expect(inCourse(items[1]!, 'kana')).toBe(true);
  });
  it('月をまたぐ7暦日を埋め、存在しない日の経験値は0', () => {
    const state = createDefaultProgress();
    state.xpByDay = { '2026-10-31': 10, '2026-11-01': 20, '2026-11-04': 99 };
    const days = weekXp(state, '2026-11-03');
    expect(days).toHaveLength(7);
    expect(days[0]!.day).toBe('2026-10-28'); expect(days[6]!.day).toBe('2026-11-03');
    expect(days.map(day => day.xp)).toEqual([0, 0, 0, 10, 20, 0, 0]);
  });
  it('うるう年の2月29日を含む', () => {
    expect(weekXp(createDefaultProgress(), '2028-03-02').map(day => day.day)).toContain('2028-02-29');
  });
  it('記録の共有文に連続日数を含める', () => {
    expect(recordShareText(3)).toContain('てことばで手話を3日続けています');
  });
});
describe('指文字の再生', () => {
  it('カタカナをひらがなにして形と対応させ、収録外を明示する', () => {
    const tokens = playbackTokens('アイ漢');
    expect(tokens.map(entry => entry.token.char)).toEqual(['あ', 'い', '漢']);
    expect(tokens[0]!.spec).toBeDefined(); expect(tokens[1]!.spec).toBeDefined(); expect(tokens[2]!.spec).toBeUndefined();
  });
  it('かなでも形が未収録なら再生しない', () => {
    expect(playbackTokens('え')[0]!.spec).toBeUndefined();
  });
  it('変化が未収録の場合に元の形だけを再生しない', () => {
    expect(playbackTokens('がぁー').every(entry => !entry.spec)).toBe(true);
  });
  it('NFC正規化した後に20文字に制限する', () => {
    expect(playbackTokens('あ'.repeat(21))).toHaveLength(20);
    expect(playbackTokens('う\u3099')[0]!.token.char).toBe('ゔ');
  });
  it('空白は出さない', () => {
    expect(playbackTokens(' あ　い ')).toHaveLength(2);
  });
  it('形の動きが終わる前に次へ送らず、ゆっくりでは時間を倍にする', () => {
    const spec = fixtureItem('kana-a').sign;
    spec.duration = 3;
    expect(playbackDelay(spec, false)).toBe(3500); expect(playbackDelay(spec, true)).toBe(7000);
  });
});
