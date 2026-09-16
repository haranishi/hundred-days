# 「その避難場所、洪水でも？」プロモーション動画

縦型1080×1920・35秒・BGM付き。絵コンテは `timeline.mjs`、音は `promo-audio.mjs`、画は `render-promo.mjs` の3本で完結する。

```sh
PLAYWRIGHT=/path/to/playwright/index.js node apps/day-040-shelter-by-hazard/tools/promo/render-promo.mjs
```

出力は `promo.mp4` と `promo-first-frame.png`（どちらも gitignore 済み）。`promo-audio.wav` が無ければ `--variant a` で自動生成する。

## このDayで気をつけること

- **避難場所のタイルと住所検索は `tests/fixtures/` の実応答に差し替えて撮る。** 数字が変わって字幕と食い違わないようにするため。地図タイルだけは本物を読む
- **秋田は現在地、高知は住所検索の候補から「高知駅」を押す。** 現在地を差し替えて押し直しても、アプリが位置を60秒キャッシュするので前の場所のままになる（Day 039 で踏んだ）
- **高知の数字は「高知駅」候補の座標で出したもの**（近いのに使えない15か所・江ノ口小学校470m）。E2Eが使う高知駅の座標（17か所・500m）とは数百mずれるので、字幕を書き換えるときはこちらの数字に合わせる
- 地図のタイルが描き切るまで2.6秒待つ。冒頭のスクロールは `panTo()` が秒数を指定して動かす

## 字幕の数字は画面と突き合わせてある

`render-promo.mjs` の `expect()` が、書き出す前に画面の文字と字幕の数字を照合して、違っていたら止まる。

| 場面 | 字幕の数字 | 画面のどこ |
|---|---|---|
| S1 | 170m | 秋田の答え（`#answer-text`） |
| S2 | 2番目に近い公園 | 使えない一覧の先頭（`#unusable-list`＝山王第一街区公園） |
| S4 | 15か所 | 高知の答えの2行目（`#answer-sub`） |
| S5 | 470m | 高知の答えと使える一覧の先頭（江ノ口小学校） |

## BGM

Day 039 と同じ生成器（F メジャー・92BPM）。A案（ローファイ鍵盤）とB案（アコースティック寄り）の2本を書き出せる。

```sh
node promo-audio.mjs --variant a --out promo-audio-a.wav
node promo-audio.mjs --variant b --out promo-audio-b.wav
```
