// OWNER: config
// 操作の割り当て（GAME-DESIGN.md の表）。キーは KeyboardEvent.code、マウスは button 番号（0 左・2 右）。

export const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  /** 地上では飛び立つ、空中では押し続けて上がり続ける */
  ascend: ['Space'],
  /** r02-controls：指摘「ゆっくり降りる操作が無い」 空中で押し続けて降りる（Ctrl はブラウザの W と組むとタブを閉じるので使わない） */
  descend: ['KeyC'],
  /** 地上では走る、空中では急降下 */
  sprint: ['ShiftLeft', 'ShiftRight'],
  tail: ['KeyQ'],
  special: ['KeyE'],
  /** 遊んでいる途中は長押し（RESTART_HOLD）、結果の画面では1回 */
  restart: ['KeyR'],
  pause: ['Escape'],
  photo: ['KeyP'],
  /** 撮影モードで PNG を保存 */
  photoSave: ['Enter'],
  /** r03-roster：怪獣を選ぶ（始める前と結果の画面だけ。1 紅竜・2 雷翼・3 焔角） */
  creature1: ['Digit1', 'Numpad1'],
  creature2: ['Digit2', 'Numpad2'],
  creature3: ['Digit3', 'Numpad3'],
} as const;

export const MOUSE = {
  breath: 0,
  claw: 2,
} as const;

export const LOOK = {
  /**
   * マウス1画素あたりの視点の回転（ラジアン、感度の設定が 1 のとき）。
   * 設定の感度は本物のマウスの動きにだけ掛ける（自動プレイと検証の look は、この値のまま回る）
   */
  sensitivity: 0.0022,
  /** 感度の設定の範囲（倍）。r02-controls：1画素あたり 0.05〜0.3 度（0.0022 rad が 0.126 度） */
  scaleMin: 0.4,
  scaleMax: 2.4,
  /**
   * 見上げ・見下ろしの範囲（度、上が正）。r02-controls：見上げてもカメラを地面から FOLLOW_CAMERA.minHeight に保つ作りに変えた。
   * カメラが高いので、同じ上限でも照準は高い階まで届く（60m 先の高層で 54m→72m）。上限を上げると竜が画面の下へ外れるので 28 のまま
   */
  pitchMinDeg: -62,
  pitchMaxDeg: 28,
  /** 始まりの見下ろし（度）。始まりの照準（LOCOMOTION.spawnAim）が見つかれば、そちらを使う */
  pitchStartDeg: -16,
};

/** 遊んでいる途中の R：この秒数だけ押し続けるとやり直す（r02-controls：指摘「R が確認なしで即やり直し、E の隣」） */
export const RESTART_HOLD_SECONDS = 0.8;

/**
 * 案内の進み方（r05-play で追加。各段の操作の秒数は config/gameplay.ts の COACH）。
 * 指摘「焔角で礫を投げないと『左クリック長押しで溶岩の礫を投げる』が1.7秒から124.7秒まで出たまま」（体験の採点 r04）：
 * 段を見せてから skipSeconds 秒（ゲーム内時刻）たっても済まないとき、もうビルを崩せている（最初の崩落の後）なら次の段へ進める。
 * 指摘「爪が当たって傾いた瞬間に『飛び上がる』へ進み、傾いたビルを離れて最初の崩落が16.1秒に遅れた」：爪の段は、爪を振った後の最初の崩落で済ませる（gameplay/coach.ts）
 */
export const COACH_PACE = { skipSeconds: 10 };
