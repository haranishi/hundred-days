// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { loadDefaultJapaneseParser } from 'budoux';
import { ReadableText, readableParts } from '../../src/ui/ReadableText';
import { SourceLink } from '../../src/ui/SourceLink';
import { Pairs } from '../../src/screens/exercises/Pairs';
import { SpellWord } from '../../src/screens/exercises/SpellWord';
import { Dictionary } from '../../src/screens/Dictionary';
import { LessonSession } from '../../src/screens/Lesson';
import { ITEMS, getItem } from '../../src/content';
import { createDefaultProgress } from '../../src/store/schema';
import { updateProgress } from '../../src/app/state';
import { clearSession } from '../../src/store/session';
import type { Exercise } from '../../src/engine/lesson';
vi.mock('../../src/hand', () => ({ HandView: () => h('div', { class: 'mock-hand' }), renderThumbnail: () => Promise.resolve('data:image/png;base64,AA') }));
let root: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); clearSession();
  const state = createDefaultProgress(); state.settings.sound = false; state.settings.vibration = false;
  updateProgress(() => state);
  root = document.createElement('div'); document.body.append(root);
});
afterEach(async () => { await act(() => render(null, root)); root.remove(); clearSession(); vi.useRealTimers(); });
const ids = ['kana-a', 'kana-i', 'kana-u'];
const pairs: Extract<Exercise, { kind: 'pairs' }> = { id: 'pairs-r6', kind: 'pairs', itemIds: ids, signOrder: ids, labelOrder: [...ids].reverse() };

describe('文節の折り返し', () => {
  it('BudouXの日本語文節を使い、文字列を変えない', () => {
    const text = '今日は天気です。';
    expect(readableParts(text)).toEqual(loadDefaultJapaneseParser().parse(text));
    expect(readableParts('')).toEqual([]);
  });
  it('句読点・閉じかっこの前と、開きかっこ・中黒の後にwbrを入れない', async () => {
    const texts = ['手話の指文字・数字・あいさつを1日5分', '「あ」、（数字）。手の形・向きも見よう！', '濁点（゛）・半濁点（゜）', '手話・ あいさつ。 （手の形） 、 数字。', '前に置く。親指は、横へ向けます。', ...ITEMS.flatMap(item => [item.describe.viewer, item.describe.self])];
    for (const text of texts) {
      await act(() => render(h('h1', {}, h(ReadableText, { text })), root));
      expect(root.textContent).toBe(text);
      for (const boundary of root.querySelectorAll('wbr')) {
        expect(boundary.nextSibling?.textContent).not.toMatch(/^[、。，．・！？!?：；:;）)］\]｝}」』】〉》〕〗〙〛’”]/u);
        expect(boundary.previousSibling?.textContent).not.toMatch(/[（(［\[｛{「『【〈《〔〖〘〚‘“・]$/u);
      }
    }
  });
  it('「・」は次の1文字と折れない塊にし、文字は足さない（keep-all でも中黒の後ろは折れるため）', async () => {
    const text = '設定画面から書き出し・読み込み・全削除ができます。';
    await act(() => render(h('p', {}, h(ReadableText, { text })), root));
    expect(root.textContent).toBe(text);
    const kept = [...root.querySelectorAll('.readable-nowrap')].map(element => element.textContent);
    expect(kept).toEqual(['・読', '・全']);
    for (const dot of root.querySelectorAll('.readable-nowrap')) expect(dot.querySelector('wbr')).toBeNull();
  });
  it('外部リンクの印を最後の文節と同じ塊に収め、開く先を読み上げる', async () => {
    const title = '使った部品と許諾の一覧';
    await act(() => render(h(SourceLink, { url: './THIRD_PARTY_NOTICES.txt', title }), root));
    const tail = root.querySelector('.readable-tail')!;
    expect(tail.textContent).toContain(readableParts(title).at(-1));
    expect(tail.querySelector('.external-link')).not.toBeNull();
    expect(tail.querySelector('wbr')).toBeNull();
    expect(root.querySelector('a')?.textContent).toContain('（新しいタブで開きます）');
  });
});

it('成立直後も300ms後も同じ場所に手・文字・チェックを残し、押せなくする', async () => {
  const onChange = vi.fn();
  await act(() => render(h(Pairs, { exercise: pairs, value: null, onChange, answered: false }), root));
  const cards = [...root.querySelectorAll<HTMLButtonElement>('.pair-choice')];
  await act(() => { cards[0]!.click(); cards[5]!.click(); });
  for (const index of [0, 5]) {
    expect(cards[index]!.disabled).toBe(true);
    expect(cards[index]!.classList.contains('choice--correct')).toBe(true);
    expect(cards[index]!.querySelector('.choice__mark')?.textContent).toBe('✓');
  }
  await act(() => { vi.advanceTimersByTime(300); });
  expect([...root.querySelectorAll('.pair-choice')]).toEqual(cards);
  expect(cards[0]!.querySelector('.thumbnail')).not.toBeNull();
  expect(cards[5]!.textContent).toContain('あ');
  await act(() => { cards[1]!.click(); cards[4]!.click(); });
  expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ matched: ['kana-a', 'kana-i'], hadMismatch: false, mismatches: [] });
});

it('成立したペアを途中再開しても緑枠とチェックを持つ無効札として復元する', async () => {
  await act(() => render(h(Pairs, { exercise: pairs, value: { matched: ['kana-a'], hadMismatch: false, mismatches: [] }, onChange: vi.fn(), answered: false }), root));
  const matched = root.querySelectorAll<HTMLButtonElement>('.pair-choice--matched');
  expect(matched).toHaveLength(2);
  for (const card of matched) { expect(card.disabled).toBe(true); expect(card.querySelector('.choice__mark')).not.toBeNull(); }
});

it('全ペア成立時の帯で、ペア専用のほめ言葉を使う', async () => {
  await act(() => render(h(LessonSession, { lesson: { id: 'pairs-praise', title: 'ペア', kind: 'review', newItems: [] }, exercises: [pairs] }), root));
  const columns = root.querySelectorAll('.pairs__column');
  for (let i = 0; i < 3; i++) await act(() => {
    columns[0]!.querySelectorAll<HTMLButtonElement>('button')[i]!.click();
    columns[1]!.querySelectorAll<HTMLButtonElement>('button')[2 - i]!.click();
  });
  expect(root.querySelector('.feedback__title p')?.textContent).toBe('手と文字のペアを、全部そろえられたね！');
});

it('つづりの答えは、答え合わせ後の正しい位置だけに正解枠を付ける', async () => {
  const exercise: Extract<Exercise, { kind: 'spellWord' }> = { id: 'spell', kind: 'spellWord', word: { kana: 'あい', meaning: '' }, options: ids, correctAnswer: ['kana-a', 'kana-i'] };
  await act(() => render(h(SpellWord, { exercise, value: ['kana-a', 'kana-u'], onChange: vi.fn(), answered: true }), root));
  expect(root.querySelectorAll('.spell-slot.choice--correct')).toHaveLength(1);
  expect(root.querySelector('.spell-slot.choice--correct .choice__selected-mark')?.textContent).toBe('✓');
});

it('濁点と半濁点の補足は全角括弧で表示し、元のlabelを変更しない', async () => {
  await act(() => render(h(Dictionary, {}), root));
  expect(root.textContent).toContain('濁点（゛）'); expect(root.textContent).toContain('半濁点（゜）');
  expect(getItem('mod-dakuon')?.label).toBe('濁音（゛）'); expect(getItem('mod-handakuon')?.label).toBe('半濁音（゜）');
});
