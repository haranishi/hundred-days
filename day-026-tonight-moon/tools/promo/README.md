# 「今夜の月」プロモーション動画

Playwright で決定的な1コマを撮り、ffmpeg で36秒・1080×1920の MP4 にします。音声は本番描画時に未生成なら自動で合成されます。

```sh
PLAYWRIGHT=/path/to/playwright/index.js node tools/promo/render-promo.mjs --preview
PLAYWRIGHT=/path/to/playwright/index.js node tools/promo/render-promo.mjs
```

プレビューは `preview-contact.jpg`、本番は `promo.mp4`、`promo-first-frame.png`、`promo-audio.wav` を同じフォルダへ出力します。部分確認には `--from 15 --to 21`、別の出力先には絶対パスで `--out <mp4>` を指定できます。

他の Day へ流用するときは、`timeline.mjs` の `STORYBOARD`・時刻・字幕、`promo.html` の iframe URL、`promo.js` の基準日時、エンド画面の文言とURLを差し替えます。アプリURLの `?at=` は、撮影中の表示を固定するため必ず設定します。
