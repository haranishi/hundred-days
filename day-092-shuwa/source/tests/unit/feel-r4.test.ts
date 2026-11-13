// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { LessonSession } from '../../src/screens/Lesson';
import { getItem } from '../../src/content';
import { createDefaultProgress } from '../../src/store/schema';
import { updateProgress, progress } from '../../src/app/state';
import { SESSION_KEY, claimStreakNotice, clearSession, loadSession } from '../../src/store/session';
import type { Exercise } from '../../src/engine/lesson';
vi.mock('../../src/hand', () => ({
  HandView: (props: { onPerspectiveChange?: (value: string) => void; loop?: boolean; controls?: string }) => h('button', { 'data-loop': props.loop, 'data-controls': props.controls, onClick: () => props.onPerspectiveChange?.('self') }, '自分から見る'),
  renderThumbnail: () => Promise.resolve('data:image/png;base64,AA'),
}));
const choice: Exercise = { id: 'choice', kind: 'signToLabel', itemId: 'kana-a', correctAnswer: 'kana-a', options: ['kana-a', 'kana-sa'] };
const lesson = { id: 'test-lesson', title: 'あいう', kind: 'learn' as const, newItems: ['kana-a'] };
let root: HTMLDivElement;
const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('button')];
const button = (text: string) => buttons().find(button => button.textContent === text)!;
const click = async (text: string) => act(() => button(text).click());
const tick = async (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const mount = async (exercises: Exercise[] = [choice, { id: 'end', kind: 'intro', itemId: 'kana-i' }]) => act(() => render(h(LessonSession, { lesson, exercises }), root));
beforeEach(() => {
  localStorage.clear(); vi.useFakeTimers(); history.replaceState(null, '', '#/lesson/test-lesson');
  const initial = createDefaultProgress(); initial.settings.sound = false; initial.settings.vibration = false;
  updateProgress(() => initial);
  root = document.createElement('div'); document.body.append(root);
});
afterEach(async () => { await act(() => render(null, root)); root.remove(); clearSession(); vi.useRealTimers(); });
describe('評価r4の回帰', () => {
  it.each([0, 90, 250, 399, 400, 500])('%dmsで続けるを押しても400ms未満は帯を飛ばさない', async delay => {
    await mount(); await act(() => root.querySelector<HTMLButtonElement>('[data-option="kana-a"]')!.click());
    await click('チェック'); await tick(delay);
    const next = button('つづける'); expect(next.disabled).toBe(delay < 400);
    await act(() => next.click());
    expect(!!root.querySelector('.feedback')).toBe(delay < 400);
    expect(progress.value.items['kana-a']?.correct).toBe(1);
  });
  it('自己申告はできたねと表示し、連打しても帯を保つ', async () => {
    await mount([{ id: 'try', kind: 'tryIt', itemId: 'kana-a' }, choice]);
    await click('できた'); expect(root.querySelector('.feedback h2')?.textContent).toBe('できたね！');
    await tick(250); await click('つづける'); expect(root.querySelector('.feedback')).not.toBeNull();
    await tick(150); await click('つづける'); expect(root.querySelector('.feedback')).toBeNull();
  });
  it('正解とあなたの答えの文字・手・説明がそれぞれ一致する', async () => {
    await mount(); await act(() => root.querySelector<HTMLButtonElement>('[data-option="kana-sa"]')!.click()); await click('チェック');
    const rows = [...root.querySelectorAll('.feedback__comparison')];
    for (const [index, id] of ['kana-a', 'kana-sa'].entries()) {
      const item = getItem(id)!;
      expect(rows[index]?.querySelector('strong')?.textContent).toBe(`${index ? 'あなたの答え' : '正解'}：${item.label}`);
      expect(rows[index]?.querySelector('img')?.alt).toBe(item.describe.viewer);
      expect(rows[index]?.querySelector('p')?.textContent).toBe(item.describe.viewer);
    }
  });
  it('指文字を読む誤答も、選んだ語を構成する手と文字を対にする', async () => {
    await mount([{ id: 'read', kind: 'readFingerspelling', word: { kana: 'あい', meaning: '愛' }, sequence: ['kana-a', 'kana-i'], options: ['あい', 'いう'], correctAnswer: 'あい' }, choice]);
    await act(() => root.querySelector<HTMLButtonElement>('[data-option="いう"]')!.click()); await click('チェック');
    const rows = [...root.querySelectorAll('.feedback__comparison')];
    expect(rows[0]?.textContent).toContain('正解：あい'); expect(rows[1]?.textContent).toContain('あなたの答え：いう');
    expect([...rows[1]!.querySelectorAll('figcaption')].map(element => element.textContent)).toEqual(['い', 'う']);
  });
  it('ペアは300msの通知後も札を残し、自動で判定し、取り違えを字で伝える', async () => {
    const pairs: Exercise = { id: 'p', kind: 'pairs', itemIds: ['kana-a', 'kana-i'], signOrder: ['kana-a', 'kana-i'], labelOrder: ['kana-i', 'kana-a'] };
    await mount([pairs, choice]);
    const select = async (side: string, index: number) => act(() => root.querySelectorAll<HTMLButtonElement>(`[aria-label="${side}の列"] button`)[index]!.click());
    await select('手', 0); await select('文字', 0);
    await select('手', 0); await select('文字', 1);
    expect(root.querySelectorAll('.pair-choice--flash')).toHaveLength(2);
    await tick(299); expect(root.querySelectorAll('.pair-choice--matched')).toHaveLength(2);
    await tick(1); expect(root.querySelectorAll('.pair-choice--matched')).toHaveLength(2);
    await select('手', 1); await select('文字', 0); await tick(300);
    expect(root.textContent).toContain('あ と い を取りちがえました');
    expect(root.querySelector('.feedback')).not.toBeNull(); expect(button('チェック')).toBeUndefined();
  });
  it('再読込で誤答の帯から再開でき、最初からを選ぶと新しい状態で始める', async () => {
    await mount(); await act(() => root.querySelector<HTMLButtonElement>('[data-option="kana-sa"]')!.click()); await click('チェック');
    expect(loadSession()?.session.answered).toBe(true);
    await act(() => render(null, root)); await mount();
    expect(button('続きから（1/2）')).toBeTruthy(); await click('続きから（1/2）');
    expect(root.textContent).toContain('あなたの答え：さ');
    await tick(400); await click('つづける'); expect(root.querySelector('.lesson__header')?.textContent).toContain('2 / 3');
    await act(() => render(null, root)); await mount(); await click('はじめから');
    expect(root.querySelector('.lesson__header')?.textContent).toContain('1 / 2');
    expect(root.querySelector('.feedback')).toBeNull();
  });
  it('壊れた途中記録は読み込まず、保存できなくても学習を続ける', async () => {
    localStorage.setItem(SESSION_KEY, '{broken'); expect(loadSession()).toBeNull();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    await mount(); expect(button('チェック')).toBeTruthy(); spy.mockRestore();
  });
  it('同じ連続途切れの知らせを再び表示せず、次の途切れは通知する', () => {
    expect(claimStreakNotice('2026-11-10')).toBe(true); expect(claimStreakNotice('2026-11-10')).toBe(false);
    expect(claimStreakNotice('2026-11-13')).toBe(true);
  });
  it('単語は繰り返し動かし、注意書きは初回だけで以後は情報ボタンから開く', async () => {
    const word: Exercise = { ...choice, id: 'word1', kind: 'wordMeaning', itemId: 'word-ohayou', correctAnswer: 'word-ohayou', options: ['word-ohayou', 'word-konnichiwa'] };
    await mount([word, { ...word, id: 'word2' }]);
    expect(root.querySelector('[data-loop]')?.getAttribute('data-loop')).toBe('true');
    expect(root.querySelector('.sign-notice')).not.toBeNull();
    await act(() => root.querySelector<HTMLButtonElement>('[data-option="word-ohayou"]')!.click());
    await click('チェック'); await tick(400); await click('つづける');
    expect(root.querySelector('.sign-notice')).toBeNull();
    await act(() => root.querySelector<HTMLButtonElement>('.sign-info')!.click());
    expect(root.querySelector('.sign-notice')).not.toBeNull();
  });
  it('正解のほめ言葉を続けて同じにしない', async () => {
    await mount([choice, { ...choice, id: 'choice2' }]);
    const praise = async () => {
      await act(() => root.querySelector<HTMLButtonElement>('[data-option="kana-a"]')!.click()); await click('チェック');
      return root.querySelector('.feedback__title p')?.textContent;
    };
    const first = await praise(); await tick(400); await click('つづける'); expect(await praise()).not.toBe(first);
  });
  it('紹介の視点を切り替えると、自分で作る説明に変わる', async () => {
    await mount([{ id: 'intro', kind: 'intro', itemId: 'kana-a' }]); await click('自分から見る');
    expect(root.querySelector('.description h2')?.textContent).toBe('自分で作るときのコツ');
    expect(root.querySelector('.description p')?.textContent).toBe(getItem('kana-a')!.describe.self);
  });
});
