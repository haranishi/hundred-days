// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { Thumbnail } from '../../src/ui/Thumbnail';
import { Pairs } from '../../src/screens/exercises/Pairs';
import { LessonSession } from '../../src/screens/Lesson';
import { ItemDetail } from '../../src/screens/Dictionary';
import { Review } from '../../src/screens/Review';
import { getItem } from '../../src/content';
import { createDefaultProgress } from '../../src/store/schema';
import { progress, updateProgress, currentDay } from '../../src/app/state';
import { clearSession } from '../../src/store/session';
import type { Exercise } from '../../src/engine/lesson';
import { renderThumbnail } from '../../src/hand';
import { mirrorText } from '../../src/content/mirror';
vi.mock('../../src/hand', () => ({
  HandView: () => h('div', { class: 'mock-hand' }),
  renderThumbnail: vi.fn(() => Promise.resolve('data:image/png;base64,AA')),
}));
let root: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); clearSession(); vi.mocked(renderThumbnail).mockClear();
  const state = createDefaultProgress(); state.settings.sound = false; state.settings.vibration = false;
  updateProgress(() => state);
  root = document.createElement('div'); document.body.append(root);
});
afterEach(async () => { await act(() => render(null, root)); root.remove(); clearSession(); vi.useRealTimers(); });
const flush = async () => act(() => { vi.advanceTimersByTime(1); });

describe('r5の描画待ち・操作の回帰', () => {
  it('描画待ちは説明を見せず、指定した寸法と読み上げ用の説明だけを持つ', async () => {
    let resolve!: (value: string) => void;
    vi.mocked(renderThumbnail).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await act(() => render(h(Thumbnail, { item: getItem('kana-a')!, size: 140 }), root));
    const placeholder = root.querySelector<HTMLElement>('.thumbnail')!;
    expect(placeholder.style.width).toBe('140px'); expect(placeholder.style.height).toBe('140px');
    expect(root.textContent).toBe('');
    expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(getItem('kana-a')!.describe.viewer);
    await act(async () => { resolve('data:image/png;base64,AA'); await Promise.resolve(); });
    expect(root.querySelector('.thumbnail--fallback')).toBeNull();
    expect(root.querySelector('img')?.width).toBe(140);
  });
  it.each([0, 50, 149, 299])('ペア完成から%dmsでも次の組を選び、誤答にしない', async delay => {
    const exercise: Extract<Exercise, { kind: 'pairs' }> = { id: 'pairs', kind: 'pairs', itemIds: ['kana-a', 'kana-i', 'kana-u'], signOrder: ['kana-a', 'kana-i', 'kana-u'], labelOrder: ['kana-a', 'kana-i', 'kana-u'] };
    const onChange = vi.fn();
    await act(() => render(h(Pairs, { exercise, value: null, onChange, answered: false }), root));
    const choose = async (side: string, index: number) => act(() => root.querySelectorAll<HTMLButtonElement>(`[aria-label="${side}の列"] button`)[index]!.click());
    await choose('手', 0); await choose('文字', 0);
    await act(() => { vi.advanceTimersByTime(delay); });
    await choose('手', 1); await choose('文字', 1);
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ matched: ['kana-a', 'kana-i'], hadMismatch: false, mismatches: [] });
    await act(() => { vi.advanceTimersByTime(300); });
    expect(root.querySelectorAll('.pair-choice--matched')).toHaveLength(4);
  });
  it('正誤の帯が出ている間に次問の札を同じ寸法・利き手で先読みする', async () => {
    const state = progress.value; state.settings.dominant = 'left'; updateProgress(() => state);
    const exercises: Exercise[] = [
      { id: 'one', kind: 'signToLabel', itemId: 'kana-a', options: ['kana-a', 'kana-i'], correctAnswer: 'kana-a' },
      { id: 'two', kind: 'labelToSign', itemId: 'kana-i', options: ['kana-a', 'kana-i'], correctAnswer: 'kana-i' },
    ];
    await act(() => render(h(LessonSession, { lesson: { id: 'preload', title: 'test', kind: 'review', newItems: [] }, exercises }), root));
    await act(() => root.querySelector<HTMLButtonElement>('[data-option="kana-a"]')!.click());
    await act(() => [...root.querySelectorAll('button')].find(button => button.textContent === 'チェック')!.click());
    expect(root.querySelector('.feedback')).not.toBeNull();
    expect(renderThumbnail).toHaveBeenCalledWith(getItem('kana-i')!.sign, { dominant: 'left', size: 280 });
  });
  it('左手の図鑑詳細でも相手向け・自分向けの左右が入れ替わる', async () => {
    updateProgress(state => ({ ...state, settings: { ...state.settings, dominant: 'left' } }));
    await act(() => render(h(ItemDetail, { id: 'kana-a' }), root));
    const item = getItem('kana-a')!;
    const prose = root.querySelector('.sign-detail-layout .prose')!;
    expect(prose.textContent).toContain(mirrorText(item.describe.viewer, 'left'));
    expect(prose.textContent).toContain(mirrorText(item.describe.self, 'left'));
  });
  it('復習0件なら無効ボタンを置かず、苦手を主ボタンにする', async () => {
    updateProgress(state => ({ ...state, items: { 'kana-a': { box: 1, due: '2099-12-31', introducedAt: currentDay.value, correct: 1, wrong: 2 } } }));
    await act(() => render(h(Review, { weak: false }), root)); await flush();
    expect(root.textContent).toContain('今日の復習はありません（次回 12月31日）');
    expect(root.querySelector('button:disabled')).toBeNull();
    expect(root.querySelector('a[href="#/practice/weak"]')?.className).toBe('button');
  });
});
