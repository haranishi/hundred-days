/**
 * 入力のまとめ役：キーボード（WASD/矢印・Shift・Space・J/E・Esc）、タッチ（touch.ts）、ゲームパッド → InputState。
 * カメラは北を向いて固定なので、画面の上＝北＝moveZ が負。
 * ゲームパッドの割り当て：左スティック＝移動、A＝アクション、B/LB＝ジャンプ、X/RB/RT＝ダッシュ、START＝一時停止。
 */
import type { InputState } from '../../shared/input';
import type { ActionPrompt } from '../../shared/view';
import { TouchControls } from './touch';

export interface InputController {
  /** 今の入力。押した瞬間・離した瞬間の印は読んだら消える */
  read(): InputState;
  setPrompt(p: ActionPrompt | null): void;
  /** 試合中だけ、タッチの操作を出す・キーを受ける */
  setActive(on: boolean): void;
  /** 指で操作しているか（案内の出し分けに使う） */
  readonly touchMode: boolean;
  onPause: (() => void) | null;
  dispose(): void;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const ACTION_KEYS = new Set(['KeyJ', 'KeyE']);
const DASH_KEYS = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(hudRoot: HTMLElement): InputController {
  const touch = new TouchControls(hudRoot);
  const keys = new Set<string>();
  let active = false;
  let pressed = false;
  let released = false;
  let dash = false;
  let jump = false;
  let padPrev: boolean[] = [];
  let coarse = false;
  try {
    coarse = window.matchMedia('(pointer: coarse)').matches;
  } catch {
    coarse = false;
  }
  const ctl: InputController = {
    onPause: null,
    get touchMode() {
      return coarse || touch.used;
    },
    read() {
      let mx = 0;
      let mz = 0;
      for (const k of keys) {
        const d = MOVE_KEYS[k];
        if (d) {
          mx += d[0];
          mz += d[1];
        }
      }
      const kl = Math.hypot(mx, mz);
      if (kl > 0) {
        mx /= kl;
        mz /= kl;
      }
      const t = touch.read();
      if (Math.hypot(t.moveX, t.moveZ) > Math.hypot(mx, mz)) {
        mx = t.moveX;
        mz = t.moveZ;
      }
      let action = [...ACTION_KEYS].some((k) => keys.has(k)) || t.action;
      let aPressed = pressed || t.actionPressed;
      let aReleased = released || t.actionReleased;
      let d = dash || t.dash;
      let j = jump || t.jump;
      // ゲームパッド
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = [...pads].find((p) => p && p.connected);
      if (pad) {
        const ax = pad.axes[0] ?? 0;
        const az = pad.axes[1] ?? 0;
        if (Math.hypot(ax, az) > 0.2 && Math.hypot(ax, az) > Math.hypot(mx, mz)) {
          mx = ax;
          mz = az;
        }
        const now = pad.buttons.map((b) => b.pressed);
        const edge = (i: number): boolean => !!now[i] && !padPrev[i];
        if (now[0]) action = true;
        if (edge(0)) aPressed = true;
        if (!now[0] && padPrev[0]) aReleased = true;
        if (edge(1) || edge(4)) j = true;
        if (edge(2) || edge(5) || edge(7)) d = true;
        if (edge(9)) ctl.onPause?.();
        padPrev = now;
      }
      pressed = false;
      released = false;
      dash = false;
      jump = false;
      if (!active) return { moveX: 0, moveZ: 0, action: false, actionPressed: false, actionReleased: false, dash: false, jump: false };
      const len = Math.hypot(mx, mz);
      if (len > 1) {
        mx /= len;
        mz /= len;
      }
      return { moveX: mx, moveZ: mz, action, actionPressed: aPressed, actionReleased: aReleased, dash: d, jump: j };
    },
    setPrompt(p) {
      touch.setPrompt(p);
    },
    setActive(on) {
      active = on;
      hudRoot.classList.toggle('syh-playing', on);
      if (!on) {
        keys.clear();
        touch.reset();
      }
    },
    dispose() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerdown', onPointer, { capture: true });
      touch.root.remove();
    },
  };
  const onDown = (e: KeyboardEvent): void => {
    if (!active) return;
    if (e.code === 'Escape') {
      ctl.onPause?.();
      return;
    }
    const known = e.code in MOVE_KEYS || ACTION_KEYS.has(e.code) || DASH_KEYS.has(e.code) || e.code === 'Space';
    if (!known) return;
    // 画面のスクロールを止める
    e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (ACTION_KEYS.has(e.code)) pressed = true;
    if (DASH_KEYS.has(e.code)) dash = true;
    if (e.code === 'Space') jump = true;
  };
  const onUp = (e: KeyboardEvent): void => {
    if (ACTION_KEYS.has(e.code) && keys.has(e.code)) released = true;
    keys.delete(e.code);
  };
  const onBlur = (): void => keys.clear();
  // 指で触ったら、それ以後はタッチの操作を出す
  const showTouch = (): void => touch.root.classList.add('is-on');
  if (coarse) showTouch();
  const onPointer = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      touch.used = true;
      showTouch();
    }
  };
  window.addEventListener('pointerdown', onPointer, { capture: true });
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  return ctl;
}
