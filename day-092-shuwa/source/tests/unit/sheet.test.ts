// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { Sheet } from '../../src/ui/Sheet';

let root: HTMLDivElement;
let opener: HTMLButtonElement;
let frames: FrameRequestCallback[];
beforeEach(() => {
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback));
  root = document.createElement('div');
  opener = document.createElement('button');
  document.body.append(opener, root);
  opener.focus();
});
afterEach(async () => {
  await act(() => render(null, root));
  root.remove(); opener.remove(); vi.restoreAllMocks();
});
async function open(onClose = () => {}) {
  await act(() => render(h(Sheet, { title: '確認', onClose, children: h('button', {}, 'とじる') }), root));
}
async function close() { await act(() => render(null, root)); }
function flushFrames() { frames.splice(0).forEach(callback => callback(0)); }

describe('Sheetのフォーカス復帰', () => {
  it('開く前の要素を覚え、close後のフレームでスクロールせずに戻す', async () => {
    await open();
    root.querySelector('button')!.focus();
    const focus = vi.spyOn(opener, 'focus');
    await close();
    // Native dialog focus work may change focus after close().
    document.body.focus();
    expect(focus).not.toHaveBeenCalledWith({ preventScroll: true });
    flushFrames();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(opener);
  });
  it('復帰前に元の要素が消えた場合はフォーカスしない', async () => {
    await open(); await close(); opener.remove();
    const focus = vi.spyOn(opener, 'focus');
    flushFrames(); expect(focus).not.toHaveBeenCalled();
  });
  it('別の窓が開いていたらフォーカスを奪わない', async () => {
    await open(); await close();
    const other = document.createElement('dialog'); document.body.append(other); other.showModal();
    const focus = vi.spyOn(opener, 'focus');
    try { flushFrames(); expect(focus).not.toHaveBeenCalled(); }
    finally { other.close(); other.remove(); }
  });
  it('Escのcancelは親の閉じる処理を呼び、アンマウント後に復帰する', async () => {
    const onClose = vi.fn(() => render(null, root));
    await open(onClose);
    const cancel = new Event('cancel', { cancelable: true });
    await act(() => { root.querySelector('dialog')!.dispatchEvent(cancel); });
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    const focus = vi.spyOn(opener, 'focus');
    flushFrames(); expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
