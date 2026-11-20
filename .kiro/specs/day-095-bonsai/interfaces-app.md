# 契約3: 画面・操作・保存（担当D・Codex）

要件は requirements.md、操作の考え方は ux.md、見た目の方針は visual-direction.md。木は interfaces-core.md、描画は interfaces-view.md。
D が持つ：`index.html`・`app.css`・`app.js`・`lib/controls.js`・`lib/ui.js`・`lib/audio.js`・`lib/store.js`・`lib/lore.js`・`favicon.svg`・`tests/ui/`。
`lib/view3d.js` と `lib/tree.js` が未完成のあいだは、先頭の行を `// TEMP-PLACEHOLDER(D)` にした最小の代用品を `lib/` に置いて進める（本物が出来た担当が上書きする）。マーカーの無い他担当のファイルは、直さない。

## ページの約束（試験が頼る）
- `<html lang="ja">`、`<title>` と `og:title` は meta.json の題名「盆栽日和 — 3Dの盆栽を、切って曲げて育てる」。`<meta name="share:text">` は題名を含む。canonical・OGP・theme-color・viewport(viewport-fit=cover) を OriCube（`day-087-oricube/index.html`）と同じ作法で書く。外部の通信・インラインスクリプトは禁止。
- 共有：`<script src="./shared/share.js" defer>`・`<link rel="stylesheet" href="./shared/share.css">`・`<div id="share"></div>`（または `<footer id="share">`）。共有を開くボタンの読み上げ名は「このアプリを共有する」。ダイアログに入れてよい。
- `#app` に `data-ready`（"false"→描けたら"true"）、`data-species`・`data-tool`・`data-season`・`data-day`・`data-branches`（主枝以上の chain の数）・`data-gfx` を常に反映する。
- ボタンの読み上げ名：道具「見る」「切る」「曲げる」「芽摘み」（P1「水」）、時間「1週間」「1か月」「次の季節」、「元に戻す」「やり直す」、「メニュー」、「写真」。状態の通知は `#live`（role=status）に日本語の文章で出す。
- キャンバス：`role="img"`、aria-label は「（樹種）の盆栽。（季節）。枝は（n）本」を更新する。
- URL の引数：`?debug=1`（`window.__bonsai = { tree, view, state(), setTool(id), advance(days) }` を出す。debug でなければ出さない）、`gfx`、`seed`、`species`、`style`、`pot`、`light`、`day`（開始時にその日まで進める）、`tool`、`cam=az,pol,dist`、`fresh=1`（保存を読まない・書かない）、`tips=0`（初回の案内を出さない）。撮影・試験用に、同じ引数なら同じ絵になること。

## 操作の流れ
- ポインタは Pointer Events で統一し、touch-action:none をキャンバスに付ける。1本指：道具が「見る」か、枝に当たらなければ視点を回す（慣性あり・動きの軽減では慣性なし）。2本指：つまみで拡大縮小、平行移動で視点をずらす（範囲は CAMERA_LIMITS）。ダブルタップ・ダブルクリック：視点を戻す。ホイール：拡大縮小。
- 「切る」：押下で `pickNode`（指の太さ `tolerancePx` は touch=14・mouse=8）、候補の枝と切られる範囲（`subtreeIndices`）を `view.setHighlight(…,'cut')`、移動で候補を更新、離すと実行（候補なしなら何もしない）。実行は `history.record(tree)`→`tree.cut`→`view.dropBranch`→`view.setSkeleton`→「元に戻す」付きの短い通知。切れないときは `message` をそのまま出す。
- 「曲げる」：押下で `tree.beginBend`、移動のたびに `session.update(grab, target)`（target はカメラの面と交わる点。`view.camera.pickRay` から求める）→`setSkeleton`、離すと `commit`（`changed` のときだけ `history.record` を、**押下の前の複製**で行う）。
- 「芽摘み」：枝先を押すと `tree.pinch`。粒の演出と短い通知。
- 時間：ボタンで `history.record`→`tree.advance(7 / 30 / nextSeasonDay-now)`→`view.setSkeleton(…, {animate:true})`・`view.setLook(seasonLook(…), {animate:true})`。日付ラベル（`dateOf(day).label`）を常に表示。
- 元に戻す・やり直す：`history`。ボタンの無効状態を同期する。キーボード：Z・Shift+Z。
- キーボード：Tab で道具の列→キャンバス。キャンバスにフォーカスがあるとき、`[` `]` で `branchList` を順に選び（選んだ枝は highlight 'select' と `#live` で知らせる）、Enter で今の道具を実行、矢印で視点（曲げる中は選んだ枝を曲げる）、`+` `-` で拡大縮小、`R` で視点を戻す、数字1〜4で道具、Space で「1週間」。

## 保存・設定・音・写真
- `lib/store.js`：localStorage の `SAVE_NAME` に `{ v: SAVE_VERSION, tree: tree.toJSON(), pot, light, muted, tipsSeen, savedAt }`。読み書きは必ず try/catch。壊れた・古い・大きすぎる（400KB超）保存は捨てて新しい苗で始める。保存できなくても遊べる。操作の区切り（離した時・時間を進めた時）に、少し遅らせてまとめて書く。メニューに「保存を消して最初から」。
- `lib/audio.js`：WebAudio の小さな合成音（はさみ・針金・芽摘み・季節の鈴）。最初の操作のあとに初めて作る。既定は鳴る・メニューで切る。動きの軽減とは別に扱う。
- 写真：「写真」→`view.capturePhoto`→プレビュー（保存／共有）。保存は `<a download>`、共有は `navigator.canShare({files})` が真のときだけ画像つき。
- メニュー（面）：新しい苗（樹種・樹形・鉢）・光・音・保存を消す・このアプリについて（外部通信なし・保存の中身・手入れは目安・盆栽の基本の豆知識＝`lib/lore.js`）・キー操作の一覧。初回だけ、3つの一言の案内（回す／道具を選んで枝をさわる／時を進める）。
- WebGL が使えないとき：理由と、手入れの基本の文章（lore.js）を出す。

## 見た目・配置
- 色・書体・配置は visual-direction.md と ux.md の④⑤。390×844 で、操作部は下の親指の範囲、上は題名・メニュー・写真・共有。1440px では、同じ構成を中央寄せにして、メニューを右の面にしてよい。`100dvh`・safe-area の余白・`prefers-reduced-motion`・`prefers-color-scheme` は暗くしない（和紙の明るい面を保つ）。
- 操作部は44px以上・間隔8px以上。フォーカスの輪は3:1以上。文字は4.5:1以上。アイコンは自作のインラインSVG（外部のアイコン集は使わない）。
- 試験：`tests/ui/*.test.mjs`（置くだけで走る）。Node で、道具の状態遷移・ジェスチャの分類（回す／つまむ／タップ／ダブルタップ）・store の読み書きと壊れた保存の拒否・lore の文言（空でない・長さ）を確かめる。ブラウザの試験（Playwright）は親が書く。
