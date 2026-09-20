# 「スクショに額縁を」プロモーション動画

Playwright で決定的な1コマを撮り、ffmpeg で36秒・1080×1920の MP4 にします。音声は本番描画時に未生成なら自動で合成されます。

```sh
PLAYWRIGHT=/path/to/playwright/index.js node tools/promo/render-promo.mjs --preview
PLAYWRIGHT=/path/to/playwright/index.js node tools/promo/render-promo.mjs
```

プレビューは `preview-contact.jpg`、本番は `promo.mp4`、`promo-first-frame.png`、`promo-audio.wav` を同じフォルダへ出力します。部分確認には `--from 15 --to 21`、別の出力先には絶対パスで `--out <mp4>` を指定できます。

1コマは時刻 t の純関数です。アプリ側は「t における望ましい状態を計算し、前回との差分だけ click する」ので、途中の t から撮り始めても同じ画になります。撮影は `reducedMotion: 'reduce'` なのでアプリのアニメーションは動きません。見せたい動きは合成ページ側で描きます（例: 貼り付け直後の着地）。

他の Day へ流用するときに差し替える場所:

- `timeline.mjs` — 絵コンテ（`STORYBOARD`）・字幕（`CAPTIONS`）・操作の時刻（`T_PASTE` `T_SAVE` `T_FRAME` と各 `*_CUES`）・`appStateAt`
- `promo.js` — `APP_STORAGE_SLOT`、`applyAppState` の click 対象、`previewTop` のスクロール基準、着地アニメの再現
- `promo.html` / `promo.css` — iframe の URL、フックの素材、タイトル・約束・エンド画面の文言と配色
- `promo-audio.mjs` — 音列とシード、チャイムを鳴らす時刻
