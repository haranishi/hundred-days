# Requirements Document

## Project Description (Input)
スノーボードの滑走を、操作から決定的に計算する物理と規則を作る。切って曲がること、板を横へ向けて削ること、
起伏での荷重の変化、ジャンプと着地、転倒と復帰、雪質の違いを扱う。背景は `brief.md` と調査 R1・R2 にある。

## Introduction
本仕様は、滑走者1人の動きを決める。利用者は、操作するプレイヤーと、状態を読んで見せる側（姿勢・カメラ・音・HUD）の実装者。

## Boundary Context
- **In scope**: 接地・空中・転倒の動き、操作の意味、雪質の影響、着地と転倒の判定、出来事と計測値
- **Out of scope**: 入力装置、描画、音、得点、スキー
- **Adjacent expectations**: 山の高さと雪質は mountain-world の問い合わせから得る。時間は外から固定刻みで進められる

## Requirements

### Requirement 1: 斜面での加速と減速
**Objective:** As a プレイヤー, I want 斜度と姿勢で速さが変わる滑り, so that 山の形を体で感じられる

#### Acceptance Criteria
1. While 滑走者が斜面にいるとき, the Ride Sim shall 重力・雪の摩擦・空気の抵抗から速さを決め、斜度ごとの終端速度を理論値の±2%に収める
2. When プレイヤーが低い姿勢を取ったとき, the Ride Sim shall 空気の抵抗を減らし、終端速度を上げる
3. While 滑走者が登りか平らな雪面にいるとき, the Ride Sim shall 速さを減らし、雪の摩擦で速度の向きを反転させない
4. While 板が斜面を横切る向きで止まっているとき, the Ride Sim shall 滑走者をその場に留める
5. If 板が谷か山を向いて止まり、重力が雪の摩擦に勝つとき, the Ride Sim shall 板の先端を谷へ向け直しながら動き出させ、後ろ向きのまま滑り続けさせない

### Requirement 2: 切って曲がる
**Objective:** As a プレイヤー, I want エッジに乗って弧を描くターン, so that 速さを保ったまま曲がれる

#### Acceptance Criteria
1. When プレイヤーが左右を入れたとき, the Ride Sim shall 滑走者を内側へ傾け、板が進む向きに沿ったまま弧を描かせる
2. The Ride Sim shall 弧の半径を、低速では板の形で、高速では雪が支えられる横力で決め、速いほど大きくする
3. When プレイヤーが左右を切り替えたとき, the Ride Sim shall 0.3〜0.5秒かけてエッジを切り替える
4. While 左右の入力が無いとき, the Ride Sim shall 斜面を横切る向きでも、板の向きを保って進ませる
5. If 起伏や氷で横力が足りなくなったとき, the Ride Sim shall 板を外へずらし、その出来事を知らせる

### Requirement 3: 削って止まる
**Objective:** As a プレイヤー, I want 板を横へ向けて雪を削る制動, so that 速さを自分で抑えられる

#### Acceptance Criteria
1. When プレイヤーが制動を入れたとき, the Ride Sim shall 板を進む向きから横へ回し、横滑りの大きさに応じて減速させる
2. When 制動と左右を同時に入れたとき, the Ride Sim shall その方向へ、切るターンより小さく回り、速さを失わせる
3. The Ride Sim shall 圧雪の平らな雪面で、時速60kmからの全力の制動を12〜20mで止める
4. When プレイヤーが制動を離したとき, the Ride Sim shall 0.5秒以内に板を進む向きへ戻す
5. While 横滑りしているとき, the Ride Sim shall 山側のエッジを使い、谷側のエッジが引っかかる転倒を起こさない

### Requirement 4: 起伏と荷重
**Objective:** As a プレイヤー, I want 凹みで沈み、凸で軽くなる滑り, so that 雪面の起伏が手ごたえになる

#### Acceptance Criteria
1. While 凹んだ雪面を通るとき, the Ride Sim shall 脚を縮め、荷重を増やす
2. While 凸の雪面を通るとき, the Ride Sim shall 脚を伸ばし、荷重を減らす
3. If 凸を速く越えて雪面が体を支えられないとき, the Ride Sim shall 滑走者を空中へ出す

