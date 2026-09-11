# 「きょうの一面」プロモーション動画

縦型1080×1920・34秒・BGM付き。絵コンテは `timeline.mjs`、音は `promo-audio.mjs`、画は `render-promo.mjs` の3本で完結する。

```sh
PLAYWRIGHT=/path/to/playwright/index.js node apps/day-035-front-page/tools/promo/render-promo.mjs
```

出力は `promo.mp4` と `promo-first-frame.png`（どちらも gitignore 済み）。`promo-audio.wav` が無ければ `--variant a` で自動生成する。

## Day 034 までとの違い

Day 026〜034 は「1コマずつHTMLを合成する」方式だったが、このDayは**アプリを実際に操作して録画する**方式にした。画面の主役が1枚のCanvasで、1コマごとにDOMを上書きする意味が薄いため。字幕とエンド画面はページに要素を差し込んで出す。

そのぶん、画と音のそろえ方に注意が要る。

- 録画は `context` を作った時点から始まるので、操作を始めた時刻との差（`head`）を測り、ffmpeg の `-ss` で切り落としてから WAV を重ねる
- 各操作は `at(秒)` で `timeline.mjs` の時刻まで待ってから実行する。待たずに流すと、場面の切り替わりとBGMの展開がずれる
- 差し込む要素には `pointer-events: none` が要る。`inset: 0` のエンド画面が透明でもクリックを奪い、`#submit` が押せなくなった

## 固定するもの

- 貼るのは自分の過去作3本（Day 034・033・032）。中継は `apps/day-03*/meta.json` から組み立てた固定応答に差し替えるので、外へは出ない（描画後に通信したホストを出力する）
- 写真は Day 034 の `screenshot.webp`。網点になる元の絵がこれ
- 字幕は1行16字・2行まで。下から11%の位置（セーフエリアの内側）
