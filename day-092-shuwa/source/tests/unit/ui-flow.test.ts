// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { clearSession } from '../../src/store/session';
import { App } from '../../src/app/App';
import { progress, lastResult, updateProgress, flushProgress } from '../../src/app/state';
import { createDefaultProgress } from '../../src/store/schema';
import { getItem, VOCAB } from '../../src/content';
import { COURSES } from '../../src/course/course';
import { buildLesson } from '../../src/engine/lesson';
import { mulberry32 } from '../../src/engine/rng';
import { createSession, answer, next } from '../../src/engine/session';

// 学習フローでは、非同期の3D描画器を試験対象から分ける。
vi.mock('../../src/hand', () => ({
  HandView: (props: { label: string }) => h('div', { role: 'img', 'aria-label': props.label }),
  renderThumbnail: () => Promise.resolve('data:image/png;base64,AA'),
}));

const seed = 1794542400000;
let root: HTMLDivElement;
async function click(button: HTMLButtonElement) {
  expect(button).toBeTruthy();
  if (button.textContent === 'つづける' && button.disabled) await act(async () => { await new Promise(resolve => setTimeout(resolve, 410)); });
  expect(button.disabled).toBe(false);
  await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
}
function button(text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent?.replace(/\s+/g, ' ').trim() === text);
  if (!found) throw new Error(`ボタンがありません: ${text}`);
  return found;
}
async function start() {
  await click(button('はじめる'));
  await click(button('右手おすすめ'));
  await click(button('1レッスン10経験値おすすめ'));
  await click(button('指文字 おすすめ自分の手で1文字できる体験がいちばん早い'));
}
beforeEach(async () => {
  clearSession();
  vi.spyOn(Date, 'now').mockReturnValue(seed);
  history.replaceState(null, '', '#/');
  const initial = createDefaultProgress();
  initial.settings.sound = false;
  initial.settings.vibration = false;
  initial.settings.reduceMotion = true;
  updateProgress(() => initial);
  lastResult.value = null;
  root = document.createElement('div'); document.body.append(root);
  await act(() => render(h(App, {}), root));
});
afterEach(async () => {
  await act(() => render(null, root));
  root.remove(); vi.restoreAllMocks();
});

