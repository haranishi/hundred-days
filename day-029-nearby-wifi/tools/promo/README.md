# 「ちかくのWi-Fi」プロモーション動画

Playwright で決定的な1コマを撮り、ffmpeg で36秒・1080×1920の MP4 にします。音声は本番描画時に未生成なら自動で合成されます。

```sh
PLAYWRIGHT=/path/to/playwright/index.js node tools/promo/render-promo.mjs --preview
PLAYWRIGHT=/path/to/playwright/index.js node tools/promo/render-promo.mjs
```

プレビューは `preview-contact.jpg`、本番は `promo.mp4`、`promo-first-frame.png`、`promo-audio.wav` を同じフォルダへ出力します。部分確認には `--from 17 --to 19`、別の出力先には絶対パスで `--out <mp4>` を指定できます。地名検索の中継（`functions/api/day-029/`）は使わないので、`wrangler pages dev` は要りません。自前の一時サーバーで撮ります。

1コマは時刻 t の純関数です。アプリの状態は「探した／無料で絞った／ピンを選んだ」の3段しか無く、必ずこの順に進むので、`promo.js` は前回との差分だけを押します。巻き戻すときは iframe を読み直すため、途中の t から撮り始めても同じ画になります。撮影は `reducedMotion: 'reduce'` なのでアプリの演出（結果が出た瞬間の0.4秒）は動きません。見せたい動きは合成側で作ります。

## このアプリで足りない3つの仕掛け

**位置情報を与える。** 主要ボタンが `navigator.geolocation` を呼ぶので、`render-promo.mjs` が `grantPermissions(['geolocation'])` と `setGeolocation`（秋田駅）を iframe の読み込み前に渡します。日付には依存しないので Day 028 の `page.clock.setFixedTime` は要りません。

**タイルが揃うのを待つ。** 地図は OpenFreeMap から本物のタイルを取ります。読み込み途中で撮ると灰色の穴が写るので、`addInitScript` で `__E2E__` を立てて `WifiMap` に `__wifiMap` を生やし、`loaded()` と `areTilesLoaded()` が2回続けて真になるまで待ちます。状態を変えるたびに待ち、各コマの前にも素通りの確認を1回入れています。

**ピンとリストは実物のまま、出る順番だけ作る。** 動きを減らす設定ではアプリが「上からそろう」演出を飛ばすため、`promo.js` が iframe の `.wifi-marker` と `.spot` に毎コマ inline style を書いて、距離の近い順に立ち上げます。ピンは MapLibre が `transform: translate(-50%,-50%) …` で位置を握っているので、**transform ではなく幅・高さ・文字サイズで大きくします**（中心が動かない）。

## 気をつける点

- **絞り込みの演出は「消して出し直す」にしない。** 一度 `floor` 無しで撮ったら、残った候補まで一瞬消えて不具合に見えました。`stageAt` の `floor: .72` は軽く詰め直すための下限です。
- **スクロールはアンカーの実測で決める。** 検索すると「前回」の行や「3.2kmに広げる」が増えてカードの高さが変わるため、座標を固定値で書くと結果画面だけずれます。`SCROLL_KEYS` は「どの要素の上端を画面のどこに置くか」だけを書き、位置は毎コマ測ります。
- **秋田駅の 800m 以内に OSM 登録は2件しかなく、どちらも地図の見える範囲に入りません。** 3層の説明では OSM だけ凡例の色見本を囲っています（自治体とチェーンは実物のピン）。
- **無料の絞り込み（`#only-free`）は OSM 層にしか効きません。** 自治体（無料）とチェーン（推定）は残るので、字幕では「有料と不明を隠す」までしか言いません。25→23か所という数字も同梱データ依存です。データを作り直したら字幕の数字を直してください。
- **「Googleマップで開く」は押しません。** 新しいタブが開いて画が壊れるので、注目リングで示すだけにしています。Google のロゴも使いません。
- 字幕は1行11字までです。組み幅 776px に 66px の字を並べているので、12字を超えると2行になり、下端が10%セーフからはみ出します。
- 1コマ目がXのサムネになります。タイトル札ではなく、ピンが立っている途中から始めてください。

## 他の Day へ流用するときに差し替える場所

- `timeline.mjs` — 絵コンテ（`STORYBOARD`）・字幕（`CAPTIONS`）・操作の時刻（`T_RESET` `T_LOCATE` `T_FREE` `T_PIN` と `TAPS`）・注目リング（`RINGS`）・スクロール（`SCROLL_KEYS`）・`appStepAt`・探す中心（`ORIGIN`）
- `promo.js` — `reloadApp` が消す保存キー、`STEPS` の中身（何を押して何を待つか）、`styleStage` が触る要素、`anchorTop` のセレクタ
- `promo.html` / `promo.css` — iframe の URL、スマホ枠の寸法、タイトル・約束・エンド画面の文言と配色
- `promo-audio.mjs` — 音列とシード、効果音を鳴らす時刻
