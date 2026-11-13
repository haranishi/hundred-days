// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { TryIt } from '../../src/screens/exercises/TryIt';
import { progress, updateProgress, updateSettings } from '../../src/app/state';
import { createDefaultProgress } from '../../src/store/schema';
import { cameraSupported, loadCameraCheck } from '../../src/camera';

vi.mock('../../src/camera', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/camera')>(), cameraSupported: vi.fn(), loadCameraCheck: vi.fn(),
}));
vi.mock('../../src/screens/exercises/Sign', () => ({ Sign: () => h('div', {}, '手本') }));
const Camera = () => h('div', {}, 'カメラの画面');
let root: HTMLDivElement;
const mount = async (itemId = 'kana-a') => act(async () => {
  render(h(TryIt, { exercise: { id: 'try', kind: 'tryIt', itemId }, value: null,
    answered: false, onChange: vi.fn(), onSuccess: vi.fn(), onSkip: vi.fn() }), root);
});
const cameraButton = () => [...root.querySelectorAll('button')].find(button => button.textContent === 'カメラで確かめる');
beforeEach(() => {
  vi.mocked(cameraSupported).mockReturnValue(true);
  vi.mocked(loadCameraCheck).mockResolvedValue(Camera);
  updateProgress(() => createDefaultProgress());
  root = document.createElement('div'); document.body.append(root);
});
afterEach(async () => {
  await act(() => render(null, root)); root.remove(); vi.resetAllMocks();
});
describe('自分でやってみるの任意カメラ', () => {
  it.each(['kana-ra', 'kana-no'])('%sは判定対象外なので、部品を読み込まず手本の練習を続ける', async itemId => {
    await mount(itemId);
    expect(cameraButton()).toBeUndefined();
    expect(root.textContent).toContain('手本');
    expect(loadCameraCheck).not.toHaveBeenCalled();
  });
  it('対象形の読み込み中に対象外へ切り替わっても、遅れてボタンを表示しない', async () => {
    let resolve!: (component: typeof Camera) => void;
    vi.mocked(loadCameraCheck).mockReturnValue(new Promise(done => { resolve = done; }));
    await mount();
    await mount('kana-ra');
    await act(async () => resolve(Camera));
    expect(cameraButton()).toBeUndefined();
  });
  it('既定でボタンが出るが、押すまではカメラ部品を表示しない', async () => {
    expect(progress.value.settings.camera).toBe(true);
    await mount();
    expect(cameraButton()).toBeTruthy();
    expect(root.textContent).not.toContain('カメラの画面');
    await act(() => cameraButton()!.click());
    expect(root.textContent).toContain('カメラの画面');
    expect(cameraButton()).toBeUndefined();
    await act(() => updateSettings({ camera: false }));
    expect(root.textContent).not.toContain('カメラの画面');
    expect(root.textContent).toContain('自分でやってみる');
  });
  it.each(['設定が切', '非対応', '部品なし', '読み込み失敗'])('%sならボタンなしで手本の練習を続けられる', async condition => {
    if (condition === '設定が切') updateSettings({ camera: false });
    if (condition === '非対応') vi.mocked(cameraSupported).mockReturnValue(false);
    if (condition === '部品なし') vi.mocked(loadCameraCheck).mockResolvedValue(null);
    if (condition === '読み込み失敗') vi.mocked(loadCameraCheck).mockRejectedValue(new Error('load failed'));
    await mount();
    expect(cameraButton()).toBeUndefined();
    expect(root.textContent).toContain('自分でやってみる');
    expect(root.textContent).toContain('手本');
    if (condition === '設定が切' || condition === '非対応') expect(loadCameraCheck).not.toHaveBeenCalled();
  });
  it('読み込み中はボタンを出さず、完了前に設定を切っても後から表示しない', async () => {
    let resolve!: (component: typeof Camera) => void;
    vi.mocked(loadCameraCheck).mockReturnValue(new Promise(done => { resolve = done; }));
    await mount();
    expect(cameraButton()).toBeUndefined();
    await act(() => updateSettings({ camera: false }));
    await act(async () => resolve(Camera));
    expect(cameraButton()).toBeUndefined();
  });
});
