# 「一画ずつ」プロモーション動画

縦型1080×1920・34秒・BGM付き。絵コンテは `timeline.mjs`、音は `promo-audio.mjs`、画は `render-promo.mjs` の3本で完結する。

```sh
PLAYWRIGHT=/path/to/playwright/index.js node apps/day-036-stroke-by-stroke/tools/promo/render-promo.mjs
```

出力は `promo.mp4` と `promo-first-frame.png`（どちらも gitignore 済み）。`promo-audio.wav` が無ければ `--variant a` で自動生成する。

Day 035 と同じく**アプリを実際に操作して録画する**方式。このアプリは外へ何も送らないので、差し替える中継は無い。

## このDayで気をつけること

- 🔴 **録画コンテキストに `reducedMotion: 'reduce'` を渡さない。** このアプリは「動きを減らす」設定のときアニメーションを飛ばして完成形だけを出すので、筆が動くところが1コマも撮れなくなる（Day 035 からの複製で最初に踏みかけた）
- 録画は `context` を作った時点から始まるので、操作を始めた時刻との差（`head`）を測り、ffmpeg の `-ss` で切り落としてから WAV を重ねる
- 1コマ目を筆が動いているところにするため、時間割の0秒より1秒前に1本目を書き始める
- 差し込む要素には `pointer-events: none` が要る（画面いっぱいのエンド画面が透明でもクリックを奪う）

## 固定するもの

- 1本目は **飛**（書き順が怪しい字の代表・9画）、2本目は **結衣**（名前らしい2字・18画）。どちらも所要時間を `timeline.mjs` の場面に合わせて選んである。速さを変えると尺が変わるので、字か速さを触ったら描き直す
- 字幕は1行16字・2行まで。下から11%の位置（セーフエリアの内側）
