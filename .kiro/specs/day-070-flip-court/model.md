# ゲームモデルと返球の契約

## 共有定数
WORLDはwidth=600、height=760、gridX=42、gridY=122、gridSize=516、rows=6、cellSize=86。
cpuY=56、playerY=704、paddleWidth=112、ballRadius=10。ボールの左右境界は盤面内。
matchMs=60000、countdownMs=900、serveDelayMs=620。playerSpeed=690、cpuSpeed=300。
config.jsは数値の正本。Viewと入力は同じ値を使い、別の端末用判定を作らない。

## Rules
createBoard()は上3行をCPU=2、下3行を自分=1とする新しい36要素配列を返す。
getScores(board)は1と2の数をplayer/cpuで返す。
applyLanding(board,index,owner)は元の配列を変えず、新boardとflipped/changedのインデックス配列を返す。
ownerは1/2、indexは0〜35の整数。無効なowner/indexでは変更しない。盤面は36個の0/1/2で検証する。
着地マスをownerにしてから、元の相手の連続列の先にownerがある8方向だけを一括反転する。
flippedは挟み返した相手、changedは着地も含む実際に色が変わったマス。重複と連鎖反転はない。

## Matchの公開操作
- createMatch(seed=1): Match。intro・18対18・elapsedMs=0・ball=null・result=null。
- beginMatch(match): void。introだけをcountdownへ移す。開始の連打で時計を増殖させない。
- stepMatch(match,deltaMs,axis=0): void。有限の正のdeltaのみ。axisは-1〜1。countdown/playingだけが進む。
- movePlayerTo(match,x): void。playingだけが受理し、ラケット中心を左右の有効範囲へ収める。
- pauseMatch(match): void。countdown/playingからpausedへ移し、resumePhaseを保持する。
- resumeMatch(match): void。pausedだけを保存したphaseへ戻す。Runtimeは入力と前フレーム時刻をリセットする。
再戦はcreateMatchで新しいモデルを作ってbeginMatchする。終了したモデルは書き換えない。

## Matchの表示用フィールド
| フィールド | 値 |
|---|---|
| phase / resumePhase | intro/countdown/playing/paused/result と再開先 |
| board / scores | 36マスと{player,cpu} |
| elapsedMs / countdownMs / serveMs | 進行済み時間・合図の残り・サーブ待ちの残り |
| playerX / cpuX | ラケット中心の世界x座標 |
| ball | null または {id,owner,x,y,z,targetX,targetY,landed, …飛行の内部状態} |
| lastLanding | null または {id,atMs,owner,cell,flipped,changed} |
| lastEvent | null または {id,atMs,type,owner}。typeはserve/miss/finish |
| result | null または {winner,player,cpu}。winnerは0/1/2 |
乱数とCPUの反応待ちはMatch内で管理し、入力seedから再現できる。DOM・時計APIをモデルから呼ばない。

## ラリー
ボールは片側のラケットから他方まで約1.4秒で飛び、到達時にラケットとの距離で返球を判定する。
返球位置の正規化offsetは-1〜1。中央は奥、端は横へ浅い着地になる。
左右の飛行はoffsetに応じて変わり、端で折り返す。床上のyは相手側へ進み、高さzを添えて着地が分かるようにする。
着地の進行率は0.16〜0.84で、中央ほど相手側へ深く飛ぶ。最初の着地だけをRulesへ渡す。
到達したラケットがボールを拾えば反対側の打球へ移る。逃したらballを消し、陣地を保って620ms後にサーブする。
CPUは相手の打球に短い反応待ちを置いて移動する。速度上限と狙いのずれを持ち、瞬間移動しない。
CPUは同じ着地候補とRulesを使って狙う。難易度の良し悪しは実時間の試遊で調整する。

## 時計とイベント
進行は短い刻み（最大約16ms）で計算し、大きなdeltaでも到着と着地を飛び越さない。
各イベント時刻を60秒境界と照合する。60秒ちょうど以後の着地は反映せず、結果を1回確定する。
待ちサーブも試合時間へ含める。countdownは試合時間へ含めない。
pausedではball・CPU・盤面・残り時間を全て保つ。再開時に非表示だった時間を加算しない。
表示用のidは着地・イベントごとに増え、Runtimeが同じ効果を二重に通知しないために使う。
