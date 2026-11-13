# Requirements Document：learning-app

## Introduction
学習の流れそのもの。初回の案内、道すじ、レッスン、復習、図鑑、記録、設定、保存、シェア、オフライン対応、公開前の検査までを受け持つ。ログインもサーバーもない。進捗はすべて端末に残る。設計の根拠は同じフォルダの ux-5layers.md にある。

## Boundary Context
- **In scope**: 画面と操作、出題の組み立て、正誤、経験値・連続記録・1日の目標・実績、復習の間隔、保存と引き継ぎ、シェアとOGP、スマホへの追加、注意書き、公開ゲート
- **Out of scope**: 手の描画（hand-model）、手話の中身（sign-content）、カメラの判定（camera-check）、公開そのもの（本人が行う）

## Requirements

### Requirement 1: 初回の案内
**Objective:** As a 初めての学習者, I want すぐに始めたい, so that 気持ちが冷める前に1問目に触れられる
#### Acceptance Criteria
1. When 初めてアプリを開いた, the learning-app shall 「利き手」「1日の目標」「どこから始めるか」を1画面1問で聞き、3回の選択で最初のレッスンを始める
2. The learning-app shall 案内のどの画面でも、おすすめの選択肢を最初から選んだ状態にする

### Requirement 2: 道すじ
**Objective:** As a 学習者, I want 次にやることと進み具合が一目で分かる, so that 迷わず続けられる
#### Acceptance Criteria
1. The learning-app shall 指文字・数字・あいさつの3コースを、ユニットごとに縦に並ぶ道すじで表示し、いま進めるレッスンを強調する
2. While 前のレッスンを終えていない, the learning-app shall 同じユニットの後のレッスンを鍵付きで表示する。ただし各コースの最初のユニットは最初から選べる
3. The learning-app shall 画面の上に、連続記録の日数と、今日の経験値と1日の目標の割合を常に表示する

### Requirement 3: レッスンの進行
**Objective:** As a 学習者, I want 短く区切られた問題, so that 少しずつ積み上げられる
#### Acceptance Criteria
1. When レッスンを始めた, the learning-app shall 新しい項目を3つまで紹介し、合わせて10〜14問を、前に覚えた項目も混ぜて出題する
2. When 学習者が答えを決めた, the learning-app shall 正誤を記号（✓・✗）と文字と色で示し、まちがいなら正しい答えを手の表示つきで示す
3. If 学習者がまちがえた, then the learning-app shall その問題をレッスンの最後にもう一度出し、すべて正解するまでレッスンを続ける
4. When 学習者がレッスンの途中で閉じようとした, the learning-app shall 確認を出し、やめた場合も紹介済みの項目の記録は残す
5. The learning-app shall 問題の種類として、紹介・手→文字の4択・文字→手の4択・ペア合わせ・指文字で読む・指文字で綴る・単語の手話の意味を選ぶ・自分でやってみる（カメラ任意）を持つ

### Requirement 4: 経験値・連続記録・実績
**Objective:** As a 学習者, I want 続けた手応え, so that 明日も開きたくなる
#### Acceptance Criteria
1. When レッスンを終えた, the learning-app shall 経験値を与え、結果画面で経験値・正答率・連続記録を表示する
2. When その日に最初のレッスンを終えた, the learning-app shall 連続記録を1日延ばす。前日に1回も終えていなければ1日目から数え直し、最長記録は残す
3. When 実績の条件（初めてのレッスン・3日連続・コース修了など）を満たした, the learning-app shall 結果画面で実績を知らせる

### Requirement 5: 復習
**Objective:** As a 学習者, I want 忘れかけた項目だけを短く復習したい, so that 復習に追われない
#### Acceptance Criteria
1. The learning-app shall 正解するほど次の出題までの間隔を延ばし、まちがえると短く戻す
2. When 復習を始めた, the learning-app shall 期日の来た項目を古い順に最大12問出す
3. The learning-app shall まちがいの多い項目だけを練習する「苦手を練習」を持つ

### Requirement 6: 図鑑
**Objective:** As a 学習者, I want 覚えた形をいつでも見返したい, so that レッスンの外でも確かめられる
#### Acceptance Criteria
1. The learning-app shall 全項目をコース別の一覧で表示し、項目を開くと大きな手の表示・説明・覚え方・見分け方・出典を表示する
2. When 学習者がひらがなを入力した, the learning-app shall その語を指文字で順に再生する（収録外の文字は知らせて飛ばす）

### Requirement 7: 記録・設定・保存
**Objective:** As a 学習者, I want 登録なしで記録を守りたい, so that 端末を替えても続けられる
#### Acceptance Criteria
1. The learning-app shall 進捗と設定を端末内に保存し、再読み込み後も同じ状態から再開する
2. If 端末内に保存できない, then the learning-app shall 「この端末では記録が残りません」と常に表示し、学習はそのまま続けられるようにする
3. The learning-app shall 進捗のファイルへの書き出し・読み込み・全削除を持ち、読み込みと削除の前に確認を出す。形式の違うファイルは読み込まずに理由を表示する
4. The learning-app shall 設定として、利き手・1日の目標・効果音・振動・カメラ問題の有無・動きを減らすを持つ

### Requirement 8: シェア・OGP・オフライン
**Objective:** As a 学習者, I want 続けた記録を人に見せたい, so that 仲間を誘える
#### Acceptance Criteria
1. When 結果画面か記録画面でシェアを選んだ, the learning-app shall X・LINE・端末の共有・リンクのコピーで、進み具合とアプリのURLを渡す。Instagram と YouTube には直接の投稿画面がないことを一行で知らせる
2. The learning-app shall 題名・説明・画像・正規URLのメタ情報を持ち、リンクを貼った時に画像つきで表示されるようにする
3. When 一度読み込んだ後にオフラインになった, the learning-app shall カメラ以外の全機能を使える状態を保つ

### Requirement 9: 操作のしやすさと注意書き
**Objective:** As a どんな端末・体の条件の学習者, I want 指だけ・キーボードだけ・音なしでも使える, so that 誰も取り残されない
#### Acceptance Criteria
1. The learning-app shall 幅360px以上の縦画面と横画面で、横スクロールなしに表示し、押せる部品を44px四方以上にする
2. The learning-app shall すべての操作をキーボードで行え、正誤や結果を画面読み上げにも伝える
3. The learning-app shall 「このアプリについて」で、手話は言語であること・指文字は手話の一部であること・地域差・監修を受けていないこと・参考にした資料・プライバシー・使った部品の許諾を表示する

### Requirement 10: 公開ゲート
**Objective:** As a 作り手, I want 公開して初めて落ちる検査を、下書きのうちに通したい, so that 公開の作業をやり直さない
#### Acceptance Criteria
1. The learning-app shall 公開用のビルドに対して、文書相対の住所・許諾表記・写す元のコードに個人の情報や絶対パスが無いことを確かめる検査を1つのコマンドで流せる
2. When 100日チャレンジへ組み込む, the learning-app shall 100日の公開ゲート（共有・OGP・ヘッダー）を PR の前に通す
