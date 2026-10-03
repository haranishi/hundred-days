// OWNER: core
// 入力の状態を集める。何のキーが何をするか（操作の割り当て）はここでは決めない（config/controls.ts）。
// 押された瞬間は2通りで持つ：画面側が毎コマ見る wasPressed と、シミュレーションが刻みごとに1回だけ取る consumePress。
// 刻みがコマより多くても少なくても、1回の押下が1回だけ届くようにするため。
// inject* は、ポインタロックが使えないとき（自動プレイ・検証）に同じ経路で操作するための口。
// 感度と上下反転（一時停止の画面の設定、r02-controls）は本物のマウスの動きにだけ掛ける。
// 注入した動き（自動プレイ・E2E の look）には掛けないので、設定を変えても自動プレイの結果は変わらない。

/** マウスの感度（倍）と上下反転。 */
export interface LookPrefs {
  scale: number;
  invertY: boolean;
}

export class InputState {
  private readonly down = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private readonly pressLatch = new Set<string>();
  private readonly buttons = new Set<number>();
  private readonly buttonLatch = new Set<number>();
  private mouseDx = 0;
  private mouseDy = 0;
  private wheel = 0;
  private target: HTMLElement | null = null;
  private look: LookPrefs = { scale: 1, invertY: false };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    this.injectKeyDown(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.injectKeyUp(e.code);
  };
  private readonly onMouseDown = (e: MouseEvent): void => {
    this.injectButtonDown(e.button);
  };
  private readonly onMouseUp = (e: MouseEvent): void => {
    this.injectButtonUp(e.button);
  };
  private readonly onMouseMove = (e: MouseEvent): void => {
    // ポインタロック中か、ボタンを押したままのドラッグだけを視点の動きとして数える
    const locked = typeof document !== 'undefined' && document.pointerLockElement === this.target;
    if (locked || this.buttons.size > 0) this.injectMotion(e.movementX * this.look.scale, e.movementY * this.look.scale * (this.look.invertY ? -1 : 1));
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
    target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('wheel', this.onWheel, { passive: true });
    target.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    if (!this.target) return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('wheel', this.onWheel);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    this.target = null;
  }

  /** 感度と上下反転を変える（本物のマウスの動きにだけ効く）。 */
  setLookPrefs(prefs: LookPrefs): void {
    this.look = { scale: prefs.scale, invertY: prefs.invertY };
  }

  get lookPrefs(): LookPrefs {
    return { ...this.look };
  }

  injectKeyDown(code: string): void {
    if (!this.down.has(code)) {
      this.pressedThisFrame.add(code);
      this.pressLatch.add(code);
    }
    this.down.add(code);
  }

  injectKeyUp(code: string): void {
    this.down.delete(code);
  }

  injectButtonDown(button: number): void {
    if (!this.buttons.has(button)) this.buttonLatch.add(button);
    this.buttons.add(button);
  }

  injectButtonUp(button: number): void {
    this.buttons.delete(button);
  }

  injectMotion(dx: number, dy: number): void {
    this.mouseDx += dx;
    this.mouseDy += dy;
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** このコマで押された（画面側の操作：一時停止・やり直し・撮影など）。 */
  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  /** 前回取ってから押されたか（シミュレーションの刻みが1回だけ受け取る）。 */
  consumePress(code: string): boolean {
    return this.pressLatch.delete(code);
  }

  isButtonDown(button: number): boolean {
    return this.buttons.has(button);
  }

  consumeButtonPress(button: number): boolean {
    return this.buttonLatch.delete(button);
  }

  /** 前回呼んでからのマウス移動量とホイール量を取り出して 0 に戻す。 */
  consumeMotion(): { dx: number; dy: number; wheel: number } {
    const motion = { dx: this.mouseDx, dy: this.mouseDy, wheel: this.wheel };
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.wheel = 0;
    return motion;
  }

  /** 押しっぱなしも含めて全部離す（一時停止・やり直し・フォーカスを失ったとき）。 */
  releaseAll(): void {
    this.down.clear();
    this.buttons.clear();
    this.pressLatch.clear();
    this.buttonLatch.clear();
    this.mouseDx = 0;
    this.mouseDy = 0;
  }

  /** コマの終わりに呼ぶ。「このコマで押された」を消す。 */
  endFrame(): void {
    this.pressedThisFrame.clear();
  }
}
