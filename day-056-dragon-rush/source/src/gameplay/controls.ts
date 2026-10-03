// OWNER: gameplay
// 入力の状態から、1刻みぶんの操作（ControlFrame）を読む。割り当ては config/controls.ts。
// 人の操作も自動プレイも、同じ InputState を通ってここへ来る。
import { KEYS, MOUSE } from '../config/controls';

/** controls が読む入力の口（core/input.ts の InputState が満たす）。 */
export interface InputSource {
  isDown(code: string): boolean;
  consumePress(code: string): boolean;
  isButtonDown(button: number): boolean;
  consumeButtonPress(button: number): boolean;
  consumeMotion(): { dx: number; dy: number; wheel: number };
}

export interface ControlFrame {
  /** 視点に対する移動（右が +、前が +、-1〜1） */
  moveRight: number;
  moveForward: number;
  /** マウスの移動量（画素。感度と上下反転は core/input.ts で掛け済み） */
  lookDx: number;
  lookDy: number;
  ascendPressed: boolean;
  ascendHeld: boolean;
  /** 空中で押し続けて降りる（C、r02-controls で追加） */
  descendHeld: boolean;
  sprintHeld: boolean;
  breathHeld: boolean;
  clawPressed: boolean;
  tailPressed: boolean;
  specialPressed: boolean;
}

export const emptyControls = (): ControlFrame => ({
  moveRight: 0,
  moveForward: 0,
  lookDx: 0,
  lookDy: 0,
  ascendPressed: false,
  ascendHeld: false,
  descendHeld: false,
  sprintHeld: false,
  breathHeld: false,
  clawPressed: false,
  tailPressed: false,
  specialPressed: false,
});

const anyDown = (input: InputSource, codes: readonly string[]): boolean => codes.some((c) => input.isDown(c));
/** 押下の記録は、割り当てたキーすべてから取り出す（どれか1つでも押されていれば true）。 */
const anyPressed = (input: InputSource, codes: readonly string[]): boolean => codes.map((c) => input.consumePress(c)).some(Boolean);

export function readControls(input: InputSource): ControlFrame {
  const motion = input.consumeMotion();
  const clawPressed = input.consumeButtonPress(MOUSE.claw);
  input.consumeButtonPress(MOUSE.breath);
  return {
    moveRight: (anyDown(input, KEYS.right) ? 1 : 0) - (anyDown(input, KEYS.left) ? 1 : 0),
    moveForward: (anyDown(input, KEYS.forward) ? 1 : 0) - (anyDown(input, KEYS.back) ? 1 : 0),
    lookDx: motion.dx,
    lookDy: motion.dy,
    ascendPressed: anyPressed(input, KEYS.ascend),
    ascendHeld: anyDown(input, KEYS.ascend),
    descendHeld: anyDown(input, KEYS.descend),
    sprintHeld: anyDown(input, KEYS.sprint),
    breathHeld: input.isButtonDown(MOUSE.breath),
    clawPressed,
    tailPressed: anyPressed(input, KEYS.tail),
    specialPressed: anyPressed(input, KEYS.special),
  };
}
