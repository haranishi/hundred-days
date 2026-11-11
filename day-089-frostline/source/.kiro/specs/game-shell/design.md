# Design: game-shell

## Overview
時間・入力・画面の部品・試験の道具を、物理と描画から切り離した「器」として作る。物理・世界・描画は差し込む。

- **Goals**: 開いて1操作で滑走。3種類の入力が同じ操作の値になる。手動送りで試験と撮影を再現できる。
- **Non-Goals**: 物理、山のデータ、3D の描画、音、最終の配線。

## Boundary Commitments
- **This Spec Owns**: `src/core/`、`src/input/`、`src/ui/`、`src/styles/`、`src/game.js`、`src/dev/`、`index.html`、`dev/shell.html`、`tools/shots/`、`tests/core/`、`tests/input/`、`tests/ui/`
- **Out of Boundary**: `src/sim`・`src/world`・`src/render`・`src/audio`、`src/main.js`（統合の作業で書く）、`package.json`・`vitest.config.js`
- **Allowed Dependencies**: 実行時は依存なし。`tools/shots` は Playwright だけ
- **Revalidation Triggers**: 操作の値の形、描画を差し込む形、試験用の窓口の関数、画質の段の名前を変えたとき

## 差し込みの形
```js
// src/game.js — 器の本体。部品を受け取ってつなぐ
export function createGame({ root, world, ride, view, audio, settings, input, ui, debug })
game.start() / game.pause() / game.resume() / game.respawn('drop'|'safe') / game.dispose()

// 描画（view）と音（audio）が満たす形。無ければ何もしない既定を使う
view.init({ canvasHost, world, tier })        // Promise
view.resize(width, height, pixelRatio)
view.render({ state, prev, alpha, events, frameDt, time, look, settings })
view.setTier(tier) / view.dispose()
audio.update({ state, events, frameDt, settings }) / audio.resume() / audio.dispose()
```
`state` と `prev` は直前2刻みの滑走の状態、`alpha` はその間の位置（0〜1）。描画はこれで補間する。
`look` は視点のドラッグ量（yaw・pitch の差分）と、視点の種類（三人称・一人称）。

物理の状態は同じ物を書き換えるので、器が自分の入れ物を2つ持つ（`ride.createState()` で作る）。
刻みを進める直前に「今」を「前」へ写し、進めたあとに `ride.state` を「今」へ写す（`ride.copyState(src, dst)`）。
この2つの関数は、本物の滑走も仮の滑走も `ride` の関数として持つ。器は `ride` 以外から物理の部品を読まない。
出来事は刻みごとに空になるので、器が1回の画面更新のあいだ、刻みの順に写して集め、`render` と `audio.update` へ渡してから空にする。
復帰・出発地点への移動・控えからの復元のあとは、「前」と「今」を同じ値にそろえ、その回の `render` に `jumped: true` を付ける（描画がカメラや履歴を作り直せるように）。

## 時間（`src/core/loop.js`）
固定刻み 1/120 秒。1回の画面更新で進める刻みは最大 8。超えた分は捨てる（動きが遅くなるだけで、固まらない）。
`setManual(true)` で実時間の進行を止め、`advance(seconds)` が呼ばれた分だけ刻みを進めて1回描く。
手動送りには 8 刻みの上限を掛けない。刻みに満たない端数は持ち越し、次の `advance` で使う（0.25 秒を4回と、1秒を1回が同じ結果になる）。
入力のなめらかな立ち上がりも、固定刻みの中で進める。実時間では進めない（手動送りで結果が変わらないように）。
タブが隠れたら止め、戻ったら経過時間を捨てる。時計は `performance.now()` を1か所でだけ読む。

## 入力（`src/input/`）
| 操作 | キーボード | ゲームパッド | タッチ |
|---|---|---|---|
| 左右 | A・D／←・→ | 左スティック横 | 左下の舵（置いた指の位置が中心） |
| 低い姿勢 | W／↑ | 左スティック上 | 舵を上へ |
| 制動 | S／↓ | 左スティック下・B | 舵を下へ・制動ボタン |
| ジャンプ | Space | A | 右下のジャンプ（72px） |
| 視点の種類 | C | Y | 左上のボタン |
| 視点を動かす | ドラッグ | 右スティック | 右上半分のドラッグ |
| 復帰 | R（出発地点）・E（直前） | 十字キー上・下 | 一時停止の中と、転倒時のボタン |
| 一時停止 | Esc・P | Start | 右上のボタン |

