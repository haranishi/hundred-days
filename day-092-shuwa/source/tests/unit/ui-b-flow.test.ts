// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { clearSession } from '../../src/store/session';
import { App } from '../../src/app/App';
import { currentDay, flushProgress, lastResult, progress, sessionActive, systemReducedMotion, updateProgress } from '../../src/app/state';
import { createDefaultProgress } from '../../src/store/schema';
import { introduceItem } from '../../src/engine/srs';
import { getItem } from '../../src/content';
import { getSource } from '../../src/content/sources';

vi.mock('../../src/content', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/content')>();
  const items = actual.ITEMS.filter(item => ['kana-a', 'kana-i', 'kana-u'].includes(item.id));
  return { ...actual, ITEMS: items, getItem: (id: string) => items.find(item => item.id === id) };
});

vi.mock('../../src/hand', () => ({
  HandView: (props: { label: string; dominant: string }) => h('div', { role: 'img', 'aria-label': props.label, 'data-dominant': props.dominant }),
  renderThumbnail: () => Promise.resolve('data:image/png;base64,AA'),
}));
let root: HTMLDivElement;
async function settle(action: () => void) { await act(async () => { action(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
function button(text: string): HTMLButtonElement {
  const element = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === text);
  if (!element) throw new Error(`ボタンがありません: ${text}`);
  return element;
}
async function click(text: string) { await settle(() => button(text).click()); }
async function go(hash: string) { await settle(() => { location.hash = hash; }); }
async function mount(hash: string) { history.replaceState(null, '', hash); await act(() => render(h(App, {}), root)); }
async function chooseFile(text: string) {
  const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([text], 'progress.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await settle(() => input.dispatchEvent(new Event('change', { bubbles: true })));
}
beforeEach(() => {
  clearSession();
  const state = createDefaultProgress(); state.settings.onboarded = true; state.settings.sound = false;
  state.settings.vibration = false; state.settings.reduceMotion = true;
  updateProgress(() => state); lastResult.value = null; sessionActive.value = false;
  systemReducedMotion.value = false; currentDay.value = '2026-11-13';
  root = document.createElement('div'); document.body.append(root);
});
afterEach(async () => { await act(() => render(null, root)); root.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('UI Bの画面の接続（仮想DOM）', () => {
  it('復習がないと、てまると道すじへの入口を出す', async () => {
    await mount('#/review');
    expect(root.textContent).toContain('今日の復習はありません');
    expect(root.querySelector('a.button')?.getAttribute('href')).toBe('#/');
  });
  it('復習を1項目1問で完了し、5経験値を一度だけ保存して結果へ進む', async () => {
    updateProgress(state => ({ ...state, items: { 'kana-a': introduceItem('2026-11-01') } }));
    await mount('#/review'); await click('復習をはじめる');
    expect(root.querySelector('.lesson__header')?.textContent).toContain('1 / 1');
    expect(root.querySelector('.bottom-tabs')).toBeNull();
    await settle(() => root.querySelector<HTMLButtonElement>('.choices [data-shortcut="1"]')!.click());
    // 選択肢の順は固定しない。画像の説明から正しい札を選ぶ。
    const correct = [...root.querySelectorAll<HTMLButtonElement>('.choices button')].find(element => element.querySelector('img')?.alt === getItem('kana-a')!.describe.viewer)!;
    await settle(() => correct.click()); await click('チェック');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 410)); });
    await settle(() => { button('つづける').click(); button('つづける').click(); });
    expect(root.textContent).toContain('復習完了！'); expect(lastResult.value?.xp).toBe(5);
    expect(Object.values(progress.value.xpByDay)).toEqual([5]); expect(progress.value.items['kana-a']!.correct).toBe(1);
    expect(root.querySelector('.bottom-tabs')).not.toBeNull();
    await click('もう一度'); expect(location.hash).toBe('#/review');
    expect(root.textContent).not.toContain('このレッスンはまだ開けません');
  });
  it('苦手の直リンクから出題し、中断を取り消せる', async () => {
    updateProgress(state => ({ ...state, items: { 'kana-i': { ...introduceItem('2026-11-01'), wrong: 3 } } }));
    await mount('#/practice/weak'); expect(root.querySelector('.lesson')).not.toBeNull();
    await go('#/dict'); expect(root.querySelector('dialog')?.open).toBe(true);
    await click('つづける'); expect(root.querySelector('dialog')).toBeNull(); expect(location.hash).toBe('#/practice/weak');
  });
  it('図鑑から詳細へ進み、未収録のコースも表示する', async () => {
    await mount('#/dict'); expect(root.querySelectorAll('.catalog-item')).toHaveLength(3);
    await go('#/dict/kana-a'); expect(root.textContent).toContain('自分で作るときのコツ');
    expect(root.textContent).toContain('確信度');
    const sources = getItem('kana-a')!.sources.map(id => getSource(id)!);
    expect(sources.length).toBeGreaterThan(0);
    const sourceList = [...root.querySelectorAll('section')].find(section => section.querySelector('h2')?.textContent === '出典')!;
    expect(sourceList).toBeTruthy();
    const links = [...sourceList.querySelectorAll('li a')];
    expect(links).toHaveLength(sources.length);
    for (const source of sources) {
      expect(links.some(link => link.getAttribute('href') === source.url && link.textContent?.includes(source.title))).toBe(true);
    }
    await go('#/dict'); await click('数字'); expect(root.textContent).toContain('このコースの教材は準備中です');
  });
  it('不明な項目の住所でも図鑑に戻れる', async () => {
    await mount('#/dict/missing'); expect(root.textContent).toContain('項目が見つかりません');
    expect(root.querySelector('a.button')?.getAttribute('href')).toBe('#/dict');
  });
  it('再生では収録外を通知し、動きを減らす場合は文字を選べる', async () => {
    await mount('#/spell');
    await settle(() => { const input = root.querySelector<HTMLInputElement>('#spell-input')!; input.value = 'アイ漢'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await settle(() => root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(root.textContent).toContain('『漢』は指文字が無いので飛ばします');
    expect(root.querySelector('[aria-current="step"]')?.textContent).toBe('あ');
    await click('い'); expect(root.querySelector('[aria-current="step"]')?.textContent).toBe('い');
    await click('はじめから'); expect(root.querySelector('[aria-current="step"]')?.textContent).toBe('あ');
  });
  it('記録に棒グラフと未取得実績を出し、同じ共有部品で文を渡す', async () => {
    await mount('#/me'); expect(root.querySelector('.xp-chart svg')?.getAttribute('aria-label')).toContain('経験値');
    expect(root.querySelectorAll('.achievement-list li')).toHaveLength(12);
    await click('記録をシェア'); expect(root.querySelector('dialog')?.textContent).toContain('てことばで手話を0日続けています');
    expect(root.querySelector('dialog a')?.getAttribute('target')).toBe('_blank');
  });
  it('利き手の変更を保存し、詳細画面にも反映する', async () => {
    await mount('#/settings');
    await settle(() => { const select = root.querySelector<HTMLSelectElement>('#dominant')!; select.value = 'left'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    flushProgress(); expect(JSON.parse(localStorage.getItem('tekotoba:v1')!).settings.dominant).toBe('left');
    await go('#/dict/kana-a'); expect(root.querySelector('[data-dominant]')?.getAttribute('data-dominant')).toBe('left');
  });
  it('カメラ設定は既定で入り、説明を関連付けて切り替えを保存する', async () => {
    await mount('#/settings');
    const input = root.querySelector<HTMLInputElement>('[aria-describedby="camera-description"]')!;
    expect(input.checked).toBe(true);
    expect(input.closest('label')?.textContent).toBe('カメラで形を確かめる');
    expect(root.querySelector('#camera-description')?.textContent).toBe('「やってみよう」の問題で、ボタンを押したときだけカメラを使います');
    expect(root.textContent).not.toContain('確認中');
    await settle(() => input.click());
    flushProgress();
    expect(JSON.parse(localStorage.getItem('tekotoba:v1')!).settings.camera).toBe(false);
  });
  it('不正なファイルの理由を表示し、いまの記録を保つ', async () => {
    await mount('#/settings'); await chooseFile('{ invalid');
    expect(root.textContent).toContain('JSON形式を読み取れません'); expect(root.querySelector('dialog')).toBeNull();
    expect(progress.value.settings.onboarded).toBe(true);
  });
  it('読み込みの確認を取り消せて、承諾した時だけ記録を置き換える', async () => {
    await mount('#/settings'); const incoming = createDefaultProgress(); incoming.settings.onboarded = true; incoming.xpByDay = { '2026-11-12': 50 };
    await chooseFile(JSON.stringify(incoming)); expect(root.querySelector('dialog')?.textContent).toContain('いまの記録を置き換えます');
    expect(progress.value.xpByDay).toEqual({}); await click('やめる'); expect(progress.value.xpByDay).toEqual({});
    await chooseFile(JSON.stringify(incoming)); await click('置き換える'); expect(progress.value.xpByDay).toEqual(incoming.xpByDay);
    expect(JSON.parse(localStorage.getItem('tekotoba:v1')!).xpByDay).toEqual(incoming.xpByDay);
  });
  it('全削除も取り消せて、確定後は初回案内へ戻る', async () => {
    localStorage.setItem('tekotoba:v1:broken-test', '{broken');
    localStorage.setItem('another-app', 'keep');
    await mount('#/settings'); await click('すべて消す'); await click('やめる'); expect(progress.value.settings.onboarded).toBe(true);
    await click('すべて消す'); await click('消して最初から');
    expect(progress.value).toEqual(createDefaultProgress()); expect(location.hash).toBe('#/welcome');
    expect(root.querySelector('h1')?.textContent).toBe('てことば');
    expect(localStorage.getItem('tekotoba:v1:broken-test')).toBeNull();
    expect(localStorage.getItem('another-app')).toBe('keep');
  });
  it('通常の再生では文字を自動で送り、収録外を飛ばして最後で止まる', async () => {
    updateProgress(state => ({ ...state, settings: { ...state.settings, reduceMotion: false } }));
    await mount('#/spell'); vi.useFakeTimers();
    await act(() => { const input = root.querySelector<HTMLInputElement>('#spell-input')!; input.value = 'あ漢い'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(() => { root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(root.querySelector('[aria-current="step"]')?.textContent).toBe('あ');
    await act(() => { vi.advanceTimersByTime(1300); });
    expect(root.querySelector('[aria-current="step"]')?.textContent).toBe('い');
    await act(() => { vi.advanceTimersByTime(1300); });
    expect(root.textContent).toContain('停止中'); expect(root.querySelector('[aria-current="step"]')?.textContent).toBe('い');
  });
  it('アプリ説明はカメラの任意利用・送信停止・読み取りの限界を表示する', async () => {
    await mount('#/about');
    expect(root.textContent).not.toContain('確認中');
    for (const text of ['問題を離れると止まります', '保存も送信もしません', 'MediaPipe（Apache License 2.0）', '利用状況の数値', '送信を止めています', '2026年11月13日', '正しさを保証するものではありません', '明るさや手の重なり']) expect(root.textContent).toContain(text);
    expect(root.textContent).toContain('ろう者の監修は受けていません'); expect(root.textContent).toContain('Day092');
    expect(root.querySelector('a[href="./THIRD_PARTY_NOTICES.txt"]')).not.toBeNull();
    // 誤りの知らせ先は、100日の他のDayと同じリポジトリの Issue。準備中のままにしない
    expect(root.textContent).not.toContain('準備中です');
    expect(root.querySelector('a[href="https://github.com/haranishi/hundred-days/issues"]')).not.toBeNull();
  });
});
