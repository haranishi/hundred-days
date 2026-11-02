// OWNER: core
// 操作の割り当て（KeyboardEvent.code）。入力の状態を集める側（src/input）は、何のキーが何をするかを知らない。

export const KEYS = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  run: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft', 'ControlRight'],
  interact: ['KeyE'],
  attack: ['KeyF'],
  aim: ['KeyQ'],
  pause: ['Escape'],
  restart: ['KeyR'],
  /** タイトル・選択・説明で先へ進む */
  confirm: ['Enter', 'Space'],
  /** 音を消す・戻す（どの画面でも）。r01-integrate 追加 */
  mute: ['KeyM'],
} as const;

export type Action = keyof typeof KEYS;
