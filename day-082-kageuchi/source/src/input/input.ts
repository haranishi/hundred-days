// OWNER: core
// 入力の状態を集める。本人の別プロジェクト dragon-rampage の src/core/input.ts を写して、影討ちの操作に合わせて削った。
// 何のキーが何をするか（操作の割り当て）はここでは決めない（src/config/controls.ts）。
// 押された瞬間は2通りで持つ：画面の流れが毎コマ1回だけ取る consumeFramePress と、sim が刻みごとに1回だけ取る consumeTickPress。
// 刻みがコマより多くても少なくても、1回の押下が1回だけ届くようにするため。
// window.__input（自動操作の口）は、本物の入力と同じ状態を書き換える（inject*）。
import { KEYS, type Action } from '../config/controls';

export interface AutomationInput {
  down(code: string): void;
  up(code: string): void;
  /** 押して離す。押された印は、取られるまで残る。 */
  tap(code: string): void;
  /** マウスの移動量（px）。ポインタロック中の本物の動きと同じに扱う。 */
  look(dx: number, dy: number): void;
  clear(): void;
}

export class InputState {
  private readonly down = new Set<string>();
  private readonly framePress = new Set<string>();
  private readonly tickPress = new Set<string>();
  private readonly releaseLatch = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;
  private wheel = 0;
  private target: HTMLElement | null = null;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    this.injectKeyDown(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.injectKeyUp(e.code);
  };
  private readonly onMouseMove = (e: MouseEvent): void => {
    // ポインタロック中の動きだけを視点の動きとして数える
    if (typeof document !== 'undefined' && document.pointerLockElement === this.target) this.injectMotion(e.movementX, e.movementY);
  };
  private readonly onWheel = (e: WheelEvent): void => {
    this.wheel += e.deltaY;
  };
  private readonly onBlur = (): void => {
    this.releaseAll();
  };
  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  attach(target: HTMLElement): void {
    this.detach();
    this.target = target;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('wheel', this.onWheel, { passive: true });
    target.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    if (!this.target) return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('wheel', this.onWheel);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    this.target = null;
  }

  injectKeyDown(code: string): void {
    if (!this.down.has(code)) {
      this.framePress.add(code);
      this.tickPress.add(code);
    }
    this.down.add(code);
  }

  injectKeyUp(code: string): void {
    if (this.down.has(code)) this.releaseLatch.add(code);
    this.down.delete(code);
  }

  injectMotion(dx: number, dy: number): void {
    this.mouseDx += dx;
    this.mouseDy += dy;
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** その操作のキーのどれかが押されている。 */
  held(action: Action): boolean {
    for (const c of KEYS[action]) if (this.down.has(c)) return true;
    return false;
  }

  /** 画面の流れ（一時停止・やり直し・決定）：前に取ってから押されたか。 */
  consumeFramePress(action: Action): boolean {
    let hit = false;
    for (const c of KEYS[action]) if (this.framePress.delete(c)) hit = true;
    return hit;
  }

  /** sim の刻み（しゃがみ・当て身）：前に取ってから押されたか。 */
  consumeTickPress(action: Action): boolean {
    let hit = false;
    for (const c of KEYS[action]) if (this.tickPress.delete(c)) hit = true;
    return hit;
  }

  /** 前に取ってから、押していて離されたか（狙いを離したら投げる）。 */
  consumeRelease(action: Action): boolean {
    let hit = false;
    for (const c of KEYS[action]) if (this.releaseLatch.delete(c)) hit = true;
    return hit;
  }

  /** 前回呼んでからのマウス移動量とホイール量を取り出して 0 に戻す。 */
  consumeMotion(): { dx: number; dy: number; wheel: number } {
    const m = { dx: this.mouseDx, dy: this.mouseDy, wheel: this.wheel };
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.wheel = 0;
    return m;
  }

  /** コマの終わりに呼ぶ：画面の流れの押下は、そのコマで取られなければ捨てる（前の画面の押下を持ち越さない）。 */
  endFrame(): void {
    this.framePress.clear();
  }

  /** 押された印だけを消す（画面が変わったとき、前の画面の押下を持ち越さない）。 */
  clearPresses(): void {
    this.framePress.clear();
    this.tickPress.clear();
    this.releaseLatch.clear();
  }

  /** 押しっぱなしも含めて全部離す（一時停止・やり直し・フォーカスを失ったとき）。 */
  releaseAll(): void {
    this.down.clear();
    this.clearPresses();
    this.mouseDx = 0;
    this.mouseDy = 0;
  }

  automation(): AutomationInput {
    return {
      down: (code) => this.injectKeyDown(code),
      up: (code) => this.injectKeyUp(code),
      tap: (code) => {
        this.injectKeyDown(code);
        this.injectKeyUp(code);
      },
      look: (dx, dy) => this.injectMotion(dx, dy),
      clear: () => this.releaseAll(),
    };
  }
}
