/**
 * 1人ぶんの入力。キーボード・タッチ・ゲームパッド・CPU・ネットの参加者は、すべてこの形にそろえてからシミュレーションへ渡す。
 * カメラの向きは固定（北＝−z を向く）なので、画面の上に倒すと moveZ が負になる。
 */
export interface InputState {
  /** 移動の向き（ワールドの x・z）。長さは 0..1 */
  moveX: number;
  moveZ: number;
  /** 押した瞬間だけ true */
  dash: boolean;
  /** 押した瞬間だけ true */
  jump: boolean;
  /** 押している間 true（長押しの判定に使う） */
  action: boolean;
  /** 押した瞬間だけ true（連打の判定に使う） */
  actionPressed: boolean;
  /** 離した瞬間だけ true */
  actionReleased: boolean;
}

export const EMPTY_INPUT: Readonly<InputState> = Object.freeze({
  moveX: 0,
  moveZ: 0,
  dash: false,
  jump: false,
  action: false,
  actionPressed: false,
  actionReleased: false,
});
