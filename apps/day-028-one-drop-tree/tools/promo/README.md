# 「ひとしずくの木」プロモーション動画

Playwright で決定的な1コマを撮り、ffmpeg で36秒・1080×1920の MP4 にします。音声は本番描画時に未生成なら自動で合成されます。

```sh
PLAYWRIGHT=/path/to/playwright/index.js node tools/promo/render-promo.mjs --preview
PLAYWRIGHT=/path/to/playwright/index.js node tools/promo/render-promo.mjs
```

プレビューは `preview-contact.jpg`、本番は `promo.mp4`、`promo-first-frame.png`、`promo-audio.wav` を同じフォルダへ出力します。部分確認には `--from 19.4 --to 21`、別の出力先には絶対パスで `--out <mp4>` を指定できます。

1コマは時刻 t の純関数です。アプリ側は「t における望ましい状態を計算し、前回との差分だけ操作する」ので、途中の t から撮り始めても同じ画になります。撮影は `reducedMotion: 'reduce'` なのでアプリのアニメーションは動きません。見せたい動きは合成ページ側で描きます。

## このアプリで足りない3つの仕掛け

**日付を止める。** 木の姿は「今日の日付」で決まります。水をあげた日数もしおれ具合も撮る日によって変わってしまうので、`page.clock.setFixedTime` で 2026-09-04 に固定します。`performance.now` と rAF は動き続けるため、待ち処理は壊れません。`promo.js` は読み込みのたびに iframe 側の `new Date()` を照合し、固定が効いていなければ例外にします。

**記録を差し替えて場面を作る。** アプリの状態は「どの記録を読み込んでいるか」と「今日ぶんの水をあげたか」だけです。`timeline.mjs` の `TREE_RECORDS`（11日・12日・13日で最後が5日前）を localStorage へ書いてアプリを読み直し、必要なら `#water` を押します。水やりは取り消せないので、巻き戻しも読み直しで行います。

**木は合成側で描く。** 動きを減らす設定ではアプリがしずくも成長も飛ばすため、iframe 内の `#plant` は隠し、同じ `drawScene` で `#plant-overlay` に描きます。アプリは木の高さに合わせて `.canvas-bed` の上側を隠すので、overlay は bed の矩形に合わせ、高さ÷幅を crop として毎コマ測り、y を -(1 - crop) × 幅 ずらして同じ切り取りを作ります。`#replay` は押しません——押すと実時間のタイマーで動いて決定性が崩れるため、再生も overlay 側で 3 秒かけて描きます。

## 気をつける点

- フックの木は寄りから始めて引きます。12歩の木は高さの8割まで伸びていて、そのあとは横に広がるだけなので、時間で引くと木が縮んで見えます。`promo.js` の `heroZoom` は歩数ごとの梢の高さから寄りを決めるので、`lib/plant.js` の育ち方が変わっても追従します。
- 1コマ目がXのサムネになります。育ち切った木でも空の鉢でもなく、伸びている途中で始めてください。
- 字幕は1行11字までです。組み幅 776px に 66px の字を並べているので、12字を超えると2行になり、下端が10%セーフからはみ出します。

## 他の Day へ流用するときに差し替える場所

- `timeline.mjs` — 絵コンテ（`STORYBOARD`）・字幕（`CAPTIONS`）・操作の時刻（`T_WATER1` `T_WATER2` `T_WATER3` `T_REPLAY` と `TAPS`）・`appStateAt`・`treeStateAt`・撮影日（`FIXED_TIME`）
- `promo.js` — `APP_STORAGE_SLOT`、`loadRecord` が書く記録の形、`applyAppState` の操作対象、overlay の重ね先、フックの寄り方
- `promo.html` / `promo.css` — iframe の URL、フックの素材、タイトル・約束・エンド画面の文言と配色
- `promo-audio.mjs` — 音列とシード、効果音を鳴らす時刻
