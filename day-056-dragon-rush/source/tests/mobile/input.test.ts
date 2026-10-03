import { describe, expect, it, vi } from 'vitest';
import { createTouchInput, isTouchDevice } from '../../src/mobile/input';
import { touchCoachLine } from '../../src/mobile/hints';

function setup() {
  const api = { press: vi.fn(), release: vi.fn(), look: vi.fn() };
  let active = true;
  const input = createTouchInput(() => active ? api : undefined);
  return { api, input, stop: () => { active = false; } };
}

describe('マルチタッチ入力', () => {
  it('移動と主砲を同時に押し、一方だけ離せる', () => {
    const { api, input } = setup();
    input.move(1, 0.8, -0.8); input.hold(2, 'left');
    expect(api.press.mock.calls.map(([key]) => key)).toEqual(['KeyD', 'KeyW', 'left']);
    input.release(1);
    expect(api.release.mock.calls.map(([key]) => key)).toEqual(['KeyD', 'KeyW']);
    input.release(2); expect(api.release).toHaveBeenLastCalledWith('left');
  });
  it('同じボタンの最後の指が離れるまで解除しない', () => {
    const { api, input } = setup();
    input.hold(1, 'left'); input.hold(2, 'left'); input.release(1);
    expect(api.press).toHaveBeenCalledTimes(1); expect(api.release).not.toHaveBeenCalled();
    input.release(2); expect(api.release).toHaveBeenCalledOnce();
  });
  it('中立とデッドゾーンでは移動しない', () => {
    const { api, input } = setup();
    input.move(1, 0.2, -0.2); expect(api.press).not.toHaveBeenCalled();
    input.move(1, -0.8, 0.8); input.move(1, 0, 0);
    expect(api.release.mock.calls.map(([key]) => key)).toEqual(['KeyA', 'KeyS']);
  });
  it('停止した直後にも旧入力のキーを解除する', () => {
    const { api, input, stop } = setup();
    input.hold(1, 'left'); stop(); input.reset();
    expect(api.release).toHaveBeenCalledWith('left');
    input.hold(2, 'right'); expect(api.press).toHaveBeenCalledTimes(1);
  });
  it('視点移動に無効な数値を流さない', () => {
    const { api, input } = setup();
    input.look(5, -6); input.look(NaN, 0); input.move(1, Infinity, 1);
    expect(api.look.mock.calls).toEqual([[5, -6]]); expect(api.press).not.toHaveBeenCalled();
  });
  it('画面切替で全て解除し、重ねて解除しても安全', () => {
    const { api, input } = setup();
    input.hold(1, 'Space'); input.hold(2, 'KeyQ'); input.reset(); input.reset();
    expect(api.release.mock.calls.map(([key]) => key)).toEqual(['Space', 'KeyQ']);
  });
  it('入力先の交換時に旧入力を解除する', () => {
    const oldApi = { press: vi.fn(), release: vi.fn(), look: vi.fn() };
    const nextApi = { press: vi.fn(), release: vi.fn(), look: vi.fn() };
    let api = oldApi;
    const input = createTouchInput(() => api);
    input.hold(1, 'left'); api = nextApi; input.hold(2, 'right');
    expect(oldApi.release).toHaveBeenCalledWith('left');
    expect(nextApi.press.mock.calls.map(([key]) => key)).toEqual(['left', 'right']);
  });
});

it('3体のスマホ案内にキーボード・マウスの指定を出さない', () => {
  for (const creature of ['kurenai', 'raiyoku', 'homuratsuno'] as const) {
    for (const step of ['move', 'breath', 'claw', 'fly', 'rage'] as const) {
      expect(touchCoachLine(step, false, creature).flat().join('')).not.toMatch(/WASD|クリック|Space|Shift|Esc/);
    }
  }
});

it('入口でタッチを選んだ後は、ポインタ判定が変わっても操作モードを保つ', () => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('navigator', { maxTouchPoints: 0 });
  vi.stubGlobal('document', { body: { classList: { contains: () => true } } });
  try { expect(isTouchDevice()).toBe(true); } finally { vi.unstubAllGlobals(); }
});

it('PCのキーボード・マウス環境ではタッチUIを出さない', () => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('navigator', { maxTouchPoints: 0 });
  vi.stubGlobal('document', { body: { classList: { contains: () => false } } });
  try { expect(isTouchDevice()).toBe(false); } finally { vi.unstubAllGlobals(); }
});
