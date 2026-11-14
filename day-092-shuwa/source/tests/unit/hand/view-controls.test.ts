// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef, h, render } from 'preact';
import { act } from 'preact/test-utils';
import type { HandViewHandle, HandViewProps, SignSpec } from '../../../src/hand/types';
import { DRAG_SLOP, dragIntent, dragRotation } from '../../../src/hand/core/gesture';

/** 描画の部分（three.js）の偽物。呼ばれた操作を記録する */
const calls: string[] = [];
let rotation = { yaw: 0, pitch: 0 };
vi.mock('../../../src/hand/render/runtime', () => ({
  webglSupported: () => true,
  rendererAlive: () => true,
  HandViewController: {
    create: () => ({
      warnings: [],
      setSize: () => calls.push('setSize'),
      renderNow: () => calls.push('renderNow'),
      play: (s: number) => calls.push(`play:${s}`),
      setSpec: () => calls.push('setSpec'),
      update: () => undefined,
      setVisible: () => undefined,
      dispose: () => calls.push('dispose'),
      getRotation: () => ({ ...rotation }),
      setRotation: (yaw: number, pitch: number) => {
        rotation = { yaw, pitch };
        calls.push('setRotation');
      },
      resetRotation: () => {
        rotation = { yaw: 0, pitch: 0 };
        calls.push('resetRotation');
      },
    }),
  },
}));

const { HandView } = await import('../../../src/hand/view');

const spec: SignSpec = { hands: { dominant: { keyframes: [{ t: 0, pos: { at: 'neutral' } }] } } };
let root: HTMLDivElement;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('button')];
const labels = () => buttons().map((b) => b.textContent);
const resetButton = () => buttons().find((b) => b.textContent === '向きを戻す')!;
async function mount(props: Partial<HandViewProps> = {}, ref?: ReturnType<typeof createRef<HandViewHandle>>) {
  await act(() => render(h(HandView, { spec, label: 'あ', interactive: true, ref, ...props } as HandViewProps), root));
  await flush();
}
function pointer(type: string, x: number, y: number, pointerType: string) {
  const stage = root.querySelector('.hand-view__stage')!;
  stage.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, pointerType, bubbles: true }));
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  calls.length = 0;
  rotation = { yaw: 0, pitch: 0 };
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe('ドラッグの判定（core/gesture.ts）', () => {
  it('指: 横の払いは回す、縦の払いはスクロールに任せる。動き始めまでは決めない', () => {
    expect(dragIntent(2, 3, 'touch')).toBe('pending');
    expect(dragIntent(DRAG_SLOP + 1, 2, 'touch')).toBe('rotate');
    expect(dragIntent(2, -(DRAG_SLOP + 1), 'touch')).toBe('scroll');
    expect(dragIntent(5, -20, 'touch')).toBe('scroll');
    expect(dragIntent(20, 5, 'touch')).toBe('rotate');
  });

  it('マウス・ペンは縦でも回す（上下の回転を残す）。指では上下に回さない', () => {
    expect(dragIntent(0, 30, 'mouse')).toBe('rotate');
    expect(dragIntent(0, 30, 'pen')).toBe('rotate');
    expect(dragRotation(0, 50, 320, 'mouse').pitch).toBeGreaterThan(0);
    expect(dragRotation(40, 50, 320, 'touch')).toEqual({ yaw: -20, pitch: 0 });
  });
});

describe('HandView のボタン（controls）', () => {
  it("既定（'full'）: 視点の切り替え・もう一度・ゆっくり・向きを戻す（回していない時は場所だけ取る）", async () => {
    await mount();
    expect(labels()).toEqual(['相手から見る', '自分から見る', 'もう一度', 'ゆっくり', '向きを戻す']);
    const r = resetButton();
    expect(r.classList.contains('hand-view__btn--reserved')).toBe(true);
    expect(r.disabled).toBe(true);
    expect(r.getAttribute('aria-hidden')).toBe('true');
    expect(r.tabIndex).toBe(-1);
  });

  it("'view': 視点の切り替えと向きを戻すだけ（親の画面が自分で再生を操る時）", async () => {
    await mount({ controls: 'view' });
    expect(labels()).toEqual(['相手から見る', '自分から見る', '向きを戻す']);
  });

  it("'none': ボタンを出さない", async () => {
    await mount({ controls: 'none' });
    expect(labels()).toEqual([]);
  });

  it('回すと「向きを戻す」が見え、ボタンの数と並びは変わらない（ほかのボタンが横へずれない）', async () => {
    await mount();
    const before = buttons();
    await act(() => {
      pointer('pointerdown', 100, 100, 'mouse');
      pointer('pointermove', 140, 100, 'mouse');
      pointer('pointerup', 140, 100, 'mouse');
    });
    const after = buttons();
    expect(after).toEqual(before);
    expect(resetButton().classList.contains('hand-view__btn--reserved')).toBe(false);
    expect(resetButton().disabled).toBe(false);
    await act(() => resetButton().click());
    expect(calls).toContain('resetRotation');
    expect(resetButton().classList.contains('hand-view__btn--reserved')).toBe(true);
  });

  it('指の縦の払いでは回さず、横の払いでは左右だけ回す', async () => {
    await mount();
    await act(() => {
      pointer('pointerdown', 100, 100, 'touch');
      pointer('pointermove', 102, 60, 'touch');
      pointer('pointermove', 104, 20, 'touch');
      pointer('pointercancel', 104, 20, 'touch');
    });
    expect(calls).not.toContain('setRotation');
    expect(resetButton().classList.contains('hand-view__btn--reserved')).toBe(true);
    await act(() => {
      pointer('pointerdown', 100, 100, 'touch');
      pointer('pointermove', 160, 104, 'touch');
      pointer('pointerup', 160, 104, 'touch');
    });
    expect(calls).toContain('setRotation');
    expect(rotation.pitch).toBe(0);
    expect(rotation.yaw).toBeLessThan(0);
  });
});

describe('HandView の作り直し（画面の側が key を変えて再生をやり直す時のちらつき）', () => {
  it('描画の部分を読み込み済みなら、仮表示を出さずに、その場で1コマ目を描く', async () => {
    await mount();
    render(null, root);
    calls.length = 0;
    // 2回目以降は読み込みを待たない: 最初の描画の時点で仮表示が無く、1コマ目を描いている
    render(h(HandView, { spec, label: 'あ', interactive: true } as HandViewProps), root);
    expect(root.querySelector('.hand-view__placeholder')).toBeNull();
    await act(() => undefined);
    expect(calls.slice(0, 2)).toEqual(['setSize', 'renderNow']);
  });

  it('replay() は描画の部分に再生を頼む', async () => {
    const ref = createRef<HandViewHandle>();
    await mount({}, ref);
    ref.current!.replay(0.5);
    expect(calls).toContain('play:0.5');
  });
});