- 出力は `{ steer, tuck, brake, jump, grab }`。`jump` は押している間 true。`grab` は初版では割り当てず、常に 0。
- キーボードの左右は時定数 0.08 秒で立ち上げ、離すと 0.05 秒で戻す。
- スティックは不感帯 0.12、外側 0.95 で 1。タッチは Pointer Events と `touch-action:none`。2本目の指の `pointerup` からも押下を拾う。
- 一時停止や復帰のような単発の操作は、値とは別の出来事として渡す。試験用に `setVirtual(値)` で上書きできる。

## 画面の部品（`src/ui/`）
- 題字：作品名、読み込みの進み具合、「滑りはじめる」、操作の早見（入力装置で出し分け）、設定。
- HUD：左下に速さ（大きな数字と km/h）と標高。下中央に案内の1行。右上に一時停止、左上に視点。
- 転倒の案内：`landing-hard`「着地が強すぎました」、`landing-sideways`「横向きに着地しました」、`tree`「木にぶつかりました」、`rock`「岩にぶつかりました」。
- 一時停止：つづける・直前の地点へ戻る・出発地点へ戻る・設定。設定：画質（自動・高・中・低）、揺れ（あり・少なめ・なし）、音量と消音、案内の表示、利き足。
- 色は白の文字と、暗い半透明の下地。強調は橙 1 色。数字は等幅。動きは不透明度と移動だけで、端末の「動きを減らす」に従う。
- 部品は `aria-label` とフォーカスの枠を持つ。下地つきの文字はコントラスト比 4.5 以上。

## 画質の段と設定（`src/core/quality.js`・`settings.js`）
段は `high`・`mid`・`low`。自動は、WebGPU の有無・画面の画素数・タッチ端末かどうかから選ぶ。URL の `?q=` が最優先。
設定は `localStorage` の1キーに JSON で持ち、読み書きの失敗は握って既定値で動かす。

## 試験用の窓口（`src/core/debug-api.js`）
`?debug=1` か開発サーバーのときだけ `window.__ginrei` を置く：
`ready`（Promise）・`info`（方式・段・版）・`state()`・`events()`・`setInput(値|null)`・`setManual(真偽)`・`advance(秒)`・`teleport(出発地点の名前|座標)`・`errors`。

## 開発用の同梱物（`src/dev/`）
- `fake-ride.js`：速さと向きだけを持つ仮の滑走。器だけを確かめるときに使う。
- `debug-view.js`：上から見た 2D の表示（位置・向き・速さ・状態）。3D の描画ができるまでの確認と、物理の調整に使う。
- `dev/shell.html`：上の2つで器だけを動かすページ。

## 検査と撮影（`tools/shots/`）
共通：Playwright 同梱の Chromium に GPU の引数（`steering/tech.md`）を付ける。`--webgl` で `?webgl=1`、`--webkit` で WebKit。
- `boot-check.mjs`：開いて `ready` を待ち、コンソールの誤り・警告・ページの例外が1件でもあれば終了コード 1。
- `capture.mjs`：場面の定義（出発地点・操作の列・秒数・視点）を読み、手動送りで再現して 1440×900・768×1024・390×844 で保存。
- `touch-check.mjs`：`hasTouch` と CDP の `Input.dispatchTouchEvent` で左右の指を同時に動かし、操作の値と部品の矩形を検査。CDP を使うので Chromium だけで行う。
- どれも終了時にブラウザを閉じる。待ちは上限つきで、名前でプロセスを探して待つ書き方をしない。

## Testing Strategy
画面の部品は2層に分ける。「何を表示するか」を決める純粋な関数（表示の中身を返す）は Node で試験する。
DOM へ反映する薄い層は Node で試験せず、実ブラウザの検査（`tools/shots`）で確かめる。jsdom などの依存は足さない。
- 時間：刻みの回数が経過時間どおり、上限で捨てる、手動送りの決定性と端数の持ち越し、隠れて戻ったあとに飛ばない（仮の時計で試験）。
- 受け渡し：1回の画面更新で複数の刻みを進めても、出来事が順に全部届く。復帰のあと「前」と「今」が同じ値になる。
- 入力：キーの立ち上がりと戻り、不感帯、3装置が同じ値になる、単発の操作の出来事（仮の EventTarget で試験）。
- 設定と画質：保存の失敗でも動く、`?q=` の優先。
- 画面：実ブラウザで `dev/shell.html` を開き、起動の検査・指の操作の検査・3幅の撮影が通る（統合の担当が実行）。
