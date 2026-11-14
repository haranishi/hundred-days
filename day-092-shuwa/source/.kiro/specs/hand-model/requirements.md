# Requirements Document：hand-model

## Introduction
手話の形と動きを見せる「3Dの手」。写真も動画も使わない。元になるのは1つの「手の形の仕様データ」で、画面の表示、選択肢用の小さな画像、カメラ判定に使う関節の位置まで、すべてそこから作る。学習者は視点を切り替え、指で回して確かめる。

## Boundary Context
- **In scope**: 手（と、単語用の簡単な上半身）の描画、形の補間と動き、視点と利き手、小さな画像、関節の位置の出力、描けない環境での代替表示
- **Out of scope**: どの文字がどの形か（sign-content）、いつどの表示を出すか（learning-app）、カメラ映像の解析（camera-check）
- **Adjacent expectations**: sign-content は本仕様の形式でデータを書く。learning-app は表示部品と小さな画像の関数だけを使う

## Requirements

### Requirement 1: 手の形の表示
**Objective:** As a 学習者, I want 指の1本ずつの状態がはっきり分かる手, so that 似た指文字を見分けられる
#### Acceptance Criteria
1. The HandView shall 親指と4本の指それぞれを、伸ばす・付け根から曲げる・かぎ形・握り込むの状態で描く
2. When 仕様が指先どうしの接触（例：親指の先と人差し指の先）を指定した, the HandView shall 2つの指先を隙間なく接して描く
3. When 仕様が指の交差・指の間に親指を挟む・握った指の前を親指が横切る形を指定した, the HandView shall 指の前後関係を正しく描く
4. The HandView shall 爪を手の甲側に描き、手のひら側か甲側かを見分けられるようにする

### Requirement 2: 向きと位置
**Objective:** As a 学習者, I want 手のひらと指先の向きが正しい手, so that 向きの違いで意味が変わる形を取り違えない
#### Acceptance Criteria
1. When 仕様が「手のひらの向き」と「指先の向き」を相手から見た方向で指定した, the HandView shall その向きで手を描く
2. Where 単語の仕様に体の位置（額・鼻・あご・胸・体の前など）が含まれる, the HandView shall 簡単な上半身と両手を、その位置関係で描く

### Requirement 3: 視点と利き手
**Objective:** As a 学習者, I want 自分の手でどう作るかが分かる視点, so that 表を左右反転して考えなくて済む
#### Acceptance Criteria
1. The HandView shall 「相手から見る」と「自分から見る」の2つの視点を1回の操作で切り替える
2. When 学習者が表示を指でドラッグした, the HandView shall 手を回して見せ、戻すボタンで元の視点に戻す
3. While 利き手の設定が左, the HandView shall すべての手を左右反転した左手として描く

### Requirement 4: 動き
**Objective:** As a 学習者, I want 動きのある指文字や単語の動きを繰り返し見られる, so that 動き方まで覚えられる
#### Acceptance Criteria
1. When 仕様に動き（形の変化・位置の移動・空中に字を書く軌跡）が含まれる, the HandView shall その順序と向きで動かす
2. When 学習者が「もう一度」または「ゆっくり」を押した, the HandView shall 最初から通常の速さまたは半分の速さで再生する
3. While 端末が動きを減らす設定（視差効果を減らす）, the HandView shall 自動では再生せず、学習者が再生を押した時だけ動かす

### Requirement 5: 小さな画像と関節の位置
**Objective:** As a 学習アプリ, I want 選択肢や一覧用の小さな画像と、カメラ判定用の関節の位置, so that 表示と判定が同じ形を基準にできる
#### Acceptance Criteria
1. When 小さな画像を求められた, the hand-model shall 同じ形・視点・利き手なら同じ画像を返し、一度作った画像は作り直さない
2. The hand-model shall どの形についても、手首と各指の関節・指先の計21点の位置を返す

### Requirement 6: 描けない環境と性能
**Objective:** As a 学習者, I want 古い端末でも学べる, so that 端末を理由に脱落しない
#### Acceptance Criteria
1. If 端末が3D描画に対応していない, then the HandView shall 形の文章による説明を代わりに表示する
2. The HandView shall 一般的なスマホで、動きを毎秒30コマ以上でなめらかに再生する
3. The HandView shall 描いている手の説明文を、画面読み上げ向けの代替テキストとして持つ
