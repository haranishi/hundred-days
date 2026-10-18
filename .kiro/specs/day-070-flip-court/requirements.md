# 要件定義：フリップコート

## Introduction
1人で短く遊びたい利用者が、スマホまたはPCの1台で、コンピューター（CPU）と60秒対戦する。
打球を返し、着地点のマスを塗り、相手のマスを挟んで反転させる。終了時の陣地が多い側を勝ちとする。
本書は選択された企画を具体化した要件案であり、承認後に設計へ進む。

## Boundary Context
- 対象：6×6盤面・CPU1体・60秒の1試合・一時停止・結果・再戦・アプリの共有。
- 対象外：オンライン対戦・参加者募集・ログイン・ランキング・複数ステージ・特殊能力。
- 接続先：100日アプリの既存構成、制作記録、共有と検査。既存Dayの遊びやiroriは改修しない。

## Requirements

### Requirement 1: 1人でルールを理解して始める
**Objective:** 1人のプレイヤーとして、相手を募集せず、最初の操作を理解して対戦を始めたい。

#### Acceptance Criteria
1.1 When 初期画面を開く, the Flip Court shall 「返す→着地を塗る→挟んで反転」の説明、操作方法、CPU戦の開始操作を表示する。
1.2 When 開始を選ぶ, the Flip Court shall 両者の陣地を同数に初期化し、開始の合図の後に残り60秒の試合を始める。
1.3 While 初期説明または結果を表示している, the Flip Court shall 試合時間を減らさない。
1.4 The Flip Court shall 他の参加者やログインを要求せず、読み込み済みの画面内でCPU戦を完結できるようにする。

### Requirement 2: 指またはキーボードで返球する
**Objective:** 自分の操作が返球と着地点に結びつき、CPUを相手に打ち合いたい。

#### Acceptance Criteria
2.1 When 盤面上で指を左右にドラッグする, the Flip Court shall 自分のラケットを左右に動かし、操作範囲の外へ出さない。
2.2 When 左右矢印またはA・Dキーを押している, the Flip Court shall 対応する方向へ自分のラケットを動かす。
2.3 When 指を離す・操作が取り消される・画面から焦点が外れる, the Flip Court shall その操作による移動の継続を止める。
2.4 When ラケットの異なる位置で返球する, the Flip Court shall 左右の着地点を打ち分けられるようにする。
2.5 While 試合中である, the Flip Court shall CPUにも同じ返球・着地・反転・ミスのルールを適用する。

### Requirement 3: 着地と挟み返しで陣地を取る
**Objective:** ただ返球を続けるだけでなく、狙った着地から相手の陣地をまとめて取り返したい。

#### Acceptance Criteria
3.1 When 有効な打球が盤面内に初めて着地する, the Flip Court shall その打球につき1回、着地した1マスを打ち手の色にする。
3.2 When 着地マスから縦・横・斜めの8方向に連続する相手のマスがあり、その先に自分のマスがある, the Flip Court shall 間にある相手のマスを自分の色へ反転する。
3.3 If 相手の列が盤面の端・空きマスで終わる、または相手のマスが連続していない, the Flip Court shall その列を反転しない。
3.4 When 複数方向で挟み返しが成立する, the Flip Court shall 着地時点の盤面に基づいて全方向を反転し、反転後を起点に連鎖判定しない。
3.5 The Flip Court shall 両者が占有するマス数を陣地として集計し、勝敗点を陣地数に統一する。
3.6 When 盤面外の着地または同じ打球の重複した着地通知を受ける, the Flip Court shall 陣地を追加・反転しない。

### Requirement 4: 60秒の試合を止め、終え、再戦する
**Objective:** ミスや中断で進行不能にならず、1試合の結果を見て繰り返し遊びたい。

#### Acceptance Criteria
4.1 When 実際に進行した試合時間が60秒に達する, the Flip Court shall 試合を1回だけ終了し、その時点の陣地で勝ち・負け・同点を確定する。
4.2 While 試合が終了している, the Flip Court shall 遅れて到着した着地や操作で確定済みの結果を変えない。
4.3 When 自分またはCPUが返球を逃す, the Flip Court shall 確定した陣地を保ち、試合時間内なら操作を要求せず次のサーブへ進む。
4.4 When 一時停止を選ぶ、または別タブへ移動する, the Flip Court shall 試合時間・ボール・CPUの進行を止め、再開操作を表示する。
4.5 When 再開を選ぶ, the Flip Court shall 停止時の陣地・残り時間・ラリー状態から試合を続ける。
4.6 When もう一度遊ぶを選ぶ, the Flip Court shall 前の試合の入力や進行を引き継がず、初期盤面と60秒で新しい試合を始める。

### Requirement 5: 状況と反転の理由が画面で分かる
**Objective:** 小さな画面でも、残り時間と優劣、自分の一打で変わった場所を確認したい。

#### Acceptance Criteria
5.1 While 試合中である, the Flip Court shall 残り時間と、自分・CPUそれぞれの陣地数を表示する。
5.2 When 着地または反転が起きる, the Flip Court shall 着地マスと反転したマスを区別し、変化した陣地数を示す。
5.3 When 結果を表示する, the Flip Court shall 勝ち・負け・同点、両者の最終陣地数、再戦と共有の操作を表示する。
5.4 While 幅360px以上のスマホまたはPCで表示する, the Flip Court shall 横スクロールを発生させず、主要操作と盤面を利用できるようにする。
5.5 When 画面の幅や向きが変わる, the Flip Court shall 確定した陣地と残り時間を保って表示と操作範囲を合わせ直す。
5.6 The Flip Court shall 色以外の印とラベル、見えるキーボード焦点、44px以上の主要ボタン、動きを減らす設定に応じた装飾抑制を備える。

### Requirement 6: アプリを共有し、利用できない操作を案内する
**Objective:** 友人へゲームを紹介し、端末の機能差で操作が止まらないようにしたい。

#### Acceptance Criteria
6.1 When 共有を開く, the Flip Court shall アプリの正規URLを使うX・LINE・リンクコピーを表示する。
6.2 Where 端末の共有シートを利用できる, the Flip Court shall 端末の共有シートも選べるようにする。
6.3 If コピーに失敗する, the Flip Court shall 状態と手動コピーの案内を表示し、ゲームや他の共有操作を続けられるようにする。
6.4 If 共有シートの操作が失敗または取消となる, the Flip Court shall 確定した試合結果を保ち、再試行や他の共有操作を続けられるようにする。
6.5 The Flip Court shall リンク先を示す正規URLと、共有時に使うタイトル・説明・紹介画像を備える。
6.6 If ゲーム描画に必要な機能を利用できない, the Flip Court shall 利用できない旨と対処を表示し、操作不能な試合を開始しない。
