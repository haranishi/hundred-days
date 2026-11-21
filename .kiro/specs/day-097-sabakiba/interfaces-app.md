# 契約: 画面・視点・練習（担当 WP-3・WP-4・WP-6）

## 状態 `lib/app-state.js`（純JS・試験つき）
`{ species, step, u, playing, speed(0.5|1), loop, mode:'guide'|'practice', view:'cook'|'side'|'top', xray, labels, leftHanded, quality:'auto'|'high'|'standard'|'light', speech, wake, progress:{[sp]:step}, best:{[sp]:{[stepId]:score}} }`。
経路（hash）: `#/` 入口・`#/fish/<id>` 前置き・`#/fish/<id>/<n>` n手順目・`#/safety`・`#/parts/<id>`・`#/done/<id>`。URL の `?sp=&step=&hand=L&gfx=&seed=&t=&debug=1` は撮影・試験用。
保存は `lib/persist.js`・名前は `STORAGE_NAME='sabakiba.v1'`（`〜_KEY` は誤検知されるので使わない）。壊れた保存は捨てて既定に戻す（例外を出さない）。

## 視点・操作（WP-3）
`lib/view3d.js` 描画ループ・サイズ追従・`visibilitychange` で止める・`dispose()`。`lib/camera.js` 軌道カメラ（ばね・慣性・範囲制限）・おまかせ視点（手順の `camera`）への移動・ダブルタップで戻す。
`lib/controls.js`＋`controls-gesture.js`（Day95 から移植）: 1本指＝回す・2本指＝拡大と平行移動（制限つき）・ホイール・キー。**3Dの上では縦スクロールを奪わない**（`touch-action:none` は3Dの領域だけ）。
`lib/gfx*.js` 画質3段の選択と降格（Day95 から移植・名前は変えてよい）。`lib/stage.js` まな板（木目は手続き）・影・光・環境マップ。左利き＝シーンの `scale.x=-1`（法線・面の向きに注意）。

## 画面（WP-4）
入口（魚のカード・絞り込み・つづきから）→ 前置き（道具・時間・安全のひとこと）→ ガイド（3D＋手順カード）→ できた（部位と使い道・共有）。別に「さばく前に」「部位の名前」。
- ガイドの配置: スマホ縦＝上に3D（画面の約42%・練習中は48%。390×844で説明欄を約330px確保）・下に手順カード。横・PC＝左に3D・右に手順カード。**「次へ」は親指の届く下端で最大**。
- 札（小さなトグル）: 再生・速さ・透視・視点（台所/真横/真上）・左利き・ラベル・練習。押す場所は固定。44px以上。
- 手順の一覧は下から出るシート。現在の手順は `aria-current`。タイトルは `aria-live=polite` で読み上げる。
- キー: ←→ 手順・Space 再生・X 透視・1/2/3 視点・L 左利き・Esc でシートを閉じる。
- **3Dが使えないとき**（WebGL2なし・初期化の失敗）: `data-gl="off"`。手順の文章（`<ol>`）・道具・安全・部位は動く。理由を日本語で出す。
- 共有: リポジトリの `shared/share.js`＋`shared/share.css`（`shared:sync` で複製）。ボタン＋`#share`・クラス名 `share` を他で使わない。`<meta name="share:text">`・OGP・canonical。
- 画面を消さない: `navigator.wakeLock`（対応時のみ・解放と再取得を `visibilitychange` で）。読み上げ: `speechSynthesis`（ja-JP・任意）。

## 練習（WP-6）`lib/practice.js`（純JS）＋ `lib/pick.js`（three・レイキャスト）
`createSession({curvePoints, tolerance})`・`addSample(session, point, tMs)`・`finish(session)` → `{score(0-100), accuracy, smoothness, coverage, comment, grade}`。
- 一致度＝切り線への距離（cm）の平均と最大。なめらかさ＝速さのばらつきと向きの反転（小刻みな往復は減点）。範囲外・逆向き・途中放棄は理由つき。
- 切り線は表面の線のとき表面を、内側の線（through）は透視にして内側の面へ投影。結果は「ガイドとの一致度」と呼ぶ。
- 結果カード（P1）: 種・手順・得点・名前なしのPNG。書き出せない環境ではボタンを隠す。

## 練習の入力（`lib/scene-fish.js`・`lib/guides.js`）
- 光線が魚に当たらなくても、**切り線の画面上の投影から28px以内**なら、線の奥行きまで光線を通した点を返す（横のずれは採点に残る）。始点は**投影から40px以内**でないと一筆を始めず、`practice-miss` を出して「緑の丸から」と知らせる。
- 練習中は手の印・札・刃を隠し、始点に緑の丸・終点に矢じりを出す。両端の3%以内は届いたと数える。

## 試験用フック（`?debug=1` のときだけ）
`window.__sabaki = { state(), goto(sp, step, u), ready(), model, anatomy, stats(), practiceGuide() }`（`practiceGuide()` は練習中の切り線の画面上の投影 `{start, end, points}`（CSS px）か `null`）。**`goto` は Promise を返し、カメラを即座に目標へ置き（ばねを飛ばす）、3フレーム描いてから resolve する**（撮影・採点の固定ショットが決定的になる）。`?freeze=1` のときは再生・自動の動きを止める（`u` は `goto` で決める）。3D が出たら `document.body.dataset.ready='true'`。外部通信は0件（E2Eで見張る）。

## 画面と3Dの境目 `FishScene`（WP-4 は `lib/scene-stub.js` で作り、本物 `lib/scene-fish.js` に差し替える。同じ形）
```
createFishScene({ container, speciesId, quality:'auto'|'high'|'standard'|'light', debug }) -> {
  ready: Promise<{triangles, quality, gl:'webgl2'|'webgl1'}>,         // WebGL が使えなければ reject（理由は Error.message・日本語）
  setStep(i), setProgress(u), setView('cook'|'side'|'top'), setXray(bool), setLabels(bool), setLeftHanded(bool),
  setPractice(null | {cutId}),                                          // 練習中は切り線を光らせ、なぞりを受ける
  on('pick'|'practice-sample'|'camera-user', cb), resetCamera(), snapshot() -> Promise<Blob>, stats(), dispose() }
```
`setProgress(u)` は手順の中の進み具合（`stateAt(proc, step, u)`）。再生はアプリ側が `u` を進める。
- 撮影の補助: `stats()` は `{stepCount, triangles, quality, fps}`。`__sabaki` には `setXray(bool)`・`setView(v)`・`setLeft(bool)` もある（`tools/scoring-shots.mjs` が使う）。
