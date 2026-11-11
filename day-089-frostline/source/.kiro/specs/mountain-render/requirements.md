# Requirements Document

## Project Description (Input)
山のデータを読み、6km四方の雪山を、夕方の光・影・空と霞・雪と岩・木と樹氷つきで描く。
近くは細かく遠くは粗く描き、3つの画質の段で動かす。背景は `brief.md` と調査 R3 にある。

## Introduction
本仕様は、山の景色の描画を扱う。利用者は、景色を見て滑るプレイヤーと、この描画の上に滑走者や雪煙を足す実装者。

## Boundary Context
- **In scope**: 描画の初期化、地形、空・太陽・霞・環境光、影、雪と岩の材質の土台、木・樹氷・岩、後処理、画質の段、差し込み口
- **Out of scope**: 滑走者、滑走中のカメラ、雪煙、跡、音、雪の質感の作り込み、遠景
- **Adjacent expectations**: 器（game-shell）が決めた形で差し込まれ、山のデータ（mountain-world）だけから形を得る

## Requirements

### Requirement 1: 山が継ぎ目なく見える
**Objective:** As a プレイヤー, I want どこに立っても破綻なく見える山, so that 景色を信じて滑れる

#### Acceptance Criteria
1. The Mountain Render shall 地図の全域を、近くは細かく遠くは粗く描く
2. The Mountain Render shall 細かさの境目に、すき間・重なり・段差を出さない
3. While カメラが動いているとき, the Mountain Render shall 細かさの切り替えを連続に行い、形が飛ぶように変わらない
4. The Mountain Render shall 高い画質の段で、カメラから60m以内の雪面を0.75m以下の間隔で描く

### Requirement 2: 描いた雪面と問い合わせの一致
**Objective:** As a 実装者, I want 描いた雪面が山の問い合わせと同じ高さ, so that 滑走者と木が雪面に接して見える

#### Acceptance Criteria
1. The Mountain Render shall カメラの近くで、描いた雪面の高さと山の問い合わせの高さの差を2cm以内に収める
2. When 山のデータの版が描画の想定と違うとき, the Mountain Render shall 描画を始めず、理由を知らせる

### Requirement 3: 光と影
**Objective:** As a プレイヤー, I want 夕方の低い太陽と影, so that 雪面の起伏が読める

#### Acceptance Criteria
1. The Mountain Render shall 山のデータの夕方の太陽の向きで、山を照らす
2. The Mountain Render shall 山が谷へ落とす大きな影を、遠くまで描く
3. The Mountain Render shall カメラの近くで、木・岩・滑走者と雪面の起伏の影を描く
4. While カメラが動いているとき, the Mountain Render shall 影の縁をちらつかせない
5. The Mountain Render shall 日陰を空の色で照らし、黒くつぶさない

### Requirement 4: 空と大気
**Objective:** As a プレイヤー, I want 空と霞のつながった遠景, so that 山の大きさと奥行きを感じる

#### Acceptance Criteria
1. The Mountain Render shall 太陽のある空を描く
2. The Mountain Render shall 遠い山ほど霞ませ、霞の色を空の地平線の色に合わせる
3. The Mountain Render shall 地図の端と空のあいだに、線や継ぎ目を出さない

### Requirement 5: 雪と岩
**Objective:** As a プレイヤー, I want 雪と岩、雪質の違いが見分けられる雪面, so that 見てラインを選べる

#### Acceptance Criteria
1. The Mountain Render shall 山のデータの岩の露出に従って岩を描き、雪との境目を不規則にする
2. The Mountain Render shall 新雪・圧雪・氷を、明るさと光沢の違いで見分けられるようにする
3. The Mountain Render shall 近くで雪面の細かな凹凸を見せ、遠くではちらつかない平均の見た目へ移す

### Requirement 6: 木・樹氷・岩
**Objective:** As a プレイヤー, I want 当たり判定と同じ場所に立つ木と岩, so that 見たとおりに避けられる

#### Acceptance Criteria
1. The Mountain Render shall 木・樹氷・岩を、山の問い合わせが返す位置・太さ・高さで描く
2. While カメラが動いているとき, the Mountain Render shall 木と岩を、近く200m以内で突然現れたり消えたりさせない
3. The Mountain Render shall 木と岩に雪をかぶせ、雪面へ影を落とさせる
4. If 移動が速くて準備が間に合わないとき, the Mountain Render shall 近くの木と岩を優先して出す

### Requirement 7: 画質の段と速さ
**Objective:** As a プレイヤー, I want 端末に合った画質, so that スマホでもPCでもなめらかに滑れる

#### Acceptance Criteria
1. The Mountain Render shall 高・中・低の3つの段で、誤りなく描く
2. When 画質の段が変えられたとき, the Mountain Render shall 再読み込みなしで切り替える
3. The Mountain Render shall 高い段で、Apple Silicon の Mac の 1440×900 の画面を、95%のコマが16.7ms以内になる速さで描く
4. The Mountain Render shall WebGPU が使えない端末で、WebGL2 の方式に切り替えて描く
5. If 描画の方式がどちらも使えないとき, the Mountain Render shall 描画を始めず、理由を知らせる

### Requirement 8: 差し込み口
**Objective:** As a 実装者, I want 滑走者や雪煙を足せる口, so that 描画の中身を知らずに演出を足せる

#### Acceptance Criteria
1. The Mountain Render shall 器が決めた描画の形（準備・大きさの変更・描画・段の変更・片づけ）を満たす
2. The Mountain Render shall ほかの系が、場面への追加・毎コマの更新・カメラの差し替えを登録できるようにする
3. The Mountain Render shall 滑走中のカメラが無いとき、山を見回せる確認用のカメラで描く

### Requirement 9: 起動と止まりの防止
**Objective:** As a プレイヤー, I want 滑走中に固まらない描画, so that 踏み切りや着地のタイミングが狂わない

#### Acceptance Criteria
1. When 準備が終わったとき, the Mountain Render shall 滑走中に初めて映るものを含め、使う描画の準備を済ませている
2. While 滑走しているとき, the Mountain Render shall 木や区画の出し入れで、1コマを33msより長くしない

### Requirement 10: 検査
**Objective:** As a 開発者, I want 実ブラウザでの検査と固定の場面, so that 描画の誤りと劣化に気づける

#### Acceptance Criteria
1. When 起動の検査を実行したとき, the Mountain Render shall WebGPU・WebGL2・Safari系のそれぞれで、誤りと警告を出さない
2. The Mountain Render shall 同じ場面・同じ時刻・同じ段から、見分けのつかない画を再現する
