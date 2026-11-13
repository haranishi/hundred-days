# Requirements Document：sign-content

## Introduction
アプリで教える手話の中身（指文字・数字・単語）を、出典つきで作る。監修者はいない。だから正確さは、出典どうしの照合と、描いた手を説明文と突き合わせる検査の2つで担保し、確かめた結果を記録に残す。

## Boundary Context
- **In scope**: 各項目の形・動き・説明・覚え方・見分け方・出典・確信度、指文字で読む練習用の単語リスト、検証とその記録
- **Out of scope**: 形の描き方（hand-model）、出題の順番や画面（learning-app）
- **Adjacent expectations**: 形と動きは hand-model の仕様形式で書く。画面に出す出典一覧は learning-app が表示する

## Requirements

### Requirement 1: 収録範囲
**Objective:** As a 学習者, I want 入門に必要な形がそろっている, so that このアプリだけで最初の一歩を終えられる
#### Acceptance Criteria
1. The sign-content shall 清音の指文字46文字と、濁音・半濁音・促音・拗音・長音の表し方を収録する
2. The sign-content shall 数字の0から10を収録する
3. The sign-content shall あいさつと自己紹介の単語を、確信度が高いものから12語以上収録する

### Requirement 2: 1項目ごとの情報
**Objective:** As a 学習者, I want 形の理由や見分け方まで知りたい, so that 丸暗記せずに覚えられる
#### Acceptance Criteria
1. The sign-content shall 各項目に、名前・読み・相手から見た説明・自分で作るときのコツ・覚え方（由来が確認できる場合）・見間違えやすい項目と見分け方を持たせる
2. The sign-content shall 各項目に、出典（資料名とURL）と確信度（高・中・低）を持たせる
3. Where 地域差や別の表し方が資料で確認できる, the sign-content shall その旨を項目の注記に書く

### Requirement 3: 正確さの方針
**Objective:** As a 学習者, I want 間違った形を覚えない, so that 実際の会話で通じる
#### Acceptance Criteria
1. If 確信度が低い項目がある, then the sign-content shall その項目をレッスンに入れない
2. Where 確信度が中の項目を収録する, the sign-content shall 表示で「要確認」と分かる印を付ける
3. The sign-content shall 由来を確認できない覚え方を、由来として書かない（語呂合わせは「覚え方の例」と書き分ける）

### Requirement 4: 検証
**Objective:** As a 作り手, I want 形の誤りを公開前に見つけたい, so that 学習者に誤りを届けない
#### Acceptance Criteria
1. The sign-content shall 自動検査で、収録範囲の欠け・重複・参照切れ・形式違反がないことを確かめる
2. The sign-content shall 見間違えやすい組の形どうしが、仕様の上で区別できることを自動で確かめる
3. When 形のデータを追加・変更した, the sign-content shall 全項目を相手から見た向きで描いた一覧画像を作り、実装していない別の確認者が説明文と突き合わせた結果を記録する

### Requirement 5: 指文字で読む練習の単語
**Objective:** As a 学習者, I want 覚えた文字だけで読める単語で練習したい, so that 1文字ずつではなく単語として読めるようになる
#### Acceptance Criteria
1. The sign-content shall ひらがなの日常語を、意味（短い説明）つきで200語以上持つ
2. The sign-content shall 人を傷つける語・性的な語・特定の個人や団体を指す語を単語リストに入れない
