// OWNER: tests
// 操作の読み取り：押した瞬間は1回だけ届き（刻みが多くても少なくても）、キー名の書き方の違いは同じ入力になる。
import { describe, expect, it } from 'vitest';
import { InputState } from '../../src/core/input';
import { readControls } from '../../src/gameplay/controls';
import { parseInputName, pressInput, releaseInput } from '../../src/harness/keys';

describe('キー名', () => {
  it('w・KeyW・space・Shift・left・right を同じ入力に直す', () => {
    expect(parseInputName('w')).toEqual({ kind: 'key', code: 'KeyW' });
    expect(parseInputName('KeyW')).toEqual({ kind: 'key', code: 'KeyW' });
    expect(parseInputName('space')).toEqual({ kind: 'key', code: 'Space' });
    expect(parseInputName('Shift')).toEqual({ kind: 'key', code: 'ShiftLeft' });
    expect(parseInputName('left')).toEqual({ kind: 'button', button: 0 });
    expect(parseInputName(2)).toEqual({ kind: 'button', button: 2 });
  });
});

describe('操作の読み取り', () => {
  it('押した瞬間（Space・右クリック・Q・E）は、次に読んだ1回だけ true になる', () => {
    const input = new InputState();
    for (const k of ['space', 'right', 'q', 'e']) pressInput(input, k);
    const first = readControls(input);
    expect([first.ascendPressed, first.clawPressed, first.tailPressed, first.specialPressed]).toEqual([true, true, true, true]);
    const second = readControls(input);
    expect([second.ascendPressed, second.clawPressed, second.tailPressed, second.specialPressed]).toEqual([false, false, false, false]);
    // 押し続けている間は「押している」は true のまま
    expect(second.ascendHeld).toBe(true);
  });

  it('刻みの間に押して離しても、押した瞬間は落とさない', () => {
    const input = new InputState();
    pressInput(input, 'right');
    releaseInput(input, 'right');
    expect(readControls(input).clawPressed).toBe(true);
  });

  it('WASD は視点に対する前後左右、左クリック長押しは炎、マウスの動きは1回で取り出す', () => {
    const input = new InputState();
    pressInput(input, 'w');
    pressInput(input, 'd');
    pressInput(input, 'left');
    input.injectMotion(12, -3);
    const c = readControls(input);
    expect([c.moveForward, c.moveRight, c.breathHeld]).toEqual([1, 1, true]);
    expect([c.lookDx, c.lookDy]).toEqual([12, -3]);
    expect(readControls(input).lookDx).toBe(0);
  });
});

describe('マウスの感度と上下反転（r02-controls）', () => {
  it('本物のマウスの動きにだけ掛かり、注入した動き（自動プレイ・検証）には掛からない', () => {
    const input = new InputState();
    input.setLookPrefs({ scale: 2, invertY: true });
    // ボタンを押したままのドラッグ（ポインタロックの無い環境）として本物の mousemove を渡す
    input.injectButtonDown(2);
    (input as unknown as { onMouseMove(e: { movementX: number; movementY: number }): void }).onMouseMove({ movementX: 10, movementY: 4 });
    input.injectMotion(3, 5);
    const c = readControls(input);
    expect(c.lookDx).toBe(10 * 2 + 3);
    expect(c.lookDy).toBe(-4 * 2 + 5);
  });

  it('C は空中で押し続けて降りる操作として読む', () => {
    const input = new InputState();
    pressInput(input, 'c');
    expect(readControls(input).descendHeld).toBe(true);
    releaseInput(input, 'c');
    expect(readControls(input).descendHeld).toBe(false);
  });
});
