# Requirements Document

## Introduction
Day082「影討ち」は公開済みだが、遊べるのはキーボードとマウスだけだ。設計書も「入れない：スマホ操作」と決めていた。ところがXのリンクから来る人の多くはスマホなので、2026-11-03に本人の依頼で方針を変える。スマホを横向きにして、タイトルから結果まで遊べるようにする。規則・ステージ・表現はそのまま。利用者像と判断の理由は [ux.md](ux.md) にある。

## Boundary Context
- **In scope**: 触れる端末の横向きでの全画面の操作／遊ぶ画面のタッチ部品／スマホ向けのHUDと各画面の収まり／横向きの案内／ページの扱い（拡大・スクロール・音・復帰）／描画の自動軽量化／文書・試験・配信ファイルの更新
- **Out of scope**: ゲームの規則（見つかり方・速さ・音の大きさ）・ステージ・表現／ゲームパッド／設定画面と端末への保存／縦向きで遊ぶこと／ピンチ拡大・全画面表示・振動／ネイティブアプリ化
- **Adjacent expectations**: デスクトップのキーボード・マウスの挙動と見た目は変えない。共有欄・OGP・CSP・外部通信なし・公開ゲートは今のまま通る。実機での手触りは本人が確かめる

## Requirements
### Requirement 1: タッチ操作の切り替え
**Objective:** As a スマホで開いた人, I want 何も設定せずタッチ操作になること, so that すぐ遊べる
#### Acceptance Criteria
1. While the primary pointer of the device is coarse, the Game shall show the touch controls on the play screen and use touch wording on every screen.
2. When the first touch (or pen) is detected on a device whose primary pointer is not coarse, the Game shall switch to the touch controls without a reload.
3. Where the URL has `touch=1` or `touch=0`, the Game shall force the touch controls on or off.
4. While the touch controls are shown, the Game shall keep accepting the keyboard and the mouse.
5. While the touch controls are off, the Game shall look and behave as it does today, including the HUD, the screens, the pause and the drawing.
### Requirement 2: 歩く・走る（スティック）
**Objective:** As a 忍ぶ人, I want 倒した方向と量で歩きたい, so that そっと動ける
#### Acceptance Criteria
1. When the player touches the left side of the play screen and drags, the Game shall move the character toward the dragged direction, taking the camera direction as forward.
2. While the drag distance is within the dead zone, the Game shall keep the character still.
3. While the drag distance is between the dead zone and the stick radius, the Game shall set the target walking speed in proportion to the distance, and never above the walking speed of the keyboard.
4. When the finger reaches 1.4 times the stick radius, the Game shall make the character run, and shall make it walk again when the finger comes back under 1.25 times.
5. When the finger is lifted or the touch is cancelled, the Game shall set the movement input to zero within one tick, and the character shall slow down as it does when the keyboard is released.
6. While no finger is on the stick, the Game shall show a faint hint of where to touch.
### Requirement 3: 視点
**Objective:** As a 遊ぶ人, I want 右手でなぞって見回したい, so that 番兵の向きを読める
#### Acceptance Criteria
1. When the player drags on the right side outside the buttons, the Game shall turn the camera as the mouse does, with the same direction and the same limits.
2. While the stick and the view drag are both held, the Game shall handle each finger independently.
3. While aiming a stone, the Game shall change the throwing distance by the vertical drag as the mouse does.
4. The Game shall keep the view drag speed in one constant that is not saved on the device.
### Requirement 4: ボタン
**Objective:** As a 遊ぶ人, I want 親指の届く所で当て身・攻撃・しゃがみをしたい, so that 見つかっても動ける
#### Acceptance Criteria
1. When the action button is pressed, the Game shall do what E does today, and the button shall show which of assassinate, subdue from behind or use it will do, and whether any is available now.
2. When the attack button is pressed, the Game shall do what F does today, turning first toward the nearest guard within reach (touch only, the reach itself unchanged).
3. When the crouch button is pressed, the Game shall toggle crouching and show the current state on the button.
4. When a button is pressed, the Game shall react at the moment of the press and keep it pressed until the finger is lifted even if the finger slides off the button.
5. The Game shall give every button a touch area of at least 44 CSS px and the action button at least 64 CSS px.
### Requirement 5: 小石
**Objective:** As a 小石を使う人, I want 狙って投げ、迷ったらやめたい, so that 番兵を釣れる
#### Acceptance Criteria
1. When the stone button is held with a stone left, the Game shall start aiming, and shall throw when the button is released after being held for 250 ms or more or moved 12 px or more.
2. When the stone button is tapped briefly, the Game shall keep aiming until the throw button or the cancel button is pressed.
3. When the cancel button is pressed, or the touch is cancelled, or the page is hidden while aiming, the Game shall stop aiming without throwing.
4. While aiming, the Game shall show how to throw and how to cancel in touch wording.
5. If no stone is left, then the Game shall show the stone button as unavailable and shall not start aiming.
### Requirement 6: 画面の流れ
**Objective:** As a スマホの人, I want 全部の画面を指だけで進めたい, so that キーボードを探さない
#### Acceptance Criteria
1. The Game shall let the player go through title, stage select, briefing, play, pause, game over and result with touch only.
2. While the touch controls are on, when the pause button is pressed during play (even while aiming), the Game shall pause and offer resume, restart, back to stage select and sound on/off.
3. While the touch wording is on, the Game shall not name any key (Enter, Esc, R, WASD, E, F, Q, C, Shift, Ctrl, M) in the texts on screen.
4. While the touch controls are on, when the page becomes hidden during play, the Game shall pause.
5. While a screen is taller than the display, the Game shall let the player scroll it with a finger without clipping its buttons.
### Requirement 7: 横向き
**Objective:** As a 縦で持っている人, I want 横にすればよいと分かりたい, so that 迷わない
#### Acceptance Criteria
1. While the display is in portrait during play with the touch controls on, the Game shall pause and show a prompt to turn the device sideways.
2. When the display returns to landscape, the Game shall show the pause screen so that the player resumes by pressing resume.
3. While the touch controls are on and the display is in portrait on title, stage select and briefing, the Game shall stay operable and say that the game is played sideways.
### Requirement 8: HUD
**Objective:** As a 小さい画面の人, I want 見たい物が隠れないこと, so that 闇と灯りを読める
#### Acceptance Criteria
1. While the touch controls are on and the display is landscape and 568×320 or larger, the Game shall place the HUD and the controls without overlap and inside the safe area.
2. While playing, the Game shall always show the stance, the brightness meter, the mission step and the distance to the target.
3. While the touch controls are on, the Game shall draw HUD text at 12 CSS px or more, and the action prompt at 14 CSS px or more.
4. While the touch controls are on, when play starts for the first time after loading, the Game shall show how to walk and look, and fade it out within 8 seconds.
5. The Game shall not show a state by color alone.
### Requirement 9: ページの扱い
**Objective:** As a ブラウザで遊ぶ人, I want ブラウザの動きに邪魔されたくない, so that 操作が途切れない
#### Acceptance Criteria
1. While the touch controls are on and the player is playing, the Game shall not scroll, zoom, pull to refresh, select text, or show context menus and callouts.
2. The Game shall fit the canvas and the screens to the visible area, including when the browser bars show or hide, and keep controls out of notches.
3. When the first touch occurs, the Game shall start the sound.
4. If the graphics context is lost, then the Game shall show a message with a reload button.
5. The Game shall add no network access, no storage and no new dependency, and shall satisfy the Day082 CSP.
### Requirement 10: 描画の軽量化
**Objective:** As a 安い機種の人, I want 少し粗くても動いてほしい, so that 遊べる
#### Acceptance Criteria
1. While the touch controls are on at start, the Game shall start with a lighter drawing tier than the desktop (lower resolution, no ambient occlusion).
2. While the touch controls are on and the 90th-percentile frame time over 2 seconds stays above 34 ms, the Game shall step down one tier (each tier lowers the resolution; the first step also turns ambient occlusion off if it is on), wait at least 4 seconds before the next step, and not step up by itself.
3. While under automation, shot, perf or an explicit `quality` in the URL, the Game shall not change the tier by itself (the test-only `adaptive=1` allows it under automation, but never with shot, perf or an explicit `quality`).
4. While paused with the touch controls on, the Game shall show the current drawing tier.
5. The Game shall keep the rules and the results independent of the tier.
### Requirement 11: 検証と文書
**Objective:** As a 作る人, I want 壊れていないと言えること, so that 安心して公開できる
#### Acceptance Criteria
1. The Game shall pass the existing unit and browser tests of the keyboard version unchanged.
2. The Game shall have unit tests for the new logic, and browser tests for the touch flows at phone sizes including the switch by the first touch and holding the same key by the keyboard and the touch together.
3. The Game shall be cleared from the start to the result on the route `ura` by real touch events alone (not the mouse, not key injection, not the autopilot's own input), and the run shall record the count of touch pointer events.
4. The README, the design document and the built files shall match the new behavior, and the points left to a real device shall be listed.
