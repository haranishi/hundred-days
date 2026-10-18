# フリップコートの紹介素材

日本語の縦型30秒動画とX投稿の下書き。実ゲームのCPU戦を紹介する。
`output/Day070_flip_court_promo.mp4` がマスター、`../../demo.mp4` が一覧用の無音15秒版。

## 再生成する

リポジトリ既定のNode.js 24・Playwright 1.62.1・Chromiumと、ffmpeg/ffprobeを使う。
依存の追加は不要。作業用の `TMPDIR` を空きのあるSSD上に設定して、ルートから実行する。

```sh
node day-070-flip-court/tools/promo/render-promo.mjs
node day-070-flip-court/tools/promo/verify-promo.mjs
```

レンダラーは専用previewを空きportで起動し、終了時にそのpreviewだけを停止する。
映像はフレームごとにffmpegへ流し、中間WAV・映像は一時領域から終了時に片付ける。
`verify-promo.mjs` はマスターを検査し、demo・確認画像・QA記録・X下書きを作る。

## 実ゲームから撮影する

変更していないCanvasと、得点・時計・フィードバック・結果のDOMを実ブラウザで撮る。
撮影時だけ乱数seedを3006477107に固定し、Playwrightの時計でフレームを進める。
ボールのCanvasピクセルを観測して、ネイティブのマウス移動・ドラッグで返球する。
ゲームのモデルへ盤面・得点・勝敗を注入しない。撮影前後のゲーム側SHA256は `capture-evidence.json` に残る。
前半は連続したラリー。動画22.1秒で実試合の終盤へカットし、60秒の実結果につなぐ。
編集の注記は動画内にも表示する。この撮影は実時間の体験評価とは別の作業。

## 字幕・図形・音を自作する

`stage.mjs` に6シーンの字幕と紙色・深緑の図形を置く。書体はOS標準のみ。
字幕は初回フレームから表示し、上下・左右の安全余白をコードで検査する。
`promo-audio.mjs` の音列・波形合成から120 BPMのBGMと控えめな効果音を作る。
外部の画像・録音・曲・書体ファイルは使わず、追加ダウンロードも行わない。
最終AACを測り、-18〜-16 LUFS・true peak -1.5 dBTP以下を確認する。
音は数値で検査している。人による聴感の確認は未実施。

## 書き出しと下書きを確認する

`qa.json` が寸法・尺・codec・音量・黒画面・長い無音・字幕・文字数の検査記録。
`firstframe.png`、`contactsheet.jpg`、`detail-*.jpg` は最終MP4から抽出した確認用画像。
`overview-1s.jpg` は0〜29秒の各秒フレームを、左から右・上から下の順で並べる。
`capture-evidence.json` に入力回数、実際の得点・反転・結果と、シーン先頭の字幕位置を残す。
X本文の正本は `meta.json` の `social.x`。本文と各返信を280換算字以内で検査する。
`output/x-post.txt`、`x-reply-1-link.txt`、`x-reply-2.txt` は公開前の下書き。
リンク返信のURLは正規URL。制作時は `draft`、`publicUrl: null` で公開確認を保留した。
2026-10-19の公開依頼後はpublication.mdに沿って本番URLを検査する。
公開後は正規の `npm run x:prepare -- --day 70 --video <マスターのパス> --media-reviewed` と最終プレビュー確認が必要。
この制作・検査ではSNS投稿や外部送信を行わない。完成品のDrive保存と保管場所の記録は親工程で行う。