describe('仮想DOMでの画面の接続（実ブラウザの評価は別途）', () => {
  it('案内から誤答・再出題・結果・次のスタートまでつながる', async () => {
    const lesson = COURSES[0]!.units[0]!.lessons[0]!;
    let state = createSession(buildLesson(lesson, createDefaultProgress(), { rng: mulberry32(seed), cameraEnabled: false, items: getItem, vocab: VOCAB }));
    await start();
    expect(location.hash).toBe(`#/lesson/${lesson.id}`);
    let mistaken = false;
    let count = 0;
    while (state.current && count++ < 40) {
      const exercise = state.current;
      if (exercise.kind === 'intro') {
        await click(button('おぼえた'));
        state = next(answer(state, exercise.id, true)); continue;
      }
      const wrong = !mistaken && exercise.kind === 'signToLabel' && exercise.options.length > 1;
      const selectIndex = async (index: number) => click(root.querySelector<HTMLButtonElement>(`.lesson__content [data-shortcut="${index + 1}"]`)!);
      if (exercise.kind === 'pairs') {
        for (const id of exercise.itemIds) {
          const sign = [...root.querySelectorAll<HTMLButtonElement>('[aria-label="手の列"] button')].find(element => element.querySelector('img')?.alt === getItem(id)!.describe.viewer)!;
          await click(sign);
          const label = [...root.querySelectorAll<HTMLButtonElement>('[aria-label="文字の列"] button')].find(element => element.textContent === getItem(id)!.label)!;
          await click(label);
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 310)); });
        }
      } else if (exercise.kind === 'spellWord') {
        for (const id of exercise.correctAnswer) await selectIndex(exercise.options.indexOf(id));
      } else if ('correctAnswer' in exercise) {
        const id = wrong ? exercise.options.find(id => id !== exercise.correctAnswer)! : exercise.correctAnswer;
        await click([...root.querySelectorAll<HTMLButtonElement>('.choices button')].find(button => button.dataset.option === id)!);
      }
      if (exercise.kind !== 'pairs') await click(button(exercise.kind === 'tryIt' ? 'できた' : 'チェック'));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 410)); });
      expect(root.querySelector('.feedback h2')?.textContent).toBe(wrong ? 'おしい！' : exercise.kind === 'tryIt' ? 'できたね！' : '正解！');
      expect(document.activeElement).toBe(button('つづける'));
      await click(button('つづける'));
      state = next(answer(state, exercise.id, !wrong));
      if (wrong) mistaken = true;
    }
    expect(state.current).toBeNull();
    expect(mistaken).toBe(true);
    expect(root.textContent).toContain('レッスン完了！');
    expect(progress.value.lessons[lesson.id]).toBe(1);
    expect(lastResult.value?.xp).toBe(10);
    await click(button('つづける'));
    expect(root.querySelector('.lesson-node--current')?.getAttribute('aria-label')).toContain(COURSES[0]!.units[0]!.lessons[1]!.title);
    flushProgress();
    expect(JSON.parse(localStorage.getItem('tekotoba:v1')!).lessons[lesson.id]).toBe(1);
  }, 20_000);
  it('Escで終了しても紹介済みの記録だけを残す', async () => {
    await start();
    expect(progress.value.items['kana-a']?.box).toBe(0);
    await act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(root.querySelector('dialog')?.open).toBe(true);
    await click(button('やめる'));
    expect(location.hash).toBe('#/');
    expect(progress.value.items['kana-a']?.box).toBe(0);
    expect(progress.value.lessons).toEqual({});
    expect(progress.value.xpByDay).toEqual({});
  });
  it('キー処理を再登録せず、確認を閉じた直後も最新の状態で操作できる', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    await start();
    const handlers = () => add.mock.calls.filter(([type]) => type === 'keydown');
    expect(handlers()).toHaveLength(1);
    await act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    const dialog = root.querySelector('dialog')!;
    await act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
    expect(root.querySelector('dialog')).toBe(dialog);
    expect(button('おぼえた')).toBeTruthy();
    // Do not give rendering or passive effects a turn between close and Esc.
    await act(() => {
      button('つづける').click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(root.querySelector('dialog')?.open).toBe(true);
    await click(button('つづける'));
    await click(button('おぼえた'));
    await click(root.querySelector<HTMLButtonElement>('.choices button')!);
    await click(button('チェック'));
    expect(root.querySelector('.feedback')).not.toBeNull();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 410)); });
    await act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(root.querySelector('.feedback')).toBeNull();
    expect(handlers()).toHaveLength(1);
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
  });
  it('回答を連打しても正誤回数を二重に保存しない', async () => {
    const lesson = COURSES[0]!.units[0]!.lessons[0]!;
    const intro = createSession(buildLesson(lesson, createDefaultProgress(), { rng: mulberry32(seed), cameraEnabled: false, items: getItem, vocab: VOCAB }));
    const exercise = next(answer(intro, intro.current!.id, true)).current!;
    expect(exercise.kind).toBe('signToLabel');
    if (exercise.kind !== 'signToLabel') throw new Error('紹介の次は文字を選ぶ問題を想定しています');
    await start();
    await click(button('おぼえた'));
    const wrongId = exercise.options.find(id => id !== exercise.correctAnswer)!;
    expect(wrongId).toBeDefined();
    const choice = root.querySelector<HTMLButtonElement>(`.choices [data-shortcut="${exercise.options.indexOf(wrongId) + 1}"]`)!;
    await click(choice);
    await act(() => { button('チェック').click(); button('チェック').click(); });
    expect(progress.value.items[exercise.itemId]?.wrong).toBe(1);
    expect(progress.value.items[exercise.itemId]?.correct).toBe(0);
  });
  it('別のhashへの移動も終了確認で止め、キャンセルできる', async () => {
    await start();
    const original = location.hash;
    await act(async () => { location.hash = '#/dict'; await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(root.querySelector('dialog')?.open).toBe(true);
    expect(location.hash).toBe(original);
    await click(button('つづける'));
    expect(root.querySelector('dialog')).toBeNull();
    expect(button('おぼえた')).toBeTruthy();
  });
  it('数字キーで選択しEnterで確認でき、未選択の札のEnterは妨げない', async () => {
    await start(); await click(button('おぼえた'));
    const choice = [...root.querySelectorAll<HTMLButtonElement>('.choices button')].find(element => element.textContent?.endsWith('あ'))!;
    const nativeEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(() => { choice.dispatchEvent(nativeEnter); });
    expect(nativeEnter.defaultPrevented).toBe(false);
    await act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: choice.dataset.shortcut! })); });
    expect(choice.getAttribute('aria-pressed')).toBe('true');
    await act(() => { choice.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    expect(root.querySelector('.feedback h2')?.textContent).toBe('正解！');
  });
});
