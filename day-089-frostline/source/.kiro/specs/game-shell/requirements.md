# Requirements Document

## Project Description (Input)
ゲームの土台を作る。時間の進め方、キーボード・ゲームパッド・タッチの入力、題字・HUD・一時停止・設定の画面、
試験用の窓口、実ブラウザでの検査と撮影の道具を扱う。背景は `brief.md` にある。

## Introduction
本仕様は、滑走の物理と3Dの描画を差し込む「器」を扱う。利用者は、プレイヤーと、試験・撮影を回す開発者。

## Boundary Context
- **In scope**: 時間、入力、画面の部品、設定の保存、試験用の窓口、検査と撮影の道具
- **Out of scope**: 物理、山のデータ、3Dの描画、音、山の地図
- **Adjacent expectations**: 物理と世界と描画は、決めた形で外から差し込まれる

## Requirements

### Requirement 1: 開いてすぐ滑り出す
**Objective:** As a プレイヤー, I want 説明を読まずに始められる題字の画面, so that 開いて30秒以内に滑っている

#### Acceptance Criteria
1. When ページを開いたとき, the Game Shell shall 題字と、読み込みの進み具合と、始めるボタンを表示する
2. When 読み込みが終わってプレイヤーが始めるボタンを押したとき, the Game Shell shall 1操作で滑走を始める
3. If 山のデータや描画の準備に失敗したとき, the Game Shell shall 何が起きたかと次にすることを日本語で表示する
4. When 滑走が始まったとき, the Game Shell shall その入力装置に合った操作の案内を1行で出し、操作が行われたら消す

### Requirement 2: 時間の進め方
**Objective:** As a プレイヤー, I want 端末の速さに左右されない動き, so that どの端末でも同じ手ごたえになる

#### Acceptance Criteria
1. The Game Shell shall 物理を固定の刻みで進め、画面の更新の速さが変わっても同じ結果にする
2. If 画面の更新が大きく遅れたとき, the Game Shell shall 1回に進める刻みの数に上限を設け、動きを止めない
3. When タブが隠れたときか一時停止されたとき, the Game Shell shall 時間を止め、再開のときに飛ばさない
4. Where 手動送りが指定されたとき, the Game Shell shall 指示された秒数だけ時間を進め、それ以外では進めない

### Requirement 3: 入力
**Objective:** As a プレイヤー, I want キーボード・ゲームパッド・指のどれでも同じ操作, so that 手元の端末で遊べる

#### Acceptance Criteria
1. The Game Shell shall 左右・低い姿勢・制動・ジャンプ・視点の切り替え・一時停止・復帰を、キーボード・ゲームパッド・タッチのそれぞれで行えるようにする
2. The Game Shell shall どの入力装置からも、同じ形の操作の値を物理へ渡す
3. While タッチで操作しているとき, the Game Shell shall 左の指の舵と右の指のジャンプを同時に受け付ける
4. The Game Shell shall タッチの操作部品を、44px以上の大きさで、画面の内側に、重ならないように置く
5. The Game Shell shall カーソルを画面に閉じ込めず、視点はドラッグで動かせるようにする
6. When キーボードの左右が押されたとき, the Game Shell shall 値を一瞬で最大にせず、短い時間でなめらかに立ち上げる

### Requirement 4: 滑走中の表示
**Objective:** As a プレイヤー, I want 景色を邪魔しない最小の表示, so that 山を見ながら必要なことだけ分かる

#### Acceptance Criteria
1. While 滑走しているとき, the Game Shell shall 速さ（時速）と標高だけを常に表示する
2. When 転倒したとき, the Game Shell shall 理由を1行の日本語で表示し、復帰の操作を示す
3. When 滑走者が止まって数秒動かないとき, the Game Shell shall 動き出し方か復帰の操作を案内する
4. The Game Shell shall 表示の意味を色だけに頼らず、文字や形でも伝える

### Requirement 5: 一時停止と設定
**Objective:** As a プレイヤー, I want いつでも止めて設定を変えられること, so that 自分の端末と好みに合わせられる

#### Acceptance Criteria
1. When 一時停止の操作をしたとき, the Game Shell shall 滑走を止め、つづける・直前の地点へ戻る・出発地点へ戻る・設定を表示する
2. The Game Shell shall 画質の段階・視点の揺れ・音量と消音・操作の案内の表示・利き足を設定できるようにする
3. When 設定を変えたとき, the Game Shell shall その端末に保存し、次に開いたときに使う
4. If 設定を保存できない環境のとき, the Game Shell shall 保存なしで動き続ける

### Requirement 6: 画面の大きさ
**Objective:** As a プレイヤー, I want スマホでもPCでも崩れない画面, so that どの端末でも操作できる

#### Acceptance Criteria
1. The Game Shell shall 幅390・768・1440pxで、表示と操作部品を画面内に収め、横スクロールを出さない
2. When 画面の向きや大きさが変わったとき, the Game Shell shall 表示と操作部品を置き直す
3. Where 動きを減らす設定が端末にあるとき, the Game Shell shall 画面の部品の動きを減らす

### Requirement 7: 試験用の窓口
**Objective:** As a 開発者, I want 状態を読み、操作を与え、時間を送れる窓口, so that 試験と撮影を再現できる

#### Acceptance Criteria
1. Where 開発用の指定があるとき, the Game Shell shall 滑走の状態の読み出し・操作の上書き・時間の手動送り・出発地点への移動を提供する
2. The Game Shell shall 開発用の指定が無いとき、この窓口を公開しない
3. When 同じ出発地点から同じ操作の列を手動送りで与えたとき, the Game Shell shall 同じ状態に到達する

### Requirement 8: 検査と撮影の道具
**Objective:** As a 開発者, I want 実ブラウザでの起動検査と固定撮影, so that 描画の誤りを見逃さず、改善の前後を比べられる

#### Acceptance Criteria
1. When 起動の検査を実行したとき, the Game Shell shall 実ブラウザでページを開き、コンソールの誤りか警告が1件でもあれば失敗として報告する
2. When 撮影を実行したとき, the Game Shell shall 名前のついた場面を、決まった出発地点・操作・時間で再現し、3つの画面幅で画像を保存する
3. When 指の操作の検査を実行したとき, the Game Shell shall 左右の指の同時操作を再現し、操作の値と部品の位置・大きさを確かめる
4. The Game Shell shall 起動の検査と撮影を、WebGPUの方式と、WebGL2の方式と、Safari系のブラウザで実行できるようにする
