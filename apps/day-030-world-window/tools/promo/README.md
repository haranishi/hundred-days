# 「せかいのまど」プロモーション動画

Playwright で決定的な1コマを撮り、ffmpeg で36秒・1080×1920の MP4 にします。音声は本番描画時に未生成なら自動で合成されます。

```sh
PLAYWRIGHT=/path/to/playwright/index.js node tools/promo/render-promo.mjs --preview
PLAYWRIGHT=/path/to/playwright/index.js node tools/promo/render-promo.mjs
```

リポジトリ直下からは `node apps/day-030-world-window/tools/promo/render-promo.mjs` と実行できます。プレビューは `preview-contact.jpg`、本番は `promo.mp4`、`promo-first-frame.png`、`promo-audio.wav` を同じフォルダへ出力します。部分確認には `--from 18 --to 24`、別の出力先には絶対パスで `--out <mp4>` を指定できます。

1コマは時刻 t の純関数です。アプリ側は「t における望ましい場面を計算し、場面が変わったときだけ読み直す」ので、途中の t から撮り始めても同じ画になります。撮影は `reducedMotion: 'reduce'` かつダークテーマです。アプリの移動は `jumpTo` になり、入力、スクロール、波紋は合成ページ側が t から描きます。

## このアプリで足りない3つの仕掛け

**場面の切り替え後だけ待つ。** `promo.js` は世界図・タリン・マドリードへ移るときだけアプリを読み直し、`#map[data-ready="true"]`、MapLibre の `once('idle')`、静止画の `complete && naturalWidth > 0` の順で待ちます。`data-ready` はアプリが層を入れ終えたときに付けます（`lib/map.js`）。同じ場面のフレームではネットワーク待ちを繰り返しません。

**カメラを固定する。** 「どこかの窓を開く」は乱数なので押しません。タリンは `n8244685419`、別の街はマドリードの `n5451417033` とし、iframe の URL を `#cam=<id>` 付きで読み直します。検索候補と「どこかの窓を開く」ボタンには合成側の波紋だけを重ね、押したように見せます。

**自動更新を止める。** 静止画は通常60秒ごとに再取得されます。本番描画の途中で画が変わらないよう、`render-promo.mjs` の `context.addInitScript` は iframe の初期化前に `setInterval` を包み、30秒以上の周期だけ登録しません。短い待ち処理はそのまま動きます。アプリ本体には手を加えません。

## 気をつける点

- 地図タイルとカメラ画像は実ネットワークから読みます。提供元や OpenFreeMap の応答が遅い場合はプレビューを再実行してください。
- 1コマ目がXのサムネです。世界図のクラスタ円、9,164か所のカウント、フック字幕が見える構図です。
- 字幕は1行16字以内・2行以内です。左右108px（10%）のセーフ領域内に収めています。

## 他の Day へ流用するときに差し替える場所

- `timeline.mjs` — 絵コンテ、字幕、カメラ件数、固定カメラID、タップ・検索・スクロールの時刻
- `promo.js` — 場面遷移、待機条件、iframe 内の操作対象、波紋の重ね先
- `promo.html` / `promo.css` — iframe の URL、タイトル・約束・エンド画面の文言と配色
- `promo-audio.mjs` — 音列とシード、タップと場面転換の効果音時刻
