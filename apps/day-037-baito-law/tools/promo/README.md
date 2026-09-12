# 「バイトの法律、原文はこう」プロモーション動画

縦型1080×1920・34秒・BGM付き。絵コンテは `timeline.mjs`、音は `promo-audio.mjs`、画は `render-promo.mjs` の3本で完結する。

```sh
PLAYWRIGHT=/path/to/playwright/index.js node apps/day-037-baito-law/tools/promo/render-promo.mjs
```

出力は `promo.mp4` と `promo-first-frame.png`（どちらも gitignore 済み）。`promo-audio.wav` が無ければ `--variant a` で自動生成する。

## このDayで気をつけること

- **条文は `tests/fixtures/` の実データに差し替えて撮る。** 撮り直すたびに e-Gov を叩かないためと、
  撮影のたびに結果が変わらないようにするため。URLは本物のまま通るので、差し替えているのは中身だけ
- **送り先は「上からの位置」で指定する。** 見せたいのが条文の途中（ルビが多いところ・主語が並ぶところ）なので、
  `scrollIntoView` では足りない。`scrollTo(selector, offset)` の offset を負にすると、その要素より下へ送れる
- 録画は `context` を作った時点から始まるので、操作を始めた時刻との差（`head`）を測り、
  ffmpeg の `-ss` で切り落としてから WAV を重ねる
- 差し込む要素には `pointer-events: none` が要る（画面いっぱいのエンド画面が透明でもクリックを奪う）

## 固定するもの

- 1本目は **休憩（労基法第34条）**、2本目は **有給（第39条・漢数字がいちばん多い）**、
  3本目は **すぐに辞めたい（民法第627条・別の法令でも同じ形で出る）**
- 字幕は1行16字・2行まで。下から11%の位置（セーフエリアの内側）
