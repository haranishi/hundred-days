# Requirements Document

## Project Description (Input)
架空の雪山1つを、種から決定的に作る生成スクリプトと、その山の高さ・雪質・木と岩・出発地点を読む問い合わせを作る。
物理・描画・地図が同じデータを読み、板が雪面から浮いたり沈んだりしないことが目的。背景は `brief.md` にある。

## Introduction
本仕様は、ゲームの世界の骨格（山の純データ）を扱う。利用者は、山を滑るプレイヤーと、このデータを読むほかの仕様の実装者。

## Boundary Context
- **In scope**: 山の生成、問い合わせ、確認用の画像と統計
- **Out of scope**: 画面への描画、滑走の物理、山の地図の画面
- **Adjacent expectations**: ride-sim と mountain-render は、本仕様の問い合わせだけを通して山を読む

## Requirements

### Requirement 1: 滑って面白い、本物らしい山
**Objective:** As a プレイヤー, I want 尾根・沢・崖・雪原・樹林がつながった山, so that 自分でラインを選んで何本も滑れる

#### Acceptance Criteria
1. The Mountain World shall 一辺およそ6km・標高差1,500m以上の、架空の独立峰を1つ提供する
2. The Mountain World shall 山頂の縁、岩の帯と溝のある急な壁、広い雪原、雪で埋まった沢（自然のハーフパイプ）、段になった棚、樹氷の原、樹林、ふもとを含む
3. The Mountain World shall 斜度の面積割合を、10度未満5〜20%・10〜20度20〜35%・20〜35度30〜45%・35〜45度8〜18%・45度超3〜10%に収める
4. The Mountain World shall 斜度12〜18度で凹凸の少ない、200m×300m以上の練習向けの斜面を1か所以上含む
5. The Mountain World shall 急な面（おおむね50度超）と風に削られた尾根に岩を露出させ、沢と風下に深い雪を積もらせる

### Requirement 2: 高さの問い合わせ
**Objective:** As a ほかの仕様の実装者, I want どの地点でも同じ高さと傾きを返す問い合わせ, so that 物理と描画が同じ雪面を使える

#### Acceptance Criteria
1. When 地図の範囲内の地点を問い合わせたとき, the Mountain World shall 高さ・法線・進行方向の曲がり具合を返す
2. The Mountain World shall 格子の境目でも高さと傾きを連続に保つ
3. If 範囲外の地点を問い合わせたとき, the Mountain World shall 端の値を返し、範囲外であることを判別できるようにする
4. The Mountain World shall 高さの元データ（配列）を、描画側がそのまま読める形で公開する

### Requirement 3: 雪質
**Objective:** As a プレイヤー, I want 場所によって雪の深さと質が違う山, so that 圧雪・新雪・氷で滑りが変わる

#### Acceptance Criteria
1. When 地点を問い合わせたとき, the Mountain World shall 雪の深さ、新雪・圧雪・氷の割合、岩の露出、風の当たり具合を返す
2. The Mountain World shall 雪質を、標高・斜度・風向き・樹林の有無から決め、隣り合う地点でなめらかに変える

### Requirement 4: 木と岩
**Objective:** As a プレイヤー, I want 避けながら滑れる間隔で立つ木と岩, so that 樹林の滑走が成り立つ

#### Acceptance Criteria
1. When 地点と半径を渡したとき, the Mountain World shall その範囲の木と岩（位置・太さ・高さ・種類）を返す
2. The Mountain World shall 同じ種なら、何度問い合わせても同じ木と岩を返す
3. The Mountain World shall 38度を超える斜面、森林限界より上、沢の底、練習向けの斜面の中央に木を置かない
4. The Mountain World shall 木の幹どうしを3m以上離す

### Requirement 5: 出発地点と区域
**Objective:** As a プレイヤー, I want 名前のついた出発地点, so that 滑りたい場所から始められる

#### Acceptance Criteria
1. The Mountain World shall 名前・位置・向き・難しさを持つ出発地点を6か所以上提供する
2. The Mountain World shall 各出発地点を、谷側を向き、前方150mに木や岩や崖が無い雪面に置く
3. The Mountain World shall 練習向けの斜面に、最初の出発地点を置く
4. When 地点を問い合わせたとき, the Mountain World shall その場所の区域の名前を返す

### Requirement 6: 太陽の影
**Objective:** As a プレイヤー, I want 山が谷へ落とす大きな影, so that 夕方の光で地形の起伏が読める

#### Acceptance Criteria
1. The Mountain World shall 夕方の太陽の向きと、その向きで日が当たるかどうかの地図を提供する
2. The Mountain World shall 影の縁を、数十メートルの幅でなめらかにぼかす

### Requirement 7: 作り直しと確認
**Objective:** As a 開発者, I want 1つの命令で山を作り直し、画像で形を確かめること, so that ゲームを動かさずに山を直せる

#### Acceptance Criteria
1. When 生成の命令を実行したとき, the Mountain World shall 5分以内に全データを書き出す
2. The Mountain World shall 同じ種と版から、1バイトも違わないデータを作る
3. When 生成が終わったとき, the Mountain World shall 陰影図・斜度・雪・木・出発地点の画像と、斜度と標高の統計を書き出す
4. If データの版がコードの版と違うとき, the Mountain World shall 読み込みを止め、作り直す命令を示す
5. Where 短時間の確認用の指定があるとき, the Mountain World shall 小さな格子で10秒以内に同じ手順の山を作る
