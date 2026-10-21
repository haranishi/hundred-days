# じぶんの手がかり 紹介動画

縦1080×1920・30fps・30秒のMP4。実際の画面と大きな字幕で、
5択 → 回答数のパスポート → 就活軸 → 業界候補/企業への質問を見せる。
ナレーションは使わず、外部音源を使わない96 BPMの合成BGMを添える。

## 再生成
リポジトリ既定のNode.js/Playwright、Chromium、ffmpeg/ffprobeとOS標準の日本語書体を使う。
依存や書体の追加ダウンロードは不要。ルートから順に実行する。

```sh
npm run build
node day-072-jibun-note/tools/promo/render-promo.mjs
node day-072-jibun-note/tools/promo/verify-promo.mjs
```

レンダラーは空きportで専用previewを起動し、終わるとそのpreviewだけを停止する。
既存配信を使う場合は `PROMO_BASE` にDay72のURLを指定する。ビルドと本体のハッシュが違うと止まる。
作業用MP4/WAVはoutput内に作り、終了時に作業フォルダだけを削除する。完成品は残す。

## 撮影・表現・権利
- 620px幅のChromiumで実際に12問へ回答し、DOMの画面を切り出す。モデルや結果を注入しない。
- 固定の架空の回答を使い、保存はオフ。撮影前後でアプリのJS/CSS/質問/判定を照合する。
- スクリーンショットの切替とパンによる編集であり、実時間の画面録画ではない。
  画面内にも「架空の回答例・操作画面を短縮編集」と表示する。
- UI・図形・字幕・和音/旋律/波形は本プロジェクトで作成。第三者の画像・曲・録音は使わない。
- 文字はOS標準書体で映像へ焼き込む。書体ファイルは再配布しない。
- 「適職が確定する」「採用可能性が分かる」など、実装していない効果を宣伝しない。

## 出力と検証
`output/Day072_jibun_note_promo.mp4` が音付きマスター、`captions.srt` が字幕。
`../../demo.mp4` は一覧用の15秒・540×960・無音の紹介版。
`capture-evidence.json` は入力順序/実画面の文言/本体ハッシュ、`render-evidence.json` は字幕の安全余白。
`qa.json` は形式・全編デコード・音量・長い無音・黒画面・個人メタデータ・実ブラウザ再生の検査結果。
`firstframe.png`、各場面のPNG、`contactsheet.jpg` は最終MP4から抽出する。
目視検証は別に必要。再生成すると、qaの目視状態はpendingへ戻る。
音の機械検査は約-17 LUFS・true peak -1.5 dBTP以下。人による聴感確認は行っていない。
完成品の保管先はObsidianのDay72の動画制作記録に残す。SNSへ自動投稿しない。