### Requirement 5: ジャンプと空中
**Objective:** As a プレイヤー, I want 構えて離すジャンプと空中の回転, so that 地形を読んで飛べる

#### Acceptance Criteria
1. While プレイヤーがジャンプを押しているとき, the Ride Sim shall 滑走者をしゃがませる
2. When プレイヤーがジャンプを離したとき, the Ride Sim shall しゃがんだ深さに応じて踏み切らせ、平らな雪面では0.2〜0.45mの高さに上げる
3. While 滑走者が空中にいるとき, the Ride Sim shall 重力と空気の抵抗だけで重心を動かす
4. When 踏み切りの前後に左右が入っていたとき, the Ride Sim shall その向きへ横回転を与え、空中の左右で回転を少しだけ調整できるようにする
5. While 空中で低い姿勢を取っているとき, the Ride Sim shall 回転を速める

### Requirement 6: 着地
**Objective:** As a プレイヤー, I want 衝撃と向きで結果が決まる着地, so that 失敗の理由が分かり上達できる

#### Acceptance Criteria
1. When 滑走者が着地したとき, the Ride Sim shall 雪面に垂直な速さと、板と進む向きのずれから、きれい・重い・ぐらつく・転倒のいずれかに分ける
2. The Ride Sim shall 下り斜面への着地を、平らな面への同じ高さからの着地より軽く扱う
3. When 板が進む向きと逆を向いて着地したとき, the Ride Sim shall 逆向きの滑走として続けさせる
4. When 着地の結果が決まったとき, the Ride Sim shall 衝撃の大きさと向きのずれを出来事として知らせる

### Requirement 7: 転倒と復帰
**Objective:** As a プレイヤー, I want 理由の分かる転倒とすぐの復帰, so that 失敗してもすぐ滑り直せる

#### Acceptance Criteria
1. If 強すぎる着地・横向きの着地・木や岩への強い衝突が起きたとき, the Ride Sim shall 転倒させ、理由を知らせる
2. While 転倒しているとき, the Ride Sim shall 雪面を滑らせて減速し、止まったら1.5秒以内に立ち上がらせる
3. When 出発地点か直前の安全な地点への復帰を求められたとき, the Ride Sim shall その地点で止まった状態から再開させる
4. While 安定して滑っているとき, the Ride Sim shall 数秒ごとに安全な地点を覚える

### Requirement 8: 雪質と障害物
**Objective:** As a プレイヤー, I want 雪質で変わる滑りと、当たると結果のある木と岩, so that ライン選びに意味が出る

#### Acceptance Criteria
1. While 新雪にいるとき, the Ride Sim shall 板を沈ませて抵抗を増やし、遅いほど深く沈ませる
2. While 氷にいるとき, the Ride Sim shall 横力の上限を下げ、弧を大きくする
3. While 岩の露出にいるとき, the Ride Sim shall 強く減速させる
4. When 木の幹や岩に当たったとき, the Ride Sim shall かすれば向きと速さを変え、強く当たれば転倒させる
5. If 地図の端へ近づいたとき, the Ride Sim shall 滑走者を止め、その出来事を知らせる

### Requirement 9: 決定性と安定
**Objective:** As a 開発者, I want 同じ入力から同じ結果になる計算, so that 試験と撮影を再現できる

#### Acceptance Criteria
1. The Ride Sim shall 同じ初期状態と同じ入力の列から、同じ状態の列を作る
2. The Ride Sim shall どんな入力と地形でも、非数や無限大を状態に出さない
3. The Ride Sim shall 刻みを60・120・240Hzに変えても、終端速度の差を1%以内、着地の衝撃の差を5%以内に収める

### Requirement 10: 見せる側への出力
**Objective:** As a 見せる側の実装者, I want 状態・出来事・計測値, so that 姿勢・カメラ・雪煙・音を物理に合わせられる

#### Acceptance Criteria
1. The Ride Sim shall 毎刻み、位置・速度・板の向き・傾き・横滑りの角度・荷重・脚の縮み・接地の有無を状態として出す
2. The Ride Sim shall 離雪・着地・転倒・立ち上がり・エッジの切り替え・横力の不足・衝突を、その刻みの出来事として出す
3. The Ride Sim shall 雪を削る強さ・雪煙の量の目安・沈み込み・空中の時間を計測値として出す
