// OWNER: harness
// window.__input：ポインタロックが使えないとき（自動プレイ・検証・headless）に、人と同じ入力の経路で操作する口。
//   look(dx, dy)        マウスの移動（画素）
//   press(key) / release(key) / tap(key)   'w'・'Space'・'Shift'・'left'（左クリック）・'right' など
//   hold(key, ms)       ms（ゲーム内の時間）だけ押して離す。?speed を上げても同じ長さの押下になる
//   click()             「クリックで始める」や一時停止の画面をクリックしたのと同じ
import type { InputState } from '../core/input';
import { pressInput, releaseInput } from './keys';

export interface InputApi {
  look(dx: number, dy: number): void;
  press(key: string | number): void;
  release(key: string | number): void;
  tap(key: string | number): void;
  hold(key: string | number, ms: number): void;
  click(): void;
}

export class InputBridge {
  readonly api: InputApi;
  private readonly pending: { left: number; key: string | number }[] = [];

  constructor(
    private readonly input: InputState,
    onClick: () => void,
  ) {
    this.api = {
      look: (dx, dy) => input.injectMotion(dx, dy),
      press: (key) => pressInput(input, key),
      release: (key) => releaseInput(input, key),
      tap: (key) => this.holdFor(key, 0.05),
      hold: (key, ms) => this.holdFor(key, Math.max(0, ms) / 1000),
      click: onClick,
    };
  }

  private holdFor(key: string | number, seconds: number): void {
    pressInput(this.input, key);
    this.pending.push({ left: seconds, key });
  }

  /** シミュレーションの刻みごとに呼ぶ。時間が来た押下を離す。 */
  tick(dt: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i].left -= dt;
      if (this.pending[i].left <= 0) {
        releaseInput(this.input, this.pending[i].key);
        this.pending.splice(i, 1);
      }
    }
  }
}
