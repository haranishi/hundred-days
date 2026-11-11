# Requirements Document

## Project Description (Input)
滑走の状態を、滑走者の姿勢・カメラ・雪煙・雪面の跡・音として見せ、聞かせる。
切るターンと横滑りの違い、速さ、起伏、ジャンプと着地、転倒が、同時に伝わることを目的にする。背景は `brief.md` と調査 R1 にある。

## Introduction
本仕様は、物理の結果をプレイヤーへ伝える部分を扱う。利用者はプレイヤー。

## Boundary Context
- **In scope**: 滑走者の形と姿勢、カメラ、雪煙、跡、音
- **Out of scope**: 物理、地形と空の描画、HUD、技の姿勢、雪面を実際にへこませる跡
- **Adjacent expectations**: 状態は ride-sim から読むだけで書き換えない。描画の場面とカメラは mountain-render の口を通して使う

## Requirements

### Requirement 1: 滑走者の姿勢
**Objective:** As a プレイヤー, I want 滑りに合った体の動き, so that 板の状態を体の形から読める

#### Acceptance Criteria
1. The Ride Feedback shall 滑走者を、両足を板に付けた横向きの姿勢で描く
2. While 切って曲がっているとき, the Ride Feedback shall 体を弧の内側へ傾け、傾きの大きさをエッジの角度に合わせる
3. The Ride Feedback shall つま先側のターンとかかと側のターンで、体の形を変える
4. While 横滑りしているとき, the Ride Feedback shall 板を進む向きから回し、体を山側へ預けた姿勢にする
5. While 荷重が増えているときかしゃがんでいるとき, the Ride Feedback shall 膝を曲げて腰を落とす
6. While 空中にいるとき, the Ride Feedback shall 膝を引きつけ、回転に体を合わせ、着地の前に脚を伸ばす
7. When 転倒したとき, the Ride Feedback shall 体を転がし、止まったら立ち上がらせる
8. The Ride Feedback shall どの状態の切り替えでも、体の形を跳ばさず連続に変える

### Requirement 2: カメラ
**Objective:** As a プレイヤー, I want 進む先が見えるカメラ, so that 次の起伏や木を読んでラインを選べる

#### Acceptance Criteria
1. While 三人称で滑っているとき, the Ride Feedback shall 滑走者を画面の中央より下に置き、進む向きの先を見せる
2. The Ride Feedback shall 板の向きではなく進む向きを追い、横滑りでカメラを振り回さない
3. The Ride Feedback shall 速いほど視野を広げ、カメラを離す
4. When 着地したとき, the Ride Feedback shall 衝撃の大きさに応じて、カメラを短く沈ませる
5. The Ride Feedback shall カメラを雪面より下へ入れず、滑走者とのあいだの木や地形で滑走者を隠し続けない
6. When プレイヤーが視点をドラッグしたとき, the Ride Feedback shall その向きを見せ、操作をやめて少ししたら元の向きへ戻す
7. When 視点の切り替えが行われたとき, the Ride Feedback shall 一人称と三人称を切り替え、一人称では地平線の傾きを抑える
8. Where 揺れの設定が「なし」のとき, the Ride Feedback shall カメラの揺れを止める
9. When 復帰や出発地点への移動が起きたとき, the Ride Feedback shall カメラを新しい位置で作り直し、移動の軌跡を見せない

### Requirement 3: 雪煙
**Objective:** As a プレイヤー, I want 滑りに応じて上がる雪煙, so that 雪面へ力をかけたことが見える

#### Acceptance Criteria
1. While 切って曲がっているとき, the Ride Feedback shall 弧の外側へ、力の大きさに応じた量の雪煙を上げる
2. While 横滑りしているとき, the Ride Feedback shall 切るターンより多い雪煙を、進む向きの前方へ上げる
3. When 着地か転倒が起きたとき, the Ride Feedback shall 衝撃に応じた雪煙を一度に上げる
4. While 空中にいるとき, the Ride Feedback shall 雪煙を新しく上げない
5. The Ride Feedback shall 新雪で雪煙を多く、氷で少なくする
6. The Ride Feedback shall 雪煙で滑走者と進む先を隠し続けない

### Requirement 4: 雪面の跡
**Objective:** As a プレイヤー, I want 滑った跡が雪面に残ること, so that 自分のラインを振り返れる

#### Acceptance Criteria
1. While 接地して滑っているとき, the Ride Feedback shall 通った所に跡を残す
2. The Ride Feedback shall 切るターンの跡を細く、横滑りの跡を幅広く描く
3. The Ride Feedback shall 跡を、その1本の滑走のあいだ消さず、離れた所からも見えるようにする
4. While 空中にいるとき, the Ride Feedback shall 跡を途切れさせる

### Requirement 5: 音
**Objective:** As a プレイヤー, I want 滑りの状態が分かる音, so that 画面を見なくても速さと雪面が分かる

#### Acceptance Criteria
1. The Ride Feedback shall 速いほど大きい風の音を鳴らす
2. The Ride Feedback shall 切るターンの音と、横滑りの音を、聞き分けられる別の音にする
3. The Ride Feedback shall 雪質によって滑走の音を変える
4. While 空中にいるとき, the Ride Feedback shall 雪面の音を止め、風の音だけにする
5. When 着地か転倒が起きたとき, the Ride Feedback shall 衝撃に応じた音を鳴らす
6. The Ride Feedback shall プレイヤーの最初の操作のあとに音を始め、音量と消音の設定に従う
7. The Ride Feedback shall 音の大きさと高さを連続に変え、ぷつぷつと切らない

### Requirement 6: 画質の段と速さ
**Objective:** As a プレイヤー, I want 端末に合った負荷, so that 演出で動きが重くならない

#### Acceptance Criteria
1. The Ride Feedback shall 雪煙の数と跡の長さを、画質の段に応じて変える
2. The Ride Feedback shall 毎コマの計算を、高い段で2ms以内に収める

### Requirement 7: 検査
**Objective:** As a 開発者, I want 固定の場面と計算の試験, so that 演出の劣化に気づける

#### Acceptance Criteria
1. The Ride Feedback shall 切る・横滑り・空中・着地・転倒の固定の場面を、決まった操作から再現して撮影できるようにする
2. The Ride Feedback shall 姿勢・カメラ・音の値の計算を、画面なしで試験できるようにする
