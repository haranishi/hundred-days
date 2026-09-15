# 「足もとを掘る」プロモーション動画

縦型1080×1920・35秒・BGM付き。絵コンテは `timeline.mjs`、音は `promo-audio.mjs`、画は `render-promo.mjs` の3本で完結する。

```sh
PLAYWRIGHT=/path/to/playwright/index.js node apps/day-039-dig-below/tools/promo/render-promo.mjs
```

出力は `promo.mp4` と `promo-first-frame.png`（どちらも gitignore 済み）。`promo-audio.wav` が無ければ `--variant a` で自動生成する。

## このDayで気をつけること

- **場所を変えるのは地図を押して行う。** 現在地を差し替えて「現在地から探す」を押し直しても、
  アプリが位置を60秒キャッシュするので前の場所のままになる（実際に東京のまま高知の字幕が出かけた）
- **化石の記録は `tests/fixtures/` の実応答に差し替えて撮る。** 撮り直すたびに相手のサーバーを叩かないためと、
  数字が変わって字幕と食い違わないようにするため。地図タイルだけは本物を読む（ベタ塗りだと場所を選んでいることが伝わらない）
- **地図のタイルが描き切るまで2.6秒待つ。** 待たずに撮ると1コマ目の地図が白いまま写る
- **冒頭のスクロールは `behavior: smooth` に任せない。** 数百msで着いてしまい1コマ目が止まって見える。
  `panTo()` が秒数を指定して動かす
- 差し込む要素には `pointer-events: none` が要る（画面いっぱいのエンド画面が透明でもクリックを奪う）

## 字幕の数字は画面と突き合わせてある

`render-promo.mjs` の `expect()` が、書き出す前に画面の文字と字幕の数字を照合して、
違っていたら止まる。Day 038 で「注意書きの倍率が年を変えると答えと食い違う」という失敗をしたため。

| 場面 | 字幕の数字 | 画面のどこ |
|---|---|---|
| S1 | 1,598万年前／0.2km先 | 東京の答え（`#answer-text`） |
| S4 | 柱が9層 | 高知に切り替えたあとの `.layer` の数 |
| S5 | 2億7,440万年前 | いちばん下の層（`.layer:last-of-type`） |

## BGM

F メジャー・92BPM・13.4小節。A案（ローファイ鍵盤）とB案（アコースティック寄り）の2本を書き出せる。

```sh
node promo-audio.mjs --variant a --out promo-audio-a.wav
node promo-audio.mjs --variant b --out promo-audio-b.wav
```

いまは **A案** を使っている（統合ラウドネス -16.6 LUFS・トゥルーピーク -3.4 dBTP）。
両方を Drive の `Day039_足もとを掘る/` に置いてあるので、聴き比べて差し替えられる。
