// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import type { ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { Dictionary, ItemDetail } from '../../src/screens/Dictionary';
import { About } from '../../src/screens/About';

vi.mock('../../src/hand', () => ({ HandView: () => h('div', {}), renderThumbnail: () => Promise.resolve('data:image/png;base64,AA') }));
vi.mock('../../src/content', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/content')>();
  const items = actual.ITEMS.map((item, index) => ({ ...item,
    kind: index === 2 ? 'word' as const : item.kind,
    confidence: index === 0 ? 'medium' as const : item.confidence,
    sources: ['source-a'], variants: '地域による別の表し方があります。',
    memory: { kind: index === 0 ? 'origin' as const : 'mnemonic' as const, text: '説明の例' },
    confusables: [{ id: 'kana-i', tip: '小指の向きに注目します。' }],
  }));
  return { ...actual, ITEMS: items, getItem: (id: string) => items.find(item => item.id === id) };
});
vi.mock('../../src/content/sources', () => {
  const source = { id: 'source-a', title: 'テスト用の参考資料', url: 'https://example.org/signs', publisher: '資料の発行者' };
  return { SOURCES: [source], getSource: (id: string) => id === source.id ? source : undefined };
});
let root: HTMLDivElement | undefined;
async function mount(component: ComponentChildren) {
  root = document.createElement('div'); document.body.append(root); await act(() => render(component, root!));
}
afterEach(async () => { if (root) { await act(() => render(null, root!)); root.remove(); } });
describe('教材の補足情報と出典', () => {
  it('mediumの項目には資料で分かれるの印を出す', async () => {
    await mount(h(Dictionary, {})); expect(root!.querySelector('a[href="#/dict/kana-a"]')?.textContent).toContain('資料で分かれる');
  });
  it('由来・地域差・見分け方・新しいタブの出典を表示する', async () => {
    await mount(h(ItemDetail, { id: 'kana-a' }));
    expect(root!.textContent).toContain('資料で確かめた由来'); expect(root!.textContent).toContain('地域による別の表し方');
    expect(root!.querySelector('a[href="#/dict/kana-i"]')?.textContent).toContain('小指の向き');
    const source = root!.querySelector('a[href="https://example.org/signs"]')!;
    expect(source.textContent).toContain('テスト用の参考資料'); expect(source.getAttribute('target')).toBe('_blank');
    expect(source.getAttribute('rel')).toContain('noopener');
  });
  it('覚え方の例を由来と区別し、単語には表情と体の注記を出す', async () => {
    await mount(h(ItemDetail, { id: 'kana-u' }));
    expect(root!.textContent).toContain('覚え方の例（由来ではありません）');
    expect(root!.textContent).toContain('表情や体の動きも意味を持ちます。手の動きの目安として見てください');
  });
  it('アプリ説明の資料一覧は出典の登録簿から自動で並べる', async () => {
    await mount(h(About, {})); expect(root!.querySelectorAll('.source-list a')).toHaveLength(1);
    expect(root!.querySelector('.source-list')?.textContent).toContain('資料の発行者');
  });
});
