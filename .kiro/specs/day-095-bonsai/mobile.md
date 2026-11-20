# スマホ対応の設計（要件 11・2026-11-20）

## 背景（コードを消すと失われる事実）
- 画質の段は `high`・`low`・`test` だが、選ぶのは URL の `gfx` だけ。既定は `high` なので、スマホでも常に最高画質。
- 実測（Chromium・CPU 4倍遅く・390×844）：`high` は盆栽が出るまで 7.5秒。長い連続処理が 4.9秒と 1.9秒。`low` でも 3.3秒。
- 重いのは、質感を JS で1画素ずつ作る所（卓 232ms・和紙 146・土 95・苔 157・鉢 190 = 約 820ms、等倍の速いMacで）。512px にすると約 220ms（3.8倍速い）。シェーダーの組み立ては、この環境（ソフトウェア描画）では実機の値にならない。
- iPhone 相当（WebKit・Mac のGPU）は 0.9秒で起動し、崩れもない。遅いのは処理の弱い端末（特にAndroidの中位以下）。

## 画質の段（`lib/gfx.js` に1か所）
| | high | mid（新） | low | test |
|---|---|---|---|---|
| DPR の上限 | 2 | 1.75 | 1.25 | 1 |
| 影の大きさ | 2048 | 1024 | 1024 | 0（影なし） |
| 舞台の質感（辺） | 1024 | 512 | 256 | 128 |
| 樹皮の質感 | 今の high | 256 | 今の low（160） | 64 |
| 1パッドの葉 | 120 | 84 | 60 | 6 |
| 異方性 | 8 | 4 | 2 | 1 |
| antialias | あり | あり | なし | なし |
鉢・土・苔・壁の形の細かさは、mid を high と low の中間にする。ほかの段ごとの分岐（`gfx === 'low'` など）も、この表を読む形に直す。

## 選び方（純粋な関数・試験する）
- `lib/gfx-select.js`：`resolveGfx({ param, setting, learned, env })`。順に、URL の `gfx`（high/mid/low/test）→ 設定（auto 以外）→ 自動。自動は env（`coarse`・`minSide`・`memory`・`cores`・`saveData`）から決める：`saveData` か `memory ≤ 3` か（`coarse` かつ `cores ≤ 4`）→ low／`coarse` で短い辺が 700px 未満 → mid／それ以外 → high。覚えた段（learned）は、自動の結果より下がるときだけ効く（上がらない）。
- 覚えた段の置き場：localStorage `day095.gfx.learned`（`{tier, at}`・30日で失効・読み書きは try/catch・無くても動く）。

## 実行中の自動調整（純粋な関数・試験する）
- `lib/gfx-governor.js`：`createGfxGovernor({ tier, minFps = 26, windowSize = 45, warmup = 15, cooldownMs = 3000, maxFrameMs = 250 })`。`push(frameMs, nowMs)` が、`null` か `{ from, to }`（1段下）を返す。
- 数えるのは、動いている間（補間・回す・成長）の描画の間隔だけ。250ms 超（タブの切替など）と、作り直し直後の 15 コマは数えない。窓の中央値が 1000/minFps を超えたら下げる。low より下はない。直前の変更から 3秒は下げない。iOS の低電力モード（30fps 固定＝33.3ms）で下げないこと（26fps＝38.5ms が閾値）。
- `createView3D` に `onFrame(ms)` を足す。`tick` の生の間隔（今は 0.05秒で丸めているので、丸める前の値）を、`moving` で描いたときだけ、`gfx !== 'test'` かつ `document.hidden` でないときに渡す。
- `app.js`：下げるときは、段を覚え、`ui.notify('動きが重いので、画質を下げました。メニューで変えられます。')`、`restartView(カメラ)`。読み上げにも出す。

## 起動を止めない（要件 11.4）
- `createView3D` に `deferTextures`（`test` 以外は true）。質感は最初は作らず、色だけのマテリアルで始める。`view.prepare({ yieldToMain })`（async）が、卓→壁→土→苔→鉢→現在の樹種の樹皮と葉、の順に1つずつ作って、各段のあいだに `await yieldToMain()` する。作るたびに `material.map` を入れて `needsUpdate`。`compileAsync(scene, camera)` があれば最後に呼ぶ。`dispose` 済みなら、各段の前で打ち切る。
- 鉢を替えたときの鉢の質感も、同じ道で（作る前に1回だけ処理を返す）。
- `app.js` の `mountView` は、`await current.prepare(...)` のあとに今の「ready」へ進む。そのあいだ読み込み中の表示（`#loading`）が出たまま。作り直しが割り込んだら（`view !== current`）捨てる。
- `yieldToMain` は `scheduler.yield` があればそれ、なければ `setTimeout(0)`。

## 触る面（要件 11.5）と先読み（11.7）
- `app.css`：道具帯・時間の帯・舞台・上の帯に `user-select: none`・`-webkit-user-select: none`・`-webkit-touch-callout: none`・`-webkit-tap-highlight-color: transparent`。`html, body` に `overscroll-behavior: none`。共有のURL欄とシートの文章は選べるまま。
- `index.html`：静的な import をたどった全モジュール（`vendor/three.js` を含む）の `<link rel="modulepreload">`。一覧と実際の import の食い違いを、単体試験で見つける（動的 import は除く）。

## 画面と保存
- メニューの設定に「画質」（自動・高・標準・軽め＝auto/high/mid/low）。選ぶと保存し、その場で `restartView`。`#app[data-gfx]` は今の段（high/mid/low/test）。設定の保存は `store.js`（`gfx` が無い古い保存は auto として読む）。

## 試験（足すもの）
- 単体：`gfx.js` の表・`gfx-select`（表で網羅）・`gfx-governor`（遅い列で1段下がる／速い列は下がらない／30fps固定は下がらない／クールダウン・最低・ウォームアップ・250ms超の除外）・`view3d` の `prepare`（質感が1つずつ・間に処理が返る・dispose で止まる）・`diorama` の遅延・`store` の画質・メニューの選択・`app` の段切替（`restartView`・通知・カメラを保つ）・modulepreload の一致。
- 通し（Chromium）：`gfx=mid` で起動して切れる／メニューで画質を替えると `data-gfx` が替わり、再読み込み後も残る／デバッグの入口（`?debug=1`）から遅い間隔を流すと low に下がって通知が出る（時間に頼らない）。
- 計測（CI に入れない・親が実行）：CPU 4倍・390×844 の起動時間と長い連続処理を、`high`・`mid`・`low` で。`prepare` の各段に `performance.mark` を置く。
