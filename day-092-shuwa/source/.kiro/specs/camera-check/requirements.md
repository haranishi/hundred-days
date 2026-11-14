# Requirements Document：camera-check

## Introduction
カメラに写した自分の手の形を端末の中で読み取り、目標の形との違いをヒントで返す。使うかどうかは学習者が選ぶ。読み取りには誤りがあるので✗は付けず、ヒントを出しつつ、最後は「自分でできた」を選んで先へ進めるようにする。

## Boundary Context
- **In scope**: カメラの開始と停止、手の検出、目標の形との比較、ヒント、成功の判定、使えない時の切替
- **Out of scope**: 動きのある形・単語の判定（自分で確かめる問題として出す）、映像の保存や送信
- **Adjacent expectations**: 目標の形の関節位置は hand-model が返す。問題として出す時機と、結果の記録は learning-app が行う

## Requirements

### Requirement 1: 使い始めとプライバシー
**Objective:** As a 学習者, I want 映像がどこにも送られないと分かった上でカメラを使いたい, so that 安心して試せる
#### Acceptance Criteria
1. The camera-check shall 学習者が「カメラで確かめる」を押すまでカメラを起動しない
2. When 初めてカメラを使う, the camera-check shall 映像は端末の外へ送らず保存もしないこと、最初に必要な読み込みの大きさを、許可を求める前に表示する
3. When 学習者が問題を離れた・レッスンを閉じた・タブを隠した, the camera-check shall カメラを止める

### Requirement 2: 判定とヒント
**Objective:** As a 学習者, I want どこが違うかを具体的に知りたい, so that 自分で直せる
#### Acceptance Criteria
1. While カメラが動いている, the camera-check shall 鏡のように反転した映像と、読み取った手の骨組みを重ねて表示する
2. When 手が写っていない, the camera-check shall 「手をカメラに写してください」と表示する
3. When 読み取った形が目標と違う, the camera-check shall いちばん大きな違いを1つ、指の名前と動かし方の言葉で表示する（例：「中指をまっすぐ伸ばしましょう」）
4. When 読み取った形が目標と0.5秒続けて一致した, the camera-check shall 成功を表示し、問題を正解として終える
5. The camera-check shall 不一致を✗として扱わず、15秒たったら「できた（自分で判断）」と「スキップ」を表示する

### Requirement 3: 使えない時
**Objective:** As a 学習者, I want カメラが使えなくても先へ進みたい, so that 環境のせいで止まらない
#### Acceptance Criteria
1. If カメラの許可が得られない・カメラがない・読み込みに失敗した, then the camera-check shall 理由を表示し、同じ問題を「手本を見て自分でやってみる」形で続ける
2. Where 設定でカメラ問題を切っている, the camera-check shall カメラ問題を出さない

### Requirement 4: 対象と精度
**Objective:** As a 作り手, I want 判定できる形だけを判定する, so that 誤った判定で学習者を混乱させない
#### Acceptance Criteria
1. The camera-check shall 動きのない形だけを判定の対象にする
2. The camera-check shall 利き手の設定に合わせて、右手と左手のどちらで作っても判定する
3. The camera-check shall 目標の形を目標そのものの関節位置で判定した時に必ず一致とし、見間違えやすい形の関節位置では一致としないことを、自動検査で確かめる
